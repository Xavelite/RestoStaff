<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import WorkspaceAreaIcon from '$lib/restaurant/WorkspaceAreaIcon.svelte';
  import type {
    Reservation,
    ReservationRoom,
    ReservationTable
  } from './reservation-types';

  type FloorTable = Omit<ReservationTable, 'restaurant_id'>;
  type TableState = 'available' | 'reserved' | 'occupied' | 'blocked';
  type ResizeEdge =
    | 'top'
    | 'right'
    | 'bottom'
    | 'left'
    | 'top-left'
    | 'top-right'
    | 'bottom-right'
    | 'bottom-left';
  type SnapTarget = { value: number; guide: number };

  const resizeEdges: ResizeEdge[] = [
    'top',
    'right',
    'bottom',
    'left',
    'top-left',
    'top-right',
    'bottom-right',
    'bottom-left'
  ];
  const ROOM_GRID = 20;
  const TABLE_GRID = 10;
  const ROOM_GAP = 20;
  const SNAP_DISTANCE = 12;

  let {
    tables,
    rooms = [],
    reservations = [],
    roomName,
    roomColor = 'var(--cl-info)',
    floorWidth = 1000,
    floorHeight = 600,
    editable = false,
    showHeader = true,
    floorEditable = false,
    roomsEditable = editable,
    tablesEditable = editable,
    tablesSelectable = true,
    showTableCount = true,
    selectedTableId = '',
    selectedRoomId = '',
    emptyMessage = 'Add a table to start this floor plan.',
    onselect = () => {},
    onmove = () => {},
    onroomselect = () => {},
    onroommove = () => {},
    onroomresize = () => {},
    onfloorresize = () => {}
  }: {
    tables: FloorTable[];
    rooms?: ReservationRoom[];
    reservations?: Reservation[];
    roomName: string;
    roomColor?: string;
    floorWidth?: number;
    floorHeight?: number;
    editable?: boolean;
    showHeader?: boolean;
    floorEditable?: boolean;
    roomsEditable?: boolean;
    tablesEditable?: boolean;
    tablesSelectable?: boolean;
    showTableCount?: boolean;
    selectedTableId?: string;
    selectedRoomId?: string;
    emptyMessage?: string;
    onselect?: (table: FloorTable, reservation: Reservation | null) => void;
    onmove?: (table: FloorTable, positionX: number, positionY: number) => void;
    onroomselect?: (room: ReservationRoom) => void;
    onroommove?: (room: ReservationRoom, positionX: number, positionY: number) => void;
    onroomresize?: (
      room: ReservationRoom,
      positionX: number,
      positionY: number,
      width: number,
      height: number
    ) => void;
    onfloorresize?: (
      width: number,
      height: number,
      originDeltaX: number,
      originDeltaY: number
    ) => void;
  } = $props();

  let dragging = $state<{
    kind: 'table' | 'room' | 'room-resize' | 'floor-resize';
    id: string;
    offsetX: number;
    offsetY: number;
    pointerId: number;
    edge?: ResizeEdge;
    startClientX?: number;
    startClientY?: number;
    startX?: number;
    startY?: number;
    startWidth?: number;
    startHeight?: number;
    stageWidth?: number;
    stageHeight?: number;
    moved?: boolean;
  } | null>(null);
  let guideX = $state<number | null>(null);
  let guideY = $state<number | null>(null);

  const activeReservations = $derived(
    reservations.filter((reservation) =>
      !['cancelled', 'no_show', 'finished'].includes(reservation.status)
    )
  );

  function reservationFor(tableId: string): Reservation | null {
    return activeReservations.find((reservation) =>
      reservation.table_ids.includes(tableId)
    ) ?? null;
  }

  function tableState(table: FloorTable): TableState {
    if (table.blocked) return 'blocked';
    const reservation = reservationFor(table.id);
    if (!reservation) return 'available';
    return ['arrived', 'waiting', 'seated'].includes(reservation.status)
      ? 'occupied'
      : 'reserved';
  }

  function tableStyle(table: FloorTable): string {
    const x = Math.max(0, Math.min(floorWidth - Number(table.width), Number(table.position_x)));
    const y = Math.max(0, Math.min(floorHeight - Number(table.height), Number(table.position_y)));
    return [
      `--x:${(x / floorWidth) * 100}%`,
      `--y:${(y / floorHeight) * 100}%`,
      `--w:${(Math.max(64, Number(table.width)) / floorWidth) * 100}%`,
      `--h:${(Math.max(52, Number(table.height)) / floorHeight) * 100}%`,
      `--rotation:${Number(table.rotation_degrees)}deg`,
      `--room-color:${roomColor}`
    ].join(';');
  }

  function roomStyle(room: ReservationRoom): string {
    return [
      `--x:${(Number(room.position_x) / floorWidth) * 100}%`,
      `--y:${(Number(room.position_y) / floorHeight) * 100}%`,
      `--w:${(Number(room.width) / floorWidth) * 100}%`,
      `--h:${(Number(room.height) / floorHeight) * 100}%`,
      `--room-color:${room.area_color || 'var(--cl-info)'}`
    ].join(';');
  }

  function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function edgeIncludes(edge: ResizeEdge, side: 'top' | 'right' | 'bottom' | 'left'): boolean {
    return edge === side || edge.includes(side);
  }

  function snap(value: number, targets: SnapTarget[], grid: number): { value: number; guide: number | null } {
    let closest: SnapTarget | null = null;
    let distance = SNAP_DISTANCE + 1;
    for (const target of targets) {
      const nextDistance = Math.abs(value - target.value);
      if (nextDistance <= SNAP_DISTANCE && nextDistance < distance) {
        closest = target;
        distance = nextDistance;
      }
    }
    return closest
      ? { value: closest.value, guide: closest.guide }
      : { value: Math.round(value / grid) * grid, guide: null };
  }

  function roomMoveGeometry(room: ReservationRoom, rawX: number, rawY: number) {
    const width = Number(room.width);
    const height = Number(room.height);
    const xTargets: SnapTarget[] = [
      { value: 0, guide: 0 },
      { value: floorWidth - width, guide: floorWidth }
    ];
    const yTargets: SnapTarget[] = [
      { value: 0, guide: 0 },
      { value: floorHeight - height, guide: floorHeight }
    ];
    for (const other of rooms) {
      if (other.id === room.id || other.floor_id !== room.floor_id) continue;
      const left = Number(other.position_x);
      const top = Number(other.position_y);
      const right = left + Number(other.width);
      const bottom = top + Number(other.height);
      xTargets.push(
        { value: left, guide: left },
        { value: right - width, guide: right },
        { value: right + ROOM_GAP, guide: right + ROOM_GAP },
        { value: left - width - ROOM_GAP, guide: left - ROOM_GAP }
      );
      yTargets.push(
        { value: top, guide: top },
        { value: bottom - height, guide: bottom },
        { value: bottom + ROOM_GAP, guide: bottom + ROOM_GAP },
        { value: top - height - ROOM_GAP, guide: top - ROOM_GAP }
      );
    }
    const snappedX = snap(clamp(rawX, 0, floorWidth - width), xTargets, ROOM_GRID);
    const snappedY = snap(clamp(rawY, 0, floorHeight - height), yTargets, ROOM_GRID);
    guideX = snappedX.guide;
    guideY = snappedY.guide;
    return {
      x: clamp(snappedX.value, 0, floorWidth - width),
      y: clamp(snappedY.value, 0, floorHeight - height)
    };
  }

  function roomResizeGeometry(room: ReservationRoom, edge: ResizeEdge, dx: number, dy: number) {
    const startX = Number(dragging?.startX);
    const startY = Number(dragging?.startY);
    const startWidth = Number(dragging?.startWidth);
    const startHeight = Number(dragging?.startHeight);
    const fixedRight = startX + startWidth;
    const fixedBottom = startY + startHeight;
    const xTargets: SnapTarget[] = [
      { value: 0, guide: 0 },
      { value: floorWidth, guide: floorWidth }
    ];
    const yTargets: SnapTarget[] = [
      { value: 0, guide: 0 },
      { value: floorHeight, guide: floorHeight }
    ];
    for (const other of rooms) {
      if (other.id === room.id || other.floor_id !== room.floor_id) continue;
      const left = Number(other.position_x);
      const top = Number(other.position_y);
      const right = left + Number(other.width);
      const bottom = top + Number(other.height);
      xTargets.push(
        { value: left, guide: left },
        { value: right, guide: right },
        { value: left - ROOM_GAP, guide: left - ROOM_GAP },
        { value: right + ROOM_GAP, guide: right + ROOM_GAP }
      );
      yTargets.push(
        { value: top, guide: top },
        { value: bottom, guide: bottom },
        { value: top - ROOM_GAP, guide: top - ROOM_GAP },
        { value: bottom + ROOM_GAP, guide: bottom + ROOM_GAP }
      );
    }

    let left = startX;
    let right = fixedRight;
    let top = startY;
    let bottom = fixedBottom;
    guideX = null;
    guideY = null;

    if (edgeIncludes(edge, 'left')) {
      const result = snap(clamp(startX + dx, 0, fixedRight - 160), xTargets, ROOM_GRID);
      left = clamp(result.value, 0, fixedRight - 160);
      guideX = result.guide;
    } else if (edgeIncludes(edge, 'right')) {
      const result = snap(clamp(fixedRight + dx, startX + 160, floorWidth), xTargets, ROOM_GRID);
      right = clamp(result.value, startX + 160, floorWidth);
      guideX = result.guide;
    }

    if (edgeIncludes(edge, 'top')) {
      const result = snap(clamp(startY + dy, 0, fixedBottom - 120), yTargets, ROOM_GRID);
      top = clamp(result.value, 0, fixedBottom - 120);
      guideY = result.guide;
    } else if (edgeIncludes(edge, 'bottom')) {
      const result = snap(clamp(fixedBottom + dy, startY + 120, floorHeight), yTargets, ROOM_GRID);
      bottom = clamp(result.value, startY + 120, floorHeight);
      guideY = result.guide;
    }

    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function startDrag(event: PointerEvent, table: FloorTable) {
    if (!tablesSelectable) return;
    onselect(table, reservationFor(table.id));
    if (!tablesEditable || table.blocked) return;
    const stage = event.currentTarget instanceof HTMLElement
      ? event.currentTarget.parentElement
      : null;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    dragging = {
      kind: 'table',
      id: table.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX: ((event.clientX - rect.left) / rect.width) * floorWidth - Number(table.position_x),
      offsetY: ((event.clientY - rect.top) / rect.height) * floorHeight - Number(table.position_y)
    };
    guideX = null;
    guideY = null;
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function startRoomDrag(event: PointerEvent, room: ReservationRoom) {
    onroomselect(room);
    if (!roomsEditable) return;
    const stage = event.currentTarget instanceof HTMLElement
      ? event.currentTarget.parentElement
      : null;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    dragging = {
      kind: 'room',
      id: room.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX: ((event.clientX - rect.left) / rect.width) * floorWidth - Number(room.position_x),
      offsetY: ((event.clientY - rect.top) / rect.height) * floorHeight - Number(room.position_y)
    };
    guideX = null;
    guideY = null;
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function startRoomResize(
    event: PointerEvent,
    room: ReservationRoom,
    edge: ResizeEdge
  ) {
    onroomselect(room);
    if (!roomsEditable) return;
    const stage = event.currentTarget instanceof HTMLElement
      ? event.currentTarget.closest<HTMLElement>('.floor__stage')
      : null;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    dragging = {
      kind: 'room-resize',
      id: room.id,
      pointerId: event.pointerId,
      edge,
      offsetX: 0,
      offsetY: 0,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: Number(room.position_x),
      startY: Number(room.position_y),
      startWidth: Number(room.width),
      startHeight: Number(room.height),
      stageWidth: rect.width,
      stageHeight: rect.height
    };
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function startFloorResize(event: PointerEvent, edge: ResizeEdge) {
    if (!floorEditable) return;
    const stage = event.currentTarget instanceof HTMLElement
      ? event.currentTarget.closest<HTMLElement>('.floor__stage')
      : null;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    dragging = {
      kind: 'floor-resize',
      id: 'floor',
      pointerId: event.pointerId,
      edge,
      offsetX: 0,
      offsetY: 0,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: 0,
      startY: 0,
      startWidth: floorWidth,
      startHeight: floorHeight,
      stageWidth: rect.width,
      stageHeight: rect.height
    };
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function moveDrag(event: PointerEvent) {
    if (!dragging) return;
    const stage = event.currentTarget;
    if (!(stage instanceof HTMLElement)) return;
    const rect = stage.getBoundingClientRect();
    if (!dragging.moved) {
      const clientDistance = Math.hypot(
        event.clientX - Number(dragging.startClientX),
        event.clientY - Number(dragging.startClientY)
      );
      if (clientDistance < 3) return;
      dragging.moved = true;
    }
    if (dragging.kind === 'room-resize') {
      const room = rooms.find((item) => item.id === dragging?.id);
      if (!room) return;
      const dx =
        ((event.clientX - Number(dragging.startClientX)) /
          Math.max(1, Number(dragging.stageWidth))) *
        floorWidth;
      const dy =
        ((event.clientY - Number(dragging.startClientY)) /
          Math.max(1, Number(dragging.stageHeight))) *
        floorHeight;
      const geometry = roomResizeGeometry(room, dragging.edge ?? 'bottom-right', dx, dy);
      onroomresize(
        room,
        Math.round(geometry.x),
        Math.round(geometry.y),
        Math.round(geometry.width),
        Math.round(geometry.height)
      );
      return;
    }
    if (dragging.kind === 'floor-resize') {
      const dx =
        ((event.clientX - Number(dragging.startClientX)) /
          Math.max(1, Number(dragging.stageWidth))) *
        Number(dragging.startWidth);
      const dy =
        ((event.clientY - Number(dragging.startClientY)) /
          Math.max(1, Number(dragging.stageHeight))) *
        Number(dragging.startHeight);
      const edge = dragging.edge ?? 'bottom-right';
      const horizontalDelta = edgeIncludes(edge, 'left') ? dx : 0;
      const verticalDelta = edgeIncludes(edge, 'top') ? dy : 0;
      const width = edgeIncludes(edge, 'left')
        ? Number(dragging.startWidth) - dx
        : edgeIncludes(edge, 'right')
          ? Number(dragging.startWidth) + dx
          : Number(dragging.startWidth);
      const height = edgeIncludes(edge, 'top')
        ? Number(dragging.startHeight) - dy
        : edgeIncludes(edge, 'bottom')
          ? Number(dragging.startHeight) + dy
          : Number(dragging.startHeight);
      onfloorresize(
        Math.round(width / ROOM_GRID) * ROOM_GRID,
        Math.round(height / ROOM_GRID) * ROOM_GRID,
        Math.round(horizontalDelta / ROOM_GRID) * ROOM_GRID,
        Math.round(verticalDelta / ROOM_GRID) * ROOM_GRID
      );
      return;
    }
    if (dragging.kind === 'room') {
      const room = rooms.find((item) => item.id === dragging?.id);
      if (!room) return;
      const geometry = roomMoveGeometry(
        room,
        ((event.clientX - rect.left) / rect.width) * floorWidth - dragging.offsetX,
        ((event.clientY - rect.top) / rect.height) * floorHeight - dragging.offsetY
      );
      onroommove(room, Math.round(geometry.x), Math.round(geometry.y));
      return;
    }
    const table = tables.find((item) => item.id === dragging?.id);
    if (!table) return;
    const x = Math.max(
      0,
      Math.min(
        floorWidth - Number(table.width),
        ((event.clientX - rect.left) / rect.width) * floorWidth - dragging.offsetX
      )
    );
    const y = Math.max(
      0,
      Math.min(
        floorHeight - Number(table.height),
        ((event.clientY - rect.top) / rect.height) * floorHeight - dragging.offsetY
      )
    );
    onmove(
      table,
      Math.round(x / TABLE_GRID) * TABLE_GRID,
      Math.round(y / TABLE_GRID) * TABLE_GRID
    );
  }

  function endDrag(event: PointerEvent) {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    dragging = null;
    guideX = null;
    guideY = null;
  }

  function guestTime(reservation: Reservation | null): string {
    if (!reservation) return '';
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(new Date(reservation.starts_at));
  }
</script>

<section class="floor" aria-label={t('{name} floor plan', { name: roomName })}>
  {#if showHeader}
    <div class="floor__toolbar">
      <div>
        <strong>{roomName}</strong>
        <span>{roomsEditable ? t('Drag areas; pull an edge or corner to resize.') : tablesEditable ? t('Drag tables into place.') : t('Live table availability')}</span>
      </div>
    </div>
  {/if}

  <div class="floor__viewport">
    <div
      class="floor__stage"
      class:is-editable={editable}
      class:is-floor-editable={floorEditable}
      style={`--floor-aspect:${floorWidth / floorHeight}`}
      role="group"
      aria-label={t('{name} floor plan', { name: roomName })}
      onpointermove={moveDrag}
      onpointerup={endDrag}
      onpointercancel={endDrag}
    >
      <span class="floor__room-label">{roomName}</span>
      {#each rooms as room (room.id)}
        <button
          class="floor-zone"
          class:is-selected={room.id === selectedRoomId}
          class:is-dragging={dragging?.kind === 'room' && dragging.id === room.id}
          type="button"
          style={roomStyle(room)}
          onpointerdown={(event) => startRoomDrag(event, room)}
          onclick={() => onroomselect(room)}
        >
          <span class="zone-identity">
            <WorkspaceAreaIcon icon={room.area_icon} color={room.area_color} size={13} />
            <span class="zone-name">{room.name}</span>
          </span>
          {#if showTableCount}<small>{tables.filter((table) => table.room_id === room.id).length} {t('tables')}</small>{/if}
          {#if roomsEditable && room.id === selectedRoomId}
            {#each resizeEdges as edge}
              <i class="resize-handle is-{edge}" aria-hidden="true" onpointerdown={(event) => startRoomResize(event, room, edge)}></i>
            {/each}
          {/if}
        </button>
      {/each}
      {#if guideX !== null}
        <i class="snap-guide is-vertical" aria-hidden="true" style={`--guide:${(guideX / floorWidth) * 100}%`}></i>
      {/if}
      {#if guideY !== null}
        <i class="snap-guide is-horizontal" aria-hidden="true" style={`--guide:${(guideY / floorHeight) * 100}%`}></i>
      {/if}
      {#if !tables.length && !rooms.length}
        <div class="floor__empty">
          <span aria-hidden="true">＋</span>
          <strong>{t('Empty floor plan')}</strong>
          <small>{t(emptyMessage)}</small>
        </div>
      {:else}
        {#each tables as table (table.id)}
          {@const reservation = reservationFor(table.id)}
          {@const state = tableState(table)}
          <button
            class="floor-table is-{state} is-{table.shape}"
            class:is-small-party={table.maximum_capacity <= 2}
            class:is-selected={selectedTableId === table.id}
            class:is-dragging={dragging?.id === table.id}
            class:is-passive={!tablesSelectable}
            type="button"
            tabindex={tablesSelectable ? 0 : -1}
            aria-hidden={!tablesSelectable}
            style={tableStyle(table)}
            aria-label={reservation
              ? t('Table {label}, {guest}', { label: table.label, guest: reservation.guest.display_name })
              : t('Table {label}, {state}', { label: table.label, state: t(state) })}
            onpointerdown={(event) => startDrag(event, table)}
            onclick={() => onselect(table, reservation)}
          >
            <i class="chair is-top" aria-hidden="true"></i>
            <i class="chair is-right" aria-hidden="true"></i>
            <i class="chair is-bottom" aria-hidden="true"></i>
            <i class="chair is-left" aria-hidden="true"></i>
            <strong>{table.label}</strong>
            <small>{table.minimum_capacity}–{table.maximum_capacity}</small>
            {#if reservation}
              <em>{guestTime(reservation)}</em>
            {/if}
          </button>
        {/each}
      {/if}
      {#if floorEditable}
        {#each resizeEdges as edge}
          <i class="floor-resize is-{edge}" aria-hidden="true" onpointerdown={(event) => startFloorResize(event, edge)}></i>
        {/each}
      {/if}
    </div>
  </div>

  {#if !editable}
    <div class="floor__legend" aria-label={t('Table status legend')}>
      <span><i class="is-available"></i>{t('Available')}</span>
      <span><i class="is-reserved"></i>{t('Reserved')}</span>
      <span><i class="is-occupied"></i>{t('Occupied')}</span>
      <span><i class="is-blocked"></i>{t('Blocked')}</span>
    </div>
  {/if}
</section>

<style>
  .floor {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface);
  }
  .floor__toolbar {
    min-height: 49px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 10px 8px 13px;
    border-bottom: 1px solid var(--cl-line);
  }
  .floor__toolbar > div:first-child { min-width: 0; display: grid; gap: 1px; }
  .floor__toolbar strong { overflow: hidden; font-size: 12.5px; text-overflow: ellipsis; white-space: nowrap; }
  .floor__toolbar span { color: var(--cl-muted); font-size: 10.5px; }
  .floor__viewport { overflow: hidden; padding: 18px; background: color-mix(in srgb, var(--cl-bg) 86%, var(--cl-surface)); }
  .floor__stage {
    width: 100%;
    aspect-ratio: var(--floor-aspect);
    position: relative;
    overflow: visible;
    border: 1px solid color-mix(in srgb, var(--cl-ink) 22%, var(--cl-line));
    border-radius: 6px;
    background-color: #fffdfa;
    background-image:
      linear-gradient(color-mix(in srgb, var(--cl-line-strong) 34%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in srgb, var(--cl-line-strong) 34%, transparent) 1px, transparent 1px),
      linear-gradient(color-mix(in srgb, var(--cl-line-strong) 40%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in srgb, var(--cl-line-strong) 40%, transparent) 1px, transparent 1px);
    background-size: 2% 3.333%, 2% 3.333%, 10% 16.667%, 10% 16.667%;
    box-shadow: 0 5px 18px rgb(24 28 34 / 7%);
    touch-action: none;
  }
  .floor__stage.is-floor-editable { box-shadow: 0 0 0 4px color-mix(in srgb, var(--cl-accent) 5%, transparent), 0 5px 18px rgb(24 28 34 / 7%); }
  .floor__stage::after {
    content: '';
    position: absolute;
    inset: 8px;
    pointer-events: none;
    border: 1px dashed color-mix(in srgb, var(--cl-accent) 18%, var(--cl-line));
    border-radius: 3px;
  }
  .floor__room-label {
    position: absolute;
    right: 16px;
    bottom: 12px;
    z-index: 1;
    color: color-mix(in srgb, var(--room-color) 62%, var(--cl-muted));
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .floor-zone {
    width: var(--w);
    height: var(--h);
    position: absolute;
    left: var(--x);
    top: var(--y);
    z-index: 1;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 11px;
    overflow: visible;
    border: 1.5px solid color-mix(in srgb, var(--room-color) 72%, var(--cl-line));
    border-radius: 5px;
    background: color-mix(in srgb, var(--room-color) 11%, var(--cl-surface));
    color: color-mix(in srgb, var(--room-color) 84%, var(--cl-ink));
    font: inherit;
    text-align: left;
    cursor: pointer;
    touch-action: none;
  }
  .is-editable .floor-zone { cursor: grab; }
  .resize-handle, .floor-resize {
    position: absolute;
    z-index: 8;
    display: block;
    padding: 0;
    border: 0;
    background: transparent;
    touch-action: none;
  }
  .resize-handle.is-top, .resize-handle.is-bottom { height: 14px; right: 18px; left: 18px; cursor: ns-resize; }
  .resize-handle.is-top { top: -7px; }
  .resize-handle.is-bottom { bottom: -7px; }
  .resize-handle.is-right, .resize-handle.is-left { width: 14px; top: 18px; bottom: 18px; cursor: ew-resize; }
  .resize-handle.is-right { right: -7px; }
  .resize-handle.is-left { left: -7px; }
  .resize-handle.is-top::after, .resize-handle.is-bottom::after,
  .resize-handle.is-right::after, .resize-handle.is-left::after {
    content: '';
    position: absolute;
    border-radius: 999px;
    background: color-mix(in srgb, var(--room-color) 78%, var(--cl-ink));
    box-shadow: 0 0 0 2px var(--cl-surface);
    opacity: .78;
  }
  .resize-handle.is-top::after, .resize-handle.is-bottom::after { width: 34px; height: 3px; left: 50%; top: 50%; transform: translate(-50%, -50%); }
  .resize-handle.is-right::after, .resize-handle.is-left::after { width: 3px; height: 34px; left: 50%; top: 50%; transform: translate(-50%, -50%); }
  .resize-handle.is-top-left, .resize-handle.is-top-right,
  .resize-handle.is-bottom-right, .resize-handle.is-bottom-left {
    width: 18px;
    height: 18px;
    border: 2px solid var(--cl-surface);
    border-radius: 4px;
    background: var(--room-color);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--room-color) 78%, var(--cl-line-strong));
  }
  .resize-handle.is-top-left { top: -9px; left: -9px; cursor: nwse-resize; }
  .resize-handle.is-top-right { top: -9px; right: -9px; cursor: nesw-resize; }
  .resize-handle.is-bottom-right { right: -9px; bottom: -9px; cursor: nwse-resize; }
  .resize-handle.is-bottom-left { bottom: -9px; left: -9px; cursor: nesw-resize; }
  .floor-resize.is-top, .floor-resize.is-bottom { height: 16px; right: 24px; left: 24px; cursor: ns-resize; }
  .floor-resize.is-top { top: -9px; }
  .floor-resize.is-bottom { bottom: -9px; }
  .floor-resize.is-right, .floor-resize.is-left { width: 16px; top: 24px; bottom: 24px; cursor: ew-resize; }
  .floor-resize.is-right { right: -9px; }
  .floor-resize.is-left { left: -9px; }
  .floor-resize.is-top::after, .floor-resize.is-bottom::after,
  .floor-resize.is-right::after, .floor-resize.is-left::after {
    content: '';
    position: absolute;
    border-radius: 999px;
    background: var(--cl-accent);
    opacity: .45;
  }
  .floor-resize.is-top::after, .floor-resize.is-bottom::after { width: 42px; height: 3px; left: 50%; top: 50%; transform: translate(-50%, -50%); }
  .floor-resize.is-right::after, .floor-resize.is-left::after { width: 3px; height: 42px; left: 50%; top: 50%; transform: translate(-50%, -50%); }
  .floor-resize.is-top-left, .floor-resize.is-top-right,
  .floor-resize.is-bottom-right, .floor-resize.is-bottom-left {
    width: 17px;
    height: 17px;
    border: 2px solid var(--cl-surface);
    border-radius: 4px;
    background: var(--cl-accent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--cl-accent) 72%, var(--cl-line-strong));
  }
  .floor-resize.is-top-left { top: -9px; left: -9px; cursor: nwse-resize; }
  .floor-resize.is-top-right { top: -9px; right: -9px; cursor: nesw-resize; }
  .floor-resize.is-bottom-right { right: -9px; bottom: -9px; cursor: nwse-resize; }
  .floor-resize.is-bottom-left { bottom: -9px; left: -9px; cursor: nesw-resize; }
  .resize-handle:hover::after, .floor-resize:hover::after { opacity: 1; }
  .snap-guide {
    position: absolute;
    z-index: 7;
    pointer-events: none;
    background: var(--cl-accent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--cl-accent) 18%, transparent);
    opacity: .72;
  }
  .snap-guide.is-vertical { width: 1px; top: 0; bottom: 0; left: var(--guide); }
  .snap-guide.is-horizontal { height: 1px; right: 0; left: 0; top: var(--guide); }
  .floor-zone.is-dragging { z-index: 4; cursor: grabbing; box-shadow: 0 8px 18px rgb(28 35 44 / 12%); }
  .floor-zone.is-selected { z-index: 2; border-style: solid; outline: 4px solid color-mix(in srgb, var(--room-color) 16%, transparent); outline-offset: 2px; box-shadow: 0 6px 18px color-mix(in srgb, var(--room-color) 18%, transparent); }
  .zone-identity {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .floor-zone :global(.zone-identity .area-icon) {
    width: 25px;
    height: 25px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--room-color) 8%, var(--cl-surface));
  }
  .floor-zone .zone-name {
    overflow: hidden;
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: .04em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .floor-zone small { flex: 0 0 auto; font-size: 9px; opacity: .7; }
  .floor__empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 3px;
    color: var(--cl-muted);
    text-align: center;
  }
  .floor__empty > span {
    width: 31px;
    height: 31px;
    display: grid;
    place-items: center;
    margin-bottom: 4px;
    border: 1px dashed var(--cl-line-strong);
    border-radius: 50%;
    font-size: 18px;
  }
  .floor__empty strong { font-size: 12px; }
  .floor__empty small { font-size: 10.5px; }
  .floor-table {
    width: var(--w);
    height: var(--h);
    min-width: 46px;
    min-height: 42px;
    position: absolute;
    left: var(--x);
    top: var(--y);
    z-index: 3;
    display: grid;
    place-content: center;
    align-content: center;
    gap: 1px;
    padding: 5px;
    transform: rotate(var(--rotation));
    border: 2px solid var(--cl-ok);
    border-radius: 6px;
    background: color-mix(in srgb, var(--cl-ok) 13%, white);
    color: color-mix(in srgb, var(--cl-ok) 72%, #1d242e);
    box-shadow: 0 2px 5px rgb(28 35 44 / 8%);
    font: inherit;
    text-align: center;
    cursor: pointer;
    user-select: none;
  }
  .chair {
    width: 14px;
    height: 6px;
    position: absolute;
    display: block;
    border: 1px solid currentColor;
    border-radius: 2px 2px 4px 4px;
    background: #fff;
    opacity: .65;
    pointer-events: none;
  }
  .chair.is-top { left: 50%; top: -9px; transform: translateX(-50%) rotate(180deg); }
  .chair.is-bottom { left: 50%; bottom: -9px; transform: translateX(-50%); }
  .chair.is-left { width: 6px; height: 14px; left: -9px; top: 50%; transform: translateY(-50%) rotate(180deg); }
  .chair.is-right { width: 6px; height: 14px; right: -9px; top: 50%; transform: translateY(-50%); }
  .floor-table.is-small-party .chair.is-top,
  .floor-table.is-small-party .chair.is-bottom { display: none; }
  .is-editable .floor-table { cursor: grab; }
  .floor-table.is-dragging { z-index: 4; cursor: grabbing; box-shadow: 0 8px 18px rgb(28 35 44 / 18%); }
  .floor-table.is-passive { pointer-events: none; opacity: .46; }
  .floor-table.is-round { border-radius: 999px; }
  .floor-table.is-rectangle { border-radius: 4px; }
  .floor-table.is-selected { outline: 3px solid color-mix(in srgb, var(--cl-accent) 28%, transparent); outline-offset: 2px; }
  .floor-table.is-reserved { border-color: var(--cl-info); background: color-mix(in srgb, var(--cl-info) 13%, white); color: color-mix(in srgb, var(--cl-info) 76%, #1d242e); }
  .floor-table.is-occupied { border-color: var(--cl-attention); background: color-mix(in srgb, var(--cl-attention) 15%, white); color: color-mix(in srgb, var(--cl-attention) 78%, #1d242e); }
  .floor-table.is-blocked { border-color: var(--cl-line-strong); background: #e8e9e8; color: var(--cl-muted); box-shadow: none; }
  .floor-table strong { overflow: hidden; font-size: 13px; line-height: 1; text-overflow: ellipsis; white-space: nowrap; }
  .floor-table small { font-size: 9px; font-weight: var(--rst-fw-medium); opacity: .8; }
  .floor-table em { max-width: 100%; overflow: hidden; font-size: 8px; font-style: normal; font-weight: var(--rst-fw-bold); text-overflow: ellipsis; white-space: nowrap; }
  .floor__legend {
    min-height: 35px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
    padding: 7px 12px;
    border-top: 1px solid var(--cl-line);
    color: var(--cl-muted);
    font-size: 10px;
  }
  .floor__legend span { display: inline-flex; align-items: center; gap: 5px; }
  .floor__legend i { width: 8px; height: 8px; border: 2px solid var(--cl-ok); border-radius: 2px; background: color-mix(in srgb, var(--cl-ok) 13%, white); }
  .floor__legend i.is-reserved { border-color: var(--cl-info); background: color-mix(in srgb, var(--cl-info) 13%, white); }
  .floor__legend i.is-occupied { border-color: var(--cl-attention); background: color-mix(in srgb, var(--cl-attention) 15%, white); }
  .floor__legend i.is-blocked { border-color: var(--cl-line-strong); background: #e8e9e8; }
  @media (max-width: 760px) {
    .floor__viewport { padding: 7px; }
    .floor__stage { min-width: 500px; }
  }
</style>
