<script lang="ts">
  import { addDays, WEEKDAYS } from '$lib/calendar/date';
  import { friendlyError } from '$lib/api/error-messages';
  import { t } from '$lib/i18n/i18n.svelte';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import EmployeePayrollDetails from '$lib/payroll/EmployeePayrollDetails.svelte';
  import { validateEmployeeEmploymentTerms } from '$lib/payroll/payroll-api';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { teamDraft } from './classic-team.svelte';

  type Mode = 'people' | 'contract' | 'payroll';

  let {
    employeeId,
    mode,
    saving = false,
    onclose,
    onsave
  }: {
    employeeId: string;
    mode: Mode;
    saving?: boolean;
    onclose: () => void;
    onsave: (employee: EmployeeDraft) => void | Promise<void>;
  } = $props();

  let form = $state<EmployeeDraft | null>(null);
  let loadedKey = '';
  let revealSensitive = $state(false);

  const snapshot = $derived(workspace.team);
  const owner = $derived(workspace.effectiveRole === 'owner');
  const jobFunctions = $derived(snapshot?.job_functions.filter((item) => item.active) ?? []);
  const contractTypes = $derived(snapshot?.contract_types.filter((item) => item.active) ?? []);
  const catalogue = $derived(teamDraft.payrollCatalogue);
  const contractTypeCode = $derived(
    contractTypes.find((item) => item.id === form?.contractTypeId)?.code ?? ''
  );
  const savedEmployee = $derived(Boolean(snapshot?.employees.some((item) => item.id === employeeId)));
  const contractHistory = $derived(
    (snapshot?.employee_contracts ?? [])
      .filter((item) => item.employee_id === employeeId)
      .sort((left, right) => (right.contract_start || '').localeCompare(left.contract_start || ''))
  );
  const currentEmploymentTerms = $derived(
    teamDraft.employmentTerms
      .filter((item) => item.employee_id === employeeId && item.active)
      .sort((left, right) => right.valid_from.localeCompare(left.valid_from))[0] ?? null
  );
  const today = new Date().toISOString().slice(0, 10);

  $effect(() => {
    const key = `${employeeId}:${mode}`;
    if (!employeeId || key === loadedKey) return;
    const employee = teamDraft.employees.find((item) => item.id === employeeId);
    form = employee
      ? {
          ...employee,
          jobFunctionIds: [...employee.jobFunctionIds],
          recurringSlots: employee.recurringSlots.map((slot) => ({ ...slot }))
        }
      : null;
    revealSensitive = false;
    loadedKey = key;
  });


  function selectContractType(id: string) {
    if (!form) return;
    form.contractTypeId = id;
    const code = contractTypes.find((item) => item.id === id)?.code ?? '';
    if (code === 'CDI') {
      form.contractEnd = '';
      form.employmentValidTo = '';
    }
  }

  function togglePosition(id: string, enabled: boolean) {
    if (!form) return;
    form.jobFunctionIds = enabled
      ? [...form.jobFunctionIds, id]
      : form.jobFunctionIds.filter((item) => item !== id);
  }

  function toggleRecurring(weekday: number, serviceKey: 'lunch' | 'evening', enabled: boolean) {
    if (!form) return;
    form.recurringSlots = enabled
      ? [...form.recurringSlots, { weekday, serviceKey }]
      : form.recurringSlots.filter(
          (slot) => slot.weekday !== weekday || slot.serviceKey !== serviceKey
        );
  }

  function selectReferenceFunction(code: string) {
    if (!form) return;
    const reference = catalogue?.referenceFunctions.find((item) => item.code === code);
    form.cp302ReferenceFunctionCode = code;
    if (reference) {
      form.cp302Category = reference.category;
      form.workerStatus = reference.default_worker_status ?? '';
    }
  }

  function referenceLabel(code: string): string {
    const reference = catalogue?.referenceFunctions.find((item) => item.code === code);
    if (!reference) return code || t('Not set');
    return `${reference.code} · ${reference.name_en || reference.name_fr || reference.name_nl}`;
  }

  function startContractRenewal() {
    if (!form || !owner) return;
    form.contractId = '';
    form.contractStart = form.contractEnd ? addDays(form.contractEnd, 1) : today;
    form.contractEnd = '';
    form.employmentValidFrom = form.contractStart;
    toasts.show(t('A new contract version is ready. Review it, then save Team.'), 'info');
  }

  async function validateEmployment() {
    if (!workspace.activeId || !currentEmploymentTerms || !savedEmployee || saving) {
      toasts.show(t('Record employment and salary terms before validation.'), 'warning');
      return;
    }
    try {
      const result = await validateEmployeeEmploymentTerms({
        restaurantId: workspace.activeId,
        employeeId,
        employmentTermsId: currentEmploymentTerms.id
      });
      const value = result && typeof result === 'object' && !Array.isArray(result)
        ? result as Record<string, unknown>
        : {};
      const blockers = Array.isArray(value.blockers)
        ? value.blockers as Array<{ message?: string }>
        : [];
      await teamDraft.reloadSupplementary(workspace.activeId);
      toasts.show(
        blockers.length
          ? blockers.map((item) => item.message).filter(Boolean).join(' ')
          : t('Employment setup verified.'),
        blockers.length ? 'warning' : 'success'
      );
    } catch (error) {
      toasts.show(friendlyError(error), 'danger');
    }
  }

  async function commit() {
    if (!form) return;
    await onsave({
      ...form,
      jobFunctionIds: [...form.jobFunctionIds],
      recurringSlots: form.recurringSlots.map((slot) => ({ ...slot }))
    });
  }

  const title = $derived(
    mode === 'contract'
      ? 'Edit contract'
      : mode === 'payroll'
        ? 'Edit payroll details'
        : 'Employee details'
  );
