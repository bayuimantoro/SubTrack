# Atomic Installment Plan Mutations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `createInstallmentPlan`, `updateInstallmentPlan`, and `cancelInstallmentPlan` atomic by moving all plan+item mutations into single-transaction PostgreSQL RPC functions, and route `SupabaseSubTrackRepository` through them instead of multiple independent PostgREST requests.

**Architecture:** Three new `SECURITY INVOKER` RPCs (`search_path = ''`) in a forward-only migration `003_installment_plan_rpc.sql` mirror the contract already established by `record_installment_payment` / `settle_installment_plan` in migration 002. Each RPC validates `auth.uid()` + ownership, locks the parent plan (`FOR UPDATE`, items locked after the plan for consistent ordering), performs all inserts/updates/deletes inside one function (implicit single transaction), preserves payment ledger rows and already-paid installment items, enforces a paid-amount floor, and returns a composite `jsonb { "plan": …, "items": […] }` so the repository consumes one round-trip. The Supabase repository swaps its three methods to `supabase.rpc(...)` and reuses extracted snake_case→camelCase mappers; the local repository is left unchanged (already functionally equivalent to itself).

**Tech Stack:** PostgreSQL 15+ / Supabase (plpgsql RPCs), TypeScript, `@supabase/supabase-js`, vitest.

