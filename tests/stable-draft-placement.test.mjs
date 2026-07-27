import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { StableDraftPlacement } from '../src/lib/classic/stable-draft-placement.ts';

const clone = (row) => ({ ...row, tags: [...row.tags] });

test('existing draft rows keep their committed placement values until reset', () => {
  const placement = new StableDraftPlacement(clone);
  placement.reset([
    { id: 'employee-1', group: 'kitchen', name: 'Amelie', tags: ['chef'] }
  ]);

  const edited = {
    id: 'employee-1',
    group: 'bar',
    name: 'Zoe',
    tags: ['bartender']
  };

  assert.deepEqual(placement.snapshotFor(edited), {
    id: 'employee-1',
    group: 'kitchen',
    name: 'Amelie',
    tags: ['chef']
  });

  placement.reset([edited]);
  assert.deepEqual(placement.snapshotFor(edited), edited);
});

test('new draft rows freeze their first placement until save or removal', () => {
  const placement = new StableDraftPlacement(clone);
  placement.reset([]);

  const initial = { id: 'new-employee', group: '', name: '', tags: [] };
  assert.deepEqual(placement.snapshotFor(initial), initial);

  const edited = {
    id: 'new-employee',
    group: 'dining-room',
    name: 'Noah',
    tags: ['server']
  };
  assert.deepEqual(placement.snapshotFor(edited), initial);

  placement.remove(edited.id);
  assert.deepEqual(placement.snapshotFor(edited), edited);
});

test('placement snapshots are detached from mutable nested draft values', () => {
  const placement = new StableDraftPlacement(clone);
  const committed = {
    id: 'employee-1',
    group: 'kitchen',
    name: 'Amelie',
    tags: ['chef']
  };
  placement.reset([committed]);
  committed.tags[0] = 'bartender';

  assert.deepEqual(placement.snapshotFor(committed).tags, ['chef']);
});

test('clone callbacks are invoked as plain functions', () => {
  function receiverSensitiveClone(row) {
    assert.equal(this, undefined);
    return { ...row, tags: [...row.tags] };
  }

  const placement = new StableDraftPlacement(receiverSensitiveClone);
  const committed = {
    id: 'employee-1',
    group: 'kitchen',
    name: 'Amelie',
    tags: ['chef']
  };

  placement.reset([committed]);
  assert.deepEqual(placement.snapshotFor(committed), committed);
});

test('every editable Team roster grid anchors filter, sort and group decisions', async () => {
  const files = [
    'src/routes/(app)/team/+page.svelte',
    'src/routes/(app)/team/contracts/+page.svelte',
    'src/routes/(app)/team/access/+page.svelte',
    'src/routes/(app)/payroll/employees/+page.svelte'
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /function matches[\s\S]*?teamDraft\.placement\(employee\)/);
    assert.match(source, /function sortValue[\s\S]*?teamDraft\.placement\(employee\)/);
    assert.match(source, /function grouped[\s\S]*?teamDraft\.placement\(employee\)/);
  }
});
