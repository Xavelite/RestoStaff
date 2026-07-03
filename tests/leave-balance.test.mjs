import assert from 'node:assert/strict';
import test from 'node:test';
import { leaveBalanceForEmployee } from '../src/lib/absence/leave-balance.ts';

test('leave balance uses holiday types, clips to the calendar year and counts service leave as half a day', () => {
  const balance = leaveBalanceForEmployee(
    {
      employee_contracts: [
        {
          employee_id: 'employee-1',
          active: true,
          is_current: true,
          annual_leave_entitlement_days: 20
        }
      ],
      absence_types: [
        { id: 'holiday', category: 'holiday' },
        { id: 'sick', category: 'sick' }
      ],
      absences: [
        {
          employee_id: 'employee-1',
          absence_type_id: 'holiday',
          status: 'approved',
          start_date: '2025-12-31',
          end_date: '2026-01-02',
          service_key: null
        },
        {
          employee_id: 'employee-1',
          absence_type_id: 'holiday',
          status: 'pending',
          start_date: '2026-03-10',
          end_date: '2026-03-10',
          service_key: 'lunch'
        },
        {
          employee_id: 'employee-1',
          absence_type_id: 'sick',
          status: 'approved',
          start_date: '2026-04-01',
          end_date: '2026-04-05',
          service_key: null
        }
      ]
    },
    'employee-1',
    '2026-06-19'
  );

  assert.deepEqual(balance, {
    entitlement: 20,
    approved: 2,
    pending: 0.5,
    remaining: 18
  });
});
