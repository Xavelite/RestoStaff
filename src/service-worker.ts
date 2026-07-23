/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `restogogo-${version}`;
const APP_SHELL = [...new Set([...build, ...files, '/'])];

worker.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  void worker.skipWaiting();
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => worker.clients.claim())
  );
});

worker.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== worker.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () =>
        (await caches.match('/')) ?? Response.error()
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request))
  );
});

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
  key?: string;
  type?: string;
  restaurantId?: string;
  severity?: string;
};

worker.addEventListener('push', (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() as PushPayload ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }

  const target = new URL(payload.url || '/', worker.location.origin);
  if (payload.key) target.searchParams.set('push_key', payload.key);
  if (payload.type) target.searchParams.set('push_type', payload.type);
  if (payload.restaurantId) target.searchParams.set('push_restaurant', payload.restaurantId);

  event.waitUntil(
    worker.registration.showNotification(payload.title || 'Restogogo', {
      body: payload.body || 'Something needs your attention.',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: payload.key || undefined,
      data: { url: `${target.pathname}${target.search}` },
      requireInteraction: payload.severity === 'critical'
    })
  );
});

worker.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(String(event.notification.data?.url || '/'), worker.location.origin);
  event.waitUntil((async () => {
    const windows = await worker.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === target.origin);
    if (existing) {
      await existing.navigate(target.href);
      return existing.focus();
    }
    return worker.clients.openWindow(target.href);
  })());
});
