<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { useClassicRestaurantContext } from '$lib/classic/classic-workspace-context';
  import ReservationFloorPlansWorkspace from '$lib/reservations/ReservationFloorPlansWorkspace.svelte';

  const readRestaurantContext = useClassicRestaurantContext();
  const context = $derived(readRestaurantContext());
</script>

<svelte:head><title>{t('Venue')} &middot; restogogo</title></svelte:head>

{#if context}
  <ReservationFloorPlansWorkspace mode="venue" restaurantContext={context} />
{/if}
