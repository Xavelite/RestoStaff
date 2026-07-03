<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/auth/session.svelte';

  // Entry point: send people into the app or to login once auth has resolved.
  $effect(() => {
    if (auth.ready) goto(auth.session ? '/home' : '/login', { replaceState: true });
  });
</script>
