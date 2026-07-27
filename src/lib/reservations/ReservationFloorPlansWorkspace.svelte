<script lang="ts">
  import { onMount } from 'svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import Dialog from '$lib/components/Dialog.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicPalettePicker from '$lib/classic/ClassicPalettePicker.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
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
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { AREA_PALETTE, defaultAreaColor } from '$lib/ui/position-color';
  import {
    WORKSPACE_AREA_CATALOGUE,
    workspaceAreaByKey
  } from '$lib/restaurant/workspace-catalogue';
  import WorkspaceAreaIcon from '$lib/restaurant/WorkspaceAreaIcon.svelte';

  let {
    mode = 'tables',
    restaurantContext = null
  }: {
    mode?: 'areas' | 'tables';
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
  let areaPickerOpen = $state(false);
  let areaCatalogueSearch = $state('');
  let customAreaName = $state('');
  let compactViewport = $state(false);
  let editorView = $state<'plan' | 'list'>('plan');
  const ROOM_GRID = 20;
  const TABLE_GRID = 10;
  const editorReadOnly = $derived(compactViewport || workspace.isPreview);
  const availableCatalogueAreas = $derived.by(() => {
    const term = areaCatalogueSearch.trim().toLowerCase();
    return WORKSPACE_AREA_CATALOGUE.filter(
      (area) =>
        (!term ||
          area.label.toLowerCase().includes(term) ||
          area.category.toLowerCase().includes(term))
    );
  });

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
            area?.color ??
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
  const orderedAreaRooms = $derived(
    [...mergedRooms].sort((left, right) => {
      const leftFloor = draft?.floors.find((floor) => floor.id === left.floor_id);
      const rightFloor = draft?.floors.find((floor) => floor.id === right.floor_id);
      return (
        (leftFloor?.sort_order ?? Number.MAX_SAFE_INTEGER) -
          (rightFloor?.sort_order ?? Number.MAX_SAFE_INTEGER) ||
        Number(left.position_y) - Number(right.position_y) ||
        Number(left.position_x) - Number(right.position_x) ||
        left.name.localeCompare(right.name)
      );
    })
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
  const selectedAreaType = $derived(
    workspaceAreaByKey.get(selectedAreaDraft?.catalogueKey ?? '') ?? null
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
    const activeAreaIds = new Set(
      value.areas.filter((area) => area.active).map((area) => area.id)
    );
    const rooms = value.rooms.map((room) => ({
      id: room.id,
      work_area_id: room.work_area_id,
      floor_id: room.floor_id,
      position_x: Number(room.position_x),
      position_y: Number(room.position_y),
      width: Number(room.width),
      height: Number(room.height),
      // A room is the stable spatial identity of an active work area. Revive
      // archived legacy rooms in Areas rather than generating a duplicate ID.
      active: mode === 'areas' && activeAreaIds.has(room.work_area_id) ? true : room.active,
      sort_order: room.sort_order
    }));
    if (mode === 'areas') {
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
    if (mode === 'areas' && !floors.some((floor) => floor.active)) {
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

  function areaIconFor(areaId: string): string {
    return restaurantContext?.draft.areas.find((area) => area.id === areaId)?.iconKey ?? '';
  }

  function floorCountLabel(count: number): string {
    return count === 1 ? t('1 floor') : t('{count} floors', { count });
  }

  function areaCountLabel(count: number): string {
    return count === 1 ? t('1 area') : t('{count} areas', { count });
  }

  function tableCountLabel(count: number): string {
    return count === 1 ? t('1 table') : t('{count} tables', { count });
  }

  function uniqueAreaName(base: string): string {
    const fallback = t('Area {number}', {
      number: (restaurantContext?.draft.areas.length ?? 0) + 1
    });
    const clean = base.trim() || fallback;
    const names = new Set(
      (restaurantContext?.draft.areas ?? []).map((area) => area.name.trim().toLowerCase())
    );
    if (!names.has(clean.toLowerCase())) return clean;
    let suffix = 2;
    while (names.has(`${clean} ${suffix}`.toLowerCase())) suffix += 1;
    return `${clean} ${suffix}`;
  }

  function positionCountForArea(areaId: string): number {
    return (
      restaurantContext?.draft.jobFunctions.filter(
        (position) =>
          position.active &&
          (position.primaryAreaId === areaId || position.areaIds.includes(areaId))
      ).length ?? 0
    );
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

  async function archiveFloor() {
    if (!draft || !source || !selectedFloor || editorReadOnly) return;
    const activeFloors = draft.floors.filter((floor) => floor.active);
    if (activeFloors.length <= 1) {
      toasts.show(t('A restaurant needs at least one floor.'), 'warning');
      return;
    }
    if (floorRooms.length) {
      toasts.show(t('Move or archive the areas on this floor first.'), 'warning');
      return;
    }
    const confirmed = await confirmAction({
      title: t('Archive {name}?', { name: selectedFloor.name }),
      body: t('The floor disappears from the active plan. You can keep its operational areas by moving them first.'),
      confirmLabel: t('Archive floor')
    });
    if (!confirmed) return;
    const nextFloor = activeFloors.find((floor) => floor.id !== selectedFloor.id);
    if (source.floors.some((floor) => floor.id === selectedFloor.id)) {
      selectedFloor.active = false;
    } else {
      draft.floors = draft.floors.filter((floor) => floor.id !== selectedFloor.id);
    }
    selectedFloorId = nextFloor?.id ?? '';
    selectedRoomId = '';
    selectedTableId = '';
    touch();
  }

  function addArea(catalogueKey = '', customName = '') {
    if (!draft || !selectedFloor || !restaurantContext || workspace.isPreview) return;
    const areas = restaurantContext.draft.areas;
    const catalogue = workspaceAreaByKey.get(catalogueKey);
    const id = crypto.randomUUID();
    const area = {
      id,
      name: uniqueAreaName(catalogue?.label ?? customName),
      code: '',
      notes: '',
      active: true,
      lunchStart: '',
      lunchEnd: '',
      eveningStart: '',
      eveningEnd: '',
      color: catalogue?.color ?? defaultAreaColor(areas.length),
      catalogueKey: catalogue?.key ?? '',
      iconKey: catalogue?.icon ?? ''
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
    areaPickerOpen = false;
    areaCatalogueSearch = '';
    customAreaName = '';
  }

  function addCustomArea() {
    if (!customAreaName.trim()) return;
    addArea('', customAreaName);
  }

  async function archiveArea() {
    if (!draft || !selectedRoomDraft || !selectedAreaDraft || !restaurantContext || workspace.isPreview) return;
    const linkedPositions = positionCountForArea(selectedAreaDraft.id);
    const linkedTables = draft.tables.filter(
      (table) => table.room_id === selectedRoomDraft.id && table.active
    ).length;
    const confirmed = await confirmAction({
      title: t('Archive {name}?', { name: selectedAreaDraft.name }),
      body: t(
        'This removes the area from Planning and Staffing, unlinks {positions} positions and archives {tables} reservation tables.',
        { positions: linkedPositions, tables: linkedTables }
      ),
      confirmLabel: t('Archive area')
    });
    if (!confirmed) return;
    const archivedAreaId = selectedAreaDraft.id;
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
      draft.rooms = draft.rooms.filter((room) => room.id !== selectedRoomDraft.id);
      draft.tables = draft.tables.filter((table) => table.room_id !== selectedRoomDraft.id);
    }
    restaurantContext.draft.coverage = restaurantContext.draft.coverage.filter(
      (item) => item.areaId !== archivedAreaId
    );
    for (const position of restaurantContext.draft.jobFunctions) {
      position.areaIds = position.areaIds.filter((areaId) => areaId !== archivedAreaId);
      if (position.primaryAreaId === archivedAreaId) {
        position.primaryAreaId = position.areaIds[0] ?? '';
      }
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
        await restaurantContext.saveAreas(draft, source?.revision ?? 0);
      } else if (dirty) {
        await saveReservationFloorPlans(workspace.activeId, draft, source?.revision ?? 0);
      }
      await load(workspace.activeId);
      toasts.show(t(mode === 'areas' ? 'Areas saved.' : 'Tables saved.'), 'success');
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

<svelte:head><title>{t(mode === 'areas' ? 'Areas' : 'Tables')} &middot; restogogo</title></svelte:head>

{#if error}<div class="floor-error" role="alert">{error}</div>{/if}

<ClassicTablePanel
    dirty={dirty || Boolean(restaurantContext?.dirty)}
    saving={saving || Boolean(restaurantContext?.saving)}
    canSave={!editorReadOnly && canSave() && (restaurantContext?.canSave ?? true)}
    onsave={() => void save()}
    ondiscard={discard}
  >
    {#snippet meta()}
      <span>{floorCountLabel(draft?.floors.filter((floor) => floor.active).length ?? 0)}</span>
      <span>{t('{count} areas', { count: mergedRooms.length })}</span>
      {#if mode === 'tables'}<span>{tableCountLabel(draft?.tables.filter((table) => table.active).length ?? 0)}</span>{/if}
    {/snippet}
    {#snippet actions()}
      {#if mode === 'areas'}
        <div class="view-switch" aria-label={t('View')}>
          <button class:is-active={editorView === 'plan'} type="button" onclick={() => (editorView = 'plan')}>{t('Plan')}</button>
          <button class:is-active={editorView === 'list'} type="button" onclick={() => (editorView = 'list')}>{t('List')}</button>
        </div>
        <button class="cl-btn" type="button" disabled={editorReadOnly} onclick={addFloor}>+ {t('Add floor')}</button>
        <button class="cl-btn is-primary" type="button" disabled={!selectedFloor || editorReadOnly} onclick={() => (areaPickerOpen = true)}>+ {t('Add area')}</button>
      {/if}
    {/snippet}
    {#snippet children()}
      {#if loading && !draft}
        <div class="floor-loading"><span class="cl-skel"></span><span class="cl-skel"></span></div>
      {:else if draft}
        {#if mode === 'areas' && editorView === 'list'}
          <div class="cl-tablewrap area-directory">
            <table class="cl-table">
              <thead>
                <tr>
                  <th>{t('Area')}</th>
                  <th>{t('Floor')}</th>
                  <th>{t('Type')}</th>
                  <th class="is-num">{t('Positions')}</th>
                  <th>{t('Status')}</th>
                  <th aria-label={t('Actions')}></th>
                </tr>
              </thead>
              <tbody>
                {#each orderedAreaRooms as room (room.id)}
                  {@const floor = draft.floors.find((item) => item.id === room.floor_id)}
                  {@const areaDraft = restaurantContext?.draft.areas.find((area) => area.id === room.work_area_id)}
                  {@const areaType = workspaceAreaByKey.get(areaDraft?.catalogueKey ?? '')}
                  <tr class:is-attention={!room.floor_id}>
                    <td>
                      <span class="cl-table__name">
                        <WorkspaceAreaIcon icon={areaIconFor(room.work_area_id)} color={room.area_color} size={18} />
                        <span class="cl-cellstack"><strong>{room.name}</strong><small class="cl-cellsub">{areaType ? t(areaType.reservable ? 'Guest-facing' : 'Operations') : t('Custom area')}</small></span>
                      </span>
                    </td>
                    <td class:is-quiet={!floor}>{floor?.name ?? t('Not placed')}</td>
                    <td class="is-quiet">{areaType ? t(areaType.label) : t('Custom')}</td>
                    <td class="is-num">{positionCountForArea(room.work_area_id)}</td>
                    <td><ClassicStatus label={floor ? 'Active' : 'Needs placement'} tone={floor ? 'ok' : 'attention'} /></td>
                    <td class="is-num">
                      <button class="row-open" type="button" onclick={() => {
                        if (room.floor_id) selectedFloorId = room.floor_id;
                        else assignRoom(room);
                        selectedRoomId = room.id;
                        selectedTableId = '';
                        editorView = 'plan';
                      }}>{t(floor ? 'Open plan' : 'Place')}</button>
                    </td>
                  </tr>
                {:else}
                  <tr><td colspan="6"><div class="cl-empty"><strong>{t('No areas yet')}</strong><span>{t('Add a standard area to start shaping your restaurant.')}</span></div></td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
        <div class="area-editor">
          <nav class="plan-commandbar" aria-label={t('Floors')}>
            <div class="floor-list">
              {#each draft.floors.filter((floor) => floor.active) as floor (floor.id)}
                <button class:is-active={floor.id === selectedFloorId} type="button" onclick={() => {
                  selectedFloorId = floor.id;
                  selectedRoomId = '';
                  selectedTableId = '';
                }}>
                  <strong>{floor.name}</strong>
                  <small>{mergedRooms.filter((room) => room.floor_id === floor.id).length}</small>
                </button>
              {/each}
            </div>
            <span class="plan-commandbar__hint">{t(mode === 'areas' ? 'Snap to grid is on' : 'Select an area to arrange its tables')}</span>
          </nav>

          <section class="cl-card plan-card">
            {#if selectedFloor}
              <div class="cl-card__head plan-head">
                <div class="floor-title">
                  {#if mode === 'areas'}
                    <input class="floor-name" aria-label={t('Floor name')} readonly={editorReadOnly} bind:value={selectedFloor.name} oninput={touch} />
                  {:else}
                    <h2>{selectedFloor.name}</h2>
                  {/if}
                  <p>{mode === 'areas' ? t('Drag and resize areas to match the restaurant.') : t('Add real tables inside the areas defined by Restaurant.')}</p>
                </div>
              </div>

              {#if selectedRoomDraft && selectedRoom && selectedAreaDraft && mode === 'areas'}
                <div class="selection-bar room-selection is-above">
                  <header class="inspector-head">
                    <WorkspaceAreaIcon icon={areaIconFor(selectedRoom.work_area_id)} color={selectedRoom.area_color} size={20} />
                    <div><strong>{t('Area details')}</strong><small>{selectedAreaType ? t(selectedAreaType.label) : t('Custom area')}</small></div>
                  </header>
                  <label class="area-name"><span>{t('Area name')}</span><input class="cl-field" disabled={editorReadOnly} bind:value={selectedAreaDraft.name} oninput={() => restaurantConfig.touch()} /></label>
                  <div class="area-colour"><span>{t('Colour identity')}</span><div><ClassicPalettePicker value={selectedAreaDraft.color} palette={AREA_PALETTE} label={t('Choose area colour')} disabled={editorReadOnly} onselect={(color) => { selectedAreaDraft.color = color; restaurantConfig.touch(); }} /><small>{t('Shared with linked positions and Planning.')}</small></div></div>
                  <dl class="inspector-stats">
                    <div><dt>{t('Floor')}</dt><dd>{selectedFloor.name}</dd></div>
                    <div><dt>{t('Positions')}</dt><dd>{positionCountForArea(selectedAreaDraft.id)}</dd></div>
                  </dl>
                  <p class="resize-note">{t('Drag to move. Pull any edge or corner to reshape; nearby areas align automatically.')}</p>
                  <button class="cl-btn is-problem" type="button" disabled={editorReadOnly} onclick={() => void archiveArea()}>{t('Archive area')}</button>
                </div>
              {:else if mode === 'areas'}
                <div class="selection-hint is-above">
                  <strong>{t('Floor details')}</strong>
                  <label><span>{t('Floor name')}</span><input class="cl-field" readonly={editorReadOnly} bind:value={selectedFloor.name} oninput={touch} /></label>
                  <p>{t('Select an area on the plan to edit it. Pull any outside edge or corner to reshape this floor.')}</p>
                  {#if draft.floors.filter((floor) => floor.active).length > 1}
                    <button class="quiet-danger" type="button" disabled={editorReadOnly || Boolean(floorRooms.length)} onclick={() => void archiveFloor()}>{t('Archive floor')}</button>
                  {/if}
                </div>
              {/if}

              {#if mode === 'tables' && selectedTable}
                <div class="selection-bar table-selection is-above">
                  <header class="inspector-head"><span class="inspector-glyph" aria-hidden="true">T</span><div><strong>{t('Table details')}</strong><small>{selectedRoom?.name ?? selectedFloor.name}</small></div></header>
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
                  <header class="inspector-head"><WorkspaceAreaIcon icon={areaIconFor(selectedRoom.work_area_id)} color={selectedRoom.area_color} size={20} /><div><strong>{selectedRoom.name}</strong><small>{t('Dining area')}</small></div></header>
                  <p class="resize-note">{t('Tables snap into a clean alignment as you drag.')}</p>
                  <button class="cl-btn" type="button" disabled={editorReadOnly} onclick={() => arrangeTables()}>{t('Arrange tables')}</button>
                  <button class="cl-btn is-primary" type="button" disabled={editorReadOnly} onclick={addTable}>+ {t('Add table')}</button>
                </div>
              {:else if mode === 'tables'}
                <div class="selection-hint is-above"><strong>{t('Choose an area')}</strong><p>{t('Select an area on the plan to add and arrange its tables.')}</p></div>
              {/if}

              {#if compactViewport}
                <div class="compact-notice" role="status">
                  <strong>{t('View only on small screens')}</strong>
                  <span>{t('Use a tablet or desktop to move, resize or add areas.')}</span>
                </div>
              {/if}

              <div class="area-canvas">
                <ReservationFloorPlan
                  tables={mode === 'areas' ? [] : floorTables}
                  rooms={floorRooms}
                  roomName={selectedFloor.name}
                  floorWidth={selectedFloor.canvas_width}
                  floorHeight={selectedFloor.canvas_height}
                  editable={!editorReadOnly}
                  showHeader={false}
                  floorEditable={mode === 'areas' && !editorReadOnly}
                  roomsEditable={mode === 'areas' && !editorReadOnly}
                  tablesEditable={mode === 'tables' && !editorReadOnly}
                  showTableCount={mode === 'tables'}
                  {selectedRoomId}
                  {selectedTableId}
                  emptyMessage="Place an area on this floor, then add its tables."
                  onroomselect={(room) => {
                    selectedRoomId = room.id;
                    selectedTableId = '';
                  }}
                  onroommove={mode === 'areas' ? moveRoom : () => {}}
                  onroomresize={mode === 'areas' ? resizeRoom : () => {}}
                  onfloorresize={mode === 'areas' ? resizeFloor : () => {}}
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
                <span>{mode === 'areas' ? t('Create the physical levels of the restaurant, then place areas.') : t('Set up areas in Restaurant → Areas before adding tables.')}</span>
                {#if mode === 'areas'}
                  <button class="cl-btn is-primary" type="button" disabled={editorReadOnly} onclick={addFloor}>{t('Add floor')}</button>
                {:else}
                  <a class="cl-btn is-primary" href="/restaurant/areas">{t('Open Restaurant Areas')}</a>
                {/if}
              </div>
            {/if}
          </section>
        </div>
      {/if}
      {/if}
    {/snippet}
</ClassicTablePanel>

<Dialog
  open={areaPickerOpen}
  title="Add an area"
  description="Choose a standard restaurant area. Its colour becomes the shared identity used by positions, Planning and Reservations."
  size="large"
  onclose={() => (areaPickerOpen = false)}
>
  {#snippet children()}
    <div class="catalogue-picker">
      <label class="catalogue-search">
        <span>{t('Search areas')}</span>
        <input
          class="cl-field"
          type="search"
          placeholder={t('Search by name or category')}
          bind:value={areaCatalogueSearch}
        />
      </label>
      <div class="catalogue-grid">
        {#each availableCatalogueAreas as item (item.key)}
          <button type="button" style={`--catalogue-color:${item.color}`} onclick={() => addArea(item.key)}>
            <WorkspaceAreaIcon icon={item.icon} color={item.color} size={17} />
            <span><strong>{item.label}</strong><small>{item.category}</small></span>
          </button>
        {:else}
          <p class="catalogue-empty">{t('No standard area matches this search.')}</p>
        {/each}
      </div>
      <div class="custom-area">
        <div>
          <strong>{t('Need a special area?')}</strong>
          <span>{t('Custom areas remain available, but standard areas keep reporting consistent.')}</span>
        </div>
        <input class="cl-field" placeholder={t('Custom area name')} bind:value={customAreaName} />
        <button class="cl-btn" type="button" disabled={!customAreaName.trim()} onclick={addCustomArea}>
          {t('Add custom')}
        </button>
      </div>
    </div>
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
  .compact-notice { display: grid; gap: 2px; padding: 10px 12px; border-top: 1px solid var(--cl-line); border-bottom: 1px solid var(--cl-line); background: var(--cl-attention-wash); color: var(--cl-ink); font-size: 11px; }
  .compact-notice strong { font-size: 11.5px; }
  .compact-notice span { color: var(--cl-muted); line-height: 1.4; }
  .floor-error { padding: 10px 12px; border: 1px solid var(--cl-problem-line); border-left: 3px solid var(--cl-problem); border-radius: var(--cl-radius); background: var(--cl-problem-wash); color: var(--cl-problem); font-size: 12px; }
  .floor-loading { display: grid; gap: 16px; padding: 24px; }
  .view-switch { display: inline-flex; align-items: center; padding: 2px; border: 1px solid var(--cl-line); border-radius: var(--cl-radius); background: var(--cl-surface-muted); }
  .view-switch button { min-height: 30px; padding: 5px 12px; border: 0; border-radius: calc(var(--cl-radius) - 2px); background: transparent; color: var(--cl-muted); font: inherit; font-size: 12px; font-weight: var(--rst-fw-medium); cursor: pointer; }
  .view-switch button.is-active { background: var(--cl-surface); color: var(--cl-ink); box-shadow: 0 1px 3px rgb(15 23 42 / 10%); }
  .area-directory { --cl-grid-max-height: calc(100dvh - 190px); }
  .area-directory .cl-table { min-width: 760px; }
  .row-open { padding: 5px 8px; border: 0; border-radius: 5px; background: transparent; color: var(--cl-accent); font: inherit; font-size: 12px; font-weight: var(--rst-fw-bold); cursor: pointer; }
  .row-open:hover { background: var(--cl-accent-wash); }
  .area-editor { min-width: 0; display: grid; gap: 10px; }
  .plan-commandbar { min-width: 0; min-height: 46px; display: flex; align-items: center; gap: 12px; padding: 6px 8px; overflow: hidden; border: 1px solid var(--cl-line); border-radius: var(--cl-radius-surface); background: var(--cl-surface); }
  .plan-commandbar__hint { margin-left: auto; padding-right: 6px; color: var(--cl-muted); font-size: 11px; white-space: nowrap; }
  .floor-list { min-width: 0; display: flex; align-items: center; gap: 4px; overflow-x: auto; scrollbar-width: none; }
  .floor-list::-webkit-scrollbar { display: none; }
  .floor-list > button {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 9px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: inherit;
    font: inherit;
    white-space: nowrap;
    cursor: pointer;
  }
  .floor-list > button:hover { border-color: var(--cl-line); background: var(--cl-surface-muted); }
  .floor-list > button.is-active { border-color: color-mix(in srgb, var(--cl-accent) 28%, var(--cl-line)); background: var(--cl-accent-wash); color: var(--cl-accent); }
  .floor-list strong { font-size: 12px; }
  .floor-list small { min-width: 18px; height: 18px; display: grid; place-items: center; border-radius: 999px; background: color-mix(in srgb, var(--cl-ink) 6%, transparent); color: var(--cl-muted); font-size: 9px; }
  .plan-card { min-width: 0; display: grid; grid-template-columns: minmax(560px, 1fr) 286px; grid-template-rows: auto minmax(480px, 1fr); overflow: hidden; border-color: var(--cl-line-strong); }
  .plan-head { align-items: center; gap: 16px; }
  .plan-card > .plan-head { grid-column: 1 / -1; grid-row: 1; }
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
  .area-canvas { min-width: 0; grid-column: 1; grid-row: 2; padding: 0; border-right: 1px solid var(--cl-line); background: var(--cl-surface-muted); }
  .selection-bar {
    min-width: 0;
    grid-column: 2;
    grid-row: 2;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
    padding: 16px;
    overflow-y: auto;
    background: var(--cl-surface);
  }
  .selection-bar.is-above { border: 0; }
  .selection-bar label { display: grid; gap: 6px; }
  .selection-bar label span, .area-colour > span, .selection-hint label span { color: var(--cl-muted); font-size: 11px; font-weight: var(--rst-fw-bold); }
  .selection-bar input, .selection-bar select { width: 100%; }
  .selection-bar .cl-btn { width: 100%; }
  .inspector-head { display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: center; gap: 10px; padding-bottom: 14px; border-bottom: 1px solid var(--cl-line); }
  .inspector-head > div { min-width: 0; display: grid; gap: 2px; }
  .inspector-head strong { font-size: 13px; }
  .inspector-head small { overflow: hidden; color: var(--cl-muted); font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
  .inspector-glyph { width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid var(--cl-line); border-radius: 6px; background: var(--cl-surface-muted); color: var(--cl-accent); font-size: 12px; font-weight: var(--rst-fw-bold); }
  .area-colour { display: grid; gap: 7px; }
  .area-colour > div { display: flex; align-items: center; gap: 8px; }
  .area-colour small { color: var(--cl-muted); font-size: 10px; line-height: 1.35; }
  .inspector-stats { display: grid; gap: 0; margin: 0; border-top: 1px solid var(--cl-line); border-bottom: 1px solid var(--cl-line); }
  .inspector-stats div { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 0; }
  .inspector-stats div + div { border-top: 1px solid var(--cl-line); }
  .inspector-stats dt { color: var(--cl-muted); font-size: 11px; }
  .inspector-stats dd { margin: 0; color: var(--cl-ink); font-size: 12px; font-weight: var(--rst-fw-bold); }
  .resize-note { margin: 0; color: var(--cl-muted); font-size: 10.5px; line-height: 1.5; }
  .selection-hint { grid-column: 2; grid-row: 2; display: flex; flex-direction: column; align-items: stretch; gap: 12px; padding: 16px; background: var(--cl-surface); color: var(--cl-muted); font-size: 11px; text-align: left; }
  .selection-hint.is-above { border: 0; }
  .selection-hint strong { color: var(--cl-ink); font-size: 13px; }
  .selection-hint label { display: grid; gap: 6px; }
  .selection-hint p { margin: 0; line-height: 1.5; }
  .quiet-danger { margin-top: auto; padding: 8px; border: 0; background: transparent; color: var(--cl-muted); font: inherit; font-size: 11px; cursor: pointer; }
  .quiet-danger:hover:not(:disabled) { color: var(--cl-problem); }
  .quiet-danger:disabled { opacity: .38; cursor: default; }
  .dialog-copy { margin: 0; color: var(--cl-muted); font-size: 12px; }
  .catalogue-picker { display: grid; gap: 16px; }
  .catalogue-search { display: grid; gap: 6px; color: var(--cl-muted); font-size: 11px; font-weight: 700; }
  .catalogue-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; max-height: 390px; overflow: auto; padding: 2px; }
  .catalogue-grid > button { display: grid; grid-template-columns: 32px minmax(0, 1fr); align-items: center; gap: 10px; min-height: 58px; padding: 9px 11px; border: 1px solid var(--cl-line); border-radius: 6px; background: var(--cl-surface); color: var(--cl-ink); text-align: left; cursor: pointer; }
  .catalogue-grid > button:hover { border-color: var(--catalogue-color); background: color-mix(in srgb, var(--catalogue-color) 7%, var(--cl-surface)); }
  .catalogue-grid strong, .catalogue-grid small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .catalogue-grid strong { font-size: 12px; }
  .catalogue-grid small { margin-top: 2px; color: var(--cl-muted); font-size: 10px; text-transform: capitalize; }
  .catalogue-empty { grid-column: 1 / -1; margin: 0; padding: 24px; color: var(--cl-muted); text-align: center; }
  .custom-area { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, 240px) auto; align-items: end; gap: 12px; padding-top: 14px; border-top: 1px solid var(--cl-line); }
  .custom-area > div { display: grid; gap: 3px; }
  .custom-area strong { font-size: 12px; }
  .custom-area span { color: var(--cl-muted); font-size: 10.5px; }
  .cl-btn.is-problem { border-color: var(--cl-problem-line); background: var(--cl-problem-wash); color: var(--cl-problem); }
  @media (max-width: 980px) {
    .plan-card { grid-template-columns: minmax(520px, 1fr) 250px; }
    .plan-commandbar__hint { display: none; }
  }
  @media (max-width: 760px) {
    .plan-card { display: block; }
    .selection-bar, .selection-hint { border-top: 1px solid var(--cl-line); }
    .area-canvas { border-right: 0; }
    .catalogue-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .custom-area { grid-template-columns: 1fr; align-items: stretch; }
  }
</style>
