// Supported payroll-export columns. This list is the UI's source of truth for
// the column picker; the create_payroll_export_run RPC validates the same keys
// server-side (the security boundary), so the browser can never widen it.
// Keep keys and labels in sync with migration 202606240033.
export const PAYROLL_EXPORT_FIELDS = [
  { key: 'payroll_id', label: 'Employee payroll ID' },
  { key: 'employee_name', label: 'Employee name' },
  { key: 'national_registry_number', label: 'National registry number' },
  { key: 'date', label: 'Date' },
  { key: 'time_range', label: 'Time range' },
  { key: 'service', label: 'Service' },
  { key: 'contract_type', label: 'Contract type' },
  { key: 'entry_type', label: 'Entry type' },
  { key: 'worked_hours', label: 'Worked hours' },
  { key: 'break_minutes', label: 'Break minutes' },
  { key: 'notes', label: 'Notes' }
] as const;

export type PayrollExportField = (typeof PAYROLL_EXPORT_FIELDS)[number]['key'];

const FIELD_KEYS = new Set(PAYROLL_EXPORT_FIELDS.map((field) => field.key));
const FIELD_LABELS = new Map(PAYROLL_EXPORT_FIELDS.map((field) => [field.key, field.label]));

// The standard social-secretariat default used when a restaurant has not saved
// its own configuration. Mirrors the RPC's built-in default.
export const DEFAULT_PAYROLL_EXPORT_COLUMNS: PayrollExportField[] = [
  'payroll_id',
  'employee_name',
  'national_registry_number',
  'date',
  'time_range',
  'service',
  'entry_type',
  'worked_hours',
  'break_minutes',
  'contract_type'
];

export function isPayrollExportField(value: string): value is PayrollExportField {
  return FIELD_KEYS.has(value as PayrollExportField);
}

export function payrollFieldLabel(key: string): string {
  return FIELD_LABELS.get(key as PayrollExportField) ?? key;
}

// Coerce a stored/unknown value into a valid, non-empty ordered column list,
// falling back to the default. Drops unknown keys and duplicates.
export function normalizePayrollColumns(value: unknown): PayrollExportField[] {
  if (!Array.isArray(value)) return [...DEFAULT_PAYROLL_EXPORT_COLUMNS];
  const seen = new Set<string>();
  const columns = value.filter(
    (item): item is PayrollExportField =>
      typeof item === 'string' && isPayrollExportField(item) && !seen.has(item) && seen.add(item) !== undefined
  );
  return columns.length ? columns : [...DEFAULT_PAYROLL_EXPORT_COLUMNS];
}
