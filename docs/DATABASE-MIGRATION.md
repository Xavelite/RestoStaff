# Restaurant-native database migration

This runbook applies the reviewed root-model change while preserving
`auth.users`, `public.profiles`, profile/auth links, memberships and employee
access links. Migration `202606190002` runs in one transaction and aborts on a
lock timeout or an unexpected baseline.

## Before touching the only Supabase project

1. If the project plan includes managed backups, confirm one is current. On the
   Supabase free plan, managed backup restore is unavailable: create the public
   schema/data dumps below, save the identity-link JSON, and prove the complete
   migration first on a disposable Supabase project. Public dumps do not back
   up `auth.users`, so the production migration must not be the first trial.
2. From `C:\dev\restogogo`, run the Supabase CLI through `npx` and
   authenticate. Node.js 20 or newer is required:

   ```powershell
   npx supabase@latest --version
   npx supabase@latest login
   npx supabase@latest link --project-ref pmdfczjomqaglqshbdlw
   ```

   If Windows blocks the `npx` binary, install the official Scoop package
   instead (`scoop install supabase`) and omit `npx supabase@latest` from the
   remaining commands.

3. Save public schema and data copies:

   ```powershell
   New-Item -ItemType Directory -Force backups | Out-Null
   npx supabase@latest db dump --linked --schema public --file backups\before-restaurant-native-schema.sql
   npx supabase@latest db dump --linked --schema public --data-only --use-copy --file backups\before-restaurant-native-data.sql
   ```

4. In the Dashboard SQL Editor, run
   `supabase/tests/pre_migration_contract.sql`. It must complete without an
   exception.
5. In the Dashboard SQL Editor, run
   `supabase/tests/identity_preservation.sql` and save the single JSON result as
   `backups/before-restaurant-native-identities.json`.

## Review and apply

```powershell
npx supabase@latest migration list --linked
npx supabase@latest db push --linked --dry-run
npx supabase@latest db push --linked
npx supabase@latest db lint --linked --schema public --level error --fail-on error
```

The dry run must list only:

- `202606190001_harden_badge_tokens.sql`, if it is not already applied.
- `202606190002_restaurant_native_model.sql`.
- `202606190003_onboarding_invitation_account_hardening.sql`.
- `202606190004_membership_integrity.sql`.
- `202606190005_remove_obsolete_surfaces.sql`.

Do not use `supabase db reset --linked`; it is destructive.

## Verify immediately

1. Run `supabase/tests/security_contract.sql` and
   `supabase/tests/canonical_schema_security.sql` in the Dashboard SQL Editor.
2. Run `supabase/tests/identity_preservation.sql` again. Save the result as
   `backups/after-restaurant-native-identities.json` and compare it byte for
   byte with the before result.
3. Regenerate—not manually edit—the database types:

   ```powershell
   npx supabase@latest gen types typescript --linked --schema public | Set-Content -Encoding utf8 src\lib\supabase\database.types.ts
   npm run validate
   ```

4. Start the app and smoke-test one owner, manager and employee account.
5. Configure and deploy the invitation Edge Function:

   ```powershell
   npx supabase@latest secrets set APP_ORIGIN=https://YOUR-STAGING-OR-PRODUCTION-ORIGIN --project-ref pmdfczjomqaglqshbdlw
   npx supabase@latest functions deploy send-employee-invitation --project-ref pmdfczjomqaglqshbdlw
   npx supabase@latest functions deploy upload-badge-proof --project-ref pmdfczjomqaglqshbdlw
   npx supabase@latest functions deploy get-badge-proof --project-ref pmdfczjomqaglqshbdlw
   ```

   Add `/accept-invite` and `/reset-password` origins to the Supabase Auth
   redirect allow-list before testing invitation and password recovery emails.

If either SQL verification fails or the identity snapshots differ, stop using
the application. Restore through managed backup when available; on the free
plan, do not attempt an in-place repair—restore the public dump into a
replacement project and relink authentication deliberately.

## Follow-up migrations (006–007)

Authored after 001–005 were applied. They need no new backup beyond the dumps
above, but `007` renames the RPCs the app calls, so **apply both before
reloading the app** — the app already calls the canonical names.

