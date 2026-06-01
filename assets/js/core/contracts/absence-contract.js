/* Absence contract used by Team master data, planning and payroll preparation. */
const DEFAULT_ABSENCE_TYPES = Object.freeze([
  {id:'holiday', name:'Holiday', code:'HOLIDAY', category:'holiday', paidPolicy:'paid', requiresApproval:true, affectsPlanning:true, affectsPayroll:true, payrollCode:'', color:'#38bdf8', active:true, sortOrder:10},
  {id:'sick_leave', name:'Sick leave', code:'SICK', category:'sick', paidPolicy:'paid', requiresApproval:true, affectsPlanning:true, affectsPayroll:true, payrollCode:'', color:'#fb7185', active:true, sortOrder:20},
  {id:'unpaid_leave', name:'Unpaid leave', code:'UNPAID', category:'unpaid', paidPolicy:'unpaid', requiresApproval:true, affectsPlanning:true, affectsPayroll:true, payrollCode:'', color:'#f59e0b', active:true, sortOrder:30},
  {id:'recovery_day', name:'Recovery day', code:'RECOVERY', category:'other', paidPolicy:'neutral', requiresApproval:true, affectsPlanning:true, affectsPayroll:true, payrollCode:'', color:'#a78bfa', active:true, sortOrder:40},
  {id:'family_reason', name:'Family reason', code:'FAMILY', category:'other', paidPolicy:'neutral', requiresApproval:true, affectsPlanning:true, affectsPayroll:true, payrollCode:'', color:'#34d399', active:true, sortOrder:50},
  {id:'training', name:'Training', code:'TRAINING', category:'training', paidPolicy:'paid', requiresApproval:false, affectsPlanning:true, affectsPayroll:true, payrollCode:'', color:'#60a5fa', active:true, sortOrder:60},
  {id:'public_holiday', name:'Public holiday', code:'PUBLIC_HOLIDAY', category:'holiday', paidPolicy:'paid', requiresApproval:false, affectsPlanning:true, affectsPayroll:true, payrollCode:'', color:'#facc15', active:true, sortOrder:70},
  {id:'no_show', name:'No show', code:'NO_SHOW', category:'other', paidPolicy:'unpaid', requiresApproval:false, affectsPlanning:true, affectsPayroll:true, payrollCode:'', color:'#ef4444', active:true, sortOrder:80},
  {id:'other', name:'Other', code:'OTHER', category:'other', paidPolicy:'neutral', requiresApproval:true, affectsPlanning:true, affectsPayroll:false, payrollCode:'', color:'#94a3b8', active:true, sortOrder:90}
]);

function normalizeAbsenceTypeList(value){
  const source = Array.isArray(value) && value.length ? value : DEFAULT_ABSENCE_TYPES;
  const seen = new Set();
  return source.map((item,index)=>{
    const row = isPlainObject(item) ? item : {};
    const name = String(row.name || row.label || '').trim();
    const idValue = String(row.id || row.code || name || `absence-type-${index+1}`).trim();
    const idClean = normalizeSlug(idValue,'absence-type');
    if(!name || seen.has(idClean))return null;
    seen.add(idClean);
    return {
      id:idClean,
      name,
      code:String(row.code || idClean).trim().toUpperCase().replace(/[^A-Z0-9_]+/g,'_'),
      category:String(row.category || 'other').trim(),
      paidPolicy:String(row.paidPolicy || row.paid_policy || 'neutral').trim(),
      requiresApproval:row.requiresApproval === undefined ? row.requires_approval !== false : !!row.requiresApproval,
      affectsPlanning:row.affectsPlanning === undefined ? row.affects_planning !== false : !!row.affectsPlanning,
      affectsPayroll:row.affectsPayroll === undefined ? row.affects_payroll !== false : !!row.affectsPayroll,
      payrollCode:String(row.payrollCode || row.payroll_code || '').trim(),
      color:String(row.color || '#94a3b8').trim(),
      active:row.active === undefined ? true : !!row.active,
      sortOrder:Number.isFinite(Number(row.sortOrder ?? row.sort_order)) ? Number(row.sortOrder ?? row.sort_order) : index,
      metadata:isPlainObject(row.metadata) ? row.metadata : {}
    };
  }).filter(Boolean).sort((a,b)=>(a.sortOrder-b.sortOrder)||a.name.localeCompare(b.name));
}

function absenceTypeById(types,idValue){
  const id = String(idValue || '').trim();
  return normalizeAbsenceTypeList(types).find(type=>type.id===id) || null;
}

function absenceTypeLabel(types,idValue,fallback='Absence'){
  return absenceTypeById(types,idValue)?.name || String(fallback || 'Absence').trim() || 'Absence';
}

function normalizeAbsenceList(value){
  return (Array.isArray(value) ? value : []).map((absence,index)=>{
    const source = isPlainObject(absence) ? absence : {};
    const start = normalizeDateString(source.start || source.startDate || source.start_date || source.date);
    const end = normalizeDateString(source.end || source.endDate || source.end_date || source.date || start);
    if(!start)return null;
    const shift = ['Full day',...shifts].includes(source.shift || source.shiftName) ? (source.shift || source.shiftName) : 'Full day';
    const status = ['Pending','Approved','Rejected','Cancelled'].includes(source.status) ? source.status : 'Approved';
    return {
      id:String(source.id || `absence-${start}-${index}`).trim(),
      absenceTypeId:String(source.absenceTypeId || source.absence_type_id || '').trim(),
      start,
      end:end || start,
      shift,
      reason:String(source.reason || source.typeName || 'Absence').trim(),
      status,
      requestedBy:String(source.requestedBy || source.requested_by || '').trim(),
      approvedBy:String(source.approvedBy || source.approved_by || '').trim(),
      approvedAt:normalizeIsoStamp(source.approvedAt || source.approved_at),
      rejectedBy:String(source.rejectedBy || source.rejected_by || '').trim(),
      rejectedAt:normalizeIsoStamp(source.rejectedAt || source.rejected_at),
      cancelledAt:normalizeIsoStamp(source.cancelledAt || source.cancelled_at),
      employeeComment:String(source.employeeComment || source.employee_comment || '').trim(),
      managerComment:String(source.managerComment || source.manager_comment || '').trim(),
      durationDays:Number.isFinite(Number(source.durationDays ?? source.duration_days)) ? Number(source.durationDays ?? source.duration_days) : 0,
      durationHours:Number.isFinite(Number(source.durationHours ?? source.duration_hours)) ? Number(source.durationHours ?? source.duration_hours) : 0,
      payrollExportStatus:String(source.payrollExportStatus || source.payroll_export_status || 'Not exported').trim(),
      payrollExportId:String(source.payrollExportId || source.payroll_export_id || '').trim(),
      metadata:isPlainObject(source.metadata) ? source.metadata : {}
    };
  }).filter(Boolean);
}
