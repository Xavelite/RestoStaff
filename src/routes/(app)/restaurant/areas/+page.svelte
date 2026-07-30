<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import OperationalAreasWorkspace from '$lib/restaurant/OperationalAreasWorkspace.svelte';
</script>

<svelte:head><title>{t('Areas')} &middot; restogogo</title></svelte:head>

<OperationalAreasWorkspace />
