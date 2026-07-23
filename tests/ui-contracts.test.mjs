import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const allowedBreakpoints = new Set(['1180', '980', '760', '520']);

async function sourceFiles(directory, extensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(target, extensions)));
    else if (extensions.some((extension) => target.endsWith(extension))) files.push(target);
  }
  return files;
}

test('responsive CSS uses only the product breakpoint ladder', async () => {
  const violations = [];
  for (const file of await sourceFiles('src', ['.svelte', '.css'])) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)) {
      if (!allowedBreakpoints.has(match[1])) violations.push(`${file}:${match[1]}px`);
    }
  }
  assert.deepEqual(violations, []);
});

test('every authenticated route atmosphere has its image asset', async () => {
  const layout = await readFile('src/routes/(app)/+layout.svelte', 'utf8');
  const backgrounds = new Set(await readdir('static/module-backgrounds'));
  const atmosphereByRoute = {
    '/home': ['home', 'home.webp'],
    '/schedule': ['schedule', 'schedule.webp'],
    '/timesheet': ['timesheet', 'timesheet.webp'],
    '/badge-terminal': ['badge', 'badge.webp'],
    '/team': ['team', 'team.webp'],
    '/restaurant': ['restaurant', 'restaurant.webp'],
    '/my-service': ['my-service', 'my-service.webp'],
    '/my-time': ['my-time', 'my-time.webp'],
    '/dashboard': ['dashboard', 'home.webp']
  };
  for (const [route, [atmosphere, asset]] of Object.entries(atmosphereByRoute)) {
    assert.match(layout, new RegExp(`pathname === '${route}'\\) return '${atmosphere}'`));
    assert.match(
      layout,
      new RegExp(`data-atmosphere='${atmosphere}'[^}]+url\\('/module-backgrounds/${asset.replace('.', '\\.')}'\\)`)
    );
    assert.ok(backgrounds.has(asset));
  }
});

test('the application favicon and icons are product-owned brand assets', async () => {
  // The favicon, the in-app mark and the installable icons are all generated
  // from the brand logos by scripts/generate-brand-icons.mjs. Assert every
  // output exists and is a real PNG, so a missing or truncated file cannot
  // quietly ship as a broken image.
  const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const generated = [
    'static/brand/favicon.png',
    'static/brand/restogogo-mark.png',
    'static/icons/icon-192.png',
    'static/icons/icon-512.png',
    'static/icons/apple-touch-icon.png',
    'static/icons/badge-96.png'
  ];
  for (const asset of generated) {
    const file = await readFile(asset);
    assert.ok(file.subarray(0, 8).equals(PNG_SIGNATURE), `${asset} is not a PNG`);
    assert.ok(file.length > 512, `${asset} is suspiciously small`);
  }

  // The document must point at the product favicon, never a framework starter.
  const layout = await readFile('src/routes/+layout.svelte', 'utf8');
  assert.match(layout, /rel="icon" href="\/brand\/favicon\.png"/);
  assert.doesNotMatch(layout, /svelte-logo|#ff3e00/i);
});

test('the authenticated topbar uses the brand mark as the leading R and one icon family', async () => {
  const layout = await readFile('src/routes/(app)/+layout.svelte', 'utf8');
  const login = await readFile('src/routes/login/+page.svelte', 'utf8');
  const communications = await readFile('src/lib/communications/CommunicationCenter.svelte', 'utf8');
  const notifications = await readFile('src/lib/components/NotificationBell.svelte', 'utf8');

  assert.match(layout, /restogogo-mark\.png/);
  assert.match(layout, /<i>esto<\/i><i>gogo<\/i>/);
  assert.match(login, /restogogo-mark\.png/);
  assert.match(login, /<i>esto<\/i><i>gogo<\/i>/);
  assert.match(login, /<h1 class="login__title">\{pageTitle\}<\/h1>/);
  assert.match(layout, /💡/u);
  assert.match(communications, /💬/u);
  assert.match(notifications, /🔔/u);
  assert.doesNotMatch(`${layout}${communications}${notifications}`, /@lucide\/svelte/);
});

test('the account menu exposes an honest install flow and notification handoff', async () => {
  const layout = await readFile('src/routes/(app)/+layout.svelte', 'utf8');
  const menu = await readFile('src/lib/app-shell/AccountMenu.svelte', 'utf8');
  const installer = await readFile('src/lib/pwa/app-install.svelte.ts', 'utf8');

  assert.match(menu, /t\('Install app'\)/);
  assert.match(layout, /settingsRequest=\{notificationSettingsRequest\}/);
  assert.match(menu, /appInstall\.ios/);
  assert.match(menu, /confirmAction\(\{[\s\S]+title: 'Install Restogogo\?'/);
  assert.match(menu, /appInstall\.standalone/);
  assert.doesNotMatch(menu, /Restogogo installed\. Enable phone notifications next/);
  assert.match(installer, /beforeinstallprompt/);
  assert.match(installer, /appinstalled/);
  assert.match(installer, /display-mode: standalone/);
  assert.match(installer, /standalone = \$state\(false\)/);
});

test('both designs share one account menu and one session boundary', async () => {
  const modern = await readFile('src/routes/(app)/+layout.svelte', 'utf8');
  const classic = await readFile('src/routes/(classic)/classic/+layout.svelte', 'utf8');

  // Two shells, one implementation: the design switch, workspace switcher and
  // account settings can never drift apart between them.
  for (const shell of [modern, classic]) {
    assert.match(shell, /import AccountMenu from '\$lib\/app-shell\/AccountMenu\.svelte'/);
    assert.match(shell, /useAppSession\(\)/);
  }
  assert.doesNotMatch(classic, /supabase\.auth\.updateUser/);
});

test('tenant logos reach both badge terminal entry points and reject SVG uploads', async () => {
  const manager = await readFile('src/routes/(app)/badge-terminal/+page.svelte', 'utf8');
  const station = await readFile('src/routes/station/+page.svelte', 'utf8');
  const stationApi = await readFile('src/lib/station/station-api.ts', 'utf8');
  const logoApi = await readFile('src/lib/restaurant/logo-api.ts', 'utf8');
  const migration = await readFile(
    'supabase/migrations/202607230046_terminal_logo_and_upload_hardening.sql',
    'utf8'
  );

  assert.match(manager, /restaurantLogoUrl\(workspace\.bootstrap\?\.restaurant\.logo_path\)/);
  assert.match(manager, /\{logoUrl\}/);
  assert.match(station, /restaurantLogoUrl\(ctx\.logoPath\)/);
  assert.match(stationApi, /logoPath: String\(result\.logo_path/);
  assert.doesNotMatch(logoApi, /image\/svg\+xml/);
  assert.match(migration, /'logo_path'/);
  assert.doesNotMatch(migration, /image\/svg\+xml/);
});

test('app sounds stay enabled by default until the user explicitly mutes them', async () => {
  const sound = await readFile('src/lib/sound/sound.svelte.ts', 'utf8');

  assert.match(sound, /enabled = \$state\(true\)/);
  assert.match(sound, /localStorage\.getItem\(STORAGE_KEY\) !== 'off'/);
});

test('service labels are not reimplemented outside their domain helper', async () => {
  const offenders = [];
  for (const file of await sourceFiles('src', ['.ts', '.svelte'])) {
    if (file.endsWith(path.join('calendar', 'date.ts'))) continue;
    const source = await readFile(file, 'utf8');
    if (/'lunch'\s*\?\s*'Lunch'\s*:\s*'Evening'/.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});