1. Apply, in order:

   ```powershell
   npx supabase@latest db push --linked --dry-run   # must list only 006 and 007
   npx supabase@latest db push --linked
   ```

   Or paste `202606190006_owner_of_record.sql` then
   `202606190007_canonical_rpc_names.sql` into the Dashboard SQL Editor, in
   order. `006` aborts with a clear message if any restaurant has no active
   owner — that is the demotion bug surfacing, not a migration fault; resolve
   ownership and re-run.

2. Regenerate types again (the function names changed):

   ```powershell
   npx supabase@latest gen types typescript --linked --schema public | Set-Content -Encoding utf8 src\lib\supabase\database.types.ts
   npm run check
   ```

3. Smoke-test: the owner still resolves to Home; creating a planning draft
   exercises `save_manager_planning`; onboarding/invite exercise
   `setup_owner_workspace` / `accept_employee_invite`.

Ownership is now structural: `restaurants.owner_profile_id` is the source of
truth, captured automatically when an owner membership is created and protected
by a trigger that forbids demoting or removing the owner membership. The `004`
email-match repair is superseded.

## Schedule-exception lifecycle (008)

Migration `202606200008_schedule_exception_lifecycle.sql` adds one new,
isolated domain. It does not rewrite existing leave, availability, planning or
time-entry rows.

1. Apply every pending migration through
   `202606200009_canonical_runtime_snapshot.sql` after `007`:

   ```powershell
   npx supabase@latest db push --linked --dry-run
   npx supabase@latest db push --linked
   ```

   `009` reconciles development databases that already applied the original
   `008` snapshot wrapper. It restores the canonical v2 snapshot function and
   removes the temporary v3 interface without changing operational rows.

   On the free plan, both migrations are designed to be additive and transactional.
   If CLI backups are unavailable, first run it on a disposable Supabase project
   or paste the complete file into the Dashboard SQL Editor. Do not split it.

   When migrations are applied through the SQL Editor, record those exact
   versions in the Supabase migration ledger before using `db push` again:

   ```powershell
   npx supabase@latest migration repair --linked --status applied 202606190001 202606190002 202606190003 202606190004 202606190005 202606190006 202606190007 202606200008 202606200009 202606200010 202606200011
   npx supabase@latest db push --linked --dry-run
   ```

   The dry run must report that the remote database is up to date.

For the repeatable disposable-project procedure, including the current
incremental-baseline limitation, see `docs/DISPOSABLE-DATABASE-REPLAY.md`.

## Employee self-service policy (010)

Migration `202606200010_employee_self_service_policy.sql` makes incomplete
employee setup safe and explicit:

- employees without a contract type default to weekly availability;
- manager-only scheduling remains available only when deliberately selected;
- employee availability can be saved transactionally across future weeks;
- published weeks remain locked;
- Actuals approval is blocked while live, missing or conflicting payroll truth
  remains.

Apply it after `009`, regenerate database types, and verify both Shifts and
Calendar with an employee account.

Migration `202606200011_remove_obsolete_employee_self_service.sql` then removes
the superseded mixed employee mutation. Availability, leave and fixed-schedule
exceptions each have one explicit server-authoritative owner.

2. Regenerate database types from the deployed schema:

   ```powershell
   npx supabase@latest gen types typescript --linked --schema public | Set-Content -Encoding utf8 src\lib\supabase\database.types.ts
   npm run validate
   ```

3. Smoke-test:

   - A fixed-schedule employee submits a service-specific exception.
   - Planning shows it as pending and blocks an overlapping publish.
   - A manager approves or rejects it from the selected Planning slot.
   - Cancelling an approved exception while planning records an audit event.
   - Leave balances remain unchanged.

## Phase 0 security baseline (012–015)

Before applying `015`, prove that the deployed schema already contains the
contracts from migrations `012`, `013` and `014`:

```powershell
npx supabase db query --linked --file supabase/tests/pre_phase0_ledger_repair.sql
npx supabase migration list --linked
```

Only when that verification passes may missing ledger entries be repaired:

```powershell
npx supabase migration repair --linked --status applied 202606200012 202606200013 202606200014
npx supabase db push --linked --dry-run
```

Apply `202606200015_phase0_security_contract.sql` as one transaction. It removes
the legacy text badge-roster overload, restores the one-use badge challenge
table and makes all app-owned `SECURITY DEFINER` routines default-deny except
for the explicit browser and service-role allowlists.

After deployment, the migration list must match through `015`, the dry run must
report no pending migrations, and both SQL security suites must pass.

## Phase 1 operational state contracts (016–018)

Apply migrations `016`, `017` and `018` in order. Together they:

