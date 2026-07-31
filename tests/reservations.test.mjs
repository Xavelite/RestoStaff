import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const {
  parseAvailability,
  parseReservationFloorPlans,
  parseReservationSetup,
  parseReservationWorkspace
} = await import('../src/lib/reservations/reservation-types.ts');
const {
  RESERVATION_STATUSES,
  RESERVATION_STATUS,
  reservationIsCurrentAt,
  reservationIsTerminal,
  reservationNextStatuses,
  reservationStatusMeta
} = await import('../src/lib/reservations/reservation-status.ts');
const { moduleForPath, subNavItemForPath } = await import('../src/lib/workspace-ui/workspace-nav.ts');

test('reservation navigation is a live workspace with setup beneath it', () => {
  const reservations = moduleForPath('/reservations');
  assert.equal(reservations?.key, 'reservations');
  assert.equal(reservations?.href, '/reservations');
  assert.equal(subNavItemForPath(reservations, '/reservations')?.href, '/reservations');
  assert.equal(
    subNavItemForPath(reservations, '/reservations/bookings')?.href,
    '/reservations/bookings'
  );
  assert.equal(
    reservations?.subNav?.some((item) => item.href === '/reservations/floor-plans'),
    false
  );
  assert.equal(
    subNavItemForPath(reservations, '/reservations/setup')?.href,
    '/reservations/setup'
  );
  assert.equal(
    subNavItemForPath(reservations, '/reservations/api')?.href,
    '/reservations/api'
  );
});

test('every reservation lifecycle status has one centralized visual definition', () => {
  assert.deepEqual(Object.keys(RESERVATION_STATUS), RESERVATION_STATUSES);
  for (const status of RESERVATION_STATUSES) {
    const meta = reservationStatusMeta(status);
    assert.ok(meta.label);
    assert.ok(meta.tone);
    assert.ok(meta.symbol);
  }
});

test('reservation JSON parsers provide stable safe defaults', () => {
  assert.deepEqual(parseReservationWorkspace({}), {
    restaurantId: '',
    businessDate: '',
    timezone: 'Europe/Brussels',
    services: [],
    rooms: [],
    tables: [],
    reservations: []
  });
  assert.deepEqual(parseReservationSetup({}), {
    restaurantId: '',
    revision: 0,
    services: [],
    areas: [],
    rooms: [],
    tables: [],
    combinations: [],
    exceptions: []
  });
  assert.deepEqual(parseReservationFloorPlans({}), {
    restaurantId: '',
    revision: 0,
    floors: [],
    areas: [],
    rooms: [],
    tables: [],
    combinations: []
  });
  assert.deepEqual(parseAvailability({ available: true, code: 'available' }), {
    available: true,
    code: 'available',
    reason: undefined,
    capacity_mode: undefined,
    starts_at: undefined,
    ends_at: undefined,
    booked_covers: undefined,
    maximum_covers: undefined,
    automatic_confirmation: undefined
  });
  assert.equal(
    parseAvailability({
      available: true,
      code: 'available',
      capacity_mode: 'covers'
    }).capacity_mode,
    'covers'
  );
});

test('reservation layout revives canonical floor and room identities safely', async () => {
  const migration = await readFile(
    'supabase/migrations/20260727100005_reservation_floor_identity_and_service_defaults.sql',
    'utf8'
  );

  assert.match(migration, /insert into public\.reservation_rooms/i);
  assert.match(migration, /on conflict \(restaurant_id, level\) do update set/i);
  assert.match(migration, /on conflict \(restaurant_id, work_area_id\) do update set/i);
  assert.match(migration, /v_floor_map/);
  assert.match(migration, /v_room_map/);
  assert.match(migration, /reservation_tables_active_room_label_key/i);
  assert.match(migration, /where active/i);
});

test('reservation services default online booking off without blocking operators', async () => {
  const migration = await readFile(
    'supabase/migrations/20260727100005_reservation_floor_identity_and_service_defaults.sql',
    'utf8'
  );

  assert.match(migration, /services_ensure_reservation_setting/i);
  assert.match(migration, /new\.service_key,\s*false/is);
  assert.match(
    migration,
    /not v_setting\.booking_enabled\s+and not public\.is_owner_or_manager\(p_restaurant_id\)/is
  );
});

