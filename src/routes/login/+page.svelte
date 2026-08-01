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
  /* Sign-in is the product's first impression, so it uses the same palette,
     radii and type scale as the workspace behind it rather than the old dark
     marketing screen it inherited — that one rendered its own wordmark and
     heading in dark blue on charcoal once the shared tokens arrived. */
  .login {
    min-height: 100vh;
    min-height: 100svh;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--cl-bg, var(--rst-ui-bg));
  }

  .login__card {
    width: min(410px, 100%);
    display: grid;
    gap: 16px;
    padding: 28px 28px 24px;
    border: 1px solid var(--cl-line, var(--rst-ui-line));
    border-radius: 18px;
    background: var(--cl-surface, var(--rst-ui-surface-panel));
    box-shadow: 0 20px 50px rgba(15, 23, 42, .10), 0 2px 6px rgba(15, 23, 42, .04);
  }

  .login__head { display: grid; gap: 14px; }

  .login__brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--cl-ink, var(--rst-ui-text));
    font-size: var(--rst-fs-title);
    font-weight: var(--rst-fw-display);
    letter-spacing: -.01em;
    text-decoration: none;
  }

  /* The wordmark is two <i> elements only so the two halves can carry different
     colour — it is not emphasis, so the browser's italic and link underline
     have to be turned off explicitly. */
  .login__brand b { font-weight: inherit; }
  .login__brand i { font-style: normal; }
  .login__brand i:last-child { color: var(--cl-accent, var(--rst-ui-action)); }

  .login__intro { display: grid; gap: 4px; }

  .login__title {
    margin: 0;
    color: var(--cl-ink, var(--rst-ui-text));
    font-size: var(--rst-fs-title-lg);
    font-weight: var(--rst-fw-display);
    letter-spacing: -.01em;
  }

  .login__subtitle {
    margin: 0;
    color: var(--cl-muted, var(--rst-ui-muted));
    font-size: var(--rst-fs-body);
    line-height: 1.5;
  }

  .field { display: grid; gap: 5px; }

  .field__label {
    color: var(--cl-muted, var(--rst-ui-muted));
    font-size: var(--rst-fs-micro);
    font-weight: var(--rst-fw-bold);
    letter-spacing: .04em;
    text-transform: uppercase;
  }

  .field__input {
    min-height: 42px;
    padding: 10px 12px;
    border: 1px solid var(--cl-line, var(--rst-ui-line));
    border-radius: 10px;
    color: var(--cl-ink, var(--rst-ui-text));
    background: var(--cl-surface-muted, var(--rst-ui-surface-field));
    font: inherit;
    font-size: var(--rst-fs-body);
  }

  .field__input:focus {
    border-color: var(--cl-accent, var(--rst-ui-action));
    background: var(--cl-surface, var(--rst-ui-surface-panel));
    outline: 2px solid color-mix(in srgb, var(--cl-accent, var(--rst-ui-action)) 22%, transparent);
    outline-offset: 1px;
  }

  .login__submit {
    min-height: 44px;
    margin-top: 2px;
    border: 0;
    border-radius: 10px;
    color: var(--rst-on-accent-text, #fff);
    background: var(--cl-accent, var(--rst-ui-action));
    font: inherit;
    font-size: var(--rst-fs-body);
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
    transition: background .16s ease, transform .16s ease;
  }

  .login__submit:hover:not(:disabled) { background: var(--cl-accent-hover, var(--cl-accent)); }
  .login__submit:disabled { opacity: .55; cursor: default; }

  .login__switch {
    padding: 4px;
    border: 0;
    border-radius: 8px;
    color: var(--cl-muted, var(--rst-ui-muted));
    background: transparent;
    font: inherit;
    font-size: var(--rst-fs-caption);
    font-weight: var(--rst-fw-medium);
    cursor: pointer;
  }

  .login__switch:hover:not(:disabled) { color: var(--cl-accent, var(--rst-ui-action)); }
  .login__switch:disabled { opacity: .5; cursor: default; }

  .login__error,
  .login__success {
    margin: 0;
    padding: 9px 11px;
    border-radius: 9px;
    font-size: var(--rst-fs-caption);
    line-height: 1.45;
  }

  .login__error {
    color: var(--rst-state-danger-text, #b3261e);
    background: color-mix(in srgb, var(--rst-state-danger, #d33) 11%, transparent);
  }

  .login__success {
    color: var(--cl-ok, #157f4b);
    background: color-mix(in srgb, var(--cl-ok, #157f4b) 12%, transparent);
  }

  @media (max-width: 520px) {
    .login { padding: 16px; }
    .login__card { padding: 22px 20px 20px; }
  }
</style>
