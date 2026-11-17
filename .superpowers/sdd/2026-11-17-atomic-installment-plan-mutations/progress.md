# SDD ledger — plan: docs/superpowers/plans/2026-11-17-atomic-installment-plan-mutations.md

Workspace has no git repo; commit steps skipped (noted in plan). TDD per task;
final review via semantic_reviewer sub-agent + security-review skill.

Pre-flight: no shared-interface conflicts.

Task 1: complete — migration 003 written (3 RPCs, SECURITY INVOKER, search_path='',
  auth+ownership, plan→items lock order, paid-floor, tenor-reduction guard,
  cancel preserves paid, ledger untouched, REVOKE/GRANT). Self-reviewed vs 002.
  Live-DB verification deferred (no local Postgres harness).

Task 2: complete — RED (6 new-behavior tests failed on old from() path) →
  GREEN (8/8) → full suite 25/25. Extracted mapPlanRow/mapItemRow; routed
  create/update/cancel through supabase.rpc; removed post-mutation reloads and
  unused validateScheduleAgainstPaidItems import. Ruling: dropped getUserId()
  from the three methods (matches recordInstallmentPayment/settleInstallmentPlan
  precedent; RPC enforces auth.uid() server-side) — cost: a lost client-side
  auth round-trip guard, replaced by the RPC's auth check.

Task 3: complete — 6 local repo equivalence tests pass (in-memory localStorage
  stub, no new packages).

Task 4: complete — tsc exit 0; oxlint 0 errors (9 pre-existing warnings in
  untouched UI files); vitest 32/32; build "built in 1.21s" exit 0.

Task 5: complete — semantic_reviewer: NEEDS_CHANGES → 1 blocking finding fixed.
  Final: Ruling: tenor-reduction/delete threshold gap — chose to align the
  DELETE to paid_amount <= 0.01 (matching engine AMOUNT_EPSILON + local repo
  behavior + client/server agreement) rather than the reviewer's suggested
  guard `> 0` (which would diverge from local and the client prelude). Cost if
  wrong: a 0.01-paid item beyond the new tenor is dropped instead of blocked;
  its payment is retained in the ledger (ON DELETE SET NULL). Added a local
  test pinning the <=0.01 drop behavior. Re-verified: tsc 0, oxlint 0 err,
  vitest 32/32, build exit 0. Reviewer finding 2 (live-DB verification) is a
  deferred action item, not a defect.

Security-review (skill applied): changes are secure — no secrets; input
  validated client+server (whitelist enums); no dynamic SQL/EXECUTE (params
  bound via PostgREST rpc, jsonb iterated with typed casts); auth.uid() +
  ownership enforced in each RPC; SECURITY INVOKER keeps RLS applying (no
  RLS weakening); no new dependencies; error messages domain-specific (no
  stack/secret leakage). Pre-existing: supabase-js stores session in
  localStorage (not introduced by this change; out of scope).
