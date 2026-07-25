import { identifierDigits } from '../team/belgian-identifiers.ts';

export function isValidBelgianEnterpriseNumber(value: string | null | undefined): boolean {
  const digits = identifierDigits(value);
  if (!/^\d{10}$/.test(digits)) return false;
  const base = Number(digits.slice(0, 8));
  const check = Number(digits.slice(8));
  return check === 97 - (base % 97);
}

export function enterpriseNumberIssue(value: string | null | undefined): string | null {
  const digits = identifierDigits(value);
  if (!digits) return null;
  if (digits.length !== 10) return 'The Belgian company number should contain 10 digits.';
  if (!isValidBelgianEnterpriseNumber(digits)) return 'The Belgian company number is not valid yet.';
  return null;
}

export function establishmentUnitIssue(value: string | null | undefined): string | null {
  const digits = identifierDigits(value);
  if (!digits) return null;
  return digits.length === 10 ? null : 'The establishment unit number should contain 10 digits.';
}

export function jointCommitteeIssue(value: string | null | undefined): string | null {
  const input = String(value ?? '').trim();
  if (!input) return null;
  return /^\d{3}(?:\.\d{2})?$/.test(input)
    ? null
    : 'The joint committee code should use a format such as 302 or 302.00.';
}
