import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import middleware from '../middleware.ts';

test('the hidden domain serves a blank document for every entry point, regardless of session', async () => {
  for (const host of ['xbesnard.com', 'www.xbesnard.com']) {
    for (const path of ['/', '/home', '/login?next=%2Fteam', '/team', '/schedule', '/pasta', '/pasta/index.html', '/book']) {
      for (const headers of [{}, { cookie: 'session=existing-session' }]) {
        const response = middleware(new Request(`https://${host}${path}`, { headers }));
        assert.equal(response?.status, 200, `${host}${path}`);
        assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
        assert.match(response.headers.get('cache-control'), /no-store/);
        assert.match(response.headers.get('x-robots-tag'), /noindex/);
        const body = await response.text();
        assert.match(body, /<body><\/body>/);
        assert.doesNotMatch(body, /<script|_app\/|restogogo|supabase/i);
      }
    }
  }
});

test('the hosting gate never intercepts local development, the production product or preview domains', () => {
  for (const origin of ['http://localhost:5555', 'http://127.0.0.1:5555', 'https://restogogo.com', 'https://www.restogogo.com', 'https://restostaff-example.vercel.app', 'https://xbesnard.com.example.com']) {
    for (const path of ['/', '/home', '/pasta', '/service-worker.js']) {
      assert.equal(middleware(new Request(`${origin}${path}`)), undefined, `${origin}${path}`);
    }
  }
});

test('HEAD requests use the same non-cacheable visibility policy without a body', async () => {
  const response = middleware(new Request('https://www.xbesnard.com/team', { method: 'HEAD' }));
  assert.equal(await response.text(), '');
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('the temporary service worker replaces old offline navigation without deleting browser data', async () => {
  const response = middleware(new Request('https://www.xbesnard.com/service-worker.js'));
  assert.equal(response.headers.get('content-type'), 'application/javascript; charset=utf-8');
  const handlers = new Map();
  let skippedWaiting = false;
  let claimedClients = false;
  runInNewContext(await response.text(), {
    URL,
    Response,
    self: {
      location: { origin: 'https://www.xbesnard.com' },
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => { skippedWaiting = true; },
      clients: { claim: async () => { claimedClients = true; } }
    }
  });

  for (const event of ['install', 'activate']) {
    let completion;
    handlers.get(event)({ waitUntil: (promise) => { completion = promise; } });
    await completion;
  }
  assert.equal(skippedWaiting, true);
  assert.equal(claimedClients, true);

  let navigationResponse;
  handlers.get('fetch')({
    request: { mode: 'navigate', url: 'https://www.xbesnard.com/team' },
    respondWith: (result) => { navigationResponse = result; }
  });
  assert.match(await navigationResponse.text(), /<body><\/body>/);
  assert.match(navigationResponse.headers.get('cache-control'), /no-store/);

  for (const request of [
    { mode: 'same-origin', url: 'https://www.xbesnard.com/resource' },
    { mode: 'navigate', url: 'https://restogogo.com/home' }
  ]) {
    handlers.get('fetch')({ request, respondWith: () => assert.fail('unrelated request was intercepted') });
  }
});
