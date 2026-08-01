# Release checklist

## Automated gate

```powershell
npm ci
npm run validate
npm run test:browser:public
npm audit --omit=dev
```

Required result: all business/security contract tests pass, `svelte-check`
reports zero errors and warnings, the static production build succeeds, public
entry points pass the supported viewport/accessibility smoke suite, and
production dependencies have no known vulnerability.

## Database and Edge Function gate

1. Follow `docs/DATABASE-MIGRATION.md`, including migration-ledger and identity
   checks before and after deployment.
2. Before applying reservation identity migrations to an existing database, run
   the read-only `supabase/tests/reservation_identity_preflight.sql` and resolve
   any duplicate floor levels or normalized active table/combination names.
3. Run `supabase/tests/security_contract.sql`.
4. Regenerate `src/lib/supabase/database.types.ts`.
5. Deploy `send-employee-invitation`, `upload-badge-proof`, `get-badge-proof`,
   `dispatch-push`, and `reservation-public` with the exact environment secrets
   and `APP_ORIGIN`.
6. Configure Auth redirect URLs for `/onboarding`, `/accept-invite` and
   `/reset-password`.
7. Enroll every platform operator in TOTP MFA and verify an AAL2 `/admin`
   session.
8. Review both Supabase security and performance advisors. Reconcile new
   findings with the access manifest in `docs/DATABASE.md`; do not add policies
   to RPC-only tables or remove DEV-unused indexes merely to clear notices.
9. On a paid production plan, enable leaked-password protection. On Free,
   record the unavailable control explicitly and enforce the strongest supported
   password policy before admitting pilot users.

## Role acceptance

Create disposable fixtures using `supabase/seed/create-role-fixtures.ts`.

- Owner: onboarding, Restaurant, Team private fields, invitation, Schedule
  publish/revert, Time approve/reopen, exports, Payroll, and Badge terminal.
- Manager: Restaurant and Team operations are available; costs, payroll data
  and payroll exports remain owner-only. Team invitation cannot grant manager
  unless caller is owner.
- Employee: only My service and My time; only own published shifts, entries,
  availability and leave.

## Failure and boundary checks

- Wrong PIN five times locks the credential for ten minutes.
- A badge token expires after two minutes and cannot be replayed.
- Invitation token expires after seven days and cannot be reused.
- Offline banner appears; reconnect refreshes the workspace.
- Stale Schedule revision produces a clear conflict instead of overwriting.
- Stale Team, Restaurant, and floor-plan revisions produce the same clear
  conflict instead of overwriting.
- Overnight shifts and Europe/Brussels date boundaries reconcile.
- Cancelled/corrected time entries retain their original audit records.

## Responsive and accessibility

Check 1440x900, 1024x768, 768x1024, 390x844 and 360x800:

- No page-level horizontal overflow.
- Mobile weekly boards use selected-day cards.
- My time retains a readable month plus selected-day detail.
- Dialog focus remains trapped, Escape closes, and focus returns to its trigger.
- Every workflow is keyboard operable with visible focus.
- Screen-reader names identify navigation, metrics, grids and dialogs.
- Reduced-motion preference disables nonessential animation.

## Monitoring and rollback

Set `PUBLIC_APP_RELEASE` for every deployment. Optionally set
`PUBLIC_ERROR_ENDPOINT` to a same-organization HTTPS ingestion endpoint that
accepts minimal JSON error envelopes. Client messages are redacted before
delivery; no email, bank account, identifier, token, PIN, form values or
workspace payload is included.

Keep Reports disabled without signed-off metric contracts. Keep Reservations
disabled unless its independent acceptance track, guest-space review, public
privacy copy, and mobile/browser checks are complete.

If smoke tests fail:

1. Stop the release.
2. Restore the previous static build.
3. If database verification or identity comparison failed, restore through the
   available managed-backup workflow. On the free plan, stop immediately and
   restore the public schema/data dump on a replacement project; `auth.users`
   cannot be recovered from a public dump.
4. Record the failing migration/function release and do not repair migration
   history until the database state is confirmed.