**Spec:** `docs/superpowers/plans/2026-11-17-atomic-installment-plan-mutations.md` (this document; the user's Priority-1 requirements are the source spec).

## Global Constraints

- Forward-only, additive migration: `003_installment_plan_rpc.sql` adds functions + grants only. Do not alter tables, RLS policies, indexes, or migrations 001/002.
- Each RPC: `SECURITY INVOKER`, `SET search_path = ''`, explicit `auth.uid()` null-check + ownership check, `REVOKE … FROM PUBLIC` + `GRANT … TO authenticated`.
- Do not change subscription or billing logic; do not touch `billing-engine.ts`, subscription repos, or RLS.
- Do not introduce runtime dependencies. No new npm packages (test-only stubs are in-process, not packages).
- Do not expose secrets; `.env.example` already exists and is unchanged.
- Do not run migrations against production. The migration file is created locally only.
- Preserve existing localStorage data and backward compatibility (local repo keys `subtrack.v1.*` unchanged).
- Do not modify unrelated UI components (`InstallmentFormDialog.tsx`, `useSubTrack.tsx`, pages).
- Preserve each repository path's existing observable behavior exactly; do not reconcile pre-existing supabase/local divergences.
- Supabase repo keeps the existing TS-side `validateInstallmentPlanInput` / `validateScheduleAgainstPaidItems` prelude (fast-fail) before the RPC call; the RPC re-validates authoritatively (defense in depth, matching how `recordInstallmentPayment` keeps a client-side hint).

## Review Focus

The spec implies behavior on inputs no task's tests exercise locally (SQL has no local harness). These must be covered by the RPC logic and flagged for live-DB verification:

1. **Paid-amount floor on edit** — lowering an installment's `scheduled_amount` below its `paid_amount` must be rejected even if the client pre-check is bypassed. Pinned to Task 1 (RPC validation) + Task 2 (repo still calls `validateScheduleAgainstPaidItems`).
2. **Tenor reduction dropping a paid item** — shortening the schedule so a paid installment leaves the schedule must be rejected. Pinned to Task 1 + Task 3 (local repo test seeds a paid item beyond the new tenor).
3. **Cancel preserves paid/settled items & payment ledger** — cancel must keep `paid`/`settled` items and never delete `installment_payments`. Pinned to Task 1 + Task 3.
4. **Auth/ownership** — a user must not mutate another user's plan; `auth.uid() IS NULL` and `user_id` mismatch raise. Pinned to Task 1 (cannot run without live DB).
5. **Transaction atomicity** — a failure mid-reconcile rolls back the whole plan+item change. Pinned to Task 1 (inherent to single plpgsql function; needs live DB to demonstrate).

## File Structure

- **Create** `supabase/migrations/003_installment_plan_rpc.sql` — three `SECURITY INVOKER` RPC functions + grants. Forward-only, additive.
- **Modify** `src/data/supabase-repository.ts` — extract `mapPlanRow` / `mapItemRow` helpers; replace bodies of `createInstallmentPlan`, `updateInstallmentPlan`, `cancelInstallmentPlan` with `supabase.rpc(...)` calls; remove the post-mutation `listInstallmentPlans`/`listInstallmentItems` reloads for these three methods.
- **Create** `src/data/supabase-repository.test.ts` — vitest unit tests mocking `@/lib/supabase`; assert each method calls the right RPC once with normalized params, maps the returned `{plan, items}` correctly, fast-fails invalid input without calling the RPC, and surfaces RPC errors.
- **Create** `src/data/local-repository.test.ts` — vitest unit tests with an in-memory `localStorage` stub; pin local repo behavior (create stores plan+items; update rejects paid-floor & tenor-reduction-below-paid, preserves `paidAmount` and recomputes status; cancel rejects completed/cancelled and preserves paid items). No new packages.

No other files change.

---

### Task 1: Migration 003 — atomic installment plan RPCs

**Files:**
- Create: `supabase/migrations/003_installment_plan_rpc.sql`

**Interfaces:**
- Produces (PostgREST-callable): `public.create_installment_plan(...)`, `public.update_installment_plan(uuid, ...)`, `public.cancel_installment_plan(uuid)` — each `RETURNS jsonb` shaped `{"plan": <plan_row_json>, "items": [<item_row_json>...]}` with snake_case keys matching the table columns. Granted `EXECUTE` to `authenticated` only.

**RPC contracts (implement exactly):**

Common header for all three: `LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$ DECLARE v_user_id uuid := auth.uid(); … BEGIN IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF; … END; $$;`

`create_installment_plan(p_provider_name text, p_provider_type text, p_description text, p_currency text, p_principal_amount numeric, p_interest_amount numeric, p_admin_fee numeric, p_other_charges numeric, p_total_repayment_amount numeric, p_tenor_months int, p_schedule_type text, p_start_date date, p_first_due_date date, p_status text, p_notes text, p_schedule jsonb) RETURNS jsonb`
- Validate: `btrim(p_provider_name)` non-empty; `btrim(p_description)` non-empty; all charge amounts ≥ 0; `p_total_repayment_amount > 0`; `p_tenor_months` integer ≥ 1; `p_start_date`/`p_first_due_date` not null; `p_provider_type IN ('paylater','personal_loan','installment_purchase','other')`; `p_schedule_type IN ('fixed','variable')`; `p_status IS NULL OR p_status IN ('active','completed','overdue','cancelled')` (default `'active'`).
- Validate schedule: `jsonb_array_length(p_schedule) = p_tenor_months`; each element has `installment_number > 0`, non-null `due_date`, `scheduled_amount >= 0`; sum of `scheduled_amount` equals `p_total_repayment_amount` within 0.01.
- `INSERT` plan row (`user_id = v_user_id`, trimmed name/description, `status = COALESCE(p_status,'active')`, `notes = p_notes`), `RETURNING * INTO v_plan`.
- `INSERT` all items from `p_schedule` with `paid_amount = 0`, `user_id = v_user_id`, `status = (CASE WHEN COALESCE(p_status,'active') = 'cancelled' THEN 'cancelled' ELSE 'pending' END)`. Iterate via `jsonb_array_elements`. (Matches old supabase create item-status logic.)
- Return `jsonb_build_object('plan', to_jsonb(v_plan), 'items', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.installment_number) FROM public.installment_items i WHERE i.plan_id = v_plan.id), '[]'::jsonb))`.

`update_installment_plan(p_plan_id uuid, p_provider_name text, p_provider_type text, p_description text, p_currency text, p_principal_amount numeric, p_interest_amount numeric, p_admin_fee numeric, p_other_charges numeric, p_total_repayment_amount numeric, p_tenor_months int, p_schedule_type text, p_start_date date, p_first_due_date date, p_status text, p_notes text, p_schedule jsonb) RETURNS jsonb`
- `SELECT * INTO v_plan FROM public.installment_plans WHERE id = p_plan_id AND user_id = v_user_id FOR UPDATE;` → not found raises `'Installment plan not found'`.
- Run the same field validations as create.
- Lock existing items in deterministic order: `SELECT * INTO v_items FROM public.installment_items WHERE plan_id = p_plan_id ORDER BY installment_number FOR UPDATE;` (declare `v_items public.installment_items[]` or loop with a cursor). Consistent lock ordering: plan first, then items.
- Paid-floor validation: for each schedule row, if an existing item shares its `installment_number` and `row.scheduled_amount < item.paid_amount - 0.01` → raise `'Installment #N scheduled amount (X) cannot be less than already paid amount (Y).'`.
- Tenor-reduction validation: if any existing item has `installment_number > jsonb_array_length(p_schedule)` AND `paid_amount > 0.01` → raise `'Cannot reduce tenor below installment #N because it already has recorded payments.'`
- `UPDATE` the plan row with the new fields, `status = COALESCE(p_status,'active')` (matches old supabase update: `input.status ?? 'active'`).
- Reconcile items (loop `jsonb_array_elements(p_schedule)`): for each row, if an existing item matches `installment_number` → `UPDATE installment_items SET due_date = row.due_date, scheduled_amount = row.scheduled_amount, status = <recompute> WHERE id = item.id` (do NOT touch `paid_amount`). Status recompute formula (matches old supabase + local): `CASE WHEN COALESCE(p_status,'active')='cancelled' THEN 'cancelled' WHEN item.status='settled' THEN 'settled' WHEN item.paid_amount >= row.scheduled_amount THEN 'paid' WHEN item.paid_amount > 0 THEN 'partial' ELSE 'pending' END`. If no matching existing item → `INSERT` new item with `paid_amount = 0`, `status = 'pending'` (matches old supabase: new items always `'pending'`).
- Delete excess unpaid items: `DELETE FROM public.installment_items WHERE plan_id = p_plan_id AND installment_number > jsonb_array_length(p_schedule) AND paid_amount = 0` (paid excess already blocked by the tenor-reduction check).
- Return composite `jsonb {plan, items}` as in create (re-select current plan + items).

`cancel_installment_plan(p_plan_id uuid) RETURNS jsonb`
- `SELECT * INTO v_plan FROM public.installment_plans WHERE id = p_plan_id AND user_id = v_user_id FOR UPDATE;` → not found raises `'Installment plan not found'`.
- If `v_plan.status = 'completed'` → raise `'Completed installment plans cannot be cancelled.'`; if `v_plan.status = 'cancelled'` → raise `'Installment plan is already cancelled.'` (matches old supabase + `applyPlanCancellation`).
- `UPDATE public.installment_plans SET status = 'cancelled' WHERE id = p_plan_id;`
- `UPDATE public.installment_items SET status = 'cancelled' WHERE plan_id = p_plan_id AND status IN ('pending','partial','overdue');` (preserves `paid`/`settled`/`cancelled`). Never touch `installment_payments`.
- Return composite `jsonb {plan, items}` (re-select).

Grants (after each function definition): `REVOKE ALL ON FUNCTION public.<name>(<arg types>) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.<name>(<arg types>) TO authenticated;`

- [ ] **Step 1: Write the migration file** with the three functions + grants per the contracts above.

- [ ] **Step 2: Self-review the SQL** against migration 002's patterns (SECURITY INVOKER, `SET search_path = ''`, `auth.uid()` guard, `FOR UPDATE` plan-first, `REVOKE`/`GRANT`) and against the Review Focus items (paid-floor, tenor-reduction, cancel-preserves-paid, auth/ownership). Confirm no `ALTER TABLE`, no RLS change, no `DROP`, no edits to 001/002.

- [ ] **Step 3: Note live-DB deferral** — record in the final report that these RPCs require a live Supabase/Postgres environment to exercise (auth, transactions, locking); do not claim they were verified against a live DB.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/003_installment_plan_rpc.sql
git commit -m "feat(db): add atomic installment plan create/update/cancel RPCs (migration 003)"
```

(If the workspace has no git repo — it currently does not — skip the commit step and note it.)

---

### Task 2: Route SupabaseSubTrackRepository through the RPCs

**Files:**
- Modify: `src/data/supabase-repository.ts`
- Test: `src/data/supabase-repository.test.ts`

**Interfaces:**
- Consumes: RPCs from Task 1 via `supabase.rpc('<name>', { …params })` returning `{ data: { plan, items }, error }` (jsonb).
- Produces: unchanged `{ plan, items }` return shape from the three repository methods, so `useSubTrack` and the UI need no changes.

- [ ] **Step 1: Write the failing test file** `src/data/supabase-repository.test.ts`.

Mock `@/lib/supabase` with `vi.mock`, exposing `supabase.auth.getUser` (resolves `{ data: { user: { id: 'user-1' } }, error: null }`), a `vi.fn()` `rpc`, and a `vi.fn()` `from`. Import `SupabaseSubTrackRepository` dynamically after the mock.

Define a `validInput()` builder (providerName `' Shopee SPayLater '`, providerType `'paylater'`, description `' Headphones '`, currency `'IDR'`, principal 3000000, interest 360000, adminFee 0, other 0, total 3360000, tenor 6, scheduleType `'fixed'`, startDate, firstDueDate, status `'active'`, notes null, schedule of 6 rows summing to 3360000). Define `planJson()`/`itemsJson()` snake_case fixtures.

Tests:
- `createInstallmentPlan`: calls `rpc('create_installment_plan', …)` exactly once with `p_provider_name` = trimmed name, `p_description` = trimmed, `p_schedule` = array of `{installment_number, due_date, scheduled_amount}`, `p_status`, `p_notes`; maps returned `{plan, items}` to camelCase; returns them.
- `createInstallmentPlan` rejects invalid input (empty providerName) and does **not** call `rpc`.
- `createInstallmentPlan` throws the RPC error message when `rpc` returns `{ data: null, error: { message: 'Schedule total mismatch' } }`.
- `updateInstallmentPlan(id, input)`: calls `rpc('update_installment_plan', …)` once with `p_plan_id = id`, trimmed fields, `p_schedule` serialized; maps result; rejects invalid input without calling rpc; surfaces RPC error.
- `cancelInstallmentPlan(id)`: calls `rpc('cancel_installment_plan', { p_plan_id: id })` once; maps `{plan, items}`; surfaces RPC error.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/supabase-repository.test.ts`
Expected: FAIL — the methods still use `supabase.from(...)` (multi-request), so `rpc` is not called (or the mock's `from` isn't set up, causing a different failure). Confirms the test exercises the new path.

- [ ] **Step 3: Implement in `src/data/supabase-repository.ts`**

- Extract `mapPlanRow(r: Record<string, unknown>): InstallmentPlan` and `mapItemRow(r: Record<string, unknown>): InstallmentItem` (move the inline mapping from `listInstallmentPlans` / `listInstallmentItems` into these helpers, then have the list methods call them — pure refactor, identical output).
- `createInstallmentPlan`: keep `validateInstallmentPlanInput` prelude; call `getUserId()`; `const { data, error } = await supabase.rpc('create_installment_plan', { p_provider_name: input.providerName.trim(), p_provider_type: input.providerType, p_description: input.description.trim(), p_currency: input.currency, p_principal_amount: input.principalAmount, p_interest_amount: input.interestAmount, p_admin_fee: input.adminFee, p_other_charges: input.otherCharges, p_total_repayment_amount: input.totalRepaymentAmount, p_tenor_months: input.tenorMonths, p_schedule_type: input.scheduleType, p_start_date: input.startDate, p_first_due_date: input.firstDueDate, p_status: input.status ?? null, p_notes: input.notes, p_schedule: input.schedule.map(r => ({ installment_number: r.installmentNumber, due_date: r.dueDate, scheduled_amount: r.scheduledAmount })) })`; on `error || !data` throw `new Error(error?.message ?? 'Failed to create installment plan')`; return `{ plan: mapPlanRow((data as any).plan), items: ((data as any).items as any[]).map(mapItemRow) }`. Remove the old insert+rollback+reload code.
- `updateInstallmentPlan`: keep `validateInstallmentPlanInput` prelude; call `getUserId()`; call `rpc('update_installment_plan', { p_plan_id: id, <same params as create> })`; map result. Remove the old update + `validateScheduleAgainstPaidItems` (now done in RPC) + N+1 item updates + delete + reload. Note: `validateScheduleAgainstPaidItems` is removed from the supabase path (RPC owns it); keep the import only if still used elsewhere (it is not after this change) — remove the now-unused import to satisfy `noUnusedLocals`/lint.
- `cancelInstallmentPlan`: remove the list/find/status-checks/N requests; call `rpc('cancel_installment_plan', { p_plan_id: id })`; on error throw; map `{plan, items}`. (The completed/cancelled rejection now lives in the RPC.)
- Keep all other methods (list*, recordInstallmentPayment, settleInstallmentPlan, subscription methods) unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/data/supabase-repository.test.ts`
Expected: PASS — all create/update/cancel RPC tests green.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `npx vitest run`
Expected: PASS — existing `installment-engine.test.ts` and `billing-engine.test.ts` still green.

- [ ] **Step 6: Commit**

```bash
git add src/data/supabase-repository.ts src/data/supabase-repository.test.ts
git commit -m "refactor(data): route installment plan create/update/cancel through atomic RPCs"
```

---

### Task 3: Local repository equivalence tests

**Files:**
- Create: `src/data/local-repository.test.ts`

**Interfaces:**
- Consumes: `LocalSubTrackRepository` (unchanged) + the storage keys `subtrack.v1.installment_plans`, `subtrack.v1.installment_items`, `subtrack.v1.installment_payments`, `subtrack.v1.subscriptions`, `subtrack.v1.billing_history`, `subtrack.v1.notification_preferences`, `subtrack.v1.user_settings`.

- [ ] **Step 1: Write the test file** with an in-memory `localStorage` stub (`getItem`/`setItem`/`removeItem`/`clear` over a `Map`) stubbed via `vi.stubGlobal('localStorage', …)` in `beforeEach`, and a `seedAll()` helper that writes non-null values to every `subtrack.v1.*` key so `ensureSeeded()` is a no-op.

Tests:
- `createInstallmentPlan` stores the plan and items, returns both, items are `pending` (or `cancelled` when `status='cancelled'`), `paidAmount` 0.
- `updateInstallmentPlan` preserves an existing item's `paidAmount` and recomputes status (seed an item with `paidAmount` 300000 / `scheduledAmount` 550000 → update `scheduledAmount` to 550000 → status `partial`; update to 300000 → status `paid`).
- `updateInstallmentPlan` rejects lowering `scheduledAmount` below `paidAmount` (throws `/cannot be less than already paid/i`).
- `updateInstallmentPlan` rejects reducing tenor below a paid installment (seed item #3 with `paidAmount > 0`, update with a 2-row schedule → throws `/cannot reduce tenor/i`).
- `cancelInstallmentPlan` rejects `completed` and `cancelled` plans; for an `active` plan with one `paid`, one `partial`, one `pending` item, sets plan `cancelled`, keeps `paid`, marks `partial`/`pending` → `cancelled`, and leaves `installment_payments` intact.

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/data/local-repository.test.ts`
Expected: PASS (these pin existing behavior; they should pass against the unchanged local repo).

- [ ] **Step 3: Commit**

```bash
git add src/data/local-repository.test.ts
git commit -m "test(data): pin local installment plan create/update/cancel behavior"
```

---

### Task 4: Verification pass

**Files:** none (run commands).

- [ ] **Step 1: TypeScript**

Run: `npx tsc -b`
Expected: no errors (watch for unused import of `validateScheduleAgainstPaidItems` in supabase-repository.ts).

- [ ] **Step 2: Lint**

Run: `npx oxlint`
Expected: no errors.

- [ ] **Step 3: Tests**

Run: `npx vitest run`
Expected: all green (existing + new files).

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: `tsc -b && vite build` succeeds.

- [ ] **Step 5: Capture exact output** of each command for the final report (do not paraphrase pass/fail).

---

### Task 5: Code review + security review

- [ ] **Step 1: Invoke `semantic_reviewer` sub-agent** on the diff (supabase-repository.ts + migration 003 + tests). Collect findings; fix anything valid before reporting done.

- [ ] **Step 2: Invoke `security-review`** against the new RPCs + repo changes (auth/ownership, SQL injection via `jsonb`/`EXECUTE` parameterization, privilege via `SECURITY INVOKER` + grants, no secrets, RLS untouched). Address valid findings.

- [ ] **Step 3: Write the final report** covering: exact files changed, RPC contracts (params + returns), test results (real output), and the items requiring a live Supabase environment (auth, transactions, locking, paid-floor/tenor-reduction enforcement at the DB). Do not claim live-DB verification unless performed.
