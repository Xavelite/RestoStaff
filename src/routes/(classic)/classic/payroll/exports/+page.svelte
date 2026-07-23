<script lang="ts">
  import ActionButton from '$lib/components/ActionButton.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import {
    createPayrollExportRun,
    getPayrollExportRun
  } from '$lib/api/mutations';
  import { friendlyError } from '$lib/api/error-messages';
  import { addDays, mondayFor, todayInTimezone } from '$lib/calendar/date';
  import { downloadCsv } from '$lib/export/csv';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';

  const snapshot = $derived(workspace.operations);
  const timezone = $derived(
    workspace.bootstrap?.restaurant_settings.timezone || 'Europe/Brussels'
  );
  const today = $derived(todayInTimezone(timezone, new Date()));

  let createOpen = $state(false);
  let periodStart = $state('');
  let periodEnd = $state('');
  let busy = $state('');

  $effect(() => {
    if (workspace.activeId && workspace.effectiveRole === 'owner') {
      const week = mondayFor(today);
      void workspace.loadOperations(addDays(week, -28), addDays(week, 6)).catch(() => undefined);
    }
  });

  const runs = $derived(
    [...(snapshot?.payroll_export_runs ?? [])].sort((left, right) =>
      right.created_at.localeCompare(left.created_at)
    )
  );

  function openCreate() {
    // Default to the last complete week: the common case, and the only shape
    // the RPC accepts (whole Monday-to-Sunday weeks).
    const lastWeek = addDays(mondayFor(today), -7);
    periodStart = lastWeek;
    periodEnd = addDays(lastWeek, 6);
    createOpen = true;
  }

  async function create() {
    if (!workspace.activeId || busy) return;
    busy = 'create';
    try {
      await createPayrollExportRun({
        restaurantId: workspace.activeId,
        periodStart,
        periodEnd
      });
      await workspace.reloadOperations();
      createOpen = false;
      toasts.show(t('Payroll export created.'), 'success');
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      busy = '';
    }
  }

  async function download(runId: string, filename: string) {
    if (!workspace.activeId || busy) return;
    busy = runId;
    try {
      const run = await getPayrollExportRun(workspace.activeId, runId);
      downloadCsv(filename, run.headers, run.rows);
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    } finally {
      busy = '';
    }
  }

  function stamp(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(i18n.intlLocale, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }
</script>

<svelte:head><title>{t('Exports')} &middot; restogogo</title></svelte:head>

{#snippet pageActions()}
  <button
    class="cl-btn is-primary"
    type="button"
    disabled={workspace.isPreview || workspace.effectiveRole !== 'owner'}
    onclick={openCreate}
  >{t('New export')}</button>
{/snippet}

<ClassicPage title="Payroll" subtitle="Exports" actions={pageActions}>
  <p class="cl-section__note">
    {t('Each export is stored exactly as it was generated, with a checksum, and can be downloaded again.')}
  </p>

  <div class="cl-tablewrap">
    <table class="cl-table">
      <thead>
        <tr>
          <th>{t('Period')}</th>
          <th>{t('Created')}</th>
          <th class="is-num">{t('Rows')}</th>
          <th class="is-num">{t('Net hours')}</th>
          <th>{t('Checksum')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#if !runs.length}
          <tr>
            <td colspan="6">
              <div class="cl-empty">
                <strong>{t('No exports yet')}</strong>
                <span>{t('An export needs every week in the period to be approved first.')}</span>
              </div>
            </td>
          </tr>
        {:else}
          {#each runs as run (run.id)}
            <tr>
              <td>{run.period_start} – {run.period_end}</td>
              <td class="is-quiet">{stamp(run.created_at)}</td>
              <td class="is-num">{run.row_count}</td>
              <td class="is-num">{(run.total_net_minutes / 60).toFixed(1)}</td>
              <td class="is-quiet checksum">{run.payload_sha256.slice(0, 12)}…</td>
              <td class="is-num">
                <button
                  class="cl-btn"
                  type="button"
                  disabled={busy === run.id}
                  onclick={() => download(run.id, run.filename)}
                >{t('Download')}</button>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</ClassicPage>

{#snippet createFooter()}
  <ActionButton label={t('Cancel')} disabled={Boolean(busy)} onclick={() => (createOpen = false)} />
  <ActionButton
    label={busy === 'create' ? t('Saving…') : t('Create export')}
    tone="primary"
    disabled={Boolean(busy)}
    onclick={create}
  />
{/snippet}

<Dialog
  open={createOpen}
  title={t('New export')}
  description={t('Whole Monday-to-Sunday weeks only, and every week must already be approved.')}
  size="small"
  onclose={() => !busy && (createOpen = false)}
  footer={createFooter}
>
  <div class="form">
    <label class="cl-label">
      <span>{t('From')}</span>
      <input class="cl-field" type="date" bind:value={periodStart} />
    </label>
    <label class="cl-label">
      <span>{t('To')}</span>
      <input class="cl-field" type="date" bind:value={periodEnd} />
    </label>
  </div>
</Dialog>

<style>
  .checksum {
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 13px;
  }
  .form {
    display: grid;
    gap: 14px;
  }
</style>

