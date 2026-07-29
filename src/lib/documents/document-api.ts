import { toApiError } from '$lib/api/error';
import { supabase } from '$lib/supabase/client';
import {
  parseDocumentWorkspace,
  validateDocumentFile,
  type DocumentAccessScope,
  type DocumentCategory,
  type DocumentWorkspace,
  type RestaurantDocument
} from './document-model';

const BUCKET = 'restaurant-documents';

type DocumentMetadataInput = {
  title: string;
  category: DocumentCategory;
  employeeId: string | null;
  documentDate: string | null;
  expiresOn: string | null;
  accessScope: DocumentAccessScope;
  note: string | null;
};

type UploadDocumentInput = DocumentMetadataInput & {
  restaurantId: string;
  file: File;
  maxFileBytes: number;
  remainingBytes: number;
};

type UploadReservation = {
  documentId: string;
  objectPath: string;
};

export async function getDocumentWorkspace(restaurantId: string): Promise<DocumentWorkspace> {
  const { data, error } = await supabase.rpc('get_restaurant_documents', {
    p_restaurant_id: restaurantId
  });
  if (error) throw toApiError(error, 'Documents could not be loaded.');
  return parseDocumentWorkspace(data);
}

export async function uploadRestaurantDocument(input: UploadDocumentInput): Promise<void> {
  const fileError = validateDocumentFile(input.file, input.maxFileBytes, input.remainingBytes);
  if (fileError) throw new Error(fileError);

  const reservation = await reserveUpload(input);
  let objectUploaded = false;
  try {
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(reservation.objectPath, input.file, {
        upsert: false,
        contentType: input.file.type,
        cacheControl: '3600'
      });
    if (uploadError) throw toApiError(uploadError, 'The file could not be uploaded.');
    objectUploaded = true;

    const { error: finalizeError } = await supabase.rpc(
      'finalize_restaurant_document_upload',
      {
        p_restaurant_id: input.restaurantId,
        p_document_id: reservation.documentId
      }
    );
    if (finalizeError) {
      throw toApiError(finalizeError, 'The uploaded file could not be verified.');
    }
  } catch (error) {
    if (objectUploaded) {
      await supabase.storage.from(BUCKET).remove([reservation.objectPath]).catch(() => undefined);
    }
    try {
      await supabase.rpc('cancel_restaurant_document_upload', {
        p_restaurant_id: input.restaurantId,
        p_document_id: reservation.documentId
      });
    } catch {
      // The original upload error is the useful failure. A stale reservation
      // is reclaimed by the database before the next upload.
    }
    throw error;
  }
}

async function reserveUpload(input: UploadDocumentInput): Promise<UploadReservation> {
  const { data, error } = await supabase.rpc('begin_restaurant_document_upload', {
    p_restaurant_id: input.restaurantId,
    p_title: input.title.trim(),
    p_original_filename: input.file.name,
    p_mime_type: input.file.type,
    p_size_bytes: input.file.size,
    p_category: input.category,
    p_employee_id: input.employeeId ?? undefined,
    p_document_date: input.documentDate ?? undefined,
    p_expires_on: input.expiresOn ?? undefined,
    p_access_scope: input.accessScope,
    p_note: input.note?.trim() || undefined
  });
  if (error) throw toApiError(error, 'Upload space could not be reserved.');

  const source = data && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const documentId = typeof source.document_id === 'string' ? source.document_id : '';
  const objectPath = typeof source.object_path === 'string' ? source.object_path : '';
  if (!documentId || !objectPath) throw new Error('Upload reservation was incomplete.');
  return { documentId, objectPath };
}

export async function updateRestaurantDocument(
  restaurantId: string,
  documentId: string,
  input: DocumentMetadataInput
): Promise<void> {
  const { error } = await supabase.rpc('update_restaurant_document', {
    p_restaurant_id: restaurantId,
    p_document_id: documentId,
    p_title: input.title.trim(),
    p_category: input.category,
    p_employee_id: input.employeeId ?? undefined,
    p_document_date: input.documentDate ?? undefined,
    p_expires_on: input.expiresOn ?? undefined,
    p_access_scope: input.accessScope,
    p_note: input.note?.trim() || undefined
  });
  if (error) throw toApiError(error, 'Document details could not be saved.');
}

export async function downloadRestaurantDocument(
  restaurantId: string,
  document: RestaurantDocument
): Promise<void> {
  const { error: auditError } = await supabase.rpc('record_restaurant_document_download', {
    p_restaurant_id: restaurantId,
    p_document_id: document.id
  });
  if (auditError) throw toApiError(auditError, 'Download access could not be verified.');

  const { data, error } = await supabase.storage.from(BUCKET).download(document.objectPath);
  if (error || !data) throw toApiError(error, 'The document could not be downloaded.');

  const url = URL.createObjectURL(data);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = document.originalFilename;
  anchor.style.display = 'none';
  window.document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function archiveRestaurantDocument(
  restaurantId: string,
  document: RestaurantDocument
): Promise<void> {
  const { error: removeError } = await supabase.storage
    .from(BUCKET)
    .remove([document.objectPath]);
  if (removeError) throw toApiError(removeError, 'The stored file could not be removed.');

  const { error } = await supabase.rpc('archive_restaurant_document', {
    p_restaurant_id: restaurantId,
    p_document_id: document.id
  });
  if (error) throw toApiError(error, 'The document record could not be archived.');
}
