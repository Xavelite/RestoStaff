/* Actual-entry contract: clock/photo normalization and compaction. */
function normalizeClockValue(value){
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if(!match)return '';
  const h = Number(match[1]);
  const m = Number(match[2]);
  if(h < 0 || h > 23 || m < 0 || m > 59)return '';
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function normalizePhotoStatus(value){
  const raw = String(value || '').trim();
  return ACTUAL_PHOTO_STATUSES.includes(raw) ? raw : '';
}

function normalizePhotoDataUrl(value){
  const raw = String(value || '').trim();
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(raw) ? raw : '';
}

function normalizeActualEntry(entry){
  const source = isPlainObject(entry) ? entry : {};
  const normalized = Object.assign({}, source, {
    id: String(source.id || '').trim(),
    clockIn: normalizeClockValue(source.clockIn),
    clockOut: normalizeClockValue(source.clockOut),
    clockInAt: normalizeIsoStamp(source.clockInAt),
    clockOutAt: normalizeIsoStamp(source.clockOutAt),
    createdAt: normalizeIsoStamp(source.createdAt),
    updatedAt: normalizeIsoStamp(source.updatedAt),
    clockInPhoto: normalizePhotoDataUrl(source.clockInPhoto),
    clockOutPhoto: normalizePhotoDataUrl(source.clockOutPhoto),
    clockInPhotoStatus: normalizePhotoStatus(source.clockInPhotoStatus),
    clockOutPhotoStatus: normalizePhotoStatus(source.clockOutPhotoStatus),
    clockInPhotoCapturedAt: normalizeIsoStamp(source.clockInPhotoCapturedAt),
    clockOutPhotoCapturedAt: normalizeIsoStamp(source.clockOutPhotoCapturedAt),
    adjustedAt: normalizeIsoStamp(source.adjustedAt),
    cancelledAt: normalizeIsoStamp(source.cancelledAt),
    status: String(source.status || '').trim(),
    source: String(source.source || '').trim(),
    adjustmentReason: String(source.adjustmentReason || '').trim(),
    cancellationReason: String(source.cancellationReason || '').trim()
  });

  if(normalized.clockOut && !normalized.clockIn){
    normalized.clockOut = '';
    normalized.clockOutAt = '';
  }

  return normalized;
}

function hasActualEntryValue(entry){
  const normalized = normalizeActualEntry(entry);
  return !!(
    normalized.clockIn || normalized.clockOut ||
    normalized.clockInAt || normalized.clockOutAt ||
    normalized.clockInPhoto || normalized.clockOutPhoto ||
    normalized.clockInPhotoStatus || normalized.clockOutPhotoStatus ||
    normalized.clockInPhotoCapturedAt || normalized.clockOutPhotoCapturedAt ||
    normalized.id || normalized.status || normalized.adjustedAt || normalized.cancelledAt ||
    normalized.adjustmentReason || normalized.cancellationReason
  );
}

function compactActualEntry(entry){
  const normalized = normalizeActualEntry(entry);
  if(!hasActualEntryValue(normalized)) return undefined;
  const compact = {};
  [
    'clockIn','clockOut','clockInAt','clockOutAt','createdAt','updatedAt',
    'clockInPhoto','clockOutPhoto','clockInPhotoStatus','clockOutPhotoStatus',
    'clockInPhotoCapturedAt','clockOutPhotoCapturedAt','source','status','id',
    'adjustedAt','adjustmentReason','cancelledAt','cancellationReason'
  ].forEach(key=>{
    const value = normalized[key];
    if(value !== undefined && value !== null && String(value).trim() !== '') compact[key] = value;
  });
  return compact;
}
