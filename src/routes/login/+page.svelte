<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { supabase } from '$lib/supabase/client';
  import { auth } from '$lib/auth/session.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { roleHome, type RoleHome } from '$lib/workspace/workspace-selection';

  let email = $state('');
  let password = $state('');
  let errorMessage = $state('');
  let loading = $state(false);
  let resetSent = $state(false);
  let mode = $state<'signin' | 'signup'>(
    new URLSearchParams(location.search).get('mode') === 'signup' ? 'signup' : 'signin'
  );
  let redirecting = $state(false);
  const next = $derived(
    normalizeNext(page.url.searchParams.get('next'))
  );
  const pageTitle = $derived(mode === 'signin' ? 'Sign in' : 'Create owner account');
  const pageDescription = $derived(
    mode === 'signin'
      ? 'Access your restaurant workspace.'
      : 'Create the owner account first. Restaurant setup continues after sign-up.'
  );

  function normalizeNext(value: string | null): string {
    if (!value || !value.startsWith('/') || value.startsWith('//')) return '/home';
    try {
      const url = new URL(value, location.origin);
      if (url.origin !== location.origin) return '/home';
      if (url.pathname === '/login') return '/home';
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return '/home';
    }
  }

  function roleSafeNext(target: string, fallback: RoleHome): string {
    const pathname = new URL(target, location.origin).pathname;
    const employeeRoute = pathname === '/my-service' || pathname === '/my-time';
    if (fallback === '/my-service') {
      return employeeRoute ? target : fallback;
    }
    if (employeeRoute) return fallback;
    return target;
  }

  async function signedInDestination(forceOnboarding = false): Promise<string> {
    if (forceOnboarding) return '/onboarding';
    if (!workspace.loaded && !workspace.loading) {
      await workspace.load().catch(() => undefined);
    }
    const fallback = workspace.active ? roleHome(workspace.active.role) : '/home';
    return roleSafeNext(next, fallback);
  }

  // Already signed in? Skip the login screen without bouncing through a route the
  // active role cannot use.
  $effect(() => {
    if (!auth.session || redirecting) return;
    redirecting = true;
    void signedInDestination(mode === 'signup')
      .then((target) => goto(target, { replaceState: true }))
      .finally(() => {
        redirecting = false;
      });
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
    await goto(await signedInDestination(mode === 'signup'));
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
      <a class="login__brand" href="/" aria-label="restogogo home">
        <img src="/brand/restogogo-mark.png" alt="" width="46" height="46" />
        <b aria-hidden="true"><i>esto</i><i>gogo</i></b>
      </a>
      <div class="login__intro">
        <h1 class="login__title">{pageTitle}</h1>
        <p class="login__subtitle">{pageDescription}</p>
      </div>
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
    min-height: 100svh;
    display: grid;
    place-items: center;
    padding: clamp(20px, 5vw, 64px);
    color: var(--rst-command-text);
    background:
      linear-gradient(110deg, rgba(15, 17, 20, .94), rgba(20, 17, 15, .72)),
      url('/module-backgrounds/home.webp') center / cover no-repeat;
  }
  .login__card {
    width: min(440px, 100%);
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: clamp(26px, 5vw, 42px);
    border: 1px solid rgba(255, 250, 242, .14);
    border-radius: var(--rst-ui-radius-xl);
    background: rgba(24, 25, 27, .9);
    box-shadow: 0 28px 80px rgba(0, 0, 0, .36);
    backdrop-filter: blur(14px);
  }
  .login__head {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .login__brand {
    width: fit-content;
    display: inline-flex;
    align-items: center;
    gap: 0;
    color: var(--rst-command-text);
    text-decoration: none;
  }
  .login__brand img {
    width: 46px;
    height: 46px;
    display: block;
  }
  .login__brand b {
    display: inline-flex;
    align-items: baseline;
    font-size: var(--rst-fs-display-sm);
    font-weight: var(--rst-fw-display);
    letter-spacing: 0;
  }
  .login__brand i { color: var(--rst-ui-action); font-style: normal; }
  .login__brand i + i { color: var(--rst-command-text); }
  .login__intro { display: grid; gap: 4px; }
  .login__title {
    margin: 0;
    color: var(--rst-command-text);
    font-size: var(--rst-fs-display-sm);
    font-weight: var(--rst-fw-display);
  }
  .login__subtitle {
    margin: 0;
    color: rgba(255, 250, 242, .7);
    font-size: var(--rst-fs-body-lg);
    line-height: 1.5;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field__label {
    font-size: var(--rst-fs-control);
    font-weight: var(--rst-fw-bold);
    color: rgba(255, 250, 242, .72);
    text-transform: uppercase;
    letter-spacing: 0;
  }
  .field__input {
    padding: 12px 14px;
    background: rgba(255, 250, 242, .96);
    border: 1px solid rgba(255, 250, 242, .2);
    border-radius: var(--rst-ui-radius-md);
    color: #1f160f;
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
    font-size: var(--rst-fs-body);
  }
  .login__success {
    margin: 0;
    color: var(--rst-state-success-text);
    font-size: var(--rst-fs-body);
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
    color: rgba(255, 250, 242, .76);
    background: transparent;
    font: inherit;
    font-size: var(--rst-fs-control);
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
  }
  .login__switch:hover:not(:disabled) {
    color: var(--rst-command-text);
  }
  .login__switch:disabled {
    opacity: .55;
    cursor: default;
  }

  @media (max-width: 520px) {
    .login {
      padding: 16px;
    }
    .login__card {
      padding: 26px 22px;
    }
  }
</style>
