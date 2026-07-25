import assert from 'node:assert/strict';
import test from 'node:test';
import { employmentTermsPayload, newEmployeeDraft, teamSavePayload } from '../src/lib/team/team-model.ts';
import { defaultWorkRegime, workRegime } from '../src/lib/domain/operations.ts';

test('manager saves never submit owner-only employee data', () => {
  const employee = {
    ...newEmployeeDraft('employee-1'),
    displayName: 'Alex Morgan',
    nationalRegistryNumber: 'sensitive',
    hourlyWageRate: 24.5,
    contractStart: '2026-01-01'
  };
  const payload = teamSavePayload('restaurant-1', [employee], 'manager');
  assert.deepEqual(payload.legalProfiles, []);
  assert.deepEqual(payload.contracts, []);
  assert.deepEqual(payload.payrollProfiles, []);
  assert.equal(payload.employees.length, 1);
  assert.deepEqual(payload.employeeJobFunctions, []);
});

test('owner saves preserve payroll identifiers and explicit zeroes', () => {
  const employee = {
    ...newEmployeeDraft('employee-1'),
    displayName: 'Alex Morgan',
    payrollEmployeeId: 'PAY-42',
    hourlyWageRate: 0,
    estimatedHourlyCost: 0
  };
  const payload = teamSavePayload('restaurant-1', [employee], 'owner');
  const payroll = payload.payrollProfiles[0];
  assert.equal(payroll.payroll_employee_id, 'PAY-42');
  assert.equal(payroll.hourly_wage_rate, 0);
  assert.equal(payroll.estimated_hourly_cost, 0);
});

test('employees can carry multiple positions with one primary position', () => {
  const employee = {
    ...newEmployeeDraft('employee-1'),
    displayName: 'Alex Morgan',
    jobFunctionIds: ['runner', 'bar']
  };
  const payload = teamSavePayload('restaurant-1', [employee], 'manager');
  assert.equal(payload.employeeJobFunctions.length, 2);
  assert.equal(payload.employeeJobFunctions[0].is_primary, true);
  assert.equal(payload.employeeJobFunctions[1].is_primary, false);
});

test('only fixed-schedule employees persist recurring schedule slots', () => {
  const weeklyEmployee = {
    ...newEmployeeDraft('weekly'),
    recurringSlots: [{ weekday: 1, serviceKey: 'lunch' }]
  };
  const fixedEmployee = {
    ...newEmployeeDraft('fixed'),
    workRegime: 'fixed_schedule',
    recurringSlots: [{ weekday: 2, serviceKey: 'evening' }]
  };

  const payload = teamSavePayload(
    'restaurant-1',
    [weeklyEmployee, fixedEmployee],
    'owner'
  );

  assert.deepEqual(payload.recurringScheduleSlots, [
    {
      restaurant_id: 'restaurant-1',
      employee_id: 'fixed',
      weekday: 2,
      service_key: 'evening',
      active: true
    }
  ]);
});

test('contract types produce restaurant-native availability defaults', () => {
  assert.equal(defaultWorkRegime('CDI'), 'fixed_schedule');
  assert.equal(defaultWorkRegime('CDD'), 'fixed_schedule');
  assert.equal(defaultWorkRegime('FLEXI'), 'weekly_availability');
  assert.equal(defaultWorkRegime('STUDENT'), 'weekly_availability');
  assert.equal(defaultWorkRegime('FREELANCE'), 'manager_only');
  assert.equal(defaultWorkRegime(''), 'weekly_availability');
});

test('a stored scheduling regime always wins over the contract type', () => {
  // How someone is scheduled is independent of what contract they hold: a CDI
  // can be manager-placed, and an extra can hold a recurring schedule.
  assert.equal(workRegime('weekly_availability', 'CDI'), 'weekly_availability');
  assert.equal(workRegime('manager_only', 'CDD'), 'manager_only');
  assert.equal(workRegime('fixed_schedule', 'STUDENT'), 'fixed_schedule');
  assert.equal(workRegime('manager_only', 'FREELANCE'), 'manager_only');
});

test('missing or invalid stored scheduling policy never becomes manager-managed', () => {
  // Only when nothing usable is stored does the contract imply a regime, and it
  // may never silently land on manager_only — that would stop asking someone
  // for availability without anyone deciding it.
  assert.equal(workRegime(undefined, 'CDI'), 'fixed_schedule');
  assert.equal(workRegime(undefined, 'FREELANCE'), 'weekly_availability');
  assert.equal(workRegime('invalid', 'FREELANCE'), 'weekly_availability');
  assert.equal(workRegime(null, ''), 'weekly_availability');
});

test('employment terms submit facts and never browser-derived classifications', () => {
  const payload = employmentTermsPayload({
    ...newEmployeeDraft('employee-1'),
    contractId: 'contract-1',
    contractStart: '2026-07-01',
    weeklyContractHours: 24,
    weeklyHoursRegime: 'variable_average',
    referencePeriodWeeks: 13,
    salaryBasis: 'hourly',
    contractualHourlyRate: '18.2500',
    cp302ReferenceFunctionCode: '206B'
  });
  assert.equal(payload.contract_id, 'contract-1');
  assert.equal(payload.weekly_hours_regime, 'variable_average');
  assert.equal(payload.cp302_reference_function_code, '206B');
  for (const derived of [
    'contract_duration_kind', 'employment_regime', 'worker_status',
    'employment_volume', 'legal_schedule_type', 'cp302_category', 'source_status'
  ]) {
    assert.equal(Object.hasOwn(payload, derived), false, `${derived} must be server-derived`);
  }
});



test('owner atomic Team payload includes only explicitly changed employment terms', () => {
  const unchanged = {
    ...newEmployeeDraft('employee-1'),
    displayName: 'Alex Morgan',
    contractId: 'contract-1',
    contractStart: '2026-01-01',
    weeklyContractHours: 38
  };
  const changed = {
    ...unchanged,
    contractualHourlyRate: '19.50',
    cp302ReferenceFunctionCode: '206B'
  };

  const payload = teamSavePayload('restaurant-1', [changed], 'owner', [changed]);
  assert.equal(payload.employmentTerms.length, 1);
  assert.equal(payload.employmentTerms[0].employee_id, 'employee-1');
  assert.equal(payload.employmentTerms[0].contractual_hourly_rate, '19.50');
  assert.equal(payload.employmentTerms[0].cp302_reference_function_code, '206B');

  const managerPayload = teamSavePayload('restaurant-1', [changed], 'manager', [changed]);
  assert.deepEqual(managerPayload.employmentTerms, []);
});

test('blank inline employee rows never leak related records into the save payload', () => {
  const blank = {
    ...newEmployeeDraft('blank-employee'),
    displayName: '',
    email: 'not-yet-saved@example.test',
    phone: '+32 000 00 00 00',
    jobFunctionIds: ['position-1']
  };

  const payload = teamSavePayload('restaurant-1', [blank], 'owner');
  assert.deepEqual(payload.employees, []);
  assert.deepEqual(payload.contacts, []);
  assert.deepEqual(payload.access, []);
  assert.deepEqual(payload.employeeJobFunctions, []);
  assert.deepEqual(payload.legalProfiles, []);
  assert.deepEqual(payload.contracts, []);
  assert.deepEqual(payload.payrollProfiles, []);
});
