/* Restaurant setup contract: zones, jobFunctions, opening hours, coverage and payroll settings. */
function cleanZoneMetadata(metadata){
  const clean = isPlainObject(metadata) ? Object.assign({}, metadata) : {};
  delete clean.defaultTimes;
  delete clean.default_times;
  delete clean.defaultJobFunctionIds;
  delete clean.default_job_function_ids;
  delete clean.coverageRequirements;
  delete clean.coverage_requirements;
  return clean;
}

function canonicalJobFunctionId(value, jobFunctions=[]){
  const raw = String(value || '').trim();
  if(!raw)return '';
  const list = Array.isArray(jobFunctions) ? jobFunctions : [];
  const byId = list.find(jobFunction=>String(jobFunction?.id || '').trim() === raw);
  if(byId)return String(byId.id).trim();
  const clean = cleanJobFunctionName(raw).toLowerCase();
  const byName = list.find(jobFunction=>cleanJobFunctionName(jobFunction?.name || '').toLowerCase() === clean);
  return byName ? String(byName.id || '').trim() : '';
}

function canonicalJobFunctionIds(values, jobFunctions=[]){
  const source = Array.isArray(values) ? values : [];
  return source
    .map(value=>canonicalJobFunctionId(value, jobFunctions))
    .filter(Boolean)
    .filter((value,index,array)=>array.indexOf(value)===index);
}

function canonicalZoneId(value, setup){
  const raw = String(value || '').trim();
  if(!raw)return '';
  const zones = Array.isArray(setup?.zones) ? setup.zones : [];
  const byId = zones.find(zone=>String(zone?.id || '').trim() === raw);
  if(byId)return String(byId.id).trim();
  const clean = raw.toLowerCase();
  const byName = zones.find(zone=>String(zone?.name || '').trim().toLowerCase() === clean);
  return byName ? String(byName.id || '').trim() : '';
}


function coverageRequirementKey(requirement){
  return [requirement.zoneId, requirement.serviceKey, requirement.jobFunctionId].join('|');
}

function normalizeCoverageRequirements(requirements, setup={}, options={}){
  const normalized = [];
  const seen = new Set();
  const list = Array.isArray(requirements) ? requirements : [];
  const keepZero = options && options.keepZero === true;
  list.forEach((item,index)=>{
    const source = isPlainObject(item) ? item : {};
    const zoneId = canonicalZoneId(source.zoneId || source.zone_id || source.zone, setup);
    const serviceKey = shifts.includes(source.serviceKey || source.shiftName)
      ? (source.serviceKey || source.shiftName)
      : '';
    const jobFunctionId = canonicalJobFunctionId(source.jobFunctionId || source.job_function_id || source.jobFunction, setup.jobFunctions || []);
    const requiredCount = Math.max(0, Math.round(Number(source.requiredCount ?? source.required_count ?? source.count ?? 0)));
    if(!zoneId || !serviceKey || !jobFunctionId || (!keepZero && requiredCount <= 0))return;
    const requirement = {
      zoneId,
      serviceKey,
      jobFunctionId,
      requiredCount,
      sortOrder:Number.isFinite(Number(source.sortOrder ?? source.sort_order)) ? Number(source.sortOrder ?? source.sort_order) : index,
      metadata:isPlainObject(source.metadata) ? Object.assign({}, source.metadata) : {}
    };
    const key = coverageRequirementKey(requirement);
    if(seen.has(key)){
      const existing = normalized.find(row=>coverageRequirementKey(row)===key);
      if(existing)existing.requiredCount += requiredCount;
      return;
    }
    seen.add(key);
    normalized.push(requirement);
  });
  return normalized.sort((a,b)=>a.sortOrder-b.sortOrder || a.zoneId.localeCompare(b.zoneId) || shifts.indexOf(a.serviceKey)-shifts.indexOf(b.serviceKey) || a.jobFunctionId.localeCompare(b.jobFunctionId));
}


