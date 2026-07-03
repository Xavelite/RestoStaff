<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { supabase } from '$lib/supabase/client';
  import { auth } from '$lib/auth/session.svelte';

  let email = $state('');
  let password = $state('');
  let errorMessage = $state('');
  let loading = $state(false);
  let resetSent = $state(false);
  let mode = $state<'signin' | 'signup'>('signin');
  const next = $derived(
    page.url.searchParams.get('next')?.startsWith('/')
      ? page.url.searchParams.get('next')!
      : '/home'
  );
  const pageTitle = $derived(mode === 'signin' ? 'Sign in' : 'Create owner account');
  const pageDescription = $derived(
    mode === 'signin'
      ? 'Restaurant operations, in one calm workspace.'
      : 'Create the owner account first. Restaurant setup continues after sign-up.'
  );

  // Already signed in? Skip the login screen.
  $effect(() => {
    if (auth.session) goto(mode === 'signup' ? '/onboarding' : next, { replaceState: true });
  });

  async function signIn(event: SubmitEvent) {
    event.preventDefault();
    errorMessage = '';
    loading = true;
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${location.origin}/onboarding` }
          });
    loading = false;
    if (error) {
      errorMessage = error.message;
      return;
    }
    if (mode === 'signup' && !data.session) {
      errorMessage = 'Check your email to confirm the account, then continue onboarding.';
      return;
    }
    await goto(mode === 'signup' ? '/onboarding' : next);
  }

  async function requestReset() {
    errorMessage = '';
    resetSent = false;
    if (!email.trim()) {
      errorMessage = 'Enter your email address first.';
      return;
    }
    loading = true;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/reset-password`
    });
    loading = false;
    if (error) {
      errorMessage = error.message;
      return;
    }
    resetSent = true;
  }
</script>

<svelte:head>
  <title>{pageTitle} · restogogo</title>
  <meta
    name="description"
    content={mode === 'signin'
      ? 'Sign in to the restogogo restaurant operations workspace.'
      : 'Create the owner account for a new restogogo restaurant workspace.'}
  />
</svelte:head>

<main class="login">
  <form class="login__card" onsubmit={signIn}>
    <header class="login__head">
      <h1 class="login__title">restogogo</h1>
      <p class="login__subtitle">{pageDescription}</p>
    </header>

    <label class="field">
      <span class="field__label">Email address</span>
      <input
        class="field__input"
        type="email"
        bind:value={email}
        autocomplete="username"
        placeholder="you@restaurant.com"
        required
      />
    </label>

    <label class="field">
      <span class="field__label">Password</span>
      <input
        class="field__input"
        type="password"
        bind:value={password}
        autocomplete={mode === 'signin' ? 'current-password' : 'new-password'}
        placeholder={mode === 'signin' ? 'Your password' : 'Choose a password'}
        required
      />
    </label>

    {#if errorMessage}
      <p class="login__error" role="alert">{errorMessage}</p>
    {/if}
    {#if resetSent}
      <p class="login__success" role="status">Password reset email sent.</p>
    {/if}

    <button class="login__submit" type="submit" disabled={loading}>
      {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create owner account'}
    </button>
    <button
      class="login__switch"
      type="button"
      onclick={() => {
        mode = mode === 'signin' ? 'signup' : 'signin';
        errorMessage = '';
      }}
    >
      {mode === 'signin'
        ? 'Create owner account for a new workspace'
        : 'I already have an account'}
    </button>
    {#if mode === 'signin'}
      <button class="login__switch" type="button" disabled={loading} onclick={requestReset}>
        Forgot password?
      </button>
    {/if}
  </form>
</main>

<style>
  .login {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .login__card {
    width: min(400px, 100%);
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 32px;
    background: var(--rst-ui-panel);
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-xl);
  }
  .login__head {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .login__title {
    margin: 0;
    font-size: 28px;
    font-weight: var(--rst-fw-display);
  }
  .login__subtitle {
    margin: 0;
    color: var(--rst-ui-muted);
    font-size: 14px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field__label {
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    color: var(--rst-ui-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .field__input {
    padding: 12px 14px;
    background: var(--rst-ui-surface-field-strong);
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    color: var(--rst-ui-text);
    font: inherit;
  }
  .field__input:focus {
    outline: none;
    border-color: var(--rst-ui-action);
    box-shadow: var(--rst-ui-focus);
  }
  .login__error {
    margin: 0;
    color: var(--rst-state-danger-text);
    font-size: 13px;
  }
  .login__success {
    margin: 0;
    color: var(--rst-state-success-text);
    font-size: 13px;
  }
  .login__submit {
    margin-top: 4px;
    padding: 12px 16px;
    background: var(--rst-ui-action);
    color: var(--rst-on-accent-text);
    border: 0;
    border-radius: var(--rst-ui-radius-md);
    font: inherit;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .login__submit:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .login__switch {
    border: 0;
    color: var(--rst-ui-panel-title);
    background: transparent;
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
</style>