- type stable Planning, Actuals, availability, request and time-entry states;
- constrain restaurant services to fixed `lunch` and `evening` keys;
- keep service labels, times, ordering and activation in `services`;
- close normalized JSON-to-enum mutation boundaries;
- enforce one Lunch and one Evening metadata row per restaurant at commit.

After deployment, regenerate database types and run:

```powershell
npx supabase db query --linked --file supabase/tests/security_contract.sql
npx supabase db query --linked --file supabase/tests/canonical_schema_security.sql
npx supabase db query --linked --file supabase/tests/phase1_operational_contract.sql
npx supabase db lint --linked --schema public --level error
npx supabase db push --linked --dry-run
npm run validate
```

## Phase 2 work-pattern model (019)

Migration `202606210019_canonical_work_pattern_model.sql` separates three
different business truths:

- employee weekly availability remains in `employee_availability_*`;
- fixed recurring work is stored as `recurring_schedule_slots`;
- one-off fixed-schedule deviations use the audited
  `work_pattern_exceptions` lifecycle.

The migration preserves recurring rows, removes their meaningless
`availability_state`, renames the lifecycle RPC and snapshot fields, and adds
deferred guards so recurring slots and work-pattern exceptions can only belong
to fixed-schedule employees. No compatibility views or legacy RPC aliases are
kept.

Verify with:

```powershell
npx supabase db query --linked --file supabase/tests/phase2_work_pattern_contract.sql
```

## Phase 3 email-first access lifecycle (020)

Migration `202606210020_email_first_access_lifecycle.sql` makes pending
invitations independent from Auth profiles and durable memberships:

- `employee_invitations` owns send, resend, expiry, acceptance and revocation
  history;
- `employee_access` and `restaurant_memberships` contain only active or
  disabled durable access;
- profile, employee access and membership links are created atomically only
  after the authenticated email matches the one-use invitation;
- Team bulk save controls badge permission but cannot rewrite identity links or
  access lifecycle state;
- obsolete temporary-access columns and profile-first RPCs are removed.

Deploy `send-employee-invitation`, then delete the retired
`create-employee-auth-user` Edge Function. Verify with:

```powershell
npx supabase db query --linked --file supabase/tests/phase3_access_lifecycle_contract.sql
npx supabase db query --linked --file supabase/tests/security_contract.sql
npx supabase db query --linked --file supabase/tests/canonical_schema_security.sql
npx supabase db lint --linked --schema public --level error
npx supabase db push --linked --dry-run
npm run validate
```

## Phase 4 operational lifecycle integrity (021–022)

Migration `202606210021_operational_lifecycle_integrity.sql` makes Planning and
Actuals lifecycle changes server-authoritative:

- Planning weeks, Actuals weeks and time entries carry explicit numeric
  revisions for optimistic concurrency;
- published Planning is immutable until an explicit revert;
- publish validates services, assignments, availability, leave,
  work-pattern exceptions and coverage on the server;
- Planning updates preserve stable shift identifiers instead of replacing the
  whole week;
- Actuals approval is limited to ended, complete and audited periods;
- approved Actuals is immutable until an explicit reopen;
- lifecycle events contain practical from/to state and a safe period snapshot;
- time-entry adjustments and work-week events are append-only evidence;
- important operational foreign keys use restricted deletion.

Migration `202606210022_routine_lint_integrity.sql` is a forward-only
normalization for already-deployed databases. It makes enum assignment
explicit and removes two obsolete routine variables without changing public
signatures or behavior.

Verify with:

```powershell
npx supabase db query --linked --file supabase/tests/phase4_operational_lifecycle_contract.sql
npx supabase db query --linked --file supabase/tests/security_contract.sql
npx supabase db query --linked --file supabase/tests/canonical_schema_security.sql
npx supabase db lint --linked --schema public --level warning
npx supabase db push --linked --dry-run
npm run validate
```

## Phase 5 focused workspace read models (023–026)

Migration `202606210023_focused_workspace_read_models.sql` removes the broad
restaurant-wide runtime snapshot and introduces five explicit browser reads:

- `get_workspace_bootstrap(uuid)` for shell identity, timezone and readiness;
- `get_manager_operations_read_model(uuid,date,date)` for Home, Planning and
  Actuals;
