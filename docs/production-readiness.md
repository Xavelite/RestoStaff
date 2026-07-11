# Production readiness

V503 is a development baseline, not a production deployment. The repository can
recreate and validate Restogogo on an empty disposable hosted Supabase project.
Production was not touched.

Before release:

- deploy the verified database and Edge Functions to staging with exact Auth
  redirects and `APP_ORIGIN`;
- rerun SQL, managed-service, role, and browser acceptance on staging;
- exercise Schedule publish/revert, Timesheet correction/approve/reopen,
  payroll export, invitation acceptance, notification lifecycle, and proof
  handling with representative data;
- test overnight services, timezone boundaries, stale revisions, reconnects,
  invitation expiry, PIN lockout, and token replay;
- complete keyboard, screen-reader, contrast, reduced-motion, and device checks;
- configure monitoring, backup/restore, rollback ownership, incident response,
  data retention, privacy, and operational support.

Production credentials must never be used by baseline, fixture, or hosted
acceptance tooling.