function buildCoverageRequirementMatrix(requirements, setup={}){
  const normalizedSetup = isPlainObject(setup) ? setup : {};
  const zones = Array.isArray(normalizedSetup.zones) ? normalizedSetup.zones : [];
  const jobFunctions = Array.isArray(normalizedSetup.jobFunctions) ? normalizedSetup.jobFunctions : [];
  const base = normalizeCoverageRequirements(requirements, normalizedSetup, {keepZero:true});
  const byKey = new Map();
  base.forEach(req=>{byKey.set(coverageRequirementKey(req), req);});
  const matrix = [];
  zones.forEach((zone,zoneIndex)=>{
    const zoneId = String(zone?.id || '').trim();
    if(!zoneId)return;
    shifts.forEach((serviceKey,serviceIndex)=>{
      jobFunctions.forEach((jobFunction,jobFunctionIndex)=>{
        if(jobFunction?.active === false)return;
        const jobFunctionId = String(jobFunction?.id || '').trim();
        if(!jobFunctionId)return;
        const key = [zoneId, serviceKey, jobFunctionId].join('|');
        const existing = byKey.get(key);
        matrix.push({
          zoneId,
          serviceKey,
          jobFunctionId,
          requiredCount:existing ? Math.max(0, Math.round(Number(existing.requiredCount || 0))) : 0,
          sortOrder:(zoneIndex * 1000) + (serviceIndex * 100) + jobFunctionIndex,
          metadata:isPlainObject(existing?.metadata) ? Object.assign({}, existing.metadata) : {}
        });
      });
    });
  });
  return matrix;
}

