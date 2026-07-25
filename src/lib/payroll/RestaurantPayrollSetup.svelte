<script lang="ts">
  import { onMount } from 'svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import ClassicTablePanel from '$lib/classic/ClassicTablePanel.svelte';
  import ClassicStatus from '$lib/classic/ClassicStatus.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import {
    getPayrollCatalogue,
    saveRestaurantPayrollConfiguration,
    validateRestaurantPayrollConfiguration
  } from './payroll-api';
  import type { PayrollCatalogue } from './payroll-model';

  let {
    restaurantId,
    effectiveDate
  }: { restaurantId: string; effectiveDate: string } = $props();

  let catalogue = $state<PayrollCatalogue | null>(null);
  let loadedRestaurantId = $state('');
  let busy = $state(false);
  let feedback = $state('');
  let feedbackTone = $state<'success' | 'danger' | 'info'>('info');
  let validFrom = $state('');
  let ruleSetId = $state('');
  let weeklyHours = $state('38');
  let dailyLimitHours = $state('');
  let referencePeriodWeeks = $state('13');
  let gksStatus = $state<'unknown' | 'yes' | 'no'>('unknown');
  let employerCategoryCode = $state('');
  let withholdingMode = $state<'not_configured' | 'manual_estimate' | 'official_formula'>('not_configured');

  type SetupDraft = {
    validFrom: string;
    ruleSetId: string;
    weeklyHours: string;
    dailyLimitHours: string;
    referencePeriodWeeks: string;
    gksStatus: 'unknown' | 'yes' | 'no';
    employerCategoryCode: string;
    withholdingMode: 'not_configured' | 'manual_estimate' | 'official_formula';
  };

  let baseline = $state<SetupDraft | null>(null);

  function currentDraft(): SetupDraft {
    return {
      validFrom,
      ruleSetId,
      weeklyHours,
      dailyLimitHours,
      referencePeriodWeeks,
      gksStatus,
      employerCategoryCode,
      withholdingMode
    };
  }

  function restoreDraft(value: SetupDraft): void {
    validFrom = value.validFrom;
    ruleSetId = value.ruleSetId;
    weeklyHours = value.weeklyHours;
    dailyLimitHours = value.dailyLimitHours;
    referencePeriodWeeks = value.referencePeriodWeeks;
    gksStatus = value.gksStatus;
    employerCategoryCode = value.employerCategoryCode;
    withholdingMode = value.withholdingMode;
  }

  const dirty = $derived(Boolean(baseline && JSON.stringify(currentDraft()) !== JSON.stringify(baseline)));

  const current = $derived(
    catalogue?.configurations
      .filter((item) => item.active)
      .sort((left, right) => right.valid_from.localeCompare(left.valid_from))[0]
  );
  const effectiveRules = $derived(catalogue?.rules.filter((item) => item.status === 'effective') ?? []);
  const draftRules = $derived(catalogue?.rules.filter((item) => item.status === 'draft') ?? []);

  $effect(() => {
    if (!restaurantId || loadedRestaurantId === restaurantId) return;
    loadedRestaurantId = restaurantId;
    void reload();
  });

  async function reload() {
    busy = true;
    feedback = '';
    try {
      catalogue = await getPayrollCatalogue(restaurantId);
      const active = catalogue.configurations
        .filter((item) => item.active)
        .sort((left, right) => right.valid_from.localeCompare(left.valid_from))[0];
      validFrom = active?.valid_from ?? effectiveDate;
      ruleSetId = active?.rule_set_id ?? catalogue.ruleSets.find((item) => item.status === 'effective')?.id ?? '';
      weeklyHours = String((active?.reference_full_time_weekly_minutes ?? 2280) / 60);
      dailyLimitHours = active?.ordinary_daily_limit_minutes
        ? String(active.ordinary_daily_limit_minutes / 60)
        : '';
      referencePeriodWeeks = String(active?.reference_period_weeks ?? 13);
      gksStatus = active?.gks_registered == null ? 'unknown' : active.gks_registered ? 'yes' : 'no';
      employerCategoryCode = active?.employer_category_code ?? '';
      withholdingMode = active?.withholding_mode === 'manual_estimate' || active?.withholding_mode === 'official_formula'
        ? active.withholding_mode
        : 'not_configured';
      baseline = currentDraft();
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      busy = false;
    }
  }

  function discard(): void {
    if (baseline) restoreDraft(baseline);
    feedback = '';
  }

  onMount(() =>
    unsavedChanges.register({
      id: 'restaurant-payroll-configuration',
      label: 'Payroll configuration',
      isDirty: () => dirty,
      save,
      discard
    })
  );

  async function save() {
    if (busy) return;
    if (!ruleSetId || !validFrom) throw new Error('Choose a legal rule set and effective date.');
    busy = true;
    feedback = '';
    try {
      await saveRestaurantPayrollConfiguration(restaurantId, {
        valid_from: validFrom,
        rule_set_id: ruleSetId,
        reference_full_time_weekly_minutes: Math.round(Number(weeklyHours) * 60),
        ordinary_daily_limit_minutes: dailyLimitHours
          ? Math.round(Number(dailyLimitHours) * 60)
          : null,
        reference_period_weeks: Number(referencePeriodWeeks),
        gks_registered: gksStatus === 'unknown' ? null : gksStatus === 'yes',
        employer_category_code: employerCategoryCode.trim() || null,
        withholding_mode: withholdingMode,
        cost_assumptions: {}
      });
      await reload();
      feedback = 'Payroll configuration saved as a new effective-dated version.';
      feedbackTone = 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
      throw error;
    } finally {
      busy = false;
    }
  }

  async function validateSetup() {
    if (busy || !current || dirty) return;
    busy = true;
    feedback = '';
    try {
      const result = await validateRestaurantPayrollConfiguration(restaurantId, current.id);
      const value = result && typeof result === 'object' && !Array.isArray(result)
        ? result as Record<string, unknown>
        : {};
      const blockers = Array.isArray(value.blockers)
        ? value.blockers as Array<{ message?: string }>
        : [];
      await reload();
      feedback = blockers.length
        ? blockers.map((item) => item.message).filter(Boolean).join(' ')
        : 'Payroll setup verified.';
      feedbackTone = blockers.length ? 'info' : 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
      throw error;
    } finally {
      busy = false;
    }
  }
