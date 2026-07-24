# Release checklist

## Automated gate

```powershell
npm ci
npm run validate
```

Required result: all business/security contract tests pass, `svelte-check`
reports zero errors and warnings, and the static production build succeeds.

## Database and Edge Function gate

1. Follow `docs/DATABASE-MIGRATION.md`, including before/after identity snapshots.
2. Run `supabase/tests/security_contract.sql`.
3. Regenerate `src/lib/supabase/database.types.ts`.
4. Deploy `send-employee-invitation` and `upload-badge-proof` with the exact
   staging/production `APP_ORIGIN`.
5. Configure Auth redirect URLs for `/onboarding`, `/accept-invite` and
   `/reset-password`.

## Role acceptance

Create disposable fixtures using `supabase/seed/create-role-fixtures.ts`.

- Owner: onboarding, Restaurant, Team private fields, invitation, Planning
  publish/revert, Actuals approve/reopen, exports and Badge terminal.
- Manager: no Restaurant or owner-private payroll/legal data; Team invitation
  cannot grant manager unless caller is owner.
- Employee: only Shifts and Calendar; only own published shifts, entries,
  availability and leave.

## Failure and boundary checks

- Wrong PIN five times locks the credential for ten minutes.
- A badge token expires after two minutes and cannot be replayed.
- Invitation token expires after seven days and cannot be reused.
- Offline banner appears; reconnect refreshes the workspace.
- Stale planning revision produces a clear conflict instead of overwriting.
- Overnight shifts and Europe/Brussels date boundaries reconcile.
- Cancelled/corrected time entries retain their original audit records.

## Responsive and accessibility

Check 1440×900, 1024×768, 390×844 and 360×800:

- No page-level horizontal overflow.
- Mobile weekly boards use selected-day cards.
- Calendar retains a readable month plus selected-day detail.
- Dialog focus remains trapped, Escape closes, and focus returns to its trigger.
- Every workflow is keyboard operable with visible focus.
- Screen-reader names identify navigation, metrics, grids and dialogs.
- Reduced-motion preference disables nonessential animation.

## Monitoring and rollback

Set `PUBLIC_APP_RELEASE` for every deployment. Optionally set
`PUBLIC_ERROR_ENDPOINT` to a same-organization HTTPS ingestion endpoint that
accepts minimal JSON error envelopes. No email, token, PIN, form values or
workspace payload is included.

If smoke tests fail:

1. Stop the release.
2. Restore the previous static build.
3. If database verification or identity comparison failed, restore through the
   available managed-backup workflow. On the free plan, stop immediately and
   restore the public schema/data dump on a replacement project; `auth.users`
   cannot be recovered from a public dump.
4. Record the failing migration/function release and do not repair migration
   history until the database state is confirmed.
