import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { notificationPushCopy } from '../src/lib/notifications/push-copy.ts';

test('phone notification copy follows the account locale and shared service labels', () => {
  const item = {
    key: 'forgot-badge-out:entry-1',
    type: 'employee_forgot_badge_out',
    audience: 'manager',
    severity: 'attention',
    title: '{name} forgot to badge out',
    titleParams: { name: 'Emma' },
    body: '{date} {service}',
    bodyParams: { date: '2026-07-21' },
    serviceKey: 'lunch',
    createdAt: '2026-07-21T12:00:00Z',
    actionMode: 'popup',
    targetUrl: '/timesheet',
    source: { table: 'time_entries', id: 'entry-1' }
  };

  assert.deepEqual(notificationPushCopy(item, 'fr-BE'), {
    title: 'Emma a oublié de pointer son départ',
    body: '2026-07-21 Midi'
  });
  assert.deepEqual(notificationPushCopy(item, 'nl'), {
    title: 'Emma vergat uit te klokken',
    body: '2026-07-21 Lunch'
  });
});

test('PWA and Edge delivery surfaces are wired to durable notification truth', async () => {
  const [manifestSource, worker, dispatcher, migration, schedulerMigration, schedulerSetup, bootstrap] = await Promise.all([
    readFile('static/manifest.webmanifest', 'utf8'),
    readFile('src/service-worker.ts', 'utf8'),
    readFile('supabase/functions/dispatch-push/index.ts', 'utf8'),
    readFile('supabase/migrations/202607210036_web_push_delivery.sql', 'utf8'),
    readFile('supabase/migrations/202607210037_push_scheduler_support.sql', 'utf8'),
    readFile('scripts/configure-push-scheduler.ps1', 'utf8'),
    readFile('scripts/bootstrap-disposable-database.ps1', 'utf8')
  ]);
  const manifest = JSON.parse(manifestSource);

  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.ok(manifest.icons.some((icon) => icon.purpose.includes('maskable')));
  assert.match(worker, /addEventListener\('push'/);
  assert.match(worker, /addEventListener\('notificationclick'/);
  assert.match(dispatcher, /deriveNotifications/);
  assert.match(dispatcher, /PUSH_DISPATCH_SECRET/);
  assert.match(dispatcher, /push_notification_deliveries/);
  assert.doesNotMatch(dispatcher, /notification_receipts/);
  assert.doesNotMatch(dispatcher, /receipt\?\.(?:read_at|dismissed_at)/);
  assert.match(migration, /unique \(subscription_id, restaurant_id, notification_key\)/i);
  assert.match(migration, /grant execute on function public\.get_push_dispatch_context[\s\S]*to service_role/i);
  assert.match(schedulerMigration, /create extension if not exists pg_net/i);
  assert.match(schedulerMigration, /create extension if not exists pg_cron/i);
  assert.match(schedulerSetup, /vault\.create_secret/);
  assert.match(schedulerSetup, /cron\.schedule/);
  assert.match(schedulerSetup, /net\.http_post/);
  assert.match(bootstrap, /push_notification_contract\.sql/);
});

test('Web Push key generation returns standards-shaped public and private material', () => {
  const generated = JSON.parse(
    execFileSync(process.execPath, ['scripts/generate-web-push-keys.mjs'], { encoding: 'utf8' })
  );
  assert.match(generated.publicKey, /^[A-Za-z0-9_-]{87}$/);
  assert.match(generated.privateKey, /^[A-Za-z0-9_-]{43}$/);
  assert.match(generated.dispatchSecret, /^[A-Za-z0-9_-]{43}$/);
});