- `get_employee_operations_read_model(uuid,date,date)` for Shifts and Calendar;
- `get_team_read_model(uuid)` for Team and access/contract/absence work;
- `get_restaurant_read_model(uuid)` for owner-only restaurant configuration.

Operational reads are limited to 63 days. Employee reads expose only the
linked employee. Managers receive Team contacts, access, operational legal
identity and Restaurant setup, while costs and payroll profiles remain
owner-only. Mutation RPCs return compact acknowledgements instead of
retransmitting all workspace domains.

Migrations `024`–`026` complete the deployed contract without compatibility
paths: employee work-area labels and Team membership roles are assigned to
their correct module owners, absence acknowledgements include restaurant
identity, and the bootstrap builder drops an unused internal role argument.

Verify with:

```powershell
npx supabase db query --linked --file supabase/tests/phase5_focused_read_models_contract.sql
npx supabase db query --linked --file supabase/tests/security_contract.sql
npx supabase db query --linked --file supabase/tests/canonical_schema_security.sql
npx supabase db lint --linked --schema public --level warning
npx supabase db push --linked --dry-run
npm run validate
```

## Phase 6 generic payroll export lineage (027)

Migration `202606210027_payroll_export_lineage.sql` rebuilds payroll-period
history as one complete, provider-neutral workflow rather than restoring the
old unused period tables:

- owner-only exports cover one or more complete Monday-to-Sunday weeks;
- every included Actuals week must be approved or locked;
- employees represented in worked entries must have payroll ID, legal name and
  national number;
- the server creates the CSV rows using restaurant-local clock times;
- each immutable run stores source week revisions, entry IDs/revisions, totals,
  actor, timestamp, filename, exact payload and SHA-256 fingerprint;
- owner Actuals can create new runs and re-download historical runs;
- managers receive no payroll run metadata or payload.

Verify with:

```powershell
npx supabase db query --linked --file supabase/tests/phase6_payroll_export_lineage_contract.sql
npx supabase db query --linked --file supabase/tests/security_contract.sql
npx supabase db query --linked --file supabase/tests/canonical_schema_security.sql
npx supabase db lint --linked --schema public --level warning
npx supabase db push --linked --dry-run
npm run validate
```

## Phase 7 model closure (028–029)

Migration `202606210028_default_constraint_alignment.sql` corrects two stale
defaults left behind by the email-first access migration. New employee access
and membership rows now default to `disabled`, which is inside the durable
`active`/`disabled` lifecycle contract.

Migration `202606210029_model_closure_integrity.sql` closes the remaining
practical-history and routine-security gaps:

- absence and work-pattern exception event rows are append-only;
- employee, absence and exception deletion cannot cascade away operational
  evidence;
- superseded employment contracts are immutable and no employment contract can
  be deleted;
- contract-history reads have a dedicated employee/date index;
- every app-owned SQL/PLpgSQL routine has an explicit `search_path`;
- trigger helpers have no browser, anonymous or service-role execute grant;
- canonical verification checks every app-owned routine against separate
  browser and service-role allowlists.

Apply both files in order. When the SQL Editor or Management API is used instead
of `db push`, repair both ledger entries immediately:

```powershell
npx supabase migration repair --linked --status applied 202606210028 202606210029
npx supabase db query --linked --file supabase/tests/phase7_model_closure_contract.sql
npx supabase db query --linked --file supabase/tests/security_contract.sql
npx supabase db query --linked --file supabase/tests/canonical_schema_security.sql
npx supabase db lint --linked --schema public --level warning
npx supabase db push --linked --dry-run
npm run validate
```

## Notifications foundation (030–032)

These three migrations build the derived-notification surface (N1) without a
stored `notifications` table:

- `202606230030_notification_receipts_foundation.sql` introduces
  `notification_receipts` (renaming any earlier `notification_feed_states`) and
  notification preferences.
- `202606230031_notification_policy_function_grants.sql` grants execute on the
  notification policy helpers, which build on `current_profile_id()` and
  `is_restaurant_member(uuid)`.
- `202606230032_notification_source_alignment.sql` aligns the employee
  operations read model so notifications derive from `notification_receipts` and
  real lifecycle events (e.g. `planning_published`), never a stored table.

Apply in order, regenerate database types, then repair the ledger if the SQL
Editor was used:

```powershell
npx supabase migration repair --linked --status applied 202606230030 202606230031 202606230032
npx supabase db push --linked --dry-run
npm run validate
```

## Payroll export config + draft preview + lifecycle auto-finalize (033–035)

