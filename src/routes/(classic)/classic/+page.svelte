<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  // /classic is the design, not a page: send it to the portal.
  onMount(() => {
    void goto('/classic/home', { replaceState: true });
  });
</script>
