// Supported Planning-schedule export columns.
// Planning export is built client-side from the loaded snapshot — every field
// here is real planned data (planned_shifts + lookups), never worked-time truth.
const PLANNING_EXPORT_FIELDS = [
  { key: 'employee', label: 'Employee' },
  { key: 'date', label: 'Date' },
  { key: 'service', label: 'Service' },
  { key: 'start', label: 'Planned start' },
  { key: 'end', label: 'Planned end' },
  { key: 'hours', label: 'Planned hours' },
  { key: 'area', label: 'Area' },
  { key: 'position', label: 'Position' },
  { key: 'note', label: 'Note' }
] as const;

type PlanningExportField = (typeof PLANNING_EXPORT_FIELDS)[number]['key'];

const FIELD_LABELS = new Map(PLANNING_EXPORT_FIELDS.map((field) => [field.key, field.label]));

export const DEFAULT_PLANNING_EXPORT_COLUMNS: PlanningExportField[] = [
  'employee',
  'date',
  'service',
  'start',
  'end',
  'hours',
  'area',
  'position',
  'note'
];

export function planningFieldLabel(key: string): string {
  return FIELD_LABELS.get(key as PlanningExportField) ?? key;
}
