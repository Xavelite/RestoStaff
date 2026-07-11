import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('fresh-project public baseline contains every generated public table and RPC', async () => {
  const [types, baseline] = await Promise.all([
    read('src/lib/supabase/database.types.ts'),
    read('supabase/baseline/public.sql')
  ]);
  const tablesBlock = types.match(/    Tables: \{([\s\S]*?)\n    \}\n    Views:/)?.[1] ?? '';
  const tableNames = [...tablesBlock.matchAll(/^      ([a-z0-9_]+): \{/gm)].map((match) => match[1]);
  assert.ok(tableNames.length >= 40, 'generated table extraction unexpectedly returned too few tables');
  for (const name of tableNames) {
    assert.match(
      baseline,
      new RegExp(`CREATE TABLE IF NOT EXISTS "public"\\."${name}"`),
      `baseline is missing public.${name}`
    );
  }

  const functionsBlock = types.match(/    Functions: \{([\s\S]*?)\n    \}\n    Enums:/)?.[1] ?? '';
  const functionNames = [...functionsBlock.matchAll(/^      ([a-z0-9_]+): \{/gm)].map(
    (match) => match[1]
  );
  assert.ok(functionNames.length >= 30, 'generated function extraction unexpectedly returned too few RPCs');
  for (const name of functionNames) {
    assert.match(
      baseline,
      new RegExp(`CREATE OR REPLACE FUNCTION "public"\\."${name}"`),
      `baseline is missing public.${name}`
    );
  }
});

test('fresh-project baseline is source-only, ordered and free of local residue', async () => {
  const [publicSql, prerequisites, platform, seed, runner] = await Promise.all([
    read('supabase/baseline/public.sql'),
    read('supabase/baseline/prerequisites.sql'),
    read('supabase/baseline/platform.sql'),
    read('supabase/baseline/seed.sql'),
    read('scripts/bootstrap-disposable-database.ps1')
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
  assert.match(platform, /workspace members can receive broadcasts/);
  assert.match(platform, /workspace members can send broadcasts/);
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
  assert.match(runner, /Copy-Item -LiteralPath 'supabase\/migrations'/);
  assert.match(runner, /scripts\/initialize-hosted-realtime\.mjs/);
  assert.match(runner, /Refusing to bootstrap the currently linked development project/);
  assert.match(runner, /\^restogogo-acceptance-/);
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
