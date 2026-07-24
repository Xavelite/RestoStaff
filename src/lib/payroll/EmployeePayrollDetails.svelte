<script lang="ts">
  import { onMount } from 'svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { parseEuroCents } from '$lib/payroll-engine/money';
  import type { Tables } from '$lib/supabase/database.types';
  import {
    getPayrollCatalogue,
    recordEmployeeRegimeEvidence,
    saveEmployeePayrollBenefit,
    saveEmployeeTaxProfile
  } from './payroll-api';
  import type { PayrollCatalogue } from './payroll-model';

  let {
    restaurantId,
    employeeId,
    effectiveDate,
    employmentTerms
  }: {
    restaurantId: string;
    employeeId: string;
    effectiveDate: string;
    employmentTerms: Tables<'employee_employment_terms'>[];
  } = $props();

  type DetailTab = 'Tax' | 'Benefits' | 'Evidence' | 'History';
  const tabs: DetailTab[] = ['Tax', 'Benefits', 'Evidence', 'History'];
  let activeTab = $state<DetailTab>('Tax');
  let catalogue = $state<PayrollCatalogue | null>(null);
  let loadedKey = $state('');
  let busy = $state(false);
  let feedback = $state('');
  let feedbackTone = $state<'success' | 'danger'>('success');

  let taxValidFrom = $state('');
  let residentStatus = $state('resident');
  let civilStatus = $state('');
  let partnerIncomeCategory = $state('');
  let dependentChildren = $state(0);
  let otherDependants = $state(0);
  let disabilityStatus = $state('none');
  let withholdingTreatment = $state('ordinary');
  let manualWithholdingPercent = $state('');
  let taxEvidenceStatus = $state<'recorded' | 'verified'>('recorded');

  let benefitCode = $state('');
  let benefitValidFrom = $state('');
  let benefitAmount = $state('');
  let benefitQuantity = $state('1');
  let benefitTaxable = $state(false);
  let benefitSocialSecurity = $state(false);
  let benefitStatus = $state<'recorded' | 'verified'>('recorded');
  let benefitNotes = $state('');

  let evidenceType = $state('');
  let evidenceValidFrom = $state('');
  let evidenceValidTo = $state('');
  let evidenceReference = $state('');
  let evidenceQuotaHours = $state('');
  let evidenceUsedHours = $state('0');
  let evidenceStatus = $state<'draft' | 'verified'>('draft');

  type DetailDraft = {
    taxValidFrom: string;
    residentStatus: string;
    civilStatus: string;
    partnerIncomeCategory: string;
    dependentChildren: number;
    otherDependants: number;
    disabilityStatus: string;
    withholdingTreatment: string;
    manualWithholdingPercent: string;
    taxEvidenceStatus: 'recorded' | 'verified';
    benefitCode: string;
    benefitValidFrom: string;
    benefitAmount: string;
    benefitQuantity: string;
    benefitTaxable: boolean;
    benefitSocialSecurity: boolean;
    benefitStatus: 'recorded' | 'verified';
    benefitNotes: string;
    evidenceType: string;
    evidenceValidFrom: string;
    evidenceValidTo: string;
    evidenceReference: string;
    evidenceQuotaHours: string;
    evidenceUsedHours: string;
    evidenceStatus: 'draft' | 'verified';
  };

  let baseline = $state<DetailDraft | null>(null);

  function currentDraft(): DetailDraft {
    return {
      taxValidFrom,
      residentStatus,
      civilStatus,
      partnerIncomeCategory,
      dependentChildren,
      otherDependants,
      disabilityStatus,
      withholdingTreatment,
      manualWithholdingPercent,
      taxEvidenceStatus,
      benefitCode,
      benefitValidFrom,
      benefitAmount,
      benefitQuantity,
      benefitTaxable,
      benefitSocialSecurity,
      benefitStatus,
      benefitNotes,
      evidenceType,
      evidenceValidFrom,
      evidenceValidTo,
      evidenceReference,
      evidenceQuotaHours,
      evidenceUsedHours,
      evidenceStatus
    };
  }

  function restoreDraft(value: DetailDraft): void {
    taxValidFrom = value.taxValidFrom;
    residentStatus = value.residentStatus;
    civilStatus = value.civilStatus;
    partnerIncomeCategory = value.partnerIncomeCategory;
    dependentChildren = value.dependentChildren;
    otherDependants = value.otherDependants;
    disabilityStatus = value.disabilityStatus;
    withholdingTreatment = value.withholdingTreatment;
    manualWithholdingPercent = value.manualWithholdingPercent;
    taxEvidenceStatus = value.taxEvidenceStatus;
    benefitCode = value.benefitCode;
    benefitValidFrom = value.benefitValidFrom;
    benefitAmount = value.benefitAmount;
    benefitQuantity = value.benefitQuantity;
    benefitTaxable = value.benefitTaxable;
    benefitSocialSecurity = value.benefitSocialSecurity;
    benefitStatus = value.benefitStatus;
    benefitNotes = value.benefitNotes;
    evidenceType = value.evidenceType;
    evidenceValidFrom = value.evidenceValidFrom;
    evidenceValidTo = value.evidenceValidTo;
    evidenceReference = value.evidenceReference;
    evidenceQuotaHours = value.evidenceQuotaHours;
    evidenceUsedHours = value.evidenceUsedHours;
    evidenceStatus = value.evidenceStatus;
  }

  function taxPart(value: DetailDraft) {
    return {
      taxValidFrom: value.taxValidFrom,
      residentStatus: value.residentStatus,
      civilStatus: value.civilStatus,
      partnerIncomeCategory: value.partnerIncomeCategory,
      dependentChildren: value.dependentChildren,
      otherDependants: value.otherDependants,
      disabilityStatus: value.disabilityStatus,
      withholdingTreatment: value.withholdingTreatment,
      manualWithholdingPercent: value.manualWithholdingPercent,
      taxEvidenceStatus: value.taxEvidenceStatus
    };
  }

  function benefitPart(value: DetailDraft) {
    return {
      benefitCode: value.benefitCode,
      benefitValidFrom: value.benefitValidFrom,
      benefitAmount: value.benefitAmount,
      benefitQuantity: value.benefitQuantity,
      benefitTaxable: value.benefitTaxable,
      benefitSocialSecurity: value.benefitSocialSecurity,
      benefitStatus: value.benefitStatus,
      benefitNotes: value.benefitNotes
    };
  }

  function evidencePart(value: DetailDraft) {
    return {
      evidenceType: value.evidenceType,
      evidenceValidFrom: value.evidenceValidFrom,
      evidenceValidTo: value.evidenceValidTo,
      evidenceReference: value.evidenceReference,
      evidenceQuotaHours: value.evidenceQuotaHours,
      evidenceUsedHours: value.evidenceUsedHours,
      evidenceStatus: value.evidenceStatus
    };
  }

  const dirtyTax = $derived(Boolean(baseline && JSON.stringify(taxPart(currentDraft())) !== JSON.stringify(taxPart(baseline))));
  const dirtyBenefit = $derived(Boolean(baseline && JSON.stringify(benefitPart(currentDraft())) !== JSON.stringify(benefitPart(baseline))));
  const dirtyEvidence = $derived(Boolean(baseline && JSON.stringify(evidencePart(currentDraft())) !== JSON.stringify(evidencePart(baseline))));
  const dirty = $derived(dirtyTax || dirtyBenefit || dirtyEvidence);

  const employeeTaxProfiles = $derived(
    catalogue?.taxProfiles.filter((item) => item.employee_id === employeeId) ?? []
  );
  const employeeBenefits = $derived(
    catalogue?.benefits.filter((item) => item.employee_id === employeeId) ?? []
  );
  const employeeEvidence = $derived(
    catalogue?.regimeEvidence.filter((item) => item.employee_id === employeeId) ?? []
  );
  const benefitComponents = $derived(
    catalogue?.components.filter((item) => item.section === 'benefit') ?? []
  );

  $effect(() => {
    const key = restaurantId && employeeId ? `${restaurantId}:${employeeId}` : '';
    if (!key || loadedKey === key) return;
    loadedKey = key;
    void reload(true);
  });

  async function reload(initialize = false) {
    busy = true;
    try {
      catalogue = await getPayrollCatalogue(restaurantId);
      if (initialize) initializeForms();
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
    }
  }

  function initializeForms() {
    const currentTax = catalogue?.taxProfiles
      .filter((item) => item.employee_id === employeeId && item.active)
      .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
    taxValidFrom = currentTax?.valid_from ?? effectiveDate;
    residentStatus = currentTax?.resident_status ?? 'resident';
    civilStatus = currentTax?.civil_status ?? '';
    partnerIncomeCategory = currentTax?.partner_income_category ?? '';
    dependentChildren = currentTax?.dependent_children ?? 0;
    otherDependants = currentTax?.other_dependants ?? 0;
    disabilityStatus = currentTax?.disability_status ?? 'none';
    withholdingTreatment = currentTax?.withholding_treatment ?? 'ordinary';
    manualWithholdingPercent = currentTax?.manual_withholding_basis_points == null
      ? ''
      : String(currentTax.manual_withholding_basis_points / 100);
    taxEvidenceStatus = currentTax?.evidence_status === 'verified' ? 'verified' : 'recorded';
    benefitValidFrom = effectiveDate;
    evidenceValidFrom = effectiveDate;
    benefitCode = benefitComponents[0]?.code ?? '';
    baseline = currentDraft();
  }

  onMount(() =>
    unsavedChanges.register({
      id: `employee-payroll-details:${employeeId}`,
      label: 'Payroll evidence',
      priority: 30,
      isDirty: () => dirty,
      save: saveActiveDraft,
      discard: discardDraft
    })
  );

  function discardDraft(): void {
    if (baseline) restoreDraft(baseline);
    feedback = '';
  }

  async function saveActiveDraft(): Promise<void> {
    if (dirtyTax) await saveTax();
    if (dirtyBenefit) await saveBenefit();
    if (dirtyEvidence) await saveEvidence();
  }

  function markTaxSaved(): void {
    const current = currentDraft();
    baseline = { ...(baseline ?? current), ...taxPart(current) };
  }

  function markBenefitSaved(): void {
    const current = currentDraft();
    baseline = { ...(baseline ?? current), ...benefitPart(current) };
  }

  function markEvidenceSaved(): void {
    const current = currentDraft();
    baseline = { ...(baseline ?? current), ...evidencePart(current) };
  }

  function showError(error: unknown) {
    feedback = error instanceof Error ? error.message : String(error);
    feedbackTone = 'danger';
  }

  async function saveTax() {
    if (busy || !taxValidFrom) return;
    const percentage = manualWithholdingPercent.trim().replace(',', '.');
    const basisPoints = percentage ? Math.round(Number(percentage) * 100) : null;
    if (basisPoints != null && (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000)) {
      feedback = t('Enter a withholding estimate between 0 and 100%.');
      feedbackTone = 'danger';
      return;
    }
    busy = true;
    feedback = '';
    try {
      await saveEmployeeTaxProfile({
        restaurantId,
        employeeId,
        profile: {
          valid_from: taxValidFrom,
          resident_status: residentStatus || null,
          civil_status: civilStatus || null,
          partner_income_category: partnerIncomeCategory || null,
          dependent_children: dependentChildren,
          other_dependants: otherDependants,
          disability_status: disabilityStatus || null,
          withholding_treatment: withholdingTreatment || null,
          manual_withholding_basis_points: basisPoints,
          evidence_status: taxEvidenceStatus
        }
      });
      await reload();
      feedback = t('Tax profile saved as a new effective-dated version.');
      feedbackTone = 'success';
      markTaxSaved();
    } catch (error) {
      showError(error);
      throw error;
    } finally { busy = false; }
  }

  async function saveBenefit() {
    const amount = parseEuroCents(benefitAmount);
    if (busy || !benefitCode || !benefitValidFrom || amount == null) {
      feedback = t('Choose a benefit, date and valid euro amount.');
      feedbackTone = 'danger';
      return;
    }
    busy = true;
    feedback = '';
    try {
      await saveEmployeePayrollBenefit({
        restaurantId,
        employeeId,
        benefit: {
          component_code: benefitCode,
          valid_from: benefitValidFrom,
          amount_cents: amount.toString(),
          quantity: benefitQuantity || null,
          taxable: benefitTaxable,
          social_security: benefitSocialSecurity,
          evidence_status: benefitStatus,
          notes: benefitNotes || null
        }
      });
      await reload();
      benefitAmount = '';
      benefitNotes = '';
      feedback = t('Benefit saved.');
      feedbackTone = 'success';
      markBenefitSaved();
    } catch (error) {
      showError(error);
      throw error;
    } finally { busy = false; }
  }

  async function saveEvidence() {
    if (busy || !evidenceType || !evidenceValidFrom) {
      feedback = t('Choose an evidence type and effective date.');
      feedbackTone = 'danger';
      return;
    }
    busy = true;
    feedback = '';
    try {
      await recordEmployeeRegimeEvidence({
        restaurantId,
        employeeId,
        evidence: {
          evidence_type: evidenceType,
          valid_from: evidenceValidFrom,
          valid_to: evidenceValidTo || null,
          status: evidenceStatus,
          reference: evidenceReference || null,
          quota_minutes: evidenceQuotaHours ? Math.round(Number(evidenceQuotaHours) * 60) : null,
          used_minutes: evidenceUsedHours ? Math.round(Number(evidenceUsedHours) * 60) : 0,
          metadata: {}
        }
      });
      await reload();
      evidenceReference = '';
      feedback = t('Eligibility evidence recorded.');
      feedbackTone = 'success';
      markEvidenceSaved();
    } catch (error) {
      showError(error);
      throw error;
    } finally { busy = false; }
  }
