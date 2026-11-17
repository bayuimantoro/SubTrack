-- SubTrack Stage 2 Migration: Installments & PayLater Management (Additive & Forward-Only)

-- 1. Installment Plans
CREATE TABLE IF NOT EXISTS public.installment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_name text NOT NULL,
  provider_type text NOT NULL CHECK (
    provider_type IN ('paylater', 'personal_loan', 'installment_purchase', 'other')
  ),
  description text NOT NULL,
  currency text NOT NULL DEFAULT 'IDR',
  principal_amount numeric(12,2) NOT NULL CHECK (principal_amount >= 0),
  interest_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (interest_amount >= 0),
  admin_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (admin_fee >= 0),
  other_charges numeric(12,2) NOT NULL DEFAULT 0 CHECK (other_charges >= 0),
  total_repayment_amount numeric(12,2) NOT NULL CHECK (total_repayment_amount >= 0),
  tenor_months integer NOT NULL CHECK (tenor_months > 0),
  schedule_type text NOT NULL DEFAULT 'fixed' CHECK (schedule_type IN ('fixed', 'variable')),
  start_date date NOT NULL,
  first_due_date date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'completed', 'overdue', 'cancelled')
  ),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_installment_plans_user_status
  ON public.installment_plans (user_id, status);
CREATE INDEX IF NOT EXISTS idx_installment_plans_user_provider
  ON public.installment_plans (user_id, provider_name);

CREATE TRIGGER trg_installment_plans_updated_at
  BEFORE UPDATE ON public.installment_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Installment Items (Schedule Rows)
CREATE TABLE IF NOT EXISTS public.installment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.installment_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  installment_number integer NOT NULL CHECK (installment_number > 0),
  due_date date NOT NULL,
  scheduled_amount numeric(12,2) NOT NULL CHECK (scheduled_amount >= 0),
  paid_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'partial', 'paid', 'overdue', 'settled', 'cancelled')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_installment_items_plan_number UNIQUE (plan_id, installment_number)
);

CREATE INDEX IF NOT EXISTS idx_installment_items_user_due
  ON public.installment_items (user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_installment_items_plan_status
  ON public.installment_items (plan_id, status);

CREATE TRIGGER trg_installment_items_updated_at
  BEFORE UPDATE ON public.installment_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Installment Payments (Immutable Payment Ledger with Idempotency)
CREATE TABLE IF NOT EXISTS public.installment_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.installment_plans(id) ON DELETE CASCADE,
  installment_item_id uuid REFERENCES public.installment_items(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'IDR',
  paid_at date NOT NULL,
  payment_type text NOT NULL CHECK (
    payment_type IN ('regular', 'partial', 'early_settlement')
  ),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_installment_payments_idempotency UNIQUE (plan_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_installment_payments_plan_paid_at
  ON public.installment_payments (plan_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_installment_payments_user_paid_at
  ON public.installment_payments (user_id, paid_at DESC);

-- 4. Row Level Security
ALTER TABLE public.installment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installment_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own installment plans"
  ON public.installment_plans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own installment items"
  ON public.installment_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.installment_plans p
      WHERE p.id = plan_id AND p.user_id = auth.uid()
    )
  );

-- Payment ledger is append-only (immutable: no UPDATE/DELETE policies)
CREATE POLICY "Users can view own installment payments"
  ON public.installment_payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own installment payments"
  ON public.installment_payments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.installment_plans p
      WHERE p.id = plan_id AND p.user_id = auth.uid()
    )
    AND (
      installment_item_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.installment_items i
        WHERE i.id = installment_item_id AND i.plan_id = plan_id AND i.user_id = auth.uid()
      )
    )
  );

