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

test('the app shell stays free of atmosphere imagery', async () => {
  // The single design is deliberately flat: no per-route background photos, no
  // gradients. This pins that the atmosphere layer stays retired.
  const layout = await readFile('src/routes/(app)/+layout.svelte', 'utf8');
  assert.doesNotMatch(layout, /module-backgrounds/);
  assert.doesNotMatch(layout, /data-atmosphere/);
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
  assert.match(login, /restogogo-mark\.png/);
  assert.match(login, /<i>esto<\/i><i>gogo<\/i>/);
  assert.match(login, /<h1 class="login__title">\{pageTitle\}<\/h1>/);
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

test('there is exactly one app shell, and it owns no account logic of its own', async () => {
  const shell = await readFile('src/routes/(app)/+layout.svelte', 'utf8');

  // One design, one shell: account settings and the session boundary stay in
  // their shared modules rather than leaking back into the layout.
  assert.match(shell, /import AccountMenu from '\$lib\/app-shell\/AccountMenu\.svelte'/);
  assert.match(shell, /useAppSession\(\)/);
  assert.doesNotMatch(shell, /supabase\.auth\.updateUser/);

  // The second design is gone for good — no route group, no switch.
  await assert.rejects(() => readFile('src/routes/(classic)/classic/+layout.svelte', 'utf8'));
  await assert.rejects(() => readFile('src/lib/classic/classic-routes.ts', 'utf8'));
});

test('tenant logos reach both badge terminal entry points and reject SVG uploads', async () => {
  const manager = await readFile('src/routes/(app)/badge-terminal/terminal/+page.svelte', 'utf8');
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

test('classic workspace chrome pins navigation and keeps page controls out of the topbar', async () => {
  const layout = await readFile('src/routes/(app)/+layout.svelte', 'utf8');
  const page = await readFile('src/lib/classic/ClassicPage.svelte', 'utf8');
  const chrome = await readFile('src/lib/classic/classic-chrome.svelte.ts', 'utf8');
  const css = await readFile('src/lib/classic/classic.css', 'utf8');

  assert.match(layout, /classicChrome\.tabs/);
  assert.doesNotMatch(layout, /classicChrome\.actions/);
  assert.match(layout, /\{#key `\$\{page\.url\.pathname\}\$\{page\.url\.search\}`\}[\s\S]*\{@render children\(\)\}[\s\S]*\{\/key\}/);
  assert.match(page, /class="cl-page__toolbar"/);
  assert.match(chrome, /tabs = \$state/);
  assert.doesNotMatch(chrome, /actions = \$state/);
  assert.match(css, /\.cl-topbar\s*\{[\s\S]*?position:\s*fixed;/);
  assert.match(css, /\.cl-sidebar\s*\{[\s\S]*?position:\s*fixed;/);
  assert.match(css, /\.cl-brand\s*\{[\s\S]*?position:\s*fixed;/);
});

test('people, contracts and payroll employees share direct rows and one complete employee dialog', async () => {
  const people = await readFile('src/routes/(app)/team/+page.svelte', 'utf8');
  const contracts = await readFile('src/routes/(app)/team/contracts/+page.svelte', 'utf8');
  const payrollEmployees = await readFile('src/routes/(app)/payroll/employees/+page.svelte', 'utf8');
  const editor = await readFile('src/lib/classic/EmployeeInlineEditor.svelte', 'utf8');
  const teamPage = await readFile('src/lib/classic/ClassicTeamPage.svelte', 'utf8');

  assert.match(people, /let groupBy = \$state<GroupBy>\('position'\)/);
  assert.match(contracts, /let groupBy = \$state<GroupBy>\('contract'\)/);
  assert.match(people, /oninput=.*teamDraft\.update\(employee\.id, \{ email:/s);
  assert.match(contracts, /setContractType\(employee, event\.currentTarget\.value\)/);
  assert.match(payrollEmployees, /setReferenceFunction\(employee, event\.currentTarget\.value\)/);
  for (const source of [people, contracts, payrollEmployees]) {
    assert.match(source, /<EmployeeInlineEditor/);
    assert.match(source, />\{t\('Details'\)\}<\/button>/);
  }
  assert.match(editor, /<Dialog/);
  assert.match(editor, /section === 'people'/);
  assert.match(editor, /section === 'contract'/);
  assert.match(editor, /EmployeePayrollDetails/);
  assert.match(teamPage, /saveEmployee/);
  assert.match(teamPage, /unsavedChanges\.register/);
});


test('operational core exposes planning, attendance and payroll as one classic workflow', async () => {
  const nav = await readFile('src/lib/classic/classic-nav.ts', 'utf8');
  const schedule = await readFile('src/routes/(app)/schedule/+page.svelte', 'utf8');
  const timesheet = await readFile('src/routes/(app)/timesheet/+page.svelte', 'utf8');
  const calendar = await readFile('src/routes/(app)/timesheet/calendar/+page.svelte', 'utf8');
  const live = await readFile('src/routes/(app)/timesheet/live/+page.svelte', 'utf8');
  const payrollRuns = await readFile('src/routes/(app)/payroll/+page.svelte', 'utf8');
  const payrollExports = await readFile('src/routes/(app)/payroll/exports/+page.svelte', 'utf8');
  const payrollConfig = await readFile('src/lib/payroll/RestaurantPayrollSetup.svelte', 'utf8');

  assert.match(nav, /\{ href: '\/payroll', label: 'Runs' \}/);
  assert.match(nav, /\{ href: '\/payroll\/exports', label: 'Exports' \}/);
  assert.match(nav, /homeOnly: true/);
  assert.match(schedule, /copyPreviousWeek/);
  assert.match(schedule, /planningCsv/);
  assert.match(schedule, /Only conflicts/);
  assert.match(timesheet, /page\.url\.searchParams\.get\('date'\)/);
  assert.match(timesheet, /page\.url\.searchParams\.get\('entry'\)/);
  assert.match(calendar, /href=\{`\/timesheet\?date=\$\{day\.date\}`\}/);
  assert.match(live, /entry=\$\{encodeURIComponent\(slot\.key\)\}/);
  assert.match(payrollRuns, /<PayrollWorkspace/);
  assert.match(payrollExports, /createPayrollExportRun/);
  assert.match(payrollExports, /id: 'payroll-export-columns'/);
  assert.match(payrollConfig, /class="cl-card"/);
  assert.doesNotMatch(payrollConfig, /class="payroll-setup"/);
});

test('restaurant coverage adds a complete weekday row before the shared save', async () => {
  const coverage = await readFile('src/routes/(app)/restaurant/coverage/+page.svelte', 'utf8');
  assert.match(coverage, /let newCounts = \$state<number\[]>\(WEEKDAYS\.map\(\(\) => 0\)\)/);
  assert.match(coverage, /WEEKDAYS\.map\(\(_, index\) => \(\{/);
  assert.match(coverage, /requiredCount: normalizedCount\(newCounts\[index\]\)/);
  assert.match(coverage, /duplicateNewRow/);
  assert.doesNotMatch(coverage, /coverageScope: 'default'/);
});

test('unsaved changes guard routes and context-changing account actions', async () => {
  const layout = await readFile('src/routes/(app)/+layout.svelte', 'utf8');
  const guard = await readFile('src/lib/navigation/unsaved-changes.svelte.ts', 'utf8');
  const account = await readFile('src/lib/app-shell/AccountMenu.svelte', 'utf8');
  const actions = await readFile('src/lib/app-shell/app-actions.ts', 'utf8');
  const scheduleWeek = await readFile('src/lib/classic/ClassicScheduleWeek.svelte', 'utf8');
  const myService = await readFile('src/routes/(app)/my-service/+page.svelte', 'utf8');
  const myTime = await readFile('src/routes/(app)/my-time/+page.svelte', 'utf8');
  const timesheetEditor = await readFile('src/lib/timesheet/TimesheetEntryEditor.svelte', 'utf8');
  const timesheet = await readFile('src/routes/(app)/timesheet/+page.svelte', 'utf8');
  const payrollSetup = await readFile('src/lib/payroll/RestaurantPayrollSetup.svelte', 'utf8');
  const payrollDetails = await readFile('src/lib/payroll/EmployeePayrollDetails.svelte', 'utf8');
  const access = await readFile('src/routes/(app)/team/access/+page.svelte', 'utf8');

  assert.match(layout, /beforeNavigate/);
  assert.match(layout, /navigation\.cancel\(\)/);
  assert.match(layout, /beforeunload/);
  assert.match(guard, /runOrRequest/);
  assert.match(guard, /const attempted = new Set<string>/);
  assert.match(guard, /if \(this\.hasDirty\)/);
  assert.match(account, /unsavedChanges\.runOrRequest/);
  assert.match(actions, /unsavedChanges\.runOrRequest/);
  assert.match(scheduleWeek, /unsavedChanges\.runOrRequest/);
  assert.match(myService, /unsavedChanges\.register/);
  assert.match(myTime, /unsavedChanges\.register/);
  assert.match(timesheetEditor, /id: 'timesheet-entry-editor'/);
  assert.match(timesheet, /selectEntry[\s\S]*unsavedChanges\.runOrRequest/);
  assert.match(timesheet, /closeEntry[\s\S]*unsavedChanges\.runOrRequest/);
  assert.match(payrollSetup, /id: 'restaurant-payroll-configuration'/);
  assert.match(payrollDetails, /id: `employee-payroll-details:\$\{employeeId\}`/);
  assert.match(access, /id: 'team-invitation'/);
});