function normalizeRestaurantSetup(setup, source={}){
  const raw = isPlainObject(setup) ? setup : {};
  const general = isPlainObject(raw.general) ? raw.general : {};
  const normalized = {
    general:{
      legalName:String(general.legalName || source?.restaurant?.name || '').trim(),
      companyNumber:String(general.companyNumber || '').trim(),
      address:String(general.address || '').trim(),
      city:String(general.city || source?.restaurant?.city || '').trim(),
      phone:String(general.phone || '').trim(),
      email:String(general.email || '').trim()
    },
    departments:[],
    teams:[],
    zones:[],
    jobFunctions:[],
    contractTypes:[],
    coverageRequirements:[],
    absenceTypes:[],
    openingHours:{},
    payrollRules:{}
  };

  const rawDepartments = Array.isArray(raw.departments) ? raw.departments : [];
  normalized.departments = rawDepartments.map((department,index)=>{
    const sourceDepartment = isPlainObject(department) ? department : {name:department};
    const name = String(sourceDepartment.name || '').trim();
    return {
      id:String(sourceDepartment.id || normalizeSlug(name,`department-${index+1}`)).trim(),
      code:String(sourceDepartment.code || '').trim(),
      name,
      active:sourceDepartment.active === undefined ? true : !!sourceDepartment.active,
      sortOrder:Number.isFinite(Number(sourceDepartment.sortOrder ?? sourceDepartment.sort_order)) ? Number(sourceDepartment.sortOrder ?? sourceDepartment.sort_order) : index,
      metadata:isPlainObject(sourceDepartment.metadata) ? Object.assign({}, sourceDepartment.metadata) : {}
    };
  }).filter(department=>department.name).filter((department,index,array)=>array.findIndex(other=>other.id===department.id || other.name===department.name)===index);

  const rawTeams = Array.isArray(raw.teams) ? raw.teams : [];
  normalized.teams = rawTeams.map((team,index)=>{
    const sourceTeam = isPlainObject(team) ? team : {name:team};
    const name = String(sourceTeam.name || '').trim();
    return {
      id:String(sourceTeam.id || normalizeSlug(name,`team-${index+1}`)).trim(),
      departmentId:String(sourceTeam.departmentId || sourceTeam.department_id || '').trim(),
      code:String(sourceTeam.code || '').trim(),
      name,
      active:sourceTeam.active === undefined ? true : !!sourceTeam.active,
      sortOrder:Number.isFinite(Number(sourceTeam.sortOrder ?? sourceTeam.sort_order)) ? Number(sourceTeam.sortOrder ?? sourceTeam.sort_order) : index,
      metadata:isPlainObject(sourceTeam.metadata) ? Object.assign({}, sourceTeam.metadata) : {}
    };
  }).filter(team=>team.name).filter((team,index,array)=>array.findIndex(other=>other.id===team.id || other.name===team.name)===index);

  const rawjobFunctions = Array.isArray(raw.jobFunctions) ? raw.jobFunctions : [];
  normalized.jobFunctions = rawjobFunctions.map((jobFunction,index)=>{
    const p = isPlainObject(jobFunction) ? jobFunction : {name:jobFunction};
    const name = cleanJobFunctionName(p.name || p.jobFunction || '');
    return {
      id:String(p.id || normalizeSlug(name,`job-function-${index+1}`)).trim(),
      departmentId:String(p.departmentId || p.department_id || '').trim(),
      teamId:String(p.teamId || p.team_id || '').trim(),
      code:String(p.code || '').trim(),
      name,
      active:p.active === undefined ? true : !!p.active,
      estimatedHourlyCost:Number.isFinite(Number(p.estimatedHourlyCost)) ? Math.max(0,Number(p.estimatedHourlyCost)) : 0,
      sortOrder:Number.isFinite(Number(p.sortOrder ?? p.sort_order)) ? Number(p.sortOrder ?? p.sort_order) : index,
      metadata:isPlainObject(p.metadata) ? Object.assign({}, p.metadata) : {}
    };
  }).filter(p=>p.name).filter((p,index,array)=>array.findIndex(other=>other.id===p.id || other.name===p.name)===index);

  const rawContractTypes = Array.isArray(raw.contractTypes) ? raw.contractTypes : [];
  normalized.contractTypes = rawContractTypes.map((contractType,index)=>{
    const sourceContractType = isPlainObject(contractType) ? contractType : {name:contractType};
    const name = String(sourceContractType.name || '').trim();
    const category = String(sourceContractType.category || 'other').trim();
    return {
      id:String(sourceContractType.id || normalizeSlug(name,`contract-type-${index+1}`)).trim(),
      code:String(sourceContractType.code || '').trim(),
      name,
      category:['permanent','fixed_term','student','flexi','extra','interim','self_employed','other'].includes(category) ? category : 'other',
      payrollCode:String(sourceContractType.payrollCode || sourceContractType.payroll_code || '').trim(),
      active:sourceContractType.active === undefined ? true : !!sourceContractType.active,
      sortOrder:Number.isFinite(Number(sourceContractType.sortOrder ?? sourceContractType.sort_order)) ? Number(sourceContractType.sortOrder ?? sourceContractType.sort_order) : index,
      metadata:isPlainObject(sourceContractType.metadata) ? Object.assign({}, sourceContractType.metadata) : {}
    };
  }).filter(contractType=>contractType.name).filter((contractType,index,array)=>array.findIndex(other=>other.id===contractType.id || other.name===contractType.name)===index);

  const rawZones = Array.isArray(raw.zones) ? raw.zones : [];
  normalized.zones = rawZones.map((zone,index)=>{
    const z = isPlainObject(zone) ? zone : {name:zone};
    const name = String(z.name || z.zone || '').trim();
    const rawDefaultTimes = isPlainObject(z.defaultTimes) ? z.defaultTimes : {};
    return {
      id:String(z.id || normalizeSlug(name,`zone-${index+1}`)).trim(),
      name,
      active:z.active === undefined ? true : !!z.active,
      defaultTimes:{
        Lunch:normalizeTimeRangeInput(rawDefaultTimes.Lunch),
        Evening:normalizeTimeRangeInput(rawDefaultTimes.Evening)
      },
      metadata:cleanZoneMetadata(z.metadata),
      notes:String(z.notes || '').trim()
    };
  }).filter(z=>z.name).filter((z,index,array)=>array.findIndex(other=>other.id===z.id || other.name===z.name)===index);

  normalized.coverageRequirements = normalizeCoverageRequirements(raw.coverageRequirements || raw.coverage_requirements || [], normalized, {keepZero:true});

  normalized.absenceTypes = normalizeAbsenceTypeList(raw.absenceTypes);

  const rawHours = isPlainObject(raw.openingHours) ? raw.openingHours : {};
  days.forEach(day=>{
    const daySource = isPlainObject(rawHours?.[day]) ? rawHours[day] : {};
    normalized.openingHours[day] = {
      open:daySource.open === undefined ? false : !!daySource.open,
      Lunch:normalizeTimeRangeInput(daySource.Lunch),
      Evening:normalizeTimeRangeInput(daySource.Evening)
    };
  });

  const rawPayroll = isPlainObject(raw.payrollRules) ? raw.payrollRules : {};
  normalized.payrollRules = Object.assign({}, rawPayroll, {
    provider:String(rawPayroll.provider || '').trim(),
    exportFormat:String(rawPayroll.exportFormat || '').trim(),
    costCenter:String(rawPayroll.costCenter || '').trim(),
    missingSettings:Array.isArray(rawPayroll.missingSettings) ? rawPayroll.missingSettings.map(v=>String(v||'').trim()).filter(Boolean) : []
  });
  return normalized;
}
