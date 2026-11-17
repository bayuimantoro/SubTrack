-- SubTrack Stage 2 Migration: Atomic Installment Plan Mutations (Additive & Forward-Only)
--
-- Adds three SECURITY INVOKER RPC functions that perform create / update / cancel
-- of an installment plan and its items in a single database transaction, mirroring
-- the contract already established by record_installment_payment / settle_installment_plan
-- in migration 002 (SECURITY INVOKER, search_path = '', auth.uid() + ownership checks,
-- consistent plan-then-items lock ordering, REVOKE FROM PUBLIC + GRANT TO authenticated).
--
-- Each RPC returns a composite jsonb: { "plan": <plan_row>, "items": [<item_row>, ...] }
-- with snake_case keys matching the table columns, so the repository consumes one
-- round-trip and never needs post-mutation reloads.
--
-- This migration is additive only: it creates functions and grants. It does not alter
-- any table, index, trigger, or RLS policy, and does not touch migrations 001 or 002.

-- =============================================================================
-- create_installment_plan
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_installment_plan(
  p_provider_name text,
  p_provider_type text,
  p_description text,
  p_currency text,
  p_principal_amount numeric,
  p_interest_amount numeric,
  p_admin_fee numeric,
  p_other_charges numeric,
  p_total_repayment_amount numeric,
  p_tenor_months integer,
  p_schedule_type text,
  p_start_date date,
  p_first_due_date date,
  p_status text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_schedule jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_plan public.installment_plans%ROWTYPE;
  v_status text;
  v_item_status text;
  v_count integer;
  v_sum numeric := 0;
  v_elem jsonb;
  v_num integer;
  v_due date;
  v_amt numeric(12,2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_provider_name IS NULL OR length(btrim(p_provider_name)) = 0 THEN
    RAISE EXCEPTION 'Provider name is required.';
  END IF;
  IF p_description IS NULL OR length(btrim(p_description)) = 0 THEN
    RAISE EXCEPTION 'Transaction description is required.';
  END IF;
  IF p_provider_type NOT IN ('paylater', 'personal_loan', 'installment_purchase', 'other') THEN
    RAISE EXCEPTION 'Invalid provider type.';
  END IF;
  IF p_schedule_type NOT IN ('fixed', 'variable') THEN
    RAISE EXCEPTION 'Invalid schedule type.';
  END IF;
  IF p_principal_amount IS NULL OR p_principal_amount < 0
     OR p_interest_amount IS NULL OR p_interest_amount < 0
     OR p_admin_fee IS NULL OR p_admin_fee < 0
     OR p_other_charges IS NULL OR p_other_charges < 0 THEN
    RAISE EXCEPTION 'Interest, admin fee, and other charges must be non-negative.';
  END IF;
  IF p_total_repayment_amount IS NULL OR p_total_repayment_amount <= 0 THEN
    RAISE EXCEPTION 'Total repayment amount must be greater than 0.';
  END IF;
  IF p_tenor_months IS NULL OR p_tenor_months < 1 THEN
    RAISE EXCEPTION 'Tenor must be at least 1 month.';
  END IF;
  IF p_start_date IS NULL OR p_first_due_date IS NULL THEN
    RAISE EXCEPTION 'Start date and first due date are required.';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('active', 'completed', 'overdue', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid plan status.';
  END IF;
  IF p_schedule IS NULL OR jsonb_typeof(p_schedule) <> 'array' THEN
    RAISE EXCEPTION 'Schedule is required.';
  END IF;

  v_count := jsonb_array_length(p_schedule);
  IF v_count <> p_tenor_months THEN
    RAISE EXCEPTION 'Schedule must contain exactly % installment(s).', p_tenor_months;
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_schedule) LOOP
    v_num := (v_elem->>'installment_number')::integer;
    IF v_num IS NULL OR v_num <= 0 THEN
      RAISE EXCEPTION 'Installment number must be positive.';
    END IF;
    v_due := (v_elem->>'due_date')::date;
    IF v_due IS NULL THEN
      RAISE EXCEPTION 'Installment #% is missing a due date.', v_num;
    END IF;
    v_amt := round((v_elem->>'scheduled_amount')::numeric, 2);
    IF v_amt IS NULL OR v_amt < 0 THEN
      RAISE EXCEPTION 'Installment #% amount must be non-negative.', v_num;
    END IF;
    v_sum := v_sum + v_amt;
  END LOOP;

  IF abs(v_sum - p_total_repayment_amount) > 0.01 THEN
    RAISE EXCEPTION 'Schedule total (%) must match total repayment amount (%).', v_sum, p_total_repayment_amount;
  END IF;

  v_status := COALESCE(p_status, 'active');
  v_item_status := CASE WHEN v_status = 'cancelled' THEN 'cancelled' ELSE 'pending' END;

  INSERT INTO public.installment_plans (
    user_id, provider_name, provider_type, description, currency,
    principal_amount, interest_amount, admin_fee, other_charges,
    total_repayment_amount, tenor_months, schedule_type,
    start_date, first_due_date, status, notes
  )
  VALUES (
    v_user_id, btrim(p_provider_name), p_provider_type, btrim(p_description), p_currency,
    round(p_principal_amount, 2), round(p_interest_amount, 2),
    round(p_admin_fee, 2), round(p_other_charges, 2),
    round(p_total_repayment_amount, 2), p_tenor_months, p_schedule_type,
    p_start_date, p_first_due_date, v_status, p_notes
  )
  RETURNING * INTO v_plan;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_schedule) LOOP
    v_num := (v_elem->>'installment_number')::integer;
    v_due := (v_elem->>'due_date')::date;
    v_amt := round((v_elem->>'scheduled_amount')::numeric, 2);
    INSERT INTO public.installment_items (
      plan_id, user_id, installment_number, due_date, scheduled_amount, paid_amount, status
    )
    VALUES (v_plan.id, v_user_id, v_num, v_due, v_amt, 0, v_item_status);
  END LOOP;

  RETURN jsonb_build_object(
    'plan', to_jsonb(v_plan),
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.installment_number)
      FROM public.installment_items i
      WHERE i.plan_id = v_plan.id
    ), '[]'::jsonb)
  );
