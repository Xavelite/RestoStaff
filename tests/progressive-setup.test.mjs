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
  const migration = await readFile('supabase/migrations/20260725193000_progressive_setup_and_employee_archive.sql', 'utf8');
  assert.match(migration, /drop trigger if exists employee_legal_profiles_niss_change_guard/);
  assert.match(migration, /drop constraint if exists employee_legal_profiles_niss_length/);
  assert.match(migration, /drop constraint if exists restaurants_company_number_format/);
  assert.match(migration, /where public\.is_valid_belgian_niss\(national_registry_number\)/);
  assert.match(migration, /create trigger employees_archive_side_effects/);
  assert.match(migration, /set access_status = 'disabled', badge_enabled = false/);
  assert.match(migration, /update public\.recurring_schedule_slots/);
  assert.match(migration, /status = 'revoked'/);
});

test('Schedule uses one premium week header and a split lunch/evening planning canvas', async () => {
  const schedule = await readFile('src/routes/(app)/schedule/+page.svelte', 'utf8');
  const nav = await readFile('src/lib/classic/classic-nav.ts', 'utf8');
  assert.doesNotMatch(schedule, /<ClassicTablePanel/);
  assert.match(schedule, /type Density = 'compact' \| 'detailed'/);
  assert.match(schedule, /type GroupMode = 'none' \| 'contract' \| 'position' \| 'area'/);
  assert.match(schedule, /class="service-canvas"/);
  assert.match(schedule, /class="service-zone is-\{service\} is-\{tone\}"/);
  assert.match(schedule, /quickPlan/);
  assert.match(schedule, /Republish/);
  assert.match(schedule, /planningOverlapKeys/);
  assert.doesNotMatch(schedule, /Review & publish/);
  assert.doesNotMatch(nav, /\/schedule\/publish/);
  assert.doesNotMatch(schedule, /PLANNED/);
});


test('schedule republish migration keeps published weeks auditable and rejects overlaps', async () => {
  const migration = await readFile(
    'supabase/migrations/20260725211500_schedule_republish_and_overlap_guard.sql',
    'utf8'
  );
  assert.match(migration, /v_current\.planning_status = ''published'' and v_status = ''published''/);
  assert.match(migration, /Overlapping shifts must be resolved before publishing/);
  assert.match(migration, /A republish is an audited planning publication/);
  assert.doesNotMatch(migration, /Revert the published plan to draft before publishing it again/);
});


test('availability remains editable after schedule publication', async () => {
  const migration = await readFile(
    'supabase/migrations/20260725214500_availability_remains_editable_after_publish.sql',
    'utf8'
  );
  assert.match(migration, /create or replace function public\.save_employee_availability/);
  assert.doesNotMatch(migration, /Availability is locked once the week is published/);
  assert.match(migration, /delete from public\.employee_availability_slots/);
  assert.match(migration, /employee_availability_submissions/);
});
