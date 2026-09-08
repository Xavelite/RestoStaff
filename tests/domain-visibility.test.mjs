import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import middleware from '../middleware.ts';

test('xbesnard.com exposes a small public backstage homepage', async () => {
  for (const host of ['xbesnard.com', 'www.xbesnard.com']) {
    const response = middleware(new Request(`https://${host}/`));
    assert.equal(response?.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('x-robots-tag'), null);
    const body = await response.text();
    assert.match(body, /You are not lost\. You found the backstage\./);
    assert.match(body, /href="\/restogogo\/"/);
    assert.match(body, /href="\/IdleAge\/"/);
    assert.match(body, /Play IdleAge/);
  }
});

test('game aliases reach IdleAge and preserve asset paths and query parameters', () => {
  for (const [path, destination] of [
    ['/game', '/IdleAge/'],
    ['/game/?seed=123', '/IdleAge/?seed=123'],
    ['/idleage', '/IdleAge/'],
    ['/IdleAge?seed=123', '/IdleAge/?seed=123'],
    ['/idleage/assets/example.png?v=1', '/IdleAge/assets/example.png?v=1']
  ]) {
    const response = middleware(new Request(`https://xbesnard.com${path}`));
    assert.equal(response?.status, 307);
    assert.equal(response.headers.get('location'), `https://xbesnard.com${destination}`);
  }
});

test('IdleAge, Restogogo and the recipe film pass through to their deployed artifacts', () => {
  for (const path of [
    '/IdleAge/',
    '/IdleAge/index.html',
    '/IdleAge/assets/index-example.js',
    '/IdleAge/assets/structures/approved/thatch-shelter.png',
    '/restogogo/',
    '/restogogo/login',
    '/restogogo/_app/immutable/start.js',
    '/restogogo/service-worker.js',
    '/pasta',
    '/pasta/animations-v3.jsx'
  ]) {
    assert.equal(middleware(new Request(`https://xbesnard.com${path}`)), undefined, path);
  }
});

test('old Restogogo links redirect into the new mount and preserve their query', () => {
  const response = middleware(
    new Request('https://www.xbesnard.com/login?next=%2Fteam')
  );
  assert.equal(response?.status, 307);
  assert.equal(
    response.headers.get('location'),
    'https://www.xbesnard.com/restogogo/login?next=%2Fteam'
  );

  const slash = middleware(new Request('https://xbesnard.com/restogogo?mode=signup'));
  assert.equal(slash?.status, 308);
  assert.equal(
    slash.headers.get('location'),
    'https://xbesnard.com/restogogo/?mode=signup'
  );
});

test('unknown public paths return visitors to the backstage homepage', () => {
  const response = middleware(new Request('https://xbesnard.com/some-old-page?q=1'));
  assert.equal(response?.status, 307);
  assert.equal(response.headers.get('location'), 'https://xbesnard.com/');
});

test('hosting routes never intercept local development, production or preview domains', () => {
  for (const origin of [
    'http://localhost:5555',
    'http://127.0.0.1:5555',
    'https://restogogo.com',
    'https://www.restogogo.com',
    'https://restostaff-example.vercel.app',
    'https://xbesnard.com.example.com'
  ]) {
    for (const path of ['/', '/home', '/restogogo/', '/pasta', '/IdleAge/', '/game', '/service-worker.js']) {
      assert.equal(middleware(new Request(`${origin}${path}`)), undefined, `${origin}${path}`);
    }
  }
});

test('HEAD requests use the same non-cacheable homepage policy without a body', async () => {
  const response = middleware(new Request('https://www.xbesnard.com/', { method: 'HEAD' }));
  assert.equal(await response.text(), '');
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('the old root service worker removes itself and releases open pages', async () => {
  const response = middleware(new Request('https://www.xbesnard.com/service-worker.js'));
  assert.equal(response.headers.get('content-type'), 'application/javascript; charset=utf-8');
  assert.match(response.headers.get('cache-control'), /must-revalidate/);

  const handlers = new Map();
  const navigated = [];
  let skippedWaiting = false;
  let unregistered = false;
  runInNewContext(await response.text(), {
    self: {
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => { skippedWaiting = true; },
      registration: { unregister: async () => { unregistered = true; } },
      clients: {
        matchAll: async () => [
          { url: 'https://www.xbesnard.com/', navigate: async (url) => navigated.push(url) },
          { url: 'https://www.xbesnard.com/team', navigate: async (url) => navigated.push(url) }
        ]
      }
    }
  });

  for (const event of ['install', 'activate']) {
    let completion;
    handlers.get(event)({ waitUntil: (promise) => { completion = promise; } });
    await completion;
  }
  assert.equal(skippedWaiting, true);
  assert.equal(unregistered, true);
  assert.deepEqual(navigated, [
    'https://www.xbesnard.com/',
    'https://www.xbesnard.com/team'
  ]);
  assert.equal(handlers.has('fetch'), false, 'the retirement worker must not intercept navigation');
});
