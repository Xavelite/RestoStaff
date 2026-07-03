import assert from 'node:assert/strict';
import test from 'node:test';
import { apiErrorMessage, toApiError } from '../src/lib/api/error.ts';

test('API errors preserve useful Supabase context without rendering object strings', () => {
  assert.equal(
    apiErrorMessage({
      message: 'Leave could not be cancelled.',
      details: 'The request is no longer active.',
      hint: 'Refresh the calendar.'
    }),
    'Leave could not be cancelled. The request is no longer active. Refresh the calendar.'
  );
  assert.equal(apiErrorMessage({ error: 'Invitation expired.' }), 'Invitation expired.');
  assert.equal(apiErrorMessage({}, 'Save failed.'), 'Save failed.');
  assert.equal(toApiError({ message: 'Permission denied.' }).message, 'Permission denied.');
});
