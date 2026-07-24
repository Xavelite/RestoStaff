<script lang="ts">
  import { todayInTimezone } from '$lib/calendar/date';
  import { t } from '$lib/i18n/i18n.svelte';
  import ClassicPage from '$lib/classic/ClassicPage.svelte';
  import RestaurantPayrollSetup from '$lib/payroll/RestaurantPayrollSetup.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';

  const timezone = $derived(
    workspace.bootstrap?.restaurant_settings.timezone || 'Europe/Brussels'
  );
  const effectiveDate = $derived(todayInTimezone(timezone));
</script>

<svelte:head><title>{t('Payroll configuration')} &middot; restogogo</title></svelte:head>

<ClassicPage>
  {#if workspace.activeId}
    <RestaurantPayrollSetup restaurantId={workspace.activeId} {effectiveDate} />
  {/if}
</ClassicPage>