These extend the immutable payroll-export lineage (`027`) and close the
past-week approval deadlock. They have been reviewed, contract-tested and
recorded in the linked development migration ledger.

- `202606240033_payroll_export_columns.sql` — owner-configurable export columns
  from a fixed server allowlist (the security boundary). Adds
  `restaurant_settings.payroll_export_columns`, the `payroll_export_field_label`
  allowlist, the owner-only `set_payroll_export_columns` RPC, and rewrites
  `create_payroll_export_run` to take an optional ordered `p_columns`. The run
  stays an immutable, fingerprinted snapshot of approved Actuals; the chosen
  column list is snapshotted into the payload so the hash still covers exactly
  what was downloaded.
- `202606250034_preview_payroll_export.sql` — additive, read-only, owner-only
  `preview_payroll_export`. Same per-entry projection as the official run but
  writes no lineage and applies no approval/identity gate, so an owner can
  download a clearly-marked **DRAFT** payroll CSV before approval. Official,
  hashed lineage stays exclusive to `create_payroll_export_run` from approved
  Actuals.
- `202606250035_actuals_approval_auto_finalize.sql` — `create or replace` of the
  `guard_actuals_approval()` BEFORE trigger (from `021`). When Actuals are
  approved while the planning baseline is still a draft, it promotes the plan to
  published via `NEW` (no recursion) and records an audited `planning_finalized`
  event — never a silent publish, and with no employee notification (those key
  off `planning_published`). `OLD.planning_status` stays `draft`, so the
  published-only missing-badge check is intentionally skipped and no
  re-introduced block can occur. All other approval guards are reproduced
  verbatim.

Apply in order, regenerate database types, then repair the ledger if the SQL
Editor was used:

```powershell
npx supabase migration repair --linked --status applied 202606240033 202606250034 202606250035
npx supabase db query --linked --file supabase/tests/phase6_payroll_export_lineage_contract.sql
npx supabase db query --linked --file supabase/tests/security_contract.sql
npx supabase db query --linked --file supabase/tests/canonical_schema_security.sql
npx supabase db lint --linked --schema public --level warning
npx supabase db push --linked --dry-run
npm run validate
```

Smoke-test after deployment:

- An owner opens **Export → Export CSV** on Actuals, edits the column template,
  and saves it as the restaurant default.
- Exporting an unapproved period downloads a `…-DRAFT.csv` and records **no**
  payroll-export-run row.
- Exporting a fully approved period records one immutable run and downloads the
  `…-APPROVED` evidence.
- Approving Actuals for a past week whose plan was never published succeeds and
  writes a `planning_finalized` event to the Planning timeline.

## Notification trigger-helper grant closure (036)

Migration `202606270036_notification_trigger_helper_grants.sql` closes the
remaining direct-execute grant on `set_notification_updated_at()`. Notification
preferences/receipts remain the only intentional direct RLS table-write surface,
but their trigger helper is no longer browser/service callable.

Verification:

```powershell
npx supabase db query --linked --file supabase/tests/security_contract.sql
npx supabase db query --linked --file supabase/tests/canonical_schema_security.sql
npx supabase db push --linked --dry-run
npm run validate
```

## Payroll helper search-path closure (037)

Migration `202606270037_payroll_helper_search_path.sql` pins
`payroll_export_field_label(text)` to `search_path = public`, closing the final
app-owned routine found by canonical schema/security verification without an
explicit search path.

Verification:

```powershell
npx supabase db query --linked --file supabase/tests/canonical_schema_security.sql
npx supabase db push --linked --dry-run
npm run validate
```

## Actuals auto-finalize completeness closure (038–039)

Migrations `202606270038_actuals_auto_finalize_missing_badge_guard.sql` and
`202606270039_work_week_finalized_event_type.sql` close the runtime contract for
Actuals approval auto-finalization:

- `038` makes the missing-badge guard read `NEW.planning_status`, so a Planning
  baseline finalized inside the same approval trigger cannot bypass planned
  shift completeness.
- `039` adds `planning_finalized` to the `work_week_events` event-type
  constraint, matching the lifecycle evidence written by the approved trigger.

Verification:

```powershell
npx supabase db query --linked --file supabase/tests/phase8_go_pilot_closure_contract.sql
npx supabase db query --linked --file supabase/tests/canonical_schema_security.sql
npx supabase db push --linked --dry-run
npm run validate
```
