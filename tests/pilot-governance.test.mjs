import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { redactMonitoringMessage } from '../src/lib/monitoring/redact.ts';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('monitoring redacts personal and authentication data', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.signature123';
  const message = redactMonitoringMessage(
    `Contact jane@example.com using BE68 5390 0754 7034, NISS 85.07.30-033.28 and ${jwt}`
  );

  assert.doesNotMatch(message, /jane@example\.com/);
  assert.doesNotMatch(message, /5390/);
  assert.doesNotMatch(message, /033/);
  assert.doesNotMatch(message, /eyJ/);
  assert.match(message, /\[email\]/);
  assert.match(message, /\[bank-account\]/);
  assert.match(message, /\[identifier\]/);
  assert.match(message, /\[token\]/);
});

test('pilot migrations enforce entitlements, revisions and privileged boundaries', async () => {
  const governance = await source(
    'supabase/migrations/20260729221639_pilot_governance_revisions_and_hr_scope.sql'
  );
  const atomicVenue = await source(
    'supabase/migrations/20260729224740_pilot_entitlements_and_atomic_venue_v2.sql'
  );
  const serviceBoundaries = await source(
    'supabase/migrations/20260729231800_complete_configurable_service_boundaries.sql'
  );
  const quarantine = await source(
    'supabase/migrations/20260729233500_quarantine_experimental_modules.sql'
  );
  const adminMfa = await source(
    'supabase/migrations/20260729234700_require_platform_admin_mfa.sql'
  );
  const retiredVenueBoundary = await source(
    'supabase/migrations/20260730001717_retire_atomic_venue_browser_boundary.sql'
  );
  const adminPage = await source('src/routes/admin/+page.svelte');

  assert.match(governance, /restaurant_module_entitlements/);
  assert.match(governance, /expected_revision/);
  assert.match(governance, /to_jsonb\(l\) - 'national_registry_number'/);
  assert.match(atomicVenue, /save_venue_model_v2/);
  assert.match(atomicVenue, /assert_reservation_public_module/);
  assert.match(serviceBoundaries, /service\.restaurant_id = p_restaurant_id[\s\S]*and service\.active/);
  assert.doesNotMatch(serviceBoundaries, /p_service\s+in\s+\('lunch',\s*'evening'\)/i);
  assert.match(quarantine, /revoke all on function public\.calculate_payroll_run/i);
  assert.match(quarantine, /reports.*'disabled'/is);
  assert.match(adminMfa, /aal2/);
  assert.match(retiredVenueBoundary, /save_venue_model_v2/);
  assert.match(retiredVenueBoundary, /from public, anon, authenticated/i);
  assert.match(retiredVenueBoundary, /to service_role/i);
  assert.match(adminPage, /Two-step verification required/);
  assert.match(adminPage, /\{:else if error\}/);
});

test('pilot documentation records the constrained release truth', async () => {
  const pilot = await source('docs/PILOT.md');
  const payroll = await source('docs/PAYROLL.md');
  const reservations = await source('docs/RESERVATIONS.md');

  assert.match(pilot, /One restaurant is one independent venue/);
  assert.match(pilot, /Reports.*Disabled by default/);
  assert.match(payroll, /does not calculate official gross-to-net payroll/);
  assert.match(reservations, /disabled by default/);
  assert.match(reservations, /not accepted as the final guest-space model/);
});
