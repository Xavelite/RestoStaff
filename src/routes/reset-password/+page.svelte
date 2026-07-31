<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/auth/session.svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import { supabase } from '$lib/supabase/client';

  let password = $state('');
  let confirmation = $state('');
  let saving = $state(false);
  let feedback = $state('');
  let feedbackTone = $state<'info' | 'success' | 'warning' | 'danger'>('info');

  async function save() {
    if (!auth.session) {
      feedback = 'Open this page from the password reset email.';
      feedbackTone = 'warning';
      return;
    }
    if (password.length < 8 || password !== confirmation) {
      feedback = 'Enter and confirm a password of at least eight characters.';
      feedbackTone = 'warning';
      return;
    }
    saving = true;
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      feedback = 'Password updated.';
      feedbackTone = 'success';
      await goto('/home');
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>Reset password · restogogo</title></svelte:head>

<main>
  <form onsubmit={(event) => { event.preventDefault(); save(); }}>
    <p class="brand">restogogo</p>
    <h1>Choose a new password</h1>
    <p class="intro">Use at least eight characters. Your badge PIN remains separate.</p>
    <FeedbackBanner message={feedback} tone={feedbackTone} />
    <label><span>New password</span><input required minlength="8" type="password" autocomplete="new-password" bind:value={password} /></label>
    <label><span>Confirm password</span><input required minlength="8" type="password" autocomplete="new-password" bind:value={confirmation} /></label>
    <ActionButton type="submit" tone="primary" label={saving ? 'Saving…' : 'Save password'} disabled={saving} />
  </form>
</main>

<style>
  main { min-height: 100vh; display: grid; place-items: center; padding: 22px; }
  form { width: min(100%, 440px); display: grid; gap: 13px; padding: 24px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-xl); background: var(--rst-ui-surface-panel); }
  .brand { margin: 0 0 8px; color: var(--rst-ui-panel-title); font-weight: var(--rst-fw-display); }
  h1 { margin: 0; font-size: var(--rst-fs-display-sm); }
  .intro { margin: -5px 0 5px; color: var(--rst-ui-muted); line-height: 1.5; }
  label { display: grid; gap: 6px; color: var(--rst-ui-muted); font-size: var(--rst-fs-label); font-weight: var(--rst-fw-bold); }
  input { min-height: 44px; padding: 10px 12px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); font: inherit; }
</style>
