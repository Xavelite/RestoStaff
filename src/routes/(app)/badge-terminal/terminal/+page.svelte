<script lang="ts">
  import BadgeTerminal from '$lib/badge/BadgeTerminal.svelte';
  import { createManagerBadgeApi } from '$lib/badge/badge-api';
  import { t } from '$lib/i18n/i18n.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
  import { kiosk } from '$lib/kiosk/kiosk.svelte';
  import { restaurantLogoUrl } from '$lib/restaurant/logo-api';

  const api = $derived(workspace.activeId ? createManagerBadgeApi(workspace.activeId) : null);
  const timezone = $derived(
    workspace.bootstrap?.restaurant_settings.timezone || 'Europe/Brussels'
  );
  const logoUrl = $derived(restaurantLogoUrl(workspace.bootstrap?.restaurant.logo_path));

  async function onbadged() {
    if (!workspace.activeId) return;
    await Promise.allSettled([
      workspace.reloadOperations(),
      workspaceRealtime.publish('actuals-updated', {
        restaurantId: workspace.activeId,
        source: 'badge'
      })
    ]);
  }
</script>

<svelte:head><title>{t('Badge')} &middot; restogogo</title></svelte:head>

{#if api}
  <BadgeTerminal
    {api}
    restaurantName={workspace.active?.restaurant_name ?? ''}
    {logoUrl}
    {timezone}
    {onbadged}
  >
    {#snippet headerAction()}
      {#if !kiosk.locked}
        <a href="/home" aria-label={t('Close terminal')} title={t('Close terminal')}>&times;</a>
      {/if}
    {/snippet}
  </BadgeTerminal>
{/if}
