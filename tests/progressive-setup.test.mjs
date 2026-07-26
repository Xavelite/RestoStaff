import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  belgianNissIssue,
  isValidBelgianNiss
} from '../src/lib/team/belgian-identifiers.ts';
import {
  enterpriseNumberIssue,
  establishmentUnitIssue,
  isValidBelgianEnterpriseNumber,
  jointCommitteeIssue
} from '../src/lib/restaurant/belgian-identifiers.ts';

test('Belgian identifiers are optional drafts and valid official values are recognized', () => {
  assert.equal(belgianNissIssue(''), null);
  assert.equal(belgianNissIssue('123'), 'The national registry or BIS number should contain 11 digits.');
  assert.equal(isValidBelgianNiss('900101-001.23'), true);
  assert.equal(isValidBelgianNiss('90010100124'), false);

  assert.equal(enterpriseNumberIssue(''), null);
  assert.equal(isValidBelgianEnterpriseNumber('0123.456.749'), true);
  assert.equal(enterpriseNumberIssue('0123456748'), 'The Belgian company number is not valid yet.');
  assert.equal(establishmentUnitIssue('2123456789'), null);
  assert.equal(establishmentUnitIssue('123'), 'The establishment unit number should contain 10 digits.');
  assert.equal(jointCommitteeIssue('302'), null);
  assert.equal(jointCommitteeIssue('302.00'), null);
  assert.ok(jointCommitteeIssue('CP302'));
});

test('DEV migration makes identifiers nonblocking and archives safely', async () => {
  const migration = await readFile('supabase/migrations/20260725184052_progressive_setup_and_employee_archive.sql', 'utf8');
  assert.match(migration, /drop trigger if exists employee_legal_profiles_niss_change_guard/);
  assert.match(migration, /drop constraint if exists employee_legal_profiles_niss_length/);
  assert.match(migration, /drop constraint if exists restaurants_company_number_format/);
  assert.match(migration, /where public\.is_valid_belgian_niss\(national_registry_number\)/);
  assert.match(migration, /create trigger employees_archive_side_effects/);
  assert.match(migration, /set access_status = 'disabled', badge_enabled = false/);
  assert.match(migration, /update public\.recurring_schedule_slots/);
  assert.match(migration, /status = 'revoked'/);
});

