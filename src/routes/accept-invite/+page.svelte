<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    acceptEmployeeInvite,
    getEmployeeInvitationContext,
    type EmployeeInvitationContext
  } from '$lib/api/mutations';
  import { auth } from '$lib/auth/session.svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import { supabase } from '$lib/supabase/client';
  import { workspace } from '$lib/workspace/workspace.svelte';

  let pin = $state('');
  let confirmation = $state('');
  let password = $state('');
  let passwordConfirmation = $state('');
  let saving = $state(false);
  let contextLoading = $state(false);
  let context = $state<EmployeeInvitationContext | null>(null);
  let loadedContextKey = $state('');
  let feedback = $state('');
  let feedbackTone = $state<'info' | 'success' | 'warning' | 'danger'>('info');
  const restaurantId = $derived(page.url.searchParams.get('restaurant') ?? '');
  const invitationToken = $derived(page.url.searchParams.get('invitation') ?? '');

  $effect(() => {
    const key =
      auth.session && restaurantId && invitationToken
        ? `${auth.session.user.id}:${restaurantId}:${invitationToken}`
        : '';
    if (!key || key === loadedContextKey) return;

    loadedContextKey = key;
    contextLoading = true;
    context = null;
    getEmployeeInvitationContext(restaurantId, invitationToken)
      .then((value) => {
        context = value;
        feedback = '';
      })
      .catch((error) => {
        feedback = error instanceof Error ? error.message : String(error);
        feedbackTone = 'danger';
      })
      .finally(() => {
        contextLoading = false;
      });
  });

  async function accept() {
    if (!auth.session) {
      feedback = 'Open the invitation link after signing in with the invited account.';
      feedbackTone = 'warning';
      return;
    }
    if (!restaurantId || !invitationToken) {
      feedback = 'This invitation link is incomplete. Ask your manager to resend it.';
      feedbackTone = 'danger';
      return;
    }
    if (!context) {
      feedback = 'The invitation must be verified before it can be accepted.';
      feedbackTone = 'warning';
      return;
    }
    if (password.length < 8 || password !== passwordConfirmation) {
      feedback = 'Enter and confirm an app password of at least eight characters.';
      feedbackTone = 'warning';
      return;
    }
    if (!/^\d{4}$/.test(pin) || pin !== confirmation) {
      feedback = 'Enter and confirm the same four-digit badge PIN.';
      feedbackTone = 'warning';
      return;
    }

    saving = true;
    try {
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;
      await acceptEmployeeInvite(restaurantId, invitationToken, pin);
      workspace.reset();
      await workspace.load();
      feedback = 'Invitation accepted. Your workspace is ready.';
      feedbackTone = 'success';
      await goto('/my-service');
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>Accept invitation · restogogo</title></svelte:head>

<main>
  <section>
    <p class="brand">restogogo</p>
    <h1>Finish your invitation</h1>
    <p class="intro">
      Your app account uses email and password. Choose a separate PIN only for
      badge-terminal actions.
    </p>
    <FeedbackBanner message={feedback} tone={feedbackTone} />

    {#if !auth.session}
      <a
        class="login"
        href={`/login?next=${encodeURIComponent(page.url.pathname + page.url.search)}`}
      >
        Sign in with the invited account
      </a>
    {:else if contextLoading}
      <p class="intro" role="status">Verifying your invitation…</p>
    {:else if context}
      <div class="context">
        <strong>{context.restaurantName}</strong>
        <span>{context.employeeName} · {context.role}</span>
        <small>Invitation expires {new Date(context.expiresAt).toLocaleString()}</small>
      </div>
      <form onsubmit={(event) => { event.preventDefault(); accept(); }}>
        <label>
          <span>App password</span>
          <input
            required
            type="password"
            minlength="8"
            autocomplete="new-password"
            bind:value={password}
          />
        </label>
        <label>
          <span>Confirm app password</span>
          <input
            required
            type="password"
            minlength="8"
            autocomplete="new-password"
            bind:value={passwordConfirmation}
          />
        </label>
        <label>
          <span>Four-digit badge PIN</span>
          <input
            required
            type="password"
            inputmode="numeric"
            maxlength="4"
            bind:value={pin}
          />
        </label>
        <label>
          <span>Confirm PIN</span>
          <input
            required
            type="password"
            inputmode="numeric"
            maxlength="4"
            bind:value={confirmation}
          />
        </label>
        <ActionButton
          type="submit"
          tone="primary"
          label={saving ? 'Activating…' : 'Accept invitation'}
          disabled={saving}
        />
      </form>
    {:else}
      <button class="login" type="button" onclick={() => auth.signOut()}>
        Sign in with another account
      </button>
    {/if}
  </section>
</main>

<style>
  main { min-height: 100vh; display: grid; place-items: center; padding: 22px; }
  section { width: min(100%, 460px); padding: 24px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-xl); background: var(--rst-ui-surface-panel); }
  .brand { margin: 0 0 22px; color: var(--rst-ui-panel-title); font-weight: var(--rst-fw-display); }
  h1 { margin: 0; font-size: 28px; }
  .intro { margin: 8px 0 18px; color: var(--rst-ui-muted); line-height: 1.55; }
  .context { display: grid; gap: 3px; margin: 0 0 18px; padding: 12px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); background: var(--rst-ui-surface-field); }
  .context span, .context small { color: var(--rst-ui-muted); }
  form { display: grid; gap: 13px; }
  label { display: grid; gap: 6px; color: var(--rst-ui-muted); font-size: 11px; font-weight: var(--rst-fw-bold); }
  input { min-height: 44px; padding: 10px 12px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); font: inherit; letter-spacing: .24em; }
  .login { display: block; width: 100%; padding: 11px 14px; border: 0; border-radius: var(--rst-ui-radius-md); color: var(--rst-on-accent-text); background: var(--rst-ui-action); font: inherit; font-weight: var(--rst-fw-bold); text-align: center; text-decoration: none; cursor: pointer; }
</style>
