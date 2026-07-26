<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import type {
    Reservation,
    ReservationRoom,
    ReservationTable
  } from './reservation-types';

  type FloorTable = Omit<ReservationTable, 'restaurant_id'>;
  type TableState = 'available' | 'reserved' | 'occupied' | 'blocked';

  let {
    tables,
    rooms = [],
    reservations = [],
    roomName,
    roomColor = 'var(--cl-info)',
    floorWidth = 1000,
    floorHeight = 600,
    editable = false,
    selectedTableId = '',
    selectedRoomId = '',
    emptyMessage = 'Add a table to start this floor plan.',
    onselect = () => {},
    onmove = () => {},
    onroomselect = () => {},
    onroommove = () => {}
  }: {
    tables: FloorTable[];
    rooms?: ReservationRoom[];
    reservations?: Reservation[];
    roomName: string;
    roomColor?: string;
    floorWidth?: number;
    floorHeight?: number;
    editable?: boolean;
    selectedTableId?: string;
    selectedRoomId?: string;
    emptyMessage?: string;
    onselect?: (table: FloorTable, reservation: Reservation | null) => void;
    onmove?: (table: FloorTable, positionX: number, positionY: number) => void;
    onroomselect?: (room: ReservationRoom) => void;
    onroommove?: (room: ReservationRoom, positionX: number, positionY: number) => void;
  } = $props();

  let zoom = $state(1);
  let dragging = $state<{
    kind: 'table' | 'room';
    id: string;
    offsetX: number;
    offsetY: number;
    pointerId: number;
  } | null>(null);

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

  function startDrag(event: PointerEvent, table: FloorTable) {
    onselect(table, reservationFor(table.id));
    if (!editable || table.blocked) return;
    const stage = event.currentTarget instanceof HTMLElement
      ? event.currentTarget.parentElement
      : null;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    dragging = {
      kind: 'table',
      id: table.id,
      pointerId: event.pointerId,
      offsetX: ((event.clientX - rect.left) / rect.width) * floorWidth - Number(table.position_x),
      offsetY: ((event.clientY - rect.top) / rect.height) * floorHeight - Number(table.position_y)
    };
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function startRoomDrag(event: PointerEvent, room: ReservationRoom) {
    onroomselect(room);
    if (!editable) return;
    const stage = event.currentTarget instanceof HTMLElement
      ? event.currentTarget.parentElement
      : null;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    dragging = {
      kind: 'room',
      id: room.id,
      pointerId: event.pointerId,
      offsetX: ((event.clientX - rect.left) / rect.width) * floorWidth - Number(room.position_x),
      offsetY: ((event.clientY - rect.top) / rect.height) * floorHeight - Number(room.position_y)
    };
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event: PointerEvent) {
    if (!dragging) return;
    const stage = event.currentTarget;
    if (!(stage instanceof HTMLElement)) return;
    const rect = stage.getBoundingClientRect();
    if (dragging.kind === 'room') {
      const room = rooms.find((item) => item.id === dragging?.id);
      if (!room) return;
      const x = Math.max(
        0,
        Math.min(
          floorWidth - Number(room.width),
          ((event.clientX - rect.left) / rect.width) * floorWidth - dragging.offsetX
        )
      );
      const y = Math.max(
        0,
        Math.min(
          floorHeight - Number(room.height),
          ((event.clientY - rect.top) / rect.height) * floorHeight - dragging.offsetY
        )
      );
      onroommove(room, Math.round(x), Math.round(y));
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
    onmove(table, Math.round(x), Math.round(y));
  }

  function endDrag(event: PointerEvent) {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    dragging = null;
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
  <div class="floor__toolbar">
    <div>
      <strong>{roomName}</strong>
      <span>{editable ? t('Drag tables to match the room.') : t('Live table availability')}</span>
    </div>
    <div class="floor__controls" aria-label={t('Floor plan zoom')}>
      <button type="button" aria-label={t('Zoom out')} disabled={zoom <= 0.8} onclick={() => (zoom = Math.max(0.8, zoom - 0.2))}>−</button>
      <button class="zoom-value" type="button" onclick={() => (zoom = 1)}>{Math.round(zoom * 100)}%</button>
      <button type="button" aria-label={t('Zoom in')} disabled={zoom >= 1.4} onclick={() => (zoom = Math.min(1.4, zoom + 0.2))}>+</button>
    </div>
  </div>

  <div class="floor__viewport">
    <div
      class="floor__stage"
      class:is-editable={editable}
      style={`--zoom:${zoom};--floor-aspect:${floorWidth / floorHeight}`}
      role="group"
      aria-label={t('{name} tables', { name: roomName })}
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
          <span>{room.name}</span>
          <small>{tables.filter((table) => table.room_id === room.id).length} {t('tables')}</small>
        </button>
      {/each}
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
            type="button"
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
  .floor__controls { display: inline-flex; border: 1px solid var(--cl-line); border-radius: 5px; background: var(--cl-surface-muted); }
  .floor__controls button {
    min-width: 29px;
    height: 27px;
    padding: 0 8px;
    border: 0;
    border-right: 1px solid var(--cl-line);
    background: transparent;
    color: var(--cl-muted);
    font: inherit;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .floor__controls button:last-child { border-right: 0; }
  .floor__controls button:hover:not(:disabled) { background: var(--cl-surface); color: var(--cl-text); }
  .floor__controls button:disabled { opacity: .35; cursor: default; }
  .floor__controls .zoom-value { min-width: 50px; font-size: 10px; font-variant-numeric: tabular-nums; }
  .floor__viewport { overflow: auto; padding: 10px; background: var(--cl-surface-muted); }
  .floor__stage {
    width: calc(100% * var(--zoom));
    min-width: 580px;
    aspect-ratio: var(--floor-aspect);
    position: relative;
    overflow: hidden;
    border: 1px solid var(--cl-line-strong);
    border-radius: 5px;
    background-color: #fbfaf7;
    background-image:
      linear-gradient(color-mix(in srgb, var(--cl-line) 50%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in srgb, var(--cl-line) 50%, transparent) 1px, transparent 1px);
    background-size: 24px 24px;
    touch-action: none;
  }
  .floor__stage::after {
    content: '';
    position: absolute;
    inset: 8px;
    pointer-events: none;
    border: 1px dashed color-mix(in srgb, var(--room-color) 28%, var(--cl-line));
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
    padding: 7px 9px;
    overflow: hidden;
    border: 1px dashed color-mix(in srgb, var(--room-color) 58%, var(--cl-line));
    border-radius: 7px;
    background: color-mix(in srgb, var(--room-color) 4%, transparent);
    color: color-mix(in srgb, var(--room-color) 72%, var(--cl-text));
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .is-editable .floor-zone { cursor: grab; }
  .floor-zone.is-dragging { z-index: 4; cursor: grabbing; box-shadow: 0 8px 18px rgb(28 35 44 / 12%); }
  .floor-zone.is-selected { border-style: solid; outline: 3px solid color-mix(in srgb, var(--room-color) 16%, transparent); outline-offset: 1px; }
  .floor-zone span {
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
    z-index: 2;
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