</script>

<section class="employee-editor" aria-label={t(title)}>
    <header class="employee-editor__head">
      <div>
        <h2>{t(title)}</h2>
        {#if form?.displayName}<p>{form.displayName}</p>{/if}
      </div>
      <button class="cl-btn is-icon" type="button" aria-label={t('Close')} onclick={onclose}>×</button>
    </header>

    {#if form}
      <div class="employee-editor__body">
    {#if mode === 'people'}
      <div class="cl-formgrid">
        <div class="cl-form-section">{t('Identity')}</div>
        <label class="cl-label"><span>{t('Display name')}</span><input class="cl-field" bind:value={form.displayName} /></label>
        <div class="cl-label">
          <span>{t('Employee status')}</span>
          <label class="status-toggle">
            <input type="checkbox" bind:checked={form.active} />
            <span>{t(form.active ? 'Active' : 'Archived')}</span>
          </label>
        </div>
        <label class="cl-label"><span>{t('First name')}</span><input class="cl-field" bind:value={form.firstName} /></label>
        <label class="cl-label"><span>{t('Last name')}</span><input class="cl-field" bind:value={form.lastName} /></label>

        <fieldset class="position-field is-wide">
          <legend>{t('Positions / job functions')}</legend>
          <div class="position-grid">
            {#each jobFunctions as item (item.id)}
              <label>
                <input type="checkbox" checked={form.jobFunctionIds.includes(item.id)} onchange={(event) => togglePosition(item.id, event.currentTarget.checked)} />
                <span>{item.name}</span>
              </label>
            {/each}
          </div>
        </fieldset>

        <div class="cl-form-section">{t('Contact')}</div>
        <label class="cl-label"><span>{t('Email')}</span><input class="cl-field" type="email" bind:value={form.email} /></label>
        <label class="cl-label"><span>{t('Phone')}</span><input class="cl-field" bind:value={form.phone} /></label>
        <label class="cl-label is-wide"><span>{t('Address')}</span><input class="cl-field" bind:value={form.address} /></label>
        <label class="cl-label"><span>{t('Postal code')}</span><input class="cl-field" bind:value={form.postalCode} /></label>
        <label class="cl-label"><span>{t('City')}</span><input class="cl-field" bind:value={form.city} /></label>

        <div class="cl-form-section">{t('Emergency contact')}</div>
        <label class="cl-label"><span>{t('Name')}</span><input class="cl-field" bind:value={form.emergencyName} /></label>
        <label class="cl-label"><span>{t('Relationship')}</span><input class="cl-field" bind:value={form.emergencyRelation} /></label>
        <label class="cl-label"><span>{t('Emergency phone')}</span><input class="cl-field" bind:value={form.emergencyPhone} /></label>

        {#if owner}
          <div class="cl-form-section">{t('Legal identity')}</div>
          <label class="cl-label"><span>{t('Birth date')}</span><input class="cl-field" type="date" bind:value={form.birthDate} /></label>
          <label class="cl-label"><span>{t('National registry number')}</span><input class="cl-field" bind:value={form.nationalRegistryNumber} /></label>
          <label class="cl-label"><span>{t('Sex')}</span><input class="cl-field" bind:value={form.sex} /></label>
          <label class="cl-label"><span>{t('Nationality')}</span><input class="cl-field" bind:value={form.nationality} /></label>
          <label class="cl-label"><span>{t('Language')}</span><input class="cl-field" bind:value={form.language} /></label>
        {/if}

        <label class="cl-label is-wide"><span>{t('Notes')}</span><textarea class="cl-field textarea" bind:value={form.notes}></textarea></label>
      </div>
    {:else if mode === 'contract'}
      <div class="cl-formgrid">
        <div class="cl-form-section">{t('Contract')}</div>
        <label class="cl-label">
          <span>{t('Employment type')}</span>
          <select class="cl-field" value={form.contractTypeId} onchange={(event) => selectContractType(event.currentTarget.value)}>
            <option value="">{t('Not set')}</option>
            {#each contractTypes as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
          </select>
        </label>
        <label class="cl-label"><span>{t('Terms effective from')}</span><input class="cl-field" type="date" bind:value={form.employmentValidFrom} /></label>
        <label class="cl-label"><span>{t('Start date')}</span><input class="cl-field" type="date" bind:value={form.contractStart} /></label>
        {#if contractTypeCode !== 'CDI'}
          <label class="cl-label"><span>{t('End date')}</span><input class="cl-field" type="date" bind:value={form.contractEnd} /></label>
        {/if}
        <label class="cl-label"><span>{t('Contract hours per week')}</span><input class="cl-field" type="number" min="0" step="0.25" bind:value={form.weeklyContractHours} /></label>
        <label class="cl-label"><span>{t('Contract days')}</span><input class="cl-field" type="number" min="0" step="0.5" bind:value={form.contractDays} /></label>
        <label class="cl-label"><span>{t('Annual leave days')}</span><input class="cl-field" type="number" min="0" step="0.5" bind:value={form.annualLeaveEntitlementDays} /></label>
        <label class="cl-label">
          <span>{t('How are contract hours defined?')}</span>
          <select class="cl-field" bind:value={form.weeklyHoursRegime}>
            <option value="fixed">{t('The same number every week')}</option>
            <option value="variable_average">{t('An average over a reference period')}</option>
          </select>
        </label>
        {#if form.weeklyHoursRegime === 'variable_average'}
          <label class="cl-label"><span>{t('Reference period')}</span><input class="cl-field" type="number" min="2" max="52" bind:value={form.referencePeriodWeeks} /><small class="cl-field-help">{t('Weeks')}</small></label>
        {/if}
        <label class="cl-label">
          <span>{t('How the employee is scheduled')}</span>
          <select class="cl-field" bind:value={form.workRegime}>
            <option value="fixed_schedule">{t('Recurring fixed schedule')}</option>
            <option value="weekly_availability">{t('Weekly availability')}</option>
            <option value="manager_only">{t('Manager planned')}</option>
          </select>
        </label>
        <label class="cl-label"><span>{t('Worker status')}</span><input class="cl-field" value={form.workerStatus ? t(form.workerStatus === 'blue_collar' ? 'Blue-collar worker' : 'White-collar employee') : t('Derived after payroll setup')} disabled /></label>
        <label class="cl-label"><span>{t('Employment volume')}</span><input class="cl-field" value={t(form.employmentVolume === 'full_time' ? 'Full time' : 'Part time')} disabled /></label>

        {#if form.workRegime === 'fixed_schedule'}
          <div class="cl-form-section">{t('Recurring work pattern')}</div>
          <div class="cl-checkgrid is-wide">
            <strong>{t('Day')}</strong><strong>{t('Lunch')}</strong><strong>{t('Evening')}</strong>
            {#each WEEKDAYS as day, index}
              <span>{t(day)}</span>
              <label><input type="checkbox" checked={form.recurringSlots.some((slot) => slot.weekday === index + 1 && slot.serviceKey === 'lunch')} onchange={(event) => toggleRecurring(index + 1, 'lunch', event.currentTarget.checked)} /></label>
              <label><input type="checkbox" checked={form.recurringSlots.some((slot) => slot.weekday === index + 1 && slot.serviceKey === 'evening')} onchange={(event) => toggleRecurring(index + 1, 'evening', event.currentTarget.checked)} /></label>
            {/each}
          </div>
        {/if}

        {#if owner && savedEmployee}
          <div class="contract-actions is-wide">
            <button class="cl-btn" type="button" onclick={startContractRenewal}>{t('Start contract renewal')}</button>
            <small>{t('Create a new contract version without rewriting the employee history.')}</small>
          </div>
        {/if}

        {#if contractHistory.length}
          <div class="cl-form-section">{t('Contract history')}</div>
          <div class="contract-history is-wide">
            {#each contractHistory as contract (contract.id)}
              <article class:is-current={contract.is_current && contract.active}>
                <div>
                  <strong>{contractTypes.find((item) => item.id === contract.contract_type_id)?.name ?? t('Contract')}</strong>
                  <span>{contract.contract_start || t('No start')} → {contract.contract_end || t('Open ended')}</span>
                </div>
                <em>{t(contract.is_current && contract.active ? 'Current' : 'Historical')}</em>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div class="cl-formgrid">
        <div class="cl-form-section">{t('Legal salary terms')}</div>
        <label class="cl-label is-wide">
          <span>{t('Official CP 302 function')}</span>
          <select class="cl-field" value={form.cp302ReferenceFunctionCode} onchange={(event) => selectReferenceFunction(event.currentTarget.value)}>
            <option value="">{t('Not set')}</option>
            {#each catalogue?.referenceFunctions.filter((item) => item.status === 'effective' || item.status === 'verified') ?? [] as item (item.id)}
              <option value={item.code}>{item.code} · {item.name_en || item.name_fr || item.name_nl}</option>
            {/each}
          </select>
          <small class="cl-field-help">{t('Category and worker status are derived from the official function.')}</small>
        </label>
        <label class="cl-label"><span>{t('Derived classification')}</span><input class="cl-field" value={form.cp302ReferenceFunctionCode ? `${referenceLabel(form.cp302ReferenceFunctionCode)} · ${t('Category')} ${form.cp302Category || '—'}` : t('Not set')} disabled /></label>
        <label class="cl-label"><span>{t('Worker status')}</span><input class="cl-field" value={form.workerStatus ? t(form.workerStatus === 'blue_collar' ? 'Blue-collar worker' : 'White-collar employee') : t('Not set')} disabled /></label>
        <label class="cl-label"><span>{t('Salary basis')}</span><select class="cl-field" bind:value={form.salaryBasis}><option value="">{t('Not set')}</option><option value="hourly">{t('Hourly')}</option><option value="monthly">{t('Monthly')}</option></select></label>
        {#if form.salaryBasis === 'monthly'}
          <label class="cl-label"><span>{t('Monthly gross salary')}</span><input class="cl-field" inputmode="decimal" bind:value={form.contractualMonthlySalary} /></label>
        {:else}
          <label class="cl-label"><span>{t('Contractual hourly rate')}</span><input class="cl-field" inputmode="decimal" bind:value={form.contractualHourlyRate} /></label>
        {/if}
        <label class="cl-label"><span>{t('Function seniority date')}</span><input class="cl-field" type="date" bind:value={form.functionSeniorityDate} /></label>
        <label class="cl-label"><span>{t('Company seniority date')}</span><input class="cl-field" type="date" bind:value={form.companySeniorityDate} /></label>

        <div class="cl-form-section">{t('Payroll profile')}</div>
        <label class="cl-label"><span>{t('Payroll employee ID')}</span><input class="cl-field" bind:value={form.payrollEmployeeId} /></label>
        <label class="sensitive-toggle"><input type="checkbox" bind:checked={revealSensitive} /> {t('Show sensitive fields')}</label>
        <label class="cl-label"><span>{t('National registry number')}</span><input class="cl-field" type={revealSensitive ? 'text' : 'password'} bind:value={form.nationalRegistryNumber} /></label>
        <label class="cl-label"><span>{t('Birth date')}</span><input class="cl-field" type="date" bind:value={form.birthDate} /></label>
        <label class="cl-label"><span>IBAN</span><input class="cl-field" type={revealSensitive ? 'text' : 'password'} bind:value={form.iban} /></label>
        <label class="cl-label"><span>BIC</span><input class="cl-field" bind:value={form.bic} /></label>
        <label class="cl-label"><span>{t('Budget hourly wage')}</span><input class="cl-field" type="number" min="0" step="0.01" bind:value={form.hourlyWageRate} /></label>
        <label class="cl-label"><span>{t('Estimated hourly cost')}</span><input class="cl-field" type="number" min="0" step="0.01" bind:value={form.estimatedHourlyCost} /></label>
        <label class="cl-label is-wide"><span>{t('Company cost formula')}</span><input class="cl-field" bind:value={form.companyCostFormula} /></label>
        <label class="cl-label is-wide"><span>{t('Payroll notes')}</span><textarea class="cl-field textarea" bind:value={form.payrollNotes}></textarea></label>
      </div>

      {#if owner && savedEmployee && workspace.activeId}
        <div class="payroll-evidence">
          <EmployeePayrollDetails
            restaurantId={workspace.activeId}
            employeeId={employeeId}
            effectiveDate={form.employmentValidFrom || today}
            employmentTerms={teamDraft.employmentTerms}
          />
        </div>
      {/if}
    {/if}
      </div>
      <footer class="employee-editor__footer">
        {#if mode === 'payroll' && savedEmployee}
          <button class="cl-btn" type="button" disabled={saving || !currentEmploymentTerms} onclick={validateEmployment}>{t('Validate setup')}</button>
        {/if}
        <span class="employee-editor__spacer"></span>
        <button class="cl-btn" type="button" disabled={saving} onclick={onclose}>{t('Cancel')}</button>
        <button class="cl-btn is-primary" type="button" disabled={saving || !form} onclick={commit}>{saving ? t('Saving…') : t('Save')}</button>
      </footer>
    {/if}
</section>

<style>
  .employee-editor {
    display: grid;
    gap: 0;
    border: 1px solid var(--cl-line-strong);
    border-radius: var(--cl-radius);
    background: var(--cl-surface);
  }
  .employee-editor__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--cl-line);
    background: var(--cl-surface-muted);
  }
  .employee-editor__head h2,
  .employee-editor__head p { margin: 0; }
  .employee-editor__head h2 { font-size: 15px; }
  .employee-editor__head p { margin-top: 3px; color: var(--cl-muted); font-size: 12px; }
  .employee-editor__head .cl-btn { font-size: 20px; }
  .employee-editor__body { padding: 14px; }
  .employee-editor__footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-top: 1px solid var(--cl-line);
    background: var(--cl-surface-muted);
  }
  .employee-editor__spacer { margin-left: auto; }
  .status-toggle {
    min-height: 2.5rem;
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--cl-line);
    border-radius: 0.65rem;
    background: var(--cl-surface);
  }
  .contract-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 4px;
  }
  .contract-actions small { color: var(--cl-muted); font-size: 12px; }
  .contract-history { display: grid; border: 1px solid var(--cl-line); border-radius: 0.7rem; overflow: hidden; }
  .contract-history article { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-top: 1px solid var(--cl-line); }
  .contract-history article:first-child { border-top: 0; }
  .contract-history article.is-current { background: var(--cl-surface-muted); }
  .contract-history div { display: grid; gap: 3px; }
  .contract-history strong { font-size: 13px; }
  .contract-history span, .contract-history em { color: var(--cl-muted); font-size: 12px; font-style: normal; }
  .payroll-evidence { margin-top: 16px; }
  fieldset { min-width: 0; }
  .position-field {
    padding: 12px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
  }
  .position-field legend { padding: 0 5px; color: var(--cl-muted); font-size: 13px; font-weight: var(--rst-fw-medium); }
  .position-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .position-grid label,
  .sensitive-toggle {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--cl-ink);
    font-size: 13px;
  }
  .position-grid label {
    padding: 7px 10px;
    border: 1px solid var(--cl-line);
    border-radius: var(--cl-radius);
    background: var(--cl-surface-muted);
  }
  .position-grid input,
  .sensitive-toggle input { width: 15px; height: 15px; accent-color: var(--cl-accent); }
  .textarea { min-height: 90px; resize: vertical; }
</style>