</script>

<section class="employee-payroll-details" aria-label={t('Employee payroll evidence')}>
  <nav aria-label={t('Payroll detail sections')}>
    {#each tabs as item}<button type="button" class:is-active={activeTab === item} onclick={() => (activeTab = item)}>{t(item)}</button>{/each}
  </nav>
  {#if feedback}<FeedbackBanner message={feedback} tone={feedbackTone} />{/if}

  {#if activeTab === 'Tax'}
    <div class="section-head"><div><span>{t('Sensitive · owner only')}</span><h3>{t('Tax profile')}</h3></div><em>{employeeTaxProfiles[0]?.evidence_status === 'verified' ? t('Verified') : t('Needs verification')}</em></div>
    <div class="fields">
      <label>{t('Effective from')}<input type="date" bind:value={taxValidFrom} /></label>
      <label>{t('Tax residency')}<select bind:value={residentStatus}><option value="resident">{t('Belgian resident')}</option><option value="non_resident">{t('Non-resident')}</option></select></label>
      <label>{t('Civil status')}<select bind:value={civilStatus}><option value="">{t('Not recorded')}</option><option value="single">{t('Single')}</option><option value="married">{t('Married')}</option><option value="legal_cohabitation">{t('Legal cohabitation')}</option><option value="other">{t('Other')}</option></select></label>
      <label>{t('Partner income category')}<input bind:value={partnerIncomeCategory} /></label>
      <label>{t('Dependent children')}<input type="number" min="0" bind:value={dependentChildren} /></label>
      <label>{t('Other dependants')}<input type="number" min="0" bind:value={otherDependants} /></label>
      <label>{t('Disability status')}<select bind:value={disabilityStatus}><option value="none">{t('None recorded')}</option><option value="employee">{t('Employee')}</option><option value="dependant">{t('Dependant')}</option></select></label>
      <label>{t('Withholding treatment')}<input bind:value={withholdingTreatment} /></label>
      <label>{t('Manual withholding estimate')}<input inputmode="decimal" bind:value={manualWithholdingPercent} placeholder="0.00" /><small>{t('Percentage · estimate only until provider reconciliation')}</small></label>
      <label>{t('Evidence status')}<select bind:value={taxEvidenceStatus}><option value="recorded">{t('Recorded')}</option><option value="verified">{t('Verified')}</option></select></label>
    </div>
    <footer><p>{t('Restogogo does not claim official withholding until FPS Finance reference cases are validated.')}</p><button type="button" disabled={busy} onclick={() => void saveTax().catch(() => undefined)}>{busy ? t('Saving…') : t('Save tax version')}</button></footer>
  {:else if activeTab === 'Benefits'}
    <div class="section-head"><div><span>{t('Effective-dated compensation')}</span><h3>{t('Benefits and allowances')}</h3></div><em>{employeeBenefits.filter((item) => item.active).length} {t('active')}</em></div>
    <div class="fields">
      <label>{t('Component')}<select bind:value={benefitCode}>{#each benefitComponents as item (item.code)}<option value={item.code}>{item.label}</option>{/each}</select></label>
      <label>{t('Effective from')}<input type="date" bind:value={benefitValidFrom} /></label>
      <label>{t('Amount')}<input inputmode="decimal" bind:value={benefitAmount} placeholder="0.00" /></label>
      <label>{t('Quantity')}<input inputmode="decimal" bind:value={benefitQuantity} /></label>
      <label class="check"><input type="checkbox" bind:checked={benefitTaxable} />{t('Taxable')}</label>
      <label class="check"><input type="checkbox" bind:checked={benefitSocialSecurity} />{t('Subject to social security')}</label>
      <label>{t('Evidence status')}<select bind:value={benefitStatus}><option value="recorded">{t('Recorded')}</option><option value="verified">{t('Verified')}</option></select></label>
      <label class="wide">{t('Notes')}<input bind:value={benefitNotes} /></label>
    </div>
    <footer><p>{t('Only verified benefits enter a payroll calculation.')}</p><button type="button" disabled={busy} onclick={() => void saveBenefit().catch(() => undefined)}>{busy ? t('Saving…') : t('Add benefit version')}</button></footer>
    <div class="records">{#each employeeBenefits as item (item.id)}<article><div><strong>{item.component_code.replaceAll('_', ' ')}</strong><small>{item.valid_from} → {item.valid_to ?? t('Open ended')}</small></div><em>{t(item.evidence_status)}</em></article>{/each}</div>
  {:else if activeTab === 'Evidence'}
    <div class="section-head"><div><span>{t('Eligibility and quota proof')}</span><h3>{t('Regime evidence')}</h3></div><em>{employeeEvidence.filter((item) => item.status === 'verified').length} {t('verified')}</em></div>
    <div class="fields">
      <label>{t('Evidence type')}<select bind:value={evidenceType}><option value="">{t('Select evidence')}</option><option value="flexi_eligibility">{t('Flexi eligibility')}</option><option value="student_quota">{t('Student quota')}</option><option value="occasional_quota">{t('Occasional-worker quota')}</option><option value="dimona">Dimona</option><option value="voluntary_overtime">{t('Voluntary-overtime agreement')}</option><option value="special_horeca_overtime">{t('Special horeca overtime')}</option></select></label>
      <label>{t('Effective from')}<input type="date" bind:value={evidenceValidFrom} /></label>
      <label>{t('Effective until')}<input type="date" min={evidenceValidFrom} bind:value={evidenceValidTo} /></label>
      <label>{t('Reference')}<input bind:value={evidenceReference} /></label>
      <label>{t('Quota hours')}<input inputmode="decimal" bind:value={evidenceQuotaHours} /></label>
      <label>{t('Hours already used')}<input inputmode="decimal" bind:value={evidenceUsedHours} /></label>
      <label>{t('Evidence status')}<select bind:value={evidenceStatus}><option value="draft">{t('Draft')}</option><option value="verified">{t('Verified')}</option></select></label>
    </div>
    <footer><p>{t('Special regimes stay blocked until their eligibility evidence is verified.')}</p><button type="button" disabled={busy} onclick={() => void saveEvidence().catch(() => undefined)}>{busy ? t('Saving…') : t('Record evidence')}</button></footer>
    <div class="records">{#each employeeEvidence as item (item.id)}<article><div><strong>{item.evidence_type.replaceAll('_', ' ')}</strong><small>{item.valid_from} → {item.valid_to ?? t('Open ended')}{item.reference ? ` · ${item.reference}` : ''}</small></div><em>{t(item.status)}</em></article>{/each}</div>
  {:else}
    <div class="section-head"><div><span>{t('Append-only evidence')}</span><h3>{t('Payroll history')}</h3></div><em>{employmentTerms.length + employeeTaxProfiles.length + employeeBenefits.length + employeeEvidence.length} {t('records')}</em></div>
    <div class="timeline">
      {#each employmentTerms.filter((item) => item.employee_id === employeeId).sort((a, b) => b.valid_from.localeCompare(a.valid_from)) as item (item.id)}<article><i></i><div><strong>{t('Employment terms')} · v{item.version_number}</strong><span>{item.valid_from} → {item.valid_to ?? t('Open ended')} · {t(item.source_status)}</span></div></article>{/each}
      {#each employeeTaxProfiles as item (item.id)}<article><i></i><div><strong>{t('Tax profile')} · v{item.version_number}</strong><span>{item.valid_from} → {item.valid_to ?? t('Open ended')} · {t(item.evidence_status)}</span></div></article>{/each}
      {#each employeeBenefits as item (item.id)}<article><i></i><div><strong>{item.component_code.replaceAll('_', ' ')}</strong><span>{item.valid_from} → {item.valid_to ?? t('Open ended')} · {t(item.evidence_status)}</span></div></article>{/each}
      {#each employeeEvidence as item (item.id)}<article><i></i><div><strong>{item.evidence_type.replaceAll('_', ' ')}</strong><span>{item.valid_from} → {item.valid_to ?? t('Open ended')} · {t(item.status)}</span></div></article>{/each}
    </div>
  {/if}
</section>

<style>
  .employee-payroll-details { display: grid; gap: 14px; padding: 14px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-lg); background: var(--rst-ui-surface-panel); }
  nav { display: flex; gap: 3px; overflow-x: auto; border-bottom: 1px solid var(--rst-ui-line); }
  nav button { flex: 0 0 auto; padding: 9px 11px; border: 0; border-bottom: 2px solid transparent; color: var(--rst-ui-muted); background: transparent; font: inherit; font-size: 11px; cursor: pointer; }
  nav button.is-active { border-bottom-color: var(--rst-ui-action); color: var(--rst-ui-text); }
  .section-head, footer { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .section-head span { color: var(--rst-ui-muted); font-size: 9px; text-transform: uppercase; }
  h3 { margin: 3px 0 0; font-size: 16px; }
  .section-head em { padding: 5px 7px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-sm); color: var(--rst-ui-muted); font-size: 10px; font-style: normal; }
  .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  label { display: grid; gap: 5px; color: var(--rst-ui-muted); font-size: 10px; }
  label.wide { grid-column: 1 / -1; }
  label.check { display: flex; align-items: center; gap: 8px; min-height: 40px; }
  input, select { width: 100%; min-height: 39px; padding: 7px 9px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); color: var(--rst-ui-text); background: var(--rst-ui-surface-field-strong); font: inherit; }
  label.check input { width: auto; min-height: 0; }
  small, footer p { color: var(--rst-ui-muted); font-size: 10px; line-height: 1.4; }
  footer { align-items: center; border-top: 1px solid var(--rst-ui-line); padding-top: 12px; }
  footer p { max-width: 480px; margin: 0; }
  footer button { flex: 0 0 auto; min-height: 38px; padding: 7px 12px; border: 0; border-radius: var(--rst-ui-radius-md); color: white; background: var(--rst-ui-action); font: inherit; font-weight: var(--rst-fw-bold); cursor: pointer; }
  footer button:disabled { opacity: .5; cursor: default; }
  .records { display: grid; border-top: 1px solid var(--rst-ui-line); }
  .records article { display: flex; justify-content: space-between; gap: 12px; padding: 10px 2px; border-bottom: 1px solid var(--rst-ui-line); }
  .records article div { display: grid; gap: 3px; }
  .records strong { font-size: 11px; text-transform: capitalize; }
  .records em { color: var(--rst-ui-muted); font-size: 10px; font-style: normal; }
  .timeline { display: grid; gap: 8px; }
  .timeline article { display: grid; grid-template-columns: 12px minmax(0, 1fr); gap: 9px; align-items: start; }
  .timeline i { width: 9px; height: 9px; margin-top: 4px; border-radius: var(--rst-ui-radius-round); background: var(--rst-ui-action); }
  .timeline div { display: grid; gap: 3px; padding-bottom: 9px; border-bottom: 1px solid var(--rst-ui-line); }
  .timeline strong { font-size: 11px; }
  .timeline span { color: var(--rst-ui-muted); font-size: 10px; }
  @media (max-width: 520px) { .fields { grid-template-columns: 1fr; } label.wide { grid-column: auto; } footer { display: grid; } footer button { width: 100%; } }
</style>
