-- SubTrack Migration 004: Harden RPC execute privileges (Forward-Only, Additive)
--
-- Post-deployment verification showed the five SECURITY INVOKER RPCs created in
-- migrations 002 and 003 remained executable by the unauthenticated `anon` role.
-- The prior `REVOKE ... FROM PUBLIC` was insufficient: Supabase grants EXECUTE on
-- functions to `anon` by default (via default privileges on the migration-runner
-- role), and revoking from PUBLIC does not remove that direct `anon` grant. An anon
-- caller could still reach a function body (which then raised 'Authentication
-- required'), so least privilege was not enforced at the privilege layer.
--
-- Data was never at risk: every function checks `auth.uid()` before mutating and
-- runs as SECURITY INVOKER under RLS. This migration closes the least-privilege gap
-- by explicitly revoking EXECUTE from `anon` and `PUBLIC` and granting EXECUTE to
-- `authenticated` only.
--
-- Scope: execute privileges on the five RPCs only. This migration does NOT modify
-- any function body, RLS policy, table, index, trigger, schema, or application
-- code. It is idempotent (REVOKE/GRANT of an already-held/absent privilege is a
-- no-op) and safe to re-run. Argument-type lists are copied verbatim from the
-- CREATE FUNCTION declarations in migrations 002 and 003 (verified by static
-- review against those files).

-- 1. record_installment_payment(uuid, uuid, numeric, text, date, text, text, text)
REVOKE EXECUTE ON FUNCTION public.record_installment_payment(uuid, uuid, numeric, text, date, text, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_installment_payment(uuid, uuid, numeric, text, date, text, text, text) TO authenticated;

-- 2. settle_installment_plan(uuid, numeric, text, date, text, text)
REVOKE EXECUTE ON FUNCTION public.settle_installment_plan(uuid, numeric, text, date, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_installment_plan(uuid, numeric, text, date, text, text) TO authenticated;

-- 3. create_installment_plan(text, text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, date, date, text, text, jsonb)
REVOKE EXECUTE ON FUNCTION public.create_installment_plan(text, text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, date, date, text, text, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_installment_plan(text, text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, date, date, text, text, jsonb) TO authenticated;

-- 4. update_installment_plan(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, date, date, text, text, jsonb)
REVOKE EXECUTE ON FUNCTION public.update_installment_plan(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, date, date, text, text, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_installment_plan(uuid, text, text, text, text, numeric, numeric, numeric, numeric, numeric, integer, text, date, date, text, text, jsonb) TO authenticated;

-- 5. cancel_installment_plan(uuid)
REVOKE EXECUTE ON FUNCTION public.cancel_installment_plan(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_installment_plan(uuid) TO authenticated;
