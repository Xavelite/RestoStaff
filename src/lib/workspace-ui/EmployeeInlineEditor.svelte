<script lang="ts">
  import { onMount } from 'svelte';
  import { addDays, WEEKDAYS, type ServiceKey } from '$lib/calendar/date';
  import { friendlyError } from '$lib/api/error-messages';
  import Dialog from '$lib/components/Dialog.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { unsavedChanges } from '$lib/navigation/unsaved-changes.svelte';
  import { validateEmployeeEmploymentTerms } from '$lib/payroll/payroll-api';
  import type { EmployeeDraft } from '$lib/team/team-model';
  import { belgianNissIssue } from '$lib/team/belgian-identifiers';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { areaInstanceLabelMap } from '$lib/restaurant/area-instance';
  import { teamDraft } from './workspace-team.svelte';
  import WorkspaceStatus from './WorkspaceStatus.svelte';

  type Mode = 'people' | 'contract' | 'payroll';

  let {
    employeeId,
    mode,
    saving = false,
    isNew = false,
    onclose,
    onsave
  }: {
    employeeId: string;
    mode: Mode;
    saving?: boolean;
    isNew?: boolean;
    onclose: () => void;
    onsave: (employee: EmployeeDraft) => void | Promise<void>;
  } = $props();

  let form = $state<EmployeeDraft | null>(null);
  let original = $state<EmployeeDraft | null>(null);
  let baseline = $state('');
  let loadedId = '';
  let section = $state<Mode>('people');
  let revealSensitive = $state(false);
  let committing = $state(false);

  const snapshot = $derived(workspace.team);
  const restaurant = $derived(workspace.restaurant);
  const services = $derived(
    (restaurant?.services ?? [])
      .filter((service) => service.active)
      .toSorted((left, right) => left.sort_order - right.sort_order)
  );
  const areaName = $derived(
    areaInstanceLabelMap(restaurant?.work_areas ?? [])
  );
  const canManageOperations = $derived(workspace.canManageOperations);
  const canViewFinancials = $derived(workspace.canViewFinancials);
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
  const localDirty = $derived(Boolean(form && baseline && JSON.stringify(form) !== baseline));
  const busy = $derived(saving || committing);
  const nissIssue = $derived(belgianNissIssue(form?.nationalRegistryNumber));
  const payrollContext = $derived(mode === 'payroll');
  const today = new Date().toISOString().slice(0, 10);

  function clone(employee: EmployeeDraft): EmployeeDraft {
    return {
      ...employee,
      jobFunctionIds: [...employee.jobFunctionIds],
      jobFunctionAreaIds: { ...employee.jobFunctionAreaIds },
      recurringSlots: employee.recurringSlots.map((slot) => ({ ...slot }))
    };
  }

  $effect(() => {
    if (!employeeId || employeeId === loadedId) return;
    const employee = teamDraft.clone(employeeId);
    form = employee ? clone(employee) : null;
    original = employee ? clone(employee) : null;
    baseline = employee ? JSON.stringify(employee) : '';
    section = mode;
    revealSensitive = false;
    loadedId = employeeId;
  });

  onMount(() =>
    unsavedChanges.register({
      id: `employee-editor:${employeeId}`,
      label: 'Employee details',
      priority: 20,
      isDirty: () => localDirty,
      save: commit,
      discard: discardNow
    })
  );

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
      ? [...new Set([...form.jobFunctionIds, id])]
      : form.jobFunctionIds.filter((item) => item !== id);
    if (!enabled && form.jobFunctionAreaIds[id]) {
      const next = { ...form.jobFunctionAreaIds };
      delete next[id];
      form.jobFunctionAreaIds = next;
    }
  }

  function makePrimary(id: string) {
    if (!form || !form.jobFunctionIds.includes(id)) return;
    form.jobFunctionIds = [id, ...form.jobFunctionIds.filter((item) => item !== id)];
  }

  function areasForPosition(positionId: string) {
    const areas = restaurant?.work_areas.filter((area) => area.active) ?? [];
    const linkedIds = new Set(
      (restaurant?.job_function_areas ?? [])
        .filter(
          (relation) =>
            relation.active && relation.job_function_id === positionId
        )
        .map((relation) => relation.area_id)
    );
    return linkedIds.size ? areas.filter((area) => linkedIds.has(area.id)) : areas;
  }

  function setPositionArea(positionId: string, areaId: string) {
    if (!form) return;
    form.jobFunctionAreaIds = {
      ...form.jobFunctionAreaIds,
      [positionId]: areaId
    };
    if (!areaId) {
      const next = { ...form.jobFunctionAreaIds };
      delete next[positionId];
      form.jobFunctionAreaIds = next;
    }
  }

  function toggleRecurring(weekday: number, serviceKey: ServiceKey, enabled: boolean) {
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
    } else {
      form.cp302Category = '';
      form.workerStatus = '';
    }
  }

  function referenceLabel(code: string): string {
    const reference = catalogue?.referenceFunctions.find((item) => item.code === code);
    if (!reference) return code || t('Not set');
    return `${reference.code} · ${reference.name_en || reference.name_fr || reference.name_nl}`;
  }

  function startContractRenewal() {
    if (!form || !canManageOperations) return;
    form.contractId = '';
    form.contractStart = form.contractEnd ? addDays(form.contractEnd, 1) : today;
    form.contractEnd = '';
    form.employmentValidFrom = form.contractStart;
    toasts.show(t('A new contract version is ready. Review it, then save.'), 'info');
  }

  async function validateEmployment() {
    if (!workspace.activeId || !currentEmploymentTerms || !savedEmployee || busy) {
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

  function validate(): void {
    if (!form?.displayName.trim()) throw new Error(t('Employee name is required.'));
    if (form.contractEnd && form.contractStart && form.contractEnd < form.contractStart) {
      throw new Error(t('Contract end date must be after the start date.'));
    }
    if (form.employmentValidTo && form.employmentValidFrom && form.employmentValidTo < form.employmentValidFrom) {
      throw new Error(t('Employment end date must be after the effective date.'));
    }
  }

  async function commit() {
    if (!form || committing) return;
    validate();
    committing = true;
    try {
      await onsave(clone(form));
      baseline = JSON.stringify(form);
      original = clone(form);
      onclose();
    } finally {
      committing = false;
    }
  }


  async function toggleArchive() {
    if (!form || busy || !savedEmployee) return;
    if (form.active) {
      const confirmed = await confirmAction({
        title: 'Archive this employee?',
        body: 'The employee will disappear from new planning, badge access will be disabled and historical shifts, timesheets, absences and exports will be preserved.',
        confirmLabel: 'Archive employee',
        cancelLabel: 'Keep active',
        tone: 'danger'
      });
      if (!confirmed) return;
      form.active = false;
    } else {
      form.active = true;
    }
    await commit();
  }

  function discardNow() {
    if (isNew) teamDraft.remove(employeeId);
    else if (original) teamDraft.update(employeeId, clone(original));
    baseline = form ? JSON.stringify(form) : '';
    onclose();
  }

  async function requestClose() {
    if (!localDirty) {
      if (isNew) teamDraft.remove(employeeId);
      onclose();
      return;
    }
    const discard = await confirmAction({
      title: 'Discard employee changes?',
      body: 'The profile, contract or payroll changes in this employee window have not been saved.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      tone: 'danger'
    });
    if (discard) {
      discardNow();
    }
  }

  const title = $derived(isNew ? 'Add employee' : 'Employee details');
</script>

<Dialog
  open
  size="large"
  title={title}
  description={form?.displayName || 'Complete the employee profile, contract and payroll preparation.'}
  onclose={() => void requestClose()}
>
  {#if form}
    <nav class="editor-tabs" aria-label={t('Employee sections')}>
      <button type="button" class:is-active={section === 'people'} onclick={() => (section = 'people')}>{t('Profile')}</button>
      <button type="button" class:is-active={section === 'contract'} onclick={() => (section = 'contract')}>{t('Contract')}</button>
      {#if canViewFinancials && payrollContext}<button type="button" class:is-active={section === 'payroll'} onclick={() => (section = 'payroll')}>{t('Payroll preparation')}</button>{/if}
    </nav>

    {#if section === 'people'}
      <div class="cl-formgrid">
        <div class="cl-form-section">{t('Identity')}</div>
        <label class="cl-label"><span>{t('Display name')}</span><input class="cl-field" required bind:value={form.displayName} /></label>
        <div class="cl-label">
          <span>{t('Employee status')}</span>
          <div class="status-readonly">
            <WorkspaceStatus label={form.active ? 'Active' : 'Archived'} tone={form.active ? 'ok' : 'attention'} />
          </div>
        </div>
        <label class="cl-label"><span>{t('First name')}</span><input class="cl-field" bind:value={form.firstName} /></label>
        <label class="cl-label"><span>{t('Last name')}</span><input class="cl-field" bind:value={form.lastName} /></label>

        <fieldset class="position-field is-wide">
          <legend>{t('Positions / job functions')}</legend>
          {#if jobFunctions.length}
            <div class="position-grid">
              {#each jobFunctions as item (item.id)}
                {@const selected = form.jobFunctionIds.includes(item.id)}
                {@const availableAreas = areasForPosition(item.id)}
                <div class:is-selected={selected}>
                  <label>
                    <input type="checkbox" checked={selected} onchange={(event) => togglePosition(item.id, event.currentTarget.checked)} />
                    <span>{item.name}</span>
                  </label>
                  {#if selected && availableAreas.length}
                    <select
                      aria-label={`${t('Preferred area')} · ${item.name}`}
                      value={form.jobFunctionAreaIds[item.id] ?? ''}
                      onchange={(event) => setPositionArea(item.id, event.currentTarget.value)}
                    >
                      <option value="">{t('Any linked area')}</option>
                      {#each availableAreas as area (area.id)}
                        <option value={area.id}>{areaName.get(area.id) ?? area.name}</option>
                      {/each}
                    </select>
                  {/if}
                  {#if selected}
                    <button type="button" class:is-primary={form.jobFunctionIds[0] === item.id} title={t('Set as primary position')} onclick={() => makePrimary(item.id)}>{form.jobFunctionIds[0] === item.id ? t('Primary') : t('Make primary')}</button>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <p class="field-empty">{t('Create positions in Restaurant before assigning them to employees.')}</p>
          {/if}
        </fieldset>

        <div class="cl-form-section">{t('Contact')}</div>
        <label class="cl-label"><span>{t('Email')}</span><input class="cl-field" type="email" bind:value={form.email} /></label>
        <label class="cl-label"><span>{t('Phone')}</span><input class="cl-field" type="tel" bind:value={form.phone} /></label>
        <label class="cl-label is-wide"><span>{t('Address')}</span><input class="cl-field" bind:value={form.address} /></label>
        <label class="cl-label"><span>{t('Postal code')}</span><input class="cl-field" bind:value={form.postalCode} /></label>
        <label class="cl-label"><span>{t('City')}</span><input class="cl-field" bind:value={form.city} /></label>

        <div class="cl-form-section">{t('Emergency contact')}</div>
        <label class="cl-label"><span>{t('Name')}</span><input class="cl-field" bind:value={form.emergencyName} /></label>
        <label class="cl-label"><span>{t('Relationship')}</span><input class="cl-field" bind:value={form.emergencyRelation} /></label>
        <label class="cl-label"><span>{t('Emergency phone')}</span><input class="cl-field" type="tel" bind:value={form.emergencyPhone} /></label>

        {#if canManageOperations}
          <div class="cl-form-section">{t('Legal identity')}</div>
          <label class="cl-label"><span>{t('Birth date')}</span><input class="cl-field" type="date" bind:value={form.birthDate} /></label>
          {#if canViewFinancials}
            <label class="cl-label"><span>{t('National registry number')}</span><input class="cl-field" aria-invalid={Boolean(nissIssue)} bind:value={form.nationalRegistryNumber} />{#if nissIssue}<small class="cl-field-warning">{t(nissIssue)} {t('You can still save the employee and complete this later.')}</small>{/if}</label>
          {/if}
          <label class="cl-label"><span>{t('Sex')}</span><input class="cl-field" bind:value={form.sex} /></label>
          <label class="cl-label"><span>{t('Nationality')}</span><input class="cl-field" bind:value={form.nationality} /></label>
          <label class="cl-label"><span>{t('Language')}</span><input class="cl-field" bind:value={form.language} /></label>
        {/if}

        <label class="cl-label is-wide"><span>{t('Notes')}</span><textarea class="cl-field textarea" bind:value={form.notes}></textarea></label>
      </div>
    {:else if section === 'contract'}
      <div class="cl-formgrid">
        <div class="cl-form-section">{t('Employment contract')}</div>
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
          <div
            class="cl-checkgrid is-wide"
            style={`grid-template-columns:minmax(110px,1fr) repeat(${services.length},70px)`}
          >
            <strong>{t('Day')}</strong>
            {#each services as service (service.service_key)}
              <strong>{t(service.name)}</strong>
            {/each}
            {#each WEEKDAYS as day, index}
              <span>{t(day)}</span>
              {#each services as service (service.service_key)}
                <label>
                  <input
                    type="checkbox"
                    checked={form.recurringSlots.some(
                      (slot) =>
                        slot.weekday === index + 1 &&
                        slot.serviceKey === service.service_key
                    )}
                    onchange={(event) =>
                      toggleRecurring(
                        index + 1,
                        service.service_key,
                        event.currentTarget.checked
                      )}
                  />
                </label>
              {/each}
            {/each}
          </div>
        {/if}

        {#if canManageOperations && savedEmployee}
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
                <div><strong>{contractTypes.find((item) => item.id === contract.contract_type_id)?.name ?? t('Contract')}</strong><span>{contract.contract_start || t('No start')} → {contract.contract_end || t('Open ended')}</span></div>
                <em>{t(contract.is_current && contract.active ? 'Current' : 'Historical')}</em>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      {#if teamDraft.supplementaryLoading}
        <div class="editor-state">{t('Loading payroll setup…')}</div>
      {:else if teamDraft.supplementaryError}
        <div class="editor-state is-error" role="alert">{teamDraft.supplementaryError}</div>
      {/if}
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
        <label class="cl-label"><span>{t('National registry number')}</span><input class="cl-field" type={revealSensitive ? 'text' : 'password'} aria-invalid={Boolean(nissIssue)} bind:value={form.nationalRegistryNumber} />{#if nissIssue}<small class="cl-field-warning">{t(nissIssue)} {t('You can still save the employee and complete this later.')}</small>{/if}</label>
        <label class="cl-label"><span>{t('Birth date')}</span><input class="cl-field" type="date" bind:value={form.birthDate} /></label>
        <label class="cl-label"><span>IBAN</span><input class="cl-field" type={revealSensitive ? 'text' : 'password'} bind:value={form.iban} /></label>
        <label class="cl-label"><span>BIC</span><input class="cl-field" bind:value={form.bic} /></label>
        <label class="cl-label"><span>{t('Budget hourly wage')}</span><input class="cl-field" type="number" min="0" step="0.01" bind:value={form.hourlyWageRate} /></label>
        <label class="cl-label"><span>{t('Estimated hourly cost')}</span><input class="cl-field" type="number" min="0" step="0.01" bind:value={form.estimatedHourlyCost} /></label>
        <label class="cl-label is-wide"><span>{t('Company cost formula')}</span><input class="cl-field" bind:value={form.companyCostFormula} /></label>
        <label class="cl-label is-wide"><span>{t('Payroll notes')}</span><textarea class="cl-field textarea" bind:value={form.payrollNotes}></textarea></label>
      </div>


      <div class="cl-notice is-wide">{t('Advanced tax, benefit and regime-evidence settings are parked until a concrete social-secretariat or estimation requirement needs them.')}</div>
    {/if}
  {:else}
    <div class="editor-state is-error" role="alert">{t('This employee could not be opened.')}</div>
  {/if}

  {#snippet footer()}
    {#if savedEmployee}
      <button class="cl-btn archive-action" class:is-restore={!form?.active} type="button" disabled={busy} onclick={() => void toggleArchive().catch((error) => toasts.show(friendlyError(error), 'danger'))}>{t(form?.active ? 'Archive employee' : 'Reactivate employee')}</button>
    {/if}
    {#if section === 'payroll' && savedEmployee}
      <button class="cl-btn" type="button" disabled={busy || !currentEmploymentTerms} onclick={validateEmployment}>{t('Validate setup')}</button>
    {/if}
    <span class="editor-spacer"></span>
    <button class="cl-btn" type="button" disabled={busy} onclick={() => void requestClose()}>{t('Cancel')}</button>
    <button class="cl-btn is-primary" type="button" disabled={busy || !form || !localDirty} onclick={() => void commit().catch((error) => toasts.show(friendlyError(error), 'danger'))}>{busy ? t('Saving…') : t('Save employee')}</button>
  {/snippet}
</Dialog>

<style>
  .editor-tabs { display: flex; gap: 4px; margin: -4px 0 16px; padding-bottom: 10px; border-bottom: 1px solid var(--cl-line); }
  .editor-tabs button { min-height: 34px; padding: 6px 11px; border: 1px solid transparent; border-radius: var(--cl-radius); color: var(--cl-muted); background: transparent; font: inherit; font-size: 13px; font-weight: var(--rst-fw-medium); cursor: pointer; }
  .editor-tabs button:hover { color: var(--cl-ink); background: var(--cl-surface-muted); }
  .editor-tabs button.is-active { color: var(--cl-accent); border-color: var(--cl-line); background: var(--cl-accent-wash); }
  .editor-spacer { margin-left: auto; }
  .archive-action { color: var(--cl-problem); }
  .archive-action.is-restore { color: var(--cl-ok); }
  .status-readonly { min-height: 2.5rem; display: flex; align-items: center; gap: 10px; padding: 6px 8px; border: 1px solid var(--cl-line); border-radius: var(--cl-radius); background: var(--cl-surface-muted); }
  .position-field { padding: 12px; border: 1px solid var(--cl-line); border-radius: var(--cl-radius); }
  .position-field legend { padding: 0 5px; color: var(--cl-muted); font-size: 13px; font-weight: var(--rst-fw-medium); }
  .position-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
  .position-grid > div { min-height: 40px; display: grid; grid-template-columns: minmax(0, 1fr); align-items: center; gap: 8px; padding: 7px 9px; border: 1px solid var(--cl-line); border-radius: var(--cl-radius); background: var(--cl-surface-muted); font-size: 13px; }
  .position-grid > div.is-selected { grid-column: 1 / -1; grid-template-columns: minmax(150px, 1fr) minmax(150px, .9fr) auto; border-color: var(--cl-line-strong); background: var(--cl-accent-wash); }
  .position-grid label { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: center; gap: 8px; cursor: pointer; }
  .position-grid select { min-width: 0; height: 30px; padding: 0 28px 0 9px; border: 1px solid var(--cl-line); border-radius: 5px; background: var(--cl-surface); color: var(--cl-ink); font: inherit; font-size: 11px; }
  .position-grid button { padding: 3px 7px; border: 0; border-radius: 4px; color: var(--cl-muted); background: transparent; font: inherit; font-size: 11px; cursor: pointer; }
  .position-grid button.is-primary { color: var(--cl-accent); font-weight: var(--rst-fw-bold); }
  .position-grid input, .sensitive-toggle input { width: 15px; height: 15px; accent-color: var(--cl-accent); }
  .field-empty { margin: 0; color: var(--cl-muted); font-size: 13px; }
  .sensitive-toggle { display: inline-flex; align-items: center; gap: 7px; color: var(--cl-ink); font-size: 13px; }
  .contract-actions { display: flex; align-items: center; gap: 12px; padding-top: 4px; }
  .contract-actions small { color: var(--cl-muted); font-size: 12px; }
  .contract-history { display: grid; border: 1px solid var(--cl-line); border-radius: var(--cl-radius); overflow: hidden; }
  .contract-history article { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-top: 1px solid var(--cl-line); }
  .contract-history article:first-child { border-top: 0; }
  .contract-history article.is-current { background: var(--cl-surface-muted); }
  .contract-history div { display: grid; gap: 3px; }
  .contract-history strong { font-size: 13px; }
  .contract-history span, .contract-history em { color: var(--cl-muted); font-size: 12px; font-style: normal; }
  .textarea { min-height: 90px; resize: vertical; }
  .editor-state { padding: 14px; border: 1px solid var(--cl-line); border-radius: var(--cl-radius); color: var(--cl-muted); background: var(--cl-surface-muted); font-size: 13px; }
  .editor-state.is-error { color: var(--cl-problem); border-color: var(--cl-problem-line); background: var(--cl-problem-wash); }

  @media (max-width: 760px) {
    .editor-tabs { overflow-x: auto; }
    .position-grid { grid-template-columns: minmax(0, 1fr); }
    .position-grid > div { grid-template-columns: minmax(0, 1fr); }
    .position-grid > div.is-selected { grid-column: 1; grid-template-columns: minmax(0, 1fr); }
    .position-grid button { justify-self: start; }
  }
</style>
