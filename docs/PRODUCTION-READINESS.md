# Production readiness

This repository is the validated source for development and separate hosted
environments. It can recreate and validate Restogogo on an empty Supabase
project without copying development identities or restaurant data.
Environment credentials, domains, and provider state remain outside Git.

A free pilot is not the final paid production posture. Supabase Free can pause
an inactive project and does not provide the backup and recovery guarantees
required for a mature production service. Monitoring, restore drills,
retention, support ownership, and commercial weather terms remain operational
launch gates.

Changing only `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` is not
enough. For a new environment:

1. Create an empty Supabase project and run the guarded bootstrap documented in
   `DATABASE.md`.
2. Configure the exact Auth site URL and allowed redirects. Provision platform
   operators explicitly with `npm run provision:platform-admin`; a restaurant
   role never grants platform access.
3. Set `APP_ORIGIN` and function secrets, then deploy all five Edge Functions.
   Generate Web Push keys with `npm run generate:push-keys`. Build only the
   public key into the frontend; keep private and dispatch secrets in Supabase.
4. Build the frontend with that project's public URL and browser-safe key and
   deploy it through the official SvelteKit Vercel adapter. Set
   `PUBLIC_APP_RELEASE` and the browser-safe monitoring endpoint.
5. Replace the default Open-Meteo development/evaluation endpoints with a
   commercially licensed or self-hosted compatible endpoint.
6. Run database, managed-service, role, and browser acceptance against staging
   before promoting the same reviewed artifacts.
7. Configure the push scheduler and verify delivery plus expired-subscription
   cleanup on real Android and iOS Home Screen installations.

Before release, exercise Schedule publish/revert, Time & attendance
correction/approve/reopen, payroll export, invitation acceptance, message
read/acknowledgement, notification lifecycle, reservations, role preview,
feedback, and proof handling with representative data. Also test overnight
services, timezone boundaries, stale revisions, reconnects, expiry, PIN
lockout, token replay, accessibility, monitoring, backup/restore, rollback,
retention, privacy, and support ownership.

Production credentials must never be used by baseline, fixture, or hosted
acceptance tooling.
