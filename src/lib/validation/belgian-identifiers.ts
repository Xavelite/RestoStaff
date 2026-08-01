/** Normalize Belgian identifiers for validation without changing what the user typed. */
function identifierDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Belgian national registry and BIS numbers contain 11 digits. The final two
 * digits are a modulo-97 control number. Numbers assigned from 2000 onward use
 * a leading 2 for the control calculation.
 */
export function isValidBelgianNiss(value: string | null | undefined): boolean {
  const digits = identifierDigits(value);
  if (!/^\d{11}$/.test(digits)) return false;
  const base = BigInt(digits.slice(0, 9));
  const check = Number(digits.slice(9));
  const before2000 = 97 - Number(base % 97n);
  const from2000 = 97 - Number(BigInt(`2${digits.slice(0, 9)}`) % 97n);
  return check === before2000 || check === from2000;
}

/** Empty is deliberately not an error: the identifier is optional until needed. */
export function belgianNissIssue(value: string | null | undefined): string | null {
  const digits = identifierDigits(value);
  if (!digits) return null;
  if (digits.length !== 11) return 'The national registry or BIS number should contain 11 digits.';
  if (!isValidBelgianNiss(digits)) return 'The national registry or BIS number is not valid yet.';
  return null;
}

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