test('Schedule uses one premium week header and one full daily card with internal service occupancy', async () => {
  const schedule = await readFile('src/routes/(app)/schedule/+page.svelte', 'utf8');
  const editor = await readFile('src/lib/schedule/ScheduleSlotEditor.svelte', 'utf8');
  const dialog = await readFile('src/lib/components/Dialog.svelte', 'utf8');
  const nav = await readFile('src/lib/classic/classic-nav.ts', 'utf8');
  assert.doesNotMatch(schedule, /<ClassicTablePanel/);
  assert.doesNotMatch(schedule, /type Density|rst-schedule-density|is-detailed/);
  assert.match(schedule, /type GroupMode = 'none' \| 'contract' \| 'position' \| 'area'/);
  assert.match(schedule, /class="service-canvas"/);
  assert.match(schedule, /class="service-zone is-\{service\} is-\{tone\}"/);
  assert.match(schedule, /class="day-card"/);
  assert.match(schedule, /class="day-card__surface"/);
  assert.match(schedule, /class="day-card__fill is-lunch"/);
  assert.match(schedule, /class="day-card__fill is-evening"/);
  assert.match(schedule, /function dayCardView/);
  assert.match(schedule, /`\$\{clockLabel\(first\.startsAt\)\}–\$\{clockLabel\(last\.endsAt\)\}`/);
  assert.doesNotMatch(schedule, /function compact/);
  assert.match(schedule, /class="day-card__content"/);
  assert.match(schedule, /class="day-card__metrics"/);
  assert.match(schedule, /class="day-card__compact-meta"/);
  assert.match(schedule, /class="day-card__compact-hours"/);
  assert.match(schedule, /class="day-card__compact-areas"/);
  assert.match(schedule, /rst-schedule-card-density/);
  assert.match(schedule, /class:is-compact=\{compactCards\}/);
  assert.match(schedule, /breakLabel = t\('No break'\)/);
  assert.match(schedule, /breakValue = formatHours/);
  assert.match(schedule, /t\('\{hours\} break', \{ hours: breakValue \}\)/);
  assert.match(schedule, /class="day-card__conflict-dot"/);
  assert.match(schedule, /chip\.estimatedCost\} · ~\{chip\.estimatedCost\}/);
  assert.match(schedule, /class="day-card__service-row is-\{chip\.service\}"/);
  assert.match(schedule, /class="day-card__service-row is-\{service\} is-empty"/);
  assert.match(schedule, /const totalCost = shiftsCost\(dayEntries\)/);
  assert.match(schedule, /const plannedCost = shiftsCost/);
  assert.match(schedule, /restaurantWeather\.dailyFor\(day\.date\)/);
  assert.match(schedule, /<WeatherIcon code=\{weather\.code\}/);
  assert.match(schedule, /metaParts=\{compactCards[\s\S]*\[formatHours\(weekHours\)\]/);
  assert.match(schedule, /role="switch"[\s\S]*checked=\{!compactCards\}/);
  assert.match(schedule, /<span>\{t\('Details'\)\}<\/span>/);
  assert.match(schedule, /\{#if !compactCards\}<em>\{plannedCost/);
  assert.match(schedule, /label=\{`\$\{plannedEmployeeIds\.size\}\/\$\{totalEmployeeIds\.size\}`\}/);
  assert.match(schedule, /labelIcon="people"/);
  assert.match(schedule, /const dayEmployees = new Set/);
  assert.match(schedule, /await confirmAction\(\{/);
  assert.match(schedule, /empty slots will be filled/);
  assert.match(schedule, /replaceDraftWithHoursGuard\(\[\.\.\.scheduleDraft\.shifts, \.\.\.additions\]\)/);
  assert.match(schedule, /function contractOverages\(/);
  assert.match(schedule, /Exceed contracted hours\?/);
  assert.match(schedule, /class="staff__meter is-\{hoursState\}"/);
  assert.match(schedule, /class="staff__overage"/);
  assert.match(schedule, /Contract overages/);
  assert.match(schedule, /class="board__day-metric board__weather-metric"/);
  assert.doesNotMatch(schedule, /class="today-link"/);
  assert.match(schedule, /\.board__day \{ border-left: 1px solid var\(--cl-grid-line\)/);
  assert.match(schedule, /\.board th \{ height: 66px/);
  assert.match(schedule, /\.board th\.has-menu \{ padding: 0; \}/);
  assert.match(schedule, /\.day-card \{[^}]*border-radius: 3px/s);
  assert.match(schedule, /editable=\{week\.editable && selectedSlot\.date >= week\.today\}/);
  assert.match(schedule, /flush[\s\S]*<ScheduleSlotEditor/);
  assert.match(editor, /class="context-strip"/);
  assert.match(editor, /class="shift-summary"/);
  assert.match(editor, /estimatedCost > 0 \? `~\$\{money\(estimatedCost\)\}`/);
  assert.doesNotMatch(editor, /linear-gradient|radial-gradient/);
  assert.match(dialog, /class:is-flush=\{flush\}/);
  assert.doesNotMatch(schedule, /box-shadow: inset 3px 0 0|box-shadow: inset -3px 0 0/);
  assert.doesNotMatch(schedule, /day-card__warning|day-card__overlap-label/);
  assert.doesNotMatch(schedule, /class="day-card__split-content"/);
  assert.doesNotMatch(schedule, /class="day-card__segment/);
  assert.doesNotMatch(schedule, /class="shift-card/);
  assert.doesNotMatch(schedule, /class="shift-layer/);
  assert.match(schedule, /quickPlan/);
  assert.match(schedule, /Republish/);
  assert.match(schedule, /planningOverlapKeys/);
  assert.doesNotMatch(schedule, /Review & publish/);
  assert.doesNotMatch(nav, /\/schedule\/publish/);
  assert.doesNotMatch(schedule, /PLANNED/);
});


test('schedule republish migration keeps published weeks auditable and rejects overlaps', async () => {
  const migration = await readFile(
    'supabase/migrations/20260725204425_schedule_republish_and_overlap_guard.sql',
    'utf8'
  );
  assert.match(migration, /v_current\.planning_status = ''published'' and v_status = ''published''/);
  assert.match(migration, /Overlapping shifts must be resolved before publishing/);
  assert.match(migration, /A republish is an audited planning publication/);
  assert.doesNotMatch(migration, /Revert the published plan to draft before publishing it again/);
});

test('planning operational setup concerns are confirmable warnings, not publication blockers', async () => {
  const migration = await readFile(
    'supabase/migrations/20260726230144_planning_operational_warning_contract.sql',
    'utf8'
  );
  assert.match(migration, /Planning operational warning guard contract drifted/);
  assert.match(migration, /Published shifts require valid start and end times/);
  assert.match(migration, /replace\(v_definition, v_old_guard, v_new_guard\)/);
  assert.match(
    migration,
    /save_manager_planning\(uuid,date,text,jsonb,jsonb,bigint,text,boolean,boolean\)/
  );
});

test('venue saves preserve one stable reservation room per work area', async () => {
  const migration = await readFile(
    'supabase/migrations/20260726230651_restore_venue_room_identity.sql',
    'utf8'
  );
  const editor = await readFile(
    'src/lib/reservations/ReservationFloorPlansWorkspace.svelte',
    'utf8'
  );
  assert.match(migration, /and area\.active/);
  assert.match(migration, /on conflict \(restaurant_id, work_area_id\) do update/);
  assert.match(migration, /Reservation floor-plan room upsert contract drifted/);
  assert.match(editor, /const activeAreaIds = new Set/);
  assert.match(
    editor,
    /mode === 'venue' && activeAreaIds\.has\(room\.work_area_id\) \? true : room\.active/
  );
});

test('workspace catalogue normalizes position links and preserves multi-restaurant ownership', async () => {
  const catalogueMigration = await readFile(
    'supabase/migrations/20260726232311_workspace_area_position_catalogue.sql',
    'utf8'
  );
  const uniquenessMigration = await readFile(
    'supabase/migrations/20260726232707_workspace_catalogue_uniqueness.sql',
    'utf8'
  );
  assert.match(catalogueMigration, /create table public\.job_function_areas/);
  assert.match(catalogueMigration, /job_function_areas_job_function_fk/);
  assert.match(catalogueMigration, /job_function_areas_area_fk/);
  assert.match(catalogueMigration, /alter table public\.job_function_areas enable row level security/);
  assert.match(catalogueMigration, /add column catalogue_key text/);
  assert.match(catalogueMigration, /insert into public\.restaurant_memberships/);
  assert.doesNotMatch(catalogueMigration, /v_owner_employee_id/);
  assert.doesNotMatch(catalogueMigration, /insert into public\.coverage_requirements/);
  assert.match(uniquenessMigration, /create index if not exists restaurants_owner_profile_id_idx/);
  assert.doesNotMatch(
    uniquenessMigration,
    /create unique index if not exists restaurants_owner_profile_id_idx/
  );
  assert.match(
    uniquenessMigration,
    /work_areas_restaurant_catalogue_key_idx[\s\S]*where catalogue_key is not null/
  );
  assert.match(
    uniquenessMigration,
    /job_functions_restaurant_catalogue_key_idx[\s\S]*where catalogue_key is not null/
  );
});

test('owners can launch another restaurant and switch directly to it', async () => {
  const onboarding = await readFile('src/routes/onboarding/+page.svelte', 'utf8');
  const accountMenu = await readFile('src/lib/app-shell/AccountMenu.svelte', 'utf8');
  assert.match(onboarding, /page\.url\.searchParams\.get\('new'\) === '1'/);
  assert.match(onboarding, /workspace\.memberships\.some\(\s*\(membership\) => membership\.role === 'owner'/);
  assert.match(onboarding, /await workspace\.select\(createdRestaurantId\)/);
  assert.match(accountMenu, /goto\('\/onboarding\?new=1'\)/);
  assert.match(accountMenu, /membership\.status === 'active' && membership\.role === 'owner'/);
});


test('availability remains editable after schedule publication', async () => {
  const migration = await readFile(
    'supabase/migrations/20260725204824_availability_remains_editable_after_publish.sql',
    'utf8'
  );
  assert.match(migration, /create or replace function public\.save_employee_availability/);
  assert.doesNotMatch(migration, /Availability is locked once the week is published/);
  assert.match(migration, /delete from public\.employee_availability_slots/);
  assert.match(migration, /employee_availability_submissions/);
});
