<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import Dialog from '$lib/components/Dialog.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicPalettePicker from '$lib/classic/ClassicPalettePicker.svelte';
  import ClassicRowMenu from '$lib/classic/ClassicRowMenu.svelte';
  import ClassicCellBadge from '$lib/classic/ClassicCellBadge.svelte';
  import ClassicPicker from '$lib/classic/ClassicPicker.svelte';
  import { StableDraftPlacement } from '$lib/classic/stable-draft-placement';
  import type { ClassicRestaurantContext } from '$lib/classic/classic-workspace-context';
  import { restaurantConfig } from '$lib/classic/classic-restaurant.svelte';
  import { floorPlansDraft } from './floor-plans-draft.svelte';
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
    ReservationCombinationDraft,
    ReservationTableDraft
  } from './reservation-types';
  import {
    combinationCapacityBounds,
    combinationName,
    isValidTableCombination,
    reconcileTableCombinations
  } from './reservation-table-combinations';
  import { toasts } from '$lib/ui/toast.svelte';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { AREA_PALETTE, defaultAreaColor } from '$lib/ui/position-color';
  import {
    WORKSPACE_AREA_CATALOGUE,
    workspaceAreaByKey
  } from '$lib/restaurant/workspace-catalogue';
  import {
    areaInstanceLabel,
    areaInstanceLocator,
    duplicateAreaTypeCount,
    nextAreaInstanceNumber,
    type AreaInstanceIdentity
  } from '$lib/restaurant/area-instance';
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

  // The plan itself lives in a store so it survives a tab change; only the
  // selection and request state below belong to this view.
  const source = $derived(floorPlansDraft.source);
  const draft = $derived(floorPlansDraft.draft);
  const dirty = $derived(floorPlansDraft.dirty);
  const pendingAreaIds = $derived(floorPlansDraft.pendingAreaIds);
  let loading = $state(false);
  let saving = $state(false);
  let error = $state('');
  let selectedFloorId = $state('');
  let selectedRoomId = $state('');
  let selectedTableId = $state('');
  let tableToArchive = $state<ReservationTableDraft | null>(null);
  type CombinationEditor = {
    id: string;
    roomId: string;
    anchorTableId: string;
    tableIds: string[];
    minimumCapacity: number;
    maximumCapacity: number;
    isNew: boolean;
  };
  let combinationEditor = $state<CombinationEditor | null>(null);
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
  const TABLE_COLLISION_GAP = 6;
  const editorReadOnly = $derived(workspace.isPreview);
  const planGeometryReadOnly = $derived(compactViewport || workspace.isPreview);
  function catalogueAreaItems(): WorkspaceCataloguePickerItem[] {
    return WORKSPACE_AREA_CATALOGUE.map((area) => ({
      key: area.key,
      label: area.label,
      category: area.category,
      icon: area.icon,
      color: area.color,
      recommended: area.starter
    }));
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
  const floorOptions = $derived(
    selectableFloors.map((floor) => ({ value: floor.id, label: floorLabel(floor) }))
  );
  const mergedRooms = $derived.by(() => {
    if (!draft || !source) return [] as ReservationRoom[];
    return draft.rooms
      .filter((room) => room.active)
      .map((room) => {
        const persisted = source!.rooms.find((item) => item.id === room.id);
        const draftArea = restaurantContext?.draft.areas.find((item) => item.id === room.work_area_id);
        const area = source!.areas.find((item) => item.id === room.work_area_id);
        const floorLevel =
          draft!.floors.find((floor) => floor.id === room.floor_id)?.level ?? 0;
        return {
          id: room.id,
          restaurant_id: source!.restaurantId,
          work_area_id: room.work_area_id,
          floor_id: room.floor_id,
          name: draftArea
            ? areaInstanceLabel(
                {
                  id: draftArea.id,
                  name: draftArea.name,
                  active: draftArea.active,
                  catalogueKey: draftArea.catalogueKey,
                  instanceNumber: draftArea.instanceNumber,
                  floorLevel
                },
                areaInstanceIdentities()
              )
            : area
              ? areaInstanceLabel(
                  {
                    id: area.id,
                    name: area.name,
                    active: area.active,
                    catalogueKey: area.catalogue_key ?? '',
                    instanceNumber: area.instance_number,
                    floorLevel
                  },
                  areaInstanceIdentities()
                )
              : persisted?.name ?? t('Area'),
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
      const leftPendingIndex = pendingAreaIds.indexOf(left.work_area_id);
      const rightPendingIndex = pendingAreaIds.indexOf(right.work_area_id);
      const leftIsPending = leftPendingIndex >= 0;
      const rightIsPending = rightPendingIndex >= 0;
      if (leftIsPending !== rightIsPending) return leftIsPending ? -1 : 1;
      if (leftIsPending && rightIsPending && leftPendingIndex !== rightPendingIndex) {
        return leftPendingIndex - rightPendingIndex;
      }
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
  const overlappingTableIds = $derived.by(() => {
    const ids = new Set<string>();
    const tables = (draft?.tables ?? []).filter((table) => table.active);
    for (let leftIndex = 0; leftIndex < tables.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < tables.length; rightIndex += 1) {
        const left = tables[leftIndex];
        const right = tables[rightIndex];
        if (left.room_id !== right.room_id || !tablesOverlap(left, right)) continue;
        ids.add(left.id);
        ids.add(right.id);
      }
    }
    return ids;
  });
  const selectedRoom = $derived(
    mergedRooms.find((room) => room.id === selectedRoomId) ?? null
  );
  const selectedRoomDraft = $derived(
    draft?.rooms.find((room) => room.id === selectedRoomId) ?? null
  );
  const selectedAreaDraft = $derived(
    restaurantContext?.draft.areas.find((area) => area.id === selectedRoom?.work_area_id) ?? null
  );
  const selectedArea = $derived(
    selectedAreaDraft ??
      source?.areas.find((area) => area.id === selectedRoom?.work_area_id) ??
      null
  );
  const selectedRoomReservable = $derived.by(() => {
    const catalogueKey =
      selectedArea && 'catalogueKey' in selectedArea
        ? selectedArea.catalogueKey
        : selectedArea?.catalogue_key;
    return !catalogueKey || (workspaceAreaByKey.get(catalogueKey)?.reservable ?? true);
  });
  const selectedTable = $derived(
    draft?.tables.find((table) => table.id === selectedTableId) ?? null
  );
  const selectedTableCombinations = $derived.by(() => {
    if (!draft || !selectedTable) return [] as ReservationCombinationDraft[];
    return draft.combinations
      .filter(
        (combination) =>
          combination.active &&
          combination.room_id === selectedTable.room_id &&
          combination.table_ids.includes(selectedTable.id)
      )
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order ||
          left.name.localeCompare(right.name, undefined, { numeric: true })
      );
  });
  const selectedRoomTableOptions = $derived.by(() => {
    if (!draft || !selectedTable) return [] as ReservationTableDraft[];
    return draft.tables
      .filter(
        (table) =>
          table.active &&
          table.room_id === selectedTable.room_id &&
          table.id !== selectedTable.id
      )
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order ||
          left.label.localeCompare(right.label, undefined, { numeric: true })
      );
  });
  const combinationEditorBounds = $derived.by(() =>
    combinationEditor && draft
      ? combinationCapacityBounds(
          combinationEditor.tableIds,
          combinationEditor.roomId,
          draft.tables
        )
      : null
  );
  $effect(() => {
    if (
      combinationEditor &&
      selectedTableId !== combinationEditor.anchorTableId
    ) {
      combinationEditor = null;
    }
  });
  $effect(() => {
    const restaurantId = workspace.activeId;
    // Coming back to this view reuses the draft in the store — a reload here
    // would throw away work the user can still see in the other tab.
    if (!restaurantId || floorPlansDraft.holds(restaurantId)) return;
    void load(restaurantId);
  });

  async function load(restaurantId: string) {
    loading = true;
    error = '';
    try {
      const next = await getReservationFloorPlans(restaurantId);
      floorPlansDraft.adopt(next, toDraft(next));
      resetAreaDirectoryPlacement();
      const loaded = floorPlansDraft.draft!;
      if (!selectedFloorId || !loaded.floors.some((floor) => floor.id === selectedFloorId && floor.active)) {
        selectedFloorId =
          loaded.floors.find((floor) => floor.active && floor.level === 0)?.id ??
          loaded.floors.find((floor) => floor.active)?.id ??
          '';
      }
      selectedRoomId = '';
      selectedTableId = '';
      combinationEditor = null;
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
    floorPlansDraft.touch();
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

  function areaInstanceIdentities(): AreaInstanceIdentity[] {
    if (restaurantContext) {
      return restaurantContext.draft.areas.map((area) => ({
        id: area.id,
        name: area.name,
        active: area.active,
        catalogueKey: area.catalogueKey,
        instanceNumber: area.instanceNumber,
        floorLevel: area.floorLevel ?? 0
      }));
    }
    return (source?.areas ?? []).map((area) => ({
      id: area.id,
      name: area.name,
      active: area.active,
      catalogueKey: area.catalogue_key ?? '',
      instanceNumber: area.instance_number,
      floorLevel: area.floor_level ?? 0
    }));
  }

  function areaInstanceLocatorFor(
    areaId: string,
    floorId: string | null
  ): string {
    const level = draft?.floors.find((floor) => floor.id === floorId)?.level ?? 0;
    const identities = areaInstanceIdentities().map((candidate) =>
      candidate.id === areaId ? { ...candidate, floorLevel: level } : candidate
    );
    const area = identities.find((candidate) => candidate.id === areaId);
    if (
      !area ||
      duplicateAreaTypeCount(area, identities) <= 1
    ) {
      return '';
    }
    return areaInstanceLocator(area, identities);
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
          position.areaIds.includes(areaId)
      ).length ?? 0
    );
  }

  async function addArea() {
    if (!draft || !selectedFloor || !restaurantContext || workspace.isPreview) return;
    const areas = restaurantContext.draft.areas;
    const id = crypto.randomUUID();
    const area = {
      id,
      name: '',
      code: '',
      notes: '',
      active: true,
      lunchStart: '',
      lunchEnd: '',
      eveningStart: '',
      eveningEnd: '',
      color: defaultAreaColor(areas.length),
      catalogueKey: '',
      iconKey: '',
      instanceNumber: 1,
      floorLevel: selectedFloor.level
    };
    restaurantContext.draft.areas = [area, ...areas];
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
    floorPlansDraft.pendingAreaIds = [id, ...pendingAreaIds];
    await tick();
    // Keep the current view. List users edit the new row; plan users edit the
    // selected area in the details rail without losing the floor context.
    const field = document.getElementById(`area-picker-${id}`);
    field?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    field?.focus();
  }

  function selectAreaCatalogue(
    areaId: string,
    item: WorkspaceCataloguePickerItem
  ): void {
    const area = restaurantContext?.draft.areas.find((candidate) => candidate.id === areaId);
    if (!area) return;
    const changingType = area.catalogueKey !== item.key;
    area.name = item.label;
    area.catalogueKey = item.key;
    area.color = item.color ?? area.color;
    area.iconKey = item.icon ?? '';
    if (changingType) {
      area.instanceNumber = nextAreaInstanceNumber(
        item.key,
        areaInstanceIdentities(),
        area.id
      );
    }
    restaurantConfig.touch();
  }

  function typeAreaName(areaId: string, name: string): void {
    const area = restaurantContext?.draft.areas.find((candidate) => candidate.id === areaId);
    if (!area) return;
    const catalogueLabel = workspaceAreaByKey.get(area.catalogueKey)?.label ?? '';
    if (
      area.catalogueKey &&
      name.trim().toLocaleLowerCase() !==
        catalogueLabel.trim().toLocaleLowerCase()
    ) {
      area.catalogueKey = '';
      area.iconKey = '';
    }
    if (!area.catalogueKey) {
      area.instanceNumber = nextAreaInstanceNumber(
        '',
        areaInstanceIdentities(),
        area.id,
        name
      );
    }
    restaurantConfig.touch();
  }

  function selectCustomArea(areaId: string, name: string): void {
    const area = restaurantContext?.draft.areas.find((candidate) => candidate.id === areaId);
    if (!area) return;
    if (name.trim()) area.name = name.trim();
    area.catalogueKey = '';
    area.iconKey = '';
    area.instanceNumber = nextAreaInstanceNumber(
      '',
      areaInstanceIdentities(),
      area.id,
      area.name
    );
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
        'This removes the area from Schedule and Staffing, unlinks {positions} positions and archives {tables} reservation tables.',
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
    draft.combinations = reconcileTableCombinations(
      draft.combinations,
      draft.tables
    );
    combinationEditor = null;
    restaurantContext.draft.coverage = restaurantContext.draft.coverage.filter(
      (item) => item.areaId !== archivedAreaId
    );
    for (const position of restaurantContext.draft.jobFunctions) {
      position.areaIds = position.areaIds.filter((areaId) => areaId !== archivedAreaId);
    }
    floorPlansDraft.pendingAreaIds = pendingAreaIds.filter((areaId) => areaId !== archivedAreaId);
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
    const preservedWidth = Number(target.width);
    const preservedHeight = Number(target.height);
    floor.canvas_width = Math.min(
      1800,
      Math.max(
        Number(floor.canvas_width),
        Math.ceil(
          (geometry.x + preservedWidth + ROOM_GRID) / ROOM_GRID
        ) * ROOM_GRID
      )
    );
    floor.canvas_height = Math.min(
      1200,
      Math.max(
        Number(floor.canvas_height),
        Math.ceil(
          (geometry.y + preservedHeight + ROOM_GRID) / ROOM_GRID
        ) * ROOM_GRID
      )
    );
    const nextX = clamp(
      geometry.x,
      0,
      Math.max(0, Number(floor.canvas_width) - preservedWidth)
    );
    const nextY = clamp(
      geometry.y,
      0,
      Math.max(0, Number(floor.canvas_height) - preservedHeight)
    );
    const dx = nextX - Number(target.position_x);
    const dy = nextY - Number(target.position_y);
    target.floor_id = floor.id;
    target.position_x = nextX;
    target.position_y = nextY;
    target.width = preservedWidth;
    target.height = preservedHeight;
    const area = restaurantContext?.draft.areas.find(
      (candidate) => candidate.id === target.work_area_id
    );
    if (area) area.floorLevel = floor.level;
    draft.tables
      .filter((table) => table.room_id === roomId)
      .forEach((table) => {
        table.position_x = Number(table.position_x) + dx;
        table.position_y = Number(table.position_y) + dy;
      });
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
      table.minimum_capacity = clamp(value, 1, 16);
      table.maximum_capacity = Math.max(
        table.minimum_capacity,
        Math.min(16, Number(table.maximum_capacity) || table.minimum_capacity)
      );
    } else {
      table.maximum_capacity = clamp(value, table.minimum_capacity, 16);
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

  function tablesOverlap(
    left: ReservationTableDraft,
    right: ReservationTableDraft,
    gap = TABLE_COLLISION_GAP
  ): boolean {
    return !(
      Number(left.position_x) + Number(left.width) + gap <= Number(right.position_x) ||
      Number(right.position_x) + Number(right.width) + gap <= Number(left.position_x) ||
      Number(left.position_y) + Number(left.height) + gap <= Number(right.position_y) ||
      Number(right.position_y) + Number(right.height) + gap <= Number(left.position_y)
    );
  }

  function nextTablePosition(
    room: ReservationRoomDraft,
    width: number,
    height: number,
    roomTables: ReservationTableDraft[]
  ): { x: number; y: number } | null {
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
    return null;
  }

  function arrangeTables(roomId = selectedRoomId) {
    if (!draft) return;
    const room = draft.rooms.find((item) => item.id === roomId);
    if (!room) return;
    const tables = draft.tables.filter((table) => table.room_id === roomId && table.active);
    const placed: ReservationTableDraft[] = [];
    const positions = new Map<string, { x: number; y: number }>();
    for (const table of tables) {
      const position = nextTablePosition(
        room,
        Number(table.width),
        Number(table.height),
        placed
      );
      if (!position) {
        toasts.show(
          t('These tables need more room. Enlarge the area or archive a table first.'),
          'danger'
        );
        return;
      }
      positions.set(table.id, position);
      placed.push({
        ...table,
        position_x: position.x,
        position_y: position.y
      });
    }
    for (const table of tables) {
      const position = positions.get(table.id);
      if (!position) continue;
      table.position_x = position.x;
      table.position_y = position.y;
    }
    touch();
  }

  function addTable() {
    if (!draft || !selectedRoomDraft) return;
    if (!selectedRoomReservable) {
      toasts.show(
        t('Tables can only be added to reservable guest areas.'),
        'danger'
      );
      return;
    }
    const roomTables = draft.tables.filter(
      (table) => table.room_id === selectedRoomDraft.id && table.active
    );
    const labels = new Set(roomTables.map((table) => table.label));
    let number = 1;
    while (labels.has(String(number))) number += 1;
    const { width, height } = recommendedTableFootprint(2, 'round');
    const position = nextTablePosition(selectedRoomDraft, width, height, roomTables);
    if (!position) {
      toasts.show(
        t('No free table space in this area. Move tables or enlarge the area first.'),
        'danger'
      );
      return;
    }
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
    if (!position) {
      toasts.show(
        t('No free table space in this area. Move tables or enlarge the area first.'),
        'danger'
      );
      return;
    }
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

  function beginNewCombination(table: ReservationTableDraft) {
    if (!draft) return;
    const peers = draft.tables.filter(
      (candidate) =>
        candidate.active &&
        candidate.room_id === table.room_id &&
        candidate.id !== table.id
    );
    if (!peers.length) {
      toasts.show(
        t('Add another table in this area before creating a joinable set.'),
        'danger'
      );
      return;
    }
    combinationEditor = {
      id: crypto.randomUUID(),
      roomId: table.room_id,
      anchorTableId: table.id,
      tableIds: [table.id],
      minimumCapacity: Math.min(16, Number(table.maximum_capacity) + 1),
      maximumCapacity: Number(table.maximum_capacity),
      isNew: true
    };
  }

  function beginEditCombination(combination: ReservationCombinationDraft) {
    if (!draft || !selectedTable) return;
    const tableIds = [
      selectedTable.id,
      ...combination.table_ids.filter(
        (tableId) =>
          tableId !== selectedTable.id &&
          draft?.tables.some(
            (table) =>
              table.id === tableId &&
              table.active &&
              table.room_id === selectedTable.room_id
          )
      )
    ];
    const bounds = combinationCapacityBounds(
      tableIds,
      combination.room_id,
      draft.tables
    );
    combinationEditor = {
      id: combination.id,
      roomId: combination.room_id,
      anchorTableId: selectedTable.id,
      tableIds,
      minimumCapacity: bounds
        ? clamp(
            Number(combination.minimum_capacity),
            bounds.minimum,
            bounds.maximum
          )
        : Number(combination.minimum_capacity),
      maximumCapacity: bounds
        ? clamp(
            Number(combination.maximum_capacity),
            Math.max(bounds.minimum, Number(combination.minimum_capacity)),
            bounds.maximum
          )
        : Number(combination.maximum_capacity),
      isNew: false
    };
  }

  function toggleCombinationTable(tableId: string, checked: boolean) {
    if (!combinationEditor || !draft) return;
    const tableIds = checked
      ? [...new Set([...combinationEditor.tableIds, tableId])]
      : combinationEditor.tableIds.filter(
          (candidate) =>
            candidate !== tableId ||
            candidate === combinationEditor?.anchorTableId
        );
    const bounds = combinationCapacityBounds(
      tableIds,
      combinationEditor.roomId,
      draft.tables
    );
    combinationEditor = {
      ...combinationEditor,
      tableIds,
      minimumCapacity: bounds
        ? bounds.recommendedMinimum
        : combinationEditor.minimumCapacity,
      maximumCapacity: bounds
        ? bounds.maximum
        : combinationEditor.maximumCapacity
    };
  }

  function combinationCapacityChanged(
    field: 'minimum' | 'maximum',
    rawValue: string
  ) {
    if (!combinationEditor || !combinationEditorBounds) return;
    const value = Math.round(Number(rawValue) || combinationEditorBounds.minimum);
    if (field === 'minimum') {
      const minimumCapacity = clamp(
        value,
        combinationEditorBounds.minimum,
        combinationEditorBounds.maximum
      );
      combinationEditor = {
        ...combinationEditor,
        minimumCapacity,
        maximumCapacity: Math.max(
          minimumCapacity,
          Math.min(
            combinationEditorBounds.maximum,
            combinationEditor.maximumCapacity
          )
        )
      };
    } else {
      combinationEditor = {
        ...combinationEditor,
        maximumCapacity: clamp(
          value,
          combinationEditor.minimumCapacity,
          combinationEditorBounds.maximum
        )
      };
    }
  }

  function saveCombinationEditor() {
    if (!draft || !combinationEditor || !combinationEditorBounds) return;
    const name = combinationName(
      combinationEditor.tableIds,
      combinationEditor.roomId,
      draft.tables
    );
    const memberKey = [...combinationEditor.tableIds].sort().join(':');
    const duplicate = draft.combinations.some(
      (combination) =>
        combination.active &&
        combination.id !== combinationEditor?.id &&
        combination.room_id === combinationEditor?.roomId &&
        [...combination.table_ids].sort().join(':') === memberKey
    );
    if (duplicate) {
      toasts.show(t('This joinable table set already exists.'), 'danger');
      return;
    }
    const next: ReservationCombinationDraft = {
      id: combinationEditor.id,
      room_id: combinationEditor.roomId,
      name,
      minimum_capacity: combinationEditor.minimumCapacity,
      maximum_capacity: combinationEditor.maximumCapacity,
      active: true,
      sort_order: draft.combinations.filter(
        (combination) =>
          combination.active &&
          combination.room_id === combinationEditor?.roomId
      ).length,
      table_ids: [...combinationEditor.tableIds]
    };
    const existingIndex = draft.combinations.findIndex(
      (combination) => combination.id === next.id
    );
    if (existingIndex >= 0) {
      next.sort_order = draft.combinations[existingIndex].sort_order;
      draft.combinations[existingIndex] = next;
    } else {
      draft.combinations = [...draft.combinations, next];
    }
    combinationEditor = null;
    touch();
  }

  function removeCombination(combination: ReservationCombinationDraft) {
    if (!draft) return;
    if (
      source?.combinations.some(
        (persisted) => persisted.id === combination.id
      )
    ) {
      combination.active = false;
    } else {
      draft.combinations = draft.combinations.filter(
        (candidate) => candidate.id !== combination.id
      );
    }
    if (combinationEditor?.id === combination.id) combinationEditor = null;
    touch();
  }

  function combinationDisplayName(
    combination: ReservationCombinationDraft
  ): string {
    if (!draft) return combination.name;
    return (
      combinationName(
        combination.table_ids,
        combination.room_id,
        draft.tables
      ) || combination.name
    );
  }

  function archiveTable() {
    if (!tableToArchive || !draft) return;
    tableToArchive.active = false;
    draft.combinations = reconcileTableCombinations(
      draft.combinations,
      draft.tables
    );
    if (combinationEditor?.tableIds.includes(tableToArchive.id)) {
      combinationEditor = null;
    }
    if (selectedTableId === tableToArchive.id) selectedTableId = '';
    tableToArchive = null;
    touch();
  }

  function canSave(): boolean {
    if (!draft) return false;
    const activeFloors = draft.floors.filter((floor) => floor.active);
    const blankAreaIds = new Set(
      restaurantContext?.draft.areas
        .filter((area) => area.active && !area.name.trim())
        .map((area) => area.id) ?? []
    );
    const activeRooms = draft.rooms.filter(
      (room) => room.active && !blankAreaIds.has(room.work_area_id)
    );
    const activeRoomIds = new Set(activeRooms.map((room) => room.id));
    const activeTables = draft.tables.filter(
      (table) => table.active && activeRoomIds.has(table.room_id)
    );
    const activeTableIds = new Set(activeTables.map((table) => table.id));
    const activeAreas =
      restaurantContext?.draft.areas.filter(
        (area) => area.active && area.name.trim()
      ) ?? [];
    if ([...overlappingTableIds].some((tableId) => activeTableIds.has(tableId))) return false;
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
        activeAreas.some(
            (area) =>
              activeRooms.filter((room) => room.work_area_id === area.id).length !== 1
          ))
    ) {
      return false;
    }

    const tableLabels = new Set<string>();
    for (const table of activeTables) {
      if (
        !table.label.trim() ||
        table.minimum_capacity < 1 ||
        table.maximum_capacity < table.minimum_capacity ||
        table.maximum_capacity > 16 ||
        !activeRooms.some((room) => room.id === table.room_id)
      ) {
        return false;
      }
      const tableRoom = activeRooms.find((room) => room.id === table.room_id);
      if (
        !tableRoom ||
        Number(table.position_x) < Number(tableRoom.position_x) - 0.001 ||
        Number(table.position_y) < Number(tableRoom.position_y) - 0.001 ||
        Number(table.position_x) + Number(table.width) >
          Number(tableRoom.position_x) + Number(tableRoom.width) + 0.001 ||
        Number(table.position_y) + Number(table.height) >
          Number(tableRoom.position_y) + Number(tableRoom.height) + 0.001
      ) {
        return false;
      }
      const tableArea =
        restaurantContext?.draft.areas.find(
          (area) => area.id === tableRoom?.work_area_id
        ) ??
        source?.areas.find((area) => area.id === tableRoom?.work_area_id);
      const catalogueKey =
        tableArea && 'catalogueKey' in tableArea
          ? tableArea.catalogueKey
          : tableArea?.catalogue_key;
      if (
        catalogueKey &&
        workspaceAreaByKey.get(catalogueKey)?.reservable === false
      ) {
        return false;
      }
      const key = `${table.room_id}:${table.label.trim().toLocaleLowerCase()}`;
      if (tableLabels.has(key)) return false;
      tableLabels.add(key);
    }
    const combinationNames = new Set<string>();
    const combinationMembers = new Set<string>();
    for (const combination of draft.combinations.filter(
      (candidate) => candidate.active && activeRoomIds.has(candidate.room_id)
    )) {
      if (!isValidTableCombination(combination, activeTables)) return false;
      const nameKey = `${combination.room_id}:${combination.name.trim().toLocaleLowerCase()}`;
      const memberKey = `${combination.room_id}:${[...combination.table_ids].sort().join(':')}`;
      if (
        combinationNames.has(nameKey) ||
        combinationMembers.has(memberKey)
      ) {
        return false;
      }
      combinationNames.add(nameKey);
      combinationMembers.add(memberKey);
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
    floorPlansDraft.restore(toDraft(source));
    resetAreaDirectoryPlacement();
    const restored = floorPlansDraft.draft!;
    selectedFloorId =
      restored.floors.find((floor) => floor.active && floor.level === 0)?.id ??
      restored.floors.find((floor) => floor.active)?.id ??
      '';
    selectedRoomId = '';
    selectedTableId = '';
    combinationEditor = null;
    restaurantContext?.discard();
  }

  onMount(() =>
    unsavedChanges.register({
      id: mode === 'areas' ? 'restaurant-floor-layout' : 'reservation-table-layout',
      label: mode === 'areas' ? 'Restaurant floor layout' : 'Reservation table layout',
      priority: 20,
      // The draft outlives this view, so moving between the tabs that edit the
      // same plan costs nothing. Only leaving them is worth a question.
      navigationScopes: ['/restaurant', '/settings', '/reservations'],
      isDirty: () => floorPlansDraft.dirty,
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
      {#if mode === 'tables' && overlappingTableIds.size}
        <span class="layout-warning"><i></i>{t('{count} tables overlap', { count: overlappingTableIds.size })}</span>
      {/if}
    {/snippet}
    {#snippet actions()}
      {#if mode === 'areas'}
        <div class="view-switch" aria-label={t('View')}>
          <button class:is-active={editorView === 'list'} type="button" onclick={() => (editorView = 'list')}>{t('List')}</button>
          <button class:is-active={editorView === 'plan'} type="button" onclick={() => (editorView = 'plan')}>{t('Plan')}</button>
        </div>
        <button
          class="cl-btn is-primary"
          type="button"
          disabled={!selectedFloor || editorReadOnly}
          onclick={() => void addArea()}
        >+ {t('Add area')}</button>
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
                    class:is-new={pendingAreaIds.includes(room.work_area_id)}
                  >
                    <td>
                      <span class="area-row-name">
                        <WorkspaceAreaIcon icon={areaIconFor(room.work_area_id)} color={room.area_color} size={18} />
                        {#if areaDraft}
                          <span class="area-name-editor">
                            <WorkspaceCataloguePicker
                              inputId={`area-picker-${areaDraft.id}`}
                              bind:value={areaDraft.name}
                              selectedKey={areaDraft.catalogueKey}
                              items={catalogueAreaItems()}
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
                              onvaluechange={(value) => typeAreaName(areaDraft.id, value)}
                              onselect={(item) => selectAreaCatalogue(areaDraft.id, item)}
                              oncustom={(name) => selectCustomArea(areaDraft.id, name)}
                            />
                            {#if areaInstanceLocatorFor(areaDraft.id, room.floor_id)}
                              <small class="area-instance-locator">{areaInstanceLocatorFor(areaDraft.id, room.floor_id)}</small>
                            {/if}
                          </span>
                        {:else}
                          <strong>{room.name}</strong>
                        {/if}
                      </span>
                    </td>
                    <td>
                      <ClassicPicker
                        value={room.floor_id ?? ''}
                        options={floorOptions}
                        disabled={editorReadOnly}
                        placeholder="Not placed"
                        ariaLabel={t('Floor')}
                        onchange={(next) => moveAreaToFloor(room.id, next)}
                      />
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
                      items={catalogueAreaItems()}
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
                      onvaluechange={(value) => typeAreaName(selectedAreaDraft.id, value)}
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
                  <div class="area-colour"><span>{t('Colour identity')}</span><div><ClassicPalettePicker value={selectedAreaDraft.color} palette={AREA_PALETTE} label={t('Choose area colour')} disabled={editorReadOnly} onselect={(color) => { selectedAreaDraft.color = color; restaurantConfig.touch(); }} /><small>{t('Shared with linked positions and Schedule.')}</small></div></div>
                  <dl class="inspector-stats">
                    <div><dt>{t('Positions')}</dt><dd>{positionCountForArea(selectedAreaDraft.id)}</dd></div>
                  </dl>
                  {#if !compactViewport}
                    <p class="resize-note">{t('Drag to move. Pull any edge or corner to reshape; nearby areas align automatically.')}</p>
                  {/if}
                </div>
              {:else if mode === 'areas'}
                <div class="selection-hint is-above">
                  {@render floorNavigator()}
                  <p>{t(compactViewport
                    ? 'Select an area on the plan to edit its details.'
                    : 'Select an area on the plan to edit it. Pull any outside edge or corner to reshape this floor.')}</p>
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
                      <label><small>{t('Minimum')}</small><input class="cl-field" disabled={editorReadOnly} type="number" min="1" max="16" value={selectedTable.minimum_capacity} oninput={(event) => tableCapacityChanged(selectedTable, 'minimum', event.currentTarget.value)} /></label>
                      <span aria-hidden="true">–</span>
                      <label><small>{t('Maximum')}</small><input class="cl-field" disabled={editorReadOnly} type="number" min="1" max="16" value={selectedTable.maximum_capacity} oninput={(event) => tableCapacityChanged(selectedTable, 'maximum', event.currentTarget.value)} /></label>
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
                  <section class="joinable-sets">
                    <header>
                      <div>
                        <strong>{t('Joinable sets')}</strong>
                        <small>{t('Only these exact table sets can host one larger booking. Tables are never shared between parties.')}</small>
                      </div>
                      {#if !combinationEditor}
                        <button
                          class="join-add"
                          type="button"
                          disabled={editorReadOnly || selectedRoomTableOptions.length === 0}
                          aria-label={t('Add joinable set')}
                          title={t('Add joinable set')}
                          onclick={() => beginNewCombination(selectedTable)}
                        >+</button>
                      {/if}
                    </header>

                    {#if combinationEditor}
                      <div class="join-builder">
                        <div class="join-builder__heading">
                          <strong>{combinationEditor.isNew ? t('New table set') : t('Edit table set')}</strong>
                          <small>{t('Choose the tables staff may join for a single party.')}</small>
                        </div>
                        <div class="join-members">
                          <span class="join-member is-fixed">
                            <i aria-hidden="true"></i>
                            <span><strong>{t('Table {label}', { label: selectedTable.label })}</strong><small>{t('Selected table')}</small></span>
                          </span>
                          {#each selectedRoomTableOptions as table (table.id)}
                            <label class="join-member">
                              <input
                                type="checkbox"
                                disabled={editorReadOnly}
                                checked={combinationEditor.tableIds.includes(table.id)}
                                onchange={(event) =>
                                  toggleCombinationTable(
                                    table.id,
                                    event.currentTarget.checked
                                  )}
                              />
                              <span>
                                <strong>{t('Table {label}', { label: table.label })}</strong>
                                <small>{t('{count} seats', { count: table.maximum_capacity })}</small>
                              </span>
                            </label>
                          {/each}
                        </div>
                        {#if combinationEditorBounds}
                          <div class="join-capacity">
                            <span>{t('Booking size')}</span>
                            <div>
                              <label>
                                <small>{t('Minimum')}</small>
                                <input
                                  class="cl-field"
                                  type="number"
                                  min={combinationEditorBounds.minimum}
                                  max={combinationEditorBounds.maximum}
                                  value={combinationEditor.minimumCapacity}
                                  oninput={(event) =>
                                    combinationCapacityChanged(
                                      'minimum',
                                      event.currentTarget.value
                                    )}
                                />
                              </label>
                              <span aria-hidden="true">&ndash;</span>
                              <label>
                                <small>{t('Maximum')}</small>
                                <input
                                  class="cl-field"
                                  type="number"
                                  min={combinationEditor.minimumCapacity}
                                  max={combinationEditorBounds.maximum}
                                  value={combinationEditor.maximumCapacity}
                                  oninput={(event) =>
                                    combinationCapacityChanged(
                                      'maximum',
                                      event.currentTarget.value
                                    )}
                                />
                              </label>
                            </div>
                            <small>{t('Combined physical limit: {count} seats.', { count: combinationEditorBounds.maximum })}</small>
                          </div>
                        {:else}
                          <p class="join-prompt">{t('Select at least one more table from this area.')}</p>
                        {/if}
                        <div class="join-builder__actions">
                          <button class="cl-btn is-subtle" type="button" onclick={() => (combinationEditor = null)}>{t('Cancel')}</button>
                          <button class="cl-btn is-primary" type="button" disabled={!combinationEditorBounds} onclick={saveCombinationEditor}>{t('Save set')}</button>
                        </div>
                      </div>
                    {:else if selectedTableCombinations.length}
                      <div class="join-list">
                        {#each selectedTableCombinations as combination (combination.id)}
                          <article class="join-card">
                            <span class="join-card__mark" aria-hidden="true">
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6M7 7H5a3 3 0 0 0 0 6h2m10-6h2a3 3 0 0 1 0 6h-2" /></svg>
                            </span>
                            <span class="join-card__copy">
                              <strong>{combinationDisplayName(combination)}</strong>
                              <small>{t('{minimum}–{maximum} guests', { minimum: combination.minimum_capacity, maximum: combination.maximum_capacity })}</small>
                            </span>
                            <span class="join-card__actions">
                              <button type="button" disabled={editorReadOnly} aria-label={t('Edit table set')} title={t('Edit')} onclick={() => beginEditCombination(combination)}>
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m14 5 5 5M4 20l4-1 10-10-3-3L5 16z" /></svg>
                              </button>
                              <button type="button" disabled={editorReadOnly} aria-label={t('Remove table set')} title={t('Remove')} onclick={() => removeCombination(combination)}>
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14" /></svg>
                              </button>
                            </span>
                          </article>
                        {/each}
                      </div>
                    {:else}
                      <p class="join-empty">
                        {selectedRoomTableOptions.length
                          ? t('No joinable set uses this table yet.')
                          : t('Add another table in this area to create a joinable set.')}
                      </p>
                    {/if}
                  </section>
                  <label class="table-availability">
                    <input type="checkbox" disabled={editorReadOnly} bind:checked={selectedTable.blocked} onchange={touch} />
                    <span><strong>{t('Temporarily unavailable')}</strong><small>{t('Keep this table off the live seating plan.')}</small></span>
                  </label>
                  {#if !compactViewport}
                    <p class="resize-note">{t('Drag to move. Pull any edge or corner to resize; nearby tables align automatically.')}</p>
                  {/if}
                  {#if selectedTable.shape === 'rectangle'}
                    <button class="cl-btn" type="button" disabled={editorReadOnly} onclick={() => turnTable(selectedTable)}>{t('Turn table')}</button>
                  {/if}
                </div>
              {:else if selectedRoomDraft && selectedRoom && mode === 'tables'}
                <div class="selection-bar room-selection is-above">
                  <header class="inspector-head"><WorkspaceAreaIcon icon={areaIconFor(selectedRoom.work_area_id)} color={selectedRoom.area_color} size={20} /><div><strong>{selectedRoom.name}</strong><small>{t(selectedRoomReservable ? 'Reservable area' : 'Operational area')}</small></div></header>
                  {@render floorNavigator()}
                  <dl class="inspector-stats">
                    <div><dt>{t('Floor')}</dt><dd>{floorLabel(selectedFloor)}</dd></div>
                    <div><dt>{t('Tables')}</dt><dd>{floorTables.filter((table) => table.room_id === selectedRoom.id).length}</dd></div>
                  </dl>
                  <p class="resize-note">{t('Drag the area background to move it. Pull any edge or corner to reshape it; tables remain safely inside.')}</p>
                  {#if !selectedRoomReservable}
                    <div class="reservable-warning" role="status">
                      <strong>{t('Not reservable')}</strong>
                      <span>{t('This operational area stays on the floor plan but cannot hold reservation tables.')}</span>
                    </div>
                  {/if}
                  <button class="cl-btn" type="button" disabled={planGeometryReadOnly || !selectedRoomReservable} onclick={() => arrangeTables()}>{t('Arrange tables')}</button>
                  <button class="cl-btn is-primary" type="button" disabled={editorReadOnly || !selectedRoomReservable} onclick={addTable}>+ {t('Add table')}</button>
                </div>
              {:else if mode === 'tables'}
                <div class="selection-hint is-above">{@render floorNavigator()}<strong>{t('Choose an area')}</strong><p>{t('Select an area to add tables, or drag its background to adjust the layout.')}</p></div>
              {/if}

              {#if compactViewport}
                <div class="compact-notice" role="status">
                  <strong>{t('Layout fixed on small screens')}</strong>
                  <span>{t('Details remain editable. Use a tablet or desktop to move or resize the plan.')}</span>
                </div>
              {/if}

              <div class="area-canvas">
                <ReservationFloorPlan
                  tables={mode === 'areas' ? [] : floorTables}
                  rooms={floorRooms}
                  roomName={floorLabel(selectedFloor)}
                  floorWidth={selectedFloor.canvas_width}
                  floorHeight={selectedFloor.canvas_height}
                  editable={!planGeometryReadOnly}
                  showHeader={false}
                  floorEditable={mode === 'areas' && !planGeometryReadOnly}
                  roomsEditable={!planGeometryReadOnly}
                  tablesEditable={mode === 'tables' && !planGeometryReadOnly}
                  tablesSelectable
                  showTableCount={mode === 'tables'}
                  selectedRoomId={selectedTableId ? '' : selectedRoomId}
                  {selectedTableId}
                  invalidTableIds={overlappingTableIds}
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
  .layout-warning { color: var(--cl-problem); font-weight: var(--rst-fw-semibold); }
  .layout-warning i { width: 6px; height: 6px; display: inline-block; margin-right: 5px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 13%, transparent); }
  .floor-loading { display: grid; gap: 16px; padding: 24px; }
  .view-switch { display: inline-flex; align-items: center; padding: 2px; border: 1px solid var(--cl-line); border-radius: var(--cl-radius); background: var(--cl-surface-muted); }
  .view-switch button { min-height: 30px; padding: 5px 12px; border: 0; border-radius: calc(var(--cl-radius) - 2px); background: transparent; color: var(--cl-muted); font: inherit; font-size: 12px; font-weight: var(--rst-fw-medium); cursor: pointer; }
  .view-switch button.is-active { background: var(--cl-surface); color: var(--cl-ink); box-shadow: 0 1px 3px rgb(15 23 42 / 10%); }
  .area-directory { --cl-grid-max-height: calc(100dvh - 190px); }
  .area-directory .cl-table { min-width: 680px; }
  .area-row-name { min-width: 230px; display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: center; gap: 9px; }
  .area-row-name > strong { font-size: 12px; }
  .area-name-editor { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px; }
  .area-instance-locator { padding: 2px 5px; border: 1px solid var(--cl-line); border-radius: 4px; color: var(--cl-muted); background: var(--cl-surface-muted); font-size: 10px; font-weight: var(--rst-fw-semibold); white-space: nowrap; }
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
  .joinable-sets {
    display: grid;
    gap: 9px;
    padding: 11px;
    border: 1px solid var(--cl-line);
    border-radius: 7px;
    background: color-mix(in srgb, var(--cl-surface-muted) 72%, var(--cl-surface));
  }
  .joinable-sets > header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 8px;
  }
  .joinable-sets > header > div,
  .join-builder__heading {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .joinable-sets > header strong,
  .join-builder__heading strong {
    color: var(--cl-ink);
    font-size: 10.5px;
  }
  .joinable-sets > header small,
  .join-builder__heading small {
    color: var(--cl-muted);
    font-size: 9px;
    line-height: 1.4;
  }
  .join-add {
    width: 25px;
    height: 25px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--cl-accent) 35%, var(--cl-line));
    border-radius: 5px;
    background: var(--cl-surface);
    color: var(--cl-accent);
    font: inherit;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }
  .join-add:hover:not(:disabled) {
    border-color: var(--cl-accent);
    background: color-mix(in srgb, var(--cl-accent) 7%, var(--cl-surface));
  }
  .join-add:disabled { cursor: default; opacity: .38; }
  .join-empty,
  .join-prompt {
    margin: 0;
    padding: 8px;
    border: 1px dashed var(--cl-line);
    border-radius: 5px;
    color: var(--cl-muted);
    background: var(--cl-surface);
    font-size: 9.5px;
    line-height: 1.45;
  }
  .join-list,
  .join-builder,
  .join-members {
    display: grid;
    gap: 6px;
  }
  .join-card {
    display: grid;
    grid-template-columns: 25px minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    padding: 7px;
    border: 1px solid var(--cl-line);
    border-radius: 5px;
    background: var(--cl-surface);
  }
  .join-card__mark {
    width: 25px;
    height: 25px;
    display: grid;
    place-items: center;
    border-radius: 5px;
    background: color-mix(in srgb, var(--cl-accent) 9%, var(--cl-surface));
    color: var(--cl-accent);
  }
  .join-card__copy {
    min-width: 0;
    display: grid;
    gap: 1px;
  }
  .join-card__copy strong {
    overflow: hidden;
    color: var(--cl-ink);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .join-card__copy small {
    color: var(--cl-muted);
    font-size: 8.5px;
  }
  .join-card__actions { display: flex; gap: 2px; }
  .join-card__actions button {
    width: 25px;
    height: 25px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--cl-muted);
    cursor: pointer;
  }
  .join-card__actions button:hover:not(:disabled) {
    background: var(--cl-surface-muted);
    color: var(--cl-accent);
  }
  .join-card__actions button:last-child:hover:not(:disabled) {
    color: var(--cl-problem);
  }
  .join-card__actions button:disabled { cursor: default; opacity: .4; }
  .join-builder {
    padding-top: 9px;
    border-top: 1px solid var(--cl-line);
  }
  .join-member {
    min-width: 0;
    grid-template-columns: auto minmax(0, 1fr) !important;
    align-items: center;
    gap: 8px !important;
    padding: 7px 8px;
    border: 1px solid var(--cl-line);
    border-radius: 5px;
    background: var(--cl-surface);
    cursor: pointer;
  }
  .join-member > input {
    width: 14px !important;
    height: 14px;
    margin: 0;
    accent-color: var(--cl-accent);
  }
  .join-member > i {
    width: 14px;
    height: 14px;
    display: block;
    border: 4px solid color-mix(in srgb, var(--cl-accent) 14%, var(--cl-surface));
    border-radius: 50%;
    background: var(--cl-accent);
  }
  .join-member > span {
    min-width: 0;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    color: var(--cl-ink) !important;
  }
  .join-member strong { font-size: 9.5px; }
  .join-member small {
    color: var(--cl-muted);
    font-size: 8.5px;
    font-weight: var(--rst-fw-regular);
    white-space: nowrap;
  }
  .join-member.is-fixed {
    cursor: default;
    border-color: color-mix(in srgb, var(--cl-accent) 30%, var(--cl-line));
    background: color-mix(in srgb, var(--cl-accent) 5%, var(--cl-surface));
  }
  .join-capacity { display: grid; gap: 5px; }
  .join-capacity > span {
    color: var(--cl-muted);
    font-size: 9.5px;
    font-weight: var(--rst-fw-bold);
  }
  .join-capacity > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: end;
    gap: 7px;
  }
  .join-capacity > div > span {
    padding-bottom: 8px;
    color: var(--cl-muted);
    font-size: 10px;
  }
  .join-capacity label { gap: 3px; }
  .join-capacity label small,
  .join-capacity > small {
    color: var(--cl-muted);
    font-size: 8.5px;
  }
  .join-builder__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
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
  .reservable-warning { display: grid; gap: 3px; padding: 10px; border: 1px solid var(--cl-attention-line); border-radius: 6px; background: var(--cl-attention-wash); }
  .reservable-warning strong { color: var(--cl-attention); font-size: 10.5px; }
  .reservable-warning span { color: var(--cl-muted); font-size: 9.5px; line-height: 1.4; }
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
