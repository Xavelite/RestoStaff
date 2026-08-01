import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  badgePolicyFromSettings,
  DEFAULT_BADGE_POLICY,
  parseBadgePolicy,
  photoRequiredForAction
} from '../src/lib/badge/badge-policy.ts';

test('badge policy parsers default safely and preserve independent evidence choices', () => {
  assert.deepEqual(parseBadgePolicy(null), DEFAULT_BADGE_POLICY);
  const policy = parseBadgePolicy({
    photo_clock_in_required: true,
    photo_clock_out_required: false,
    location_capture_enabled: true,
    employee_mobile_badging_enabled: true,
    revision: 4
  });
  assert.equal(photoRequiredForAction(policy, 'in'), true);
  assert.equal(photoRequiredForAction(policy, 'out'), false);
  assert.equal(policy.locationCaptureEnabled, true);
  assert.equal(policy.employeeMobileBadgingEnabled, true);
  assert.equal(policy.revision, 4);

  assert.deepEqual(
    badgePolicyFromSettings({
      badge_photo_clock_in_required: false,
      badge_photo_clock_out_required: true,
      badge_location_capture_enabled: false,
      employee_mobile_badging_enabled: true,
      badge_policy_revision: 9
    }),
    {
      photoClockInRequired: false,
      photoClockOutRequired: true,
      locationCaptureEnabled: false,
      employeeMobileBadgingEnabled: true,
      revision: 9
    }
  );
});

test('badging migration enforces evidence on old and new clients and keeps self badging self-only', async () => {
  const migration = await readFile(
    'supabase/migrations/20260801014427_complete_badging_policy_and_mobile_clock.sql',
    'utf8'
  );
  assert.match(migration, /create or replace function public\._badge_apply_evidence/);
  assert.match(migration, /create or replace function public\.record_badge_entry_station_v2/);
  assert.match(migration, /create or replace function public\.record_badge_entry_station\([\s\S]+_badge_apply_evidence/);
  assert.match(migration, /v_actor\.actor_role <> 'employee'/);
  assert.match(migration, /v_actor\.employee_id[\s\S]+_badge_record_core\([\s\S]+v_actor\.employee_id/);
  assert.match(migration, /if not public\.is_owner\(p_restaurant_id\)/);
  assert.match(migration, /revoke all on function public\.badge_policy_json/);
  assert.match(migration, /revoke all on function public\._badge_apply_evidence/);
});
