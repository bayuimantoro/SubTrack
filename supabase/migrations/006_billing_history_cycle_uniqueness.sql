-- SubTrack Migration 006: Billing Cycle Date & Duplicate Paid Cycle Protection
-- (Forward-Only, Idempotent; preserves RLS & privilege grants from Migration 005)

-- =============================================================================
-- 1. Pure helper mirroring src/lib/billing-engine.ts getBillingCycleKey()
-- =============================================================================
CREATE OR REPLACE FUNCTION public.compute_billing_cycle_date(
  p_start_date date,
  p_interval text,
  p_custom_days integer,
  p_billing_day smallint,
  p_target_date date
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_anchor integer;
  v_current date;
  v_next date;
  v_guard integer := 0;
  v_step_months integer;
  v_next_month_start date;
  v_yr integer;
  v_mo integer;
  v_max_day integer;
BEGIN
  IF p_target_date <= p_start_date THEN
    RETURN p_start_date;
  END IF;

  v_anchor := LEAST(GREATEST(1, COALESCE(p_billing_day::integer, EXTRACT(DAY FROM p_start_date)::integer)), 31);
  v_current := p_start_date;

  LOOP
    EXIT WHEN v_guard >= 5000;

    IF p_interval = 'weekly' THEN
      v_next := v_current + 7;
    ELSIF p_interval = 'custom' THEN
      v_next := v_current + CASE
        WHEN p_custom_days IS NOT NULL AND p_custom_days > 0 THEN p_custom_days
        ELSE 30
      END;
    ELSE
      v_step_months := CASE p_interval
        WHEN 'monthly' THEN 1
        WHEN 'quarterly' THEN 3
        WHEN 'semi_annually' THEN 6
        WHEN 'annually' THEN 12
        ELSE 1
      END;
      v_next_month_start := (date_trunc('month', v_current)::date + make_interval(months => v_step_months))::date;
      v_yr := EXTRACT(YEAR FROM v_next_month_start)::integer;
      v_mo := EXTRACT(MONTH FROM v_next_month_start)::integer;
      v_max_day := EXTRACT(DAY FROM (v_next_month_start + INTERVAL '1 month - 1 day'))::integer;
      v_next := make_date(v_yr, v_mo, LEAST(v_anchor, v_max_day));
    END IF;

    EXIT WHEN v_next > p_target_date;
    v_current := v_next;
    v_guard := v_guard + 1;
  END LOOP;

  RETURN v_current;
END;
$$;

-- =============================================================================
-- 2. Add billing_cycle_date column and backfill existing rows
-- =============================================================================
ALTER TABLE public.billing_history
  ADD COLUMN IF NOT EXISTS billing_cycle_date date;

UPDATE public.billing_history bh
SET billing_cycle_date = public.compute_billing_cycle_date(
  s.start_date,
  s.billing_interval,
  s.custom_interval_days,
  s.billing_day,
  bh.billed_at
)
FROM public.subscriptions s
WHERE s.id = bh.subscription_id
  AND bh.billing_cycle_date IS NULL;

-- =============================================================================
-- 3. Pre-flight check: abort cleanly if duplicate paid cycles still exist
-- =============================================================================
DO $$
DECLARE
  v_dup_groups integer;
BEGIN
  SELECT COUNT(*)
  INTO v_dup_groups
  FROM (
    SELECT subscription_id, billing_cycle_date
    FROM public.billing_history
    WHERE status = 'paid'
    GROUP BY subscription_id, billing_cycle_date
    HAVING COUNT(*) > 1
  ) dup;

  IF v_dup_groups > 0 THEN
    RAISE EXCEPTION
      'Migration 006 aborted: found % duplicate paid billing cycle group(s) in public.billing_history. Clean up duplicate rows manually before creating uniq_billing_history_paid_cycle.',
      v_dup_groups;
  END IF;
END;
$$;

-- =============================================================================
-- 4. Enforce NOT NULL and partial unique index on (subscription_id, billing_cycle_date) WHERE status = 'paid'
-- =============================================================================
ALTER TABLE public.billing_history
  ALTER COLUMN billing_cycle_date SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_billing_history_paid_cycle
  ON public.billing_history (subscription_id, billing_cycle_date)
  WHERE status = 'paid';

-- =============================================================================
-- 5. BEFORE INSERT trigger to populate billing_cycle_date automatically
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_billing_history_cycle_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_start_date date;
  v_interval text;
  v_custom_days integer;
  v_billing_day smallint;
BEGIN
  IF NEW.billing_cycle_date IS NULL THEN
    SELECT s.start_date, s.billing_interval, s.custom_interval_days, s.billing_day
    INTO v_start_date, v_interval, v_custom_days, v_billing_day
    FROM public.subscriptions s
    WHERE s.id = NEW.subscription_id;

    IF FOUND THEN
      NEW.billing_cycle_date := public.compute_billing_cycle_date(
        v_start_date,
        v_interval,
        v_custom_days,
        v_billing_day,
        NEW.billed_at
      );
    ELSE
      NEW.billing_cycle_date := NEW.billed_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_history_set_cycle_date ON public.billing_history;
CREATE TRIGGER trg_billing_history_set_cycle_date
  BEFORE INSERT ON public.billing_history
  FOR EACH ROW
  EXECUTE FUNCTION public.set_billing_history_cycle_date();
