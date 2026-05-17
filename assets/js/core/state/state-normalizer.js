/* State normalizer: owns the runtime data contract normalization. */
function normalizeRuntimeState(target=data){
  const o=target || {};
  o.version = Number.isFinite(Number(o.version)) ? Math.max(Number(o.version), DATA_CONTRACT_VERSION) : DATA_CONTRACT_VERSION;
  o.schemaVersion = DATA_CONTRACT_VERSION;

  o.restaurant = isPlainObject(o.restaurant) ? o.restaurant : {};
  o.restaurant.name = String(o.restaurant.name || '').trim();
  o.restaurant.ownerName = String(o.restaurant.ownerName || '').trim();
  o.restaurant.city = String(o.restaurant.city || '').trim();

  o.restaurantSetup = normalizeRestaurantSetup(o.restaurantSetup, {restaurant:o.restaurant});

  o.positions = o.restaurantSetup.positions
    .filter(position=>position.active !== false)
    .map(position=>cleanPositionName(position.name))
    .filter(Boolean);
  o.positions = o.positions.filter((p,i,a)=>a.indexOf(p)===i);
  positions = o.positions;

  if(!Array.isArray(o.employees)) o.employees = [];
  const seenEmployeeIds = new Set();
  o.employees = o.employees.map((employee,index)=>{
    const normalized = normalizeEmployeeRecord(employee,index,o.restaurantSetup.positions);
    let uniqueId = normalized.id;
    let counter = 2;
    while(seenEmployeeIds.has(uniqueId)){
      uniqueId = `${normalized.id}-${counter++}`;
    }
    normalized.id = uniqueId;
    seenEmployeeIds.add(uniqueId);
    return normalized;
  });

  o.assignments = canonicalizeAssignmentMap(o.assignments, o.restaurantSetup);
  o.assignmentPositions = canonicalizeAssignmentPositionMap(o.assignmentPositions, o.restaurantSetup);
  o.weekStart = monday(o.weekStart || new Date());
  o.status = normalizeStatus(o.status);
  o.history = normalizeHistory(o.history);
  Object.values(o.history).forEach(week=>{
    week.assignments = canonicalizeAssignmentMap(week.assignments, o.restaurantSetup);
    week.assignmentPositions = canonicalizeAssignmentPositionMap(week.assignmentPositions, o.restaurantSetup);
  });
  o.notifications = Array.isArray(o.notifications) ? o.notifications : [];

  applyWeeklyPayloadToState(o, weeklyPayloadFromState(o));
  o.assignments = canonicalizeAssignmentMap(o.assignments, o.restaurantSetup);
  o.assignmentPositions = canonicalizeAssignmentPositionMap(o.assignmentPositions, o.restaurantSetup);
  return o;
}

window.RestogogoStateNormalizer = {ensure: normalizeRuntimeState};
