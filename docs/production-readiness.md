# Production readiness

This repository is the validated source for both development and a separate
hosted pilot environment. It can recreate and validate Restogogo on an empty
Supabase project without copying development identities or restaurant data.
Environment credentials, domains, and provider state remain outside Git.

A free pilot is not the final paid production posture. Supabase Free can pause
an inactive project and does not provide the backup and recovery guarantees
required for a mature production service. Monitoring, restore drills, retention,
support ownership, and commercial weather terms remain operational launch gates.

Changing only `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` is not enough.
For a new environment:

1. Create an empty Supabase project and run the guarded bootstrap documented in
   `docs/DATABASE.md`.
2. Configure the exact Auth site URL and allowed redirects for the deployed app.
   Create the intended operator account, then provision it explicitly with
   `npm run provision:platform-admin -- -Email '<operator-email>'`. Restaurant
   owners cannot claim platform-wide access from the browser.
3. Set `APP_ORIGIN` and required function secrets, then deploy all four Edge
   Functions. Generate a Web Push key set with `npm run generate:push-keys`.
   Build the public key into `PUBLIC_WEB_PUSH_VAPID_KEY`; store
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and a separate
   `PUSH_DISPATCH_SECRET` as Supabase Edge secrets. Never expose the private key
   or dispatch secret to the browser.
4. Build the frontend with that project's public URL and browser-safe key, and
   deploy it to Vercel through the repository's official SvelteKit adapter.
   Linux CI and Vercel build the production adapter output; local Windows builds
   use the equivalent static SPA output because Vercel's adapter requires
   symlink privileges on Windows. Set `PUBLIC_APP_RELEASE` to the deployed
   release identifier and `PUBLIC_ERROR_ENDPOINT` to the browser-safe monitoring
   intake URL.
5. Replace the default Open-Meteo open-access weather endpoints with a
   commercially licensed or self-hosted compatible endpoint. The defaults are
   intentionally limited to development/evaluation use; keep the visible
   Open-Meteo attribution whenever its data is used.
6. Run linked database verification plus managed-service and browser acceptance
   against staging before promoting the same reviewed artifacts to production.
7. Run `npm run configure:push-scheduler -- -ProjectRef '<REF>' -ProjectUrl
   'https://<REF>.supabase.co'`. This stores the scheduler URL and credential in
   Vault, schedules `dispatch-push` every minute, and verifies the
   database-to-Edge path without changing the development link. Confirm delivery
   and expired subscription cleanup on real Android and iOS Home Screen
   installations.

Before release:

- deploy the verified database and Edge Functions to staging with exact Auth
  redirects and `APP_ORIGIN`;
- rerun SQL, managed-service, role, and browser acceptance on staging;
- exercise Schedule publish/revert, Timesheet correction/approve/reopen,
  payroll export, invitation acceptance, message read/acknowledgement,
  notification lifecycle, role preview, pilot feedback, and proof handling with
  representative data;
- test overnight services, timezone boundaries, stale revisions, reconnects,
  invitation expiry, PIN lockout, and token replay;
- complete keyboard, screen-reader, contrast, reduced-motion, and device checks;
- verify that browser error reports reach the configured monitoring intake
  without exposing secrets or personal data;
- configure monitoring, backup/restore, rollback ownership, incident response,
  data retention, privacy, and operational support.

Production credentials must never be used by baseline, fixture, or hosted
acceptance tooling.
