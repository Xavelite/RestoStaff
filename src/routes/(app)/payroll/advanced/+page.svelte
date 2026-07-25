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

<svelte:head><title>{t('Experimental payroll engine')} &middot; restogogo</title></svelte:head>

<ClassicPage>
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
