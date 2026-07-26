<script lang="ts">
  import { onMount } from 'svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import Dialog from '$lib/components/Dialog.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicPalettePicker from '$lib/classic/ClassicPalettePicker.svelte';
  import type { ClassicRestaurantContext } from '$lib/classic/classic-workspace-context';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
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
  import { AREA_PALETTE, defaultAreaColor } from '$lib/ui/position-color';

  let {
    mode = 'tables',
    restaurantContext = null
  }: {
    mode?: 'venue' | 'tables';
    restaurantContext?: ClassicRestaurantContext | null;
  } = $props();

  let source = $state<ReservationFloorPlans | null>(null);
  let draft = $state<ReservationFloorPlansDraft | null>(null);
  let loading = $state(false);
  let saving = $state(false);
  let dirty = $state(false);
  let error = $state('');
  let selectedFloorId = $state('');
  let selectedRoomId = $state('');
  let selectedTableId = $state('');
  let tableToArchive = $state<ReservationTableDraft | null>(null);
  let compactViewport = $state(false);
  const ROOM_GRID = 20;
  const TABLE_GRID = 10;
  const editorReadOnly = $derived(compactViewport || workspace.isPreview);

  onMount(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => (compactViewport = media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  });

  const selectedFloor = $derived(
    draft?.floors.find((floor) => floor.id === selectedFloorId && floor.active) ?? null
  );
  const mergedRooms = $derived.by(() => {
    if (!draft || !source) return [] as ReservationRoom[];
    return draft.rooms
      .filter((room) => room.active)
      .map((room) => {
        const persisted = source!.rooms.find((item) => item.id === room.id);
        const draftArea = restaurantContext?.draft.areas.find((item) => item.id === room.work_area_id);
        const area = source!.areas.find((item) => item.id === room.work_area_id);
        return {
          id: room.id,
          restaurant_id: source!.restaurantId,
          work_area_id: room.work_area_id,
          floor_id: room.floor_id,
          name: draftArea?.name ?? persisted?.name ?? area?.name ?? t('Area'),
          area_code: draftArea?.code ?? persisted?.area_code ?? area?.code ?? '',
          area_color:
            draftArea?.color ??
            persisted?.area_color ??
            (area?.metadata && typeof area.metadata === 'object' && !Array.isArray(area.metadata) && typeof area.metadata.color === 'string'
              ? area.metadata.color
              : null),
          position_x: room.position_x,
          position_y: room.position_y,
          width: room.width,
          height: room.height,
          active: room.active,
          sort_order: room.sort_order
        };
      })
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
  const selectedAreaDraft = $derived(
    restaurantContext?.draft.areas.find((area) => area.id === selectedRoom?.work_area_id) ?? null
  );
  const selectedTable = $derived(
    draft?.tables.find((table) => table.id === selectedTableId) ?? null
  );
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
    const rooms = value.rooms.map((room) => ({
      id: room.id,
      work_area_id: room.work_area_id,
      floor_id: room.floor_id,
      position_x: Number(room.position_x),
      position_y: Number(room.position_y),
      width: Number(room.width),
      height: Number(room.height),
      active: room.active,
      sort_order: room.sort_order
    }));
    if (mode === 'venue') {
      for (const area of value.areas.filter((item) => item.active)) {
        if (rooms.some((room) => room.work_area_id === area.id)) continue;
        rooms.push({
          id: crypto.randomUUID(),
          work_area_id: area.id,
          floor_id: null,
          position_x: 24,
          position_y: 24,
          width: 452,
          height: 252,
          active: true,
          sort_order: rooms.length
        });
      }
    }
    const floors = value.floors.map((floor) => ({
        ...floor,
        canvas_width: Number(floor.canvas_width),
        canvas_height: Number(floor.canvas_height)
      }));
    if (mode === 'venue' && !floors.some((floor) => floor.active)) {
      floors.push({
        id: crypto.randomUUID(),
        restaurant_id: value.restaurantId,
        name: t('Ground floor'),
        level: 0,
        canvas_width: 1000,
        canvas_height: 600,
        active: true,
        sort_order: 0
      });
    }
    return {
      floors,
      rooms,
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

  function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function snap(value: number, grid = ROOM_GRID): number {
    return Math.round(value / grid) * grid;
  }

  function nextAreaGeometry(floor: ReservationFloor, index: number) {
    const padding = ROOM_GRID;
    const gap = ROOM_GRID;
    const columns = floor.canvas_width >= 760 ? 2 : 1;
    const width = Math.max(
      220,
      Math.floor(
        ((floor.canvas_width - padding * 2 - gap * (columns - 1)) / columns) /
          ROOM_GRID
      ) * ROOM_GRID
    );
    const height = 220;
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: padding + column * (width + gap),
      y: padding + row * (height + gap),
      width,
      height
    };
  }

  function floorName(level: number): string {
    if (level === 0) return t('Ground floor');
    if (level === 1) return t('First floor');
    if (level === 2) return t('Second floor');
    if (level === 3) return t('Third floor');
    return t('Floor {level}', { level });
  }

  function addFloor() {
    if (!draft || !source) return;
    const level = draft.floors.reduce((highest, floor) => Math.max(highest, floor.level), -1) + 1;
    const floor: ReservationFloor = {
      id: crypto.randomUUID(),
      restaurant_id: source.restaurantId,
      name: floorName(level),
      level,
      canvas_width: 1000,
      canvas_height: 600,
      active: true,
      sort_order: draft.floors.length
    };
    draft.floors = [...draft.floors, floor];
    selectedFloorId = floor.id;
    selectedRoomId = '';
    selectedTableId = '';
    touch();
  }

  function addArea() {
    if (!draft || !selectedFloor || !restaurantContext || workspace.isPreview) return;
    const areas = restaurantContext.draft.areas;
    const id = crypto.randomUUID();
    const area = {
      id,
      name: t('Area {number}', { number: areas.length + 1 }),
      code: '',
      notes: '',
      active: true,
      lunchStart: '',
      lunchEnd: '',
      eveningStart: '',
      eveningEnd: '',
      color: defaultAreaColor(areas.length)
    };
    areas.push(area);
    const geometry = nextAreaGeometry(selectedFloor, floorRooms.length);
    if (geometry.y + geometry.height + ROOM_GRID > selectedFloor.canvas_height) {
      selectedFloor.canvas_height = Math.min(
        1200,
        snap(geometry.y + geometry.height + ROOM_GRID)
      );
    }
    const room: ReservationRoomDraft = {
      id: crypto.randomUUID(),
      work_area_id: id,
      floor_id: selectedFloor.id,
      position_x: geometry.x,
      position_y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      active: true,
      sort_order: draft.rooms.length
    };
    draft.rooms = [...draft.rooms, room];
    selectedRoomId = room.id;
    selectedTableId = '';
    restaurantConfig.touch();
    touch();
  }

  function archiveArea() {
    if (!draft || !selectedRoomDraft || !selectedAreaDraft || !restaurantContext || workspace.isPreview) return;
    const persisted = (workspace.restaurant?.work_areas ?? []).some((area) => area.id === selectedAreaDraft.id);
    if (persisted) {
      selectedAreaDraft.active = false;
      selectedRoomDraft.active = false;
      draft.tables
        .filter((table) => table.room_id === selectedRoomDraft.id)
        .forEach((table) => (table.active = false));
    } else {
      restaurantContext.draft.areas = restaurantContext.draft.areas.filter(
        (area) => area.id !== selectedAreaDraft.id
      );
      restaurantContext.draft.coverage = restaurantContext.draft.coverage.filter(
        (item) => item.areaId !== selectedAreaDraft.id
      );
      draft.rooms = draft.rooms.filter((room) => room.id !== selectedRoomDraft.id);
      draft.tables = draft.tables.filter((table) => table.room_id !== selectedRoomDraft.id);
    }
    restaurantConfig.touch();
    selectedRoomId = '';
    touch();
  }

  function assignRoom(room: ReservationRoom) {
    if (!selectedFloor || !draft) return;
    const target = draft.rooms.find((item) => item.id === room.id);
    if (!target) return;
    const geometry = nextAreaGeometry(selectedFloor, floorRooms.length);
    target.floor_id = selectedFloor.id;
    target.position_x = geometry.x;
    target.position_y = geometry.y;
    target.width = geometry.width;
    target.height = geometry.height;
    if (geometry.y + geometry.height + ROOM_GRID > selectedFloor.canvas_height) {
      selectedFloor.canvas_height = Math.min(
        1200,
        snap(geometry.y + geometry.height + ROOM_GRID)
      );
    }
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

  function resizeRoom(
    room: ReservationRoom,
    positionX: number,
    positionY: number,
    width: number,
    height: number
  ) {
    if (!selectedFloor || !draft) return;
    const target = draft.rooms.find((item) => item.id === room.id);
    if (!target) return;
    target.position_x = clamp(snap(positionX), 0, selectedFloor.canvas_width - 160);
    target.position_y = clamp(snap(positionY), 0, selectedFloor.canvas_height - 120);
    target.width = Math.max(
      160,
      Math.min(selectedFloor.canvas_width - Number(target.position_x), width)
    );
    target.height = Math.max(
      120,
      Math.min(selectedFloor.canvas_height - Number(target.position_y), height)
    );
    touch();
  }

  function resizeFloor(
    width: number,
    height: number,
    originDeltaX: number,
    originDeltaY: number
  ) {
    if (!selectedFloor || !draft) return;
    const currentWidth = selectedFloor.canvas_width;
    const currentHeight = selectedFloor.canvas_height;
    const floorRoomIds = new Set(floorRooms.map((room) => room.id));
    let nextWidth = clamp(snap(width), 400, 1800);
    let nextHeight = clamp(snap(height), 300, 1200);
    let effectiveOriginX = 0;
    let effectiveOriginY = 0;

    if (originDeltaX) {
      const maximumOrigin = floorRooms.length
        ? Math.min(...floorRooms.map((room) => Number(room.position_x) - ROOM_GRID))
        : currentWidth - 400;
      effectiveOriginX = Math.min(currentWidth - nextWidth, maximumOrigin);
      nextWidth = clamp(currentWidth - effectiveOriginX, 400, 1800);
      effectiveOriginX = currentWidth - nextWidth;
    } else {
      const minimumWidth = Math.max(
        400,
        ...floorRooms.map((room) => Number(room.position_x) + Number(room.width) + ROOM_GRID)
      );
      nextWidth = Math.max(minimumWidth, nextWidth);
    }

    if (originDeltaY) {
      const maximumOrigin = floorRooms.length
        ? Math.min(...floorRooms.map((room) => Number(room.position_y) - ROOM_GRID))
        : currentHeight - 300;
      effectiveOriginY = Math.min(currentHeight - nextHeight, maximumOrigin);
      nextHeight = clamp(currentHeight - effectiveOriginY, 300, 1200);
      effectiveOriginY = currentHeight - nextHeight;
    } else {
      const minimumHeight = Math.max(
        300,
        ...floorRooms.map((room) => Number(room.position_y) + Number(room.height) + ROOM_GRID)
      );
      nextHeight = Math.max(minimumHeight, nextHeight);
    }

    if (effectiveOriginX || effectiveOriginY) {
      draft.rooms
        .filter((room) => floorRoomIds.has(room.id))
        .forEach((room) => {
          room.position_x = Number(room.position_x) - effectiveOriginX;
          room.position_y = Number(room.position_y) - effectiveOriginY;
        });
      draft.tables
        .filter((table) => floorRoomIds.has(table.room_id))
        .forEach((table) => {
          table.position_x = Number(table.position_x) - effectiveOriginX;
          table.position_y = Number(table.position_y) - effectiveOriginY;
        });
    }

    selectedFloor.canvas_width = nextWidth;
    selectedFloor.canvas_height = nextHeight;
    touch();
  }

  function moveTable(table: ReservationTableDraft, x: number, y: number) {
    if (!draft) return;
    const room = draft.rooms.find((item) => item.id === table.room_id);
    const target = draft.tables.find((item) => item.id === table.id);
    if (!target || !room) return;
    const inset = 12;
    target.position_x = snap(Math.max(
      Number(room.position_x) + inset,
      Math.min(
        Number(room.position_x) + Number(room.width) - Number(target.width) - inset,
        x
      )
    ), TABLE_GRID);
    target.position_y = snap(Math.max(
      Number(room.position_y) + 28,
      Math.min(
        Number(room.position_y) + Number(room.height) - Number(target.height) - inset,
        y
      )
    ), TABLE_GRID);
    touch();
  }

  function arrangeTables(roomId = selectedRoomId) {
    if (!draft) return;
    const room = draft.rooms.find((item) => item.id === roomId);
    if (!room) return;
    const tables = draft.tables.filter((table) => table.room_id === roomId && table.active);
    const columns = Math.max(1, Math.floor((Number(room.width) - 30) / 155));
    tables.forEach((table, index) => {
      table.position_x = snap(Number(room.position_x) + 30 + (index % columns) * 140, TABLE_GRID);
      table.position_y = snap(Number(room.position_y) + 50 + Math.floor(index / columns) * 110, TABLE_GRID);
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
      position_x: snap(Number(selectedRoomDraft.position_x) + 40 + (roomTables.length % 4) * 140, TABLE_GRID),
      position_y: snap(Number(selectedRoomDraft.position_y) + 50 + Math.floor(roomTables.length / 4) * 110, TABLE_GRID),
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
    if (!workspace.activeId || !draft || (!dirty && !restaurantContext?.dirty) || saving || !canSave()) return;
    saving = true;
    error = '';
    try {
      if (restaurantContext) {
        await restaurantContext.saveVenue(draft, source?.revision ?? 0);
      } else if (dirty) {
        await saveReservationFloorPlans(workspace.activeId, draft, source?.revision ?? 0);
      }
      await load(workspace.activeId);
      toasts.show(t(mode === 'venue' ? 'Venue saved.' : 'Tables saved.'), 'success');
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
    selectedFloorId = draft.floors.find((floor) => floor.active)?.id ?? '';
    selectedRoomId = '';
    selectedTableId = '';
    restaurantContext?.discard();
  }
</script>

<svelte:head><title>{t(mode === 'venue' ? 'Venue' : 'Tables')} &middot; restogogo</title></svelte:head>

{#if error}<div class="floor-error" role="alert">{error}</div>{/if}

<ClassicTablePanel
    dirty={dirty || Boolean(restaurantContext?.dirty)}
    saving={saving || Boolean(restaurantContext?.saving)}
    canSave={!editorReadOnly && canSave() && (restaurantContext?.canSave ?? true)}
    onsave={() => void save()}
    ondiscard={discard}
  >
    {#snippet meta()}
      <span>{t('{count} floors', { count: draft?.floors.filter((floor) => floor.active).length ?? 0 })}</span>
      <span>{t('{count} areas placed', { count: mergedRooms.filter((room) => room.floor_id).length })}</span>
      {#if mode === 'tables'}<span>{t('{count} tables', { count: draft?.tables.filter((table) => table.active).length ?? 0 })}</span>{/if}
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
                {#if mode === 'venue'}<button class="cl-btn is-icon" type="button" aria-label={t('Add floor')} disabled={editorReadOnly} onclick={addFloor}>+</button>{/if}
              </div>
              <div class="floor-list">
                {#each draft.floors.filter((floor) => floor.active) as floor (floor.id)}
                  <button class:is-active={floor.id === selectedFloorId} type="button" onclick={() => {
                    selectedFloorId = floor.id;
                    selectedRoomId = '';
                    selectedTableId = '';
                  }}>
                    <strong>{floor.name}</strong>
                    <small>{mergedRooms.filter((room) => room.floor_id === floor.id).length} {t('areas')}</small>
                  </button>
                {/each}
              </div>
            </section>

            <section class="cl-card">
              <div class="cl-card__head">
                <div><h2>{t(mode === 'venue' ? 'Venue areas' : 'Dining areas')}</h2><p>{mode === 'venue' ? t('Place each operational area on its physical floor.') : t('Select an area, then add and arrange its tables.')}</p></div>
                {#if mode === 'venue'}<button class="cl-btn is-icon" type="button" aria-label={t('Add area')} disabled={!selectedFloor || editorReadOnly} onclick={addArea}>+</button>{/if}
              </div>
              <div class="area-list">
                {#each mergedRooms as room (room.id)}
                  {@const floor = draft.floors.find((item) => item.id === room.floor_id)}
                  <button
                    class:is-active={room.id === selectedRoomId}
                    type="button"
                    style={`--area-color:${room.area_color || 'var(--cl-info)'}`}
                    onclick={() => room.floor_id ? (
                      selectedFloorId = room.floor_id,
                      selectedRoomId = room.id,
                      selectedTableId = ''
                    ) : mode === 'venue' ? assignRoom(room) : undefined}
                  >
                    <i></i>
                    <span><strong>{room.name}</strong><small>{floor?.name || t('Not placed')}</small></span>
                    {#if !room.floor_id && mode === 'venue'}<em>+</em>{/if}
                  </button>
                {/each}
                {#if !mergedRooms.length}
                  <div class="area-empty">
                    <strong>{t('No reservable areas')}</strong>
                    <span>{mode === 'venue' ? t('Add the first area directly to the selected floor.') : t('Create an active area in Restaurant first.')}</span>
                  </div>
                {/if}
              </div>
            </section>
          </aside>

          <section class="cl-card plan-card">
            {#if selectedFloor}
              <div class="cl-card__head plan-head">
                <div class="floor-title">
                  {#if mode === 'venue'}
                    <input class="floor-name" aria-label={t('Floor name')} readonly={editorReadOnly} bind:value={selectedFloor.name} oninput={touch} />
                  {:else}
                    <h2>{selectedFloor.name}</h2>
                  {/if}
                  <p>{mode === 'venue' ? t('Drag and resize areas to match the real venue.') : t('Add real tables inside the areas defined by Restaurant.')}</p>
                </div>
              </div>

              {#if selectedRoomDraft && selectedRoom && selectedAreaDraft && mode === 'venue'}
                <div class="selection-bar room-selection is-above">
                  <label class="area-name"><span>{t('Area name')}</span><input class="cl-field" disabled={editorReadOnly} bind:value={selectedAreaDraft.name} oninput={() => restaurantConfig.touch()} /></label>
                  <label class="area-code"><span>{t('Code')}</span><input class="cl-field" disabled={editorReadOnly} placeholder={t('Optional')} bind:value={selectedAreaDraft.code} oninput={() => restaurantConfig.touch()} /></label>
                  <div class="area-colour"><span>{t('Colour')}</span><ClassicPalettePicker value={selectedAreaDraft.color} palette={AREA_PALETTE} label={t('Choose area colour')} disabled={editorReadOnly} onselect={(color) => { selectedAreaDraft.color = color; restaurantConfig.touch(); }} /></div>
                  <span class="resize-note">{t('Snaps to the grid and nearby areas.')}</span>
                  <button class="cl-btn is-problem" type="button" disabled={editorReadOnly} onclick={archiveArea}>{t('Archive')}</button>
                </div>
              {:else if mode === 'venue'}
                <div class="selection-hint is-above">{t('Select an area to move it or resize from any edge or corner.')}</div>
              {/if}

              {#if mode === 'tables' && selectedTable}
                <div class="selection-bar table-selection is-above">
                  <label><span>{t('Table')}</span><input class="cl-field" disabled={editorReadOnly} bind:value={selectedTable.label} oninput={touch} /></label>
                  <label><span>{t('Minimum')}</span><input class="cl-field" disabled={editorReadOnly} type="number" min="1" max="100" bind:value={selectedTable.minimum_capacity} oninput={touch} /></label>
                  <label><span>{t('Maximum')}</span><input class="cl-field" disabled={editorReadOnly} type="number" min="1" max="500" bind:value={selectedTable.maximum_capacity} oninput={touch} /></label>
                  <label><span>{t('Shape')}</span><select class="cl-field" disabled={editorReadOnly} bind:value={selectedTable.shape} onchange={touch}><option value="round">{t('Round')}</option><option value="square">{t('Square')}</option><option value="rectangle">{t('Rectangle')}</option></select></label>
                  <button class="cl-btn" type="button" disabled={editorReadOnly} onclick={() => {
                    selectedTable.rotation_degrees = (Number(selectedTable.rotation_degrees) + 15) % 360;
                    touch();
                  }}>{t('Rotate 15°')}</button>
                  <button class="cl-btn" type="button" disabled={editorReadOnly} onclick={() => duplicateTable(selectedTable)}>{t('Duplicate')}</button>
                  <button class="cl-btn is-problem" type="button" disabled={editorReadOnly} onclick={() => (tableToArchive = selectedTable)}>{t('Archive')}</button>
                </div>
              {:else if selectedRoomDraft && selectedRoom && mode === 'tables'}
                <div class="selection-bar room-selection is-above">
                  <div><span>{t('Selected area')}</span><strong>{selectedRoom.name}</strong></div>
                  <span class="resize-note">{t('Tables snap into a clean alignment as you drag.')}</span>
                  <button class="cl-btn" type="button" disabled={editorReadOnly} onclick={() => arrangeTables()}>{t('Arrange tables')}</button>
                  <button class="cl-btn is-primary" type="button" disabled={editorReadOnly} onclick={addTable}>+ {t('Add table')}</button>
                </div>
              {:else if mode === 'tables'}
                <div class="selection-hint is-above">{t('Select an area to add tables, then drag each table into place.')}</div>
              {/if}

              {#if compactViewport}
                <div class="compact-notice" role="status">
                  <strong>{t('View only on small screens')}</strong>
                  <span>{t('Use a tablet or desktop to move, resize or add venue elements.')}</span>
                </div>
              {/if}

              <div class="venue-canvas">
                <ReservationFloorPlan
                  tables={mode === 'venue' ? [] : floorTables}
                  rooms={floorRooms}
                  roomName={selectedFloor.name}
                  floorWidth={selectedFloor.canvas_width}
                  floorHeight={selectedFloor.canvas_height}
                  editable={!editorReadOnly}
                  showHeader={false}
                  floorEditable={mode === 'venue' && !editorReadOnly}
                  roomsEditable={mode === 'venue' && !editorReadOnly}
                  tablesEditable={mode === 'tables' && !editorReadOnly}
                  {selectedRoomId}
                  {selectedTableId}
                  emptyMessage="Place an area on this floor, then add its tables."
                  onroomselect={(room) => {
                    selectedRoomId = room.id;
                    selectedTableId = '';
                  }}
                  onroommove={mode === 'venue' ? moveRoom : () => {}}
                  onroomresize={mode === 'venue' ? resizeRoom : () => {}}
                  onfloorresize={mode === 'venue' ? resizeFloor : () => {}}
                  onselect={(table) => {
                    selectedTableId = table.id;
                    selectedRoomId = table.room_id;
                  }}
                  onmove={mode === 'tables' ? moveTable : () => {}}
                />
              </div>

            {:else}
              <div class="cl-empty">
                <strong>{t('Create your first floor')}</strong>
                <span>{mode === 'venue' ? t('Create the physical levels of the restaurant, then place areas.') : t('Build the venue in Restaurant → Venue before adding tables.')}</span>
                {#if mode === 'venue'}
                  <button class="cl-btn is-primary" type="button" disabled={editorReadOnly} onclick={addFloor}>{t('Add floor')}</button>
                {:else}
                  <a class="cl-btn is-primary" href="/restaurant/areas">{t('Open Restaurant Venue')}</a>
                {/if}
              </div>
            {/if}
          </section>
        </div>
      {/if}
    {/snippet}
</ClassicTablePanel>

<Dialog open={Boolean(tableToArchive)} title="Archive table" description="Past reservations keep their table history." size="small" onclose={() => (tableToArchive = null)}>
  {#snippet children()}<p class="dialog-copy">{t('Archive table {label}?', { label: tableToArchive?.label ?? '' })}</p>{/snippet}
  {#snippet footer()}
    <button class="cl-btn" type="button" onclick={() => (tableToArchive = null)}>{t('Cancel')}</button>
    <button class="cl-btn is-problem" type="button" onclick={archiveTable}>{t('Archive table')}</button>
  {/snippet}
</Dialog>

<style>
  .compact-notice { display: grid; gap: 2px; padding: 10px 12px; border-top: 1px solid var(--cl-line); border-bottom: 1px solid var(--cl-line); background: var(--cl-attention-wash); color: var(--cl-ink); font-size: 11px; }
  .compact-notice strong { font-size: 11.5px; }
  .compact-notice span { color: var(--cl-muted); line-height: 1.4; }
  .floor-error { padding: 10px 12px; border: 1px solid var(--cl-problem-line); border-left: 3px solid var(--cl-problem); border-radius: var(--cl-radius); background: var(--cl-problem-wash); color: var(--cl-problem); font-size: 12px; }
  .floor-loading { display: grid; gap: 16px; padding: 24px; }
  .venue-editor { display: grid; grid-template-columns: 232px minmax(640px, 1fr); gap: 16px; align-items: start; }
  .venue-sidebar { display: grid; gap: 12px; }
  .cl-card__head > div { display: grid; gap: 2px; }
  .cl-card__head p { margin: 0; color: var(--cl-muted); font-size: 10.5px; line-height: 1.4; }
  .floor-list, .area-list { display: grid; gap: 3px; padding: 7px; }
  .floor-list > button {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 8px;
    padding: 9px 10px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .floor-list > button:hover, .area-list > button:hover { border-color: var(--cl-line); background: var(--cl-surface-muted); }
  .floor-list > button.is-active { border-color: color-mix(in srgb, var(--cl-accent) 35%, var(--cl-line)); background: var(--cl-accent-wash); box-shadow: inset 3px 0 var(--cl-accent); }
  .floor-list strong { grid-column: 1; font-size: 12px; }
  .floor-list small { grid-column: 2; grid-row: 1 / 3; align-self: center; color: var(--cl-muted); font-size: 9.5px; }
  .area-list > button {
    display: grid;
    grid-template-columns: 7px minmax(0, 1fr) 22px;
    align-items: center;
    gap: 9px;
    padding: 8px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .area-list > button.is-active { border-color: color-mix(in srgb, var(--area-color, var(--cl-info)) 38%, var(--cl-line)); background: color-mix(in srgb, var(--area-color, var(--cl-info)) 7%, var(--cl-surface)); }
  .area-list i { width: 7px; height: 30px; border-radius: 3px; background: var(--area-color); box-shadow: inset 0 0 0 1px rgb(15 23 42 / 12%); }
  .area-list button > span { display: grid; gap: 1px; }
  .area-list strong { font-size: 11.5px; }
  .area-list small { color: var(--cl-muted); font-size: 9.5px; }
  .area-list em { width: 21px; height: 21px; display: grid; place-items: center; border: 1px solid var(--cl-line); border-radius: 4px; color: var(--cl-accent); font-style: normal; font-weight: var(--rst-fw-bold); }
  .area-empty { display: grid; gap: 4px; padding: 14px 8px; color: var(--cl-muted); font-size: 10.5px; }
  .area-empty strong { color: var(--cl-ink); font-size: 11.5px; }
  .plan-card { min-width: 0; overflow: hidden; border-color: var(--cl-line-strong); }
  .plan-head { gap: 16px; }
  .floor-title { min-width: 0; flex: 1; }
  .floor-name {
    width: min(280px, 100%);
    padding: 1px 3px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--cl-ink);
    font: inherit;
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
  }
  .floor-name:hover, .floor-name:focus { border-color: var(--cl-line); background: var(--cl-surface); outline: none; }
  .venue-canvas { padding: 0; border-top: 0; background: var(--cl-surface-muted); }
  .selection-bar {
    min-height: 58px;
    display: flex;
    align-items: end;
    gap: 7px;
    padding: 8px 10px;
    border-top: 1px solid var(--cl-line);
    background: color-mix(in srgb, var(--cl-surface) 92%, var(--cl-surface-muted));
  }
  .selection-bar.is-above { border-top: 1px solid var(--cl-line); border-bottom: 1px solid var(--cl-line); }
  .selection-bar label { display: grid; gap: 2px; }
  .selection-bar label span, .room-selection > div span { color: var(--cl-muted); font-size: 8.5px; font-weight: var(--rst-fw-bold); }
  .selection-bar input { width: 70px; }
  .selection-bar label:first-child input { width: 100px; }
  .selection-bar select { min-width: 100px; }
  .selection-bar .cl-btn:nth-last-child(3) { margin-left: auto; }
  .room-selection > div:not(.area-colour) { min-width: 140px; display: grid; gap: 2px; align-self: center; margin-right: auto; }
  .room-selection > div:not(.area-colour) strong { font-size: 12px; }
  .room-selection .area-name input { width: 160px; }
  .room-selection .area-code input { width: 90px; }
  .area-colour { min-width: 50px; display: grid; gap: 4px; align-self: center; }
  .area-colour > span { color: var(--cl-muted); font-size: 8.5px; font-weight: var(--rst-fw-bold); }
  .resize-note { margin-left: auto; align-self: center; color: var(--cl-muted); font-size: 9.5px; }
  .selection-hint { padding: 12px; border-top: 1px solid var(--cl-line); color: var(--cl-muted); font-size: 10.5px; text-align: center; }
  .selection-hint.is-above { border-bottom: 1px solid var(--cl-line); background: color-mix(in srgb, var(--cl-surface) 92%, var(--cl-surface-muted)); }
  .table-selection .cl-btn:nth-last-child(3) { margin-left: auto; }
  .dialog-copy { margin: 0; color: var(--cl-muted); font-size: 12px; }
  .cl-btn.is-problem { border-color: var(--cl-problem-line); background: var(--cl-problem-wash); color: var(--cl-problem); }
  @media (max-width: 980px) {
    .venue-editor { grid-template-columns: minmax(0, 1fr); }
    .venue-sidebar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 760px) {
    .venue-sidebar { grid-template-columns: minmax(0, 1fr); }
    .plan-head, .selection-bar { align-items: stretch; flex-wrap: wrap; }
  }
</style>
