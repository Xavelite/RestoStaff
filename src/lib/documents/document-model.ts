import { addDays } from '../calendar/date.ts';

const DOCUMENT_DEFAULT_TOTAL_BYTES = 250 * 1024 * 1024;
export const DOCUMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
] as const;

export const DOCUMENT_ACCEPT = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.txt',
  '.csv',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx'
].join(',');

export const DOCUMENT_CATEGORIES = [
  { key: 'employee', label: 'Team records', description: 'Contracts, certificates and employee documents' },
  { key: 'compliance', label: 'Compliance', description: 'Food safety, permits and inspection records' },
  { key: 'legal', label: 'Legal', description: 'Company, lease and regulatory documents' },
  { key: 'insurance', label: 'Insurance', description: 'Policies, claims and certificates' },
  { key: 'finance', label: 'Finance', description: 'Accounting, tax and financial records' },
  { key: 'supplier', label: 'Suppliers', description: 'Agreements, invoices and delivery records' },
  { key: 'operations', label: 'Operations', description: 'Procedures, manuals and internal policies' },
  { key: 'other', label: 'Other', description: 'Files that do not fit another category' }
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]['key'];
export type DocumentAccessScope = 'management' | 'owner';
export type DocumentStatus = 'uploading' | 'ready' | 'archived';
type DocumentExpiryState = 'none' | 'current' | 'soon' | 'expired';

export type RestaurantDocument = {
  id: string;
  restaurantId: string;
  title: string;
  originalFilename: string;
  objectPath: string;
  mimeType: string;
  sizeBytes: number;
  category: DocumentCategory;
  employeeId: string | null;
  employeeName: string | null;
  documentDate: string | null;
  expiresOn: string | null;
  accessScope: DocumentAccessScope;
  note: string | null;
  status: DocumentStatus;
  createdByProfileId: string | null;
  uploaderName: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type DocumentEvent = {
  id: string;
  documentId: string;
  eventType:
    | 'upload_reserved'
    | 'uploaded'
    | 'upload_cancelled'
    | 'metadata_updated'
    | 'downloaded'
    | 'archived';
  actorProfileId: string | null;
  actorName: string | null;
  occurredAt: string;
  details: Record<string, unknown>;
};

export type DocumentEmployee = {
  id: string;
  name: string;
  active: boolean;
};

export type DocumentQuota = {
  planCode: 'included' | 'paid' | 'custom';
  totalLimitBytes: number;
  maxFileBytes: number;
  usedBytes: number;
};

export type DocumentWorkspace = {
  documents: RestaurantDocument[];
  events: DocumentEvent[];
  employees: DocumentEmployee[];
  quota: DocumentQuota;
};

type DocumentFileLike = {
  name: string;
  size: number;
  type: string;
};

export function categoryLabel(category: DocumentCategory): string {
  return DOCUMENT_CATEGORIES.find((item) => item.key === category)?.label ?? 'Other';
}

export function titleFromFilename(filename: string): string {
  const clean = filename.trim().replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return clean || 'Untitled document';
}

export function validateDocumentFile(
  file: DocumentFileLike,
  maxFileBytes = DOCUMENT_MAX_FILE_BYTES,
  remainingBytes = Number.POSITIVE_INFINITY
): string | null {
  if (!file.name.trim()) return 'Choose a file to upload.';
  if (file.size <= 0) return 'The selected file is empty.';
  if (file.size > maxFileBytes) {
    return 'This file exceeds the per-file limit.';
  }
  if (!DOCUMENT_MIME_TYPES.includes(file.type.toLowerCase() as (typeof DOCUMENT_MIME_TYPES)[number])) {
    return 'Use PDF, Word, Excel, CSV, text, JPG, PNG or WebP files.';
  }
  if (file.size > remainingBytes) return 'This restaurant does not have enough storage left.';
  return null;
}

export function documentExpiryState(
  expiresOn: string | null,
  today: string,
  warningDays = 30
): DocumentExpiryState {
  if (!expiresOn) return 'none';
  if (expiresOn < today) return 'expired';
  if (expiresOn <= addDays(today, warningDays)) return 'soon';
  return 'current';
}

export function formatBytes(bytes: number): string {
  const safe = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (safe < 1024) return `${Math.round(safe)} B`;
  if (safe < 1024 * 1024) return `${formatNumber(safe / 1024)} KB`;
  if (safe < 1024 * 1024 * 1024) return `${formatNumber(safe / (1024 * 1024))} MB`;
  return `${formatNumber(safe / (1024 * 1024 * 1024))} GB`;
}

function formatNumber(value: number): string {
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

export function quotaPercent(quota: DocumentQuota): number {
  if (quota.totalLimitBytes <= 0) return 100;
  return Math.min(100, Math.max(0, (quota.usedBytes / quota.totalLimitBytes) * 100));
}

export function parseDocumentWorkspace(value: unknown): DocumentWorkspace {
  const source = record(value);
  const quota = record(source.quota);
  return {
    documents: array(source.documents).map(parseDocument),
    events: array(source.events).map(parseEvent),
    employees: array(source.employees).map((item) => {
      const employee = record(item);
      return {
        id: text(employee.id),
        name: text(employee.name),
        active: Boolean(employee.active)
      };
    }).filter((employee) => employee.id && employee.name),
    quota: {
      planCode: ['included', 'paid', 'custom'].includes(text(quota.plan_code))
        ? text(quota.plan_code) as DocumentQuota['planCode']
        : 'included',
      totalLimitBytes: number(quota.total_limit_bytes, DOCUMENT_DEFAULT_TOTAL_BYTES),
      maxFileBytes: number(quota.max_file_bytes, DOCUMENT_MAX_FILE_BYTES),
      usedBytes: number(quota.used_bytes, 0)
    }
  };
}

function parseDocument(value: unknown): RestaurantDocument {
  const item = record(value);
  const category = text(item.category);
  const status = text(item.status);
  const scope = text(item.access_scope);
  return {
    id: text(item.id),
    restaurantId: text(item.restaurant_id),
    title: text(item.title),
    originalFilename: text(item.original_filename),
    objectPath: text(item.object_path),
    mimeType: text(item.mime_type),
    sizeBytes: number(item.size_bytes, 0),
    category: DOCUMENT_CATEGORIES.some((entry) => entry.key === category)
      ? category as DocumentCategory
      : 'other',
    employeeId: optionalText(item.employee_id),
    employeeName: optionalText(item.employee_name),
    documentDate: optionalText(item.document_date),
    expiresOn: optionalText(item.expires_on),
    accessScope: scope === 'owner' ? 'owner' : 'management',
    note: optionalText(item.note),
    status: status === 'archived' || status === 'uploading' ? status : 'ready',
    createdByProfileId: optionalText(item.created_by_profile_id),
    uploaderName: optionalText(item.uploader_name),
    createdAt: text(item.created_at),
    updatedAt: text(item.updated_at),
    archivedAt: optionalText(item.archived_at)
  };
}

function parseEvent(value: unknown): DocumentEvent {
  const item = record(value);
  return {
    id: text(item.id),
    documentId: text(item.document_id),
    eventType: text(item.event_type) as DocumentEvent['eventType'],
    actorProfileId: optionalText(item.actor_profile_id),
    actorName: optionalText(item.actor_name),
    occurredAt: text(item.occurred_at),
    details: record(item.details)
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

function number(value: unknown, fallback: number): number {
  const valueNumber = typeof value === 'number' ? value : globalThis.Number(value);
  return globalThis.Number.isFinite(valueNumber) ? valueNumber : fallback;
}