END;
$$;

-- =============================================================================
-- update_installment_plan
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_installment_plan(
  p_plan_id uuid,
  p_provider_name text,
  p_provider_type text,
  p_description text,
  p_currency text,
  p_principal_amount numeric,
  p_interest_amount numeric,
  p_admin_fee numeric,
  p_other_charges numeric,
  p_total_repayment_amount numeric,
  p_tenor_months integer,
  p_schedule_type text,
  p_start_date date,
  p_first_due_date date,
  p_status text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_schedule jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_plan public.installment_plans%ROWTYPE;
  v_status text;
  v_count integer;
  v_sum numeric := 0;
  v_elem jsonb;
  v_num integer;
  v_due date;
  v_amt numeric(12,2);
  v_existing public.installment_items%ROWTYPE;
  v_next_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_provider_name IS NULL OR length(btrim(p_provider_name)) = 0 THEN
    RAISE EXCEPTION 'Provider name is required.';
  END IF;
  IF p_description IS NULL OR length(btrim(p_description)) = 0 THEN
    RAISE EXCEPTION 'Transaction description is required.';
  END IF;
  IF p_provider_type NOT IN ('paylater', 'personal_loan', 'installment_purchase', 'other') THEN
    RAISE EXCEPTION 'Invalid provider type.';
  END IF;
  IF p_schedule_type NOT IN ('fixed', 'variable') THEN
    RAISE EXCEPTION 'Invalid schedule type.';
  END IF;
  IF p_principal_amount IS NULL OR p_principal_amount < 0
     OR p_interest_amount IS NULL OR p_interest_amount < 0
     OR p_admin_fee IS NULL OR p_admin_fee < 0
     OR p_other_charges IS NULL OR p_other_charges < 0 THEN
    RAISE EXCEPTION 'Interest, admin fee, and other charges must be non-negative.';
  END IF;
  IF p_total_repayment_amount IS NULL OR p_total_repayment_amount <= 0 THEN
    RAISE EXCEPTION 'Total repayment amount must be greater than 0.';
  END IF;
  IF p_tenor_months IS NULL OR p_tenor_months < 1 THEN
    RAISE EXCEPTION 'Tenor must be at least 1 month.';
  END IF;
  IF p_start_date IS NULL OR p_first_due_date IS NULL THEN
    RAISE EXCEPTION 'Start date and first due date are required.';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('active', 'completed', 'overdue', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid plan status.';
  END IF;
  IF p_schedule IS NULL OR jsonb_typeof(p_schedule) <> 'array' THEN
    RAISE EXCEPTION 'Schedule is required.';
  END IF;

  v_count := jsonb_array_length(p_schedule);
  IF v_count <> p_tenor_months THEN
    RAISE EXCEPTION 'Schedule must contain exactly % installment(s).', p_tenor_months;
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_schedule) LOOP
    v_num := (v_elem->>'installment_number')::integer;
    IF v_num IS NULL OR v_num <= 0 THEN
      RAISE EXCEPTION 'Installment number must be positive.';
    END IF;
    v_due := (v_elem->>'due_date')::date;
    IF v_due IS NULL THEN
      RAISE EXCEPTION 'Installment #% is missing a due date.', v_num;
    END IF;
    v_amt := round((v_elem->>'scheduled_amount')::numeric, 2);
    IF v_amt IS NULL OR v_amt < 0 THEN
      RAISE EXCEPTION 'Installment #% amount must be non-negative.', v_num;
    END IF;
    v_sum := v_sum + v_amt;
  END LOOP;

  IF abs(v_sum - p_total_repayment_amount) > 0.01 THEN
    RAISE EXCEPTION 'Schedule total (%) must match total repayment amount (%).', v_sum, p_total_repayment_amount;
  END IF;

  -- Lock the parent plan first (consistent plan-then-items ordering, matching 002).
  SELECT * INTO v_plan
  FROM public.installment_plans
  WHERE id = p_plan_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment plan not found.';
  END IF;

  -- Paid-amount floor: a schedule row cannot drop below an existing item's paid amount.
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_schedule) LOOP
    v_num := (v_elem->>'installment_number')::integer;
    v_amt := round((v_elem->>'scheduled_amount')::numeric, 2);
    SELECT * INTO v_existing
    FROM public.installment_items
    WHERE plan_id = p_plan_id AND installment_number = v_num
    FOR UPDATE;
    IF FOUND AND v_amt < v_existing.paid_amount - 0.01 THEN
      RAISE EXCEPTION 'Installment #% scheduled amount (%) cannot be less than already paid amount (%).', v_num, v_amt, v_existing.paid_amount;
    END IF;
  END LOOP;

  -- Tenor-reduction guard: cannot drop a paid installment by shrinking the schedule.
  SELECT * INTO v_existing
  FROM public.installment_items
  WHERE plan_id = p_plan_id AND installment_number > v_count AND paid_amount > 0.01
  ORDER BY installment_number
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'Cannot reduce tenor below installment #% because it already has recorded payments.', v_existing.installment_number;
  END IF;

  v_status := COALESCE(p_status, 'active');

  UPDATE public.installment_plans SET
    provider_name = btrim(p_provider_name),
    provider_type = p_provider_type,
    description = btrim(p_description),
    currency = p_currency,
    principal_amount = round(p_principal_amount, 2),
    interest_amount = round(p_interest_amount, 2),
    admin_fee = round(p_admin_fee, 2),
    other_charges = round(p_other_charges, 2),
    total_repayment_amount = round(p_total_repayment_amount, 2),
    tenor_months = p_tenor_months,
    schedule_type = p_schedule_type,
    start_date = p_start_date,
    first_due_date = p_first_due_date,
    status = v_status,
    notes = p_notes
  WHERE id = p_plan_id;

  -- Reconcile items: update existing, insert new (paid_amount preserved on existing).
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_schedule) LOOP
    v_num := (v_elem->>'installment_number')::integer;
    v_due := (v_elem->>'due_date')::date;
    v_amt := round((v_elem->>'scheduled_amount')::numeric, 2);
    SELECT * INTO v_existing
    FROM public.installment_items
    WHERE plan_id = p_plan_id AND installment_number = v_num
    FOR UPDATE;
    IF FOUND THEN
      v_next_status := CASE
        WHEN v_status = 'cancelled' THEN 'cancelled'
        WHEN v_existing.status = 'settled' THEN 'settled'
        WHEN v_existing.paid_amount >= v_amt THEN 'paid'
        WHEN v_existing.paid_amount > 0 THEN 'partial'
        ELSE 'pending'
      END;
      UPDATE public.installment_items SET
        due_date = v_due,
        scheduled_amount = v_amt,
        status = v_next_status
      WHERE id = v_existing.id;
    ELSE
      INSERT INTO public.installment_items (
        plan_id, user_id, installment_number, due_date, scheduled_amount, paid_amount, status
      )
      VALUES (p_plan_id, v_user_id, v_num, v_due, v_amt, 0, 'pending');
    END IF;
  END LOOP;

  -- Remove excess effectively-unpaid installments beyond the new tenor. The
  -- tenor-reduction guard above already blocks any item with paid_amount > 0.01,
  -- so deleting paid_amount <= 0.01 (treated as effectively unpaid, matching the
  -- engine's AMOUNT_EPSILON convention and the local repository's behavior)
  -- yields a clean partition: > 0.01 blocked, <= 0.01 removed, no orphaned rows.
  -- Payment history is preserved regardless: installment_payments.installment_item_id
  -- is ON DELETE SET NULL, so a dropped item leaves its ledger payment intact.
  DELETE FROM public.installment_items
  WHERE plan_id = p_plan_id AND installment_number > v_count AND paid_amount <= 0.01;

  SELECT * INTO v_plan FROM public.installment_plans WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'plan', to_jsonb(v_plan),
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.installment_number)
      FROM public.installment_items i
      WHERE i.plan_id = p_plan_id
    ), '[]'::jsonb)
  );
