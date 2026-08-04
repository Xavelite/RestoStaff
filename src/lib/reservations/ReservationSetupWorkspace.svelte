<script lang="ts">
  import { onMount } from 'svelte';
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import WorkspacePage from '$lib/workspace-ui/WorkspacePage.svelte';
  import WorkspaceTablePanel from '$lib/workspace-ui/WorkspaceTablePanel.svelte';
  import WorkspacePicker from '$lib/workspace-ui/WorkspacePicker.svelte';
  import WorkspaceServiceIcon from '$lib/workspace-ui/WorkspaceServiceIcon.svelte';
  import WorkspaceToggle from '$lib/workspace-ui/WorkspaceToggle.svelte';
  import WorkspaceVisualCanvas from '$lib/workspace-ui/WorkspaceVisualCanvas.svelte';
  import { workspaceLayout } from '$lib/workspace-ui/workspace-layout.svelte';
  import { getReservationSetup, saveReservationSetup } from '$lib/reservations/reservation-api';
  import type { ReservationSetup, ReservationSetupDraft } from '$lib/reservations/reservation-types';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  let source = $state<ReservationSetup | null>(null);
  let draft = $state<ReservationSetupDraft | null>(null);
  let loading = $state(false);
  let saving = $state(false);
  let dirty = $state(false);
  let error = $state('');

  const enabledServices = $derived(
    draft?.services.filter((service) => service.booking_enabled).length ?? 0
  );
  const confirmationOptions = $derived([
    { value: 'automatic', label: t('Automatic') },
    { value: 'manual', label: t('Manual') }
  ]);
  const capacityOptions = $derived([
    { value: 'tables', label: t('Assign tables') },
    { value: 'covers', label: t('Count covers') }
  ]);

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
        capacity_mode: service.setting?.capacity_mode ?? 'tables',
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

  function canSave(): boolean {
    if (!draft) return false;
    return draft.services.every(
      (service) =>
        service.minimum_party_size >= 1 &&
        service.maximum_party_size >= service.minimum_party_size &&
        (service.maximum_covers === null ||
          service.maximum_covers >= service.maximum_party_size) &&
        (service.capacity_mode === 'tables' || service.maximum_covers !== null) &&
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
      await saveReservationSetup(workspace.activeId, draft, source?.revision ?? 0);
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

  onMount(() =>
    unsavedChanges.register({
      id: 'reservation-setup',
      label: 'Reservation settings',
      isDirty: () => dirty,
      save,
      discard
    })
  );
</script>

<svelte:head><title>{t('Reservation setup')} &middot; restogogo</title></svelte:head>

<WorkspacePage>
  {#if error}
    <div class="setup-error" role="alert">{error}</div>
  {/if}

  <WorkspaceTablePanel
    {dirty}
    {saving}
    canSave={canSave()}
    onsave={() => void save()}
    ondiscard={discard}
  >
    {#snippet meta()}
      <span><i class="dot is-green"></i>{t('{count} services open', { count: enabledServices })}</span>
      <span><i class="dot"></i>{t('Booking rules by service')}</span>
    {/snippet}
    {#snippet children()}
      {#if loading && !draft}
        <div class="setup-loading"><span class="cl-skel"></span><span class="cl-skel"></span><span class="cl-skel"></span></div>
      {:else if draft}
        {#if workspaceLayout.visual}
          <WorkspaceVisualCanvas label={t('Booking rules by service')}>
            {#each draft.services as service (service.service_key)}
              <section class="booking-rule is-{service.service_key}" class:is-closed={!service.booking_enabled}>
                <header>
                  <span class="booking-rule__identity">
                    <span><WorkspaceServiceIcon service={service.service_key} size={18} /></span>
                    <span><strong>{t(serviceName(service.service_key))}</strong><small>{service.booking_enabled ? t('Accepting online bookings') : t('Bookings closed')}</small></span>
                  </span>
                  <WorkspaceToggle
                    checked={service.booking_enabled}
                    label={service.booking_enabled ? 'Open' : 'Closed'}
                    onchange={(next) => {
                      service.booking_enabled = next;
                      touch();
                    }}
                  />
                </header>
                  <div class="booking-rule__steps">
                    <label class="rule-step">
                      <span>{t('Duration')}</span>
                      <input class="cl-field number-field" type="number" min="15" max="720" step="15" bind:value={service.default_duration_minutes} oninput={touch} />
                    </label>
                    <label class="rule-step">
                      <span>{t('Interval')}</span>
                      <input class="cl-field number-field" type="number" min="5" max="120" step="5" bind:value={service.slot_interval_minutes} oninput={touch} />
                    </label>
                    <div class="rule-step">
                      <span>{t('Party size')}</span>
                      <span class="range-field">
                        <input class="cl-field number-field" aria-label={t('Minimum party size')} type="number" min="1" max="100" bind:value={service.minimum_party_size} oninput={touch} />
                        <i>–</i>
                        <input class="cl-field number-field" aria-label={t('Maximum party size')} type="number" min="1" max="500" bind:value={service.maximum_party_size} oninput={touch} />
                      </span>
                    </div>
                    <div class="rule-step">
                      <span>{t('Capacity model')}</span>
                      <WorkspacePicker
                        value={service.capacity_mode}
                        options={capacityOptions}
                        ariaLabel={t('Capacity model')}
                        onchange={(next) => {
                          service.capacity_mode = next === 'covers' ? 'covers' : 'tables';
                          if (service.capacity_mode === 'covers' && service.maximum_covers === null) {
                            service.maximum_covers = Math.max(40, service.maximum_party_size);
                          }
                          touch();
                        }}
                      />
                    </div>
                    <label class="rule-step">
                      <span>{t('Service cover limit')}</span>
                      <input
                        class="cl-field cover-field"
                        type="number"
                        min={service.maximum_party_size}
                        max="10000"
                        placeholder={service.capacity_mode === 'tables' ? t('No cap') : ''}
                        bind:value={service.maximum_covers}
                        oninput={touch}
                      />
                    </label>
                    <div class="rule-step">
                      <span>{t('Confirmation')}</span>
                      <WorkspacePicker
                        value={service.automatic_confirmation ? 'automatic' : 'manual'}
                        options={confirmationOptions}
                        ariaLabel={t('Confirmation')}
                        onchange={(next) => {
                          service.automatic_confirmation = next === 'automatic';
                          touch();
                        }}
                      />
                    </div>
                  </div>
              </section>
            {/each}
          </WorkspaceVisualCanvas>
        {:else}
        <div class="cl-tablewrap is-unbounded">
          <table class="cl-table services-grid">
            <thead>
              <tr>
                <th>{t('Service')}</th>
                <th>{t('Bookings')}</th>
                <th>{t('Duration')}</th>
                <th>{t('Interval')}</th>
                <th>{t('Party size')}</th>
                <th>{t('Capacity model')}</th>
                <th>{t('Confirmation')}</th>
              </tr>
            </thead>
            <tbody>
              {#each draft.services as service (service.service_key)}
                <tr>
                  <td>
                    <span class="service-name is-{service.service_key}">
                      <WorkspaceServiceIcon service={service.service_key} size={13} />
                      <strong>{t(serviceName(service.service_key))}</strong>
                    </span>
                  </td>
                  <td>
                    <WorkspaceToggle
                      checked={service.booking_enabled}
                      label={service.booking_enabled ? 'Open' : 'Closed'}
                      onchange={(next) => {
                        service.booking_enabled = next;
                        touch();
                      }}
                    />
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
                  <td>
                    <div class="capacity-cell">
                      <WorkspacePicker
                        value={service.capacity_mode}
                        options={capacityOptions}
                        ariaLabel={t('Capacity model')}
                        onchange={(next) => {
                          service.capacity_mode = next === 'covers' ? 'covers' : 'tables';
                          if (service.capacity_mode === 'covers' && service.maximum_covers === null) {
                            service.maximum_covers = Math.max(40, service.maximum_party_size);
                          }
                          touch();
                        }}
                      />
                      <label>
                        <input
                          class="cl-field cover-field"
                          aria-label={t('Service cover limit')}
                          type="number"
                          min={service.maximum_party_size}
                          max="10000"
                          placeholder={service.capacity_mode === 'tables' ? t('No cap') : ''}
                          bind:value={service.maximum_covers}
                          oninput={touch}
                        />
                        <small>{t('covers')}</small>
                      </label>
                    </div>
                  </td>
                  <td>
                    <WorkspacePicker
                      value={service.automatic_confirmation ? 'automatic' : 'manual'}
                      options={confirmationOptions}
                      ariaLabel={t('Confirmation')}
                      onchange={(next) => {
                        service.automatic_confirmation = next === 'automatic';
                        touch();
                      }}
                    />
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {/if}
      {/if}
    {/snippet}
  </WorkspaceTablePanel>
</WorkspacePage>

<style>
  .booking-rule { --service-tone: var(--rst-ui-action); overflow: hidden; border: 1px solid var(--rst-ui-line); border-top: 3px solid var(--service-tone); border-radius: var(--rst-ui-radius-md); background: var(--rst-ui-surface); }
  .booking-rule.is-lunch { --service-tone: var(--cl-lunch); }
  .booking-rule.is-evening { --service-tone: var(--cl-evening); }
  .booking-rule.is-closed { opacity: .7; }
  .booking-rule > header { min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 10px 14px; border-bottom: 1px solid var(--rst-ui-line); background: color-mix(in srgb, var(--service-tone) 5%, var(--rst-ui-surface)); }
  .booking-rule__identity { min-width: 0; display: flex; align-items: center; gap: 10px; }
  .booking-rule__identity > span:first-child { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid color-mix(in srgb, var(--service-tone) 28%, var(--rst-ui-line)); border-radius: 7px; color: var(--service-tone); background: var(--rst-ui-surface); }
  .booking-rule__identity > span:last-child { min-width: 0; display: grid; gap: 2px; }
  .booking-rule__identity strong { font-size: var(--rst-fs-control); }
  .booking-rule__identity small { color: var(--rst-ui-muted); font-size: var(--rst-fs-caption); }
  .booking-rule__steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) 1.2fr .8fr 1fr; }
  .rule-step { position: relative; min-width: 0; min-height: 92px; display: grid; align-content: center; gap: 6px; padding: 14px; border-right: 1px solid var(--rst-ui-line); }
  .rule-step:last-child { border-right: 0; }
  .rule-step > span:first-child { color: var(--rst-ui-muted); font-size: var(--rst-fs-micro); font-weight: var(--rst-fw-bold); }
  .rule-step::before { position: absolute; top: 0; right: 14px; left: 14px; height: 2px; background: linear-gradient(90deg, color-mix(in srgb, var(--service-tone) 34%, transparent), transparent); content: ''; }
  .rule-step :global(.cl-field) { min-width: 0; width: 100%; }
  .rule-step .range-field { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 5px; }

  .setup-error {
    padding: 10px 12px;
    border: 1px solid var(--cl-problem-line);
    border-left: 3px solid var(--cl-problem);
    border-radius: var(--cl-radius);
    background: var(--cl-problem-wash);
    color: var(--cl-problem);
    font-size: var(--rst-fs-control);
  }
  .setup-loading { display: grid; gap: 16px; padding: 24px; }
  .services-grid { min-width: 940px; }
  .services-grid td { height: 54px; }
  .services-grid th:first-child { min-width: 130px; }
  .service-name { display: inline-flex; align-items: center; gap: 8px; }
  .service-name.is-lunch { color: var(--cl-lunch); }
  .service-name.is-evening { color: var(--cl-evening); }
  .service-name > strong { color: var(--cl-ink); }
  td > small { margin-left: 4px; color: var(--cl-muted); font-size: var(--rst-fs-caption); }
  .number-field { width: 62px; text-align: right; font-variant-numeric: tabular-nums; }
  .cover-field { width: 78px; text-align: right; }
  .capacity-cell { min-width: 180px; display: flex; align-items: center; gap: 8px; }
  .capacity-cell > label { display: inline-flex; align-items: center; gap: 4px; }
  .capacity-cell small { color: var(--cl-muted); font-size: var(--rst-fs-micro); }
  .range-field { display: inline-flex; align-items: center; gap: 4px; }
  .range-field i { color: var(--cl-muted); font-style: normal; }
  @media (max-width: 980px) {
    .booking-rule__steps { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .rule-step:nth-child(3n) { border-right: 0; }
    .rule-step:nth-child(-n + 3) { border-bottom: 1px solid var(--rst-ui-line); }
  }
  @media (max-width: 520px) {
    .booking-rule__steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .rule-step:nth-child(3n) { border-right: 1px solid var(--rst-ui-line); }
    .rule-step:nth-child(2n) { border-right: 0; }
    .rule-step:nth-child(-n + 4) { border-bottom: 1px solid var(--rst-ui-line); }
  }
</style>
