<script lang="ts">
  import { CalendarX2, ListChecks, MapPinned, Plus, UsersRound } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import {
    addDays,
    clockLabel,
    serviceDefaultHours,
    serviceLabel,
    todayInTimezone
  } from '$lib/calendar/date';
  import Dialog from '$lib/components/Dialog.svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import WorkspaceColMenu from '$lib/workspace-ui/WorkspaceColMenu.svelte';
  import WorkspaceCard from '$lib/workspace-ui/WorkspaceCard.svelte';
  import WorkspaceCardGrid from '$lib/workspace-ui/WorkspaceCardGrid.svelte';
  import { workspaceLayout } from '$lib/workspace-ui/workspace-layout.svelte';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import WorkspacePrimaryColMenu from '$lib/workspace-ui/WorkspacePrimaryColMenu.svelte';
  import WorkspaceRowMenu from '$lib/workspace-ui/WorkspaceRowMenu.svelte';
  import WorkspaceTablePanel from '$lib/workspace-ui/WorkspaceTablePanel.svelte';
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
    reservationIsCurrentAt,
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
  let nowMs = $state(Date.now());
  let search = $state('');
  let tableSearch = $state('');
  let notesSearch = $state('');
  let excludedSources = $state(new Set<string>());
  let excludedStatuses = $state(new Set<string>());
  let bookingSort = $state<{
    key: 'guest' | 'time' | 'party' | 'table' | 'source' | 'status' | 'notes';
    dir: 'asc' | 'desc';
  } | null>({ key: 'time', dir: 'asc' });
  let liveFloorId = $state('');
  let data = $state<ReservationWorkspace | null>(null);
  let floorPlans = $state<ReservationFloorPlans | null>(null);
  let loading = $state(false);
  let loadError = $state('');
  let requestId = 0;

  let editorOpen = $state(false);
  let arrivalsOpen = $state(false);
  let editorSaving = $state(false);
  let editorError = $state('');
  let editorReadOnly = $state(false);
  let availability = $state<AvailabilityResult | null>(null);
  let availabilityLoading = $state(false);
  let availabilityRequestId = 0;
  let draft = $state<ReservationDraft>(emptyDraft('', '', ''));

  const currentData = $derived(data?.businessDate === selectedDate ? data : null);
  const timezone = $derived(
    currentData?.timezone || workspace.bootstrap?.restaurant_settings.timezone || 'Europe/Brussels'
  );
  const enabledServices = $derived(
    (currentData?.services ?? []).filter((service) => service.setting?.booking_enabled)
  );
  const activeService = $derived(
    currentData?.services.find((service) => service.service_key === selectedService) ?? null
  );
  const draftService = $derived(
    data?.services.find((service) => service.service_key === draft.service_key) ?? null
  );
  const draftUsesTables = $derived(
    (draftService?.setting?.capacity_mode ?? 'tables') === 'tables'
  );
  const activeFloors = $derived(
    (floorPlans?.floors ?? [])
      .filter((floor) => floor.active)
      .sort((left, right) => left.level - right.level || left.sort_order - right.sort_order)
  );
  const sourceValues = $derived([
    { value: 'phone', label: t('Phone') },
    { value: 'internal', label: t('Internal') },
    { value: 'walk_in', label: t('Walk-in') },
    { value: 'widget', label: t('Online') },
    { value: 'integration', label: t('Integration') }
  ]);
  const statusValues = $derived(
    RESERVATION_STATUSES.map((status) => ({
      value: status,
      label: t(reservationStatusMeta(status).label)
    }))
  );
  const reservations = $derived.by(() => {
    const guestTerm = search.trim().toLowerCase();
    const seatingTerm = tableSearch.trim().toLowerCase();
    const noteTerm = notesSearch.trim().toLowerCase();
    const filtered = (currentData?.reservations ?? []).filter((reservation) => {
      if (selectedService && reservation.service_key !== selectedService) return false;
      if (excludedSources.has(reservation.source)) return false;
      if (excludedStatuses.has(reservation.status)) return false;
      if (
        guestTerm &&
        ![reservation.guest.display_name, reservation.guest.email, reservation.guest.phone]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(guestTerm)
      ) return false;
      if (
        seatingTerm &&
        ![
          reservation.table_labels.join(' '),
          currentData?.rooms.find((room) => room.id === reservation.room_preference_id)?.name
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(seatingTerm)
      ) return false;
      if (
        noteTerm &&
        ![reservation.guest_comment, reservation.internal_notes]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(noteTerm)
      ) return false;
      return true;
    });
    if (!bookingSort) return filtered;
    const direction = bookingSort.dir === 'asc' ? 1 : -1;
    return filtered.sort((left, right) => {
      const leftValue = reservationSortValue(left, bookingSort?.key ?? 'time');
      const rightValue = reservationSortValue(right, bookingSort?.key ?? 'time');
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return (leftValue - rightValue) * direction;
      }
      return String(leftValue).localeCompare(String(rightValue), i18n.intlLocale, {
        numeric: true,
        sensitivity: 'base'
      }) * direction;
    });
  });
  const operationalReservations = $derived(
    (currentData?.reservations ?? []).filter(
      (reservation) =>
        (!selectedService || reservation.service_key === selectedService) &&
        !['cancelled', 'no_show', 'finished'].includes(reservation.status)
    )
  );
  const activeReservations = $derived(operationalReservations);
  const currentReservations = $derived(
    operationalReservations.filter((reservation) => reservationIsCurrentAt(reservation, nowMs))
  );
  const covers = $derived(
    activeReservations.reduce((total, reservation) => total + reservation.party_size, 0)
  );
  const capacity = $derived(activeService?.setting?.maximum_covers ?? null);
  const occupiedTables = $derived(
    new Set(currentReservations.flatMap((reservation) => reservation.table_ids)).size
  );
  const availableTables = $derived(
    Math.max(
      0,
      (currentData?.tables.filter((table) => table.active && !table.blocked).length ?? 0) -
        occupiedTables
    )
  );
  const activeTableCount = $derived(
    currentData?.tables.filter((table) => table.active && !table.blocked).length ?? 0
  );
  const serviceReadiness = $derived(
    !activeService
      ? 'Service unavailable'
      : activeTableCount && availableTables === 0
        ? 'Fully booked'
        : capacity !== null && covers >= capacity
          ? 'Cover limit reached'
          : 'Service ready'
  );
  const onlineBookingsEnabled = $derived(
    Boolean(activeService?.setting?.booking_enabled)
  );
  const liveFloor = $derived(
    activeFloors.find((floor) => floor.id === liveFloorId) ??
      activeFloors[0] ??
      null
  );
  const liveFloorIndex = $derived(
    activeFloors.findIndex((floor) => floor.id === liveFloor?.id)
  );
  const liveRooms = $derived(
    (currentData?.rooms ?? []).filter((room) => room.floor_id === liveFloor?.id)
  );
  const liveTables = $derived(
    (currentData?.tables ?? []).filter(
      (table) => table.active && liveRooms.some((room) => room.id === table.room_id)
    )
  );
  const liveReservations = $derived.by(() => {
    const liveTableIds = new Set(liveTables.map((table) => table.id));
    const liveRoomIds = new Set(liveRooms.map((room) => room.id));
    return operationalReservations
      .filter((reservation) => {
        if (reservation.table_ids.some((tableId) => liveTableIds.has(tableId))) return true;
        if (reservation.table_ids.length) return false;
        return !reservation.room_preference_id || liveRoomIds.has(reservation.room_preference_id);
      })
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at));
  });

  onMount(() => {
    selectedDate = todayInTimezone(
      workspace.bootstrap?.restaurant_settings.timezone || 'Europe/Brussels'
    );
    nowMs = Date.now();
    const timer = window.setInterval(() => (nowMs = Date.now()), 60_000);
    return () => window.clearInterval(timer);
  });

  $effect(() => {
    const restaurantId = workspace.activeId;
    const date = selectedDate;
    if (!restaurantId || !date) return;
    void loadWorkspace(restaurantId, date);
  });

  $effect(() => {
    const current = ++availabilityRequestId;
    if (!editorOpen || !workspace.activeId || editorReadOnly) {
      availability = null;
      availabilityLoading = false;
      return;
    }
    const input = JSON.stringify([
      draft.business_date,
      draft.service_key,
      draft.local_time,
      draft.party_size,
      draft.room_preference_id,
      draft.preferred_table_id,
      draft.id,
      draft.expected_revision
    ]);
    void input;
    if (
      !draft.business_date ||
      !draft.service_key ||
      !draft.local_time ||
      !draft.party_size
    ) {
      availability = null;
      availabilityLoading = false;
      return;
    }
    availability = null;
    availabilityLoading = true;
    const activeRestaurantId = workspace.activeId;
    const availabilityDraft: ReservationDraft = { ...draft };
    const timer = setTimeout(async () => {
      try {
        const result = await checkReservationAvailability(activeRestaurantId, availabilityDraft);
        if (current !== availabilityRequestId) return;
        availability = result;
      } catch (error) {
        if (current !== availabilityRequestId) return;
        availability = {
          available: false,
          code: 'error',
          reason: friendlyError(error)
        };
      } finally {
        if (current === availabilityRequestId) availabilityLoading = false;
      }
    }, 260);
    return () => {
      clearTimeout(timer);
      if (current === availabilityRequestId) {
        availabilityRequestId += 1;
        availabilityLoading = false;
      }
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
      if (!isCurrentWorkspaceRequest(current, restaurantId, date)) return;
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
        !nextFloorPlans.floors.some((floor) => floor.active && floor.id === liveFloorId)
      ) {
        liveFloorId =
          nextFloorPlans.floors.find((floor) => floor.active && floor.level === 0)?.id ??
          nextFloorPlans.floors.find((floor) => floor.active)?.id ??
          '';
      }
    } catch (error) {
      if (isCurrentWorkspaceRequest(current, restaurantId, date)) {
        loadError = friendlyError(error);
      }
    } finally {
      if (isCurrentWorkspaceRequest(current, restaurantId, date)) loading = false;
    }
  }

  function isCurrentWorkspaceRequest(
    current: number,
    restaurantId: string,
    date: string
  ): boolean {
    return (
      current === requestId &&
      restaurantId === workspace.activeId &&
      date === selectedDate
    );
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
      preferred_table_id: '',
      source: 'internal',
      guest_comment: '',
      internal_notes: '',
      language_code: restaurantLanguageCode()
    };
  }

  function restaurantLanguageCode(): string {
    const locale = String(
      workspace.bootstrap?.restaurant_settings.locale || i18n.locale || 'en'
    ).trim();
    return locale.split(/[-_]/)[0]?.toLowerCase() || 'en';
  }

  function serviceStart(service: ReservationService | null): string {
    const opening = service?.exception?.availability === 'open'
      ? service.exception.opens_at
      : service?.opening?.opens_at;
    return clockLabel(opening) || serviceDefaultHours(service?.service_key ?? '').start;
  }

  function openNewReservation(roomId = '', tableId = '') {
    if (!currentData) return;
    const service =
      currentData.services.find((item) => item.service_key === selectedService) ??
      enabledServices[0] ??
      null;
    draft = emptyDraft(selectedDate, service?.service_key ?? '', serviceStart(service));
    if ((service?.setting?.capacity_mode ?? 'tables') === 'tables') {
      draft.room_preference_id = roomId;
      draft.preferred_table_id = tableId;
    }
    availability = null;
    editorError = '';
    editorReadOnly = false;
    editorOpen = true;
  }

  function navigateLiveFloor(offset: number) {
    const next = activeFloors[liveFloorIndex + offset];
    if (next) liveFloorId = next.id;
  }

  function selectFloorTable(table: Omit<ReservationTable, 'restaurant_id'>, reservation: Reservation | null) {
    if (reservation) {
      openReservation(reservation);
      return;
    }
    openNewReservation(table.room_id, table.id);
  }

  function openReservation(reservation: Reservation) {
    if (!currentData || reservation.business_date !== selectedDate) return;
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
      preferred_table_id: reservation.preferred_table_id ?? '',
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
    const restaurantId = workspace.activeId;
    const viewDate = selectedDate;
    const reservationDraft: ReservationDraft = { ...draft };
    const wasUpdate = Boolean(reservationDraft.id);
    editorSaving = true;
    editorError = '';
    try {
      await saveReservation(restaurantId, reservationDraft);
      editorOpen = false;
      if (workspace.activeId === restaurantId && selectedDate === viewDate) {
        await loadWorkspace(restaurantId, viewDate);
      }
      toasts.show(t(wasUpdate ? 'Reservation updated.' : 'Reservation added.'), 'success');
    } catch (error) {
      editorError = friendlyError(error);
    } finally {
      editorSaving = false;
    }
  }

  async function changeStatus(reservation: Reservation, status: ReservationStatus) {
    if (
      !workspace.activeId ||
      !currentData ||
      reservation.business_date !== selectedDate ||
      status === reservation.status
    ) return;
    const restaurantId = workspace.activeId;
    const viewDate = selectedDate;
    try {
      await setReservationStatus(restaurantId, reservation.id, status, reservation.revision);
      if (workspace.activeId === restaurantId && selectedDate === viewDate) {
        await loadWorkspace(restaurantId, viewDate);
      }
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

  function reservationSortValue(
    reservation: Reservation,
    key: 'guest' | 'time' | 'party' | 'table' | 'source' | 'status' | 'notes'
  ): string | number {
    if (key === 'guest') return reservation.guest.display_name;
    if (key === 'time') return reservation.starts_at;
    if (key === 'party') return reservation.party_size;
    if (key === 'table') {
      return (
        reservation.table_labels.join(' ') ||
        currentData?.rooms.find((room) => room.id === reservation.room_preference_id)?.name ||
        ''
      );
    }
    if (key === 'source') return sourceLabel(reservation.source);
    if (key === 'status') return RESERVATION_STATUSES.indexOf(reservation.status);
    return reservation.guest_comment || reservation.internal_notes || '';
  }

  function toggleExcluded(current: Set<string>, value: string): Set<string> {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function sourceLabel(value: string): string {
    if (value === 'walk_in') return t('Walk-in');
    if (value === 'phone') return t('Phone');
    if (value === 'widget') return t('Online');
    if (value === 'integration') return t('Integration');
    return t('Internal');
  }

  function setRoomPreference(roomId: string) {
    draft.room_preference_id = roomId;
    const selectedTable = currentData?.tables.find(
      (table) => table.id === draft.preferred_table_id
    );
    if (selectedTable && selectedTable.room_id !== roomId) {
      draft.preferred_table_id = '';
    }
  }

  function setTablePreference(tableId: string) {
    draft.preferred_table_id = tableId;
    const selectedTable = currentData?.tables.find((table) => table.id === tableId);
    if (selectedTable) draft.room_preference_id = selectedTable.room_id;
  }

  function setDraftService(serviceKey: string) {
    draft.service_key = serviceKey;
    const service = data?.services.find((item) => item.service_key === serviceKey);
    if ((service?.setting?.capacity_mode ?? 'tables') === 'covers') {
      draft.room_preference_id = '';
      draft.preferred_table_id = '';
    }
  }

  /**
   * The time is what the operator means; the service is derivable from it.
   *
   * Asking someone to keep a service picker in sync with the clock made a valid
   * booking look impossible: choosing an evening time while the picker still
   * said the lunch service returned "outside this service" with no hint that
   * the fix was a second, unrelated field. So a typed time now moves the
   * service to whichever open one actually contains it, and only a time that
   * belongs to no service is refused.
   */
  function setDraftTime(localTime: string) {
    draft.local_time = localTime;
    if (!localTime) return;
    const owning = (data?.services ?? []).find((service) => {
      if (!service.setting?.booking_enabled) return false;
      const opening = serviceStart(service);
      const closes = service.exception?.availability === 'open'
        ? service.exception.closes_at
        : service.opening?.closes_at;
      const closing = clockLabel(closes) || serviceDefaultHours(service.service_key).end;
      if (!opening || !closing) return false;
      return localTime >= opening && localTime <= closing;
    });
    if (owning && owning.service_key !== draft.service_key) setDraftService(owning.service_key);
  }
</script>

<svelte:head><title>{t('Reservations')} &middot; restogogo</title></svelte:head>

<WorkspacePage>
  {#if loadError}
    <section class="cl-state" role="alert">
      <strong>{t('Reservations unavailable')}</strong>
      <span>{loadError}</span>
      <button class="cl-btn" type="button" onclick={() => workspace.activeId && loadWorkspace(workspace.activeId, selectedDate)}>{t('Try again')}</button>
    </section>
  {:else}
    <WorkspaceTablePanel>
      {#snippet meta()}
        <span><b>{activeReservations.length}</b> {t('bookings')}</span>
        <span><b>{covers}{capacity !== null ? ` / ${capacity}` : ''}</b> {t('covers')}</span>
        <span><b>{activeTableCount ? `${availableTables} / ${activeTableCount}` : '—'}</b> {t('tables ready')}</span>
        <span
          class="service-capacity"
          class:is-problem={serviceReadiness !== 'Service ready'}
        ><i></i>{t(serviceReadiness)}</span>
        <a
          class="online-state"
          class:is-enabled={onlineBookingsEnabled}
          href="/reservations/setup"
          title={t('Open reservation setup')}
        >
          <i></i>
          <span>{t(onlineBookingsEnabled ? 'Online bookings on' : 'Online bookings off')}</span>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </a>
      {/snippet}
      {#snippet actions()}
        <div class="reservation-actions">
          <div class="reservation-period" aria-label={t('Date')}>
            <button
              type="button"
              aria-label={t('Previous')}
              title={t('Previous')}
              onclick={() => (selectedDate = addDays(selectedDate, -1))}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <label class="reservation-period__date">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2v4M18 2v4M3 9h18"/><rect x="3" y="4" width="18" height="17" rx="2"/></svg>
              <span>{dateLabel(selectedDate)}</span>
              <input
                type="date"
                aria-label={t('Choose date')}
                bind:value={selectedDate}
              />
            </label>
            <button
              type="button"
              aria-label={t('Next')}
              title={t('Next')}
              onclick={() => (selectedDate = addDays(selectedDate, 1))}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
          <label class="service-picker">
            <span class="sr-only">{t('Service')}</span>
            <select class="cl-field" aria-label={t('Service')} bind:value={selectedService}>
              {#each currentData?.services ?? [] as service (service.service_key)}
                <option value={service.service_key}>
                  {t(service.name)}{service.setting?.booking_enabled ? '' : ` · ${t('Online off')}`}
                </option>
              {/each}
            </select>
          </label>
          <button
            class="cl-btn is-primary"
            type="button"
            disabled={workspace.isPreview || !activeService}
            onclick={() => openNewReservation()}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            {t('Add reservation')}
          </button>
        </div>
      {/snippet}
      {#snippet children()}
      {#if initialView === 'floor'}
      <section class="live-floor">
        <div class="live-floor__head">
          <div class="floor-navigator" aria-label={t('Restaurant floors')}>
            <button
              type="button"
              aria-label={t('Previous floor')}
              title={t('Previous floor')}
              disabled={liveFloorIndex <= 0}
              onclick={() => navigateLiveFloor(-1)}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <label>
              <span class="sr-only">{t('Floor')}</span>
              <select bind:value={liveFloorId}>
                {#each activeFloors as floor (floor.id)}
                  <option value={floor.id}>{floor.name}</option>
                {/each}
              </select>
            </label>
            <button
              type="button"
              aria-label={t('Next floor')}
              title={t('Next floor')}
              disabled={liveFloorIndex < 0 || liveFloorIndex >= activeFloors.length - 1}
              onclick={() => navigateLiveFloor(1)}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
          <div class="live-floor__meta">
            <span>{liveRooms.length} {t(liveRooms.length === 1 ? 'area' : 'areas')}</span>
            <span>{liveTables.length} {t(liveTables.length === 1 ? 'table' : 'tables')}</span>
            <button type="button" onclick={() => (arrivalsOpen = true)}>
              <ListChecks size={13} strokeWidth={1.9} aria-hidden="true" />
              {t('Arrivals')}
              <small>{liveReservations.length}</small>
            </button>
            <a href="/reservations/floor-plans">
              {t('Edit layout')}
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </a>
          </div>
        </div>
        {#if liveFloor}
          <div class="live-floor__workspace">
            <ReservationFloorPlan
              tables={liveTables}
              rooms={liveRooms}
              reservations={currentReservations}
              roomName={liveFloor.name}
              floorWidth={liveFloor.canvas_width}
              floorHeight={liveFloor.canvas_height}
              showHeader={false}
              emptyMessage="Set up restaurant areas and tables before using the live floor view."
              onselect={selectFloorTable}
            />
          </div>
        {:else}
          <div class="cl-empty">
            <span class="cl-empty__icon" aria-hidden="true"><MapPinned size={18} /></span>
            <strong>{t('No reservable room yet')}</strong>
            <span>{t('Set up areas in Restaurant → Areas, then add tables in Reservations → Tables.')}</span>
            <a class="cl-btn is-primary" href="/reservations/floor-plans">{t('Open Tables')}</a>
          </div>
        {/if}
      </section>
    {:else}
    {#if workspaceLayout.cards && !loading && reservations.length}
      <!-- A service reads as a sequence of guests, so each booking is one object
           carrying its own time, party and table rather than a row to decode. -->
      <WorkspaceCardGrid>
        {#each reservations as reservation (reservation.id)}
          {@const cancelled = ['cancelled', 'no_show'].includes(reservation.status)}
          <WorkspaceCard
            accent={cancelled ? null : 'var(--cl-accent)'}
            title={reservation.guest.display_name}
            subtitle={reservation.guest.phone || reservation.guest.email || t('No contact details')}
            badges={[
              {
                label: t(reservationStatusMeta(reservation.status).label),
                tone: cancelled ? ('neutral' as const) : ('accent' as const)
              },
              { label: `${reservation.party_size} ${t('guests')}`, tone: 'neutral' as const }
            ]}
            meta={[
              { label: t('Time'), value: timeLabel(reservation.starts_at) },
              {
                label: t('Room & table'),
                value: reservation.table_labels.join(' + ') || t('Unassigned'),
                muted: !reservation.table_labels.length
              },
              { label: t('Source'), value: t(sourceLabel(reservation.source)) },
              {
                label: t('Notes'),
                value: reservation.guest_comment || reservation.internal_notes || '—',
                muted: !reservation.guest_comment && !reservation.internal_notes
              }
            ]}
            onactivate={() => openReservation(reservation)}
          />
        {/each}
      </WorkspaceCardGrid>
    {:else}
    <div class="cl-tablewrap">
      <table class="cl-table cl-mobile-rows reservation-table">
        <thead>
          <tr>
            <th class="has-menu">
              <WorkspacePrimaryColMenu
                label={t('Guest')}
                sortable
                sortDir={bookingSort?.key === 'guest' ? bookingSort.dir : null}
                onsort={(dir) => (bookingSort = { key: 'guest', dir })}
                filterKind="text"
                searchValue={search}
                onsearch={(value) => (search = value)}
              />
            </th>
            <th class="has-menu">
              <WorkspaceColMenu
                label={t('Time')}
                sortable
                sortDir={bookingSort?.key === 'time' ? bookingSort.dir : null}
                onsort={(dir) => (bookingSort = { key: 'time', dir })}
              />
            </th>
            <th class="has-menu">
              <WorkspaceColMenu
                label={t('Party')}
                sortable
                sortDir={bookingSort?.key === 'party' ? bookingSort.dir : null}
                onsort={(dir) => (bookingSort = { key: 'party', dir })}
              />
            </th>
            <th class="has-menu">
              <WorkspaceColMenu
                label={t('Room & table')}
                sortable
                sortDir={bookingSort?.key === 'table' ? bookingSort.dir : null}
                onsort={(dir) => (bookingSort = { key: 'table', dir })}
                filterKind="text"
                searchValue={tableSearch}
                onsearch={(value) => (tableSearch = value)}
              />
            </th>
            <th class="has-menu">
              <WorkspaceColMenu
                label={t('Source')}
                sortable
                sortDir={bookingSort?.key === 'source' ? bookingSort.dir : null}
                onsort={(dir) => (bookingSort = { key: 'source', dir })}
                filterKind="values"
                filterValues={sourceValues}
                selected={excludedSources}
                ontoggle={(value) => (excludedSources = toggleExcluded(excludedSources, value))}
                onselectall={(on) => (excludedSources = on ? new Set() : new Set(sourceValues.map((item) => item.value)))}
              />
            </th>
            <th class="has-menu">
              <WorkspaceColMenu
                label={t('Status')}
                sortable
                sortDir={bookingSort?.key === 'status' ? bookingSort.dir : null}
                onsort={(dir) => (bookingSort = { key: 'status', dir })}
                filterKind="values"
                filterValues={statusValues}
                selected={excludedStatuses}
                ontoggle={(value) => (excludedStatuses = toggleExcluded(excludedStatuses, value))}
                onselectall={(on) => (excludedStatuses = on ? new Set() : new Set(statusValues.map((item) => item.value)))}
              />
            </th>
            <th class="has-menu notes-col">
              <WorkspaceColMenu
                label={t('Notes')}
                sortable
                sortDir={bookingSort?.key === 'notes' ? bookingSort.dir : null}
                onsort={(dir) => (bookingSort = { key: 'notes', dir })}
                filterKind="text"
                searchValue={notesSearch}
                onsearch={(value) => (notesSearch = value)}
              />
            </th>
            <th aria-label={t('Actions')}></th>
          </tr>
        </thead>
        <tbody>
          {#if loading && !currentData}
            {#each Array(6) as _}
              <tr class="cl-mobile-empty">
                <td colspan="8"><span class="cl-skel"></span></td>
              </tr>
            {/each}
          {:else if !reservations.length}
            <tr class="cl-mobile-empty">
              <td colspan="8">
                <div class="cl-empty">
                  <span class="cl-empty__icon" aria-hidden="true"><CalendarX2 size={18} /></span>
                  <strong>{t('No reservations for this view')}</strong>
                  <span>{t('Add a phone booking or change the service, status or search filter.')}</span>
                </div>
              </td>
            </tr>
          {:else}
            {#each reservations as reservation (reservation.id)}
              <tr class:is-muted={['cancelled', 'no_show'].includes(reservation.status)}>
                <td class="cl-mobile-primary">
                  <button class="guest-cell" type="button" onclick={() => openReservation(reservation)}>
                    <span class="guest-cell__name">{reservation.guest.display_name}</span>
                    <small>{reservation.guest.phone || reservation.guest.email || t('No contact details')}</small>
                  </button>
                  <span class="cl-mobile-summary">
                    <span>{timeLabel(reservation.starts_at)}</span>
                    <span>{reservation.party_size} {t('guests')}</span>
                    <span>{reservation.table_labels.join(' + ') || t('Unassigned')}</span>
                    <span>{t(reservationStatusMeta(reservation.status).label)}</span>
                  </span>
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
                    <span class="cl-chip" style={`--chip:${currentData?.rooms.find((room) => room.id === reservation.room_preference_id)?.area_color || 'var(--cl-info)'}`}>
                      <span>{reservation.table_labels.join(' + ')}</span>
                    </span>
                  {:else}
                    <span class="muted">{currentData?.rooms.find((room) => room.id === reservation.room_preference_id)?.name || t('Unassigned')}</span>
                  {/if}
                </td>
                <td><span class="source">{sourceLabel(reservation.source)}</span></td>
                <td><ReservationStatusBadge status={reservation.status} /></td>
                <td class="notes-col">
                  <span class="note" title={reservation.guest_comment || reservation.internal_notes || ''}>
                    {reservation.guest_comment || reservation.internal_notes || '—'}
                  </span>
                </td>
                <td class="menu-cell">
                  <WorkspaceRowMenu
                    items={[
                      {
                        label: t('Details'),
                        onselect: () => openReservation(reservation)
                      },
                      ...reservationNextStatuses(reservation.status).map((status) => ({
                        label: t(reservationStatusMeta(status).label),
                        onselect: () => void changeStatus(reservation, status)
                      }))
                    ]}
                  />
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
    {/if}
      {/if}
      {/snippet}
    </WorkspaceTablePanel>
  {/if}
</WorkspacePage>

<Dialog
  open={arrivalsOpen}
  title="Service arrivals"
  description={`${t(activeService?.name ?? selectedService)} · ${selectedDate}`}
  size="medium"
  flush
  onclose={() => (arrivalsOpen = false)}
>
  {#snippet children()}
    <div class="arrival-list">
      {#if !liveReservations.length}
        <div class="arrival-list__empty">
          <span class="cl-empty__icon" aria-hidden="true"><ListChecks size={18} /></span>
          <strong>{t('No assigned arrivals')}</strong>
          <span>{t('Available tables remain ready for phone bookings or walk-ins.')}</span>
        </div>
      {:else}
        {#each liveReservations as reservation (reservation.id)}
          <button
            type="button"
            onclick={() => {
              arrivalsOpen = false;
              openReservation(reservation);
            }}
          >
            <time>{timeLabel(reservation.starts_at)}</time>
            <span>
              <strong>{reservation.guest.display_name}</strong>
              <small>{reservation.party_size} · {reservation.table_labels.join(' + ') || t('Unassigned')}</small>
            </span>
            <ReservationStatusBadge status={reservation.status} />
          </button>
        {/each}
      {/if}
    </div>
  {/snippet}
  {#snippet footer()}
    <button class="cl-btn" type="button" onclick={() => (arrivalsOpen = false)}>{t('Close')}</button>
    <button
      class="cl-btn is-primary"
      type="button"
      disabled={workspace.isPreview || !activeService}
      onclick={() => {
        arrivalsOpen = false;
        openNewReservation();
      }}
    >
      <Plus size={15} strokeWidth={2} aria-hidden="true" />
      {t('Add booking')}
    </button>
  {/snippet}
</Dialog>

<Dialog
  open={editorOpen}
  title={draft.id ? 'Edit reservation' : 'Add reservation'}
  size="large"
  onclose={() => (editorOpen = false)}
>
  {#snippet children()}
    <div class="reservation-form">
      <fieldset class="reservation-form__fields" disabled={editorReadOnly}>
        <section>
          <h3>{t('Booking')}</h3>
          <div class="form-grid">
            <label class="cl-label">
              <span>{t('Date')}</span>
              <input class="cl-field" type="date" bind:value={draft.business_date} />
            </label>
            <label class="cl-label">
              <span>{t('Service')}</span>
              <select
                class="cl-field"
                value={draft.service_key}
                onchange={(event) => setDraftService(event.currentTarget.value)}
              >
                {#each data?.services ?? [] as service (service.service_key)}
                  <option value={service.service_key}>{t(service.name)}</option>
                {/each}
              </select>
            </label>
            <label class="cl-label">
              <span>{t('Time')}</span>
              <input
                class="cl-field"
                type="time"
                value={draft.local_time}
                oninput={(event) => setDraftTime(event.currentTarget.value)}
              />
            </label>
            <label class="cl-label">
              <span>{t('Guests')}</span>
              <input class="cl-field" type="number" min="1" max="500" bind:value={draft.party_size} />
            </label>
            {#if draftUsesTables}
              <label class="cl-label">
                <span>{t('Room preference')}</span>
                <select
                  class="cl-field"
                  value={draft.room_preference_id}
                  onchange={(event) => setRoomPreference(event.currentTarget.value)}
                >
                  <option value="">{t('Best available')}</option>
                  {#each data?.rooms ?? [] as room (room.id)}
                    <option value={room.id}>{room.name}</option>
                  {/each}
                </select>
              </label>
              <label class="cl-label">
                <span>{t('Table')}</span>
                <select
                  class="cl-field"
                  value={draft.preferred_table_id}
                  onchange={(event) => setTablePreference(event.currentTarget.value)}
                >
                  <option value="">{t('Best available')}</option>
                  {#each (currentData?.rooms ?? []) as room (room.id)}
                    {@const roomTables = (currentData?.tables ?? [])
                      .filter((table) => table.room_id === room.id && table.active && !table.blocked)
                      .sort((left, right) => left.sort_order - right.sort_order || left.label.localeCompare(right.label))}
                    {#if roomTables.length}
                      <optgroup label={room.name}>
                        {#each roomTables as table (table.id)}
                          <option value={table.id}>
                            {t('Table')} {table.label} · {table.minimum_capacity}–{table.maximum_capacity}
                          </option>
                        {/each}
                      </optgroup>
                    {/if}
                  {/each}
                </select>
              </label>
            {:else}
              <div class="capacity-only-note form-wide">
                <span aria-hidden="true"><UsersRound size={16} strokeWidth={1.8} /></span>
                <div>
                  <strong>{t('Cover-based service')}</strong>
                  <small>{t('Accept against the service cover limit; choose a table when guests arrive.')}</small>
                </div>
              </div>
            {/if}
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
      </fieldset>

      {#if editorReadOnly}
        <div class="availability is-readonly" role="status">
          <span class="availability__symbol" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
          </span>
          <div>
            <strong>{t('Details')}</strong>
            <small>{t('Finished, cancelled and no-show reservations are read-only.')}</small>
          </div>
        </div>
      {:else}
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
  :global(.cl-tablepanel__meta b) {
    color: var(--cl-ink);
    font-variant-numeric: tabular-nums;
  }
  .service-capacity,
  .online-state {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .service-capacity { color: var(--cl-ok); }
  .service-capacity.is-problem { color: var(--cl-attention); }
  .service-capacity i,
  .online-state i {
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: currentColor;
  }
  .online-state {
    color: var(--cl-attention);
    font-size: 13px;
    font-weight: var(--rst-fw-medium);
    text-decoration: none;
  }
  .online-state.is-enabled { color: var(--cl-ok); }
  .online-state:hover { color: var(--cl-accent); }
  .reservation-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .reservation-period,
  .floor-navigator {
    min-height: 34px;
    display: inline-flex;
    align-items: stretch;
    overflow: hidden;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
  }
  .reservation-period > button,
  .floor-navigator > button {
    width: 32px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--cl-muted);
    cursor: pointer;
  }
  .reservation-period > button:hover,
  .floor-navigator > button:hover:not(:disabled) {
    background: var(--cl-surface-muted);
    color: var(--cl-accent);
  }
  .reservation-period > button:disabled,
  .floor-navigator > button:disabled {
    opacity: .32;
    cursor: default;
  }
  .reservation-period__date {
    position: relative;
    min-width: 238px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 12px;
    border-inline: 1px solid var(--cl-line);
    color: var(--cl-text);
    cursor: pointer;
  }
  .reservation-period__date > svg { color: var(--cl-muted); }
  .reservation-period__date > span {
    overflow: hidden;
    font-size: 12.5px;
    font-weight: var(--rst-fw-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .reservation-period__date > input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }
  .reservation-period__date:focus-within {
    box-shadow: var(--rst-ui-focus);
  }
  .service-picker { display: inline-flex; }
  .service-picker .cl-field { width: 145px; }
  .live-floor {
    overflow: hidden;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius-surface);
    background: var(--cl-surface);
  }
  .live-floor__head {
    min-height: 46px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 9px;
    border-bottom: 1px solid var(--cl-line);
    background: var(--cl-thead);
  }
  .floor-navigator { min-height: 32px; }
  .floor-navigator label {
    width: 166px;
    display: flex;
    align-items: center;
    border-inline: 1px solid var(--cl-line);
  }
  .floor-navigator select {
    width: 100%;
    height: 30px;
    padding: 0 25px 0 9px;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--cl-text);
    font: inherit;
    font-size: 11.5px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .live-floor__meta {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    color: var(--cl-muted);
    font-size: 10.5px;
    font-weight: var(--rst-fw-medium);
  }
  .live-floor__meta > span + span {
    padding-left: 12px;
    border-left: 1px solid var(--cl-line);
  }
  .live-floor__meta > a,
  .live-floor__meta > button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding-left: 12px;
    border-left: 1px solid var(--cl-line);
    color: var(--cl-accent);
    font-weight: var(--rst-fw-bold);
    text-decoration: none;
  }
  .live-floor__meta > button {
    border-top: 0;
    border-right: 0;
    border-bottom: 0;
    background: transparent;
    font: inherit;
    cursor: pointer;
  }
  .live-floor__meta > button small {
    min-width: 19px;
    padding: 2px 5px;
    border-radius: 999px;
    background: var(--cl-accent-wash);
    font-size: 9px;
    text-align: center;
  }
  .live-floor__meta > a:hover { text-decoration: underline; }
  .live-floor__meta > button:hover { color: var(--cl-accent-strong); }
  .live-floor__workspace {
    padding: 10px;
    background: var(--cl-surface-muted);
  }
  .arrival-list { min-height: 180px; }
  .arrival-list > button {
    width: 100%;
    min-height: 62px;
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 9px 20px;
    border: 0;
    border-bottom: 1px solid var(--cl-line);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .arrival-list > button:last-child { border-bottom: 0; }
  .arrival-list > button:hover { background: var(--cl-surface-muted); }
  .arrival-list time { color: var(--cl-text); font-size: 12px; font-weight: var(--rst-fw-bold); font-variant-numeric: tabular-nums; }
  .arrival-list > button > span { min-width: 0; display: grid; gap: 3px; }
  .arrival-list > button > span strong,
  .arrival-list > button > span small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .arrival-list > button > span strong { font-size: 12px; }
  .arrival-list > button > span small { color: var(--cl-muted); font-size: 10.5px; }
  .arrival-list__empty {
    min-height: 240px;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 4px;
    padding: 22px;
    color: var(--cl-muted);
    text-align: center;
  }
  .arrival-list__empty strong { color: var(--cl-text); font-size: 12px; }
  .arrival-list__empty > span:last-child { max-width: 330px; font-size: 10.5px; line-height: 1.45; }
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
  .reservation-form { display: grid; gap: 14px; }
  .reservation-form__fields {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .reservation-form section {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 11px;
    padding-right: 16px;
  }
  .reservation-form section + section {
    padding-right: 0;
    padding-left: 16px;
    border-left: 1px solid var(--cl-line);
  }
  .reservation-form h3 {
    margin: 0;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--cl-line);
    color: var(--cl-ink);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    letter-spacing: .025em;
    text-transform: uppercase;
  }
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .form-wide { grid-column: 1 / -1; }
  .capacity-only-note {
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 11px;
    border: 1px solid var(--cl-accent-line);
    border-radius: var(--cl-radius);
    background: var(--cl-accent-wash);
  }
  .capacity-only-note > span {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border-radius: 5px;
    background: var(--cl-surface);
    color: var(--cl-accent);
  }
  .capacity-only-note > div { display: grid; gap: 2px; }
  .capacity-only-note strong { color: var(--cl-ink); font-size: 11.5px; }
  .capacity-only-note small { color: var(--cl-muted); font-size: 10.5px; line-height: 1.4; }
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
  .availability.is-readonly { border-color: var(--cl-line-strong); }
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
    .reservation-actions { flex-wrap: wrap; justify-content: flex-end; }
    .reservation-period__date { min-width: 190px; }
    .live-floor__head { align-items: stretch; flex-direction: column; }
    .live-floor__meta { justify-content: flex-end; }
    .notes-col { display: none; }
    .reservation-form__fields { grid-template-columns: minmax(0, 1fr); gap: 14px; }
    .reservation-form section { padding: 0; }
    .reservation-form section + section {
      padding-top: 14px;
      border-top: 1px solid var(--cl-line);
      border-left: 0;
    }
  }
  @media (max-width: 520px) {
    .form-grid { grid-template-columns: minmax(0, 1fr); }
    .form-wide { grid-column: 1; }
    .reservation-actions,
    .reservation-period,
    .service-picker,
    .service-picker .cl-field { width: 100%; }
    .reservation-period__date { min-width: 0; flex: 1; }
    .live-floor__meta { align-items: flex-start; flex-wrap: wrap; justify-content: flex-start; }
  }
</style>
