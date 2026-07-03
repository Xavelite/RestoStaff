import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const allowedBreakpoints = new Set(['1180', '980', '760', '520']);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(target)));
    else if (target.endsWith('.svelte') || target.endsWith('.css')) files.push(target);
  }
  return files;
}

test('responsive CSS uses only the official breakpoint ladder', async () => {
  const files = await sourceFiles('src');
  const violations = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)) {
      if (!allowedBreakpoints.has(match[1])) violations.push(`${file}:${match[1]}px`);
    }
  }
  assert.deepEqual(violations, []);
});

test('manager operations boards pair service lanes through one shared board', async () => {
  const source = await readFile('src/lib/components/OperationsBoard.svelte', 'utf8');
  const planning = await readFile('src/routes/(app)/planning/+page.svelte', 'utf8');
  const actuals = await readFile('src/routes/(app)/actuals/+page.svelte', 'utf8');
  assert.match(source, /export type BoardServiceCard/);
  assert.match(source, /serviceCardsFor/);
  assert.match(source, /\.roster-day\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,/);
  assert.match(source, /StaffChip/);
  assert.match(planning, /<OperationsBoard/);
  assert.match(actuals, /<OperationsBoard/);
  assert.doesNotMatch(source, /ServiceSlotButton/);
});

test('populated service slots use one card-owned content layer', async () => {
  const surface = await readFile('src/lib/components/ServiceSlotSurface.svelte', 'utf8');
  const month = await readFile('src/lib/components/MonthBoard.svelte', 'utf8');

  assert.match(surface, /\{#if !presentation\.card\}[\s\S]*class="service"/);
  assert.match(surface, /class="slot__card[\s\S]*class="service"/);
  assert.match(surface, /\.slot__card\s*\{[\s\S]*inset:\s*3px/);
  assert.doesNotMatch(surface, /inset:\s*17px/);
  assert.match(month, /\.day__items\s*\{[\s\S]*flex:\s*1/);
});

test('page headers own context modules, optional exact-four metrics and never own actions', async () => {
  const header = await readFile('src/lib/components/PageHeader.svelte', 'utf8');
  const metrics = await readFile('src/lib/components/PageHeaderMetrics.svelte', 'utf8');
  const metricType = await readFile('src/lib/ui/metric.ts', 'utf8');
  const scaffold = await readFile('src/lib/components/PageScaffold.svelte', 'utf8');
  const workbench = await readFile('src/lib/components/Workbench.svelte', 'utf8');
  const appShell = await readFile('src/routes/(app)/+layout.svelte', 'utf8');
  assert.match(header, /PageHeaderMetrics/);
  assert.match(header, /aside\?:\s*Snippet/);
  assert.match(header, /\{@render aside\(\)\}/);
  assert.doesNotMatch(header, /header__actions|actions\?:\s*Snippet/);
  assert.match(metricType, /readonly\s*\[\s*Metric,\s*Metric,\s*Metric,\s*Metric\s*\]/);
  assert.match(metrics, /metrics\.length\s*!==\s*4/);
  assert.doesNotMatch(metrics, /\.slice\(0,\s*4\)/);
  for (const source of [scaffold, workbench, appShell]) {
    assert.doesNotMatch(source, /Desktop full-screen workspace gate|height:\s*100dvh|height:\s*100%;[\s\S]*overflow:\s*auto/);
  }
});

test('calendar modules use the shared toolbar regions', async () => {
  const toolbar = await readFile('src/lib/components/Toolbar.svelte', 'utf8');
  const actionMenu = await readFile('src/lib/components/ActionMenu.svelte', 'utf8');
  assert.match(toolbar, /search\?:\s*Snippet/);
  assert.match(toolbar, /navigation\?:\s*Snippet/);
  assert.match(toolbar, /tools\?:\s*Snippet/);
  assert.match(toolbar, /actions\?:\s*Snippet/);
  assert.doesNotMatch(toolbar, /primary:\s*Snippet|secondary\?:\s*Snippet/);
  // The action row is guarded so an all-empty toolbar never renders a bare bar.
  assert.match(
    toolbar,
    /\{#if search \|\| filters \|\| navigation \|\| tools \|\| actions\}[\s\S]*class="toolbar__row"/
  );
  assert.match(actionMenu, /aria-haspopup="menu"/);
  assert.match(actionMenu, /role="menuitem"/);
  assert.doesNotMatch(actionMenu, /<summary/);
});

test('export is one shared wizard (PDF + CSV) across Planning and Actuals', async () => {
  const dialog = await readFile('src/lib/components/ExportDialog.svelte', 'utf8');
  const planning = await readFile('src/routes/(app)/planning/+page.svelte', 'utf8');
  const actuals = await readFile('src/routes/(app)/actuals/+page.svelte', 'utf8');
  const planningExport = await readFile('src/lib/planning/planning-export.ts', 'utf8');
  const payrollExport = await readFile('src/lib/payroll/payroll-export.ts', 'utf8');
  // The wizard owns the column editor; pages must not re-implement it.
  assert.match(dialog, /Add a column/);
  assert.match(dialog, /Spreadsheet preview/);
  assert.match(dialog, /export__layout\.has-preview/);
  for (const page of [planning, actuals]) {
    assert.match(page, /<ExportDialog/);
    assert.match(page, /Export PDF/);
    assert.match(page, /Export CSV/);
  }
  // Route pages ask their domain owner for export projection/defaults instead of
  // rebuilding CSV rows or JSON setting casts inline.
  assert.match(planning, /planningCsv/);
  assert.match(planningExport, /planned_shifts \+/);
  assert.match(actuals, /payrollColumnsFromSettings/);
  assert.match(actuals, /payrollRunHistoryItems/);
  assert.match(payrollExport, /normalizePayrollColumns/);
});

test('lifecycle history is shared data with always-visible module timelines', async () => {
  const history = await readFile('src/lib/components/WeekHistory.svelte', 'utf8');
  const planning = await readFile('src/routes/(app)/planning/+page.svelte', 'utf8');
  const actuals = await readFile('src/routes/(app)/actuals/+page.svelte', 'utf8');
  const historyModel = await readFile('src/lib/calendar/week-history.ts', 'utf8');
  // The shared model owns event labels/newest-first projection. Generic pages may
  // use WeekHistory directly; high-touch pages can render a custom timeline as
  // long as they do not reimplement lifecycle event truth.
  assert.match(history, /No logged activity yet/);
  assert.match(history, /\.slice\(0,\s*limit\)/);
  assert.match(history, /import type \{ WeekHistoryItem \}/);
  assert.match(historyModel, /workWeekHistoryItems/);
  assert.match(actuals, /<WeekHistory items=\{historyItems\}/);
  assert.match(planning, /class="week-trail"/);
  assert.match(planning, /historyItems\.slice\(0,\s*4\)/);
  for (const page of [planning, actuals]) {
    assert.doesNotMatch(page, /\{#if historyItems\.length\}/);
    assert.match(page, /workWeekHistoryItems/);
    assert.doesNotMatch(page, /workWeekEventLabel/);
  }
});

test('single neutral service skin is the only active theme contract', async () => {
  const tokens = await readFile('src/lib/styles/tokens.css', 'utf8');
  const layout = await readFile('src/routes/(app)/+layout.svelte', 'utf8');
  assert.match(layout, /Visual style/);
  assert.doesNotMatch(layout, /const THEMES =|role="menuitemradio"|theme-menu/);
  assert.doesNotMatch(tokens, /\[data-theme='(?:classic|graphite|light)'\]/);
  assert.match(tokens, /--rst-ui-bg:\s*#f4ede0/);
  assert.match(tokens, /--rst-topbar-bg:\s*#1b1f23/);
  assert.match(tokens, /--rst-topbar-active-bg:\s*rgba\(240,100,35,.22\)/);
});

test('service-key labels come from the shared serviceLabel helper', async () => {
  async function walk(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await walk(target)));
      else if (/\.(ts|svelte)$/.test(target)) out.push(target);
    }
    return out;
  }
  const offenders = [];
  for (const file of await walk('src')) {
    if (file.endsWith(path.join('calendar', 'date.ts'))) continue; // the helper's home
    const source = await readFile(file, 'utf8');
    if (/'lunch'\s*\?\s*'Lunch'\s*:\s*'Evening'/.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test('team and restaurant readiness live in command surfaces, not old readiness tabs', async () => {
  const team = await readFile('src/routes/(app)/team/+page.svelte', 'utf8');
  const restaurant = await readFile('src/routes/(app)/restaurant/+page.svelte', 'utf8');
  assert.match(team, /class="people-command"/);
  assert.match(restaurant, /class="foundation-strip"/);
  assert.doesNotMatch(team, /tab === 'Readiness'/);
  assert.doesNotMatch(restaurant, /tab === 'Readiness'/);
  assert.doesNotMatch(team, /<SetupGuide/);
  assert.doesNotMatch(restaurant, /<SetupGuide/);
  assert.doesNotMatch(team, /team-overview/);
  assert.doesNotMatch(restaurant, /setup-guide/);
});
