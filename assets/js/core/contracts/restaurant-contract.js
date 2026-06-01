/* Restaurant setup contract: zones, positions, opening hours, coverage and payroll settings. */
function cleanZoneMetadata(metadata){
  const clean = isPlainObject(metadata) ? Object.assign({}, metadata) : {};
  delete clean.defaultTimes;
  delete clean.default_times;
  delete clean.defaultPositionIds;
  delete clean.default_position_ids;
  delete clean.coverageRequirements;
  delete clean.coverage_requirements;
  return clean;
}

function canonicalPositionId(value, positions=[]){
  const raw = String(value || '').trim();
  if(!raw)return '';
  const list = Array.isArray(positions) ? positions : [];
  const byId = list.find(position=>String(position?.id || '').trim() === raw);
  if(byId)return String(byId.id).trim();
  const clean = cleanPositionName(raw).toLowerCase();
  const byName = list.find(position=>cleanPositionName(position?.name || '').toLowerCase() === clean);
  return byName ? String(byName.id || '').trim() : '';
}

function canonicalPositionIds(values, positions=[]){
  const source = Array.isArray(values) ? values : [];
  return source
    .map(value=>canonicalPositionId(value, positions))
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
  return [requirement.zoneId, requirement.serviceKey, requirement.positionId].join('|');
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
    const positionId = canonicalPositionId(source.positionId || source.position_id || source.position, setup.positions || []);
    const requiredCount = Math.max(0, Math.round(Number(source.requiredCount ?? source.required_count ?? source.count ?? 0)));
    if(!zoneId || !serviceKey || !positionId || (!keepZero && requiredCount <= 0))return;
    const requirement = {
      zoneId,
      serviceKey,
      positionId,
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
  return normalized.sort((a,b)=>a.sortOrder-b.sortOrder || a.zoneId.localeCompare(b.zoneId) || shifts.indexOf(a.serviceKey)-shifts.indexOf(b.serviceKey) || a.positionId.localeCompare(b.positionId));
}


function buildCoverageRequirementMatrix(requirements, setup={}){
  const normalizedSetup = isPlainObject(setup) ? setup : {};
  const zones = Array.isArray(normalizedSetup.zones) ? normalizedSetup.zones : [];
  const positions = Array.isArray(normalizedSetup.positions) ? normalizedSetup.positions : [];
  const base = normalizeCoverageRequirements(requirements, normalizedSetup, {keepZero:true});
  const byKey = new Map();
  base.forEach(req=>{byKey.set(coverageRequirementKey(req), req);});
  const matrix = [];
  zones.forEach((zone,zoneIndex)=>{
    const zoneId = String(zone?.id || '').trim();
    if(!zoneId)return;
    shifts.forEach((serviceKey,serviceIndex)=>{
      positions.forEach((position,positionIndex)=>{
        if(position?.active === false)return;
        const positionId = String(position?.id || '').trim();
        if(!positionId)return;
        const key = [zoneId, serviceKey, positionId].join('|');
        const existing = byKey.get(key);
        matrix.push({
          zoneId,
          serviceKey,
          positionId,
          requiredCount:existing ? Math.max(0, Math.round(Number(existing.requiredCount || 0))) : 0,
          sortOrder:(zoneIndex * 1000) + (serviceIndex * 100) + positionIndex,
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
    zones:[],
    positions:[],
    coverageRequirements:[],
    absenceTypes:[],
    openingHours:{},
    payrollRules:{}
  };

  const rawPositions = Array.isArray(raw.positions) ? raw.positions : [];
  normalized.positions = rawPositions.map((position,index)=>{
    const p = isPlainObject(position) ? position : {name:position};
    const name = cleanPositionName(p.name || p.position || '');
    return {
      id:String(p.id || normalizeSlug(name,`position-${index+1}`)).trim(),
      name,
      active:p.active === undefined ? true : !!p.active,
      hourlyCost:Number.isFinite(Number(p.hourlyCost)) ? Math.max(0,Number(p.hourlyCost)) : 0,
      metadata:isPlainObject(p.metadata) ? Object.assign({}, p.metadata) : {}
    };
  }).filter(p=>p.name).filter((p,index,array)=>array.findIndex(other=>other.id===p.id || other.name===p.name)===index);

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
