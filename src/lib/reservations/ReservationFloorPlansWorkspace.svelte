<script lang="ts">
  import { onMount } from 'svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import Dialog from '$lib/components/Dialog.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import {
    getReservationFloorPlans,
    saveReservationFloorPlans
  } from './reservation-api';
  import ReservationFloorPlan from './ReservationFloorPlan.svelte';
  import type {
    ReservationFloor,
    ReservationFloorPlans,
    ReservationFloorPlansDraft,
    ReservationRoom,
    ReservationRoomDraft,
    ReservationTableDraft
  } from './reservation-types';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  let source = $state<ReservationFloorPlans | null>(null);
  let draft = $state<ReservationFloorPlansDraft | null>(null);
  let loading = $state(false);
  let saving = $state(false);
  let dirty = $state(false);
  let error = $state('');
  let selectedFloorId = $state('');
  let selectedRoomId = $state('');
  let selectedTableId = $state('');
  let floorDialogOpen = $state(false);
  let newFloorName = $state('');
  let newFloorLevel = $state(0);
  let tableToArchive = $state<ReservationTableDraft | null>(null);

  const selectedFloor = $derived(
    draft?.floors.find((floor) => floor.id === selectedFloorId && floor.active) ?? null
  );
  const mergedRooms = $derived.by(() => {
    if (!draft || !source) return [] as ReservationRoom[];
    return draft.rooms
      .filter((room) => room.active)
      .map((room) => ({
        ...source!.rooms.find((item) => item.id === room.id)!,
        ...room
      }))
      .filter((room) => Boolean(room.id));
  });
  const floorRooms = $derived(
    mergedRooms.filter((room) => room.floor_id === selectedFloorId)
  );
  const floorTables = $derived(
    (draft?.tables ?? []).filter(
      (table) =>
        table.active &&
        floorRooms.some((room) => room.id === table.room_id)
    )
  );
  const selectedRoom = $derived(
    mergedRooms.find((room) => room.id === selectedRoomId) ?? null
  );
  const selectedRoomDraft = $derived(
    draft?.rooms.find((room) => room.id === selectedRoomId) ?? null
  );
  const selectedTable = $derived(
    draft?.tables.find((table) => table.id === selectedTableId) ?? null
  );
  onMount(() => {
    if (workspace.activeId) void load(workspace.activeId);
  });

  $effect(() => {
    const restaurantId = workspace.activeId;
    if (!restaurantId || source?.restaurantId === restaurantId) return;
    void load(restaurantId);
  });

  async function load(restaurantId: string) {
    loading = true;
    error = '';
    try {
      const next = await getReservationFloorPlans(restaurantId);
      source = next;
      draft = toDraft(next);
      dirty = false;
      if (!selectedFloorId || !draft.floors.some((floor) => floor.id === selectedFloorId && floor.active)) {
        selectedFloorId = draft.floors.find((floor) => floor.active)?.id ?? '';
      }
      selectedRoomId = '';
      selectedTableId = '';
    } catch (cause) {
      error = friendlyError(cause);
    } finally {
      loading = false;
    }
  }

  function toDraft(value: ReservationFloorPlans): ReservationFloorPlansDraft {
    return {
      floors: value.floors.map((floor) => ({
        ...floor,
        canvas_width: Number(floor.canvas_width),
        canvas_height: Number(floor.canvas_height)
      })),
      rooms: value.rooms.map((room) => ({
        id: room.id,
        work_area_id: room.work_area_id,
        floor_id: room.floor_id,
        position_x: Number(room.position_x),
        position_y: Number(room.position_y),
        width: Number(room.width),
        height: Number(room.height),
        active: room.active,
        sort_order: room.sort_order
      })),
      tables: value.tables.map(({ restaurant_id: _, ...table }) => ({
        ...table,
        position_x: Number(table.position_x),
        position_y: Number(table.position_y),
        width: Number(table.width),
        height: Number(table.height),
        rotation_degrees: Number(table.rotation_degrees)
      })),
      combinations: value.combinations.map(({ restaurant_id: _, ...combination }) => ({
        ...combination
      }))
    };
  }

  function touch() {
    dirty = true;
  }

  function openFloorDialog() {
    newFloorName = '';
    newFloorLevel = (draft?.floors.reduce((highest, floor) => Math.max(highest, floor.level), -1) ?? -1) + 1;
    floorDialogOpen = true;
  }

  function addFloor() {
    if (!draft || !source || !newFloorName.trim()) return;
    const floor: ReservationFloor = {
      id: crypto.randomUUID(),
      restaurant_id: source.restaurantId,
      name: newFloorName.trim(),
      level: newFloorLevel,
      canvas_width: 1000,
      canvas_height: 600,
      active: true,
      sort_order: draft.floors.length
    };
    draft.floors = [...draft.floors, floor];
    selectedFloorId = floor.id;
    selectedRoomId = '';
    selectedTableId = '';
    floorDialogOpen = false;
    touch();
  }

  function assignRoom(room: ReservationRoom) {
    if (!selectedFloor || !draft) return;
    const target = draft.rooms.find((item) => item.id === room.id);
    if (!target) return;
    const index = floorRooms.length;
    target.floor_id = selectedFloor.id;
    target.position_x = 30 + (index % 2) * (selectedFloor.canvas_width / 2);
    target.position_y = 30 + Math.floor(index / 2) * 260;
    target.width = Math.max(220, selectedFloor.canvas_width / 2 - 45);
    target.height = 230;
    selectedRoomId = target.id;
    selectedTableId = '';
    touch();
  }

  function moveRoom(room: ReservationRoom, x: number, y: number) {
    if (!draft) return;
    const target = draft.rooms.find((item) => item.id === room.id);
    if (!target) return;
    const dx = x - Number(target.position_x);
    const dy = y - Number(target.position_y);
    target.position_x = x;
    target.position_y = y;
    draft.tables
      .filter((table) => table.room_id === room.id)
      .forEach((table) => {
        table.position_x = Number(table.position_x) + dx;
        table.position_y = Number(table.position_y) + dy;
      });
    touch();
  }

  function moveTable(table: ReservationTableDraft, x: number, y: number) {
    if (!draft) return;
    const room = draft.rooms.find((item) => item.id === table.room_id);
    const target = draft.tables.find((item) => item.id === table.id);
    if (!target || !room) return;
    const inset = 12;
    target.position_x = Math.max(
      Number(room.position_x) + inset,
      Math.min(
        Number(room.position_x) + Number(room.width) - Number(target.width) - inset,
        x
      )
    );
    target.position_y = Math.max(
      Number(room.position_y) + 28,
      Math.min(
        Number(room.position_y) + Number(room.height) - Number(target.height) - inset,
        y
      )
    );
    touch();
  }

  function arrangeRooms() {
    if (!draft || !selectedFloor) return;
    const columns = floorRooms.length > 1 ? 2 : 1;
    const gap = 24;
    const width = (selectedFloor.canvas_width - gap * (columns + 1)) / columns;
    const rows = Math.max(1, Math.ceil(floorRooms.length / columns));
    const height = (selectedFloor.canvas_height - gap * (rows + 1)) / rows;
    floorRooms.forEach((room, index) => {
      const target = draft!.rooms.find((item) => item.id === room.id)!;
      target.position_x = gap + (index % columns) * (width + gap);
      target.position_y = gap + Math.floor(index / columns) * (height + gap);
      target.width = width;
      target.height = height;
    });
    floorRooms.forEach((room) => arrangeTables(room.id));
    touch();
  }

  function arrangeTables(roomId = selectedRoomId) {
    if (!draft) return;
    const room = draft.rooms.find((item) => item.id === roomId);
    if (!room) return;
    const tables = draft.tables.filter((table) => table.room_id === roomId && table.active);
    const columns = Math.max(1, Math.floor((Number(room.width) - 30) / 155));
    tables.forEach((table, index) => {
      table.position_x = Number(room.position_x) + 28 + (index % columns) * 145;
      table.position_y = Number(room.position_y) + 50 + Math.floor(index / columns) * 115;
    });
    touch();
  }

  function addTable() {
    if (!draft || !selectedRoomDraft) return;
    const roomTables = draft.tables.filter((table) => table.room_id === selectedRoomDraft.id);
    const labels = new Set(roomTables.map((table) => table.label));
    let number = 1;
    while (labels.has(String(number))) number += 1;
    const table: ReservationTableDraft = {
      id: crypto.randomUUID(),
      room_id: selectedRoomDraft.id,
      label: String(number),
      minimum_capacity: 1,
      maximum_capacity: 2,
      shape: 'square',
      position_x: Number(selectedRoomDraft.position_x) + 35 + (roomTables.length % 4) * 145,
      position_y: Number(selectedRoomDraft.position_y) + 50 + Math.floor(roomTables.length / 4) * 115,
      width: 112,
      height: 76,
      rotation_degrees: 0,
      active: true,
      blocked: false,
      sort_order: roomTables.length
    };
    draft.tables = [...draft.tables, table];
    selectedTableId = table.id;
    touch();
  }

  function duplicateTable(table: ReservationTableDraft) {
    if (!draft) return;
    const roomTables = draft.tables.filter((item) => item.room_id === table.room_id);
    const labels = new Set(roomTables.map((item) => item.label.toLowerCase()));
    const base = `${table.label} copy`;
    let label = base;
    let suffix = 2;
    while (labels.has(label.toLowerCase())) label = `${base} ${suffix++}`;
    const duplicate = {
      ...table,
      id: crypto.randomUUID(),
      label,
      position_x: Number(table.position_x) + 25,
      position_y: Number(table.position_y) + 25,
      active: true,
      sort_order: roomTables.length
    };
    draft.tables = [...draft.tables, duplicate];
    selectedTableId = duplicate.id;
    touch();
  }

  function archiveTable() {
    if (!tableToArchive) return;
    tableToArchive.active = false;
    if (selectedTableId === tableToArchive.id) selectedTableId = '';
    tableToArchive = null;
    touch();
  }

  function canSave(): boolean {
    return Boolean(
      draft &&
      draft.floors.every(
        (floor) =>
          floor.name.trim() &&
          floor.canvas_width >= 400 &&
          floor.canvas_height >= 300
      ) &&
      draft.tables.every(
        (table) =>
          table.label.trim() &&
          table.minimum_capacity >= 1 &&
          table.maximum_capacity >= table.minimum_capacity
      )
    );
  }

  async function save() {
    if (!workspace.activeId || !draft || !dirty || saving || !canSave()) return;
    saving = true;
    error = '';
    try {
      await saveReservationFloorPlans(workspace.activeId, draft);
      await load(workspace.activeId);
      toasts.show(t('Floor plans saved.'), 'success');
    } catch (cause) {
      error = friendlyError(cause);
      toasts.show(error, 'danger');
    } finally {
      saving = false;
    }
  }

  function discard() {
    if (!source) return;
    draft = toDraft(source);
    dirty = false;
  }
