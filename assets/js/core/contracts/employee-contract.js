/* Employee contract: Team master data normalized into the runtime shape. */
function employeePayrollReadiness(employee, source=data){
  const setup = typeof setupFrom === 'function' ? setupFrom(source) : (source?.restaurantSetup || data?.restaurantSetup || {});
  const jobFunctions = Array.isArray(setup.jobFunctions) ? setup.jobFunctions : [];
  const departments = Array.isArray(setup.departments) ? setup.departments.filter(item=>item?.active !== false) : [];
  const teams = Array.isArray(setup.teams) ? setup.teams.filter(item=>item?.active !== false) : [];
  const contractTypes = Array.isArray(setup.contractTypes) ? setup.contractTypes.filter(item=>item?.active !== false) : [];
  const jobFunctionId = String(employee?.jobFunctionId || '').trim();
  const contractTypeId = String(employee?.contractTypeId || '').trim();
  const jobFunction = jobFunctions.find(item=>String(item?.id || '').trim() === jobFunctionId) || null;
  const contractType = contractTypes.find(item=>String(item?.id || '').trim() === contractTypeId) || null;
  const departmentId = String(employee?.departmentId || jobFunction?.departmentId || '').trim();
  const teamId = String(employee?.teamId || jobFunction?.teamId || '').trim();
  const department = departments.find(item=>String(item?.id || '').trim() === departmentId) || null;
  const team = teams.find(item=>String(item?.id || '').trim() === teamId) || null;
  const missing = [];

  if(!jobFunctionId || !jobFunction || jobFunction.active === false)missing.push('Job function');
  if(departments.length && !department)missing.push('Department');
  if(teams.length && !team)missing.push('Team');
  if(contractTypes.length ? !contractType : !String(contractTypeId || employee?.contractType || '').trim())missing.push('Contract type');
  if(!String(employee?.workRegime || '').trim())missing.push('Work regime');
  if(!Number(employee?.contractHours))missing.push('Weekly hours');
  if(!normalizeDateString(employee?.contractStart))missing.push('Contract start');
  if(!Number(employee?.annualLeaveEntitlementDays))missing.push('Annual leave entitlement');
  if(!String(employee?.payrollProvider || '').trim())missing.push('Payroll provider');
  if(!String(employee?.payrollId || '').trim())missing.push('Payroll employee ID');
  if(!String(employee?.socialSecurityNo || '').trim())missing.push('NISS / social security no.');
  if(!String(employee?.iban || '').trim())missing.push('IBAN');

  return {
    ready:missing.length === 0,
    status:missing.length ? 'missing-payroll-setup' : 'ready',
    missing,
    jobFunctionId,
    jobFunctionName:jobFunction?.name || '',
    departmentId,
    departmentName:department?.name || '',
    teamId,
    teamName:team?.name || '',
    contractTypeId,
    contractTypeName:contractType?.name || String(employee?.contractType || '').trim(),
    payrollEmployeeId:String(employee?.payrollId || '').trim()
  };
}

function employeePayrollMissingFields(employee, source=data){
  return employeePayrollReadiness(employee, source).missing;
}

function employeeContractMissingFields(employee){
  const missing=[];
  if(!String(employee?.contractTypeId || employee?.contractType || '').trim())missing.push('Contract type');
  if(!String(employee?.workRegime || '').trim())missing.push('Work regime');
  if(!Number(employee?.contractHours))missing.push('Weekly hours');
  if(!normalizeDateString(employee?.contractStart))missing.push('Start date');
  if(!Number(employee?.annualLeaveEntitlementDays))missing.push('Annual leave entitlement');
  return missing;
}

function normalizeJobFunctionList(jobFunctionList){
  if(!Array.isArray(jobFunctionList))return [];
  return jobFunctionList.map((jobFunction,index)=>{
    if(isPlainObject(jobFunction)){
      const name = cleanJobFunctionName(jobFunction.name || jobFunction.jobFunction || '');
      return {
        id:String(jobFunction.id || normalizeSlug(name,`job-function-${index+1}`)).trim(),
        name,
        active:jobFunction.active !== false,
        estimatedHourlyCost:Number.isFinite(Number(jobFunction.estimatedHourlyCost)) ? Math.max(0,Number(jobFunction.estimatedHourlyCost)) : 0
      };
    }
    const name = cleanJobFunctionName(jobFunction || '');
    return {id:normalizeSlug(name,`job-function-${index+1}`), name, active:true, estimatedHourlyCost:0};
  }).filter(jobFunction=>jobFunction.id && jobFunction.name);
}

function resolveEmployeeJobFunction(source, jobFunctionList){
  const jobFunctions = normalizeJobFunctionList(jobFunctionList);
  const rawId = String(source?.jobFunctionId || '').trim();
  return rawId ? jobFunctions.find(jobFunction=>String(jobFunction.id) === rawId) || null : null;
}

function normalizeEmployeeRecord(employee, index, jobFunctionList){
  const source = isPlainObject(employee) ? employee : {};
  const normalized = Object.assign({}, source);
  const generatedId = `e${index}`;
  const jobFunction = resolveEmployeeJobFunction(source, jobFunctionList);
  const sourceEstimatedHourlyCost = Number.isFinite(Number(source.estimatedHourlyCost)) ? Math.max(0,Number(source.estimatedHourlyCost)) : 0;
  const defaultEstimatedHourlyCost = Number.isFinite(Number(jobFunction?.estimatedHourlyCost)) ? Math.max(0,Number(jobFunction.estimatedHourlyCost)) : 0;
  const estimatedHourlyCost = sourceEstimatedHourlyCost || defaultEstimatedHourlyCost || 0;

  normalized.id = String(source.id || generatedId).trim() || generatedId;
  normalized.name = String(source.name || '').trim();
  normalized.jobFunctionId = jobFunction ? String(jobFunction.id).trim() : '';
  normalized.estimatedHourlyCost = estimatedHourlyCost;
  normalized.active = source.active === undefined ? false : !!source.active;
  normalized.role = String(source.role || (source.managerAccess || source.isManager || source.manager ? 'manager' : 'employee')).trim() || 'employee';
  normalized.managerAccess = ['owner','manager'].includes(normalized.role);
  normalized.badgeEnabled = source.badgeEnabled === undefined ? source.badge_enabled !== false : !!source.badgeEnabled;
  normalized.pinStatus = String(source.pinStatus || source.pin_status || '').trim();
  normalized.accessStatus = String(source.accessStatus || source.access_status || '').trim();

  [
    'firstName','lastName','payrollId','email','phone','address','postalCode','city','nationality',
    'contractTypeId','contractType','contractStart','contractEnd','workRegime','socialSecurityNo','iban','bic','annualLeaveEntitlementDays','payrollProvider',
    'payrollNotes','emergencyName','emergencyRelation','emergencyPhone','notes'
  ].forEach(field=>{
    normalized[field] = String(source[field] || '').trim();
  });

  normalized.contractStart = normalizeDateString(normalized.contractStart);
  normalized.contractEnd = normalizeDateString(normalized.contractEnd);
  normalized.contractHours = Number.isFinite(Number(source.contractHours)) ? Math.max(0,Number(source.contractHours)) : 0;
  normalized.annualLeaveEntitlementDays = Number.isFinite(Number(source.annualLeaveEntitlementDays)) ? Math.max(0,Number(source.annualLeaveEntitlementDays)) : 0;
  normalized.absences = normalizeAbsenceList(source.absences);

  delete normalized.jobFunction;
  delete normalized.rate;
  delete normalized.isManager;
  delete normalized.manager;
  return normalized;
}
