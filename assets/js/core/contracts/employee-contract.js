/* Employee contract: Team master data normalized into the runtime shape. */
function employeePayrollMissingFields(employee){
  const missing=[];
  if(!String(employee?.payrollId || '').trim()) missing.push('Payroll employee ID');
  if(!String(employee?.payrollProvider || '').trim()) missing.push('Payroll provider');
  if(!String(employee?.socialSecurityNo || '').trim()) missing.push('NISS / social security no.');
  if(!String(employee?.iban || '').trim()) missing.push('IBAN');
  return missing;
}

function normalizePositionList(positionList){
  if(!Array.isArray(positionList))return [];
  return positionList.map((position,index)=>{
    if(isPlainObject(position)){
      const name = cleanPositionName(position.name || position.position || '');
      return {
        id:String(position.id || normalizeSlug(name,`position-${index+1}`)).trim(),
        name,
        active:position.active !== false,
        hourlyCost:Number.isFinite(Number(position.hourlyCost)) ? Math.max(0,Number(position.hourlyCost)) : 0
      };
    }
    const name = cleanPositionName(position || '');
    return {id:normalizeSlug(name,`position-${index+1}`), name, active:true, hourlyCost:0};
  }).filter(position=>position.id && position.name);
}

function resolveEmployeePosition(source, positionList){
  const positions = normalizePositionList(positionList);
  const rawId = String(source?.positionId || '').trim();
  return rawId ? positions.find(position=>String(position.id) === rawId) || null : null;
}

function normalizeEmployeeRecord(employee, index, positionList){
  const source = isPlainObject(employee) ? employee : {};
  const normalized = Object.assign({}, source);
  const generatedId = `e${index}`;
  const position = resolveEmployeePosition(source, positionList);
  const sourceHourlyCost = Number.isFinite(Number(source.hourlyCost)) ? Math.max(0,Number(source.hourlyCost)) : 0;
  const defaultHourlyCost = Number.isFinite(Number(position?.hourlyCost)) ? Math.max(0,Number(position.hourlyCost)) : 0;
  const hourlyCost = sourceHourlyCost || defaultHourlyCost || 0;

  normalized.id = String(source.id || generatedId).trim() || generatedId;
  normalized.name = String(source.name || '').trim();
  normalized.positionId = position ? String(position.id).trim() : '';
  normalized.hourlyCost = hourlyCost;
  normalized.active = source.active === undefined ? false : !!source.active;
  normalized.managerAccess = !!(source.managerAccess || source.isManager || source.manager);
  normalized.pin = sanitizePin(source.pin);

  [
    'firstName','lastName','payrollId','employeeNumber','email','phone','address','postalCode','city','nationality',
    'contractType','contractStart','contractEnd','workRegime','socialSecurityNo','iban','bic','annualLeaveEntitlementDays','payrollProvider',
    'payrollNotes','emergencyName','emergencyRelation','emergencyPhone','notes'
  ].forEach(field=>{
    normalized[field] = String(source[field] || '').trim();
  });

  normalized.contractStart = normalizeDateString(normalized.contractStart);
  normalized.contractEnd = normalizeDateString(normalized.contractEnd);
  normalized.contractHours = Number.isFinite(Number(source.contractHours)) ? Math.max(0,Number(source.contractHours)) : 0;
  normalized.annualLeaveEntitlementDays = Number.isFinite(Number(source.annualLeaveEntitlementDays)) ? Math.max(0,Number(source.annualLeaveEntitlementDays)) : 0;
  normalized.payrollReady = employeePayrollMissingFields(normalized).length === 0;
  normalized.absences = normalizeAbsenceList(source.absences);

  delete normalized.position;
  delete normalized.rate;
  delete normalized.isManager;
  delete normalized.manager;
  return normalized;
}
