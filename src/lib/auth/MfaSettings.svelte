<script lang="ts">
  import { onMount } from 'svelte';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { supabase } from '$lib/supabase/client';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { toasts } from '$lib/ui/toast.svelte';

  type TotpFactor = {
    id: string;
    friendly_name?: string;
    status: 'verified' | 'unverified';
  };

  let factors = $state<TotpFactor[]>([]);
  let currentLevel = $state<string | null>(null);
  let nextLevel = $state<string | null>(null);
  let loading = $state(true);
  let busy = $state(false);
  let factorId = $state('');
  let qrCode = $state('');
  let secret = $state('');
  let verificationCode = $state('');

  const verifiedFactors = $derived(
    factors.filter((factor) => factor.status === 'verified')
  );

  onMount(() => {
    void load();
  });

  async function load(): Promise<void> {
    loading = true;
    try {
      const [factorResult, assuranceResult] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      ]);
      if (factorResult.error) throw factorResult.error;
      if (assuranceResult.error) throw assuranceResult.error;
      factors = factorResult.data.totp as TotpFactor[];
      currentLevel = assuranceResult.data.currentLevel;
      nextLevel = assuranceResult.data.nextLevel;
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      loading = false;
    }
  }

  async function beginEnrollment(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Restogogo authenticator'
      });
      if (error) throw error;
      factorId = data.id;
      qrCode = data.totp.qr_code;
      secret = data.totp.secret;
      verificationCode = '';
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      busy = false;
    }
  }

  async function verifyEnrollment(): Promise<void> {
    if (busy || !factorId || !/^\d{6}$/.test(verificationCode)) return;
    busy = true;
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: verificationCode
      });
      if (error) throw error;
      factorId = '';
      qrCode = '';
      secret = '';
      verificationCode = '';
      await load();
      toasts.show(t('Two-step verification is active.'), 'success');
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      busy = false;
    }
  }

  async function verifyExisting(factor: TotpFactor): Promise<void> {
    if (busy || !/^\d{6}$/.test(verificationCode)) return;
    busy = true;
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: verificationCode
      });
      if (error) throw error;
      verificationCode = '';
      await load();
      toasts.show(t('Sensitive access unlocked for this session.'), 'success');
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      busy = false;
    }
  }

  async function removeFactor(factor: TotpFactor): Promise<void> {
    const confirmed = await confirmAction({
      title: t('Remove two-step verification?'),
      body: t('Your account will lose its authenticator protection.'),
      confirmLabel: t('Remove protection'),
      tone: 'danger'
    });
    if (!confirmed) return;
    busy = true;
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
      verificationCode = '';
      await load();
      toasts.show(t('Two-step verification removed.'), 'success');
    } catch (error) {
      toasts.show(error instanceof Error ? error.message : String(error), 'danger');
    } finally {
      busy = false;
    }
  }
</script>

<section class="mfa-settings" aria-label={t('Account security')}>
  <header>
    <div>
      <strong>{t('Two-step verification')}</strong>
      <small>{t('Protect owner, payroll and platform administration with an authenticator app.')}</small>
    </div>
    {#if !loading}
      <span class:is-active={currentLevel === 'aal2'}>
        {t(currentLevel === 'aal2' ? 'Verified session' : verifiedFactors.length ? 'Verification required' : 'Not enabled')}
      </span>
    {/if}
  </header>

  {#if loading}
    <p>{t('Checking account security...')}</p>
  {:else if factorId}
    <div class="enrollment">
      <img src={qrCode} alt={t('Authenticator QR code')} width="156" height="156" />
      <div>
        <strong>{t('Scan with your authenticator app')}</strong>
        <small>{t('Or enter this setup key manually:')}</small>
        <code>{secret}</code>
        <label>
          <span>{t('Six-digit code')}</span>
          <input
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            bind:value={verificationCode}
          />
        </label>
        <div class="actions">
          <ActionButton
            label={t('Cancel')}
            disabled={busy}
            onclick={() => {
              factorId = '';
              qrCode = '';
              secret = '';
              verificationCode = '';
            }}
          />
          <ActionButton
            label={t('Verify and activate')}
            tone="primary"
            disabled={busy || !/^\d{6}$/.test(verificationCode)}
            onclick={verifyEnrollment}
          />
        </div>
      </div>
    </div>
  {:else if verifiedFactors.length}
    <div class="verified">
      <div>
        <strong>{t('Authenticator connected')}</strong>
        <small>{t(currentLevel === 'aal2'
          ? 'Sensitive access is unlocked for this session.'
          : 'Enter a fresh code before opening platform administration.')}</small>
      </div>
      {#if currentLevel !== 'aal2' && nextLevel === 'aal2'}
        <label>
          <span>{t('Six-digit code')}</span>
          <input
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            bind:value={verificationCode}
          />
        </label>
        <ActionButton
          label={t('Unlock sensitive access')}
          tone="primary"
          disabled={busy || !/^\d{6}$/.test(verificationCode)}
          onclick={() => verifyExisting(verifiedFactors[0])}
        />
      {/if}
      <ActionButton
        label={t('Remove')}
        tone="danger"
        disabled={busy}
        onclick={() => removeFactor(verifiedFactors[0])}
      />
    </div>
  {:else}
    <div class="available">
      <span>{t('Use Google Authenticator, Microsoft Authenticator, 1Password or another TOTP app.')}</span>
      <ActionButton
        label={t('Set up authenticator')}
        tone="primary"
        disabled={busy}
        onclick={beginEnrollment}
      />
    </div>
  {/if}
</section>

<style>
  .mfa-settings {
    display: grid;
    gap: 12px;
    padding: 13px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface-muted);
  }
  header,
  .available,
  .verified {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  header > div,
  .verified > div {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 3px;
  }
  strong { color: var(--cl-ink); font-size: 11.5px; }
  small,
  p,
  .available > span {
    margin: 0;
    color: var(--cl-muted);
    font-size: 10px;
    line-height: 1.45;
  }
  header > span {
    flex: none;
    padding: 3px 7px;
    border: 1px solid var(--cl-line);
    border-radius: 999px;
    color: var(--cl-muted);
    background: var(--cl-surface);
    font-size: 9px;
    font-weight: var(--rst-fw-bold);
  }
  header > span.is-active {
    border-color: var(--cl-ok-line);
    color: var(--cl-ok);
    background: var(--cl-ok-wash);
  }
  .available { justify-content: space-between; }
  .enrollment {
    display: grid;
    grid-template-columns: 156px minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }
  .enrollment img {
    border: 8px solid #fff;
    border-radius: 4px;
  }
  .enrollment > div,
  .enrollment label,
  .verified label {
    display: grid;
    gap: 6px;
  }
  code {
    overflow-wrap: anywhere;
    color: var(--cl-ink);
    font-size: 9px;
  }
  label span {
    color: var(--cl-muted);
    font-size: 9.5px;
    font-weight: var(--rst-fw-bold);
  }
  input {
    width: 126px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
    color: var(--cl-ink);
    font: inherit;
    letter-spacing: 2px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
  @media (max-width: 520px) {
    header,
    .available,
    .verified {
      align-items: stretch;
      flex-direction: column;
    }
    header > span { align-self: flex-start; }
    .enrollment { grid-template-columns: 1fr; }
  }
</style>
