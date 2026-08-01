import assert from 'node:assert/strict';
import test from 'node:test';

const {
  createInitialOnboardingDraft,
  normalizeOnboardingDraft,
  onboardingServiceKey
} = await import('../src/lib/onboarding/onboarding-draft.ts');

test('new onboarding drafts use the configurable day and night service baseline', () => {
  const draft = createInitialOnboardingDraft();

  assert.deepEqual(
    draft.services.map(({ serviceKey, name, startTime, endTime }) => ({
      serviceKey,
      name,
      startTime,
      endTime
    })),
    [
      { serviceKey: 'lunch', name: 'Day', startTime: '12:00', endTime: '15:00' },
      { serviceKey: 'evening', name: 'Night', startTime: '18:00', endTime: '23:00' }
    ]
  );
  assert.ok(draft.areas.length > 0);
  assert.ok(draft.functions.length > 0);
  assert.ok(draft.assignments.length > 0);
});

test('saved legacy lunch and evening fields migrate without losing their hours', () => {
  const draft = normalizeOnboardingDraft(
    {
      step: 99,
      lunchStart: '11:30',
      lunchEnd: '14:30',
      eveningStart: '17:30',
      eveningEnd: '22:30',
      openDays: [true, false, true, false, true, false, true]
    },
    7
  );

  assert.equal(draft.step, 6);
  assert.deepEqual(
    draft.services.map(({ serviceKey, startTime, endTime, openDays }) => ({
      serviceKey,
      startTime,
      endTime,
      openDays
    })),
    [
      {
        serviceKey: 'lunch',
        startTime: '11:30',
        endTime: '14:30',
        openDays: [true, false, true, false, true, false, true]
      },
      {
        serviceKey: 'evening',
        startTime: '17:30',
        endTime: '22:30',
        openDays: [true, false, true, false, true, false, true]
      }
    ]
  );
});

test('service keys remain stable and normalize user-defined service names', () => {
  assert.equal(
    onboardingServiceKey(
      {
        id: 'service-lunch',
        serviceKey: 'lunch',
        name: 'Anything',
        startTime: '12:00',
        endTime: '15:00',
        openDays: []
      },
      0
    ),
    'lunch'
  );
  assert.equal(
    onboardingServiceKey(
      {
        id: 'custom',
        serviceKey: '',
        name: 'Apre\u0300s-midi',
        startTime: '15:00',
        endTime: '18:00',
        openDays: []
      },
      2
    ),
    'apres-midi'
  );
});
