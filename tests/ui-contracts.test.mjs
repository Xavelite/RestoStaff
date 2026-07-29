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

test('the authenticated topbar uses the theme-aware brand mark and one line-icon family', async () => {
  const layout = await readFile('src/routes/(app)/+layout.svelte', 'utf8');
  const login = await readFile('src/routes/login/+page.svelte', 'utf8');
  const communications = await readFile('src/lib/communications/CommunicationCenter.svelte', 'utf8');
  const notifications = await readFile('src/lib/components/NotificationBell.svelte', 'utf8');
  const css = await readFile('src/lib/classic/classic.css', 'utf8');

  assert.match(layout, /class="cl-brand__mark"/);
  assert.match(layout, /--brand-mark:url\('\/brand\/restogogo-mark\.png'\)/);
  assert.match(css, /\.cl-brand__mark\s*\{[\s\S]*?mask:\s*var\(--brand-mark\)/);
  assert.match(login, /restogogo-mark\.png/);
  assert.match(login, /<i>esto<\/i><i>gogo<\/i>/);
  assert.match(login, /<h1 class="login__title">\{pageTitle\}<\/h1>/);
  assert.match(communications, /<svg viewBox="0 0 24 24"/);
  assert.match(notifications, /<svg viewBox="0 0 24 24"/);
  assert.doesNotMatch(`${communications}${notifications}`, /💬|🔔/u);
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
  // Read-only preview disables page mutations, but its own escape control must
  // remain interactive.
  assert.match(
    shell,
    /\.cl-main\.is-preview \.cl-notice button \{\s*pointer-events: auto;/
  );

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

test('classic workspace chrome pins navigation and derives tabs directly from the route', async () => {
  const layout = await readFile('src/routes/(app)/+layout.svelte', 'utf8');
  const page = await readFile('src/lib/classic/ClassicPage.svelte', 'utf8');
  const css = await readFile('src/lib/classic/classic.css', 'utf8');

  assert.match(layout, /const activeTabs = \$derived\(activeModule\?\.subNav \?\? \[\]\)/);
  assert.match(layout, /subNavItemForPath\(activeModule, page\.url\.pathname\)/);
  assert.doesNotMatch(layout, /classicChrome/);
  assert.match(layout, /\{@render children\(\)\}/);
  assert.doesNotMatch(layout, /#key `\$\{page\.url\.pathname\}\$\{page\.url\.search\}`/);
  assert.match(page, /class="cl-page__toolbar"/);
  assert.match(css, /\.cl-topbar\s*\{[\s\S]*?position:\s*fixed;/);
  assert.match(css, /\.cl-sidebar\s*\{[\s\S]*?position:\s*fixed;/);
  assert.match(css, /\.cl-brand\s*\{[\s\S]*?position:\s*fixed;/);
});

test('people edit contact cells inline while employee identity opens one complete dialog', async () => {
  const people = await readFile('src/routes/(app)/team/+page.svelte', 'utf8');
  const contracts = await readFile('src/routes/(app)/team/contracts/+page.svelte', 'utf8');
  const payrollEmployees = await readFile('src/routes/(app)/payroll/employees/+page.svelte', 'utf8');
  const editor = await readFile('src/lib/classic/EmployeeInlineEditor.svelte', 'utf8');
  const teamPage = await readFile('src/lib/classic/ClassicTeamPage.svelte', 'utf8');
  const teamDraft = await readFile('src/lib/classic/classic-team.svelte.ts', 'utf8');

  // Both grids take their view state from the shared table-view store.
  assert.match(people, /createTableView<SortKey, GroupBy>\([\s\S]*defaultGroupBy: 'position'/);
  assert.match(contracts, /createTableView<SortKey, GroupBy>\([\s\S]*defaultGroupBy: 'contract'/);
  // Pending identity belongs to the shared draft so every added row remains
  // editable and highlighted across Team subtab remounts.
  assert.match(teamDraft, /#pending = new PendingDraftIds\(\)/);
  assert.match(teamDraft, /add\(employee: EmployeeDraft\)/);
  assert.match(teamDraft, /isPending\(id: string\)/);
  assert.doesNotMatch(people, /freshIds/);
  assert.match(people, /\{@const isFresh = teamDraft\.isPending\(employee\.id\)\}/);
  assert.match(people, /class:is-new=\{isFresh\}/);
  assert.match(people, /\{#if isFresh\}[\s\S]*teamDraft\.update\(employee\.id, \{ email:/);
  assert.match(people, /class="inline-cell"[\s\S]*startInlineEdit\(employee, 'email'\)/);
  assert.match(people, /editingField === 'phone'[\s\S]*onblur=\{commitInlineEdit\}/);
  assert.match(contracts, /class="position-identity"/);
  assert.match(contracts, /<ClassicPicker[\s\S]*updateContractType\(employee, next\)/);
  assert.match(contracts, /type="date" value=\{employee\.contractStart\}[\s\S]*teamDraft\.update\(employee\.id, \{ contractStart:/);
  assert.match(contracts, /type="number"[\s\S]*updateHours\(employee\.id, event\.currentTarget\.value\)/);
  assert.match(payrollEmployees, /setReferenceFunction\(employee, next\)/);
  for (const source of [people, contracts, payrollEmployees]) {
    assert.match(source, /<EmployeeInlineEditor/);
    assert.match(source, /detailId/);
  }
  for (const source of [people, contracts, payrollEmployees]) {
    assert.match(source, /<ClassicRowMenu/);
  }
  assert.doesNotMatch(people, /<th[^>]*>\{t\('Actions'\)\}<\/th>/);
  assert.doesNotMatch(contracts, /<th[^>]*>\{t\('Actions'\)\}<\/th>/);
  assert.doesNotMatch(contracts, />\{t\('Open'\)\}<\/button>/);
  assert.match(editor, /<Dialog/);
  assert.match(editor, /section === 'people'/);
  assert.match(editor, /section === 'contract'/);
  assert.match(editor, /status-readonly/);
  assert.match(editor, /Archive employee/);
  assert.match(editor, /Advanced tax, benefit and regime-evidence settings are parked/);
  assert.match(teamPage, /saveEmployee/);
  assert.match(teamPage, /unsavedChanges\.register/);
});

test('Restaurant Areas is the visible floor editor and Positions edits physical links directly', async () => {
  const nav = await readFile('src/lib/classic/classic-nav.ts', 'utf8');
  const areasRoute = await readFile('src/routes/(app)/restaurant/areas/+page.svelte', 'utf8');
  const floorPlans = await readFile('src/lib/reservations/ReservationFloorPlansWorkspace.svelte', 'utf8');
  const positions = await readFile('src/routes/(app)/restaurant/positions/+page.svelte', 'utf8');
  const people = await readFile('src/routes/(app)/team/+page.svelte', 'utf8');

  assert.match(nav, /\{ href: '\/restaurant\/areas', label: 'Areas' \}/);
  assert.match(areasRoute, /mode="areas"/);
  assert.match(floorPlans, /mode\?: 'areas' \| 'tables'/);
  assert.match(floorPlans, /async function addArea\(/);
  assert.match(floorPlans, /<WorkspaceCataloguePicker/);
  assert.match(floorPlans, /<ClassicPicker[\s\S]*options=\{floorOptions\}/);
  assert.doesNotMatch(floorPlans, /<th>\{t\('Type'\)\}<\/th>/);
  assert.match(positions, /async function addPosition\(\)/);
  assert.match(positions, /data-position-name=\{position\.id\}/);
  assert.match(
    positions,
    /<ClassicColMenu[\s\S]*label=\{t\('Linked areas'\)\}/
  );
  assert.match(positions, /<PositionLinkedAreasField/);
  assert.match(positions, /onchange=\{\(areaIds\) => setPositionAreas\(position, areaIds\)\}/);
  assert.doesNotMatch(positions, /aria-label=\{t\('Primary area'\)\}/);
  assert.doesNotMatch(positions, /name="primary-position-area"/);
  assert.match(people, /function positionLinkedAreas\(positionId: string\)/);
  assert.match(people, /linkedAreas\.length > 1/);
  assert.doesNotMatch(people, /primaryAreaId/);
  assert.doesNotMatch(people, /relationship\.is_primary/);
  assert.doesNotMatch(people, /coverage_requirements/);
});


test('operational core exposes planning, attendance and payroll as one classic workflow', async () => {
  const nav = await readFile('src/lib/classic/classic-nav.ts', 'utf8');
  const schedule = await readFile('src/routes/(app)/schedule/+page.svelte', 'utf8');
  const timesheet = await readFile('src/routes/(app)/timesheet/+page.svelte', 'utf8');
  const calendar = await readFile('src/routes/(app)/timesheet/calendar/+page.svelte', 'utf8');
  const live = await readFile('src/routes/(app)/timesheet/live/+page.svelte', 'utf8');
  const reservations = await readFile('src/lib/reservations/ReservationsWorkspace.svelte', 'utf8');
  const payrollRedirect = await readFile('src/routes/(app)/payroll/+page.ts', 'utf8');
  const absences = await readFile('src/routes/(app)/team/absences/+page.svelte', 'utf8');

  assert.match(nav, /href: '\/payroll\/employees'/);
  assert.doesNotMatch(nav, /\{ href: '\/payroll', label: 'Overview' \}/);
  assert.doesNotMatch(nav, /\{ href: '\/payroll\/exports', label: 'Exports' \}/);
  assert.doesNotMatch(nav, /\{ href: '\/payroll\/configuration', label: 'Scope & settings' \}/);
  assert.match(nav, /homeOnly: true/);
  assert.match(schedule, /copyPreviousWeek/);
  assert.match(schedule, /planningCsv/);
  assert.match(schedule, /Only conflicts/);
  assert.match(timesheet, /page\.url\.searchParams\.get\('date'\)/);
  assert.match(timesheet, /page\.url\.searchParams\.get\('entry'\)/);
  assert.match(calendar, /href=\{`\/timesheet\?date=\$\{day\.date\}`\}/);
  assert.match(live, /entry=\$\{encodeURIComponent\(slot\.key\)\}/);
  assert.match(live, /<ClassicRowMenu/);
  assert.match(reservations, /<ClassicRowMenu/);
  assert.match(reservations, /<ClassicTablePanel>/);
  assert.match(reservations, /Online bookings off/);
  assert.match(reservations, /class="reservation-period"/);
  assert.match(reservations, /<ClassicPrimaryColMenu/);
  assert.match(reservations, /<ClassicColMenu/);
  assert.match(reservations, /showHeader=\{false\}/);
  assert.doesNotMatch(reservations, /Configure this service before taking bookings/);
  assert.doesNotMatch(reservations, /The same server-side availability check/);
  assert.doesNotMatch(reservations, /class="reservation-search"/);
  assert.doesNotMatch(reservations, /ontoday=/);
  assert.doesNotMatch(reservations, /class="reservation-summary"/);
  assert.doesNotMatch(reservations, /row-status-action/);
  assert.match(reservations, /const liveTableIds = new Set/);
  assert.match(reservations, /if \(reservation\.table_ids\.length\) return false/);
  assert.match(reservations, /!reservation\.room_preference_id \|\| liveRoomIds\.has/);
  assert.match(reservations, /t\('Unassigned'\)/);
  assert.match(payrollRedirect, /redirect\(307, '\/payroll\/employees'\)/);
  assert.match(absences, /href="\/settings\/absence-types"/);
  assert.doesNotMatch(absences, /href="\/restaurant\/absence-types"/);
  assert.match(absences, /\{#if allAbsences\.length\}\s*<thead>/);
});

test('Exports is a standalone manager module beside Reports', async () => {
  const nav = await readFile('src/lib/classic/classic-nav.ts', 'utf8');
  const exportsPage = await readFile('src/routes/(app)/exports/+page.svelte', 'utf8');

  assert.match(nav, /key: 'reports'[\s\S]*key: 'exports'/);
  assert.match(nav, /key: 'exports'[\s\S]*href: '\/exports'[\s\S]*roles: MANAGER[\s\S]*navSection: 'reports'/);
  assert.match(exportsPage, /planningPeriodCsv/);
  assert.match(exportsPage, /workedTimeCsv/);
  assert.match(exportsPage, /getExportOperationsReadModel/);
  assert.match(exportsPage, /MAX_EXPORT_DAYS/);
  assert.match(exportsPage, /previewSocialSecretariatCsv/);
  assert.match(exportsPage, /workspace\.effectiveRole === 'owner'/);
  assert.match(exportsPage, /disabled=\{!completeWeeks \|\| Boolean\(preparing\)\}/);
  assert.match(exportsPage, /social-secretariat file remains available/);
  assert.match(exportsPage, /ExportWizard/);
  assert.match(exportsPage, /configureExport\('planning'\)/);
  assert.match(exportsPage, /configureExport\('worked'\)/);
  assert.match(exportsPage, /configureExport\('social'\)/);
});

test('restaurant coverage stages only a complete weekday row, in place, before shared save', async () => {
  const coverage = await readFile('src/routes/(app)/restaurant/coverage/+page.svelte', 'utf8');
  assert.match(coverage, /counts: Array<number \| null>/);
  // Only area + position + service together make a row real.
  assert.match(coverage, /const complete = Boolean\(row\.areaId && row\.jobFunctionId && row\.serviceKey\)/);
  assert.match(coverage, /if \(!raw\.trim\(\)\)/);
  assert.match(coverage, /counts: WEEKDAYS\.map\(\(\) => null\)/);
  assert.match(coverage, /row\.counts\.flatMap\(\(count, index\) =>/);
  assert.match(coverage, /count == null[\s\S]*\? \[\]/);
  assert.match(coverage, /requiredCount: normalizedCount\(count\)/);
  assert.doesNotMatch(coverage, /coverageScope: 'default'/);
  // A row being filled in keeps its place: it stays in newRows and is hidden
  // from the grouped rows until a save or discard ends the add.
  assert.match(coverage, /stagedKey: string/);
  assert.match(coverage, /pendingKeys\.has\(rowKey\(row\)\)/);
  assert.match(coverage, /if \(wasDirty && !dirty && newRows\.length\) newRows = \[\]/);
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
  const access = await readFile('src/routes/(app)/team/access/+page.svelte', 'utf8');
  const reservationFloorPlans = await readFile('src/lib/reservations/ReservationFloorPlansWorkspace.svelte', 'utf8');
  const reservationSetup = await readFile('src/lib/reservations/ReservationSetupWorkspace.svelte', 'utf8');

  assert.match(layout, /beforeNavigate/);
  assert.match(layout, /navigation\.cancel\(\)/);
  assert.match(layout, /beforeunload/);
  assert.match(guard, /shouldBlockNavigation/);
  assert.match(guard, /navigationScopes/);
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
  assert.match(access, /id: 'team-invitation'/);
  assert.match(reservationFloorPlans, /id: mode === 'areas' \? 'restaurant-floor-layout' : 'reservation-table-layout'/);
  // The floor-plan draft outlives the view, so its guard is scoped to the tabs
  // that edit the same plan instead of blocking every navigation.
  assert.match(reservationFloorPlans, /isDirty: \(\) => floorPlansDraft\.dirty/);
  assert.match(
    reservationFloorPlans,
    /navigationScopes: \['\/restaurant', '\/settings', '\/reservations'\]/
  );
  assert.match(reservationSetup, /id: 'reservation-setup'/);
  assert.match(reservationSetup, /isDirty: \(\) => dirty/);
});

test('Team and Restaurant use one route-scoped workspace instead of mounting stale sibling pages', async () => {
  const teamLayout = await readFile('src/routes/(app)/team/+layout.svelte', 'utf8');
  const restaurantLayout = await readFile('src/routes/(app)/restaurant/+layout.svelte', 'utf8');
  const teamWrapper = await readFile('src/lib/classic/ClassicTeamPage.svelte', 'utf8');
  const restaurantWrapper = await readFile('src/lib/classic/ClassicRestaurantPage.svelte', 'utf8');
  const restaurantProfile = await readFile('src/routes/(app)/restaurant/+page.svelte', 'utf8');

  assert.match(teamLayout, /children: routeChildren[\s\S]*<ClassicTeamPage>[\s\S]*\{#key page\.url\.pathname\}[\s\S]*\{@render routeChildren\(\)\}/);
  assert.match(restaurantLayout, /children: routeChildren[\s\S]*<ClassicRestaurantPage>[\s\S]*\{#key page\.url\.pathname\}[\s\S]*\{@render routeChildren\(\)\}/);
  assert.match(teamWrapper, /setContext\(CLASSIC_TEAM_CONTEXT/);
  assert.match(restaurantWrapper, /setContext\(CLASSIC_RESTAURANT_CONTEXT/);

  for (const file of [
    'src/routes/(app)/team/+page.svelte',
    'src/routes/(app)/team/contracts/+page.svelte',
    'src/routes/(app)/team/access/+page.svelte',
    'src/routes/(app)/team/absences/+page.svelte'
  ]) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /useClassicTeamContext/);
    assert.doesNotMatch(source, /ClassicTeamPage/);
  }

  for (const file of [
    'src/routes/(app)/restaurant/+page.svelte',
    'src/routes/(app)/restaurant/areas/+page.svelte',
    'src/routes/(app)/restaurant/positions/+page.svelte',
    'src/routes/(app)/restaurant/coverage/+page.svelte'
  ]) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /useClassicRestaurantContext/);
    assert.doesNotMatch(source, /ClassicRestaurantPage/);
  }
  assert.match(restaurantProfile, /<table class="cl-table hours-table">/);
  assert.doesNotMatch(restaurantProfile, /<h2>\{t\('Weekly service periods'\)\}<\/h2>/);
});

test('Settings owns the canonical time-off policy workspace', async () => {
  const settingsPage = await readFile(
    'src/routes/(app)/settings/absence-types/+page.svelte',
    'utf8'
  );
  const workspace = await readFile(
    'src/lib/team/TimeOffPoliciesWorkspace.svelte',
    'utf8'
  );
  assert.match(
    settingsPage,
    /import TimeOffPoliciesWorkspace from '\$lib\/team\/TimeOffPoliciesWorkspace\.svelte'/
  );
  assert.match(settingsPage, /<TimeOffPoliciesWorkspace \/>/);
  assert.match(workspace, /<ClassicPrimaryColMenu/);
  assert.match(workspace, /rst-time-off-policies-cols-v1/);
  assert.match(workspace, /rst-restaurant-absence-types-cols-v2/);
});

test('Coverage inherits the same explicit grid contract as every classic table', async () => {
  const coverage = await readFile('src/routes/(app)/restaurant/coverage/+page.svelte', 'utf8');
  const css = await readFile('src/lib/classic/classic.css', 'utf8');

  assert.match(coverage, /<table class="cl-table cov">/);
  assert.doesNotMatch(coverage, /viewMode === 'map'/);
  assert.doesNotMatch(coverage, /<ReservationFloorPlan/);
  assert.doesNotMatch(coverage, /\.cov\s+(?:th|td)\s*\{[^}]*border\s*:/s);
  assert.match(css, /--cl-grid-line:\s*#[0-9a-f]{6}/i);
  assert.match(css, /\.cl-table\s*\{[^}]*border-collapse:\s*separate;[^}]*border-spacing:\s*0;/s);
  assert.match(css, /\.cl-table th:not\(:last-child\),\s*\.cl-table tbody td:not\(:last-child\)\s*\{\s*border-right:\s*1px solid var\(--cl-grid-line\)/s);
  assert.match(css, /\.cl-table td\s*\{[^}]*border-bottom:\s*1px solid var\(--cl-grid-line\)/s);
});

test('Home leads with the module workspace and keeps operations as a compact pulse', async () => {
  const home = await readFile('src/routes/(app)/home/+page.svelte', 'utf8');
  const payrollEmployees = await readFile('src/routes/(app)/payroll/employees/+page.svelte', 'utf8');
  assert.match(home, /buildHomeModel/);
  assert.match(home, /workspace\.loadOperations\(activeWeek, addDays\(activeWeek, 6\)\)/);
  assert.match(home, /\{t\('Restaurant modules'\)\}/);
  assert.match(home, /label: 'Run today'/);
  assert.match(home, /label: 'People & setup'/);
  assert.match(home, /label: 'Review & handoff'/);
  assert.match(home, /\{t\('Needs you'\)\}/);
  assert.match(home, /\{t\('Floor status'\)\}/);
  assert.match(home, /modulesForRole/);
  assert.ok(
    home.indexOf('<section class="workspace"') < home.indexOf('<div class="home-secondary">'),
    'module workspace should appear before the operational pulse'
  );
  assert.doesNotMatch(payrollEmployees, /<ClassicStat\b|class="cl-stats"/);
  assert.match(payrollEmployees, /<ClassicTablePanel/);
});

test('workspace grids share one sticky, searchable grouping and filtering contract', async () => {
  const css = await readFile('src/lib/classic/classic.css', 'utf8');
  const primary = await readFile('src/lib/classic/ClassicPrimaryColMenu.svelte', 'utf8');
  const groupMenu = await readFile('src/lib/classic/ClassicGroupMenu.svelte', 'utf8');
  const columnMenu = await readFile('src/lib/classic/ClassicColMenu.svelte', 'utf8');
  const groupRow = await readFile('src/lib/classic/ClassicGroupRow.svelte', 'utf8');

  assert.match(primary, /<ClassicGroupMenu/);
  assert.match(groupMenu, /class="colhead__trigger groupmenu__trigger"/);
  assert.match(groupMenu, /type="search"/);
  assert.match(columnMenu, /filterKind === 'text'/);
  assert.match(columnMenu, /filterKind === 'values'/);
  assert.match(columnMenu, /type="search"/);
  assert.match(columnMenu, /class="colhead__copy"/);
  assert.match(groupRow, /class="cl-group-row__button"/);
  assert.match(css, /\.cl-tablewrap\s*\{[\s\S]*?overflow:\s*auto;/);
  assert.match(css, /\.cl-table thead th\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*var\(--cl-grid-sticky-top, 0px\);/);
  assert.match(css, /\.cl-group-row td\s*\{[\s\S]*?height:\s*34px !important;/);
});

test('Planning, Team, Restaurant and Payroll use the same first-column grouping control', async () => {
  const groupedPages = [
    'src/routes/(app)/schedule/+page.svelte',
    'src/routes/(app)/team/+page.svelte',
    'src/routes/(app)/team/contracts/+page.svelte',
    'src/routes/(app)/team/access/+page.svelte',
    'src/routes/(app)/team/absences/+page.svelte',
    'src/routes/(app)/restaurant/positions/+page.svelte',
    'src/lib/team/TimeOffPoliciesWorkspace.svelte',
    'src/routes/(app)/restaurant/coverage/+page.svelte',
    'src/routes/(app)/payroll/employees/+page.svelte'
  ];

  for (const file of groupedPages) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /<ClassicPrimaryColMenu/);
    assert.match(source, /groupOptions=/);
    assert.match(source, /<ClassicGroupRow/);
    assert.doesNotMatch(source, /groupable|ongroup=|<tr class="cl-group-row">/);
  }

  const schedule = await readFile('src/routes/(app)/schedule/+page.svelte', 'utf8');
  assert.match(schedule, /t\('\{count\} employees', \{ count: group\.rows\.length \}\).*formatHours\(group\.hours\)/s);
});

test('Restaurant Areas is the direct-manipulation floor canvas instead of a duplicate data grid', async () => {
  const page = await readFile('src/routes/(app)/restaurant/areas/+page.svelte', 'utf8');
  const workspace = await readFile('src/lib/reservations/ReservationFloorPlansWorkspace.svelte', 'utf8');
  const canvas = await readFile('src/lib/reservations/ReservationFloorPlan.svelte', 'utf8');

  assert.match(page, /<ReservationFloorPlansWorkspace mode="areas"/);
  assert.doesNotMatch(page, /<ClassicTablePanel|<table/);
  assert.match(workspace, /const CANONICAL_FLOOR_LEVELS = \[-1, 0, 1, 2\] as const/);
  assert.match(workspace, /function persistedFloorName\(/);
  assert.doesNotMatch(workspace, /function addFloor\(\)/);
  assert.match(workspace, /async function addArea\(/);
  assert.match(workspace, /catalogueAreaItems/);
  assert.match(workspace, /onroomresize=/);
  assert.match(workspace, /onfloorresize=/);
  assert.match(workspace, /ROOM_GRID = 20/);
  assert.match(workspace, /TABLE_GRID = 10/);
  assert.doesNotMatch(workspace, /Auto layout|Narrower|Wider|Shallower|Deeper/);
  assert.match(canvas, /'top-left'/);
  assert.match(canvas, /'top-right'/);
  assert.match(canvas, /'bottom-right'/);
  assert.match(canvas, /'bottom-left'/);
  assert.match(canvas, /class="resize-handle is-\{edge\}"/);
  assert.match(canvas, /class="floor-resize is-\{edge\}"/);
  assert.match(canvas, /class="table-resize is-\{edge\}"/);
  assert.match(canvas, /class="snap-guide is-vertical"/);
  assert.match(canvas, /class="floor-ruler is-horizontal"/);
  assert.match(canvas, /class="floor-ruler is-vertical"/);
  assert.match(workspace, /let editorView = \$state<'plan' \| 'list'>\('list'\)/);
  assert.match(workspace, /function resizeTable\(/);
  assert.match(workspace, /onresize=/);
  assert.doesNotMatch(canvas, /Floor plan zoom|zoom-value/);
});

test('Home integrates labelled upcoming modules while Areas and Tables stay separate', async () => {
  const home = await readFile('src/routes/(app)/home/+page.svelte', 'utf8');
  const nav = await readFile('src/lib/classic/classic-nav.ts', 'utf8');
  const layout = await readFile('src/routes/(app)/+layout.svelte', 'utf8');
  const areas = await readFile('src/lib/reservations/ReservationFloorPlansWorkspace.svelte', 'utf8');

  // Modules that do not exist yet are named in one quiet line rather than
  // taking half of Home as placeholder tiles.
  assert.match(home, /module\.key !== 'home' && !module\.placeholder/);
  assert.match(home, /modulesForRole\(role\)\.filter\(\(module\) => module\.placeholder\)/);
  assert.match(home, /\{t\('Coming next'\)\}/);
  assert.doesNotMatch(home, /tile--upcoming/);
  assert.match(nav, /\/restaurant\/areas', label: 'Areas'/);
  assert.match(nav, /\/reservations\/floor-plans', label: 'Tables'/);
  const reportsBlock = nav.match(/key: 'reports'[\s\S]*?  \},/)?.[0] ?? '';
  assert.match(reportsBlock, /subNav:/);
  assert.doesNotMatch(reportsBlock, /placeholder|homeOnly/);
  assert.doesNotMatch(layout, /#key `\$\{page\.url\.pathname\}\$\{page\.url\.search\}`/);
  assert.match(areas, /editorReadOnly = \$derived\(workspace\.isPreview\)/);
  assert.match(
    areas,
    /planGeometryReadOnly = \$derived\(compactViewport \|\| workspace\.isPreview\)/
  );
  assert.match(areas, /editable=\{!planGeometryReadOnly\}/);
  assert.match(areas, /tablesEditable=\{mode === 'tables' && !planGeometryReadOnly\}/);
  assert.match(areas, /Details remain editable/);
});
