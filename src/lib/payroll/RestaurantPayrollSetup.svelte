<script lang="ts">
  import { onMount } from 'svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
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

<section class="payroll-setup" aria-label="Payroll configuration">
  <header>
    <div>
      <span>Payroll foundation · CP 302</span>
      <h2>Belgian payroll setup</h2>
      <p>Legal rules are versioned centrally. Restaurant evidence and assumptions stay effective-dated here.</p>
    </div>
    <span class:verified={current?.status === 'verified'} class="status">
      {current?.status === 'verified' ? 'Verified setup' : current ? 'Draft setup' : 'Not configured'}
    </span>
  </header>

  {#if feedback}<FeedbackBanner message={feedback} tone={feedbackTone} />{/if}

  <div class="rule-strip">
    <div><strong>{effectiveRules.length}</strong><span>effective rules</span></div>
    <div><strong>{catalogue?.salaryScales.length ?? 0}</strong><span>2026 scale points</span></div>
    <div class:is-open={draftRules.length > 0}><strong>{draftRules.length}</strong><span>unverified handlers</span></div>
  </div>

  <div class="setup-grid">
    <label>Effective from<input type="date" bind:value={validFrom} /></label>
    <label>Legal rule set<select bind:value={ruleSetId}>{#each catalogue?.ruleSets ?? [] as item (item.id)}<option value={item.id}>{item.sector_code} · {item.version} · {item.status}</option>{/each}</select></label>
    <label>Full-time week<input inputmode="decimal" bind:value={weeklyHours} /><small>hours · CP 302 reference is 38</small></label>
    <label>Ordinary daily limit<input inputmode="decimal" bind:value={dailyLimitHours} placeholder="Not configured" /><small>hours · leave blank until verified for your arrangement</small></label>
    <label>Reference period<input type="number" min="1" max="52" bind:value={referencePeriodWeeks} /><small>weeks</small></label>
    <label>Registered cash system<select bind:value={gksStatus}><option value="unknown">Not recorded</option><option value="yes">Yes</option><option value="no">No</option></select></label>
    <label>ONSS employer category<input bind:value={employerCategoryCode} placeholder="Provider evidence required" /></label>
    <label>Professional withholding<select bind:value={withholdingMode}><option value="not_configured">Not configured</option><option value="manual_estimate">Manual estimate</option><option value="official_formula">Official formula · not implemented</option></select></label>
  </div>

  <footer>
    <p>Net salary remains labelled estimated until the FPS Finance formula and provider return are reconciled.</p>
    <div class="actions">
      <button class="secondary" type="button" disabled={busy || !dirty} onclick={discard}>Discard</button>
      <button class="secondary" type="button" disabled={busy || !current || dirty} onclick={() => void validateSetup().catch(() => undefined)}>Validate setup</button>
      <button type="button" disabled={busy || !dirty || !ruleSetId || !validFrom} onclick={() => void save().catch(() => undefined)}>{busy ? 'Saving…' : 'Save draft'}</button>
    </div>
  </footer>
</section>

<style>
  .payroll-setup {
    display: grid;
    gap: 18px;
    margin-top: 16px;
    padding: 22px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-panel);
  }
  header, footer { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
  header div { max-width: 720px; }
  header span, .rule-strip span { color: var(--rst-ui-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0; }
  h2 { margin: 4px 0 6px; font-size: 20px; }
  p { margin: 0; color: var(--rst-ui-muted); font-size: 13px; line-height: 1.5; }
  .status { flex: 0 0 auto; padding: 6px 9px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-sm); color: var(--rst-ui-muted); font-size: 11px; }
  .status.verified { border-color: rgba(66,216,132,.38); color: var(--rst-ui-success); background: rgba(66,216,132,.08); }
  .rule-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-block: 1px solid var(--rst-ui-line); }
  .rule-strip div { display: grid; gap: 2px; padding: 14px; border-right: 1px solid var(--rst-ui-line); }
  .rule-strip div:last-child { border-right: 0; }
  .rule-strip strong { font-size: 22px; font-variant-numeric: tabular-nums; }
  .rule-strip .is-open strong { color: var(--rst-state-warning-text); }
  .setup-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  label { display: grid; gap: 6px; color: var(--rst-ui-muted); font-size: 11px; }
  input, select { width: 100%; min-height: 40px; padding: 8px 10px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); background: var(--rst-ui-surface-field-strong); color: var(--rst-ui-text); font: inherit; }
  small { color: var(--rst-ui-muted); line-height: 1.35; }
  footer { align-items: center; }
  footer p { max-width: 620px; }
  button { min-height: 40px; padding: 8px 15px; border: 0; border-radius: var(--rst-ui-radius-md); background: var(--rst-ui-accent); color: white; font: inherit; font-weight: 700; cursor: pointer; }
  button.secondary { border: 1px solid var(--rst-ui-line); background: var(--rst-ui-surface-field); color: var(--rst-ui-text); }
  .actions { display: flex; gap: 8px; }
  button:disabled { opacity: .55; cursor: default; }
  @media (max-width: 980px) { .setup-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 520px) {
    .payroll-setup { padding: 16px; }
    header, footer { display: grid; }
    .setup-grid { grid-template-columns: 1fr; }
    .rule-strip { grid-template-columns: 1fr; }
    .rule-strip div { border-right: 0; border-bottom: 1px solid var(--rst-ui-line); }
    .rule-strip div:last-child { border-bottom: 0; }
    button { width: 100%; }
  }
</style>