-- 5. Atomic Payment & Early Settlement RPCs (SECURITY INVOKER so RLS applies)
CREATE OR REPLACE FUNCTION public.record_installment_payment(
  p_plan_id uuid,
  p_installment_item_id uuid,
  p_amount numeric,
  p_currency text,
  p_paid_at date,
  p_payment_type text,
  p_idempotency_key text,
  p_notes text DEFAULT NULL
)
RETURNS public.installment_payments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_plan public.installment_plans;
  v_existing public.installment_payments;
  v_inserted public.installment_payments;
  v_item public.installment_items;
  v_amount numeric(12,2);
  v_new_paid numeric(12,2);
  v_derived_type text;
  v_next_status text;
  v_remaining_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;
  IF p_payment_type NOT IN ('regular', 'partial') THEN
    RAISE EXCEPTION 'Invalid payment type for installment payment';
  END IF;

  v_amount := round(p_amount, 2);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  -- Always lock parent plan first for consistent lock ordering & serialization
  SELECT * INTO v_plan
  FROM public.installment_plans
  WHERE id = p_plan_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment plan not found';
  END IF;

  -- Idempotency check under plan lock (no TOCTOU race)
  SELECT * INTO v_existing
  FROM public.installment_payments
  WHERE plan_id = p_plan_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.amount <> v_amount OR v_existing.installment_item_id IS DISTINCT FROM p_installment_item_id THEN
      RAISE EXCEPTION 'Idempotency key already used with different payment parameters';
    END IF;
    RETURN v_existing;
  END IF;

  IF v_plan.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Installment plan is already closed';
  END IF;
  IF p_currency <> v_plan.currency THEN
    RAISE EXCEPTION 'Payment currency (%) does not match plan currency (%)', p_currency, v_plan.currency;
  END IF;

  SELECT * INTO v_item
  FROM public.installment_items
  WHERE id = p_installment_item_id AND plan_id = p_plan_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment item not found';
  END IF;
  IF v_item.status IN ('paid', 'settled', 'cancelled') THEN
    RAISE EXCEPTION 'Installment item is already closed';
  END IF;

  v_new_paid := v_item.paid_amount + v_amount;
  IF v_new_paid > v_item.scheduled_amount THEN
    RAISE EXCEPTION 'Payment exceeds remaining scheduled amount for this installment';
  END IF;

  v_derived_type := CASE
    WHEN v_new_paid >= v_item.scheduled_amount AND v_item.paid_amount = 0 THEN 'regular'
    ELSE 'partial'
  END;

  INSERT INTO public.installment_payments (
    plan_id, installment_item_id, user_id, amount, currency, paid_at, payment_type, idempotency_key, notes
  )
  VALUES (
    p_plan_id, p_installment_item_id, v_user_id, v_amount, p_currency, p_paid_at, v_derived_type, p_idempotency_key, p_notes
  )
  RETURNING * INTO v_inserted;

  v_next_status := CASE
    WHEN v_new_paid >= v_item.scheduled_amount THEN 'paid'
    ELSE 'partial'
  END;

  UPDATE public.installment_items
  SET paid_amount = v_new_paid, status = v_next_status
  WHERE id = p_installment_item_id;

  SELECT COUNT(*) INTO v_remaining_count
  FROM public.installment_items
  WHERE plan_id = p_plan_id AND status NOT IN ('paid', 'settled', 'cancelled');

  IF v_remaining_count = 0 THEN
    UPDATE public.installment_plans SET status = 'completed' WHERE id = p_plan_id;
  END IF;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_installment_plan(
  p_plan_id uuid,
  p_amount numeric,
  p_currency text,
  p_paid_at date,
  p_idempotency_key text,
  p_notes text DEFAULT NULL
)
RETURNS public.installment_payments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing public.installment_payments;
  v_inserted public.installment_payments;
  v_plan public.installment_plans;
  v_amount numeric(12,2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  v_amount := round(p_amount, 2);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be positive';
  END IF;

  SELECT * INTO v_plan
  FROM public.installment_plans
  WHERE id = p_plan_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Installment plan not found';
  END IF;

  SELECT * INTO v_existing
  FROM public.installment_payments
  WHERE plan_id = p_plan_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.amount <> v_amount OR v_existing.payment_type <> 'early_settlement' THEN
      RAISE EXCEPTION 'Idempotency key already used with different settlement parameters';
    END IF;
    RETURN v_existing;
  END IF;

  IF v_plan.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Installment plan is already closed';
  END IF;
  IF p_currency <> v_plan.currency THEN
    RAISE EXCEPTION 'Settlement currency (%) does not match plan currency (%)', p_currency, v_plan.currency;
  END IF;

  INSERT INTO public.installment_payments (
    plan_id, installment_item_id, user_id, amount, currency, paid_at, payment_type, idempotency_key, notes
  )
  VALUES (
    p_plan_id, NULL, v_user_id, v_amount, p_currency, p_paid_at, 'early_settlement', p_idempotency_key, p_notes
  )
  RETURNING * INTO v_inserted;

  UPDATE public.installment_items
  SET status = 'settled'
  WHERE plan_id = p_plan_id AND status NOT IN ('paid', 'settled', 'cancelled');

  UPDATE public.installment_plans
  SET status = 'completed'
  WHERE id = p_plan_id;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.record_installment_payment(uuid, uuid, numeric, text, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_installment_payment(uuid, uuid, numeric, text, date, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.settle_installment_plan(uuid, numeric, text, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_installment_plan(uuid, numeric, text, date, text, text) TO authenticated;