</script>

<svelte:head><title>{t('Floor plans')} &middot; restogogo</title></svelte:head>

<ClassicPage>
  {#if error}<div class="floor-error" role="alert">{error}</div>{/if}

  <ClassicTablePanel
    {dirty}
    {saving}
    canSave={canSave()}
    onsave={() => void save()}
    ondiscard={discard}
  >
    {#snippet meta()}
      <span>{t('{count} floors', { count: draft?.floors.filter((floor) => floor.active).length ?? 0 })}</span>
      <span>{t('{count} areas placed', { count: mergedRooms.filter((room) => room.floor_id).length })}</span>
      <span>{t('{count} tables', { count: draft?.tables.filter((table) => table.active).length ?? 0 })}</span>
    {/snippet}
    {#snippet children()}
      {#if loading && !draft}
        <div class="floor-loading"><span class="cl-skel"></span><span class="cl-skel"></span></div>
      {:else if draft}
        <div class="venue-editor">
          <aside class="venue-sidebar">
            <section class="cl-card">
              <div class="cl-card__head">
                <div><h2>{t('Floors')}</h2><p>{t('One canvas per physical level of the restaurant.')}</p></div>
                <button class="cl-btn is-icon" type="button" aria-label={t('Add floor')} onclick={openFloorDialog}>+</button>
              </div>
              <div class="floor-list">
                {#each draft.floors.filter((floor) => floor.active) as floor (floor.id)}
                  <button class:is-active={floor.id === selectedFloorId} type="button" onclick={() => {
                    selectedFloorId = floor.id;
                    selectedRoomId = '';
                    selectedTableId = '';
                  }}>
                    <span>{floor.level === 0 ? t('Ground floor') : t('Level {level}', { level: floor.level })}</span>
                    <strong>{floor.name}</strong>
                    <small>{mergedRooms.filter((room) => room.floor_id === floor.id).length} {t('areas')}</small>
                  </button>
                {/each}
              </div>
            </section>

            <section class="cl-card">
              <div class="cl-card__head">
                <div><h2>{t('Restaurant areas')}</h2><p>{t('Place the reservable areas configured in Settings.')}</p></div>
              </div>
              <div class="area-list">
                {#each mergedRooms as room (room.id)}
                  {@const floor = draft.floors.find((item) => item.id === room.floor_id)}
                  <button
                    class:is-active={room.id === selectedRoomId}
                    type="button"
                    onclick={() => room.floor_id ? (
                      selectedFloorId = room.floor_id,
                      selectedRoomId = room.id,
                      selectedTableId = ''
                    ) : assignRoom(room)}
                  >
                    <i style={`--area-color:${room.area_color || 'var(--cl-info)'}`}></i>
                    <span><strong>{room.name}</strong><small>{floor?.name || t('Not placed')}</small></span>
                    {#if !room.floor_id}<em>+</em>{/if}
                  </button>
                {/each}
                {#if !mergedRooms.length}
                  <div class="area-empty">
                    <strong>{t('No reservable areas')}</strong>
                    <span>{t('Enable Restaurant areas in Reservation Settings first.')}</span>
                    <a href="/reservations/setup">{t('Open Settings')}</a>
                  </div>
                {/if}
              </div>
            </section>
          </aside>

          <section class="cl-card plan-card">
            {#if selectedFloor}
              <div class="cl-card__head plan-head">
                <div>
                  <h2>{selectedFloor.name}</h2>
                  <p>{t('Position areas first, then add real tables inside them.')}</p>
                </div>
                <div class="plan-actions">
                  <label><span>{t('Width')}</span><input class="cl-field" type="number" min="400" max="4000" step="50" bind:value={selectedFloor.canvas_width} oninput={touch} /></label>
                  <label><span>{t('Depth')}</span><input class="cl-field" type="number" min="300" max="3000" step="50" bind:value={selectedFloor.canvas_height} oninput={touch} /></label>
                  <button class="cl-btn" type="button" disabled={!floorRooms.length} onclick={arrangeRooms}>{t('Auto layout')}</button>
                  <button class="cl-btn is-primary" type="button" disabled={!selectedRoom} onclick={addTable}>+ {t('Table')}</button>
                </div>
              </div>

              <div class="venue-canvas">
                <ReservationFloorPlan
                  tables={floorTables}
                  rooms={floorRooms}
                  roomName={selectedFloor.name}
                  floorWidth={selectedFloor.canvas_width}
                  floorHeight={selectedFloor.canvas_height}
                  editable
                  {selectedRoomId}
                  {selectedTableId}
                  emptyMessage="Place an area on this floor, then add its tables."
                  onroomselect={(room) => {
                    selectedRoomId = room.id;
                    selectedTableId = '';
                  }}
                  onroommove={moveRoom}
                  onselect={(table) => {
                    selectedTableId = table.id;
                    selectedRoomId = table.room_id;
                  }}
                  onmove={moveTable}
                />
              </div>

              {#if selectedTable}
                <div class="selection-bar">
                  <label><span>{t('Table')}</span><input class="cl-field" bind:value={selectedTable.label} oninput={touch} /></label>
                  <label><span>{t('Minimum')}</span><input class="cl-field" type="number" min="1" max="100" bind:value={selectedTable.minimum_capacity} oninput={touch} /></label>
                  <label><span>{t('Maximum')}</span><input class="cl-field" type="number" min="1" max="500" bind:value={selectedTable.maximum_capacity} oninput={touch} /></label>
                  <label><span>{t('Shape')}</span><select class="cl-field" bind:value={selectedTable.shape} onchange={touch}><option value="round">{t('Round')}</option><option value="square">{t('Square')}</option><option value="rectangle">{t('Rectangle')}</option></select></label>
                  <button class="cl-btn" type="button" onclick={() => {
                    selectedTable.rotation_degrees = (Number(selectedTable.rotation_degrees) + 15) % 360;
                    touch();
                  }}>{t('Rotate 15°')}</button>
                  <button class="cl-btn" type="button" onclick={() => duplicateTable(selectedTable)}>{t('Duplicate')}</button>
                  <button class="cl-btn is-problem" type="button" onclick={() => (tableToArchive = selectedTable)}>{t('Archive')}</button>
                </div>
              {:else if selectedRoomDraft && selectedRoom}
                <div class="selection-bar room-selection">
                  <div><span>{t('Selected area')}</span><strong>{selectedRoom.name}</strong></div>
                  <label><span>{t('Width')}</span><input class="cl-field" type="number" min="120" max="4000" step="20" bind:value={selectedRoomDraft.width} oninput={touch} /></label>
                  <label><span>{t('Depth')}</span><input class="cl-field" type="number" min="100" max="3000" step="20" bind:value={selectedRoomDraft.height} oninput={touch} /></label>
                  <button class="cl-btn" type="button" onclick={() => arrangeTables()}>{t('Arrange tables')}</button>
                  <button class="cl-btn is-primary" type="button" onclick={addTable}>+ {t('Add table')}</button>
                </div>
              {:else}
                <div class="selection-hint">{t('Select an area or table to edit it. Drag either directly on the plan.')}</div>
              {/if}
            {:else}
              <div class="cl-empty">
                <strong>{t('Create your first floor')}</strong>
                <span>{t('Set its dimensions, place Restaurant areas, then add tables.')}</span>
                <button class="cl-btn is-primary" type="button" onclick={openFloorDialog}>{t('Add floor')}</button>
              </div>
            {/if}
          </section>
        </div>
      {/if}
    {/snippet}
  </ClassicTablePanel>
</ClassicPage>

<Dialog open={floorDialogOpen} title="Add floor" description="Create one canvas for each physical restaurant level." size="small" onclose={() => (floorDialogOpen = false)}>
  {#snippet children()}
    <div class="floor-form">
      <label class="cl-label"><span>{t('Floor name')}</span><input class="cl-field" placeholder={t('Ground floor')} bind:value={newFloorName} /></label>
      <label class="cl-label"><span>{t('Level')}</span><input class="cl-field" type="number" min="-20" max="200" bind:value={newFloorLevel} /></label>
    </div>
  {/snippet}
  {#snippet footer()}
    <button class="cl-btn" type="button" onclick={() => (floorDialogOpen = false)}>{t('Cancel')}</button>
    <button class="cl-btn is-primary" type="button" disabled={!newFloorName.trim()} onclick={addFloor}>{t('Add floor')}</button>
  {/snippet}
</Dialog>

<Dialog open={Boolean(tableToArchive)} title="Archive table" description="Past reservations keep their table history." size="small" onclose={() => (tableToArchive = null)}>
  {#snippet children()}<p class="dialog-copy">{t('Archive table {label}?', { label: tableToArchive?.label ?? '' })}</p>{/snippet}
  {#snippet footer()}
    <button class="cl-btn" type="button" onclick={() => (tableToArchive = null)}>{t('Cancel')}</button>
    <button class="cl-btn is-problem" type="button" onclick={archiveTable}>{t('Archive table')}</button>
  {/snippet}
</Dialog>

<style>
  .floor-error { padding: 10px 12px; border: 1px solid var(--cl-problem-line); border-left: 3px solid var(--cl-problem); border-radius: var(--cl-radius); background: var(--cl-problem-wash); color: var(--cl-problem); font-size: 12px; }
  .floor-loading { display: grid; gap: 16px; padding: 24px; }
  .venue-editor { display: grid; grid-template-columns: 246px minmax(620px, 1fr); gap: 14px; align-items: start; }
  .venue-sidebar { display: grid; gap: 12px; }
  .cl-card__head > div { display: grid; gap: 2px; }
  .cl-card__head p { margin: 0; color: var(--cl-muted); font-size: 10.5px; line-height: 1.4; }
  .floor-list, .area-list { display: grid; padding: 7px; }
  .floor-list > button {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 8px;
    padding: 9px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .floor-list > button:hover, .area-list > button:hover { background: var(--cl-surface-muted); }
  .floor-list > button.is-active { border-color: var(--cl-accent-line); background: var(--cl-accent-wash); }
  .floor-list span { color: var(--cl-muted); font-size: 9px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .floor-list strong { grid-column: 1; font-size: 12px; }
  .floor-list small { grid-column: 2; grid-row: 1 / 3; align-self: center; color: var(--cl-muted); font-size: 9.5px; }
  .area-list > button {
    display: grid;
    grid-template-columns: 7px minmax(0, 1fr) 22px;
    align-items: center;
    gap: 9px;
    padding: 8px 7px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .area-list > button.is-active { border-color: var(--cl-line); background: var(--cl-surface-muted); }
  .area-list i { width: 7px; height: 29px; border-radius: 3px; background: var(--area-color); }
  .area-list button > span { display: grid; gap: 1px; }
  .area-list strong { font-size: 11.5px; }
  .area-list small { color: var(--cl-muted); font-size: 9.5px; }
  .area-list em { width: 21px; height: 21px; display: grid; place-items: center; border: 1px solid var(--cl-line); border-radius: 4px; color: var(--cl-accent); font-style: normal; font-weight: var(--rst-fw-bold); }
  .area-empty { display: grid; gap: 4px; padding: 14px 8px; color: var(--cl-muted); font-size: 10.5px; }
  .area-empty strong { color: var(--cl-text); font-size: 11.5px; }
  .area-empty a { margin-top: 3px; color: var(--cl-accent); font-weight: var(--rst-fw-bold); text-decoration: none; }
  .plan-card { min-width: 0; }
  .plan-head { gap: 16px; }
  .cl-card__head > .plan-actions { display: flex; align-items: end; gap: 6px; }
  .plan-actions label { display: grid; gap: 2px; }
  .plan-actions label span { color: var(--cl-muted); font-size: 8.5px; font-weight: var(--rst-fw-bold); }
  .plan-actions input { width: 76px; text-align: right; }
  .venue-canvas { padding: 10px; border-top: 1px solid var(--cl-line); background: var(--cl-surface-muted); }
  .selection-bar {
    min-height: 58px;
    display: flex;
    align-items: end;
    gap: 7px;
    padding: 8px 10px;
    border-top: 1px solid var(--cl-line);
    background: var(--cl-surface);
  }
  .selection-bar label { display: grid; gap: 2px; }
  .selection-bar label span, .room-selection > div span { color: var(--cl-muted); font-size: 8.5px; font-weight: var(--rst-fw-bold); }
  .selection-bar input { width: 70px; }
  .selection-bar label:first-child input { width: 100px; }
  .selection-bar select { min-width: 100px; }
  .selection-bar .cl-btn:nth-last-child(3) { margin-left: auto; }
  .room-selection > div { min-width: 140px; display: grid; gap: 2px; align-self: center; margin-right: auto; }
  .room-selection > div strong { font-size: 12px; }
  .selection-hint { padding: 12px; border-top: 1px solid var(--cl-line); color: var(--cl-muted); font-size: 10.5px; text-align: center; }
  .floor-form { display: grid; gap: 12px; }
  .dialog-copy { margin: 0; color: var(--cl-muted); font-size: 12px; }
  .cl-btn.is-problem { border-color: var(--cl-problem-line); background: var(--cl-problem-wash); color: var(--cl-problem); }
  @media (max-width: 980px) {
    .venue-editor { grid-template-columns: minmax(0, 1fr); }
    .venue-sidebar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 760px) {
    .venue-sidebar { grid-template-columns: minmax(0, 1fr); }
    .plan-head, .plan-actions, .selection-bar { align-items: stretch; flex-wrap: wrap; }
  }
</style>
