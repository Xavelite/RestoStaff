<script lang="ts">
  import {
    inviteEmployee,
    revokeEmployeeInvitation,
    saveAbsence,
    saveTeam,
    setEmployeeAccessState
  } from '$lib/api/mutations';
  import { leaveBalanceForEmployee } from '$lib/absence/leave-balance';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import HeroReadiness from '$lib/components/HeroReadiness.svelte';
  import PageHero from '$lib/components/PageHero.svelte';
  import Drawer from '$lib/components/Drawer.svelte';
  import FeedbackBanner from '$lib/components/FeedbackBanner.svelte';
  import LeaveBalanceSummary from '$lib/team/LeaveBalanceSummary.svelte';
  import Panel from '$lib/components/Panel.svelte';
  import SaveActions from '$lib/components/SaveActions.svelte';
  import { addDays, serviceLabel, todayInTimezone, WEEKDAYS } from '$lib/calendar/date';
  import { defaultWorkRegime } from '$lib/domain/operations';
  import {
    employeeDrafts,
    employmentTermsPayload,
    newEmployeeDraft,
    teamSetupSteps,
    teamSavePayload,
    type EmployeeDraft
  } from '$lib/team/team-model';
  import {
    getEmployeeEmploymentTerms,
    getPayrollCatalogue,
    saveEmployeeEmploymentTerms,
    validateEmployeeEmploymentTerms
  } from '$lib/payroll/payroll-api';
  import type { PayrollCatalogue } from '$lib/payroll/payroll-model';
  import EmployeePayrollDetails from '$lib/payroll/EmployeePayrollDetails.svelte';
  import { amountForMinutes, formatCents, parseHourlyRate } from '$lib/payroll-engine/money';
  import type { Tables } from '$lib/supabase/database.types';
  import TeamAccessPanel from '$lib/team/TeamAccessPanel.svelte';
  import { confirmAction } from '$lib/ui/confirm.svelte';
  import { workspace } from '$lib/workspace/workspace.svelte';
  import { workspaceRealtime } from '$lib/realtime/workspace-realtime.svelte';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { personInitials } from '$lib/ui/person';

  const tabs = ['General', 'Access', 'Contract', 'Payroll', 'Absences'] as const;
  type Tab = (typeof tabs)[number];

  const snapshot = $derived(workspace.team);
  const role = $derived(workspace.active?.role ?? 'employee');
  const owner = $derived(role === 'owner');
  const today = $derived(
    todayInTimezone(snapshot?.restaurant_settings.timezone || 'Europe/Brussels')
  );
  let drafts = $state<EmployeeDraft[]>([]);
  let selectedId = $state('');
  let detailOpen = $state(false);
  let tab = $state<Tab>('General');
  let loadedSnapshot = $state('');
  let baseline = $state('');
  let saving = $state(false);
  let feedback = $state('');
  let feedbackTone = $state<'info' | 'success' | 'warning' | 'danger'>('info');
  let absenceTypeId = $state('');
  let absenceStart = $state('');
  let absenceEnd = $state('');
  let absenceService = $state('');
  let absenceComment = $state('');
  let inviting = $state(false);
  let inviteRole = $state<'employee' | 'manager'>('employee');
  let inviteRoleEmployeeId = $state('');
  let expandedContractId = $state('');
  let expandedAbsenceId = $state('');
  let revealPayroll = $state(false);
  let employmentTerms = $state<Tables<'employee_employment_terms'>[]>([]);
  let employmentTermsLoading = $state(false);
  let employmentTermsRestaurantId = $state('');
  let employmentTermsError = $state('');
  let payrollCatalogue = $state<PayrollCatalogue | null>(null);
  let cp302Search = $state('');

  $effect(() => {
    if (workspace.activeId && role !== 'employee') {
      void workspace.loadTeam(true).catch(() => undefined);
    }
  });

  $effect(() => {
    if (!workspace.activeId || !owner || employmentTermsLoading || employmentTermsRestaurantId === workspace.activeId) return;
    const restaurantId = workspace.activeId;
    employmentTermsRestaurantId = restaurantId;
    employmentTermsLoading = true;
    employmentTermsError = '';
    void Promise.all([
      getEmployeeEmploymentTerms(restaurantId),
      getPayrollCatalogue(restaurantId)
    ])
      .then(([rows, catalogue]) => {
        employmentTerms = rows;
        payrollCatalogue = catalogue;
      })
      .catch((error) => {
        employmentTerms = [];
        payrollCatalogue = null;
        employmentTermsError = error instanceof Error ? error.message : String(error);
        feedback = employmentTermsError;
        feedbackTone = 'danger';
      })
      .finally(() => (employmentTermsLoading = false));
  });

  const selected = $derived(drafts.find((employee) => employee.id === selectedId) ?? null);
  const selectedContractTypeCode = $derived(
    snapshot?.contract_types.find((item) => item.id === selected?.contractTypeId)?.code ?? ''
  );
  const selectedReferenceFunction = $derived(
    payrollCatalogue?.referenceFunctions.find(
      (item) => item.code === selected?.cp302ReferenceFunctionCode
    ) ?? null
  );
  const referenceFunctionOptions = $derived(
    (payrollCatalogue?.referenceFunctions ?? [])
      .filter((item) => item.status === 'effective' || item.status === 'verified')
      .sort((left, right) =>
        referenceFunctionLabel(left).localeCompare(referenceFunctionLabel(right), i18n.intlLocale)
      )
  );
  const scheduleRegimeHint = $derived(
    selected?.workRegime === 'fixed_schedule'
      ? 'Their recurring contract shifts are the Schedule baseline.'
      : selected?.workRegime === 'manager_only'
        ? 'You place every shift. They are never asked for availability.'
        : 'They tell you each week when they can work.'
  );
  const selectedAccessRole = $derived(
    selected?.accessRole || selected?.invitationRole || 'employee'
  );
  const canManageSelectedAccess = $derived(
    Boolean(
      selected &&
      selectedAccessRole !== 'owner' &&
      (owner || selectedAccessRole === 'employee')
    )
  );
  function employeeIssues(employee: EmployeeDraft): Array<{ label: string; tab: Tab; tone: 'warning' | 'danger' | 'info' }> {
    const issues: Array<{ label: string; tab: Tab; tone: 'warning' | 'danger' | 'info' }> = [];
    if (!employee.jobFunctionIds.length) {
      issues.push({ label: 'No position', tab: 'General', tone: 'warning' });
    }
    if (
      employee.active &&
      (
        !employee.email ||
        ['not_invited', 'expired', 'revoked'].includes(employee.accessState)
      )
    ) {
      issues.push({ label: 'Access not ready', tab: 'Access', tone: 'warning' });
    }
    if (owner && employee.active && (!employee.contractTypeId || !employee.contractStart)) {
      issues.push({ label: 'Contract missing', tab: 'Contract', tone: 'warning' });
    }
    if (owner && employee.active && employee.contractTypeId && !employee.cp302ReferenceFunctionCode) {
      issues.push({ label: 'CP 302 function missing', tab: 'Payroll', tone: 'warning' });
    }
    if (
      owner &&
      employee.active &&
      (!employee.payrollEmployeeId || !employee.nationalRegistryNumber)
    ) {
      issues.push({ label: 'Payroll missing', tab: 'Payroll', tone: 'danger' });
    }
    return issues;
  }

  function employeeIssueCount(employee: EmployeeDraft): number {
    return employeeIssues(employee).length;
  }

  function positionLabel(employee: EmployeeDraft) {
    return (
      employee.jobFunctionIds
        .map((id) => snapshot?.job_functions.find((item) => item.id === id)?.name)
        .filter(Boolean)
        .join(', ') || 'No position'
    );
  }

  function maskValue(value: string) {
    if (!value) return '';
    const tail = value.slice(-4);
    return value.length <= 4 ? '•'.repeat(value.length) : `${'•'.repeat(Math.min(value.length - 4, 10))} ${tail}`;
  }

  const employeeAbsences = $derived(
    snapshot?.absences
      .filter((absence) => absence.employee_id === selectedId)
      .sort((a, b) => b.start_date.localeCompare(a.start_date)) ?? []
  );
  const dirty = $derived(JSON.stringify(drafts) !== baseline);
  const activeEmployees = $derived(drafts.filter((employee) => employee.active));
  const issueEmployees = $derived(
    drafts.filter((employee) => employeeIssueCount(employee) > 0)
  );
  const contractHistory = $derived(
    snapshot?.employee_contracts
      .filter((contract) => contract.employee_id === selectedId)
      .sort((left, right) =>
        (right.contract_start ?? right.created_at).localeCompare(
          left.contract_start ?? left.created_at
        )
      ) ?? []
  );
  const leaveBalance = $derived.by(() => {
    return selected && snapshot
      ? leaveBalanceForEmployee(snapshot, selected.id, today)
      : { entitlement: 0, approved: 0, pending: 0, remaining: 0 };
  });
  const estimatedWeeklyCostCents = $derived.by(() => {
    if (!selected) return 0n;
    const rate = parseHourlyRate(String(selected.estimatedHourlyCost || 0));
    return rate
      ? amountForMinutes(Math.round((selected.weeklyContractHours || 0) * 60), BigInt(rate.replace('.', '')))
      : 0n;
  });
  const payrollReady = $derived(
    activeEmployees.filter((employee) => {
      const payroll = snapshot?.employee_payroll_profiles.find(
        (profile) => profile.employee_id === employee.id
      );
      const legal = snapshot?.employee_legal_profiles.find(
        (profile) => profile.employee_id === employee.id
      );
      return Boolean(payroll?.payroll_employee_id && legal?.national_registry_number);
    }).length
  );
  const readinessPercent = $derived(
    activeEmployees.length
      ? Math.round(((activeEmployees.length - issueEmployees.length) / activeEmployees.length) * 100)
      : 100
  );
  const accessReady = $derived(
    activeEmployees.filter(
      (employee) =>
        employee.email &&
        !['not_invited', 'expired', 'revoked'].includes(employee.accessState)
    ).length
  );
  const contractReady = $derived(
    activeEmployees.filter((employee) => employee.contractTypeId && employee.contractStart).length
  );
  const assignmentReady = $derived(
    activeEmployees.filter((employee) => employee.jobFunctionIds.length > 0).length
  );
  const openIssueCount = $derived(
    issueEmployees.reduce((total, employee) => total + employeeIssueCount(employee), 0)
  );
  const readinessCards = $derived(owner
    ? [
        { label: t('Access'), value: `${accessReady}/${activeEmployees.length}`, complete: activeEmployees.length > 0 && accessReady === activeEmployees.length },
        { label: t('Contracts'), value: `${contractReady}/${activeEmployees.length}`, complete: activeEmployees.length > 0 && contractReady === activeEmployees.length },
        { label: t('Payroll'), value: `${payrollReady}/${activeEmployees.length}`, complete: activeEmployees.length > 0 && payrollReady === activeEmployees.length }
      ]
    : [
        { label: t('Access'), value: `${accessReady}/${activeEmployees.length}`, complete: activeEmployees.length > 0 && accessReady === activeEmployees.length },
        { label: t('Positions'), value: `${assignmentReady}/${activeEmployees.length}`, complete: activeEmployees.length > 0 && assignmentReady === activeEmployees.length },
        { label: t('Active team'), value: activeEmployees.length, complete: activeEmployees.length > 0 }
      ]
  );
  const tabItems = $derived<Array<{ id: Tab; label: Tab }>>(
    tabs
      .filter((item) => owner || !['Contract', 'Payroll'].includes(item))
      .map((item) => ({ id: item, label: item }))
  );
  const setupSteps = $derived(
    teamSetupSteps({
      owner,
      activeEmployees,
      payrollReady,
      onSelect: focusStaffGrid
    })
  );
  const setupIncomplete = $derived(setupSteps.some((step) => !step.complete));

  $effect(() => {
    if (!snapshot) return;
    const key = [
      snapshot.restaurant.updated_at,
      snapshot.employees.length,
      snapshot.employee_contracts.length,
      snapshot.employee_access
        .map((item) => `${item.employee_id}:${item.updated_at}`)
        .join('|'),
      snapshot.employee_invitation_states
        .map((item) => `${item.id}:${item.status}:${item.sent_at}`)
        .join('|'),
      employmentTerms
        .map((item) => `${item.id}:${item.version_number}:${item.active}:${item.source_status}`)
        .join('|')
    ].join('::');
    if (key === loadedSnapshot) return;
    drafts = employeeDrafts(snapshot, employmentTerms);
    baseline = JSON.stringify(drafts);
    loadedSnapshot = key;
  });

  $effect(() => {
    if (!selected || selected.id === inviteRoleEmployeeId) return;
    inviteRoleEmployeeId = selected.id;
    inviteRole =
      selected.accessRole === 'manager' || selected.invitationRole === 'manager'
        ? 'manager'
        : 'employee';
    expandedContractId = '';
    expandedAbsenceId = '';
    revealPayroll = false;
    cp302Search = selected.cp302ReferenceFunctionCode
      ? referenceFunctionLabel(
          payrollCatalogue?.referenceFunctions.find(
            (item) => item.code === selected.cp302ReferenceFunctionCode
          )
        )
      : '';
  });

  function referenceFunctionLabel(
    item: PayrollCatalogue['referenceFunctions'][number] | undefined
  ): string {
    if (!item) return '';
    const name = i18n.locale === 'fr'
      ? item.name_fr
      : i18n.locale === 'nl'
        ? item.name_nl
        : item.name_en || item.name_fr;
    return `${item.code} · ${name}`;
  }

  function selectReferenceFunction(value: string) {
    const match = referenceFunctionOptions.find(
      (item) => referenceFunctionLabel(item) === value || item.code === value.trim()
    );
    cp302Search = value;
    if (!match) return;
    cp302Search = referenceFunctionLabel(match);
    mutate({
      cp302ReferenceFunctionCode: match.code,
      cp302Category: match.category,
      workerStatus: match.default_worker_status ?? ''
    });
  }

  function toggleContractExpand(contractId: string) {
    expandedContractId = expandedContractId === contractId ? '' : contractId;
  }

  function toggleAbsenceExpand(absenceId: string) {
    expandedAbsenceId = expandedAbsenceId === absenceId ? '' : absenceId;
  }

  function openEmployee(id: string) {
    selectedId = id;
    tab = 'General';
    detailOpen = true;
  }

  function focusStaffGrid() {
    const targetId = issueEmployees.length > 0 ? 'attention-panel' : 'staff-grid';
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function mutate(changes: Partial<EmployeeDraft>) {
    drafts = drafts.map((employee) =>
      employee.id === selectedId ? { ...employee, ...changes } : employee
    );
  }

  function toggleJobFunction(jobFunctionId: string, checked: boolean) {
    if (!selected) return;
    mutate({
      jobFunctionIds: checked
        ? [...new Set([...selected.jobFunctionIds, jobFunctionId])]
        : selected.jobFunctionIds.filter((id) => id !== jobFunctionId)
    });
  }

  function toggleRecurring(
    weekday: number,
    serviceKey: 'lunch' | 'evening',
    checked: boolean
  ) {
    if (!selected) return;
    const remaining = selected.recurringSlots.filter(
      (slot) => !(slot.weekday === weekday && slot.serviceKey === serviceKey)
    );
    mutate({
      recurringSlots: checked
        ? [...remaining, { weekday, serviceKey }]
        : remaining
    });
  }

  function addEmployee() {
    const employee = newEmployeeDraft(crypto.randomUUID());
    drafts = [...drafts, employee];
    openEmployee(employee.id);
  }

  function startContractRenewal() {
    if (!selected || !owner) return;
    mutate({
      contractId: '',
      contractStart: selected.contractEnd ? addDays(selected.contractEnd, 1) : today,
      contractEnd: ''
    });
    feedback = 'A new contract version is ready. Review it, then save Team.';
    feedbackTone = 'info';
  }

  function cancelChanges() {
    if (!snapshot) return;
    drafts = employeeDrafts(snapshot, employmentTerms);
    baseline = JSON.stringify(drafts);
    feedback = '';
  }

  async function persistTeam() {
    if (!snapshot || !workspace.activeId || saving) return;
    if (owner && (employmentTermsLoading || employmentTermsError)) {
      feedback = employmentTermsLoading
        ? 'Employment terms are still loading.'
        : 'Employment terms could not be loaded. Reload Team before saving.';
      feedbackTone = 'danger';
      return;
    }
    if (drafts.some((employee) => !employee.displayName.trim())) {
      feedback = 'Every employee needs a display name.';
      feedbackTone = 'danger';
      return;
    }
    saving = true;
    feedback = '';
    try {
      const termUpdates = owner
        ? drafts.filter((employee) => employmentTermsChanged(employee))
        : [];
      await saveTeam(
        workspace.activeId,
        teamSavePayload(workspace.activeId, drafts, role)
      );
      await workspace.loadTeam(true);
      const refreshedDrafts = workspace.team
        ? employeeDrafts(workspace.team, employmentTerms)
        : [];
      for (const employee of termUpdates) {
        const refreshed = refreshedDrafts.find((item) => item.id === employee.id);
        if (!refreshed) {
          throw new Error(`Saved employee ${employee.displayName} could not be reloaded.`);
        }
        await saveEmployeeEmploymentTerms({
          restaurantId: workspace.activeId,
          employeeId: employee.id,
          terms: employmentTermsPayload({
            ...refreshed,
            employmentValidFrom: employee.employmentValidFrom,
            weeklyHoursRegime: employee.weeklyHoursRegime,
            referencePeriodWeeks: employee.referencePeriodWeeks,
            salaryBasis: employee.salaryBasis,
            cp302ReferenceFunctionCode: employee.cp302ReferenceFunctionCode,
            functionSeniorityDate: employee.functionSeniorityDate,
            companySeniorityDate: employee.companySeniorityDate,
            contractualHourlyRate: employee.contractualHourlyRate,
            contractualMonthlySalary: employee.contractualMonthlySalary,
            annualLeaveEntitlementDays: employee.annualLeaveEntitlementDays
          })
        });
      }
      if (owner) {
        employmentTerms = await getEmployeeEmploymentTerms(workspace.activeId);
      }
      await workspace.loadTeam(true);
      await workspaceRealtime.publish('team-updated', {
        restaurantId: workspace.activeId,
        source: 'team'
      });
      if (workspace.team) baseline = JSON.stringify(employeeDrafts(workspace.team, employmentTerms));
      feedback = 'Team saved.';
      feedbackTone = 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }

  function employmentTermsChanged(employee: EmployeeDraft): boolean {
    const payload = employmentTermsPayload(employee);
    if (!payload.valid_from) return false;
    const current = employmentTerms
      .filter((item) => item.employee_id === employee.id && item.active)
      .sort((left, right) => right.valid_from.localeCompare(left.valid_from))[0];
    if (!current) return true;
    const employmentTypeCode = snapshot?.contract_types.find(
      (item) => item.id === employee.contractTypeId
    )?.code ?? 'CUSTOM';
    const expectedValidTo = employmentTypeCode === 'CDI' ? null : employee.contractEnd || null;
    return [
      [current.contract_id, employee.contractId],
      [current.employment_type_code, employmentTypeCode],
      [current.valid_from, payload.valid_from],
      [current.valid_to, expectedValidTo],
      [current.weekly_hours_regime, payload.weekly_hours_regime],
      [current.scheduling_policy, employee.workRegime],
      [current.salary_basis, payload.salary_basis],
      [current.contract_weekly_minutes, Math.round(employee.weeklyContractHours * 60)],
      [current.reference_period_weeks, payload.reference_period_weeks],
      [current.cp302_reference_function_code, payload.cp302_reference_function_code],
      [current.function_seniority_date, payload.function_seniority_date],
      [current.company_seniority_date, payload.company_seniority_date],
      [
        current.contractual_hourly_rate == null ? '' : parseHourlyRate(String(current.contractual_hourly_rate)),
        payload.contractual_hourly_rate == null ? '' : parseHourlyRate(String(payload.contractual_hourly_rate))
      ],
      [String(current.contractual_monthly_salary_cents ?? ''), String(payload.contractual_monthly_salary_cents ?? '')],
      [String(current.annual_leave_entitlement_days), String(payload.annual_leave_entitlement_days)]
    ].some(([left, right]) => String(left ?? '') !== String(right ?? ''));
  }

  async function validateSelectedEmployment() {
    if (!workspace.activeId || !selected || saving) return;
    if (dirty) {
      feedback = 'Save Team before validating this setup.';
      feedbackTone = 'warning';
      return;
    }
    const current = employmentTerms
      .filter((item) => item.employee_id === selected.id && item.active)
      .sort((left, right) => right.valid_from.localeCompare(left.valid_from))[0];
    if (!current) {
      feedback = 'Record employment and salary terms before validation.';
      feedbackTone = 'warning';
      return;
    }
    saving = true;
    try {
      const result = await validateEmployeeEmploymentTerms({
        restaurantId: workspace.activeId,
        employeeId: selected.id,
        employmentTermsId: current.id
      });
      const value = result && typeof result === 'object' && !Array.isArray(result)
        ? result as Record<string, unknown>
        : {};
      const blockers = Array.isArray(value.blockers)
        ? value.blockers as Array<{ message?: string }>
        : [];
      employmentTerms = await getEmployeeEmploymentTerms(workspace.activeId);
      if (workspace.team) {
        drafts = employeeDrafts(workspace.team, employmentTerms);
        baseline = JSON.stringify(drafts);
      }
      feedback = blockers.length
        ? blockers.map((item) => item.message).filter(Boolean).join(' ')
        : 'Employment setup verified.';
      feedbackTone = blockers.length ? 'warning' : 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }

  async function createAbsence() {
    if (
      !workspace.activeId ||
      !selected ||
      !absenceTypeId ||
      !absenceStart ||
      !absenceEnd ||
      saving
    )
      return;
    saving = true;
    try {
      await saveAbsence({
        restaurantId: workspace.activeId,
        employeeId: selected.id,
        action: 'create_by_manager',
        payload: {
          absence_type_id: absenceTypeId,
          start_date: absenceStart,
          end_date: absenceEnd,
          service_key: absenceService || null,
          manager_comment: absenceComment.trim() || null
        }
      });
      await workspace.loadTeam(true);
      await workspaceRealtime.publish('notification-refresh', {
        restaurantId: workspace.activeId,
        source: 'team'
      });
      absenceComment = '';
      feedback = 'Absence created.';
      feedbackTone = 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }

  async function absenceAction(
    absenceId: string,
    action: 'approve' | 'reject' | 'cancel_by_manager'
  ) {
    if (!workspace.activeId || !selected || saving) return;
    saving = true;
    try {
      await saveAbsence({
        restaurantId: workspace.activeId,
        employeeId: selected.id,
        absenceId,
        action,
        payload:
          action === 'cancel_by_manager'
            ? { cancellation_reason: 'Cancelled from Team' }
            : { manager_comment: absenceComment.trim() || null }
      });
      await workspace.loadTeam(true);
      await workspaceRealtime.publish('notification-refresh', {
        restaurantId: workspace.activeId,
        source: 'team'
      });
      feedback = action === 'approve' ? 'Absence approved.' : action === 'reject' ? 'Absence rejected.' : 'Absence cancelled.';
      feedbackTone = 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      saving = false;
    }
  }

  async function sendInvite() {
    if (!workspace.activeId || !selected || inviting) return;
    if (!selected.email.includes('@')) {
      feedback = 'Save a valid employee email before sending an invitation.';
      feedbackTone = 'danger';
      return;
    }
    if (dirty) {
      feedback = 'Save Team changes before sending the invitation.';
      feedbackTone = 'warning';
      return;
    }
    if (selected.profileId) {
      feedback =
        selected.accessState === 'disabled'
          ? 'This employee already has an account. Restore access instead.'
          : 'This employee already has active workspace access.';
      feedbackTone = 'warning';
      return;
    }
    inviting = true;
    try {
      await inviteEmployee({
        restaurantId: workspace.activeId,
        employeeId: selected.id,
        email: selected.email,
        role: inviteRole
      });
      await workspace.loadTeam(true);
      feedback = `Invitation sent to ${selected.email}.`;
      feedbackTone = 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      inviting = false;
    }
  }

  async function revokeInvite() {
    if (!workspace.activeId || !selected || inviting) return;
    const confirmed = await confirmAction({
      title: 'Revoke this invitation?',
      body: 'Their invitation link stops working straight away. You can send a new invitation afterwards.',
      confirmLabel: 'Revoke invitation'
    });
    if (!confirmed) return;
    inviting = true;
    try {
      await revokeEmployeeInvitation(
        workspace.activeId,
        selected.id,
        'Revoked from Team'
      );
      await workspace.loadTeam(true);
      feedback = 'Invitation revoked.';
      feedbackTone = 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      inviting = false;
    }
  }

  async function changeAccess(action: 'disable' | 'restore') {
    if (!workspace.activeId || !selected || inviting) return;
    inviting = true;
    try {
      await setEmployeeAccessState(
        workspace.activeId,
        selected.id,
        action
      );
      await workspace.loadTeam(true);
      feedback =
        action === 'restore'
          ? 'Workspace access restored.'
          : 'Workspace and badge access disabled.';
      feedbackTone = 'success';
    } catch (error) {
      feedback = error instanceof Error ? error.message : String(error);
      feedbackTone = 'danger';
    } finally {
      inviting = false;
    }
  }
</script>

<svelte:head><title>{t('Team')} · restogogo</title></svelte:head>

{#if snapshot}
  <section class="page-shell team">
    <PageHero
      eyebrow={`${t('Team')} · ${activeEmployees.length} ${t('active')}`}
      titleId="team-title"
      title={issueEmployees.length ? t(issueEmployees.length === 1 ? '{count} person needs a quick fix.' : '{count} people need a quick fix.', { count: issueEmployees.length }) : t('Everyone is ready.')}
      subtitle={owner
        ? t('Keep access, contracts, payroll details and absences trustworthy in one place.')
        : t('Keep access, positions, schedules and absences trustworthy in one place.')}
    >
      {#snippet command()}
        <HeroReadiness
          percent={readinessPercent}
          hasIssues={issueEmployees.length > 0}
          cards={readinessCards}
          label={t('Team readiness signal')}
        />
      {/snippet}
    </PageHero>

    <div class="page-body team-body">
      <FeedbackBanner message={feedback} tone={feedbackTone} />

      <section class="people-command" aria-label={t('Team command summary')} data-tour="team-ready">
        <article class="people-command__lead">
          <span class="page-kicker">{setupIncomplete ? t('Crew foundation') : t('Crew foundation ready')}</span>
          <strong>{setupIncomplete ? t('Make the roster trustworthy before service.') : owner ? t('People data can support scheduling and payroll.') : t('People data can support scheduling and daily operations.')}</strong>
          <p>
            {openIssueCount
              ? t(openIssueCount === 1 ? '{issues} open team issue across {employees} employees.' : '{issues} open team issues across {employees} employees.', { issues: openIssueCount, employees: issueEmployees.length })
              : t('No blocking people issues right now.')}
          </p>
        </article>
        <div class="people-command__checks">
          {#each setupSteps as step}
            <button type="button" class:is-complete={step.complete} onclick={() => step.onselect?.()}>
              <span>{step.complete ? '✓' : '!'}</span>
              <strong>{t(step.label)}</strong>
              <small>{t(step.detail, step.values)}</small>
            </button>
          {/each}
        </div>
      </section>

      {#if dirty}
        <div class="team-toolbar">
          <SaveActions {dirty} busy={saving} saveLabel="Save team" busyLabel="Saving…" oncancel={cancelChanges} onsave={persistTeam} embedded />
        </div>
      {/if}

      <div class="section-head">
        <strong>{t('Your team')}</strong>
        <span>{drafts.length} {t(drafts.length === 1 ? 'member' : 'members')}</span>
      </div>

      <div class="team-columns">
        <div id="staff-grid" class="staff-grid" data-tour="team-list">
          {#each drafts as employee, index (employee.id)}
            {@const issues = employeeIssues(employee)}
            {@const severity = issues.some((issue) => issue.tone === 'danger') ? 'danger' : issues.length ? 'warning' : 'ready'}
            <button
              type="button"
              class={`staff-card is-${severity} rst-stagger-in`}
              style={`--rst-i:${index}`}
              class:is-inactive={!employee.active}
              data-tour={index === 0 ? 'team-member' : undefined}
              onclick={() => openEmployee(employee.id)}
            >
              <span class="staff-card__avatar">{personInitials(employee.displayName)}</span>
              <strong>{employee.displayName}</strong>
              <small>{positionLabel(employee)}</small>
              <div class="staff-card__status">
                <i></i>
                <span>{t(employee.active ? employee.accessState.replaceAll('_', ' ') : 'inactive')}</span>
              </div>
              <div class="staff-card__issues">
                {#if issues.length}
                  {#each issues.slice(0, 2) as issue}
                    <span class="is-{issue.tone}">{t(issue.label)}</span>
                  {/each}
                  {#if issues.length > 2}<span>+{issues.length - 2}</span>{/if}
                {:else}
                  <span class="is-ready">{t('Ready')}</span>
                {/if}
              </div>
              <div class="staff-card__hover" aria-hidden="true">
                <span>{employee.email || t('No email on file')}</span>
                <span>{t('{hours}h / week', { hours: employee.weeklyContractHours || 0 })}</span>
                {#if issues.length}
                  <b class="is-{severity}">{t(issues.length === 1 ? '{count} issue' : '{count} issues', { count: issues.length })}</b>
                {:else}
                  <b class="is-ready">{t(owner ? 'Ready for scheduling & payroll' : 'Ready for scheduling')}</b>
                {/if}
              </div>
            </button>
          {/each}
          <button type="button" class="staff-card staff-card--ghost" onclick={addEmployee} data-tour="team-add">
            <span class="ghost-icon">+</span>
            <strong>{drafts.length ? t('Add employee') : t('Add your first employee')}</strong>
          </button>
        </div>

        {#if issueEmployees.length}
          <aside id="attention-panel" class="attention-panel" aria-label={t('Needs attention')} data-tour="team-radar">
            <header>
              <span class="page-kicker">{t('Needs attention')}</span>
              <strong>{issueEmployees.length} {t('open')}</strong>
            </header>
            <div>
              {#each issueEmployees as employee, index (employee.id)}
                {@const issues = employeeIssues(employee)}
                <button type="button" class="attention-row rst-stagger-in" style={`--rst-i:${index}`} onclick={() => openEmployee(employee.id)}>
                  <span>{personInitials(employee.displayName)}</span>
                  <strong>{employee.displayName}</strong>
                  <small>{issues.map((issue) => t(issue.label)).join(' · ')}</small>
                  <i class="attention-row__go" aria-hidden="true">→</i>
                </button>
              {/each}
            </div>
          </aside>
        {:else}
          <aside class="attention-panel is-clear" aria-label={t('Team clear')} data-tour="team-radar">
            <header>
              <span class="page-kicker">{t('People radar')}</span>
              <strong>{t('Clear')}</strong>
            </header>
            <div class="clear-state">
              <span>✓</span>
              <strong>{t('No team blockers.')}</strong>
              <p>{t(owner ? 'Access, contracts and payroll data are ready for the current active team.' : 'Access and position assignments are ready for the current active team.')}</p>
            </div>
          </aside>
        {/if}
      </div>
    </div>
  </section>

  {#snippet drawerTabs()}
    {#if selected}
      {@const selectedIssues = employeeIssues(selected)}
      <div class="facet-strip" role="tablist" aria-label={t('Employee sections')}>
        {#each tabItems as item}
          {@const hasIssue = selectedIssues.some((issue) => issue.tab === item.id)}
          <button
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            class:is-current={tab === item.id}
            class:has-issue={hasIssue}
            onclick={() => (tab = item.id)}
          >
            <span>{hasIssue ? '!' : '✓'}</span>
            <strong>{t(item.label)}</strong>
          </button>
        {/each}
      </div>
    {/if}
  {/snippet}

  {#snippet drawerActions()}
    <SaveActions {dirty} busy={saving} saveLabel="Save team" busyLabel="Saving…" oncancel={cancelChanges} onsave={persistTeam} embedded showCleanActions={false} />
  {/snippet}

  <Drawer
    open={detailOpen}
    title={selected?.displayName ?? t('Employee')}
    description={selected ? positionLabel(selected) : ''}
    onclose={() => (detailOpen = false)}
    tabs={drawerTabs}
    actions={drawerActions}
  >
    {#if selected}
      {@const selectedIssues = employeeIssues(selected)}
      <div class="employee-hero">
        <div>
          <span>{selected.active ? t('Active employee') : t('Inactive employee')}</span>
          <small>{positionLabel(selected)}</small>
        </div>
        {#if selectedIssues.length}
          <div class="employee-hero__ready is-issues">{t(selectedIssues.length === 1 ? '{count} issue to resolve' : '{count} issues to resolve', { count: selectedIssues.length })}</div>
        {:else}
          <div class="employee-hero__ready">{t(owner ? 'Ready for scheduling and payroll' : 'Ready for scheduling')}</div>
        {/if}
      </div>

      {#if tab === 'General'}
        <Panel title={t('Identity and contact')} eyebrow={selected.displayName}>
          <div class="fields">
            <label>{t('Display name')}<input value={selected.displayName} oninput={(event) => mutate({ displayName: event.currentTarget.value })} /></label>
            <fieldset class="positions wide">
              <legend>{t('Positions / job functions')}</legend>
              <div class="chip-toggles">
                {#each snapshot.job_functions.filter((item) => item.active) as item}
                  <button
                    type="button"
                    class="chip-toggle"
                    class:is-active={selected.jobFunctionIds.includes(item.id)}
                    onclick={() => toggleJobFunction(item.id, !selected.jobFunctionIds.includes(item.id))}
                  >
                    {item.name}
                  </button>
                {/each}
              </div>
            </fieldset>
            <label>{t('First name')}<input value={selected.firstName} oninput={(event) => mutate({ firstName: event.currentTarget.value })} /></label>
            <label>{t('Last name')}<input value={selected.lastName} oninput={(event) => mutate({ lastName: event.currentTarget.value })} /></label>
            <label>{t('Email')}<input type="email" value={selected.email} oninput={(event) => mutate({ email: event.currentTarget.value })} /></label>
            <label>{t('Phone')}<input value={selected.phone} oninput={(event) => mutate({ phone: event.currentTarget.value })} /></label>
            <label class="wide">{t('Address')}<input value={selected.address} oninput={(event) => mutate({ address: event.currentTarget.value })} /></label>
            <label>{t('Postal code')}<input value={selected.postalCode} oninput={(event) => mutate({ postalCode: event.currentTarget.value })} /></label>
            <label>{t('City')}<input value={selected.city} oninput={(event) => mutate({ city: event.currentTarget.value })} /></label>
            <label>{t('Emergency contact')}<input value={selected.emergencyName} oninput={(event) => mutate({ emergencyName: event.currentTarget.value })} /></label>
            <label>{t('Emergency phone')}<input value={selected.emergencyPhone} oninput={(event) => mutate({ emergencyPhone: event.currentTarget.value })} /></label>
            <label class="wide">{t('Notes')}<textarea value={selected.notes} oninput={(event) => mutate({ notes: event.currentTarget.value })}></textarea></label>
            <label class="check"><input type="checkbox" checked={selected.active} onchange={(event) => mutate({ active: event.currentTarget.checked })} /> {t('Active employee')}</label>
          </div>
        </Panel>
      {:else if tab === 'Access'}
        <TeamAccessPanel
          employee={selected}
          bind:inviteRole
          {owner}
          busy={inviting}
          {dirty}
          canManage={canManageSelectedAccess}
          onBadgeChange={(badgeEnabled) => mutate({ badgeEnabled })}
          onSendInvite={sendInvite}
          onRevokeInvite={revokeInvite}
          onChangeAccess={changeAccess}
        />
      {:else if tab === 'Contract' && owner}
        <div class="contract-summary">
          <span class="contract-summary__kicker">{t('Current contract')}</span>
          <strong>{snapshot.contract_types.find((item) => item.id === selected.contractTypeId)?.name ?? t('Not set')} · {t(selected.workRegime.replaceAll('_', ' '))}</strong>
          <p>{selected.contractStart || t('No start')} → {selected.contractEnd || t('Open ended')}</p>
          <div class="contract-summary__stats">
            <div><span>{t('Weekly hours')}</span><strong>{selected.weeklyContractHours || 0}h</strong></div>
            <div><span>{t('Contract days')}</span><strong>{selected.contractDays || 0}d</strong></div>
            <div><span>{t('Annual leave')}</span><strong>{selected.annualLeaveEntitlementDays || 0}d</strong></div>
          </div>
          <small class:needs-review={selected.employmentSourceStatus !== 'verified'}>
            {selected.employmentSourceStatus === 'verified'
              ? t('Payroll terms verified · version {version}', { version: selected.employmentTermsVersion || 1 })
              : t('{status} · validate in Payroll', { status: selected.employmentSourceStatus.replaceAll('_', ' ') })}
          </small>
        </div>

        <Panel title={t('Edit contract')} eyebrow={t('Owner only')}>
          <div class="fields">
            <label>{t('Employment type')}<select value={selected.contractTypeId} onchange={(event) => { const contractTypeId = event.currentTarget.value; const code = snapshot.contract_types.find((item) => item.id === contractTypeId)?.code ?? ''; mutate({ contractTypeId, workRegime: defaultWorkRegime(code) }); }}><option value="">{t('Not set')}</option>{#each snapshot.contract_types.filter((item) => item.active) as item}<option value={item.id}>{item.name}</option>{/each}</select></label>
            <label>{t('Start date')}<input type="date" value={selected.contractStart} oninput={(event) => mutate({ contractStart: event.currentTarget.value })} /></label>
            {#if selectedContractTypeCode !== 'CDI'}<label>{t('End date')}<input type="date" value={selected.contractEnd} oninput={(event) => mutate({ contractEnd: event.currentTarget.value })} /></label>{/if}
            <label>{t('Contract hours per week')}<input type="number" min="0" step="0.25" value={selected.weeklyContractHours} oninput={(event) => mutate({ weeklyContractHours: event.currentTarget.valueAsNumber || 0 })} /></label>
            <label>{t('How are contract hours defined?')}<select value={selected.weeklyHoursRegime} onchange={(event) => mutate({ weeklyHoursRegime: event.currentTarget.value as EmployeeDraft['weeklyHoursRegime'] })}><option value="fixed">{t('The same number every week')}</option><option value="variable_average">{t('An average over a reference period')}</option></select></label>
            {#if selected.weeklyHoursRegime === 'variable_average'}<label>{t('Reference period')}<input type="number" min="2" max="52" value={selected.referencePeriodWeeks} oninput={(event) => mutate({ referencePeriodWeeks: event.currentTarget.valueAsNumber || 2 })} /><small>{t('Weeks')}</small></label>{/if}
            <label>{t('How the employee is scheduled')}<select value={selected.workRegime} onchange={(event) => mutate({ workRegime: event.currentTarget.value as EmployeeDraft['workRegime'] })}><option value="fixed_schedule">{t('Recurring fixed schedule')}</option><option value="weekly_availability">{t('Weekly availability')}</option><option value="manager_only">{t('Manager planned')}</option></select><small>{t(scheduleRegimeHint)}</small></label>
            <label>{t('Contract days')}<input type="number" min="0" step="0.5" value={selected.contractDays} oninput={(event) => mutate({ contractDays: event.currentTarget.valueAsNumber || 0 })} /></label>
            <label>{t('Annual leave days')}<input type="number" min="0" step="0.5" value={selected.annualLeaveEntitlementDays} oninput={(event) => mutate({ annualLeaveEntitlementDays: event.currentTarget.valueAsNumber || 0 })} /></label>
            <label>{t('Terms effective from')}<input type="date" value={selected.employmentValidFrom} oninput={(event) => mutate({ employmentValidFrom: event.currentTarget.value })} /><small>{t('Use a future date when employment terms change.')}</small></label>
            <div class="contract-action"><ActionButton label={t('Start contract renewal')} onclick={startContractRenewal} /></div>
          </div>
          {#if selected.workRegime === 'fixed_schedule'}
            <fieldset class="recurring">
              <legend>{t('Recurring work pattern')}</legend>
              <div class="recurring__head"><span>{t('Day')}</span><span>{t('Lunch')}</span><span>{t('Evening')}</span></div>
              {#each WEEKDAYS as day, index}
                <div class="recurring__row">
                  <strong>{t(day)}</strong>
                  {#each ['lunch', 'evening'] as service}
                    <input
                      aria-label={`${t(day)} ${t(serviceLabel(service as 'lunch' | 'evening'))}`}
                      type="checkbox"
                      checked={selected.recurringSlots.some((slot) => slot.weekday === index + 1 && slot.serviceKey === service)}
                      onchange={(event) => toggleRecurring(index + 1, service as 'lunch' | 'evening', event.currentTarget.checked)}
                    />
                  {/each}
                </div>
              {/each}
            </fieldset>
          {/if}
        </Panel>

        {#if contractHistory.length}
          <div class="contract-timeline">
            <strong>{t('Contract history')}</strong>
            <div class="trail-line">
              {#each contractHistory as contract (contract.id)}
                <article class:is-current={contract.is_current && contract.active}>
                  <i></i>
                  <button type="button" onclick={() => toggleContractExpand(contract.id)}>
                    <strong>{snapshot.contract_types.find((type) => type.id === contract.contract_type_id)?.name ?? t('Contract')} · {t((contract.work_regime ?? 'weekly_availability').replaceAll('_', ' '))}</strong>
                    <time>{contract.contract_start || t('No start')} → {contract.contract_end || t('Open ended')}</time>
                    {#if expandedContractId === contract.id}
                      <p class="trail-detail">
                        {t('{hours}h/week · {days}d/week · {leave}d annual leave', { hours: contract.weekly_contract_hours, days: contract.contract_days, leave: contract.annual_leave_entitlement_days })}
                        <br />{t('Created {date}', { date: new Date(contract.created_at).toLocaleDateString(i18n.intlLocale) })}
                      </p>
                    {/if}
                  </button>
                  <em class:is-current={contract.is_current && contract.active}>{t(contract.is_current && contract.active ? 'Current' : 'Historical')}</em>
                </article>
              {/each}
            </div>
          </div>
        {/if}
      {:else if tab === 'Payroll' && owner}
        <div class="payroll-summary">
          <span class="payroll-summary__kicker">{t('Compensation')}</span>
          <strong>{selected.salaryBasis === 'monthly' ? `€${selected.contractualMonthlySalary}/month` : `€${selected.contractualHourlyRate || '0.0000'}/h`}</strong>
          <p>{t('CP 302 category {category} · effective {date}', { category: selected.cp302Category || t('Not set'), date: selected.employmentValidFrom || t('Not set') })}</p>
          <div class="payroll-summary__stats">
            <div><span>{t('Salary basis')}</span><strong>{t(selected.salaryBasis || 'Not set')}</strong></div>
            <div><span>{t('Est. weekly cost')}</span><strong>{formatCents(estimatedWeeklyCostCents, i18n.intlLocale)}</strong></div>
            <div><span>{t('Terms version')}</span><strong>v{selected.employmentTermsVersion || '—'}</strong></div>
          </div>
        </div>

        <Panel title={t('Legal salary terms')} eyebrow="CP 302">
          <div class="fields">
            <label>{t('Salary basis')}<select value={selected.salaryBasis} onchange={(event) => mutate({ salaryBasis: event.currentTarget.value as EmployeeDraft['salaryBasis'] })}><option value="">{t('Not set')}</option><option value="hourly">{t('Hourly')}</option><option value="monthly">{t('Monthly')}</option></select></label>
            {#if selected.salaryBasis === 'monthly'}
              <label>{t('Monthly gross salary')}<input inputmode="decimal" value={selected.contractualMonthlySalary} oninput={(event) => mutate({ contractualMonthlySalary: event.currentTarget.value })} /><small>{t('Monthly payroll is recorded but remains blocked until lawful proration is implemented.')}</small></label>
            {:else}
              <label>{t('Contractual hourly rate')}<input inputmode="decimal" value={selected.contractualHourlyRate} oninput={(event) => mutate({ contractualHourlyRate: event.currentTarget.value })} placeholder="0.0000" /></label>
            {/if}
            <label class="wide">{t('Official CP 302 function')}<input type="search" list="cp302-functions" value={cp302Search} placeholder={t('Search by function or code')} oninput={(event) => (cp302Search = event.currentTarget.value)} onchange={(event) => selectReferenceFunction(event.currentTarget.value)} /><datalist id="cp302-functions">{#each referenceFunctionOptions as item (item.id)}<option value={referenceFunctionLabel(item)}></option>{/each}</datalist><small>{t('The official function derives category and worker status.')}</small></label>
            <div class="derived-classification">
              <span>{t('Derived classification')}</span>
              <strong>{selectedReferenceFunction ? `${t('Category')} ${selectedReferenceFunction.category} · ${t(selectedReferenceFunction.default_worker_status === 'white_collar' ? 'White-collar employee' : 'Blue-collar worker')}` : t('Select an official function')}</strong>
              <small>{selectedReferenceFunction ? `${selectedReferenceFunction.code} · ${selectedReferenceFunction.department ?? t('CP 302')}` : t('Category and worker status cannot be edited independently.')}</small>
            </div>
            <label>{t('Function seniority date')}<input type="date" value={selected.functionSeniorityDate} oninput={(event) => mutate({ functionSeniorityDate: event.currentTarget.value })} /></label>
            <label>{t('Company seniority date')}<input type="date" value={selected.companySeniorityDate} oninput={(event) => mutate({ companySeniorityDate: event.currentTarget.value })} /></label>
            <div class="validation-action"><ActionButton label={t('Validate setup')} tone="primary" disabled={saving || dirty} onclick={validateSelectedEmployment} /><small>{t('Server checks the contract, CP 302 classification, wage, evidence and restaurant setup.')}</small></div>
          </div>
        </Panel>

        <Panel title={t('Payroll profile')} eyebrow={t('Owner only')}>
          <div class="fields">
            <label>{t('Payroll employee ID')}<input value={selected.payrollEmployeeId} oninput={(event) => mutate({ payrollEmployeeId: event.currentTarget.value })} /></label>
            <label>
              {t('National registry number')}
              <input type={revealPayroll ? 'text' : 'password'} value={selected.nationalRegistryNumber} oninput={(event) => mutate({ nationalRegistryNumber: event.currentTarget.value })} />
            </label>
            <label>{t('Birth date')}<input type="date" value={selected.birthDate} oninput={(event) => mutate({ birthDate: event.currentTarget.value })} /></label>
            <label>
              IBAN
              <input type={revealPayroll ? 'text' : 'password'} value={selected.iban} oninput={(event) => mutate({ iban: event.currentTarget.value })} />
            </label>
            <label>BIC<input value={selected.bic} oninput={(event) => mutate({ bic: event.currentTarget.value })} /></label>
            <label class="check reveal-toggle">
              <input type="checkbox" checked={revealPayroll} onchange={(event) => (revealPayroll = event.currentTarget.checked)} />
              {t('Show sensitive fields')}
            </label>
            <label>{t('Budget cost estimate')}<input type="number" min="0" step="0.01" value={selected.estimatedHourlyCost} oninput={(event) => mutate({ estimatedHourlyCost: event.currentTarget.valueAsNumber || 0 })} /><small>{t('Planning estimate only; payroll uses the legal terms above.')}</small></label>
            <label class="wide">{t('Payroll notes')}<textarea value={selected.payrollNotes} oninput={(event) => mutate({ payrollNotes: event.currentTarget.value })}></textarea></label>
          </div>
        </Panel>
        <EmployeePayrollDetails
          restaurantId={workspace.activeId ?? ''}
          employeeId={selected.id}
          effectiveDate={today}
          {employmentTerms}
        />
      {:else if tab === 'Absences'}
        <LeaveBalanceSummary {...leaveBalance} />
        <div class="absence-grid">
          <Panel title={t('Create absence')} eyebrow={t('Audited lifecycle')}>
            <form class="fields" onsubmit={(event) => { event.preventDefault(); createAbsence(); }}>
              <label>{t('Type')}<select required bind:value={absenceTypeId}><option value="">{t('Select type')}</option>{#each snapshot.absence_types.filter((item) => item.active) as item}<option value={item.id}>{t(item.name)}</option>{/each}</select></label>
              <label>{t('Service')}<select bind:value={absenceService}><option value="">{t('Full day')}</option><option value="lunch">{t('Lunch')}</option><option value="evening">{t('Evening')}</option></select></label>
              <label>{t('Start')}<input required type="date" bind:value={absenceStart} /></label>
              <label>{t('End')}<input required type="date" min={absenceStart} bind:value={absenceEnd} /></label>
              <label class="wide">{t('Manager comment')}<textarea bind:value={absenceComment}></textarea></label>
              <div><ActionButton type="submit" tone="primary" label={t('Create absence')} disabled={saving} /></div>
            </form>
          </Panel>
          <Panel title={t('Absence history')} eyebrow={t('{count} records', { count: employeeAbsences.length })}>
            <div class="absence-list">
              {#each employeeAbsences as absence (absence.id)}
                {@const hasDetail = Boolean(absence.manager_comment || absence.employee_comment || absence.approved_at || absence.cancellation_reason)}
                <article class:is-expanded={expandedAbsenceId === absence.id}>
                  <button
                    type="button"
                    class="absence-row"
                    disabled={!hasDetail}
                    onclick={() => hasDetail && toggleAbsenceExpand(absence.id)}
                  >
                    <div>
                      <strong>{t(snapshot.absence_types.find((item) => item.id === absence.absence_type_id)?.name || 'Absence')}</strong>
                      <span>{absence.start_date} → {absence.end_date}{absence.service_key ? ` · ${t(serviceLabel(absence.service_key as 'lunch' | 'evening'))}` : ''}</span>
                    </div>
                    <em class="is-{absence.status}">{t(absence.status)}</em>
                    {#if hasDetail}<i class="absence-row__chevron" aria-hidden="true">{expandedAbsenceId === absence.id ? '−' : '+'}</i>{/if}
                  </button>
                  {#if expandedAbsenceId === absence.id}
                    <div class="absence-detail">
                      {#if absence.manager_comment}<p><b>{t('Manager comment')}</b>{absence.manager_comment}</p>{/if}
                      {#if absence.employee_comment}<p><b>{t('Employee comment')}</b>{absence.employee_comment}</p>{/if}
                      {#if absence.approved_at}<p><b>{t('Approved')}</b>{new Date(absence.approved_at).toLocaleString(i18n.intlLocale)}</p>{/if}
                      {#if absence.cancellation_reason}<p><b>{t('Cancellation reason')}</b>{absence.cancellation_reason}</p>{/if}
                      <p><b>{t('Requested')}</b>{new Date(absence.created_at).toLocaleString(i18n.intlLocale)}</p>
                    </div>
                  {/if}
                  {#if absence.status === 'pending'}
                    <div class="absence-actions">
                      <ActionButton label={t('Approve')} onclick={() => absenceAction(absence.id, 'approve')} />
                      <ActionButton label={t('Reject')} tone="danger" onclick={() => absenceAction(absence.id, 'reject')} />
                    </div>
                  {:else if !['cancelled', 'rejected'].includes(absence.status)}
                    <div class="absence-actions">
                      <ActionButton label={t('Cancel')} tone="danger" onclick={() => absenceAction(absence.id, 'cancel_by_manager')} />
                    </div>
                  {/if}
                </article>
              {:else}
                <p class="empty">{t('No absence records for this employee.')}</p>
              {/each}
            </div>
          </Panel>
        </div>
      {/if}
    {/if}
  </Drawer>
{/if}

<style>
  .people-command {
    display: grid;
    grid-template-columns: minmax(260px, 0.85fr) minmax(0, 1.6fr);
    gap: 12px;
    align-items: stretch;
  }

  .people-command__lead,
  .people-command__checks {
    border: 1px solid var(--rst-ui-surface-panel-border);
    border-radius: var(--rst-ui-radius-2xl);
    box-shadow: var(--rst-ui-shadow-card);
  }

  .people-command__lead {
    position: relative;
    overflow: hidden;
    display: grid;
    align-content: center;
    gap: 8px;
    min-height: 150px;
    padding: 22px;
    color: #fffaf2;
    background:
      radial-gradient(circle at 92% 12%, rgba(247, 183, 51, 0.34), transparent 34%),
      linear-gradient(145deg, #111b28, #1c314a);
  }

  /* Keep copy above the shared ambient drift (.people-command__lead::before). */
  .people-command__lead > * {
    position: relative;
    z-index: 1;
  }

  .people-command__lead strong {
    max-width: 520px;
    font-size: clamp(25px, 3vw, 36px);
    line-height: 0.98;
    letter-spacing: 0;
  }

  .people-command__lead p {
    max-width: 560px;
    margin: 0;
    color: rgba(255, 250, 242, 0.7);
    font-size: 13px;
    line-height: 1.45;
  }

  .people-command__checks {
    display: grid;
    grid-template-columns: repeat(5, minmax(112px, 1fr));
    overflow: hidden;
    background: var(--rst-ui-surface-panel);
  }

  .people-command__checks button {
    min-width: 0;
    display: grid;
    align-content: center;
    justify-items: start;
    gap: 4px;
    padding: 16px 14px;
    border: 0;
    border-left: 1px solid var(--rst-ui-divider-soft);
    color: var(--rst-ui-text);
    background:
      linear-gradient(145deg, rgba(var(--rst-state-warning-rgb), 0.08), transparent 64%),
      var(--rst-ui-surface-panel);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      transform 0.18s var(--rst-ease-out),
      background-color 0.15s ease,
      box-shadow 0.18s var(--rst-ease-out);
  }

  .people-command__checks button:first-child {
    border-left: 0;
  }

  /* Match the shared Restaurant .foundation-strip hover: lift + inset glow. */
  .people-command__checks button:hover {
    background:
      linear-gradient(145deg, rgba(var(--rst-ui-action-rgb), 0.12), transparent 62%),
      var(--rst-ui-surface-panel);
    transform: translateY(-2px);
    box-shadow: inset 0 -3px 0 rgba(var(--rst-ui-action-rgb), 0.24);
  }

  .people-command__checks button.is-complete {
    background:
      linear-gradient(145deg, rgba(var(--rst-state-success-rgb), 0.11), transparent 64%),
      var(--rst-ui-surface-panel);
  }

  .people-command__checks span {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-round);
    color: var(--rst-state-warning-text);
    background: var(--rst-state-warning-bg);
    font-size: 11px;
    font-weight: var(--rst-fw-display);
    transition: transform 0.18s var(--rst-ease-spring), box-shadow 0.18s var(--rst-ease-out);
  }

  .people-command__checks button:hover span {
    transform: scale(1.08) rotate(-3deg);
    box-shadow: 0 8px 20px rgba(31, 22, 15, 0.12);
  }

  .people-command__checks button.is-complete span {
    color: var(--rst-state-success-text);
    background: var(--rst-state-success-bg);
  }

  .people-command__checks strong {
    min-width: 0;
    overflow: visible;
    font-size: 12px;
    line-height: 1.15;
    text-wrap: balance;
  }

  .people-command__checks small {
    min-width: 0;
    overflow: visible;
    color: var(--rst-ui-muted);
    font-size: 10px;
    line-height: 1.25;
    white-space: normal;
  }

  .team-toolbar {
    display: flex;
    justify-content: flex-end;
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 4px;
  }

  .section-head strong {
    font-size: 18px;
  }

  .section-head span {
    color: var(--rst-ui-muted);
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .team-columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
    gap: 16px;
    align-items: start;
  }

  .staff-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
    scroll-margin-top: 90px;
  }

  .staff-card {
    position: relative;
    min-width: 0;
    display: grid;
    gap: 5px;
    padding: 16px;
    border: 1px solid var(--rst-ui-surface-panel-border);
    border-radius: var(--rst-ui-radius-xl);
    background: var(--rst-ui-surface-panel);
    box-shadow: var(--rst-ui-shadow-card);
    color: var(--rst-ui-text);
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    transition: transform 0.18s var(--rst-ease-out), box-shadow 0.18s var(--rst-ease-out);
  }

  .staff-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 20px 44px rgba(0, 0, 0, 0.16);
  }

  .staff-card.is-inactive {
    opacity: 0.6;
  }

  .staff-card__avatar {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: #fff;
    background: var(--rst-state-success);
    font-size: 13px;
    font-weight: var(--rst-fw-display);
    box-shadow: 0 0 0 3px var(--rst-state-success-bg);
  }

  .staff-card.is-warning .staff-card__avatar {
    background: var(--rst-state-warning);
    box-shadow: 0 0 0 3px var(--rst-state-warning-bg);
  }

  .staff-card.is-danger .staff-card__avatar {
    background: var(--rst-state-danger);
    box-shadow: 0 0 0 3px var(--rst-state-danger-bg);
  }

  .staff-card strong {
    overflow: hidden;
    font-size: 15px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .staff-card small {
    overflow: hidden;
    color: var(--rst-ui-muted);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .staff-card__status {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }

  .staff-card__status i {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--rst-ui-quiet);
  }

  .staff-card:not(.is-inactive) .staff-card__status i {
    background: var(--rst-state-success);
    box-shadow: 0 0 0 3px var(--rst-state-success-bg);
  }

  .staff-card__status span {
    color: var(--rst-ui-muted);
    font-size: 10px;
    font-weight: var(--rst-fw-bold);
    text-transform: capitalize;
  }

  .staff-card__issues {
    min-height: 22px;
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 6px;
  }

  .staff-card__issues span {
    max-width: 100%;
    overflow: hidden;
    padding: 4px 7px;
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-ui-muted);
    background: var(--rst-state-neutral-bg);
    font-size: 9px;
    font-weight: var(--rst-fw-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .staff-card__issues span.is-ready {
    color: var(--rst-state-success-text);
    background: var(--rst-state-success-bg);
  }

  .staff-card__issues span.is-warning {
    color: var(--rst-state-warning-text);
    background: var(--rst-state-warning-bg);
  }

  .staff-card__issues span.is-danger {
    color: var(--rst-state-danger-text);
    background: var(--rst-state-danger-bg);
  }

  .staff-card__hover {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    align-content: center;
    gap: 6px;
    padding: 16px;
    color: #fffaf2;
    background: #0f1620;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.16s ease;
  }

  .staff-card:hover .staff-card__hover,
  .staff-card:focus-visible .staff-card__hover {
    opacity: 1;
  }

  .staff-card__hover span {
    color: rgba(255, 250, 242, 0.78);
    font-size: 11px;
  }

  .staff-card__hover b {
    margin-top: 4px;
    font-size: 12px;
    font-weight: var(--rst-fw-display);
  }

  .staff-card__hover b.is-ready {
    color: #7ee6a4;
  }

  .staff-card__hover b.is-warning {
    color: #f7b733;
  }

  .staff-card__hover b.is-danger {
    color: #ff8a70;
  }

  .staff-card--ghost {
    align-items: center;
    justify-items: center;
    gap: 10px;
    border: 1.5px dashed rgba(var(--rst-ui-action-rgb), 0.45);
    color: var(--rst-ui-action);
    background: rgba(var(--rst-ui-action-rgb), 0.06);
    box-shadow: none;
  }

  .staff-card--ghost:hover {
    border-color: var(--rst-ui-action);
    background: rgba(var(--rst-ui-action-rgb), 0.12);
    transform: translateY(-3px);
    box-shadow: 0 16px 32px rgba(var(--rst-ui-action-rgb), 0.2);
  }

  .staff-card--ghost strong {
    color: var(--rst-ui-action);
    font-size: 13px;
    font-weight: var(--rst-fw-bold);
    text-align: center;
    white-space: normal;
  }

  .ghost-icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: #fff;
    background: var(--rst-ui-action);
    font-size: 20px;
    font-weight: var(--rst-fw-display);
    box-shadow: 0 8px 18px rgba(var(--rst-ui-action-rgb), 0.38);
  }

  .attention-panel {
    min-width: 0;
    overflow: hidden;
    border-radius: var(--rst-ui-radius-2xl);
    color: #fffaf2;
    background:
      radial-gradient(circle at 85% 10%, rgba(240, 100, 35, 0.45), transparent 36%),
      linear-gradient(145deg, #211913, #4b2b1e);
    box-shadow: var(--rst-ui-shadow-card);
  }

  .attention-panel header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .attention-panel header strong {
    padding: 6px 9px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: var(--rst-ui-radius-pill);
    background: rgba(255, 255, 255, 0.08);
    font-size: 11px;
  }

  .attention-row {
    position: relative;
    min-width: 0;
    width: 100%;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) auto;
    gap: 2px 10px;
    align-items: center;
    padding: 11px 14px;
    border: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    color: #fffaf2;
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.16s ease, transform 0.16s var(--rst-ease-out);
  }

  .attention-row:hover {
    background: rgba(255, 255, 255, 0.06);
    transform: translateX(3px);
  }

  .attention-row > span {
    grid-row: span 2;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-lg);
    color: #fff;
    background: var(--rst-ui-action);
    font-size: 9px;
    font-weight: var(--rst-fw-display);
  }

  .attention-row strong {
    font-size: 12px;
    line-height: 1.15;
  }

  .attention-row small {
    overflow: hidden;
    color: rgba(255, 250, 242, 0.6);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attention-row__go {
    grid-row: span 2;
    color: var(--rst-ui-action);
    font-style: normal;
    opacity: 0;
    transform: translateX(-6px);
    transition: opacity 0.18s ease, transform 0.18s var(--rst-ease-out);
  }

  .attention-row:hover .attention-row__go {
    opacity: 1;
    transform: translateX(0);
  }

  .attention-panel.is-clear {
    background:
      radial-gradient(circle at 82% 10%, rgba(64, 200, 120, 0.34), transparent 34%),
      linear-gradient(145deg, #111b28, #163821);
  }

  .clear-state {
    display: grid;
    justify-items: start;
    gap: 8px;
    padding: 22px 18px;
  }

  .clear-state > span {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: var(--rst-ui-radius-xl);
    color: #13321f;
    background: #7ee6a4;
    font-weight: var(--rst-fw-display);
  }

  .clear-state p {
    margin: 0;
    color: rgba(255, 250, 242, 0.65);
    font-size: 12px;
    line-height: 1.45;
  }

  .empty {
    grid-column: 1 / -1;
    padding: 24px;
    color: var(--rst-ui-muted);
    text-align: center;
  }

  .facet-strip {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .facet-strip button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    padding: 8px 10px;
    border: 0;
    border-left: 1px solid var(--rst-ui-divider-soft);
    color: var(--rst-ui-muted);
    background: transparent;
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
    transition: color .15s ease, background-color .15s ease;
  }

  .facet-strip button:first-child {
    border-left: 0;
  }

  .facet-strip button:hover {
    color: var(--rst-ui-text);
    background: rgba(var(--rst-ui-action-rgb), .06);
  }

  .facet-strip button.is-current {
    color: var(--rst-ui-text);
  }

  .facet-strip button::after {
    content: '';
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 0;
    height: 2px;
    border-radius: var(--rst-ui-radius-pill);
    background: var(--rst-ui-action);
    opacity: 0;
    transform: scaleX(.5);
    transition: opacity .18s ease, transform .18s var(--rst-ease-out);
  }

  .facet-strip button.is-current::after {
    opacity: 1;
    transform: scaleX(1);
  }

  .facet-strip button span {
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: var(--rst-state-success-text);
    background: var(--rst-state-success-bg);
    font-size: 9px;
    font-weight: var(--rst-fw-display);
  }

  .facet-strip button.has-issue span {
    color: var(--rst-state-warning-text);
    background: var(--rst-state-warning-bg);
  }

  .employee-hero {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 14px;
    padding: 14px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-xl);
    background: linear-gradient(135deg, rgba(var(--rst-state-info-rgb), 0.09), transparent 52%), var(--rst-ui-surface-panel);
  }

  .employee-hero > div:first-child { display: grid; gap: 4px; }
  .employee-hero > div:first-child span { color: var(--rst-ui-panel-title); font-size: 10px; font-weight: var(--rst-fw-bold); letter-spacing: 0; text-transform: uppercase; }
  .employee-hero small { color: var(--rst-ui-muted); }
  .employee-hero__ready { width: fit-content; padding: 8px 9px; border: 1px solid rgba(var(--rst-state-success-rgb), 0.22); border-radius: var(--rst-ui-radius-md); color: var(--rst-state-success-text); background: rgba(var(--rst-state-success-rgb), 0.1); font-size: 11px; font-weight: var(--rst-fw-bold); }
  .employee-hero__ready.is-issues { border-color: rgba(var(--rst-state-warning-rgb), 0.22); color: var(--rst-state-warning-text); background: rgba(var(--rst-state-warning-rgb), 0.1); }

  .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  label input, label select, label textarea { width: 100%; min-height: 36px; padding: 6px 2px; border: 0; border-bottom: 1.5px solid var(--rst-ui-line); border-radius: 0; color: var(--rst-ui-text); background: transparent; font: inherit; transition: border-color .15s ease, box-shadow .15s ease; }
  label input:focus-visible, label select:focus-visible, label textarea:focus-visible { border-bottom-color: var(--rst-ui-action); outline: none; box-shadow: 0 1.5px 0 0 var(--rst-ui-action); }
  label textarea { min-height: 78px; resize: vertical; }
  .contract-action { display: flex; align-items: end; }
  .derived-classification {
    min-width: 0;
    display: grid;
    align-content: center;
    gap: 4px;
    padding: 12px 14px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-md);
    background: var(--rst-ui-section-row);
  }
  .derived-classification span { color: var(--rst-ui-muted); font-size: 10px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .derived-classification strong { font-size: 13px; }
  .derived-classification small { color: var(--rst-ui-muted); font-size: 11px; }
  .validation-action { display: grid; align-content: end; gap: 6px; }
  .validation-action small { color: var(--rst-ui-muted); font-size: 11px; }

  .contract-summary {
    display: grid;
    gap: 8px;
    margin-bottom: 14px;
    padding: 18px;
    border-radius: var(--rst-ui-radius-xl);
    color: #fffaf2;
    background:
      radial-gradient(circle at 92% 10%, rgba(247, 183, 51, 0.28), transparent 36%),
      linear-gradient(145deg, #111b28, #1c314a);
    animation: rst-fade-up .35s var(--rst-ease-out) backwards;
  }
  .contract-summary__kicker { color: var(--rst-gold); font-size: 10px; font-weight: var(--rst-fw-display); letter-spacing: 0; text-transform: uppercase; }
  .contract-summary strong { font-size: 20px; text-transform: capitalize; }
  .contract-summary p { margin: 0; color: rgba(255, 250, 242, .7); font-size: 12px; }
  .contract-summary__stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 6px; }
  .contract-summary__stats div { display: grid; gap: 3px; padding: 10px; border-radius: var(--rst-ui-radius-md); background: rgba(255, 255, 255, .08); }
  .contract-summary__stats span { color: rgba(255, 250, 242, .6); font-size: 10px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .contract-summary__stats strong { font-size: 17px; }

  .payroll-summary {
    display: grid;
    gap: 8px;
    margin-bottom: 14px;
    padding: 18px;
    border-radius: var(--rst-ui-radius-xl);
    color: #fffaf2;
    background:
      radial-gradient(circle at 92% 10%, rgba(66, 216, 132, 0.28), transparent 36%),
      linear-gradient(145deg, #111b28, #123324);
    animation: rst-fade-up .35s var(--rst-ease-out) backwards;
  }
  .payroll-summary__kicker { color: var(--rst-green); font-size: 10px; font-weight: var(--rst-fw-display); letter-spacing: 0; text-transform: uppercase; }
  .payroll-summary strong { font-size: 20px; }
  .payroll-summary p { margin: 0; color: rgba(255, 250, 242, .7); font-size: 12px; }
  .payroll-summary__stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 6px; }
  .payroll-summary__stats div { display: grid; gap: 3px; padding: 10px; border-radius: var(--rst-ui-radius-md); background: rgba(255, 255, 255, .08); }
  .payroll-summary__stats span { color: rgba(255, 250, 242, .6); font-size: 10px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .payroll-summary__stats strong { font-size: 17px; }
  .reveal-toggle { grid-column: 1 / -1; }

  .contract-timeline { padding: 4px 0 0; }
  .contract-timeline > strong { display: block; padding: 10px 0; font-size: 12px; }

  .trail-line {
    position: relative;
    display: grid;
    gap: 10px;
    padding-left: 8px;
  }
  .trail-line::before {
    content: '';
    position: absolute;
    top: 8px;
    bottom: 8px;
    left: 17px;
    width: 2px;
    border-radius: var(--rst-ui-radius-pill);
    background: linear-gradient(180deg, var(--rst-ui-action), rgba(240, 100, 35, 0.08));
  }
  .trail-line article {
    position: relative;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: start;
  }
  .trail-line article i {
    position: relative;
    z-index: 1;
    width: 20px;
    height: 20px;
    margin-top: 2px;
    border: 3px solid var(--rst-ui-surface-panel);
    border-radius: var(--rst-ui-radius-round);
    background: var(--rst-ui-quiet);
  }
  .trail-line article.is-current i {
    background: var(--rst-ui-action);
    box-shadow: 0 0 0 1px rgba(240, 100, 35, 0.32);
  }
  .trail-line article button {
    display: block;
    width: 100%;
    padding: 10px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-lg);
    background: var(--rst-ui-surface-field);
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: border-color .15s ease, background-color .15s ease;
  }
  .trail-line article button:hover { border-color: var(--rst-ui-action); background: var(--rst-ui-surface-field-strong); }
  .trail-line article strong { display: block; color: var(--rst-ui-text); font-size: 12px; }
  .trail-line article time { display: block; margin-top: 3px; color: var(--rst-ui-muted); font-size: 11px; }
  .trail-line article .trail-detail { margin: 6px 0 0; padding-top: 6px; border-top: 1px solid var(--rst-ui-divider-soft); color: var(--rst-ui-muted); font-size: 11px; line-height: 1.5; }
  .trail-line em { align-self: center; padding: 4px 8px; border-radius: var(--rst-ui-radius-pill); color: var(--rst-ui-muted); background: var(--rst-state-neutral-bg); font-size: 10px; font-style: normal; white-space: nowrap; }
  .trail-line em.is-current { color: var(--rst-state-success-text); background: var(--rst-state-success-bg); }
  label { display: grid; align-content: start; gap: 6px; color: var(--rst-ui-muted); font-size: 12px; font-weight: var(--rst-fw-bold); }
  label.wide { grid-column: 1 / -1; }
  .positions { grid-column: 1 / -1; margin: 0; padding: 12px; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); }
  .positions legend { padding: 0 6px; color: var(--rst-ui-muted); font-size: 11px; font-weight: var(--rst-fw-bold); }
  .chip-toggles { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip-toggle {
    padding: 8px 14px;
    border: 1px solid var(--rst-ui-line);
    border-radius: var(--rst-ui-radius-pill);
    color: var(--rst-ui-muted);
    background: var(--rst-ui-surface-field);
    font: inherit;
    font-size: 12px;
    font-weight: var(--rst-fw-bold);
    cursor: pointer;
    transition: transform .15s var(--rst-ease-out), background-color .15s ease, border-color .15s ease, color .15s ease;
  }
  .chip-toggle:hover { border-color: var(--rst-ui-action); color: var(--rst-ui-text); }
  .chip-toggle.is-active {
    color: #fff;
    border-color: var(--rst-ui-action);
    background: var(--rst-ui-action);
    transform: translateY(-1px);
  }
  .recurring { margin: 14px 0 0; padding: 0; overflow: hidden; border: 1px solid var(--rst-ui-line); border-radius: var(--rst-ui-radius-md); }
  .recurring legend { margin-left: 10px; padding: 0 6px; color: var(--rst-ui-muted); font-size: 11px; font-weight: var(--rst-fw-bold); }
  .recurring__head, .recurring__row { display: grid; grid-template-columns: minmax(120px, 1fr) 90px 90px; align-items: center; padding: 8px 12px; }
  .recurring__head { color: var(--rst-ui-muted); background: var(--rst-ui-surface-panel-head); font-size: 10px; font-weight: var(--rst-fw-bold); text-transform: uppercase; }
  .recurring__row { border-top: 1px solid var(--rst-ui-divider-soft); }
  .recurring__row input { justify-self: center; }
  label.check { display: flex; align-items: center; gap: 8px; color: var(--rst-ui-text); }
  label.check input { width: auto; min-height: auto; }
  .absence-grid { display: grid; grid-template-columns: minmax(260px, .8fr) minmax(0, 1.2fr); gap: 16px; margin-top: 12px; }
  .absence-list { display: grid; }
  .absence-list article { border-bottom: 1px solid var(--rst-ui-divider-soft); }
  .absence-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 11px 14px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color .15s ease;
  }
  .absence-row:disabled { cursor: default; }
  .absence-row:not(:disabled):hover { background: var(--rst-ui-surface-field); }
  .absence-row > div { min-width: 0; display: grid; gap: 3px; margin-right: auto; }
  .absence-row span { color: var(--rst-ui-muted); font-size: 11px; }
  .absence-row em { padding: 4px 7px; border-radius: var(--rst-ui-radius-pill); color: var(--rst-ui-muted); background: var(--rst-state-neutral-bg); font-size: 10px; font-style: normal; }
  .absence-row em.is-approved { color: var(--rst-state-success-text); background: var(--rst-state-success-bg); }
  .absence-row em.is-pending { color: var(--rst-state-warning-text); background: var(--rst-state-warning-bg); }
  .absence-row__chevron { width: 16px; flex: 0 0 auto; color: var(--rst-ui-action); font-style: normal; font-weight: var(--rst-fw-display); text-align: center; }
  .absence-detail { display: grid; gap: 5px; padding: 0 14px 12px; animation: rst-fade-up .2s var(--rst-ease-out) backwards; }
  .absence-detail p { display: flex; gap: 6px; margin: 0; color: var(--rst-ui-muted); font-size: 11px; line-height: 1.4; }
  .absence-detail b { flex: 0 0 auto; color: var(--rst-ui-text); font-weight: var(--rst-fw-bold); }
  .absence-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 0 14px 12px; }

  @media (max-width: 1180px) {
    .people-command {
      grid-template-columns: 1fr;
    }
    .people-command__checks {
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }
    .team-columns {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .fields, .absence-grid {
      grid-template-columns: 1fr;
    }
    .contract-summary__stats,
    .payroll-summary__stats {
      grid-template-columns: 1fr;
    }
    .trail-line article {
      grid-template-columns: 20px minmax(0, 1fr);
    }
    .trail-line em {
      grid-column: 2;
      justify-self: start;
    }
    label.wide {
      grid-column: auto;
    }
  }
</style>
