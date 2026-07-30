import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('fresh-project bootstrap surface contains every generated public table and RPC', async () => {
  const [types, baseline, cutoff, migrationNames] = await Promise.all([
    read('src/lib/supabase/database.types.ts'),
    read('supabase/baseline/public.sql'),
    read('supabase/baseline/cutoff.txt'),
    readdir('supabase/migrations')
  ]);
  const laterMigrations = migrationNames
    .filter((name) => /^\d+_.*\.sql$/.test(name) && name.slice(0, 12) > cutoff.trim())
    .sort();
  const bootstrapSurface = [
    baseline,
    ...(await Promise.all(laterMigrations.map((name) => read(`supabase/migrations/${name}`))))
  ].join('\n');
  const normalizedTypes = types.replaceAll('\r\n', '\n');
  const tablesBlock = normalizedTypes.match(/    Tables: \{([\s\S]*?)\n    \}\n    Views:/)?.[1] ?? '';
  const tableNames = [...tablesBlock.matchAll(/^      ([a-z0-9_]+): \{/gm)].map((match) => match[1]);
  assert.ok(tableNames.length >= 40, 'generated table extraction unexpectedly returned too few tables');
  for (const name of tableNames) {
    assert.match(
      bootstrapSurface,
      new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+(?:"public"\\."${name}"|public\\.${name})(?=\\s*\\()`, 'i'),
      `bootstrap surface is missing public.${name}`
    );
  }

  const functionsBlock = normalizedTypes.match(/    Functions: \{([\s\S]*?)\n    \}\n    Enums:/)?.[1] ?? '';
  const functionNames = [...functionsBlock.matchAll(/^      ([a-z0-9_]+): \{/gm)].map(
    (match) => match[1]
  );
  assert.ok(functionNames.length >= 30, 'generated function extraction unexpectedly returned too few RPCs');
  for (const name of functionNames) {
    assert.match(
      bootstrapSurface,
      new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:"public"\\."${name}"|public\\.${name})(?=\\s*\\()`, 'i'),
      `bootstrap surface is missing public.${name}`
    );
  }
});

test('fresh-project baseline is source-only, ordered and free of local residue', async () => {
  const [publicSql, prerequisites, platform, seed, runner, sqlExecutor] = await Promise.all([
    read('supabase/baseline/public.sql'),
    read('supabase/baseline/prerequisites.sql'),
    read('supabase/baseline/platform.sql'),
    read('supabase/baseline/seed.sql'),
    read('scripts/bootstrap-disposable-database.ps1'),
    read('scripts/execute-database-sql.mjs')
  ]);

  assert.doesNotMatch(publicSql, /\\(?:un)?restrict\s/);
  assert.doesNotMatch(publicSql, /Ã|â|Â|�/);
  assert.doesNotMatch(publicSql, /pmdfczjomqaglqshbdlw|@example\.com/i);
  assert.doesNotMatch(publicSql, /^INSERT INTO /im);
  assert.match(prerequisites, /create extension if not exists pgcrypto with schema extensions/i);
  assert.match(prerequisites, /create extension if not exists citext with schema public/i);
  assert.match(prerequisites, /revoke all on tables from anon, authenticated/i);
  assert.match(prerequisites, /revoke all on functions from anon, authenticated, service_role/i);
  assert.match(platform, /'badge-proofs'[\s\S]*5242880/);
  assert.doesNotMatch(platform, /realtime\.messages/i);
  assert.match(platform, /revoke create on schema public from anon, authenticated, service_role/i);
  assert.match(platform, /grant usage on schema public to anon, authenticated, service_role/i);
  assert.equal([...seed.matchAll(/^  \('([a-z0-9_]+)'/gm)].length, 15);

  const order = [
    'assert-empty.sql',
    'prerequisites.sql',
    'public.sql',
    'platform.sql',
    'seed.sql'
  ].map((name) => runner.indexOf(`supabase/baseline/${name}`));
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(runner, /ALLOW_DESTRUCTIVE_DATABASE_BOOTSTRAP -ne 'YES'/);
  assert.match(runner, /SUPABASE_DB_PASSWORD/);
  assert.match(runner, /restogogo-bootstrap-/);
  assert.match(runner, /supabase --workdir \$temporaryRoot/);
  assert.match(runner, /RESTOGOGO_BOOTSTRAP_DATABASE_URL = \$databaseUrl/);
  assert.match(runner, /scripts\/execute-database-sql\.mjs/);
  assert.match(sqlExecutor, /allowedRoots/);
  assert.match(sqlExecutor, /query\(sql\)/);
  assert.match(runner, /Copy-Item -LiteralPath 'supabase\/migrations'/);
  assert.doesNotMatch(runner, /initialize-hosted-realtime/);
  assert.match(runner, /Refusing to bootstrap the currently linked development project/);
  assert.match(runner, /\^restogogo-acceptance-/);
  assert.match(runner, /ALLOW_PRODUCTION_DATABASE_BOOTSTRAP -cne \$ProjectRef/);
  assert.match(runner, /Restogogo Production/);
});

test('baseline cutoff is a reviewed migration and bootstrap applies later migrations', async () => {
  const [cutoff, names] = await Promise.all([
    read('supabase/baseline/cutoff.txt'),
    readdir('supabase/migrations')
  ]);
  const versions = names.flatMap((name) => name.match(/^(\d+)_.*\.sql$/)?.[1] ?? []);
  assert.ok(versions.includes(cutoff.trim()));
  const runner = await read('scripts/bootstrap-disposable-database.ps1');
  assert.match(runner, /migration repair @versions --status applied/);
  assert.match(runner, /db push --linked --include-all --yes/);
});

test('platform suspension is enforced by central tenant authority', async () => {
  const [migration, grants] = await Promise.all([
    read('supabase/migrations/202607210033_platform_admin_hardening.sql'),
    read('supabase/migrations/202607210034_platform_admin_grant_hardening.sql')
  ]);

  for (const helper of [
    'active_membership_role',
    'is_owner',
    'is_owner_or_manager',
    'is_restaurant_member',
    'is_own_employee',
    'set_own_pin',
    'resolve_station_token'
  ]) {
    const body = migration.match(
      new RegExp(`create or replace function public\\.${helper}\\([\\s\\S]*?\\n\\$\\$;|create or replace function public\\.${helper}\\([\\s\\S]*?\\n\\$active_membership_role\\$;`, 'i')
    )?.[0] ?? '';
    assert.match(body, /join public\.restaurants r[\s\S]*r\.active/i, `${helper} does not reject suspended tenants`);
  }

  assert.match(migration, /create or replace function public\.platform_admin_access_state\(\)/i);
  assert.match(migration, /create or replace function public\.admin_dashboard\(\)[\s\S]*platform_admin_events/i);
  assert.match(migration, /'member_count'[\s\S]*'shift_count'[\s\S]*'time_entry_count'/i);
  assert.match(grants, /revoke all on function public\.admin_dashboard\(\) from public, anon, authenticated/i);
  assert.match(grants, /grant execute on function public\.admin_delete_user\(uuid\) to authenticated/i);
});

test('platform administration requires explicit deployment provisioning', async () => {
  const [migration, setup] = await Promise.all([
    read('supabase/migrations/202607210038_lock_platform_admin_bootstrap.sql'),
    read('scripts/provision-platform-admin.ps1')
  ]);

  assert.match(migration, /drop function public\.claim_platform_admin\(\)/i);
  assert.match(migration, /drop function public\.platform_admin_access_state\(\)/i);
  assert.match(setup, /insert into public\.platform_admins/i);
  assert.doesNotMatch(setup, /restaurant_memberships/);
});

test('deployment uses the Vercel adapter outside the Windows local build', async () => {
  // The adapter lives in svelte.config.js, where SvelteKit and Vercel both
  // look for it; vite.config.ts stays a plain plugin list.
  const config = await read('svelte.config.js');
  assert.match(config, /vercelAdapter\(\)/);
  assert.match(config, /process\.platform === 'win32'/);
  assert.match(config, /process\.env\.VERCEL !== '1'/);
});

test('the deployed app keeps its security headers and badge-camera policy', async () => {
  // vercel.json is the only place these are set: losing it would silently drop
  // the camera permission the badge terminal needs to capture proof photos.
  const vercel = JSON.parse(await read('vercel.json'));
  const global = vercel.headers.find((entry) => entry.source === '/(.*)');
  const keys = global.headers.map((header) => header.key);
  assert.ok(keys.includes('X-Content-Type-Options'));
  assert.ok(keys.includes('Referrer-Policy'));
  assert.ok(keys.includes('Strict-Transport-Security'));
  const permissions = global.headers.find((header) => header.key === 'Permissions-Policy');
  assert.match(permissions.value, /camera=\(self\)/);

  const application = vercel.headers.find(
    (entry) => entry.source === '/((?!book(?:/|$)).*)'
  );
  const applicationCsp = application.headers.find(
    (header) => header.key === 'Content-Security-Policy'
  );
  assert.match(applicationCsp.value, /frame-ancestors 'none'/);
  assert.ok(
    application.headers.some(
      (header) => header.key === 'X-Frame-Options' && header.value === 'DENY'
    )
  );

  const publicBooking = vercel.headers.find((entry) => entry.source === '/book');
  const bookingCsp = publicBooking.headers.find(
    (header) => header.key === 'Content-Security-Policy'
  );
  assert.match(bookingCsp.value, /frame-ancestors https:/);
});
