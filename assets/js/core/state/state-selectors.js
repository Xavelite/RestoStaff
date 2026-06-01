/* State selectors and derived restaurant/planning values. */
function setupFrom(source=data){return isPlainObject(source?.restaurantSetup) ? source.restaurantSetup : (data?.restaurantSetup || {});}
function employeesFrom(source=data){return Array.isArray(source?.employees) ? source.employees : (data?.employees || []);}
function emp(employeeId, source=data){return employeesFrom(source).find(e=>e.id===employeeId);}
function activeEmployees(source=data){return sortEmployees(employeesFrom(source).filter(e=>e.active), source);}
function positionById(positionId, source=data){
  const idValue=String(positionId || '').trim();
  return restaurantPositions(true, source).find(position=>String(position.id)===idValue) || null;
}
function employeePositionName(employee, source=data){return positionById(employee?.positionId, source)?.name || '';}
function employeePositionIndex(employee, source=data){
  const idValue=String(employee?.positionId || '').trim();
  const setupPositions = restaurantPositions(true, source);
  const byId = setupPositions.findIndex(position=>String(position.id)===idValue);
  if(byId>=0)return byId;
  const clean=cleanPositionName(employee?.position || '');
  const byName=setupPositions.findIndex(position=>cleanPositionName(position.name)===clean);
  return byName<0?999:byName;
}
function positionIndex(position, source=data){
  const clean=cleanPositionName(position);
  const index=restaurantPositions(true, source).findIndex(p=>cleanPositionName(p.name)===clean);
  return index<0?999:index;
}
function sortEmployees(list, source=data){return [...list].sort((a,b)=>employeePositionIndex(a,source)-employeePositionIndex(b,source)||String(a.name).localeCompare(String(b.name)));}
function activeRestaurantZones(shift='', source=data){
  const setupZones = Array.isArray(setupFrom(source).zones) ? setupFrom(source).zones : [];
  return setupZones.filter(zone=>zone?.active !== false && zone.id && zone.name);
}
function restaurantPositions(includeInactive=false, source=data){
  const setupPositions = Array.isArray(setupFrom(source).positions) ? setupFrom(source).positions : [];
  return setupPositions.filter(position=>includeInactive || position.active !== false);
}
function activePositionNames(source=data){
  return restaurantPositions(false, source)
    .map(position=>cleanPositionName(position.name))
    .filter((name,index,array)=>name && array.indexOf(name)===index)
    .sort((a,b)=>positionIndex(a, source)-positionIndex(b, source)||a.localeCompare(b));
}
function zoneById(zoneId, source=data){
  const idValue=String(zoneId || '').trim();
  if(!idValue)return null;
  const setupZones = Array.isArray(setupFrom(source).zones) ? setupFrom(source).zones : [];
  return setupZones.find(zone=>String(zone.id || '').trim()===idValue) || null;
}
function zoneDisplayName(zoneId, source=data){return zoneById(zoneId, source)?.name || '';}
function setupCoverageRequirements(source=data){const setup=setupFrom(source); return normalizeCoverageRequirements(setup.coverageRequirements || [], setup);}
function coverageRequirementsForZoneService(zoneId, shift, source=data){
  const id=String(zoneId || '').trim();
  const service=shifts.includes(shift)?shift:'';
  return setupCoverageRequirements(source).filter(req=>req.zoneId===id && (!service || req.serviceKey===service));
}
function requiredPositionIdsForZoneService(zoneId, shift, source=data){
  return coverageRequirementsForZoneService(zoneId, shift, source).map(req=>req.positionId).filter((value,index,array)=>value&&array.indexOf(value)===index);
}
function zoneDefaultPositionNames(zone){
  const ids = ['Lunch','Evening']
    .flatMap(serviceKey=>requiredPositionIdsForZoneService(zone?.id, serviceKey))
    .filter((value,index,array)=>value&&array.indexOf(value)===index);
  return ids.map(positionId=>positionById(positionId)?.name || '').filter(Boolean);
}
function assignmentZoneId(employeeId, day, shift, source=data){
  return canonicalZoneId(source?.planningSlots?.[employeeId]?.[day]?.[shift]?.zoneId, source?.restaurantSetup || data?.restaurantSetup);
}
function assignmentZoneName(employeeId, day, shift, source=data){return zoneDisplayName(assignmentZoneId(employeeId, day, shift, source), source);}
function assignmentPositionId(employeeId, day, shift, source=data){
  const setup=setupFrom(source);
  const saved = canonicalPositionId(source?.planningSlots?.[employeeId]?.[day]?.[shift]?.positionId, setup.positions || []);
  if(saved)return saved;
  const employee = emp(employeeId, source);
  return canonicalPositionId(employee?.positionId, setup.positions || []);
}
function assignmentPositionName(employeeId, day, shift, source=data){
  const id = assignmentPositionId(employeeId, day, shift, source);
  const list = Array.isArray(setupFrom(source).positions) ? setupFrom(source).positions : [];
  return list.find(position=>String(position.id)===id)?.name || '';
}
function openingRangeForDayShift(day,shift,source=data){
  const value=setupFrom(source).openingHours?.[day]?.[shift];
  return normalizeTimeRangeInput(value);
}
function suggestZoneId(employee, shift, source=data){
  if(!employee)return '';
  const zones = activeRestaurantZones(shift, source);
  if(!zones.length)return '';
  const positionId = String(employee.positionId || '').trim();
  if(!positionId)return '';
  const exact = zones.find(zone=>requiredPositionIdsForZoneService(zone.id, shift, source).includes(positionId));
  return exact ? String(exact.id || '').trim() : '';
}
function suggestZone(employee, shift, source=data){return zoneDisplayName(suggestZoneId(employee, shift, source), source);}
function timeRangeFor(e,d,s,source=data){
  const custom=source?.planningSlots?.[e.id]?.[d]?.[s]?.timeRange;
  if(custom)return custom;
  const zoneId=assignmentZoneId(e.id,d,s,source)||suggestZoneId(e,s,source);
  const zone = zoneById(zoneId, source);
  const zoneDefault=normalizeTimeRangeInput(zone?.defaultTimes?.[s]);
  if(zoneDefault)return zoneDefault;
  return openingRangeForDayShift(d,s,source);
}
function hoursFromRange(range){const bounds=timeRangeBounds(range); return bounds?Math.max(0,(bounds.end-bounds.start)/60):0;}
function slotHours(e,d,s,source=data){
  const raw=source?.availability?.[e.id]?.[d]?.[s];
  return (raw===true||raw==='available'||raw?.state==='available')?hoursFromRange(timeRangeFor(e,d,s,source)):0;
}
function plannedSlotHours(e,d,s,source=data){return source?.planningSlots?.[e.id]?.[d]?.[s]?.planned?hoursFromRange(timeRangeFor(e,d,s,source)):0;}
function isPlanned(employeeId,day,shift,source=data){return !!source?.planningSlots?.[employeeId]?.[day]?.[shift]?.planned;}
function employeePlannedWeekTotal(e,source=data){return days.reduce((sum,d)=>sum+shifts.reduce((slotSum,s)=>slotSum+plannedSlotHours(e,d,s,source),0),0);}
function absenceStatusRank(status){
  return Restogogo.logic?.absences?.statusRank?.(status,'planning') ?? 9;
}
function absenceAffectsPlanning(absence, source=data){
  return Restogogo.logic?.absences?.affectsPlanning?.(absence, source) || false;
}
function absenceCoversDateShift(absence,date,shift){
  return Restogogo.logic?.absences?.coversDateShift?.(absence,date,shift) || false;
}
function employeeAbsencesForDateShift(employee,date,shift,statuses=['Approved','Pending'], source=data){
  return Restogogo.logic?.absences?.forDateShift?.(employee,date,shift,{statuses,source,requirePlanningEffect:true,order:'planning',startOrder:'asc'}) || [];
}
function absenceForDate(employee,date,shift,statuses=['Approved','Pending'], source=data){
  return Restogogo.logic?.absences?.primaryForDateShift?.(employee,date,shift,{statuses,source,requirePlanningEffect:true,order:'planning',startOrder:'asc'}) || null;
}
function employeeAbsencesForSlot(employeeId,day,shift,statuses=['Approved','Pending'], source=data){
  return employeeAbsencesForDateShift(emp(employeeId,source),dateForDay(day),shift,statuses,source);
}
function absenceForDayShift(employeeId,day,shift,statuses=['Approved','Pending'], source=data){
  return employeeAbsencesForSlot(employeeId,day,shift,statuses,source)[0] || null;
}
function employeeAbsentForSlot(employeeId,day,shift){
  return !!absenceForDayShift(employeeId,day,shift,['Approved']);
}
function absenceDisplayLabel(absence,fallback='Leave', source=data){
  return Restogogo.logic?.absences?.label?.(absence,fallback,source) || String(fallback || 'Leave');
}
function absenceTypeMeta(absence, source=data){
  return Restogogo.logic?.absences?.typeFor?.(absence,source) || {id:'other', name:absence?.reason || 'Leave', code:'OTHER', category:'other'};
}
function absenceIconName(absence, source=data){
  return Restogogo.logic?.absences?.iconName?.(absence,source) || 'palm';
}
function absenceIconMarkup(absence,className='', source=data){
  return Restogogo.logic?.absences?.iconMarkup?.(absence,className,source) || '';
}
function absenceIcon(absence, source=data){
  return Restogogo.logic?.absences?.iconLabel?.(absence,source) || 'Leave';
}
function availabilityOverlayState(employeeId,day,shift){
  if(employeeAbsentForSlot(employeeId,day,shift))return 'unavailable';
  const raw=data.availability?.[employeeId]?.[day]?.[shift];
  if(raw===true||raw==='available'||raw?.state==='available')return 'available';
  if(raw==='partial'||raw?.state==='partial')return 'partial';
  if(raw===false||raw==='unavailable'||raw?.state==='unavailable')return data.submitted?.[employeeId]?'unavailable':'unknown';
  return data.submitted?.[employeeId]?'unavailable':'unknown';
}
