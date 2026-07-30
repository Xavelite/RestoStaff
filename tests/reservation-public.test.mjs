import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

async function bookingMigration() {
  const files = await readdir('supabase/migrations');
  const matches = files.filter((name) =>
    name.endsWith('_reservation_public_booking_channel.sql')
  );
  assert.equal(matches.length, 1, 'Expected one public booking channel migration');
  return readFile(`supabase/migrations/${matches[0]}`, 'utf8');
}

test('public booking schema keeps browsers outside reservation tables', async () => {
  const migration = await bookingMigration();
  for (const table of [
    'reservation_public_channels',
    'reservation_public_holds',
    'reservation_public_hold_tables',
    'reservation_public_idempotency',
    'reservation_public_rate_limits'
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`, 'i'));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated`, 'i')
    );
  }
  assert.doesNotMatch(migration, /grant\s+\w+\s+on table public\.reservations to anon/i);
  assert.doesNotMatch(migration, /grant\s+\w+\s+on table public\.reservations to authenticated/i);
});

test('public booking is an idempotent exact-table five-minute workflow', async () => {
  const migration = await bookingMigration();
  assert.match(migration, /now\(\) \+ interval '5 minutes'/i);
  assert.match(migration, /reservation_public_hold_tables/i);
  assert.match(migration, /reservation_public_idempotency/i);
  assert.match(migration, /IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /reservation_table_assignments_no_overlap/i);
  assert.match(migration, /exclude using gist[\s\S]*occupied_at with &&/i);
  assert.match(migration, /Only explicitly configured combinations are considered/i);
  assert.match(migration, /perform pg_advisory_xact_lock/i);
  assert.match(migration, /guard_reservation_capacity_with_public_holds/i);
  assert.match(migration, /reservation_public_release_hold/i);
  assert.match(migration, /having count\(\*\) = 1/i);
  assert.match(migration, /'maximum_party_size', least\(/i);
  assert.match(migration, /reservation_table_combinations combination/i);
});

test('anonymous confirmation preserves canonical guest identity and snapshots the booking', async () => {
  const [correction, sqlContract] = await Promise.all([
    readFile(
      'supabase/migrations/20260727163604_preserve_public_guest_identity.sql',
      'utf8'
    ),
    readFile('supabase/tests/reservation_public_contract.sql', 'utf8')
  ]);

  assert.match(correction, /reservation_public_confirm\(text,text,text,text,jsonb\)/i);
  assert.match(correction, /v_new_guest_update text := \$new\$\s+null;\s+\$new\$/is);
  assert.match(correction, /'booking_guest_snapshot', jsonb_strip_nulls/i);
  assert.doesNotMatch(
    correction,
    /v_new_guest_update text := \$new\$[\s\S]*?update public\.reservation_guests/is
  );

  assert.match(sqlContract, /Anonymous confirmation overwrote trusted guest identity/);
  assert.match(sqlContract, /Public booking did not retain its guest link and submitted snapshot/);
  assert.match(sqlContract, /reservation\.guest_id = v_trusted_guest_id/);
});

test('public Edge boundary has custom auth, origin checks and rate limits', async () => {
  const [edge, config, packageJson] = await Promise.all([
    readFile('supabase/functions/reservation-public/index.ts', 'utf8'),
    readFile('supabase/config.toml', 'utf8'),
    readFile('package.json', 'utf8')
  ]);
  assert.match(config, /\[functions\.reservation-public\]\s+verify_jwt = false/s);
  assert.match(edge, /x-restogogo-key/i);
  assert.match(edge, /x-restogogo-origin/i);
  assert.match(edge, /consume_reservation_public_rate_limit/);
  assert.match(edge, /RESERVATION_PUBLIC_RATE_LIMIT_SALT/);
  assert.match(edge, /validEmbedSession/);
  assert.match(edge, /actualOrigin === websiteOrigin/);
  assert.match(edge, /actualOrigin === widgetOrigin/);
  assert.match(edge, /service credential is never sent/i);
  assert.match(edge, /Idempotency-Key/i);
  assert.match(packageJson, /supabase\/functions\/reservation-public\/index\.ts/);
});

test('browser widget uses only publishable gateway credentials', async () => {
  const [api, page, rootLayout] = await Promise.all([
    readFile('src/lib/reservations/reservation-public-api.ts', 'utf8'),
    readFile('src/routes/book/+page.svelte', 'utf8'),
    readFile('src/routes/+layout.svelte', 'utf8')
  ]);
  assert.match(api, /PUBLIC_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(api, /SERVICE_ROLE|SECRET_KEY/);
  assert.match(page, /createPublicReservationHold/);
  assert.match(page, /confirmPublicReservation/);
  assert.match(page, /releasePublicReservationHold/);
  assert.match(page, /holdAttemptFingerprint/);
  assert.match(page, /confirmationAttemptFingerprint/);
  assert.match(page, /confirmationAttemptKey/);
  assert.match(page, /five-minute hold/i);
  assert.doesNotMatch(page, /table_ids|tableLabels|table_labels/);
  assert.match(page, /document\.referrer/);
  assert.match(rootLayout, /page\.url\.pathname === '\/book'/);
  assert.match(rootLayout, /\{#if isPublicBooking\}\s*\{@render children\(\)\}/s);
});

test('Reservations API workspace leads with the website widget', async () => {
  const workspace = await readFile(
    'src/lib/reservations/ReservationApiWorkspace.svelte',
    'utf8'
  );
  assert.match(workspace, /Accept bookings on your own website/);
  assert.match(workspace, /Restaurant website/);
  assert.match(workspace, /savedOrigins\(\)/);
  assert.match(workspace, /Copy embed code/);
  assert.match(workspace, /Replace key now/);
  assert.match(workspace, /Server API/);
  assert.match(workspace, /Webhooks/);
  assert.match(workspace, /Upcoming/);
  assert.match(workspace, /\/book\?key=/);
  assert.match(workspace, /bootstrap: true/);
  assert.match(workspace, /data\.embed_session/);
});

test('canonical database verifier allowlists only the reviewed public boundary', async () => {
  const security = await readFile(
    'supabase/tests/canonical_schema_security.sql',
    'utf8'
  );
  assert.match(security, /get_reservation_public_channel_v2\(uuid\)/);
  assert.match(security, /get_reservation_floor_plans_v2\(uuid\)/);
  assert.match(security, /save_reservation_floor_plans_v2\(uuid,jsonb,jsonb,jsonb,jsonb,integer\)/);
  assert.match(security, /reservation_public_create_hold\(text,text,text,jsonb\)/);
  assert.match(security, /reservation_public_release_hold\(text,text,text\)/);
  assert.match(security, /reservation_public_confirm\(text,text,text,text,jsonb\)/);
  assert.match(security, /reservation_public_search_availability\(text,text,date,text,integer,uuid\)/);
});