test('live reservations never exposes stale dates or superseded availability results', async () => {
  const workspace = await readFile(
    'src/lib/reservations/ReservationsWorkspace.svelte',
    'utf8'
  );

  assert.match(
    workspace,
    /const currentData = \$derived\(data\?\.businessDate === selectedDate \? data : null\)/
  );
  assert.match(workspace, /let availabilityRequestId = 0/);
  assert.match(workspace, /const current = \+\+availabilityRequestId/);
  assert.match(workspace, /const availabilityDraft: ReservationDraft = \{ \.\.\.draft \}/);
  assert.match(workspace, /if \(current !== availabilityRequestId\) return;\s*availability = result/);
  assert.match(workspace, /if \(current === availabilityRequestId\) availabilityLoading = false/);
  assert.match(workspace, /function isCurrentWorkspaceRequest\(/);
  assert.match(workspace, /restaurantId === workspace\.activeId/);
  assert.match(workspace, /date === selectedDate/);
  assert.match(workspace, /if \(!currentData\) return;/);
  assert.match(workspace, /workspace\.activeId === restaurantId && selectedDate === viewDate/);
  assert.match(workspace, /\{#if loading && !currentData\}/);
});

test('restaurant area catalogue creates physical instances without hiding repeated types', async () => {
  const workspace = await readFile(
    'src/lib/reservations/ReservationFloorPlansWorkspace.svelte',
    'utf8'
  );

  assert.match(workspace, /function catalogueAreaItems\(/);
  assert.doesNotMatch(workspace, /disabled:\s*Boolean\(existing/);
  assert.match(workspace, /async function addArea\(\)/);
  assert.match(workspace, /restaurantContext\.draft\.areas = \[area, \.\.\.areas\]/);
  assert.match(workspace, /function reconcileDraftRoomsWithAreas\(\)/);
  assert.match(workspace, /room\.active = shouldBeActive/);
  assert.match(workspace, /if \(draft\.rooms\.some\(\(room\) => room\.work_area_id === area\.id\)\) continue/);
  // The visual editor has one canvas surface; operational rows and cards stay
  // in Restaurant Areas instead of being duplicated here.
  assert.doesNotMatch(workspace, /pendingAreaIds|editorView|area-directory/);
  assert.doesNotMatch(workspace, /autoOpen/);
  // Compact screens can edit details; only freeform plan geometry remains
  // read-only because drag positioning needs a precise pointer workspace.
  assert.match(workspace, /const editorReadOnly = \$derived\(workspace\.isPreview\)/);
  assert.match(
    workspace,
    /const planGeometryReadOnly = \$derived\(compactViewport \|\| workspace\.isPreview\)/
  );
  assert.match(workspace, /editable=\{!planGeometryReadOnly\}/);
  assert.match(workspace, /roomsEditable=\{!planGeometryReadOnly\}/);
  assert.match(workspace, /selectedRoomId = room\.id;[\s\S]*field\?\.focus\(\)/);
  assert.match(workspace, /field\?\.focus\(\)/);
  assert.doesNotMatch(workspace, /removeEmptyNewArea/);
  assert.doesNotMatch(workspace, /Boolean\(newAreaId\)/);
  assert.match(workspace, /nextAreaInstanceNumber\(/);
  assert.match(workspace, /typeAreaName\(/);
  assert.doesNotMatch(workspace, /existingArea\.active = true/);
});

test('discard resets restaurant areas before rebuilding the shared floor plan', async () => {
  const workspace = await readFile(
    'src/lib/reservations/ReservationFloorPlansWorkspace.svelte',
    'utf8'
  );
  const discardStart = workspace.indexOf('function discard()');
  const restaurantDiscard = workspace.indexOf('restaurantContext?.discard();', discardStart);
  const floorPlanRestore = workspace.indexOf(
    'floorPlansDraft.restore(toDraft(source));',
    discardStart
  );

  assert.notEqual(discardStart, -1);
  assert.notEqual(restaurantDiscard, -1);
  assert.notEqual(floorPlanRestore, -1);
  assert.ok(restaurantDiscard < floorPlanRestore);
});

test('moving an area preserves its footprint and table containment remains save-enforced', async () => {
  const workspace = await readFile(
    'src/lib/reservations/ReservationFloorPlansWorkspace.svelte',
    'utf8'
  );
  const moveStart = workspace.indexOf('function moveAreaToFloor(');
  const moveEnd = workspace.indexOf('\n  function moveRoom(', moveStart);
  const moveArea = workspace.slice(moveStart, moveEnd);

  assert.match(moveArea, /const preservedWidth = Number\(target\.width\)/);
  assert.match(moveArea, /const preservedHeight = Number\(target\.height\)/);
  assert.match(moveArea, /target\.width = preservedWidth/);
  assert.match(moveArea, /target\.height = preservedHeight/);
  assert.doesNotMatch(moveArea, /target\.width = geometry\.width/);
  assert.doesNotMatch(moveArea, /target\.height = geometry\.height/);
  assert.match(
    workspace,
    /Number\(table\.position_x\) \+ Number\(table\.width\) >\s+Number\(tableRoom\.position_x\) \+ Number\(tableRoom\.width\)/
  );
  assert.match(
    workspace,
    /Number\(table\.position_y\) \+ Number\(table\.height\) >\s+Number\(tableRoom\.position_y\) \+ Number\(tableRoom\.height\)/
  );
});

test('authenticated reservation rooms retain canonical area colour and icon identity', async () => {
  const migration = await readFile(
    'supabase/migrations/20260727153612_reservation_operator_area_instance_labels.sql',
    'utf8'
  );

  assert.match(migration, /coalesce\(area\.color,\s*area\.metadata->>'color'\)/);
  assert.match(migration, /'area_icon', area\.icon_key/);
});


test('reservation status transitions are forward-only and terminal states are immutable', () => {
  assert.deepEqual(reservationNextStatuses('confirmed'), [
    'confirmed',
    'arrived',
    'waiting',
    'seated',
    'cancelled',
    'no_show'
  ]);
  assert.deepEqual(reservationNextStatuses('seated'), ['seated', 'finished']);
  assert.deepEqual(reservationNextStatuses('finished'), ['finished']);
  assert.equal(reservationIsTerminal('finished'), true);
  assert.equal(reservationIsTerminal('cancelled'), true);
  assert.equal(reservationIsTerminal('confirmed'), false);
});

test('live table state uses the current seating window and live lifecycle states', () => {
  const confirmed = {
    status: 'confirmed',
    starts_at: '2026-07-27T18:00:00.000Z',
    ends_at: '2026-07-27T20:00:00.000Z'
  };

  assert.equal(reservationIsCurrentAt(confirmed, Date.parse('2026-07-27T17:59:59.000Z')), false);
  assert.equal(reservationIsCurrentAt(confirmed, Date.parse('2026-07-27T18:00:00.000Z')), true);
  assert.equal(reservationIsCurrentAt(confirmed, Date.parse('2026-07-27T19:00:00.000Z')), true);
  assert.equal(reservationIsCurrentAt(confirmed, Date.parse('2026-07-27T20:00:00.000Z')), false);
  assert.equal(
    reservationIsCurrentAt(
      { ...confirmed, status: 'seated' },
      Date.parse('2026-07-27T22:00:00.000Z')
    ),
    true
  );
  assert.equal(
    reservationIsCurrentAt(
      { ...confirmed, status: 'finished' },
      Date.parse('2026-07-27T19:00:00.000Z')
    ),
    false
  );
});

test('operator reservations own their source and locale while setup stays a plain workspace grid', async () => {
  const workspace = await readFile(
    'src/lib/reservations/ReservationsWorkspace.svelte',
    'utf8'
  );
  const setup = await readFile(
    'src/lib/reservations/ReservationSetupWorkspace.svelte',
    'utf8'
  );

  assert.match(workspace, /source: 'internal'/);
  assert.match(workspace, /language_code: restaurantLanguageCode\(\)/);
  assert.match(workspace, /restaurant_settings\.locale/);
  assert.match(workspace, /reservations=\{currentReservations\}/);
  assert.doesNotMatch(workspace, /<option value="widget"/);
  assert.doesNotMatch(workspace, /<option value="integration"/);
  assert.doesNotMatch(setup, /cl-card__head/);
  assert.match(setup, /t\('Booking rules by service'\)/);
});

test('manager floor bookings preserve an optional exact table without weakening guest identity', async () => {
  const workspace = await readFile(
    'src/lib/reservations/ReservationsWorkspace.svelte',
    'utf8'
  );
  const api = await readFile(
    'src/lib/reservations/reservation-api.ts',
    'utf8'
  );
  const types = await readFile(
    'src/lib/reservations/reservation-types.ts',
    'utf8'
  );
  const migration = await readFile(
    'supabase/migrations/20260727160126_operator_reservation_table_preference.sql',
    'utf8'
  );

  assert.match(types, /preferred_table_id: string;/);
  assert.match(workspace, /openNewReservation\(table\.room_id, table\.id\)/);
  assert.match(workspace, /value=\{draft\.preferred_table_id\}/);
  assert.match(workspace, /<option value="">\{t\('Best available'\)\}<\/option>/);
  assert.match(api, /p_preferred_table_id: draft\.preferred_table_id \|\| undefined/);

  assert.match(migration, /add column preferred_table_id uuid/i);
  assert.match(migration, /get_reservation_workspace\(uuid,date\)/i);
  assert.match(migration, /'preferred_table_id', r\.preferred_table_id/i);
  assert.match(migration, /reservation_exact_table_candidate/i);
  assert.match(migration, /reservation_public_hold_tables/i);
  assert.match(migration, /'kind', 'preferred_table'/i);
  assert.match(migration, /resolve_operator_reservation_guest/i);
  assert.match(migration, /email and phone point to different guest records/i);
  assert.match(migration, /\|reservation-guests/);
  assert.doesNotMatch(
    migration,
    /\(v_normalized_email is not null and g\.normalized_email = v_normalized_email\)\s+or\s+\(v_normalized_phone/is
  );

  const sqlContract = await readFile(
    'supabase/tests/reservation_contract.sql',
    'utf8'
  );
  assert.match(
    sqlContract,
    /Authenticated reservation workspace lost the exact table preference/
  );
});

test('reservation tables remain confined to reservable guest areas', async () => {
  const workspace = await readFile(
    'src/lib/reservations/ReservationFloorPlansWorkspace.svelte',
    'utf8'
  );
  const model = await readFile(
    'src/lib/restaurant/restaurant-model.ts',
    'utf8'
  );
  const migration = await readFile(
    'supabase/migrations/20260727154500_reservation_table_area_rules.sql',
    'utf8'
  );

  assert.match(workspace, /selectedRoomReservable/);
  assert.match(workspace, /Tables can only be added to reservable guest areas\./);
  assert.match(model, /reservable:\s*workspaceAreaByKey/);
  assert.match(migration, /guard_reservation_table_area/);
  assert.match(migration, /Reservation tables require a reservable guest area\./);
  assert.match(migration, /reservation_tables_guard_area/);
});

test('phase 1 and 2 migration exposes revision and integrity guards', async () => {
  const migration = await readFile(
    'supabase/migrations/20260726214338_reservation_integrity_and_atomic_venue.sql',
    'utf8'
  );
  assert.match(migration, /reservation_configuration_revisions/);
  assert.match(migration, /create function public\.save_venue_model/i);
  assert.match(migration, /p_expected_revision integer default null/i);
  assert.match(migration, /assignment_group_id/i);
  assert.match(migration, /reservation_combination_member_room_guard/i);
  assert.match(migration, /v_overnight := v_closes_at < v_opens_at/i);
  assert.match(migration, /Finished, cancelled and no-show reservations cannot be edited/i);
});
