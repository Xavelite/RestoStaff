import assert from 'node:assert/strict';
import test from 'node:test';
import { newEmployeeDraft, teamSavePayload } from '../src/lib/team/team-model.ts';
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

test('missing or invalid stored scheduling policy never becomes manager-managed', () => {
  assert.equal(workRegime(undefined, 'FREELANCE'), 'weekly_availability');
  assert.equal(workRegime('invalid', 'FREELANCE'), 'weekly_availability');
  assert.equal(workRegime('manager_only', 'FREELANCE'), 'manager_only');
});
