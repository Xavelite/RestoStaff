import { untrack } from 'svelte';
import type { TeamReadModel } from '$lib/api/workspace-snapshot';
import type { WorkspaceRole } from '$lib/api/workspace';
import { saveTeam } from '$lib/api/mutations';
import {
  employeeDrafts,
  employmentTermsPayload,
  teamSavePayload,
  type EmployeeDraft
} from '$lib/team/team-model';
import {
  getEmployeeEmploymentTerms,
  getPayrollCatalogue
} from '$lib/payroll/payroll-api';
import type { PayrollCatalogue } from '$lib/payroll/payroll-model';
import { parseHourlyRate } from '$lib/payroll-engine/money';
import type { Tables } from '$lib/supabase/database.types';
import { workspace } from '$lib/workspace/workspace.svelte';

/** Shared editable roster used by every classic Team and Payroll page. */
class ClassicTeamDraft {
  employees = $state<EmployeeDraft[]>([]);
  employmentTerms = $state<Tables<'employee_employment_terms'>[]>([]);
  payrollCatalogue = $state<PayrollCatalogue | null>(null);
  supplementaryLoading = $state(false);
  supplementaryError = $state('');

  #loadedKey = '';
  #loadedRestaurantId = '';
  #baseline = '[]';
  #supplementaryRestaurantId = '';
  #supplementaryPromiseRestaurantId = '';
  #supplementaryPromise: Promise<void> | null = null;
  #preparedSnapshot: TeamReadModel | null = null;
  #preparedRole: WorkspaceRole | null = null;

  async prepare(
    snapshot: TeamReadModel,
    restaurantId: string,
    role: WorkspaceRole
  ): Promise<void> {
    // Idempotent guard. The effect that drives prepare re-fires whenever the
    // workspace re-derives `team`, and prepare writes the draft's own state
    // (employees, employmentTerms). Without this, a second render that merely
    // *reads* that state — the save bar reading `dirty`, a page reading
    // `employees` — schedules another prepare and the writes chase the reads
    // forever (effect_update_depth). Re-running for an already-prepared
    // snapshot must therefore do nothing. A real data change replaces the
    // snapshot reference (see workspace.loadTeam), which lifts the guard.
    if (
      this.#preparedSnapshot === snapshot &&
      this.#preparedRole === role &&
      this.#supplementaryRestaurantId === restaurantId &&
      !this.supplementaryError
    ) {
      return;
    }
    this.#preparedSnapshot = snapshot;
    this.#preparedRole = role;

    if (role !== 'owner') {
      if (this.employmentTerms.length || this.payrollCatalogue || this.#supplementaryRestaurantId !== restaurantId) {
        this.employmentTerms = [];
        this.payrollCatalogue = null;
        this.supplementaryError = '';
        this.#supplementaryRestaurantId = restaurantId;
        this.invalidate();
      }
      this.sync(snapshot);
      return;
    }

    if (this.#supplementaryRestaurantId !== restaurantId) {
      this.employmentTerms = [];
      this.payrollCatalogue = null;
      this.supplementaryError = '';
      this.#supplementaryRestaurantId = '';
      this.invalidate();
    }

    // Render the roster immediately; owner-only payroll data enriches it as
    // soon as the supplementary read completes without overwriting edits the
    // owner may already have started while the extra request was in flight.
    this.sync(snapshot);
    await this.#loadSupplementary(restaurantId);
    if (!this.dirty) {
      this.invalidate();
      this.sync(snapshot);
    }
  }

  async reloadSupplementary(restaurantId: string): Promise<void> {
    await this.#loadSupplementary(restaurantId, true);
    if (workspace.team && !this.dirty) this.reload(workspace.team);
  }

