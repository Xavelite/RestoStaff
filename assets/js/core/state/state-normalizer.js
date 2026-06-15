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

  // Keep jobFunctions single-sourced in restaurantSetup.jobFunctions; modules must use selectors.
  delete o.jobFunctions;

  if(!Array.isArray(o.employees)) o.employees = [];
  const seenEmployeeIds = new Set();
  o.employees = o.employees.map((employee,index)=>{
    const normalized = normalizeEmployeeRecord(employee,index,o.restaurantSetup.jobFunctions);
    let uniqueId = normalized.id;
    let counter = 2;
    while(seenEmployeeIds.has(uniqueId)){
      uniqueId = `${normalized.id}-${counter++}`;
    }
    normalized.id = uniqueId;
    seenEmployeeIds.add(uniqueId);
    return normalized;
  });

  o.weekStart = monday(o.weekStart || new Date());
  o.status = normalizeStatus(o.status);
  o.history = normalizeHistory(o.history);
  o.notifications = Array.isArray(o.notifications) ? o.notifications : [];

  applyWeeklyPayloadToState(o, weeklyPayloadFromState(o));
  return o;
}

window.RestogogoStateNormalizer = {ensure: normalizeRuntimeState};
