import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  bearerAuthorization,
  corsHeaders,
  jsonResponse,
  originAllowed
} from '../supabase/functions/_shared/http.ts';

const APP_ORIGIN = 'http://127.0.0.1:5555';

test('Edge HTTP helpers enforce exact origins and explicit missing-origin policy', () => {
  assert.equal(originAllowed(APP_ORIGIN, APP_ORIGIN), true);
  assert.equal(originAllowed('https://example.test', APP_ORIGIN), false);
  assert.equal(originAllowed(null, APP_ORIGIN), false);
  assert.equal(originAllowed(null, APP_ORIGIN, true), true);

  const headers = new Headers(corsHeaders(APP_ORIGIN));
  assert.equal(headers.get('Access-Control-Allow-Origin'), APP_ORIGIN);
  assert.equal(headers.get('Vary'), 'Origin');
});

test('Edge HTTP helpers preserve valid bearer authorization only', () => {
  assert.equal(
    bearerAuthorization(new Request('https://example.test', {
      headers: { Authorization: 'Bearer token' }
    })),
    'Bearer token'
  );
  assert.equal(bearerAuthorization(new Request('https://example.test')), null);
  assert.equal(
    bearerAuthorization(new Request('https://example.test', {
      headers: { Authorization: 'Basic credentials' }
    })),
    null
  );
});

test('Edge JSON responses use the configured CORS origin', async () => {
  const response = jsonResponse(APP_ORIGIN, { ok: true }, 201);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), APP_ORIGIN);
  assert.deepEqual(await response.json(), { ok: true });
});

test('Supabase config keeps gateway JWT verification enabled for every Edge Function', async () => {
  const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  for (const name of [
    'send-employee-invitation',
    'upload-badge-proof',
    'get-badge-proof'
  ]) {
    assert.match(config, new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt = true`));
  }
  assert.match(config, /\[functions\.dispatch-push\]\s+verify_jwt = false/);
});

test('Edge checks and hosted fixtures use the official Deno runtime', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  );
  const hostedRunner = await readFile(
    new URL('../scripts/run-hosted-acceptance.ps1', import.meta.url),
    'utf8'
  );

  assert.equal(typeof packageJson.devDependencies.deno, 'string');
  assert.equal(packageJson.devDependencies['deno-bin'], undefined);
  assert.match(packageJson.scripts['check:edge'], /^deno check /);
  assert.match(hostedRunner, /npx --no-install deno run/);
});

test('badge proof upload accepts only matching user or paired-station challenges', async () => {
  const source = await readFile(
    new URL('../supabase/functions/upload-badge-proof/index.ts', import.meta.url),
    'utf8'
  );

  assert.match(source, /form\.get\('station_token'\)/);
  assert.match(source, /\.from\('restaurant_stations'\)[\s\S]+\.eq\('token_hash', stationHash\)[\s\S]+\.is\('revoked_at', null\)/);
  assert.match(source, /\.eq\('station_id', station\.id\)/);
  assert.match(source, /role === 'employee' && ownEmployeeId === employeeId/);
  assert.match(source, /\.eq\('actor_profile_id', profileId\)/);
  assert.doesNotMatch(source, /console\.log\([^)]*(stationToken|badgeToken)/);
});