</script>

{#if feedback}<FeedbackBanner message={feedback} tone={feedbackTone} />{/if}

<ClassicTablePanel
  {dirty}
  saving={busy}
  canSave={Boolean(ruleSetId && validFrom)}
  onsave={() => void save().catch(() => undefined)}
  ondiscard={discard}
>
  {#snippet meta()}
    <ClassicStatus
      label={current?.status === 'verified' ? 'Verified setup' : current ? 'Draft setup' : 'Not configured'}
      tone={current?.status === 'verified' ? 'ok' : current ? 'attention' : 'problem'}
    />
    <span>{t('{count} effective rules', { count: effectiveRules.length })}</span>
    <span>{t('{count} salary scale points', { count: catalogue?.salaryScales.length ?? 0 })}</span>
    <span>{t('{count} unverified handlers', { count: draftRules.length })}</span>
  {/snippet}
  {#snippet actions()}
    <button
      class="cl-btn"
      type="button"
      disabled={busy || !current || dirty}
      onclick={() => void validateSetup().catch(() => undefined)}
    >{t('Validate setup')}</button>
  {/snippet}
  {#snippet children()}
    <section class="cl-card setup-card" aria-label={t('Payroll configuration')}>
      <div class="setup-intro">
        <strong>{t('Belgian payroll setup')}</strong>
        <span>{t('Choose the effective CP 302 rule set and record the restaurant evidence used by payroll calculations.')}</span>
      </div>

      <div class="setup-grid">
        <label class="cl-label">
          <span>{t('Effective from')}</span>
          <input class="cl-field" type="date" bind:value={validFrom} />
        </label>
        <label class="cl-label span-2">
          <span>{t('Legal rule set')}</span>
          <select class="cl-field" bind:value={ruleSetId}>
            <option value="">{t('Choose a rule set')}</option>
            {#each catalogue?.ruleSets ?? [] as item (item.id)}
              <option value={item.id}>{item.sector_code} · {item.version} · {t(item.status)}</option>
            {/each}
          </select>
        </label>
        <label class="cl-label">
          <span>{t('Full-time week')}</span>
          <input class="cl-field" inputmode="decimal" bind:value={weeklyHours} />
          <small>{t('Hours · the CP 302 reference is 38.')}</small>
        </label>
        <label class="cl-label">
          <span>{t('Ordinary daily limit')}</span>
          <input class="cl-field" inputmode="decimal" bind:value={dailyLimitHours} placeholder={t('Not configured')} />
          <small>{t('Leave blank until the arrangement is legally verified.')}</small>
        </label>
        <label class="cl-label">
          <span>{t('Reference period')}</span>
          <input class="cl-field" type="number" min="1" max="52" bind:value={referencePeriodWeeks} />
          <small>{t('Weeks')}</small>
        </label>
        <label class="cl-label">
          <span>{t('Registered cash system')}</span>
          <select class="cl-field" bind:value={gksStatus}>
            <option value="unknown">{t('Not recorded')}</option>
            <option value="yes">{t('Yes')}</option>
            <option value="no">{t('No')}</option>
          </select>
        </label>
        <label class="cl-label">
          <span>{t('ONSS employer category')}</span>
          <input class="cl-field" bind:value={employerCategoryCode} placeholder={t('Provider evidence required')} />
        </label>
        <label class="cl-label">
          <span>{t('Professional withholding')}</span>
          <select class="cl-field" bind:value={withholdingMode}>
            <option value="not_configured">{t('Not configured')}</option>
            <option value="manual_estimate">{t('Manual estimate')}</option>
            <option value="official_formula">{t('Official formula · not implemented')}</option>
          </select>
        </label>
      </div>

      <div class="cl-notice is-muted">
        {t('Net salary remains estimated until the FPS Finance formula and payroll-provider return are reconciled.')}
      </div>
    </section>
  {/snippet}
</ClassicTablePanel>

<style>
  .setup-card { overflow: hidden; }
  .setup-intro {
    display: grid;
    gap: 4px;
    padding: 15px 18px;
    border-bottom: 1px solid var(--cl-grid-line);
    background: var(--cl-thead);
  }
  .setup-intro span { color: var(--cl-muted); font-size: 13px; line-height: 1.45; }
  .setup-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    padding: 18px;
  }
  .span-2 { grid-column: span 2; }
  .cl-label small { color: var(--cl-muted); line-height: 1.35; }
  .is-muted { margin: 0 18px 18px; }
  @media (max-width: 980px) {
    .setup-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 520px) {
    .setup-grid { grid-template-columns: 1fr; padding: 14px; }
    .span-2 { grid-column: auto; }
  }
</style>
