export function isValidEmail(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(candidate);
}

export function isValidPhone(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return true;
  if (!/^\+?[0-9\s()./-]+$/.test(candidate)) return false;
  const digits = candidate.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}
