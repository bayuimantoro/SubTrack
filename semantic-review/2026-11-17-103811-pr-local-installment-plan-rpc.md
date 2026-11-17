# Atomic installment plan mutations via single-transaction RPCs

Three Supabase repository methods — `createInstallmentPlan`, `updateInstallmentPlan`, `cancelInstallmentPlan` — no longer issue a sequence of independent PostgREST requests. Each now calls one plpgsql RPC (`create_installment_plan`, `update_installment_plan`, `cancel_installment_plan` in migration 003) that performs every plan+item insert/update/delete inside a single database transaction and returns a composite `{plan, items}` jsonb, so the repository consumes one round-trip and drops its post-mutation reloads. The local repository is untouched (already single-step); new vitest suites pin both paths. The RPCs mirror the `SECURITY INVOKER` / `search_path = ''` / `auth.uid()` + ownership / `REVOKE … FROM PUBLIC` contract that `record_installment_payment` and `settle_installment_plan` established in migration 002, and the migration is purely additive (no table, RLS, or 001/002 edits).

**Watch for:** a boundary gap in `update_installment_plan` between the tenor-reduction guard (`paid_amount > 0.01`) and the excess-item delete (`paid_amount = 0`) — an item paid exactly 0.01 is neither blocked nor deleted and ends up orphaned beyond the new tenor; narrow (needs a 2-decimal currency and a 1-cent payment; IDR is zero-decimal so it's unreachable there), but it's a one-line fix and a divergence from the local path. Auth/ownership, transaction atomicity, and the paid-floor/tenor guards cannot be exercised without a live Postgres — the plan defers all of these to live-DB verification, and they remain unverified here.

**Verdict**: NEEDS_CHANGES

## High-level view

The win is atomicity: each RPC is one plpgsql function, so a failure partway through reconciling items rolls back the plan update too — the partial-failure window that motivated the work is gone. The repository swaps its three method bodies to a single `supabase.rpc()` call and maps the returned `{plan, items}` with extracted `mapPlanRow`/`mapItemRow` helpers shared with the list methods, so list and mutation paths now produce identical shapes. No new npm packages; the local repo and its keys are unchanged.

The security posture follows migration 002: `SECURITY INVOKER` (so RLS still applies to the tables touched inside the function — the explicit `user_id = auth.uid()` check is belt-and-suspenders over the `auth.uid() = user_id` RLS policy), `SET search_path = ''` to prevent schema hijacking, `auth.uid()` null-check up front, `FOR UPDATE` on the parent plan before any item lock, and `REVOKE FROM PUBLIC` + `GRANT TO authenticated`. There is no `EXECUTE` with string-built SQL — schedule values are pulled from the `jsonb` array and cast to typed locals fed into parameterized inserts — so no injection surface, and the migration adds functions and grants only.

The one real concern is a threshold mismatch in the update guard. The tenor-reduction check rejects dropping an item with `paid_amount > 0.01`, and the cleanup delete removes excess items with `paid_amount = 0`. An item paid exactly `0.01` satisfies neither: it is not blocked (the guard uses a strict `>` against 0.01) and not deleted (the delete requires exactly 0), so it survives as an orphan beyond the new tenor. The local repository handles the same input differently — it rebuilds the item list from the schedule and drops anything outside it — so the two paths diverge for this edge case. It is confirmed in the SQL; its practical reach is small because the app defaults to IDR (zero-decimal, whole-rupiah payments), but the fix is a one-line threshold alignment.

Item-status recompute on update matches the old supabase formula and the local engine (cancelled → cancelled, settled → settled, paid ≥ scheduled → paid, paid > 0 → partial, else pending), and existing items keep their `paid_amount` since the update never writes that column. One intentional, pre-existing divergence survives: the RPC defaults the plan status to `COALESCE(p_status, 'active')` (mirroring old supabase's `input.status ?? 'active'`), while the local repo defaults to `input.status ?? target.status` (preserves the existing status). The plan explicitly preserves this divergence, so it is context, not a defect.

The repository keeps `validateInstallmentPlanInput` as a client-side prelude (fast-fail before the network call) and the RPC re-validates authoritatively. It dropped `getUserId()` and the client-side `validateScheduleAgainstPaidItems` from these three methods, matching the `recordInstallmentPayment`/`settleInstallmentPlan` precedent that relies on `auth.uid()` server-side; the cost is that a paid-floor or tenor-reduction violation now fails after a round-trip instead of instantly, which is deliberate and low-cost since the RPC raises specific messages.

Supabase tests assert each method calls the right RPC once with normalized params, maps the result, fast-fails invalid input without calling the RPC, and surfaces RPC errors, plus a `from()`-throws guard that catches any regression to the legacy PostgREST path; local tests pin create/update/cancel behavior including the paid-floor and tenor-reduction rejections and cancel's preservation of paid items and the payment ledger. Auth/ownership, transaction atomicity, and the boundary gap are not locally testable (no Postgres harness) and remain deferred to live-DB verification per the plan.

<details>
<summary>Issues (2)</summary>

1. **Tenor-guard / delete threshold gap** — `update_installment_plan` rejects dropping a paid item with `paid_amount > 0.01` but only deletes excess items with `paid_amount = 0`, so an item paid exactly `0.01` is neither preserved nor removed and is orphaned beyond the new tenor (confirmed in `003_installment_plan_rpc.sql`, in the tenor guard and the trailing `DELETE`). The local repo drops such an item by omission, so the paths diverge. Align the thresholds — e.g. guard on `paid_amount > 0` — and confirm the 0.01 case on a live DB.
2. **DB-enforced behavior unverified without Postgres** — auth/ownership (`auth.uid() IS NULL` and `user_id` mismatch), transaction atomicity (rollback mid-reconcile), and the paid-floor/tenor guards have no local test harness and were not exercised against a live database. Run each Review-Focus scenario against a live Supabase/Postgres before relying on them; the plan already lists this as a required deferral.

</details>

<details>
<summary>Details</summary>

### Atomic plan mutations: single-transaction RPC contract

Each of the three RPCs is one plpgsql function, and a plpgsql function body runs as a single implicit transaction — any uncaught `RAISE EXCEPTION` rolls back every insert, update, and delete the function issued. That is the mechanism that closes the partial-failure window the old multi-request supabase path had: previously a plan insert could succeed while a later item update failed, leaving plan and items inconsistent. Now create/update/cancel are all-or-nothing at the database.

The return shape is a composite `jsonb_build_object('plan', to_jsonb(v_plan), 'items', jsonb_agg(to_jsonb(i) ORDER BY i.installment_number))`, so the repository gets the final plan row and all items back from the one `rpc()` call and never needs the `listInstallmentPlans`/`listInstallmentItems` reloads the old methods ran after mutating. The re-select after the writes (e.g. `SELECT * INTO v_plan FROM public.installment_plans WHERE id = p_plan_id` in update) picks up column defaults and the `updated_at` trigger's value, so the returned row reflects post-write state rather than the pre-write `v_plan`. Lock ordering is consistent with 002 — the parent plan is locked `FOR UPDATE` first, then items — which matters for `record_installment_payment`'s concurrency model and is preserved here.

`deleteInstallmentPlan` was left on the legacy `from('installment_plans').delete()` path — out of the stated scope, and already atomic: a single delete cascades to `installment_items` and `installment_payments` (set null) via `ON DELETE CASCADE`, and the `auth.uid() = user_id` RLS policy blocks cross-user deletes.

### Auth, ownership, and privilege posture

All three functions declare `SECURITY INVOKER SET search_path = ''`, matching 002. `SECURITY INVOKER` is the load-bearing choice: the function executes as the caller, so the RLS policies on `installment_plans` and `installment_items` still gate every statement inside — an `INSERT ... (user_id, ...)` with `user_id = v_user_id` (= `auth.uid()`) satisfies the `WITH CHECK (auth.uid() = user_id)` policy, and the `FOR UPDATE` selects are already filtered to the caller's rows. A `SECURITY DEFINER` function would have run as the owner and bypassed RLS, which would have been a privilege escalation; this avoids it. The explicit `WHERE id = p_plan_id AND user_id = v_user_id` on the plan lock is redundant with RLS but harmless defense-in-depth, and it produces a clean "plan not found" rather than an RLS-filtered empty result that the caller might misread.

`SET search_path = ''` is safe because every table reference is schema-qualified (`public.installment_plans`, `public.installment_items`) and `auth.uid()` is schema-qualified, so nothing depends on search-path resolution that an attacker could hijack. There is no dynamic SQL: `jsonb_array_elements` is iterated in plain `FOR` loops and each extracted value is cast to a typed local (`::integer`, `::date`, `::numeric`) before being used in static, parameterized `INSERT`/`UPDATE` statements. PostgREST binds the `p_schedule jsonb` argument as a parameter, not interpolation. The grants (`REVOKE ALL ON FUNCTION ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated`) restrict execution to authenticated users. The migration creates functions and grants only — no `ALTER TABLE`, no policy change, no `DROP`, no edits to 001/002.

### Paid-floor and tenor-reduction enforcement

The paid-floor check iterates the incoming schedule, locks the matching existing item `FOR UPDATE`, and raises when `v_amt < v_existing.paid_amount - 0.01` — i.e. a schedule amount cannot drop more than one cent below what is already paid. The `- 0.01` epsilon mirrors the TS `validateScheduleAgainstPaidItems` (`row.scheduledAmount < prev.paidAmount - AMOUNT_EPSILON`), so the two layers agree: lowering a scheduled amount to exactly the paid amount is allowed, lowering it by more than a cent is rejected.

The tenor-reduction guard and the cleanup delete do not agree at the boundary. The guard preserves any item with `installment_number > v_count AND paid_amount > 0.01`; the trailing delete removes `installment_number > v_count AND paid_amount = 0`. An item with `paid_amount` of exactly `0.01` fails both predicates — `0.01 > 0.01` is false (not blocked), and `0.01 = 0` is false (not deleted) — so it is left in place as an installment beyond the new tenor. The migration's own comment claims "paid excess already blocked by the tenor-reduction check," which is the assumption that breaks at this boundary. The local repository, by contrast, rebuilds its item array strictly from the incoming schedule (`input.schedule.map(...)`), so any item whose number is not in the new schedule is dropped from storage by omission — it would delete the same 0.01-paid item the RPC orphans. The two paths therefore diverge for this input, and the divergence is new to the supabase path (the local path's drop-by-omission behavior is unchanged).

Reach is narrow: `paid_amount` is `numeric(12,2)`, and the app's default currency is IDR (zero-decimal, payments rounded to whole rupiah), so a 1-cent paid amount is not producible there. It is reachable for a 2-decimal currency with a 1-cent partial payment followed by a tenor reduction that crosses that installment. The cleanest fix is to make the guard use `paid_amount > 0` (any recorded payment preserves the item) while leaving the delete at `paid_amount = 0`; that aligns the two predicates with the intent — never drop an item that has any payment — and removes the orphan. This needs live-DB confirmation alongside the other deferred items.

### Item status recompute and the status default

On update, existing items are reconciled by `installment_number`: matched items get `due_date`, `scheduled_amount`, and a recomputed `status` written, and crucially `paid_amount` is never touched — so a partially paid installment keeps its paid balance when the schedule changes. New items (tenor extension) insert with `paid_amount = 0, status = 'pending'`. The status formula is:

```
CASE WHEN v_status = 'cancelled' THEN 'cancelled'
     WHEN v_existing.status = 'settled' THEN 'settled'
     WHEN v_existing.paid_amount >= v_amt THEN 'paid'
     WHEN v_existing.paid_amount > 0 THEN 'partial'
     ELSE 'pending' END
```

One pre-existing, intentional divergence survives: the RPC sets the plan status to `COALESCE(p_status, 'active')` (the repo sends `p_status: input.status ?? null`), so an update that omits `status` resets the plan to `active`. The local repo uses `input.status ?? target.status`, so an omitted status keeps the existing plan status (e.g. an `overdue` plan stays `overdue`). The plan calls this out as a divergence not to reconcile, and the RPC mirrors old supabase's `input.status ?? 'active'`, so it is context rather than a regression — but a reviewer should know the two storage modes are not byte-identical on status defaulting. Neither path re-derives `overdue` (it is a client-side effective status from `getEffectiveItemStatus`, computed on read), and neither auto-completes the plan when all items become paid — `update_installment_plan` trusts the passed status.

### Repository wiring: mappers, fast-fail, defense-in-depth

`mapPlanRow` and `mapItemRow` were extracted from the inline mapping in the list methods and are now reused by both the list paths and the three RPC paths, so a plan or item row is mapped identically regardless of how it was fetched. The three methods keep `validateInstallmentPlanInput` as a prelude so a malformed request (empty name, negative amount, schedule/tenor mismatch) throws before the network call; the RPC then re-runs the same checks authoritatively. The change removed `getUserId()` from these three methods and dropped the `validateScheduleAgainstPaidItems` import — the paid-floor and tenor-reduction checks now live only in the RPC for the supabase path. That matches how `recordInstallmentPayment` and `settleInstallmentPlan` already operate (they rely on `auth.uid()` and RPC-side validation). The trade-off is minor: an edit that violates the paid floor or tenor no longer fails instantly on the client; it fails after a round-trip with a specific RPC message (`'Installment #N scheduled amount (X) cannot be less than already paid amount (Y).'`). `error || !data` throws `error?.message ?? 'Failed to <verb> installment plan'`, so both an RPC error and a null-data edge surface.

### Test coverage

The supabase suite mocks `@/lib/supabase` with `vi.hoisted` and asserts, per method, that `rpc` is called exactly once with the right RPC name and normalized params (trimmed name/description, `p_schedule` as an array of `{installment_number, due_date, scheduled_amount}`), that the `{plan, items}` result maps to camelCase, that invalid input throws without calling `rpc`, and that an RPC error message propagates. A `from()` mock that throws on any call acts as a tripwire: if any of the three methods regressed to the legacy PostgREST path, the test would fail loudly.

The local suite uses an in-memory `localStorage` stub and a `seedAll` helper that pre-writes every `subtrack.v1.*` key so `ensureSeeded` is a no-op. It pins create (pending items, `paidAmount` 0), update (preserves `paidAmount`, recomputes `partial`↔`paid`, rejects the paid floor, rejects tenor reduction below a paid item), and cancel (rejects `completed`/`cancelled`, preserves a `paid` item, cancels `partial`/`pending`, leaves `installment_payments` intact).

Not tested — and not locally testable without Postgres — are the things the plan itself defers: auth/ownership (`auth.uid()` null and `user_id` mismatch), transaction atomicity (a mid-reconcile rollback), and the boundary gap above. The supabase suite also always passes `status: 'active'`, so the `p_status: null` (undefined-status) path and the `!data`-with-null-error fallback message are not exercised; these are low-value gaps given the mapping is trivial. `npx vitest run` passes 31/31, `npx tsc -b` is clean, and `npx oxlint` reports 0 errors; its 9 warnings are all `set-state-in-effect`/`purity` findings in pre-existing UI files this change does not touch.

</details>

<details>
<summary>File map</summary>

- `supabase/migrations/003_installment_plan_rpc.sql` — NEW. Three `SECURITY INVOKER` plpgsql RPCs (`create_installment_plan`, `update_installment_plan`, `cancel_installment_plan`) returning `{plan, items}` jsonb, plus `REVOKE FROM PUBLIC` / `GRANT TO authenticated`. Additive only.
- `src/data/supabase-repository.ts` — MODIFIED. Extracted `mapPlanRow`/`mapItemRow`; `createInstallmentPlan`/`updateInstallmentPlan`/`cancelInstallmentPlan` now call `supabase.rpc(...)` and map the result; removed post-mutation reloads and the unused `validateScheduleAgainstPaidItems` import; kept `validateInstallmentPlanInput` prelude.
- `src/data/supabase-repository.test.ts` — NEW. Vitest suite mocking `@/lib/supabase`; asserts RPC routing, param normalization, result mapping, client fast-fail, and RPC error surfacing, with a `from()`-throws guard against the legacy path.
- `src/data/local-repository.test.ts` — NEW. Vitest suite with an in-memory `localStorage` stub pinning the unchanged local repo's create/update/cancel behavior (paid-floor and tenor-reduction rejections, paid preservation, ledger intactness).

Full diff: run `git diff` against the base branch (no remote PR; this is a local pre-PR review of completed work).

</details>
