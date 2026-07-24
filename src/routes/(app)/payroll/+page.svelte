<script lang="ts">
  import { todayInTimezone } from '$lib/calendar/date';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import PayrollWorkspace from '$lib/payroll/PayrollWorkspace.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  const timezone = $derived(
    workspace.bootstrap?.restaurant_settings.timezone || 'Europe/Brussels'
  );
  const initialDate = $derived(todayInTimezone(timezone));
  let month = $state('');

  $effect(() => {
    if (!month && initialDate) month = initialDate.slice(0, 7);
  });

  $effect(() => {
    if (workspace.activeId && workspace.effectiveRole === 'owner') {
      void workspace.loadTeam().catch(() => undefined);
    }
  });
</script>

<svelte:head><title>{t('Payroll')} &middot; restogogo</title></svelte:head>

{#snippet pageActions()}
  <label class="cl-label month-field">
    <span>{t('Payroll month')}</span>
    <input class="cl-field" type="month" bind:value={month} />
  </label>
{/snippet}

<ClassicPage actions={pageActions}>
  {#if workspace.activeId}
    <PayrollWorkspace
      restaurantId={workspace.activeId}
      employees={workspace.team?.employees ?? []}
      {initialDate}
      locale={i18n.intlLocale}
      bind:month
    />
  {/if}
</ClassicPage>

<style>
  .month-field {
    min-width: 190px;
  }
  .month-field > span {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
