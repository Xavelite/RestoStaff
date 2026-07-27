<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import Dialog from '$lib/components/Dialog.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicPalettePicker from '$lib/classic/ClassicPalettePicker.svelte';
  import ClassicRowMenu from '$lib/classic/ClassicRowMenu.svelte';
  import ClassicCellBadge from '$lib/classic/ClassicCellBadge.svelte';
  import { StableDraftPlacement } from '$lib/classic/stable-draft-placement';
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
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { AREA_PALETTE, defaultAreaColor } from '$lib/ui/position-color';
  import {
    WORKSPACE_AREA_CATALOGUE,
    workspaceAreaByKey
  } from '$lib/restaurant/workspace-catalogue';
  import WorkspaceAreaIcon from '$lib/restaurant/WorkspaceAreaIcon.svelte';
  import WorkspaceCataloguePicker, {
    type WorkspaceCataloguePickerItem
  } from '$lib/restaurant/WorkspaceCataloguePicker.svelte';

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
  let newAreaId = $state('');
  let addingArea = $state(false);
  let newAreaName = $state('');
  let compactViewport = $state(false);
  let editorView = $state<'plan' | 'list'>('list');
  type AreaDirectoryPlacement = {
    id: string;
    floorOrder: number;
    positionX: number;
    positionY: number;
    name: string;
  };
  const areaDirectoryPlacement =
    new StableDraftPlacement<AreaDirectoryPlacement>(structuredClone);
  const CANONICAL_FLOOR_LEVELS = [-1, 0, 1, 2] as const;
  const ROOM_GRID = 20;
  const TABLE_GRID = 10;
  const editorReadOnly = $derived(compactViewport || workspace.isPreview);
  function catalogueAreaItems(
    currentAreaId = '',
    allowArchivedRevival = false
  ): WorkspaceCataloguePickerItem[] {
    const existingByKey = new Map(
      (restaurantContext?.draft.areas ?? [])
        .filter((area) => area.id !== currentAreaId && area.catalogueKey)
        .map((area) => [area.catalogueKey, area])
    );
    return WORKSPACE_AREA_CATALOGUE.map((area) => {
      const existing = existingByKey.get(area.key);
      const canRestore = Boolean(existing && !existing.active && allowArchivedRevival);
      return {
        key: area.key,
        label: area.label,
        category: canRestore
          ? `${t('Archived')} · ${t('Restore')}`
          : area.category,
        icon: area.icon,
        color: area.color,
        recommended: area.starter,
        disabled: Boolean(existing && !canRestore),
        disabledReason: existing
          ? existing.active
            ? t('Already added')
            : canRestore
              ? undefined
              : t('Already added · archived')
          : undefined
      };
    });
  }

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
  const selectableFloors = $derived.by(() => {
    const occupiedFloorIds = new Set(
      (draft?.rooms ?? [])
        .filter((room) => room.active && room.floor_id)
        .map((room) => room.floor_id)
    );
    const active =
      draft?.floors.filter(
        (floor) =>
          floor.active &&
          (CANONICAL_FLOOR_LEVELS.includes(
            floor.level as (typeof CANONICAL_FLOOR_LEVELS)[number]
          ) ||
            occupiedFloorIds.has(floor.id))
      ) ?? [];
    return [...active].sort((left, right) => {
      const leftCanonical = CANONICAL_FLOOR_LEVELS.indexOf(
        left.level as (typeof CANONICAL_FLOOR_LEVELS)[number]
      );
      const rightCanonical = CANONICAL_FLOOR_LEVELS.indexOf(
        right.level as (typeof CANONICAL_FLOOR_LEVELS)[number]
      );
      if (leftCanonical >= 0 && rightCanonical >= 0) return leftCanonical - rightCanonical;
      if (leftCanonical >= 0) return -1;
      if (rightCanonical >= 0) return 1;
      return left.level - right.level || left.sort_order - right.sort_order;
    });
  });
  const selectedFloorIndex = $derived(
    selectableFloors.findIndex((floor) => floor.id === selectedFloorId)
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
          area_icon: draftArea?.iconKey ?? area?.icon_key ?? null,
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
      const leftIsNew = left.work_area_id === newAreaId;
      const rightIsNew = right.work_area_id === newAreaId;
      if (leftIsNew !== rightIsNew) return leftIsNew ? -1 : 1;
      const leftPlacement = areaDirectoryPlacement.snapshotFor(
        directoryPlacement(left)
      );
      const rightPlacement = areaDirectoryPlacement.snapshotFor(
        directoryPlacement(right)
      );
      return (
        leftPlacement.floorOrder - rightPlacement.floorOrder ||
        leftPlacement.positionY - rightPlacement.positionY ||
        leftPlacement.positionX - rightPlacement.positionX ||
        leftPlacement.name.localeCompare(rightPlacement.name)
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
      resetAreaDirectoryPlacement();
      dirty = false;
      if (!selectedFloorId || !draft.floors.some((floor) => floor.id === selectedFloorId && floor.active)) {
        selectedFloorId =
          draft.floors.find((floor) => floor.active && floor.level === 0)?.id ??
          draft.floors.find((floor) => floor.active)?.id ??
          '';
      }
      selectedRoomId = '';
      selectedTableId = '';
      newAreaId = '';
      addingArea = false;
      newAreaName = '';
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
    for (const [index, level] of CANONICAL_FLOOR_LEVELS.entries()) {
      const existing = floors.find((floor) => floor.level === level);
      if (existing) {
        existing.active = true;
        continue;
      }
      floors.push({
        id: crypto.randomUUID(),
        restaurant_id: value.restaurantId,
        name: persistedFloorName(level),
        level,
        canvas_width: 1000,
        canvas_height: 600,
        active: true,
        sort_order: index
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

  function directoryPlacement(
    room: Pick<
      ReservationRoomDraft,
      'id' | 'work_area_id' | 'floor_id' | 'position_x' | 'position_y'
    >
  ): AreaDirectoryPlacement {
    const floor = draft?.floors.find((item) => item.id === room.floor_id);
    const area = restaurantContext?.draft.areas.find(
      (item) => item.id === room.work_area_id
    );
    const sourceRoom = source?.rooms.find((item) => item.id === room.id);
    const sourceArea = source?.areas.find((item) => item.id === room.work_area_id);
    return {
      id: room.id,
      floorOrder: floor?.sort_order ?? Number.MAX_SAFE_INTEGER,
      positionX: Number(room.position_x),
      positionY: Number(room.position_y),
      name:
        (area ? restaurantConfig.placementArea(area).name : '') ||
        sourceRoom?.name ||
        sourceArea?.name ||
        ''
    };
  }

  function resetAreaDirectoryPlacement(): void {
    areaDirectoryPlacement.reset(
      (draft?.rooms ?? [])
        .filter((room) => room.active)
        .map((room) => directoryPlacement(room))
    );
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

  function persistedFloorName(level: number): string {
    if (level === 0) return 'Ground floor';
    if (level === 1) return 'First floor';
    if (level === 2) return 'Second floor';
    return `Floor ${level}`;
  }

  function floorLabel(floor: ReservationFloor): string {
    if (floor.level === 0) return t('Ground floor');
    if (floor.level === 1) return t('First floor');
    if (floor.level === 2) return t('Second floor');
    if (CANONICAL_FLOOR_LEVELS.includes(
      floor.level as (typeof CANONICAL_FLOOR_LEVELS)[number]
    )) {
      return t('Floor {level}', { level: floor.level });
    }
    return floor.name;
  }

  function floorLevel(level: number): string {
    if (level === 0) return '0';
    return level > 0 ? `+${level}` : `${level}`;
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

  function selectFloor(floorId: string): void {
    if (!selectableFloors.some((floor) => floor.id === floorId)) return;
    selectedFloorId = floorId;
    selectedRoomId = '';
    selectedTableId = '';
  }

  function navigateFloor(offset: number): void {
    const currentIndex = selectableFloors.findIndex((floor) => floor.id === selectedFloorId);
    const next = selectableFloors[currentIndex + offset];
    if (next) selectFloor(next.id);
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

  async function createArea(
    catalogueItem: WorkspaceCataloguePickerItem | null,
    customName = ''
  ) {
    if (!draft || !selectedFloor || !restaurantContext || workspace.isPreview) return;
    const areas = restaurantContext.draft.areas;
    const existingArea = catalogueItem
      ? areas.find((area) => area.catalogueKey === catalogueItem.key)
      : null;
    if (existingArea) {
      if (existingArea.active) return;
      existingArea.active = true;
      let room = draft.rooms.find((candidate) => candidate.work_area_id === existingArea.id);
      if (room) {
        room.active = true;
        const roomFloor = draft.floors.find(
          (floor) => floor.id === room!.floor_id && floor.active
        );
        if (!roomFloor) {
          const geometry = nextAreaGeometry(selectedFloor, floorRooms.length);
          room.floor_id = selectedFloor.id;
          room.position_x = geometry.x;
          room.position_y = geometry.y;
          room.width = geometry.width;
          room.height = geometry.height;
          if (geometry.y + geometry.height + ROOM_GRID > selectedFloor.canvas_height) {
            selectedFloor.canvas_height = Math.min(
              1200,
              snap(geometry.y + geometry.height + ROOM_GRID)
            );
          }
        }
      } else {
        const geometry = nextAreaGeometry(selectedFloor, floorRooms.length);
        room = {
          id: crypto.randomUUID(),
          work_area_id: existingArea.id,
          floor_id: selectedFloor.id,
          position_x: geometry.x,
          position_y: geometry.y,
          width: geometry.width,
          height: geometry.height,
          active: true,
          sort_order: draft.rooms.length
        };
        if (geometry.y + geometry.height + ROOM_GRID > selectedFloor.canvas_height) {
          selectedFloor.canvas_height = Math.min(
            1200,
            snap(geometry.y + geometry.height + ROOM_GRID)
          );
        }
        draft.rooms = [...draft.rooms, room];
      }
      areaDirectoryPlacement.snapshotFor(directoryPlacement(room));
      selectedFloorId = room.floor_id ?? selectedFloor.id;
      selectedRoomId = room.id;
      selectedTableId = '';
      restaurantConfig.touch();
      touch();
      newAreaId = existingArea.id;
      addingArea = false;
      newAreaName = '';
      await tick();
      document.getElementById(`area-picker-${existingArea.id}`)?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest'
      });
      return;
    }
    const id = crypto.randomUUID();
    const fallbackName = `${t('Area')} ${areas.filter((item) => item.active).length + 1}`;
    const name = (catalogueItem?.label ?? customName.trim()) || fallbackName;
    const area = {
      id,
      name,
      code: '',
      notes: '',
      active: true,
      lunchStart: '',
      lunchEnd: '',
      eveningStart: '',
      eveningEnd: '',
      color: catalogueItem?.color ?? defaultAreaColor(areas.length),
      catalogueKey: catalogueItem?.key ?? '',
      iconKey: catalogueItem?.icon ?? ''
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
    areaDirectoryPlacement.snapshotFor(directoryPlacement(room));
    selectedRoomId = room.id;
    selectedTableId = '';
    restaurantConfig.touch();
    touch();
    newAreaId = id;
    addingArea = false;
    newAreaName = '';
    await tick();
    document.getElementById(`area-picker-${id}`)?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest'
    });
  }

  function selectAreaCatalogue(
    areaId: string,
    item: WorkspaceCataloguePickerItem
  ): void {
    const area = restaurantContext?.draft.areas.find((candidate) => candidate.id === areaId);
    if (!area) return;
    area.name = item.label;
    area.catalogueKey = item.key;
    area.color = item.color ?? area.color;
    area.iconKey = item.icon ?? '';
    restaurantConfig.touch();
  }

  function selectCustomArea(areaId: string, name: string): void {
    const area = restaurantContext?.draft.areas.find((candidate) => candidate.id === areaId);
    if (!area) return;
    if (name.trim()) area.name = name.trim();
    area.catalogueKey = '';
    area.iconKey = '';
    restaurantConfig.touch();
  }

  async function archiveArea(roomId = selectedRoomId) {
    if (!draft || !restaurantContext || workspace.isPreview) return;
    const roomDraft = draft.rooms.find((room) => room.id === roomId);
    const areaDraft = restaurantContext.draft.areas.find(
      (area) => area.id === roomDraft?.work_area_id
    );
    if (!roomDraft || !areaDraft) return;
    const linkedPositions = positionCountForArea(areaDraft.id);
    const linkedTables = draft.tables.filter(
      (table) => table.room_id === roomDraft.id && table.active
    ).length;
    const confirmed = await confirmAction({
      title: t('Archive {name}?', { name: areaDraft.name }),
      body: t(
        'This removes the area from Planning and Staffing, unlinks {positions} positions and archives {tables} reservation tables.',
        { positions: linkedPositions, tables: linkedTables }
      ),
      confirmLabel: t('Archive area')
    });
    if (!confirmed) return;
    const archivedAreaId = areaDraft.id;
    const persisted = (workspace.restaurant?.work_areas ?? []).some((area) => area.id === areaDraft.id);
    if (persisted) {
      areaDraft.active = false;
      roomDraft.active = false;
      draft.tables
        .filter((table) => table.room_id === roomDraft.id)
        .forEach((table) => (table.active = false));
    } else {
      restaurantContext.draft.areas = restaurantContext.draft.areas.filter(
        (area) => area.id !== areaDraft.id
      );
      draft.rooms = draft.rooms.filter((room) => room.id !== roomDraft.id);
      draft.tables = draft.tables.filter((table) => table.room_id !== roomDraft.id);
      restaurantConfig.removeAreaPlacement(areaDraft.id);
      areaDirectoryPlacement.remove(roomDraft.id);
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
    if (!selectedFloor) return;
    moveAreaToFloor(room.id, selectedFloor.id, true);
  }

  function openAreaOnPlan(room: ReservationRoom): void {
    if (room.floor_id) {
      selectedFloorId = room.floor_id;
      selectedRoomId = room.id;
      selectedTableId = '';
    } else {
      assignRoom(room);
    }
    editorView = 'plan';
  }

  function moveAreaToFloor(roomId: string, floorId: string, navigate = false): void {
    if (!draft || workspace.isPreview) return;
    const target = draft.rooms.find((room) => room.id === roomId);
    const floor = draft.floors.find((candidate) => candidate.id === floorId && candidate.active);
    if (!target || !floor || target.floor_id === floor.id) {
      if (navigate && floor) {
        selectedFloorId = floor.id;
        selectedRoomId = roomId;
        selectedTableId = '';
      }
      return;
    }
    const targetFloorRooms = mergedRooms.filter(
      (room) => room.floor_id === floor.id && room.id !== roomId
    );
    const geometry = nextAreaGeometry(floor, targetFloorRooms.length);
    const dx = geometry.x - Number(target.position_x);
    const dy = geometry.y - Number(target.position_y);
    target.floor_id = floor.id;
    target.position_x = geometry.x;
    target.position_y = geometry.y;
    target.width = geometry.width;
    target.height = geometry.height;
    draft.tables
      .filter((table) => table.room_id === roomId)
      .forEach((table) => {
        table.position_x = Number(table.position_x) + dx;
        table.position_y = Number(table.position_y) + dy;
      });
    if (geometry.y + geometry.height + ROOM_GRID > floor.canvas_height) {
      floor.canvas_height = Math.min(
        1200,
        snap(geometry.y + geometry.height + ROOM_GRID)
      );
    }
    if (navigate) {
      selectedFloorId = floor.id;
      selectedRoomId = roomId;
      selectedTableId = '';
    }
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
    let nextX = clamp(snap(positionX), 0, selectedFloor.canvas_width - 160);
    let nextY = clamp(snap(positionY), 0, selectedFloor.canvas_height - 120);
    let nextWidth = Math.max(
      160,
      Math.min(selectedFloor.canvas_width - nextX, width)
    );
    let nextHeight = Math.max(
      120,
      Math.min(selectedFloor.canvas_height - nextY, height)
    );

    // An area may never be resized through its tables. Preserve the manager's
    // table layout and constrain the requested area edge to the occupied
    // extents instead of stacking tables against one another.
    const inset = 12;
    const topInset = 28;
    const activeTables = draft.tables.filter(
      (table) => table.room_id === room.id && table.active
    );
    if (activeTables.length) {
      const requestedRight = nextX + nextWidth;
      const requestedBottom = nextY + nextHeight;
      const occupiedLeft =
        Math.min(...activeTables.map((table) => Number(table.position_x))) - inset;
      const occupiedTop =
        Math.min(...activeTables.map((table) => Number(table.position_y))) - topInset;
      const occupiedRight =
        Math.max(
          ...activeTables.map(
            (table) => Number(table.position_x) + Number(table.width)
          )
        ) + inset;
      const occupiedBottom =
        Math.max(
          ...activeTables.map(
            (table) => Number(table.position_y) + Number(table.height)
          )
        ) + inset;
      nextX = clamp(Math.min(nextX, occupiedLeft), 0, selectedFloor.canvas_width - 160);
      nextY = clamp(Math.min(nextY, occupiedTop), 0, selectedFloor.canvas_height - 120);
      nextWidth = Math.max(160, Math.max(requestedRight, occupiedRight) - nextX);
      nextHeight = Math.max(120, Math.max(requestedBottom, occupiedBottom) - nextY);
      nextWidth = Math.min(nextWidth, selectedFloor.canvas_width - nextX);
      nextHeight = Math.min(nextHeight, selectedFloor.canvas_height - nextY);
    }
    target.position_x = nextX;
    target.position_y = nextY;
    target.width = nextWidth;
    target.height = nextHeight;
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

  function resizeTable(
    table: ReservationTableDraft,
    positionX: number,
    positionY: number,
    width: number,
    height: number
  ) {
    if (!draft) return;
    const room = draft.rooms.find((item) => item.id === table.room_id);
    const target = draft.tables.find((item) => item.id === table.id);
    if (!target || !room) return;
    const inset = 12;
    const topInset = 28;
    const roomLeft = Number(room.position_x) + inset;
    const roomTop = Number(room.position_y) + topInset;
    const roomRight = Number(room.position_x) + Number(room.width) - inset;
    const roomBottom = Number(room.position_y) + Number(room.height) - inset;
    const nextX = clamp(snap(positionX, TABLE_GRID), roomLeft, roomRight - 60);
    const nextY = clamp(snap(positionY, TABLE_GRID), roomTop, roomBottom - 52);
    const maximumWidth = Math.max(60, roomRight - nextX);
    const maximumHeight = Math.max(52, roomBottom - nextY);
    let nextWidth = clamp(snap(width, TABLE_GRID), 60, maximumWidth);
    let nextHeight = clamp(snap(height, TABLE_GRID), 52, maximumHeight);
    if (target.shape === 'round' || target.shape === 'square') {
      const size = Math.min(nextWidth, nextHeight);
      nextWidth = size;
      nextHeight = size;
    }
    target.position_x = nextX;
    target.position_y = nextY;
    target.width = nextWidth;
    target.height = nextHeight;
    target.rotation_degrees = 0;
    touch();
  }

  function recommendedTableFootprint(
    capacity: number,
    shape: ReservationTableDraft['shape']
  ): { width: number; height: number } {
    const seats = clamp(Math.round(Number(capacity) || 1), 1, 16);
    if (shape === 'round' || shape === 'square') {
      const size = clamp(76 + Math.ceil(Math.max(0, seats - 2) / 2) * 14, 76, 160);
      return { width: size, height: size };
    }
    return {
      width: clamp(94 + Math.ceil(Math.max(0, seats - 4) / 2) * 20, 94, 190),
      height: seats > 10 ? 90 : seats > 6 ? 82 : 72
    };
  }

  function fitTableToCapacity(
    table: ReservationTableDraft,
    allowShrink = false
  ): void {
    const recommendation = recommendedTableFootprint(
      table.maximum_capacity,
      table.shape
    );
    const width = allowShrink
      ? recommendation.width
      : Math.max(Number(table.width), recommendation.width);
    const height = allowShrink
      ? recommendation.height
      : Math.max(Number(table.height), recommendation.height);
    resizeTable(
      table,
      Number(table.position_x),
      Number(table.position_y),
      width,
      height
    );
  }

  function tableCapacityChanged(
    table: ReservationTableDraft,
    field: 'minimum' | 'maximum',
    rawValue: string
  ): void {
    const value = Math.round(Number(rawValue) || 1);
    if (field === 'minimum') {
      table.minimum_capacity = clamp(value, 1, 100);
      table.maximum_capacity = Math.max(
        table.minimum_capacity,
        Number(table.maximum_capacity) || table.minimum_capacity
      );
    } else {
      table.maximum_capacity = clamp(value, table.minimum_capacity, 500);
    }
    fitTableToCapacity(table);
  }

  function setTableShape(
    table: ReservationTableDraft,
    shape: ReservationTableDraft['shape']
  ) {
    if (table.shape === shape) return;
    table.shape = shape;
    fitTableToCapacity(table, true);
  }

  function turnTable(table: ReservationTableDraft) {
    if (table.shape !== 'rectangle') return;
    resizeTable(
      table,
      Number(table.position_x),
      Number(table.position_y),
      Number(table.height),
      Number(table.width)
    );
  }

  function tableFootprint(table: ReservationTableDraft): string {
    const width = Number(table.width) / 100;
    const height = Number(table.height) / 100;
    return `${width.toFixed(width % 1 === 0 ? 0 : 1)} × ${height.toFixed(height % 1 === 0 ? 0 : 1)} m`;
  }

  function nextTablePosition(
    room: ReservationRoomDraft,
    width: number,
    height: number,
    roomTables: ReservationTableDraft[]
  ) {
    const gap = 20;
    const left = snap(Number(room.position_x) + 30, TABLE_GRID);
    const top = snap(Number(room.position_y) + 50, TABLE_GRID);
    const right = Number(room.position_x) + Number(room.width) - width - 20;
    const bottom = Number(room.position_y) + Number(room.height) - height - 20;
    for (let y = top; y <= bottom; y += TABLE_GRID) {
      for (let x = left; x <= right; x += TABLE_GRID) {
        const collides = roomTables.some((table) => {
          const tableLeft = Number(table.position_x);
          const tableTop = Number(table.position_y);
          const tableRight = tableLeft + Number(table.width);
          const tableBottom = tableTop + Number(table.height);
          return !(
            x + width + gap <= tableLeft ||
            x >= tableRight + gap ||
            y + height + gap <= tableTop ||
            y >= tableBottom + gap
          );
        });
        if (!collides) return { x, y };
      }
    }
    return { x: left, y: top };
  }

  function arrangeTables(roomId = selectedRoomId) {
    if (!draft) return;
    const room = draft.rooms.find((item) => item.id === roomId);
    if (!room) return;
    const tables = draft.tables.filter((table) => table.room_id === roomId && table.active);
    const left = Number(room.position_x) + 30;
    const right = Number(room.position_x) + Number(room.width) - 20;
    const bottom = Number(room.position_y) + Number(room.height) - 20;
    let cursorX = left;
    let cursorY = Number(room.position_y) + 50;
    let rowHeight = 0;
    for (const table of tables) {
      const width = Number(table.width);
      const height = Number(table.height);
      if (cursorX !== left && cursorX + width > right) {
        cursorX = left;
        cursorY += rowHeight + 28;
        rowHeight = 0;
      }
      table.position_x = snap(
        clamp(cursorX, left, Math.max(left, right - width)),
        TABLE_GRID
      );
      table.position_y = snap(
        clamp(cursorY, Number(room.position_y) + 50, Math.max(Number(room.position_y) + 50, bottom - height)),
        TABLE_GRID
      );
      cursorX += width + 28;
      rowHeight = Math.max(rowHeight, height);
    }
    touch();
  }

  function addTable() {
    if (!draft || !selectedRoomDraft) return;
    const roomTables = draft.tables.filter(
      (table) => table.room_id === selectedRoomDraft.id && table.active
    );
    const labels = new Set(roomTables.map((table) => table.label));
    let number = 1;
    while (labels.has(String(number))) number += 1;
    const { width, height } = recommendedTableFootprint(2, 'round');
    const position = nextTablePosition(selectedRoomDraft, width, height, roomTables);
    const table: ReservationTableDraft = {
      id: crypto.randomUUID(),
      room_id: selectedRoomDraft.id,
      label: String(number),
      minimum_capacity: 1,
      maximum_capacity: 2,
      shape: 'round',
      position_x: position.x,
      position_y: position.y,
      width,
      height,
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
    const roomTables = draft.tables.filter(
      (item) => item.room_id === table.room_id && item.active
    );
    const room = draft.rooms.find((item) => item.id === table.room_id);
    if (!room) return;
    const labels = new Set(roomTables.map((item) => item.label.toLowerCase()));
    const base = `${table.label} copy`;
    let label = base;
    let suffix = 2;
    while (labels.has(label.toLowerCase())) label = `${base} ${suffix++}`;
    const position = nextTablePosition(
      room,
      Number(table.width),
      Number(table.height),
      roomTables
    );
    const duplicate = {
      ...table,
      id: crypto.randomUUID(),
      label,
      position_x: position.x,
      position_y: position.y,
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
    if (!draft) return false;
    const activeFloors = draft.floors.filter((floor) => floor.active);
    const activeRooms = draft.rooms.filter((room) => room.active);
    const activeTables = draft.tables.filter((table) => table.active);
    const activeAreas = restaurantContext?.draft.areas.filter((area) => area.active) ?? [];
    if (
      !activeFloors.every(
        (floor) =>
          floor.name.trim() &&
          floor.canvas_width >= 400 &&
          floor.canvas_height >= 300
      ) ||
      !activeRooms.every(
        (room) =>
          room.work_area_id &&
          room.floor_id &&
          activeFloors.some((floor) => floor.id === room.floor_id)
      ) ||
      (restaurantContext &&
        (!activeAreas.every((area) => area.name.trim()) ||
          activeAreas.some(
            (area) =>
              activeRooms.filter((room) => room.work_area_id === area.id).length !== 1
          )))
    ) {
      return false;
    }

    const tableLabels = new Set<string>();
    for (const table of activeTables) {
      if (
        !table.label.trim() ||
        table.minimum_capacity < 1 ||
        table.maximum_capacity < table.minimum_capacity ||
        !activeRooms.some((room) => room.id === table.room_id)
      ) {
        return false;
      }
      const key = `${table.room_id}:${table.label.trim().toLocaleLowerCase()}`;
      if (tableLabels.has(key)) return false;
      tableLabels.add(key);
    }
    return true;
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
    resetAreaDirectoryPlacement();
    dirty = false;
    selectedFloorId =
      draft.floors.find((floor) => floor.active && floor.level === 0)?.id ??
      draft.floors.find((floor) => floor.active)?.id ??
      '';
    selectedRoomId = '';
    selectedTableId = '';
    newAreaId = '';
    addingArea = false;
    newAreaName = '';
    restaurantContext?.discard();
  }

  onMount(() =>
    unsavedChanges.register({
      id: mode === 'areas' ? 'restaurant-floor-layout' : 'reservation-table-layout',
      label: mode === 'areas' ? 'Restaurant floor layout' : 'Reservation table layout',
      priority: 20,
      isDirty: () => dirty,
      save,
      discard
    })
  );
</script>

{#snippet floorNavigator()}
  <div class="floor-navigator" aria-label={t('Floors')}>
    <button
      type="button"
      aria-label={t('Previous floor')}
      title={t('Previous floor')}
      disabled={selectedFloorIndex <= 0}
      onclick={() => navigateFloor(-1)}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
    </button>
    <label>
      <span class="sr-only">{t('Floor')}</span>
      <select
        value={selectedFloorId}
        onchange={(event) => selectFloor((event.currentTarget as HTMLSelectElement).value)}
      >
        {#each selectableFloors as floor (floor.id)}
          <option value={floor.id}>{floorLevel(floor.level)} · {floorLabel(floor)}</option>
        {/each}
      </select>
    </label>
    <button
      type="button"
      aria-label={t('Next floor')}
      title={t('Next floor')}
      disabled={selectedFloorIndex < 0 || selectedFloorIndex >= selectableFloors.length - 1}
      onclick={() => navigateFloor(1)}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
    </button>
  </div>
{/snippet}

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
          <button class:is-active={editorView === 'list'} type="button" onclick={() => (editorView = 'list')}>{t('List')}</button>
          <button class:is-active={editorView === 'plan'} type="button" onclick={() => (editorView = 'plan')}>{t('Plan')}</button>
        </div>
        {#if addingArea}
          <div class="add-area-picker">
            <WorkspaceCataloguePicker
              inputId="new-area-catalogue"
              bind:value={newAreaName}
              items={catalogueAreaItems('', true)}
              label={t('Choose an area')}
              placeholder={t('Search system areas')}
              autoOpen
              recommendedLabel={t('Suggested areas')}
              allLabel={t('All system areas')}
              customLabel={t('Custom area')}
              browseLabel={t('Browse system areas')}
              noMatchesLabel={t('No matching system areas')}
              customDescription={t('Keep this area specific to your restaurant')}
              formatCustomLabel={(name) => t('Use “{name}” as a custom area', { name })}
              onselect={(item) => void createArea(item)}
              oncustom={(name) => void createArea(null, name)}
              onclose={() => {
                addingArea = false;
                newAreaName = '';
              }}
            />
          </div>
        {:else}
          <button
            class="cl-btn is-primary"
            type="button"
            disabled={!selectedFloor || editorReadOnly}
            onclick={() => {
              addingArea = true;
              newAreaName = '';
            }}
          >+ {t('Add area')}</button>
        {/if}
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
                  <th class="is-num">{t('Positions')}</th>
                  <th>{t('Status')}</th>
                  <th aria-label={t('Actions')}></th>
                </tr>
              </thead>
              <tbody>
                {#each orderedAreaRooms as room (room.id)}
                  {@const floor = draft.floors.find((item) => item.id === room.floor_id)}
                  {@const areaDraft = restaurantContext?.draft.areas.find((area) => area.id === room.work_area_id)}
                  <tr
                    class:is-attention={!room.floor_id}
                    class:is-new={room.work_area_id === newAreaId}
                  >
                    <td>
                      <span class="area-row-name">
                        <WorkspaceAreaIcon icon={areaIconFor(room.work_area_id)} color={room.area_color} size={18} />
                        {#if areaDraft}
                          <WorkspaceCataloguePicker
                            inputId={`area-picker-${areaDraft.id}`}
                            bind:value={areaDraft.name}
                            selectedKey={areaDraft.catalogueKey}
                            items={catalogueAreaItems(areaDraft.id)}
                            label={t('Area')}
                            placeholder={t('Select or type an area')}
                            disabled={editorReadOnly}
                            recommendedLabel={t('Suggested areas')}
                            allLabel={t('All system areas')}
                            customLabel={t('Custom area')}
                            browseLabel={t('Browse system areas')}
                            noMatchesLabel={t('No matching system areas')}
                            customDescription={t('Keep this area specific to your restaurant')}
                            formatCustomLabel={(name) => t('Use “{name}” as a custom area', { name })}
                            onvaluechange={() => restaurantConfig.touch()}
                            onselect={(item) => selectAreaCatalogue(areaDraft.id, item)}
                            oncustom={(name) => selectCustomArea(areaDraft.id, name)}
                          />
                        {:else}
                          <strong>{room.name}</strong>
                        {/if}
                      </span>
                    </td>
                    <td>
                      <select
                        class="cl-field floor-select"
                        aria-label={t('Floor')}
                        disabled={editorReadOnly}
                        value={room.floor_id ?? ''}
                        onchange={(event) =>
                          moveAreaToFloor(
                            room.id,
                            (event.currentTarget as HTMLSelectElement).value
                          )}
                      >
                        <option value="" disabled>{t('Not placed')}</option>
                        {#each selectableFloors as floorOption (floorOption.id)}
                          <option value={floorOption.id}>{floorLabel(floorOption)}</option>
                        {/each}
                      </select>
                    </td>
                    <td class="is-num">{positionCountForArea(room.work_area_id)}</td>
                    <td><ClassicCellBadge label={floor ? 'Active' : 'Needs placement'} tone={floor ? 'success' : 'warning'} icon={floor ? 'check' : 'warning'} /></td>
                    <td class="menu-cell">
                      <ClassicRowMenu
                        disabled={editorReadOnly}
                        items={[
                          {
                            label: t(floor ? 'Open plan' : 'Place'),
                            onselect: () => openAreaOnPlan(room)
                          },
                          {
                            label: t('Archive'),
                            tone: 'danger',
                            onselect: () => void archiveArea(room.id)
                          }
                        ]}
                      />
                    </td>
                  </tr>
                {:else}
                  <tr><td colspan="5"><div class="cl-empty"><strong>{t('No areas yet')}</strong><span>{t('Add an area to start shaping your restaurant.')}</span></div></td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
        <div class="area-editor">
          <section class="cl-card plan-card">
            {#if selectedFloor}
              {#if selectedRoomDraft && selectedRoom && selectedAreaDraft && mode === 'areas'}
                <div class="selection-bar room-selection is-above">
                  <header class="inspector-head">
                    <WorkspaceAreaIcon icon={areaIconFor(selectedRoom.work_area_id)} color={selectedRoom.area_color} size={20} />
                    <div><strong>{t('Area details')}</strong><small>{floorLabel(selectedFloor)}</small></div>
                    <ClassicRowMenu
                      disabled={editorReadOnly}
                      items={[
                        {
                          label: t('Archive'),
                          tone: 'danger',
                          onselect: () => void archiveArea(selectedRoom.id)
                        }
                      ]}
                    />
                  </header>
                  {@render floorNavigator()}
                  <label class="area-name">
                    <span>{t('Area name')}</span>
                    <WorkspaceCataloguePicker
                      inputId={`area-picker-${selectedAreaDraft.id}`}
                      bind:value={selectedAreaDraft.name}
                      selectedKey={selectedAreaDraft.catalogueKey}
                      items={catalogueAreaItems(selectedAreaDraft.id)}
                      label={t('Area name')}
                      placeholder={t('Select or type an area')}
                      disabled={editorReadOnly}
                      recommendedLabel={t('Suggested areas')}
                      allLabel={t('All system areas')}
                      customLabel={t('Custom area')}
                      browseLabel={t('Browse system areas')}
                      noMatchesLabel={t('No matching system areas')}
                      customDescription={t('Keep this area specific to your restaurant')}
                      formatCustomLabel={(name) => t('Use “{name}” as a custom area', { name })}
                      onvaluechange={() => restaurantConfig.touch()}
                      onselect={(item) => selectAreaCatalogue(selectedAreaDraft.id, item)}
                      oncustom={(name) => selectCustomArea(selectedAreaDraft.id, name)}
                    />
                  </label>
                  <label>
                    <span>{t('Move to floor')}</span>
                    <select
                      class="cl-field"
                      disabled={editorReadOnly}
                      value={selectedRoom.floor_id ?? ''}
                      onchange={(event) =>
                        moveAreaToFloor(
                          selectedRoom.id,
                          (event.currentTarget as HTMLSelectElement).value,
                          true
                        )}
                    >
                      {#each selectableFloors as floorOption (floorOption.id)}
                        <option value={floorOption.id}>{floorLabel(floorOption)}</option>
                      {/each}
                    </select>
                  </label>
                  <div class="area-colour"><span>{t('Colour identity')}</span><div><ClassicPalettePicker value={selectedAreaDraft.color} palette={AREA_PALETTE} label={t('Choose area colour')} disabled={editorReadOnly} onselect={(color) => { selectedAreaDraft.color = color; restaurantConfig.touch(); }} /><small>{t('Shared with linked positions and Planning.')}</small></div></div>
                  <dl class="inspector-stats">
                    <div><dt>{t('Positions')}</dt><dd>{positionCountForArea(selectedAreaDraft.id)}</dd></div>
                  </dl>
                  <p class="resize-note">{t('Drag to move. Pull any edge or corner to reshape; nearby areas align automatically.')}</p>
                </div>
              {:else if mode === 'areas'}
                <div class="selection-hint is-above">
                  {@render floorNavigator()}
                  <p>{t('Select an area on the plan to edit it. Pull any outside edge or corner to reshape this floor.')}</p>
                </div>
              {/if}

              {#if mode === 'tables' && selectedTable}
                <div class="selection-bar table-selection is-above">
                  <header class="inspector-head">
                    <span class="inspector-glyph table-glyph is-{selectedTable.shape}" aria-hidden="true"></span>
                    <div><strong>{t('Table details')}</strong><small>{selectedRoom?.name ?? floorLabel(selectedFloor)}</small></div>
                    <ClassicRowMenu
                      disabled={editorReadOnly}
                      items={[
                        {
                          label: t('Duplicate'),
                          onselect: () => duplicateTable(selectedTable)
                        },
                        {
                          label: t('Archive'),
                          tone: 'danger',
                          onselect: () => (tableToArchive = selectedTable)
                        }
                      ]}
                    />
                  </header>
                  {@render floorNavigator()}
                  <label><span>{t('Table')}</span><input class="cl-field" disabled={editorReadOnly} bind:value={selectedTable.label} oninput={touch} /></label>
                  <div class="capacity-field">
                    <span>{t('Capacity')}</span>
                    <div>
                      <label><small>{t('Minimum')}</small><input class="cl-field" disabled={editorReadOnly} type="number" min="1" max="100" value={selectedTable.minimum_capacity} oninput={(event) => tableCapacityChanged(selectedTable, 'minimum', event.currentTarget.value)} /></label>
                      <span aria-hidden="true">–</span>
                      <label><small>{t('Maximum')}</small><input class="cl-field" disabled={editorReadOnly} type="number" min="1" max="500" value={selectedTable.maximum_capacity} oninput={(event) => tableCapacityChanged(selectedTable, 'maximum', event.currentTarget.value)} /></label>
                    </div>
                  </div>
                  <div class="shape-field">
                    <span>{t('Shape')}</span>
                    <div class="shape-picker">
                      {#each [
                        { value: 'round', label: t('Round') },
                        { value: 'square', label: t('Square') },
                        { value: 'rectangle', label: t('Rectangle') }
                      ] as option (option.value)}
                        <button
                          class:is-active={selectedTable.shape === option.value}
                          type="button"
                          disabled={editorReadOnly}
                          aria-pressed={selectedTable.shape === option.value}
                          title={option.label}
                          onclick={() => setTableShape(selectedTable, option.value as ReservationTableDraft['shape'])}
                        >
                          <i class="shape-swatch is-{option.value}" aria-hidden="true"></i>
                          <span>{option.label}</span>
                        </button>
                      {/each}
                    </div>
                  </div>
                  <dl class="inspector-stats table-stats">
                    <div><dt>{t('Footprint')}</dt><dd>{tableFootprint(selectedTable)}</dd></div>
                    <div><dt>{t('Seats')}</dt><dd>{selectedTable.minimum_capacity}–{selectedTable.maximum_capacity}</dd></div>
                  </dl>
                  <button
                    class="cl-btn is-subtle"
                    type="button"
                    disabled={editorReadOnly}
                    onclick={() => fitTableToCapacity(selectedTable, true)}
                  >{t('Fit table to seats')}</button>
                  <label class="table-availability">
                    <input type="checkbox" disabled={editorReadOnly} bind:checked={selectedTable.blocked} onchange={touch} />
                    <span><strong>{t('Temporarily unavailable')}</strong><small>{t('Keep this table off the live seating plan.')}</small></span>
                  </label>
                  <p class="resize-note">{t('Drag to move. Pull any edge or corner to resize; nearby tables align automatically.')}</p>
                  {#if selectedTable.shape === 'rectangle'}
                    <button class="cl-btn" type="button" disabled={editorReadOnly} onclick={() => turnTable(selectedTable)}>{t('Turn table')}</button>
                  {/if}
                </div>
              {:else if selectedRoomDraft && selectedRoom && mode === 'tables'}
                <div class="selection-bar room-selection is-above">
                  <header class="inspector-head"><WorkspaceAreaIcon icon={areaIconFor(selectedRoom.work_area_id)} color={selectedRoom.area_color} size={20} /><div><strong>{selectedRoom.name}</strong><small>{t('Dining area')}</small></div></header>
                  {@render floorNavigator()}
                  <dl class="inspector-stats">
                    <div><dt>{t('Floor')}</dt><dd>{floorLabel(selectedFloor)}</dd></div>
                    <div><dt>{t('Tables')}</dt><dd>{floorTables.filter((table) => table.room_id === selectedRoom.id).length}</dd></div>
                  </dl>
                  <p class="resize-note">{t('Drag the area background to move it. Pull any edge or corner to reshape it; tables remain safely inside.')}</p>
                  <button class="cl-btn" type="button" disabled={editorReadOnly} onclick={() => arrangeTables()}>{t('Arrange tables')}</button>
                  <button class="cl-btn is-primary" type="button" disabled={editorReadOnly} onclick={addTable}>+ {t('Add table')}</button>
                </div>
              {:else if mode === 'tables'}
                <div class="selection-hint is-above">{@render floorNavigator()}<strong>{t('Choose an area')}</strong><p>{t('Select an area to add tables, or drag its background to adjust the layout.')}</p></div>
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
                  roomName={floorLabel(selectedFloor)}
                  floorWidth={selectedFloor.canvas_width}
                  floorHeight={selectedFloor.canvas_height}
                  editable={!editorReadOnly}
                  showHeader={false}
                  floorEditable={mode === 'areas' && !editorReadOnly}
                  roomsEditable={!editorReadOnly}
                  tablesEditable={mode === 'tables' && !editorReadOnly}
                  tablesSelectable
                  showTableCount={mode === 'tables'}
                  selectedRoomId={selectedTableId ? '' : selectedRoomId}
                  {selectedTableId}
                  emptyMessage="Place an area on this floor, then add its tables."
                  onroomselect={(room) => {
                    selectedRoomId = room.id;
                    selectedTableId = '';
                  }}
                  onroommove={moveRoom}
                  onroomresize={resizeRoom}
                  onfloorresize={mode === 'areas' ? resizeFloor : () => {}}
                  onselect={(table) => {
                    selectedTableId = table.id;
                    selectedRoomId = table.room_id;
                  }}
                  onmove={mode === 'tables' ? moveTable : () => {}}
                  onresize={mode === 'tables' ? resizeTable : () => {}}
                />
              </div>

            {:else}
              <div class="cl-empty">
                <strong>{t('No floor plan yet')}</strong>
                <span>{mode === 'areas' ? t('Add a standard area to start shaping your restaurant.') : t('Set up areas in Restaurant → Areas before adding tables.')}</span>
                {#if mode === 'tables'}
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
  .add-area-picker { width: min(320px, 42vw); }
  .area-directory { --cl-grid-max-height: calc(100dvh - 190px); }
  .area-directory .cl-table { min-width: 680px; }
  .area-directory tr.is-new > td { background: color-mix(in srgb, var(--cl-accent) 6%, var(--cl-surface)); }
  .area-directory tr.is-new > td:first-child { box-shadow: inset 3px 0 0 var(--cl-accent); }
  .area-row-name { min-width: 230px; display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: center; gap: 9px; }
  .area-row-name > strong { font-size: 12px; }
  .floor-select { min-width: 150px; }
  .area-editor { min-width: 0; display: grid; gap: 10px; }
  .plan-card { min-width: 0; display: grid; grid-template-columns: minmax(560px, 1fr) 286px; grid-template-rows: minmax(480px, 1fr); overflow: hidden; border-color: var(--cl-line-strong); }
  .area-canvas { min-width: 0; grid-column: 1; grid-row: 1; padding: 0; border-right: 1px solid var(--cl-line); background: var(--cl-surface-muted); }
  .selection-bar {
    min-width: 0;
    grid-column: 2;
    grid-row: 1;
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
  .selection-bar label span, .area-colour > span { color: var(--cl-muted); font-size: 11px; font-weight: var(--rst-fw-bold); }
  .selection-bar input, .selection-bar select { width: 100%; }
  .selection-bar .cl-btn { width: 100%; }
  .inspector-head { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding-bottom: 14px; border-bottom: 1px solid var(--cl-line); }
  .inspector-head > div { min-width: 0; display: grid; gap: 2px; }
  .inspector-head strong { font-size: 13px; }
  .inspector-head small { overflow: hidden; color: var(--cl-muted); font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
  .inspector-glyph { width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid var(--cl-line); border-radius: 6px; background: var(--cl-surface-muted); color: var(--cl-accent); font-size: 12px; font-weight: var(--rst-fw-bold); }
  .table-glyph::before {
    content: '';
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-radius: 3px;
    background: var(--cl-surface);
    box-shadow: 0 -5px 0 -3px currentColor, 0 5px 0 -3px currentColor;
  }
  .table-glyph.is-round::before { border-radius: 50%; }
  .table-glyph.is-rectangle::before { width: 20px; height: 12px; }
  .floor-navigator { display: grid; grid-template-columns: 31px minmax(0, 1fr) 31px; align-items: center; overflow: hidden; border: 1px solid var(--cl-line); border-radius: 6px; background: var(--cl-surface-muted); }
  .floor-navigator button { width: 31px; height: 31px; display: grid; place-items: center; padding: 0; border: 0; background: transparent; color: var(--cl-muted); cursor: pointer; }
  .floor-navigator button:first-child { border-right: 1px solid var(--cl-line); }
  .floor-navigator button:last-child { border-left: 1px solid var(--cl-line); }
  .floor-navigator button:hover:not(:disabled) { background: var(--cl-surface); color: var(--cl-accent); }
  .floor-navigator button:disabled { cursor: default; opacity: .3; }
  .floor-navigator label { min-width: 0; display: block; }
  .floor-navigator select { width: 100%; height: 31px; padding: 0 8px; border: 0; outline: 0; background: transparent; color: var(--cl-ink); font: inherit; font-size: 11px; font-weight: var(--rst-fw-bold); text-align: center; cursor: pointer; }
  .area-colour { display: grid; gap: 7px; }
  .area-colour > div { display: flex; align-items: center; gap: 8px; }
  .area-colour small { color: var(--cl-muted); font-size: 10px; line-height: 1.35; }
  .inspector-stats { display: grid; gap: 0; margin: 0; border-top: 1px solid var(--cl-line); border-bottom: 1px solid var(--cl-line); }
  .inspector-stats div { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 0; }
  .inspector-stats div + div { border-top: 1px solid var(--cl-line); }
  .inspector-stats dt { color: var(--cl-muted); font-size: 11px; }
  .inspector-stats dd { margin: 0; color: var(--cl-ink); font-size: 12px; font-weight: var(--rst-fw-bold); }
  .capacity-field,
  .shape-field {
    display: grid;
    gap: 6px;
  }
  .capacity-field > span,
  .shape-field > span {
    color: var(--cl-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
  }
  .capacity-field > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: end;
    gap: 8px;
  }
  .capacity-field > div > span {
    padding-bottom: 9px;
    color: var(--cl-muted);
    font-size: 11px;
  }
  .capacity-field label { gap: 4px; }
  .capacity-field label small {
    color: var(--cl-muted);
    font-size: 9px;
    font-weight: var(--rst-fw-medium);
  }
  .shape-picker {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
  }
  .shape-picker button {
    min-width: 0;
    display: grid;
    justify-items: center;
    gap: 5px;
    padding: 8px 4px 7px;
    border: 1px solid var(--cl-line);
    border-radius: 6px;
    background: var(--cl-surface);
    color: var(--cl-muted);
    font: inherit;
    font-size: 9px;
    cursor: pointer;
  }
  .shape-picker button:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--cl-accent) 45%, var(--cl-line));
    color: var(--cl-ink);
  }
  .shape-picker button.is-active {
    border-color: color-mix(in srgb, var(--cl-accent) 60%, var(--cl-line));
    background: color-mix(in srgb, var(--cl-accent) 7%, var(--cl-surface));
    color: var(--cl-accent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cl-accent) 12%, transparent);
  }
  .shape-picker button:disabled { cursor: default; opacity: .55; }
  .shape-swatch {
    width: 17px;
    height: 17px;
    display: block;
    border: 1.5px solid currentColor;
    border-radius: 3px;
  }
  .shape-swatch.is-round { border-radius: 50%; }
  .shape-swatch.is-rectangle { width: 24px; height: 14px; }
  .table-stats { margin-top: -2px; }
  .table-availability {
    grid-template-columns: auto minmax(0, 1fr) !important;
    align-items: start;
    gap: 9px !important;
    padding: 10px;
    border: 1px solid var(--cl-line);
    border-radius: 6px;
    background: var(--cl-surface-muted);
  }
  .table-availability > input {
    width: 15px;
    height: 15px;
    margin: 1px 0 0;
    accent-color: var(--cl-accent);
  }
  .table-availability > span {
    display: grid;
    gap: 2px;
    color: var(--cl-ink) !important;
  }
  .table-availability strong { font-size: 10.5px; }
  .table-availability small {
    color: var(--cl-muted);
    font-size: 9.5px;
    font-weight: var(--rst-fw-regular);
    line-height: 1.35;
  }
  .resize-note { margin: 0; color: var(--cl-muted); font-size: 10.5px; line-height: 1.5; }
  .selection-hint { grid-column: 2; grid-row: 1; display: flex; flex-direction: column; align-items: stretch; gap: 12px; padding: 16px; background: var(--cl-surface); color: var(--cl-muted); font-size: 11px; text-align: left; }
  .selection-hint.is-above { border: 0; }
  .selection-hint strong { color: var(--cl-ink); font-size: 13px; }
  .selection-hint p { margin: 0; line-height: 1.5; }
  .dialog-copy { margin: 0; color: var(--cl-muted); font-size: 12px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .cl-btn.is-problem { border-color: var(--cl-problem-line); background: var(--cl-problem-wash); color: var(--cl-problem); }
  @media (max-width: 980px) {
    .plan-card { grid-template-columns: minmax(520px, 1fr) 250px; }
  }
  @media (max-width: 760px) {
    .plan-card { display: block; }
    .selection-bar, .selection-hint { border-top: 1px solid var(--cl-line); }
    .area-canvas { border-right: 0; }
  }
</style>
