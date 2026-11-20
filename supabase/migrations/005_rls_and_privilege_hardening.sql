-- SubTrack Migration 005: Least-Privilege Table Grants, Explicit Role Policies,
-- Corrected installment_payments Ownership Check, and SECURITY DEFINER RPC Hardening
-- (Forward-Only, Idempotent)

-- =============================================================================
-- 1. Revoke ALL table privileges from anon and PUBLIC on all 7 tables
-- =============================================================================
REVOKE ALL ON TABLE
  public.profiles,
  public.subscriptions,
  public.billing_history,
  public.notification_preferences,
  public.installment_plans,
  public.installment_items,
  public.installment_payments
FROM anon, PUBLIC;

-- =============================================================================
-- 2. Re-grant narrowly scoped table privileges to authenticated only
--    (First revoke broad defaults from authenticated, then grant exact minimum)
-- =============================================================================
REVOKE ALL ON TABLE
  public.profiles,
  public.subscriptions,
  public.billing_history,
  public.notification_preferences,
  public.installment_plans,
  public.installment_items,
  public.installment_payments
FROM authenticated;

-- Client reads & upserts settings/profile
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_preferences TO authenticated;

-- Client full CRUD on subscriptions
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subscriptions TO authenticated;

-- Client append-only ledger on billing_history (SELECT + INSERT only)
GRANT SELECT, INSERT ON TABLE public.billing_history TO authenticated;

-- Installments: client can SELECT all 3 tables & DELETE installment_plans (cascades to items/payments).
-- All INSERT/UPDATE on plans/items/payments happen exclusively inside SECURITY DEFINER RPCs.
GRANT SELECT, DELETE ON TABLE public.installment_plans TO authenticated;
GRANT SELECT ON TABLE public.installment_items TO authenticated;
GRANT SELECT ON TABLE public.installment_payments TO authenticated;

-- =============================================================================
-- 3. Harden the 5 installment RPCs to SECURITY DEFINER
--    (Bodies in 002 & 003 already enforce auth.uid() checks, SET search_path = '',
--     schema-qualified public.* references, and plan-then-items FOR UPDATE locks.)
-- =============================================================================
ALTER FUNCTION public.record_installment_payment(uuid, uuid, numeric, text, date, text, text, text)
  SECURITY DEFINER;
ALTER FUNCTION public.settle_installment_plan(uuid, numeric, text, date, text, text)
  SECURITY DEFINER;
ALTER FUNCTION public.create_installment_plan(text, text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, date, date, text, text, jsonb)
  SECURITY DEFINER;
ALTER FUNCTION public.update_installment_plan(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, date, date, text, text, jsonb)
  SECURITY DEFINER;
ALTER FUNCTION public.cancel_installment_plan(uuid)
  SECURITY DEFINER;

-- Re-assert execute privileges on all 5 RPCs
REVOKE EXECUTE ON FUNCTION public.record_installment_payment(uuid, uuid, numeric, text, date, text, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_installment_payment(uuid, uuid, numeric, text, date, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.settle_installment_plan(uuid, numeric, text, date, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_installment_plan(uuid, numeric, text, date, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_installment_plan(text, text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, date, date, text, text, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_installment_plan(text, text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, date, date, text, text, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_installment_plan(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, date, date, text, text, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_installment_plan(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, date, date, text, text, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_installment_plan(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_installment_plan(uuid) TO authenticated;

-- =============================================================================
-- 4. Replace RLS policies to explicitly target TO authenticated
--    and fix installment_payments parent-child qualification bug
-- =============================================================================

-- profiles
DROP POLICY IF EXISTS "Users can manage own profile" ON public.profiles;
CREATE POLICY "Users can manage own profile"
  ON public.profiles FOR ALL
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- subscriptions
DROP POLICY IF EXISTS "Users can manage own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can manage own subscriptions"
  ON public.subscriptions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- billing_history (append-only: SELECT + INSERT)
DROP POLICY IF EXISTS "Users can manage own billing history" ON public.billing_history;
CREATE POLICY "Users can view own billing history"
  ON public.billing_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own billing history"
  ON public.billing_history FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = public.billing_history.subscription_id
        AND s.user_id = auth.uid()
    )
  );

-- notification_preferences
DROP POLICY IF EXISTS "Users can manage own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can manage own notification preferences"
  ON public.notification_preferences FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- installment_plans (SELECT + DELETE for client; INSERT/UPDATE via SECURITY DEFINER RPCs)
DROP POLICY IF EXISTS "Users can manage own installment plans" ON public.installment_plans;
CREATE POLICY "Users can view own installment plans"
  ON public.installment_plans FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own installment plans"
  ON public.installment_plans FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- installment_items (SELECT only for client; mutations via SECURITY DEFINER RPCs)
DROP POLICY IF EXISTS "Users can manage own installment items" ON public.installment_items;
CREATE POLICY "Users can view own installment items"
  ON public.installment_items FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- installment_payments (SELECT only for client; INSERT via SECURITY DEFINER RPCs,
-- with corrected fully-qualified parent-child ownership check retained as defense-in-depth)
DROP POLICY IF EXISTS "Users can view own installment payments" ON public.installment_payments;
DROP POLICY IF EXISTS "Users can insert own installment payments" ON public.installment_payments;

CREATE POLICY "Users can view own installment payments"
  ON public.installment_payments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own installment payments"
  ON public.installment_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.installment_plans p
      WHERE p.id = public.installment_payments.plan_id
        AND p.user_id = auth.uid()
    )
    AND (
      public.installment_payments.installment_item_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.installment_items i
        WHERE i.id = public.installment_payments.installment_item_id
          AND i.plan_id = public.installment_payments.plan_id
          AND i.user_id = auth.uid()
      )
    )
  );
