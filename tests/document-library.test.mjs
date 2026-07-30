import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  DOCUMENT_MAX_FILE_BYTES,
  documentExpiryState,
  formatBytes,
  parseDocumentWorkspace,
  quotaPercent,
  titleFromFilename,
  validateDocumentFile
} from '../src/lib/documents/document-model.ts';

test('document files respect type, per-file and restaurant quota limits', () => {
  const valid = { name: 'contract.pdf', type: 'application/pdf', size: 2_000_000 };
  assert.equal(validateDocumentFile(valid), null);
  assert.equal(
    validateDocumentFile({ ...valid, size: DOCUMENT_MAX_FILE_BYTES + 1 }),
    'This file exceeds the per-file limit.'
  );
  assert.equal(
    validateDocumentFile({ ...valid, type: 'text/html' }),
    'Use PDF, Word, Excel, CSV, text, JPG, PNG or WebP files.'
  );
  assert.equal(
    validateDocumentFile(valid, DOCUMENT_MAX_FILE_BYTES, 1_000_000),
    'This restaurant does not have enough storage left.'
  );
});

test('document presentation keeps names, expiry and quota arithmetic deterministic', () => {
  assert.equal(titleFromFilename('staff_contract-v3.pdf'), 'staff contract v3');
  assert.equal(formatBytes(250 * 1024 * 1024), '250 MB');
  assert.equal(documentExpiryState(null, '2026-07-29'), 'none');
  assert.equal(documentExpiryState('2026-07-28', '2026-07-29'), 'expired');
  assert.equal(documentExpiryState('2026-08-20', '2026-07-29'), 'soon');
  assert.equal(documentExpiryState('2026-09-20', '2026-07-29'), 'current');
  assert.equal(quotaPercent({
    planCode: 'included',
    totalLimitBytes: 250,
    maxFileBytes: 10,
    usedBytes: 125
  }), 50);
});

test('document workspace parsing rejects malformed API shapes safely', () => {
  const workspace = parseDocumentWorkspace({
    documents: [{ id: 'd1', title: 'Permit', category: 'invalid', status: 'invalid' }],
    quota: { total_limit_bytes: '1000', used_bytes: '250' },
    employees: [{ id: 'e1', name: 'Jane', active: true }, { id: '', name: '' }]
  });
  assert.equal(workspace.documents[0]?.category, 'other');
  assert.equal(workspace.documents[0]?.status, 'ready');
  assert.equal(workspace.quota.totalLimitBytes, 1000);
  assert.equal(workspace.quota.usedBytes, 250);
  assert.deepEqual(workspace.employees, [{ id: 'e1', name: 'Jane', active: true }]);
});

test('document storage is private, quota-reserved and RPC-only', async () => {
  const foundation = await readFile(
    'supabase/migrations/20260729192250_restaurant_document_library.sql',
    'utf8'
  );

  assert.match(foundation, /'restaurant-documents',\s*'restaurant-documents',\s*false,\s*10485760/s);
  assert.match(foundation, /total_limit_bytes bigint not null default 262144000/);
  assert.match(foundation, /pg_advisory_xact_lock/);
  assert.match(foundation, /status in \('uploading', 'ready'\)/);
  assert.match(foundation, /v_actual_size is distinct from v_document\.size_bytes/);
  assert.match(foundation, /v_actual_mime is distinct from v_document\.mime_type/);
  assert.match(foundation, /access_scope = 'owner'/);
  assert.match(foundation, /alter table public\.restaurant_documents enable row level security/);
  assert.match(foundation, /revoke all on table public\.restaurant_documents\s+from public, anon, authenticated/);
  assert.doesNotMatch(foundation, /create policy .* on public\.restaurant_documents/i);
  assert.match(foundation, /accept reserved uploads[\s\S]*document_storage_object_access\(name, 'upload'\)/);
  assert.match(foundation, /expose reserved upload result[\s\S]*document_storage_object_access\(name, 'upload'\)/);
  const uploadPolicy = foundation.match(
    /create policy "restaurant documents accept reserved uploads"[\s\S]*?\n  \);/
  )?.[0] ?? '';
  assert.doesNotMatch(uploadPolicy, /metadata ->>/);
  assert.match(foundation, /archived_event\.event_type = 'archived'/);
  assert.match(foundation, /document\.status = 'ready'/);
});

test('Documents is one manager module with a deliberate upgrade handoff', async () => {
  const navigation = await readFile('src/lib/workspace-ui/workspace-nav.ts', 'utf8');
  const page = await readFile('src/routes/(app)/documents/+page.svelte', 'utf8');
  const security = await readFile('supabase/tests/canonical_schema_security.sql', 'utf8');

  assert.match(navigation, /key: 'documents'[\s\S]*?href: '\/documents'[\s\S]*?roles: MANAGER/);
  assert.match(page, /DocumentUploadDialog/);
  assert.match(page, /DocumentDetailsDialog/);
  assert.match(page, /submitPilotFeedback/);
  assert.match(page, /confirm pricing before changing the limit/);
  assert.match(security, /begin_restaurant_document_upload\(uuid,text,text,text,bigint,text,uuid,date,date,text,text\)/);
  assert.match(security, /document_storage_object_access\(text,text,bigint,text\)/);
});

test('linked verification executes the document security lifecycle', async () => {
  const verification = await readFile('scripts/verify-linked-database.ps1', 'utf8');
  const contract = await readFile('supabase/tests/document_library_contract.sql', 'utf8');

  assert.match(verification, /document_library_contract\.sql/);
  assert.match(contract, /cancelled reservations must not appear as archived files/i);
  assert.match(contract, /Managers must not see owner-only documents/i);
  assert.match(contract, /Employees must not open the management document library/i);
});