  async #loadSupplementary(restaurantId: string, force = false): Promise<void> {
    if (!force && this.#supplementaryRestaurantId === restaurantId && !this.supplementaryError) return;
    if (
      !force &&
      this.#supplementaryPromise &&
      this.#supplementaryPromiseRestaurantId === restaurantId
    ) return this.#supplementaryPromise;

    this.supplementaryLoading = true;
    this.supplementaryError = '';
    this.#supplementaryPromiseRestaurantId = restaurantId;
    const request = Promise.all([
      getEmployeeEmploymentTerms(restaurantId),
      getPayrollCatalogue(restaurantId)
    ])
      .then(([terms, catalogue]) => {
        if (this.#supplementaryPromiseRestaurantId !== restaurantId) return;
        this.employmentTerms = terms;
        this.payrollCatalogue = catalogue;
        this.#supplementaryRestaurantId = restaurantId;
      })
      .catch((error) => {
        if (this.#supplementaryPromiseRestaurantId !== restaurantId) return;
        this.employmentTerms = [];
        this.payrollCatalogue = null;
        this.#supplementaryRestaurantId = '';
        this.supplementaryError = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        if (this.#supplementaryPromise !== request) return;
        this.supplementaryLoading = false;
        this.#supplementaryPromise = null;
        this.#supplementaryPromiseRestaurantId = '';
      });
    this.#supplementaryPromise = request;
    return request;
  }

  sync(snapshot: TeamReadModel, force = false): void {
    const restaurantId = snapshot.restaurant.id;
    const key = JSON.stringify([
      snapshot.employees,
      snapshot.employee_contact_details,
      snapshot.employee_contracts,
      snapshot.employee_legal_profiles,
      snapshot.employee_payroll_profiles,
      snapshot.employee_job_functions,
      snapshot.recurring_schedule_slots,
      this.employmentTerms
    ]);
    if (
      !force &&
      untrack(() => this.#loadedRestaurantId === restaurantId && (this.dirty || this.#loadedKey === key))
    ) return;
    this.#loadedRestaurantId = restaurantId;
    this.#loadedKey = key;
    this.employees = employeeDrafts(snapshot, this.employmentTerms);
    this.#baseline = JSON.stringify(this.employees);
  }

  get dirty(): boolean {
    return JSON.stringify(this.employees) !== this.#baseline;
  }

  reload(snapshot: TeamReadModel): void {
    this.#baseline = '[]';
    this.invalidate();
    this.sync(snapshot, true);
  }

  invalidate(): void {
    this.#loadedKey = '';
  }

  update(id: string, patch: Partial<EmployeeDraft>): void {
    this.employees = this.employees.map((employee) =>
      employee.id === id ? { ...employee, ...patch } : employee
    );
  }

  remove(id: string): void {
    this.employees = this.employees.filter((employee) => employee.id !== id);
  }

  clone(id: string): EmployeeDraft | null {
    const employee = this.employees.find((item) => item.id === id);
    return employee
      ? {
          ...employee,
          jobFunctionIds: [...employee.jobFunctionIds],
          recurringSlots: employee.recurringSlots.map((slot) => ({ ...slot }))
        }
      : null;
  }

  async save(restaurantId: string, role: WorkspaceRole): Promise<void> {
    const snapshot = workspace.team;
    if (!snapshot) throw new Error('Team data is not loaded.');
    const sourceDrafts = this.employees.map((employee) => ({
      ...employee,
      jobFunctionIds: [...employee.jobFunctionIds],
      recurringSlots: employee.recurringSlots.map((slot) => ({ ...slot }))
    }));
    // Supplementary payroll/catalogue reads must never block creating or editing
    // the basic employee. When they are unavailable we save the Team facts and
    // simply defer employment-term versioning until the owner opens that setup.
    const termUpdates = role === 'owner' && !this.supplementaryError && !this.supplementaryLoading
      ? sourceDrafts.filter((employee) => this.#employmentTermsChanged(employee, snapshot))
      : [];

    await saveTeam(
      restaurantId,
      teamSavePayload(restaurantId, sourceDrafts, role, termUpdates)
    );
    await workspace.loadTeam(true);
    if (role === 'owner') await this.#loadSupplementary(restaurantId, true);
    if (workspace.team) this.reload(workspace.team);
  }

  #employmentTermsChanged(employee: EmployeeDraft, snapshot: TeamReadModel): boolean {
    const payload = employmentTermsPayload(employee);
    if (!payload.valid_from) return false;
    const current = this.employmentTerms
      .filter((item) => item.employee_id === employee.id && item.active)
      .sort((left, right) => right.valid_from.localeCompare(left.valid_from))[0];
    if (!current) return true;
    const employmentTypeCode = snapshot.contract_types.find(
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
}

export const teamDraft = new ClassicTeamDraft();
