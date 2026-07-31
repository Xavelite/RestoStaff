/**
 * One vocabulary for what an employee's app access is doing.
 *
 * People and Access both show this state, and they must not invent separate
 * words for it: "Active" already means the employment record on those cards, so
 * access says Enabled / Invited / Not invited instead of repeating it.
 */
export const ACCESS_LABEL: Record<string, string> = {
  active: 'Enabled',
  disabled: 'Disabled',
  invited: 'Invited',
  expired: 'Invitation expired',
  revoked: 'Invitation revoked',
  not_invited: 'Not invited'
};

type AccessTone = 'ok' | 'accent' | 'warn' | 'neutral';

export function accessTone(state: string): AccessTone {
  if (state === 'active') return 'ok';
  if (state === 'invited') return 'accent';
  if (state === 'expired' || state === 'revoked') return 'warn';
  return 'neutral';
}
