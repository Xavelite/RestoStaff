import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { StableDraftPlacement } from '../src/lib/classic/stable-draft-placement.ts';
import { parseManagerOperationsReadModel } from '../src/lib/api/workspace-snapshot.ts';
import { buildPlanningWeek } from '../src/lib/schedule/schedule-model.ts';

test('Planning row placement stays committed while live shift facts change', () => {
  const placement = new StableDraftPlacement(structuredClone);
  placement.reset([]);

  const committed = {
    id: 'employee-1',
    conflict: false,
    contractLabel: 'CDI',
    positionLabel: 'Server',
    positionAreaId: 'dining',
    areaLabel: 'Dining room',
    areaId: 'dining',
    statusLabel: 'Unplanned'
  };
  assert.deepEqual(placement.snapshotFor(committed), committed);

  const edited = {
    ...committed,
    conflict: true,
    areaLabel: 'Bar',
    areaId: 'bar',
    statusLabel: 'Conflict'
  };
  assert.deepEqual(placement.snapshotFor(edited), committed);

  placement.reset([]);
  assert.deepEqual(placement.snapshotFor(edited), edited);
});

test('Planning uses stable placement for conflict filtering and every mutable group', async () => {
  const page = await readFile('src/routes/(app)/schedule/+page.svelte', 'utf8');
  const draft = await readFile('src/lib/classic/classic-schedule.svelte.ts', 'utf8');

  assert.match(draft, /StableDraftPlacement<ScheduleRowPlacement>/);
  assert.match(draft, /settle\(\)[\s\S]*?#rowPlacement\.reset\(\[\]\)/);
  assert.match(page, /function placementForRow[\s\S]*?scheduleDraft\.placement/);
  assert.match(page, /onlyConflicts && !placement\.conflict/);
  assert.match(page, /groupMode === 'area'\) return placement\.areaLabel/);
  assert.match(page, /groupMode === 'status'\) return placement\.statusLabel/);
});

test('an archived employee row remains mounted while its last saved shift removal is unsaved', () => {
  const snapshot = parseManagerOperationsReadModel({
    restaurant: { id: 'restaurant-1' },
    restaurant_settings: { timezone: 'Europe/Brussels' },
    employees: [
      { id: 'employee-1', display_name: 'Archived employee', active: false }
    ],
    job_functions: [],
    work_areas: []
  });
  const committedShift = {
    employeeId: 'employee-1',
    weekday: 1,
    serviceKey: 'lunch',
    areaId: '',
    jobFunctionId: '',
    startsAt: '12:00',
    endsAt: '15:00',
    source: 'manual'
  };

  const grid = buildPlanningWeek({
    snapshot,
    weekStart: '2026-07-27',
    today: '2026-07-27',
    draft: [],
    placementDraft: [committedShift]
  });

  assert.deepEqual(grid.rows.map((row) => row.id), ['employee-1']);
  assert.equal(
    grid.slotsByKey.get('employee-1|2026-07-27|lunch')?.shift,
    null
  );
});
