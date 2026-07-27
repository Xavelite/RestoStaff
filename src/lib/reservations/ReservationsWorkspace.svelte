<script lang="ts">
  import { onMount } from 'svelte';
  import { addDays, clockLabel, serviceLabel, todayInTimezone } from '$lib/calendar/date';
  import Dialog from '$lib/components/Dialog.svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import ClassicPeriodNav from '$lib/classic/ClassicPeriodNav.svelte';
  import ReservationFloorPlan from '$lib/reservations/ReservationFloorPlan.svelte';
  import ReservationStatusBadge from '$lib/reservations/ReservationStatusBadge.svelte';
  import {
    checkReservationAvailability,
    getReservationFloorPlans,
    getReservationWorkspace,
    saveReservation,
    setReservationStatus
  } from '$lib/reservations/reservation-api';
  import {
    RESERVATION_STATUSES,
    reservationNextStatuses,
    reservationIsTerminal,
    reservationStatusMeta
  } from '$lib/reservations/reservation-status';
  import type {
    AvailabilityResult,
    Reservation,
    ReservationDraft,
    ReservationFloorPlans,
    ReservationService,
    ReservationStatus,
    ReservationTable,
    ReservationWorkspace
  } from '$lib/reservations/reservation-types';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  let { initialView = 'floor' }: { initialView?: 'floor' | 'list' } = $props();

  let selectedDate = $state('');
  let selectedService = $state('');
  let search = $state('');
  let statusFilter = $state<ReservationStatus | ''>('');
  let liveFloorId = $state('');
  let data = $state<ReservationWorkspace | null>(null);
  let floorPlans = $state<ReservationFloorPlans | null>(null);
  let loading = $state(false);
  let loadError = $state('');
  let requestId = 0;

  let editorOpen = $state(false);
  let editorSaving = $state(false);
  let editorError = $state('');
  let editorReadOnly = $state(false);
  let availability = $state<AvailabilityResult | null>(null);
  let availabilityLoading = $state(false);
  let availabilityTimer: ReturnType<typeof setTimeout> | null = null;
  let draft = $state<ReservationDraft>(emptyDraft('', '', ''));

  const timezone = $derived(
    data?.timezone || workspace.bootstrap?.restaurant_settings.timezone || 'Europe/Brussels'
  );
  const enabledServices = $derived(
    (data?.services ?? []).filter((service) => service.setting?.booking_enabled)
  );
  const activeService = $derived(
    data?.services.find((service) => service.service_key === selectedService) ?? null
  );
  const reservations = $derived.by(() => {
    const term = search.trim().toLowerCase();
    return (data?.reservations ?? []).filter((reservation) => {
      if (selectedService && reservation.service_key !== selectedService) return false;
      if (statusFilter && reservation.status !== statusFilter) return false;
      if (!term) return true;
      return [
        reservation.guest.display_name,
        reservation.guest.email,
        reservation.guest.phone,
        reservation.table_labels.join(' '),
        reservation.guest_comment,
        reservation.internal_notes
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  });
  const operationalReservations = $derived(
    (data?.reservations ?? []).filter(
      (reservation) =>
        (!selectedService || reservation.service_key === selectedService) &&
        !['cancelled', 'no_show', 'finished'].includes(reservation.status)
    )
  );
  const activeReservations = $derived(operationalReservations);
  const covers = $derived(
    activeReservations.reduce((total, reservation) => total + reservation.party_size, 0)
  );
  const capacity = $derived(activeService?.setting?.maximum_covers ?? null);
  const occupiedTables = $derived(
    new Set(activeReservations.flatMap((reservation) => reservation.table_ids)).size
  );
  const availableTables = $derived(
    Math.max(
      0,
      (data?.tables.filter((table) => table.active && !table.blocked).length ?? 0) -
        occupiedTables
    )
  );
  const serviceReadiness = $derived(
    !activeService?.setting?.booking_enabled
      ? 'Setup required'
      : data?.tables.length && availableTables === 0
        ? 'Fully booked'
        : capacity !== null && covers >= capacity
          ? 'Cover limit reached'
          : 'Accepting bookings'
  );
  const liveFloor = $derived(
    floorPlans?.floors.find((floor) => floor.id === liveFloorId) ??
      floorPlans?.floors[0] ??
      null
  );
  const liveRooms = $derived(
    (data?.rooms ?? []).filter((room) => room.floor_id === liveFloor?.id)
  );
  const liveTables = $derived(
    (data?.tables ?? []).filter(
      (table) => table.active && liveRooms.some((room) => room.id === table.room_id)
    )
  );
  const liveReservations = $derived(
    operationalReservations
      .filter((reservation) =>
        reservation.table_ids.some((tableId) =>
          liveTables.some((table) => table.id === tableId)
        )
      )
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
  );

  onMount(() => {
    selectedDate = todayInTimezone(
      workspace.bootstrap?.restaurant_settings.timezone || 'Europe/Brussels'
    );
  });

  $effect(() => {
    const restaurantId = workspace.activeId;
    const date = selectedDate;
    if (!restaurantId || !date) return;
    void loadWorkspace(restaurantId, date);
  });

  $effect(() => {
    if (!editorOpen || !workspace.activeId || editorReadOnly) {
      availability = null;
      return;
    }
    const input = JSON.stringify([
      draft.business_date,
      draft.service_key,
      draft.local_time,
      draft.party_size,
      draft.room_preference_id,
      draft.id,
      draft.expected_revision
    ]);
    void input;
    if (availabilityTimer) clearTimeout(availabilityTimer);
    if (
      !draft.business_date ||
      !draft.service_key ||
      !draft.local_time ||
      !draft.party_size
    ) {
      availability = null;
      return;
    }
    availabilityLoading = true;
    const activeRestaurantId = workspace.activeId;
    availabilityTimer = setTimeout(async () => {
      try {
        availability = await checkReservationAvailability(activeRestaurantId!, draft);
      } catch (error) {
        availability = {
          available: false,
          code: 'error',
          reason: friendlyError(error)
        };
      } finally {
        availabilityLoading = false;
      }
    }, 260);
    return () => {
      if (availabilityTimer) clearTimeout(availabilityTimer);
    };
  });

  async function loadWorkspace(restaurantId: string, date: string) {
    const current = ++requestId;
    loading = true;
    loadError = '';
    try {
      const [next, nextFloorPlans] = await Promise.all([
        getReservationWorkspace(restaurantId, date),
        getReservationFloorPlans(restaurantId)
      ]);
      if (current !== requestId) return;
      data = next;
      floorPlans = nextFloorPlans;
      if (
        !selectedService ||
        !next.services.some((service) => service.service_key === selectedService)
      ) {
        selectedService =
          next.services.find((service) => service.setting?.booking_enabled)?.service_key ??
          next.services[0]?.service_key ??
          '';
      }
      if (
        !liveFloorId ||
        !nextFloorPlans.floors.some((floor) => floor.id === liveFloorId)
      ) {
        liveFloorId = nextFloorPlans.floors[0]?.id ?? '';
      }
    } catch (error) {
      if (current === requestId) loadError = friendlyError(error);
    } finally {
      if (current === requestId) loading = false;
    }
  }

  function emptyDraft(
    date: string,
    serviceKey: string,
    localTime: string
  ): ReservationDraft {
    return {
      guest_name: '',
      guest_email: '',
      guest_phone: '',
      business_date: date,
      service_key: serviceKey,
      local_time: localTime,
      party_size: 2,
      room_preference_id: '',
      source: 'phone',
      guest_comment: '',
      internal_notes: '',
      language_code: 'fr'
    };
  }

  function serviceStart(service: ReservationService | null): string {
    const opening = service?.exception?.availability === 'open'
      ? service.exception.opens_at
      : service?.opening?.opens_at;
    return clockLabel(opening) || (service?.service_key === 'evening' ? '18:00' : '12:00');
  }

  function openNewReservation(roomId = '') {
    const service =
      data?.services.find((item) => item.service_key === selectedService) ??
      enabledServices[0] ??
      null;
    draft = emptyDraft(selectedDate, service?.service_key ?? '', serviceStart(service));
    draft.room_preference_id = roomId;
    availability = null;
    editorError = '';
    editorReadOnly = false;
    editorOpen = true;
  }

  function selectFloorTable(table: Omit<ReservationTable, 'restaurant_id'>, reservation: Reservation | null) {
    if (reservation) {
      openReservation(reservation);
      return;
    }
    openNewReservation(table.room_id);
  }

  function openReservation(reservation: Reservation) {
    const localTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(new Date(reservation.starts_at));
    draft = {
      id: reservation.id,
      guest_id: reservation.guest_id,
      expected_revision: reservation.revision,
      guest_name: reservation.guest.display_name,
      guest_email: reservation.guest.email ?? '',
      guest_phone: reservation.guest.phone ?? '',
      business_date: reservation.business_date,
      service_key: reservation.service_key,
      local_time: localTime,
      party_size: reservation.party_size,
      room_preference_id: reservation.room_preference_id ?? '',
      source: reservation.source,
      guest_comment: reservation.guest_comment ?? '',
      internal_notes: reservation.internal_notes ?? '',
      language_code: reservation.guest.language_code
    };
    availability = null;
    editorError = '';
    editorReadOnly = reservationIsTerminal(reservation.status);
    editorOpen = true;
  }

  async function submitReservation() {
    if (!workspace.activeId || editorSaving || editorReadOnly) return;
    if (!draft.guest_name.trim()) {
      editorError = t('Guest name is required.');
      return;
    }
    editorSaving = true;
    editorError = '';
    try {
      await saveReservation(workspace.activeId, draft);
      editorOpen = false;
      await loadWorkspace(workspace.activeId, selectedDate);
      toasts.show(t(draft.id ? 'Reservation updated.' : 'Reservation added.'), 'success');
    } catch (error) {
      editorError = friendlyError(error);
    } finally {
      editorSaving = false;
    }
  }

  async function changeStatus(reservation: Reservation, status: ReservationStatus) {
    if (!workspace.activeId || status === reservation.status) return;
    try {
      await setReservationStatus(workspace.activeId, reservation.id, status, reservation.revision);
      await loadWorkspace(workspace.activeId, selectedDate);
      toasts.show(t('Reservation status updated.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    }
  }

  function dateLabel(date: string): string {
    if (!date) return '';
    return new Intl.DateTimeFormat(i18n.intlLocale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(`${date}T00:00:00Z`));
  }

  function timeLabel(value: string): string {
    return new Intl.DateTimeFormat(i18n.intlLocale, {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(new Date(value));
  }

  function sourceLabel(value: string): string {
    if (value === 'walk_in') return t('Walk-in');
    if (value === 'phone') return t('Phone');
    if (value === 'widget') return t('Online');
    if (value === 'integration') return t('Integration');
    return t('Internal');
  }
</script>

<svelte:head><title>{t('Reservations')} &middot; restogogo</title></svelte:head>

<ClassicPage>
  {#snippet actions()}
    <ClassicPeriodNav
      label={dateLabel(selectedDate)}
      onprevious={() => (selectedDate = addDays(selectedDate, -1))}
      onnext={() => (selectedDate = addDays(selectedDate, 1))}
      ontoday={() => (selectedDate = todayInTimezone(timezone))}
    />
    <input
      class="cl-field date-field"
      type="date"
      aria-label={t('Date')}
      bind:value={selectedDate}
    />
    <select class="cl-field service-field" aria-label={t('Service')} bind:value={selectedService}>
      {#each data?.services ?? [] as service (service.service_key)}
        <option value={service.service_key}>
          {t(service.name)}{service.setting?.booking_enabled ? '' : ` · ${t('Closed')}`}
        </option>
      {/each}
    </select>
    <button
      class="cl-btn is-primary"
      type="button"
      disabled={workspace.isPreview || !activeService?.setting?.booking_enabled}
      onclick={() => openNewReservation()}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      {t('Add reservation')}
    </button>
    <span class="toolbar-grow"></span>
    {#if initialView === 'list'}
    <input
      class="cl-field toolbar-search"
      type="search"
      placeholder={t('Search guest, phone or table')}
      bind:value={search}
    />
    <select class="cl-field status-field" aria-label={t('Status')} bind:value={statusFilter}>
      <option value="">{t('All statuses')}</option>
      {#each RESERVATION_STATUSES as status}
        <option value={status}>{t(reservationStatusMeta(status).label)}</option>
      {/each}
    </select>
    {/if}
  {/snippet}

  {#if loadError}
    <section class="cl-state" role="alert">
      <strong>{t('Reservations unavailable')}</strong>
      <span>{loadError}</span>
      <button class="cl-btn" type="button" onclick={() => workspace.activeId && loadWorkspace(workspace.activeId, selectedDate)}>{t('Try again')}</button>
    </section>
  {:else}
    <section class="reservation-summary" aria-label={t('Reservation summary')}>
      <span><b>{activeReservations.length}</b> {t('bookings')}</span>
      <span><b>{covers}{capacity ? ` / ${capacity}` : ''}</b> {t('covers')}</span>
      <span><b>{data?.tables.length ? availableTables : '—'}</b> {t('tables available')}</span>
      <span class:is-ready={serviceReadiness === 'Accepting bookings'}><i></i>{t(serviceReadiness)}</span>
    </section>

    {#if !loading && !activeService?.setting?.booking_enabled}
      <section class="setup-callout">
        <div>
          <strong>{t('Configure this service before taking bookings')}</strong>
          <span>{t('Set duration, capacity and reservable rooms once; the booking engine will enforce them everywhere.')}</span>
        </div>
        <a class="cl-btn is-primary" href="/reservations/setup">{t('Open reservation setup')}</a>
      </section>
    {/if}

    {#if initialView === 'floor'}
      <section class="live-floor">
        <div class="live-floor__rooms" aria-label={t('Restaurant floors')}>
          {#each floorPlans?.floors ?? [] as floor (floor.id)}
            <button
              class:is-active={floor.id === liveFloor?.id}
              type="button"
              onclick={() => (liveFloorId = floor.id)}
            >
              <i style="--room-color:var(--cl-accent)"></i>
              <span>{floor.name}</span>
              <small>{data?.tables.filter((table) =>
                table.active && data?.rooms.some((room) => room.floor_id === floor.id && room.id === table.room_id)
              ).length ?? 0}</small>
            </button>
          {/each}
          <a href="/reservations/floor-plans">{t('Edit tables')}</a>
        </div>
        {#if liveFloor}
          <div class="live-floor__workspace">
            <ReservationFloorPlan
              tables={liveTables}
              rooms={liveRooms}
              reservations={operationalReservations}
              roomName={liveFloor.name}
              floorWidth={liveFloor.canvas_width}
              floorHeight={liveFloor.canvas_height}
              emptyMessage="Set up restaurant areas and tables before using the live floor view."
              onselect={selectFloorTable}
            />
            <aside class="arrival-rail">
              <header>
                <div>
                  <span>{t('Service arrivals')}</span>
                  <strong>{t(activeService?.name ?? selectedService)}</strong>
                </div>
                <small>{liveReservations.length}</small>
              </header>
              <div class="arrival-rail__list">
                {#if !liveReservations.length}
                  <div class="arrival-rail__empty">
                    <strong>{t('No assigned arrivals')}</strong>
                    <span>{t('Available tables remain ready for phone bookings or walk-ins.')}</span>
                  </div>
                {:else}
                  {#each liveReservations as reservation (reservation.id)}
                    <button type="button" onclick={() => openReservation(reservation)}>
                      <time>{timeLabel(reservation.starts_at)}</time>
                      <span>
                        <strong>{reservation.guest.display_name}</strong>
                        <small>{reservation.party_size} · {reservation.table_labels.join(' + ')}</small>
                      </span>
                      <ReservationStatusBadge status={reservation.status} />
                    </button>
                  {/each}
                {/if}
              </div>
              <button class="arrival-rail__add" type="button" onclick={() => openNewReservation()}>
                <span>+</span>
                {t('Add booking')}
              </button>
            </aside>
          </div>
        {:else}
          <div class="cl-empty">
            <strong>{t('No reservable room yet')}</strong>
            <span>{t('Set up areas in Restaurant → Areas, then add tables in Reservations → Tables.')}</span>
            <a class="cl-btn is-primary" href="/reservations/floor-plans">{t('Open Tables')}</a>
          </div>
        {/if}
      </section>
    {:else}
    <div class="cl-tablewrap">
      <table class="cl-table reservation-table">
        <thead>
          <tr>
            <th>{t('Guest')}</th>
            <th>{t('Time')}</th>
            <th>{t('Party')}</th>
            <th>{t('Room & table')}</th>
            <th>{t('Source')}</th>
            <th>{t('Status')}</th>
            <th class="notes-col">{t('Notes')}</th>
            <th aria-label={t('Actions')}></th>
          </tr>
        </thead>
        <tbody>
          {#if loading && !data}
            {#each Array(6) as _}
              <tr>
                <td colspan="8"><span class="cl-skel"></span></td>
              </tr>
            {/each}
          {:else if !reservations.length}
            <tr>
              <td colspan="8">
                <div class="cl-empty">
                  <strong>{t('No reservations for this view')}</strong>
                  <span>{t('Add a phone booking or change the service, status or search filter.')}</span>
                </div>
              </td>
            </tr>
          {:else}
            {#each reservations as reservation (reservation.id)}
              <tr class:is-muted={['cancelled', 'no_show'].includes(reservation.status)}>
                <td>
                  <button class="guest-cell" type="button" onclick={() => openReservation(reservation)}>
                    <span class="guest-cell__name">{reservation.guest.display_name}</span>
                    <small>{reservation.guest.phone || reservation.guest.email || t('No contact details')}</small>
                  </button>
                </td>
                <td>
                  <strong class="time-cell">{timeLabel(reservation.starts_at)}</strong>
                  <small>{t(serviceLabel(reservation.service_key))}</small>
                </td>
                <td>
                  <span class="party-cell">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16.5 7a2.5 2.5 0 0 1 0 5M18 14a4.5 4.5 0 0 1 3 4.2"/></svg>
                    {reservation.party_size}
                  </span>
                </td>
                <td>
                  {#if reservation.table_labels.length}
                    <span class="cl-chip" style={`--chip:${data?.rooms.find((room) => room.id === reservation.room_preference_id)?.area_color || 'var(--cl-info)'}`}>
                      <span>{reservation.table_labels.join(' + ')}</span>
                    </span>
                  {:else}
                    <span class="muted">{data?.rooms.find((room) => room.id === reservation.room_preference_id)?.name || t('Unassigned')}</span>
                  {/if}
                </td>
                <td><span class="source">{sourceLabel(reservation.source)}</span></td>
                <td><ReservationStatusBadge status={reservation.status} /></td>
                <td class="notes-col">
                  <span class="note" title={reservation.guest_comment || reservation.internal_notes || ''}>
                    {reservation.guest_comment || reservation.internal_notes || '—'}
                  </span>
                </td>
                <td>
                  <label class="row-status-action" title={t('Change status')}>
                    <span aria-hidden="true">•••</span>
                    <select
                      aria-label={t('Change status for {name}', { name: reservation.guest.display_name })}
                      value={reservation.status}
                      onchange={(event) => void changeStatus(
                        reservation,
                        event.currentTarget.value as ReservationStatus
                      )}
                    >
                      {#each reservationNextStatuses(reservation.status) as status}
                        <option value={status}>{t(reservationStatusMeta(status).label)}</option>
                      {/each}
                    </select>
                  </label>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
    {/if}
  {/if}
</ClassicPage>

<Dialog
  open={editorOpen}
  title={draft.id ? 'Edit reservation' : 'Add reservation'}
  description="The same server-side availability check is used here and by future booking channels."
  size="large"
  onclose={() => (editorOpen = false)}
>
  {#snippet children()}
    <div class="reservation-form">
      <section>
        <h3>{t('Booking')}</h3>
        <div class="form-grid">
          <label class="cl-label">
            <span>{t('Date')}</span>
            <input class="cl-field" type="date" bind:value={draft.business_date} />
          </label>
          <label class="cl-label">
            <span>{t('Service')}</span>
            <select class="cl-field" bind:value={draft.service_key}>
              {#each data?.services ?? [] as service (service.service_key)}
                <option value={service.service_key}>{t(service.name)}</option>
              {/each}
            </select>
          </label>
          <label class="cl-label">
            <span>{t('Time')}</span>
            <input class="cl-field" type="time" bind:value={draft.local_time} />
          </label>
          <label class="cl-label">
            <span>{t('Guests')}</span>
            <input class="cl-field" type="number" min="1" max="500" bind:value={draft.party_size} />
          </label>
          <label class="cl-label">
            <span>{t('Room preference')}</span>
            <select class="cl-field" bind:value={draft.room_preference_id}>
              <option value="">{t('Best available')}</option>
              {#each data?.rooms ?? [] as room (room.id)}
                <option value={room.id}>{room.name}</option>
              {/each}
            </select>
          </label>
          <label class="cl-label">
            <span>{t('Source')}</span>
            <select class="cl-field" bind:value={draft.source}>
              <option value="phone">{t('Phone')}</option>
              <option value="internal">{t('Internal')}</option>
              <option value="walk_in">{t('Walk-in')}</option>
              <option value="widget">{t('Online')}</option>
              <option value="integration">{t('Integration')}</option>
            </select>
          </label>
        </div>
      </section>

      <section>
        <h3>{t('Guest')}</h3>
        <div class="form-grid">
          <label class="cl-label form-wide">
            <span>{t('Guest name')}</span>
            <input class="cl-field" autocomplete="name" bind:value={draft.guest_name} />
          </label>
          <label class="cl-label">
            <span>{t('Phone')}</span>
            <input class="cl-field" type="tel" autocomplete="tel" bind:value={draft.guest_phone} />
          </label>
          <label class="cl-label">
            <span>{t('Email')}</span>
            <input class="cl-field" type="email" autocomplete="email" bind:value={draft.guest_email} />
          </label>
          <label class="cl-label">
            <span>{t('Guest request')}</span>
            <textarea class="cl-field" rows="2" bind:value={draft.guest_comment}></textarea>
          </label>
          <label class="cl-label">
            <span>{t('Internal note')}</span>
            <textarea class="cl-field" rows="2" bind:value={draft.internal_notes}></textarea>
          </label>
        </div>
      </section>

      <div
        class="availability"
        class:is-ok={availability?.available}
        class:is-problem={availability && !availability.available}
        aria-live="polite"
      >
        <span class="availability__symbol" aria-hidden="true">
          {availabilityLoading ? '…' : availability?.available ? '✓' : '!'}
        </span>
        <div>
          <strong>
            {availabilityLoading
              ? t('Checking availability…')
              : availability?.available
                ? t('Available')
                : t('Not available yet')}
          </strong>
          <small>
            {availabilityLoading
              ? t('Applying service, capacity and table rules.')
              : availability?.available
                ? t('A suitable table or capacity slot is available.')
                : t(availability?.reason || 'Complete the booking details to check availability.')}
          </small>
        </div>
      </div>
      {#if editorReadOnly}
        <p class="form-error" role="status">{t('Finished, cancelled and no-show reservations are read-only.')}</p>
      {/if}
      {#if editorError}<p class="form-error" role="alert">{editorError}</p>{/if}
    </div>
  {/snippet}
  {#snippet footer()}
    <button class="cl-btn" type="button" disabled={editorSaving} onclick={() => (editorOpen = false)}>{t('Cancel')}</button>
    <button
      class="cl-btn is-primary"
      type="button"
      disabled={editorReadOnly || editorSaving || availabilityLoading || !availability?.available}
      onclick={() => void submitReservation()}
    >{t(editorSaving ? 'Saving…' : draft.id ? 'Save changes' : 'Add reservation')}</button>
  {/snippet}
</Dialog>

<style>
  .date-field { width: 130px; }
  .service-field { width: 130px; }
  .status-field { width: 126px; }
  .toolbar-search { width: 200px; min-width: 200px; }
  .reservation-summary {
    min-height: 34px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0;
    padding: 0 10px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface-muted);
  }
  .reservation-summary > span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 10px;
    border-right: 1px solid var(--cl-line);
    color: var(--cl-muted);
    font-size: 10.5px;
  }
  .reservation-summary > span:last-child { margin-left: auto; border-right: 0; color: var(--cl-attention); }
  .reservation-summary > span.is-ready { color: var(--cl-ok); }
  .reservation-summary b { color: var(--cl-ink); font-size: 11px; font-variant-numeric: tabular-nums; }
  .reservation-summary i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .setup-callout {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-top: -12px;
    padding: 13px 15px;
    border: 1px solid var(--cl-attention-line);
    border-left: 3px solid var(--cl-attention);
    border-radius: var(--cl-radius);
    background: var(--cl-attention-wash);
  }
  .setup-callout > div { display: grid; gap: 3px; }
  .setup-callout strong { font-size: 13px; }
  .setup-callout span { color: var(--cl-muted); font-size: 12px; }
  .live-floor {
    overflow: hidden;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface);
  }
  .live-floor__rooms {
    min-height: 43px;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--cl-line);
    background: var(--cl-thead);
  }
  .live-floor__rooms button {
    min-height: 29px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--cl-muted);
    font: inherit;
    font-size: 11px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .live-floor__rooms button:hover { background: var(--cl-surface-muted); }
  .live-floor__rooms button.is-active { border-color: var(--cl-line); background: var(--cl-surface); color: var(--cl-text); }
  .live-floor__rooms button > i { width: 7px; height: 18px; border-radius: 2px; background: var(--room-color); }
  .live-floor__rooms button small {
    min-width: 18px;
    padding: 1px 5px;
    border-radius: 999px;
    background: var(--cl-surface-muted);
    color: var(--cl-muted);
    font-size: 9px;
    text-align: center;
  }
  .live-floor__rooms > a { margin-left: auto; color: var(--cl-muted); font-size: 10.5px; font-weight: var(--rst-fw-bold); text-decoration: none; }
  .live-floor__rooms > a:hover { color: var(--cl-accent); }
  .live-floor__workspace {
    display: grid;
    grid-template-columns: minmax(560px, 1.7fr) minmax(250px, .72fr);
    gap: 10px;
    padding: 10px;
    background: var(--cl-surface-muted);
  }
  .arrival-rail {
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface);
  }
  .arrival-rail > header {
    min-height: 49px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 11px;
    border-bottom: 1px solid var(--cl-line);
  }
  .arrival-rail > header div { display: grid; gap: 1px; }
  .arrival-rail > header span { color: var(--cl-muted); font-size: 9.5px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .arrival-rail > header strong { font-size: 12.5px; }
  .arrival-rail > header > small {
    min-width: 23px;
    padding: 3px 6px;
    border-radius: 999px;
    background: var(--cl-accent-wash);
    color: var(--cl-accent);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-align: center;
  }
  .arrival-rail__list { min-height: 0; flex: 1; overflow: auto; }
  .arrival-rail__list > button {
    width: 100%;
    min-height: 57px;
    display: grid;
    grid-template-columns: 43px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border: 0;
    border-bottom: 1px solid var(--cl-line);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .arrival-rail__list > button:hover { background: var(--cl-surface-muted); }
  .arrival-rail__list time { color: var(--cl-text); font-size: 11.5px; font-weight: var(--rst-fw-bold); font-variant-numeric: tabular-nums; }
  .arrival-rail__list > button > span { min-width: 0; display: grid; gap: 2px; }
  .arrival-rail__list > button > span strong, .arrival-rail__list > button > span small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .arrival-rail__list > button > span strong { font-size: 11.5px; }
  .arrival-rail__list > button > span small { color: var(--cl-muted); font-size: 9.5px; }
  .arrival-rail__empty {
    min-height: 180px;
    display: grid;
    place-content: center;
    gap: 4px;
    padding: 22px;
    color: var(--cl-muted);
    text-align: center;
  }
  .arrival-rail__empty strong { color: var(--cl-text); font-size: 12px; }
  .arrival-rail__empty span { font-size: 10.5px; line-height: 1.45; }
  .arrival-rail__add {
    min-height: 39px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 10px;
    border: 0;
    border-top: 1px solid var(--cl-line);
    background: var(--cl-accent-wash);
    color: var(--cl-accent);
    font: inherit;
    font-size: 10.5px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .arrival-rail__add > span { width: 19px; height: 19px; display: grid; place-items: center; border: 1px solid var(--cl-accent-line); border-radius: 4px; }
  .reservation-table th:first-child { min-width: 190px; }
  .reservation-table th:nth-child(2) { width: 90px; }
  .reservation-table th:nth-child(3) { width: 72px; }
  .reservation-table th:nth-child(4) { min-width: 145px; }
  .reservation-table th:nth-child(5) { width: 92px; }
  .reservation-table th:nth-child(6) { width: 126px; }
  .reservation-table th:last-child { width: 42px; }
  .reservation-table td { height: 54px; }
  .reservation-table tr.is-muted td { color: var(--cl-muted); background: var(--cl-surface-muted); }
  .guest-cell {
    width: 100%;
    display: grid;
    gap: 2px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .guest-cell__name { font-weight: var(--rst-fw-bold); }
  .guest-cell small, .time-cell + small { color: var(--cl-muted); font-size: 11px; }
  .time-cell { display: block; font-size: 14px; font-variant-numeric: tabular-nums; }
  .party-cell { display: inline-flex; align-items: center; gap: 6px; font-weight: var(--rst-fw-bold); }
  .party-cell svg { color: var(--cl-muted); }
  .source {
    display: inline-flex;
    padding: 3px 7px;
    border: 1px solid var(--cl-line);
    border-radius: 4px;
    background: var(--cl-surface-muted);
    color: var(--cl-muted);
    font-size: 11px;
    font-weight: var(--rst-fw-medium);
  }
  .muted { color: var(--cl-muted); font-size: 12px; }
  .note { max-width: 210px; display: block; overflow: hidden; color: var(--cl-muted); text-overflow: ellipsis; white-space: nowrap; }
  .row-status-action {
    width: 30px;
    height: 30px;
    position: relative;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--cl-line);
    border-radius: 4px;
    background: var(--cl-surface);
    color: var(--cl-muted);
    cursor: pointer;
  }
  .row-status-action > span { margin-top: -4px; font-size: 12px; font-weight: var(--rst-fw-bold); letter-spacing: 1px; }
  .row-status-action select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
  .row-status-action:focus-within { outline: 2px solid var(--cl-accent); outline-offset: 1px; }
  .reservation-form { display: grid; gap: 18px; }
  .reservation-form section { display: grid; gap: 10px; }
  .reservation-form h3 { margin: 0; padding-bottom: 7px; border-bottom: 1px solid var(--cl-line); font-size: 13px; }
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .form-wide { grid-column: 1 / -1; }
  textarea.cl-field { height: auto; min-height: 58px; resize: vertical; }
  .availability {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 12px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface-muted);
  }
  .availability.is-ok { border-color: var(--cl-ok-line); background: var(--cl-ok-wash); }
  .availability.is-problem { border-color: var(--cl-problem-line); background: var(--cl-problem-wash); }
  .availability__symbol {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--cl-surface);
    color: var(--cl-muted);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
  }
  .is-ok .availability__symbol { color: var(--cl-ok); }
  .is-problem .availability__symbol { color: var(--cl-problem); }
  .availability > div { display: grid; gap: 2px; }
  .availability strong { font-size: 12px; }
  .availability small { color: var(--cl-muted); font-size: 11px; }
  .form-error { margin: 0; color: var(--cl-problem); font-size: 12px; }
  @media (max-width: 760px) {
    .live-floor__workspace { grid-template-columns: minmax(0, 1fr); }
    .reservation-summary > span:last-child { width: 100%; margin-left: 0; padding-top: 5px; padding-bottom: 5px; border-top: 1px solid var(--cl-line); }
    .notes-col { display: none; }
  }
  @media (max-width: 520px) {
    .form-grid { grid-template-columns: minmax(0, 1fr); }
    .form-wide { grid-column: 1; }
    .setup-callout { align-items: stretch; flex-direction: column; }
  }
</style>
