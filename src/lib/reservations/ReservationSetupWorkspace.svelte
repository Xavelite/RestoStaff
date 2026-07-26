<script lang="ts">
  import { onMount } from 'svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import { getReservationSetup, saveReservationSetup } from '$lib/reservations/reservation-api';
  import type {
    ReservationRoomDraft,
    ReservationSetup,
    ReservationSetupDraft
  } from '$lib/reservations/reservation-types';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  let source = $state<ReservationSetup | null>(null);
  let draft = $state<ReservationSetupDraft | null>(null);
  let loading = $state(false);
  let saving = $state(false);
  let dirty = $state(false);
  let error = $state('');
  let selectedRoom = $state('');

  const enabledServices = $derived(
    draft?.services.filter((service) => service.booking_enabled).length ?? 0
  );
  const activeRooms = $derived(draft?.rooms.filter((room) => room.active) ?? []);
  const activeTables = $derived(draft?.tables.filter((table) => table.active) ?? []);
  const roomColor = $derived(
    new Map(
      (source?.areas ?? []).map((area) => [
        area.id,
        typeof area.metadata === 'object' &&
        area.metadata !== null &&
        !Array.isArray(area.metadata) &&
        typeof area.metadata.color === 'string'
          ? area.metadata.color
          : 'var(--cl-info)'
      ])
    )
  );

  onMount(() => {
    if (workspace.activeId) void loadSetup(workspace.activeId);
  });

  $effect(() => {
    const restaurantId = workspace.activeId;
    if (!restaurantId || source?.restaurantId === restaurantId) return;
    void loadSetup(restaurantId);
  });

  async function loadSetup(restaurantId: string) {
    loading = true;
    error = '';
    try {
      const next = await getReservationSetup(restaurantId);
      source = next;
      draft = setupDraft(next);
      dirty = false;
      if (!selectedRoom || !draft.rooms.some((room) => room.id === selectedRoom && room.active)) {
        selectedRoom = draft.rooms.find((room) => room.active)?.id ?? '';
      }
    } catch (cause) {
      error = friendlyError(cause);
    } finally {
      loading = false;
    }
  }

  function setupDraft(setup: ReservationSetup): ReservationSetupDraft {
    return {
      services: setup.services.map((service) => ({
        restaurant_id: setup.restaurantId,
        service_key: service.service_key,
        booking_enabled: service.setting?.booking_enabled ?? false,
        automatic_confirmation: service.setting?.automatic_confirmation ?? true,
        slot_interval_minutes: service.setting?.slot_interval_minutes ?? 15,
        default_duration_minutes: service.setting?.default_duration_minutes ?? 120,
        turn_time_minutes: service.setting?.turn_time_minutes ?? 0,
        minimum_party_size: service.setting?.minimum_party_size ?? 1,
        maximum_party_size: service.setting?.maximum_party_size ?? 12,
        maximum_covers: service.setting?.maximum_covers ?? null,
        booking_cutoff_minutes: service.setting?.booking_cutoff_minutes ?? 0,
        advance_booking_days: service.setting?.advance_booking_days ?? 180
      })),
      rooms: setup.rooms.map((room) => ({
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
      tables: setup.tables.map(({ restaurant_id: _, ...table }) => ({
        ...table,
        position_x: Number(table.position_x),
        position_y: Number(table.position_y),
        width: Number(table.width),
        height: Number(table.height),
        rotation_degrees: Number(table.rotation_degrees)
      })),
      combinations: setup.combinations.map(({ restaurant_id: _, ...combination }) => ({
        ...combination
      })),
      exceptions: [...setup.exceptions]
    };
  }

  function touch() {
    dirty = true;
  }

  function serviceName(serviceKey: string): string {
    return source?.services.find((service) => service.service_key === serviceKey)?.name ?? serviceKey;
  }

  function roomForArea(areaId: string): ReservationRoomDraft | null {
    return draft?.rooms.find((room) => room.work_area_id === areaId) ?? null;
  }

  function toggleRoom(areaId: string) {
    if (!draft) return;
    const existing = roomForArea(areaId);
    if (existing) {
      existing.active = !existing.active;
      if (!existing.active && selectedRoom === existing.id) {
        selectedRoom = draft.rooms.find((room) => room.active && room.id !== existing.id)?.id ?? '';
      } else if (existing.active) {
        selectedRoom = existing.id;
      }
    } else {
      const room: ReservationRoomDraft = {
        id: crypto.randomUUID(),
        work_area_id: areaId,
        floor_id: null,
        position_x: 24,
        position_y: 24,
        width: 952,
        height: 552,
        active: true,
        sort_order: draft.rooms.length
      };
      draft.rooms = [...draft.rooms, room];
      selectedRoom = room.id;
    }
    touch();
  }

  function canSave(): boolean {
    if (!draft) return false;
    return draft.services.every(
      (service) =>
        service.minimum_party_size >= 1 &&
        service.maximum_party_size >= service.minimum_party_size &&
        service.default_duration_minutes >= 15 &&
        service.slot_interval_minutes >= 5
    ) &&
      draft.tables.every(
        (table) =>
          table.label.trim() &&
          table.minimum_capacity >= 1 &&
          table.maximum_capacity >= table.minimum_capacity
      );
  }

  async function save() {
    if (!workspace.activeId || !draft || !dirty || saving || !canSave()) return;
    saving = true;
    error = '';
    try {
      await saveReservationSetup(workspace.activeId, draft);
      await loadSetup(workspace.activeId);
      toasts.show(t('Reservation setup saved.'), 'success');
    } catch (cause) {
      error = friendlyError(cause);
      toasts.show(error, 'danger');
    } finally {
      saving = false;
    }
  }

  function discard() {
    if (!source) return;
    draft = setupDraft(source);
    dirty = false;
  }
</script>

<svelte:head><title>{t('Reservation setup')} &middot; restogogo</title></svelte:head>

<ClassicPage>
  {#if error}
    <div class="setup-error" role="alert">{error}</div>
  {/if}

  <ClassicTablePanel
    {dirty}
    {saving}
    canSave={canSave()}
    onsave={() => void save()}
    ondiscard={discard}
  >
    {#snippet meta()}
      <span><i class="dot is-green"></i>{t('{count} services open', { count: enabledServices })}</span>
      <span><i class="dot"></i>{t('{count} reservable rooms', { count: activeRooms.length })}</span>
      <span>{t('{count} tables', { count: activeTables.length })}</span>
    {/snippet}
    {#snippet children()}
      {#if loading && !draft}
        <div class="setup-loading"><span class="cl-skel"></span><span class="cl-skel"></span><span class="cl-skel"></span></div>
      {:else if draft}
        <div class="setup-sections">
          <section class="cl-card">
            <div class="cl-card__head">
              <div>
                <h2>{t('Booking rules by service')}</h2>
                <p>{t('Restaurant opening hours remain the source of truth; these settings define how reservations use them.')}</p>
              </div>
            </div>
            <div class="cl-tablewrap is-unbounded">
              <table class="cl-table services-grid">
                <thead>
                  <tr>
                    <th>{t('Service')}</th>
                    <th>{t('Bookings')}</th>
                    <th>{t('Duration')}</th>
                    <th>{t('Interval')}</th>
                    <th>{t('Party size')}</th>
                    <th>{t('Cover limit')}</th>
                    <th>{t('Confirmation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each draft.services as service (service.service_key)}
                    <tr>
                      <td>
                        <span class="service-name">
                          <i class:is-evening={service.service_key === 'evening'}></i>
                          <strong>{t(serviceName(service.service_key))}</strong>
                        </span>
                      </td>
                      <td>
                        <label class="cl-switch">
                          <input type="checkbox" bind:checked={service.booking_enabled} onchange={touch} />
                          <span aria-hidden="true"></span>
                          <em>{t(service.booking_enabled ? 'Open' : 'Closed')}</em>
                        </label>
                      </td>
                      <td><input class="cl-field number-field" type="number" min="15" max="720" step="15" bind:value={service.default_duration_minutes} oninput={touch} /><small>min</small></td>
                      <td><input class="cl-field number-field" type="number" min="5" max="120" step="5" bind:value={service.slot_interval_minutes} oninput={touch} /><small>min</small></td>
                      <td>
                        <span class="range-field">
                          <input class="cl-field number-field" aria-label={t('Minimum party size')} type="number" min="1" max="100" bind:value={service.minimum_party_size} oninput={touch} />
                          <i>–</i>
                          <input class="cl-field number-field" aria-label={t('Maximum party size')} type="number" min="1" max="500" bind:value={service.maximum_party_size} oninput={touch} />
                        </span>
                      </td>
                      <td><input class="cl-field cover-field" type="number" min="1" max="10000" placeholder="—" bind:value={service.maximum_covers} oninput={touch} /></td>
                      <td>
                        <select class="cl-field compact-select" bind:value={service.automatic_confirmation} onchange={touch}>
                          <option value={true}>{t('Automatic')}</option>
                          <option value={false}>{t('Manual')}</option>
                        </select>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </section>

          <section class="room-layout">
            <div class="cl-card rooms-card">
              <div class="cl-card__head">
                <div>
                  <h2>{t('Reservable rooms')}</h2>
                  <p>{t('Rooms are linked to Restaurant areas, so planning and reservations speak the same language.')}</p>
                </div>
              </div>
              <div class="room-list">
                {#each source?.areas ?? [] as area (area.id)}
                  {@const room = roomForArea(area.id)}
                  <button
                    class="room-option"
                    class:is-active={room?.active}
                    class:is-selected={room?.active && room.id === selectedRoom}
                    type="button"
                    onclick={() => {
                      if (room?.active) {
                        selectedRoom = room.id;
                      } else {
                        toggleRoom(area.id);
                      }
                    }}
                  >
                    <i style={`--room-color:${roomColor.get(area.id)}`}></i>
                    <span>
                      <strong>{area.name}</strong>
                      <small>
                        {room?.active
                          ? t('{count} tables', {
                              count: draft?.tables.filter((table) => table.room_id === room.id && table.active).length ?? 0
                            })
                          : t('Not reservable')}
                      </small>
                    </span>
                    {#if room?.active}
                      <span
                        class="room-option__toggle"
                        role="button"
                        tabindex="0"
                        aria-label={t('Disable {name}', { name: area.name })}
                        onclick={(event) => {
                          event.stopPropagation();
                          toggleRoom(area.id);
                        }}
                        onkeydown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleRoom(area.id);
                          }
                        }}
                      >×</span>
                    {:else}
                      <span class="room-option__add">+</span>
                    {/if}
                  </button>
                {/each}
              </div>
            </div>

          </section>
        </div>
      {/if}
    {/snippet}
  </ClassicTablePanel>
</ClassicPage>

<style>
  .setup-error {
    padding: 10px 12px;
    border: 1px solid var(--cl-problem-line);
    border-left: 3px solid var(--cl-problem);
    border-radius: var(--cl-radius);
    background: var(--cl-problem-wash);
    color: var(--cl-problem);
    font-size: 12px;
  }
  .setup-loading { display: grid; gap: 16px; padding: 24px; }
  .setup-sections { display: grid; gap: 18px; }
  .cl-card__head > div { display: grid; gap: 3px; }
  .cl-card__head p { margin: 0; color: var(--cl-muted); font-size: 11.5px; line-height: 1.4; }
  .services-grid td { height: 54px; }
  .services-grid th:first-child { min-width: 130px; }
  .service-name { display: inline-flex; align-items: center; gap: 8px; }
  .service-name > i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--cl-lunch);
    box-shadow: 0 0 0 3px var(--cl-lunch-wash);
  }
  .service-name > i.is-evening { background: var(--cl-evening); box-shadow: 0 0 0 3px var(--cl-evening-wash); }
  td > small { margin-left: 4px; color: var(--cl-muted); font-size: 10px; }
  .number-field { width: 62px; text-align: right; font-variant-numeric: tabular-nums; }
  .cover-field { width: 78px; text-align: right; }
  .range-field { display: inline-flex; align-items: center; gap: 4px; }
  .range-field i { color: var(--cl-muted); font-style: normal; }
  .compact-select { min-width: 104px; }
  .room-layout { width: min(100%, 420px); }
  .room-list { display: grid; padding: 8px; }
  .room-option {
    width: 100%;
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) 26px;
    align-items: center;
    gap: 10px;
    padding: 9px 8px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .room-option:hover { background: var(--cl-surface-muted); }
  .room-option.is-selected { border-color: var(--cl-accent-line); background: var(--cl-accent-wash); }
  .room-option > i { width: 8px; height: 30px; border-radius: 3px; background: var(--cl-line-strong); }
  .room-option.is-active > i { background: var(--room-color); }
  .room-option > span:nth-child(2) { min-width: 0; display: grid; gap: 2px; }
  .room-option strong { overflow: hidden; font-size: 12.5px; text-overflow: ellipsis; white-space: nowrap; }
  .room-option small { color: var(--cl-muted); font-size: 10.5px; }
  .room-option__toggle, .room-option__add {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border: 1px solid var(--cl-line);
    border-radius: 4px;
    background: var(--cl-surface);
    color: var(--cl-muted);
  }
  .room-option__add { color: var(--cl-accent); font-weight: var(--rst-fw-bold); }
  .cl-switch { white-space: nowrap; }
</style>