END;
$$;

-- =============================================================================
-- cancel_installment_plan
-- =============================================================================
CREATE OR REPLACE FUNCTION public.cancel_installment_plan(
  p_plan_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_plan public.installment_plans%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_plan
  FROM public.installment_plans
  WHERE id = p_plan_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment plan not found.';
  END IF;

  IF v_plan.status = 'completed' THEN
    RAISE EXCEPTION 'Completed installment plans cannot be cancelled.';
  END IF;
  IF v_plan.status = 'cancelled' THEN
    RAISE EXCEPTION 'Installment plan is already cancelled.';
  END IF;

  UPDATE public.installment_plans SET status = 'cancelled' WHERE id = p_plan_id;

  -- Cancel only open items; preserve paid / settled / already-cancelled.
  UPDATE public.installment_items SET status = 'cancelled'
  WHERE plan_id = p_plan_id AND status IN ('pending', 'partial', 'overdue');

  SELECT * INTO v_plan FROM public.installment_plans WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'plan', to_jsonb(v_plan),
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.installment_number)
      FROM public.installment_items i
      WHERE i.plan_id = p_plan_id
    ), '[]'::jsonb)
  );
END;
$$;

-- =============================================================================
-- Grants: authenticated only (REVOKE FROM PUBLIC, matching migration 002)
-- =============================================================================
REVOKE ALL ON FUNCTION public.create_installment_plan(text, text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, date, date, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_installment_plan(text, text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, date, date, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.update_installment_plan(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, date, date, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_installment_plan(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, date, date, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_installment_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_installment_plan(uuid) TO authenticated;
