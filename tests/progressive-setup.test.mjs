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

test('Schedule uses the shared dirty panel and a dense compact or detailed board', async () => {
  const schedule = await readFile('src/routes/(app)/schedule/+page.svelte', 'utf8');
  assert.match(schedule, /<ClassicTablePanel/);
  assert.match(schedule, /type Density = 'compact' \| 'detailed'/);
  assert.match(schedule, /buildAreaColorMap/);
  assert.match(schedule, /draggable=\{week\.editable/);
  assert.match(schedule, /Review & publish/);
  assert.doesNotMatch(schedule, /<ClassicPage\s+actions=/);
  assert.doesNotMatch(schedule, /PLANNED/);
});
