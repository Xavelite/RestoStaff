/**
 * Supabase data adapter — strict relational facade
 * ------------------------------------------------
 * Operational data is stored in normalized Supabase tables. The UI still works
 * with one hydrated runtime state object because the current vanilla JS app is
 * optimized around a central planner state.
 *
 * There is intentionally no local planner-data mode in this build.
 * localStorage is used only for device session/preferences such as login state,
 * notification read state and selected workspace id.
 */
(function(){
  const config = window.APP_CONFIG || {};
  const shouldUseSupabase = config.storageMode === 'supabase' && config.supabaseUrl && config.supabaseKey;

  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const EMPTY_WEEKLY = Object.freeze({
    availability:{}, planning:{}, assignments:{}, assignmentPositions:{}, assignmentTimes:{}, submitted:{}, notes:{}, actualEntries:{}, status:'Draft'
  });

  const KEYS = Object.freeze({
    session:'restogogo_session',
    loggedIn:'restogogo_logged_in',
    notificationsRead:'restogogo_notifications_read',
    workspaceId:'restogogo_workspace_id',
    workspaceCatalog:'restogogo_workspace_catalog'
  });

  const TABLES = Object.assign({
    restaurants:'restogogo_restaurants',
    employees:'restogogo_employees',
    employeeAbsences:'restogogo_employee_absences',
    absenceTypes:'restogogo_absence_types',
    positions:'restogogo_positions',
    zones:'restogogo_zones',
    zoneCoverageRequirements:'restogogo_zone_coverage_requirements',
    openingHours:'restogogo_opening_hours',
    weeklyStatus:'restogogo_weekly_status',
    availabilitySlots:'restogogo_availability_slots',
    plannedShifts:'restogogo_planned_shifts',
    employeeWeekSubmissions:'restogogo_employee_week_submissions',
    weeklyNotes:'restogogo_weekly_notes',
    actualShiftEntries:'restogogo_actual_shift_entries'
  }, config.supabaseTables || {});

  const {isPlainObject, cloneData, text, numberValue, boolValue, cleanPositionName, sanitizePin, sanitizeWorkspaceId, sanitizeId, monday, validDate, validIso, validClock, validRange, normalizeDay, normalizeShift} = window.RestogogoSupabaseUtils;

  const {getString, setString, getJSON, setJSON, remove} = window.RestogogoSessionStore;

  const baseUrl = String(config.supabaseUrl || '').replace(/\/rest\/v1\/?$/,'').replace(/\/+$/,'');
  const restBase = `${baseUrl}/rest/v1`;
  const apiKey = config.supabaseKey || '';
  const defaultWorkspaceId = sanitizeWorkspaceId(config.defaultWorkspaceId || 'bouillon-bruxelles');
  let currentRecordId = sanitizeWorkspaceId(getString(KEYS.workspaceId, defaultWorkspaceId) || defaultWorkspaceId);
  let lastError = '';
  let lastReadStatus = 'idle';

  function setError(message){lastError = message || ''; if(lastError) Restogogo.warn?.(lastError);}
  const repo = window.RestogogoSupabaseRepository.createRepository({
    apiKey, restBase, tables: TABLES, getWorkspaceId: () => currentRecordId, validDate, monday, setError
  });
  const {selectRows, deleteWeekRows, upsertRows, upsertRowsReturning, replaceRows, upsertRestaurant} = repo;

  function emptyWeekly(){return cloneData(EMPTY_WEEKLY);}
  function ensureWeek(history, weekStart){
    const week = validDate(weekStart) ? monday(weekStart) : monday();
    history[week] = isPlainObject(history[week]) ? history[week] : emptyWeekly();
    history[week].availability = isPlainObject(history[week].availability) ? history[week].availability : {};
    history[week].planning = isPlainObject(history[week].planning) ? history[week].planning : {};
    history[week].assignments = isPlainObject(history[week].assignments) ? history[week].assignments : {};
    history[week].assignmentPositions = isPlainObject(history[week].assignmentPositions) ? history[week].assignmentPositions : {};
    history[week].assignmentTimes = isPlainObject(history[week].assignmentTimes) ? history[week].assignmentTimes : {};
    history[week].submitted = isPlainObject(history[week].submitted) ? history[week].submitted : {};
    history[week].notes = isPlainObject(history[week].notes) ? history[week].notes : {};
    history[week].actualEntries = isPlainObject(history[week].actualEntries) ? history[week].actualEntries : {};
    history[week].status = history[week].status === 'Published' ? 'Published' : 'Draft';
    return history[week];
  }
  function setSparseSlot(root, employeeId, day, shift, value){
    if(value === undefined || value === null || value === '' || value === false)return;
    root[employeeId] = isPlainObject(root[employeeId]) ? root[employeeId] : {};
    root[employeeId][day] = isPlainObject(root[employeeId][day]) ? root[employeeId][day] : {};
    root[employeeId][day][shift] = value;
  }
  function currentWeeklyPayload(source){
    return {
      availability:isPlainObject(source?.availability)?source.availability:{},
      planning:isPlainObject(source?.planning)?source.planning:{},
      assignments:isPlainObject(source?.assignments)?source.assignments:{},
      assignmentPositions:isPlainObject(source?.assignmentPositions)?source.assignmentPositions:{},
      assignmentTimes:isPlainObject(source?.assignmentTimes)?source.assignmentTimes:{},
      submitted:isPlainObject(source?.submitted)?source.submitted:{},
      notes:isPlainObject(source?.notes)?source.notes:{},
      actualEntries:isPlainObject(source?.actualEntries)?source.actualEntries:{},
      status:source?.status === 'Published' ? 'Published' : 'Draft'
    };
  }
  function hasWeeklyContent(payload){
    return payload?.status === 'Published' || ['availability','planning','assignments','assignmentPositions','assignmentTimes','submitted','notes','actualEntries'].some(key=>Object.keys(isPlainObject(payload?.[key])?payload[key]:{}).length);
  }

  const readMapper = window.RestogogoSupabaseReadMapper.create({
    text, numberValue, boolValue, cleanPositionName, sanitizePin, validDate, validIso, validClock, validRange,
    normalizeDay, normalizeShift, isPlainObject, cloneData, monday,
    emptyWeekly, ensureWeek, setSparseSlot
  });
  const {mapEmployee, mapAbsence, mapAbsenceType, mapPosition, mapZone, mapCoverageRequirement, buildOpeningHours, hydrateWeeks} = readMapper;

  async function readRemotePlanner(){
    lastReadStatus = 'loading';
    const restaurantRows = await selectRows(TABLES.restaurants, `id=eq.${encodeURIComponent(currentRecordId)}&select=*`);
    if(restaurantRows === null){lastReadStatus='error'; return null;}
    const restaurant = restaurantRows[0];
    if(!restaurant){lastReadStatus='empty'; return null;}

    const scoped = table => `${table}=eq.${encodeURIComponent(currentRecordId)}`;
    const [employees, absences, absenceTypes, positions, zones, zoneCoverageRequirements, openingHours, weeklyStatus, availabilitySlots, plannedShifts, employeeWeekSubmissions, weeklyNotes, actualShiftEntries] = await Promise.all([
      selectRows(TABLES.employees, `${scoped('restaurant_id')}&select=*&order=sort_order.asc`),
      selectRows(TABLES.employeeAbsences, `${scoped('restaurant_id')}&select=*&order=start_date.desc`),
      selectRows(TABLES.absenceTypes, `${scoped('restaurant_id')}&select=*&order=sort_order.asc`),
      selectRows(TABLES.positions, `${scoped('restaurant_id')}&select=*&order=sort_order.asc`),
      selectRows(TABLES.zones, `${scoped('restaurant_id')}&select=*&order=sort_order.asc`),
      selectRows(TABLES.zoneCoverageRequirements, `${scoped('restaurant_id')}&select=*&order=sort_order.asc`),
      selectRows(TABLES.openingHours, `${scoped('restaurant_id')}&select=*&order=sort_order.asc`),
      selectRows(TABLES.weeklyStatus, `${scoped('restaurant_id')}&select=*`),
      selectRows(TABLES.availabilitySlots, `${scoped('restaurant_id')}&select=*`),
      selectRows(TABLES.plannedShifts, `${scoped('restaurant_id')}&select=*`),
      selectRows(TABLES.employeeWeekSubmissions, `${scoped('restaurant_id')}&select=*`),
      selectRows(TABLES.weeklyNotes, `${scoped('restaurant_id')}&select=*`),
      selectRows(TABLES.actualShiftEntries, `${scoped('restaurant_id')}&select=*`)
    ]);
    const allRows = {employees, absences, absenceTypes, positions, zones, zoneCoverageRequirements, openingHours, weeklyStatus, availabilitySlots, plannedShifts, employeeWeekSubmissions, weeklyNotes, actualShiftEntries};
    if(Object.values(allRows).some(value=>value === null)){lastReadStatus='error'; return null;}

    const absencesByEmployee = {};
    absences.forEach(row=>{(absencesByEmployee[row.employee_id] = absencesByEmployee[row.employee_id] || []).push(mapAbsence(row));});
    const mappedAbsenceTypes = normalizeAbsenceTypeList(absenceTypes.map(mapAbsenceType).filter(type=>type.name));
    const mappedPositions = positions.map(mapPosition).filter(p=>p.name);
    const positionNames = mappedPositions.filter(p=>p.active !== false).map(p=>p.name);
    const mappedZones = zones.map(mapZone).filter(z=>z.name);
    const mappedCoverageRequirements = zoneCoverageRequirements.map(mapCoverageRequirement).filter(req=>req.zoneId && req.serviceKey && req.positionId);
    const settings = isPlainObject(restaurant.settings) ? restaurant.settings : {};

    const state = {
      version: Number(window.DATA_CONTRACT_VERSION || 24),
      schemaVersion: Number(window.DATA_CONTRACT_VERSION || 24),
      restaurant: {
        name:text(restaurant.name),
        ownerName:text(restaurant.owner_name),
        city:text(restaurant.city)
      },
      weekStart:monday(),
      status:'Draft',
      employees:employees.map((row,index)=>Object.assign(mapEmployee(row, absencesByEmployee), {_sortOrder:index})),
      positions:positionNames,
      restaurantSetup:{
        general:{
          legalName:text(restaurant.legal_name || restaurant.name),
          companyNumber:text(restaurant.company_number),
          address:text(restaurant.address),
          city:text(restaurant.city),
          phone:text(restaurant.phone),
          email:text(restaurant.email)
        },
        zones:mappedZones.length ? mappedZones : [],
        positions:mappedPositions,
        coverageRequirements:mappedCoverageRequirements,
        openingHours:buildOpeningHours(openingHours),
        payrollRules:isPlainObject(restaurant.payroll_rules) ? restaurant.payroll_rules : {},
        absenceTypes:mappedAbsenceTypes
      },
      availability:{}, planning:{}, assignments:{}, assignmentPositions:{}, assignmentTimes:{}, submitted:{}, notes:{}, history:{}, actualEntries:{},
      notifications:Array.isArray(settings.notifications) ? settings.notifications : [],
      workspaceInitialized:boolValue(restaurant.workspace_initialized, false)
    };
    state.employees.forEach(employee=>{delete employee._sortOrder;});
    hydrateWeeks(allRows, state);
    lastReadStatus = 'ok';
    return state;
  }

  function hasCoreSetup(source){
    const setup = isPlainObject(source?.restaurantSetup) ? source.restaurantSetup : {};
    const employees = Array.isArray(source?.employees) ? source.employees : [];
    const zones = Array.isArray(setup.zones) ? setup.zones : [];
    const positions = Array.isArray(setup.positions) ? setup.positions : [];
    return employees.some(e=>e?.active !== false) && zones.some(z=>z?.active !== false && text(z?.name)) && positions.some(p=>p?.active !== false && text(p?.name));
  }
  const writeMapper = window.RestogogoSupabaseWriteMapper.create({
    getWorkspaceId: () => currentRecordId, DAYS, text, numberValue, boolValue, cleanPositionName, sanitizePin,
    sanitizeId, validDate, validIso, validClock, validRange, normalizeDay, normalizeShift,
    isPlainObject, monday, emptyWeekly, currentWeeklyPayload, hasWeeklyContent, hasCoreSetup
  });
  const {restaurantRowFromState, rowsFromState} = writeMapper;

  const weeklyRepository = window.RestogogoWeeklyRepository.create({TABLES, validDate, monday, deleteWeekRows, upsertRows});
  const {saveReasonScope, rowsForWeek, saveWeeklyScoped} = weeklyRepository;


  function validateCoverageMatrixRows(rows){
    const zones = Array.isArray(rows?.zones) ? rows.zones.filter(zone=>text(zone.id || zone.zone_id)) : [];
    const activePositions = Array.isArray(rows?.positions) ? rows.positions.filter(position=>position.active !== false && text(position.id || position.position_id)) : [];
    const coverageRows = Array.isArray(rows?.zoneCoverageRequirements) ? rows.zoneCoverageRequirements : [];
    const expectedRows = zones.length * activePositions.length * 2;
    if(expectedRows > 0 && coverageRows.length < expectedRows){
      return `Restaurant save blocked: coverage matrix is incomplete before save (${coverageRows.length}/${expectedRows} rows). Refresh and try again.`;
    }
    const badRows = coverageRows.filter(row=>!text(row.restaurant_id) || !text(row.zone_id) || !normalizeShift(row.service_key) || !text(row.position_id) || !Number.isFinite(Number(row.required_count)) || Number(row.required_count) < 0);
    if(badRows.length){
      return `Restaurant save blocked: coverage matrix contains ${badRows.length} invalid row(s).`;
    }
    return '';
  }

  function coverageKey(row){
    return [text(row?.restaurant_id), text(row?.zone_id), normalizeShift(row?.service_key), text(row?.position_id)].join('|');
  }

  function coverageRequiredCount(row){
    const value = Math.max(0, Math.round(Number(row?.required_count ?? row?.requiredCount ?? 0)));
    return Number.isFinite(value) ? value : 0;
  }

  function coverageMismatchMessage(expectedRows, actualRows, sourceLabel){
    const actualByKey = new Map((Array.isArray(actualRows) ? actualRows : []).map(row=>[coverageKey(row), coverageRequiredCount(row)]));
    const mismatches = [];
    (Array.isArray(expectedRows) ? expectedRows : []).forEach(row=>{
      const key = coverageKey(row);
      const expected = coverageRequiredCount(row);
      const actual = actualByKey.has(key) ? actualByKey.get(key) : null;
      if(actual !== expected)mismatches.push({key, expected, actual});
    });
    if(!mismatches.length)return '';
    const sample = mismatches.slice(0,5).map(item=>`${item.key}: expected ${item.expected}, got ${item.actual === null ? 'missing' : item.actual}`).join('; ');
    return `Coverage save verification failed after ${sourceLabel}: ${mismatches.length} mismatch(es). ${sample}`;
  }

  function coverageSaveTrace(rows, returnedRows, confirmedRows){
    const payload = Array.isArray(rows) ? rows : [];
    const editedPayload = payload.filter(row=>coverageRequiredCount(row) > 0);
    return {
      workspace: currentRecordId,
      payloadRows: payload.length,
      payloadNonZero: editedPayload.length,
      returnedRows: Array.isArray(returnedRows) ? returnedRows.length : 0,
      confirmedRows: Array.isArray(confirmedRows) ? confirmedRows.length : 0,
      sampleNonZero: editedPayload.slice(0,8).map(row=>({zoneId:row.zone_id, serviceKey:row.service_key, positionId:row.position_id, requiredCount:coverageRequiredCount(row)}))
    };
  }

  async function saveCoverageRequirements(rows, plannerData){
    const coverageRows = Array.isArray(rows?.zoneCoverageRequirements) ? rows.zoneCoverageRequirements : [];
    const validationError = validateCoverageMatrixRows(rows);
    if(validationError){setError(validationError); return false;}
    const returnedRows = await upsertRowsReturning(TABLES.zoneCoverageRequirements, coverageRows, ['restaurant_id','zone_id','service_key','position_id']);
    if(returnedRows === null)return false;
    const returnedMismatch = coverageMismatchMessage(coverageRows, returnedRows, 'upsert return');
    if(returnedMismatch){
      setError(returnedMismatch);
      try{ console.error('[restogogo:coverage-save-mismatch]', {stage:'upsert-return', trace:coverageSaveTrace(coverageRows, returnedRows, []), returnedMismatch}); }catch{}
      return false;
    }
    const confirmedRows = await selectRows(TABLES.zoneCoverageRequirements, `restaurant_id=eq.${encodeURIComponent(currentRecordId)}&select=zone_id,service_key,position_id,required_count,sort_order,metadata&order=sort_order.asc`);
    if(confirmedRows === null)return false;
    const confirmedMismatch = coverageMismatchMessage(coverageRows, confirmedRows.map(row=>Object.assign({restaurant_id:currentRecordId}, row)), 'DB re-read');
    if(confirmedMismatch){
      setError(confirmedMismatch);
      try{ console.error('[restogogo:coverage-save-mismatch]', {stage:'db-readback', trace:coverageSaveTrace(coverageRows, returnedRows, confirmedRows), confirmedMismatch}); }catch{}
      return false;
    }
    if(plannerData?.restaurantSetup){
      plannerData.restaurantSetup.coverageRequirements = confirmedRows
        .map(row=>mapCoverageRequirement(Object.assign({restaurant_id:currentRecordId}, row)))
        .filter(req=>req.zoneId && req.serviceKey && req.positionId);
      ensure(plannerData);
    }
    setError('');
    return true;
  }


  async function saveRemotePlanner(plannerData, options={}){
    const source = cloneData(plannerData || {});
    const reason = typeof options === 'string' ? options : (options && options.reason) || 'save';
    const scope = saveReasonScope(reason);
    const rows = rowsFromState(source);
    const restaurantOk = await upsertRestaurant(restaurantRowFromState(source));
    if(!restaurantOk)return false;

    if(scope === 'team'){
      if(!rows.employees.length){setError('Team save blocked: runtime state has zero employees. Refresh before saving.'); return false;}
      if(!await upsertRows(TABLES.employees, rows.employees, ['restaurant_id','id']))return false;
      if(!await upsertRows(TABLES.absenceTypes, rows.absenceTypes, ['restaurant_id','id']))return false;
      const employeeChildQuery = `restaurant_id=eq.${encodeURIComponent(currentRecordId)}`;
      if(!await replaceRows(TABLES.employeeAbsences, rows.employeeAbsences, employeeChildQuery, ['restaurant_id','employee_id','id']))return false;
      return true;
    }

    if(scope === 'restaurant'){
      if(!rows.zones.length){setError('Restaurant save blocked: runtime state has zero zones. Refresh before saving.'); return false;}
      if(!rows.positions.length){setError('Restaurant save blocked: runtime state has zero positions. Refresh before saving.'); return false;}
      if(!await upsertRows(TABLES.positions, rows.positions, ['restaurant_id','id']))return false;
      if(!await upsertRows(TABLES.zones, rows.zones, ['restaurant_id','id']))return false;
      if(!await saveCoverageRequirements(rows, plannerData))return false;
      if(!await upsertRows(TABLES.openingHours, rows.openingHours, ['restaurant_id','day_name']))return false;
      return true;
    }

    if(scope === 'availability'){
      return saveWeeklyScoped(rows, source.weekStart, {availability:true, submissions:true, planning:false, notes:false, actuals:false});
    }

    if(scope === 'employeeAbsences'){
      const employeeChildQuery = `restaurant_id=eq.${encodeURIComponent(currentRecordId)}`;
      return replaceRows(TABLES.employeeAbsences, rows.employeeAbsences, employeeChildQuery, ['restaurant_id','employee_id','id']);
    }

    if(scope === 'actuals'){
      return saveWeeklyScoped(rows, source.weekStart, {availability:false, submissions:false, planning:false, notes:false, actuals:true});
    }

    if(scope === 'planning'){
      return saveWeeklyScoped(rows, source.weekStart, {availability:false, submissions:false, planning:true, notes:true, actuals:false});
    }

    setError(`Save blocked: unscoped save reason "${reason}". Use a domain-specific workflow save.`);
    return false;
  }

  async function listRemoteWorkspaces(){
    const rows = await selectRows(TABLES.restaurants, 'select=id,name,owner_name,city,updated_at&order=updated_at.desc');
    if(!rows)return [];
    return rows.map(row=>({id:row.id, updated_at:row.updated_at, restaurant:{name:row.name, ownerName:row.owner_name, city:row.city}, counts:{}})).filter(w=>w.id);
  }

  const failAdapter = {
    mode:'supabase', supabaseOnly:true, KEYS,
    readPlanner(){lastReadStatus='error'; setError('Supabase is not configured.'); return null;},
    savePlanner(){setError('Supabase is not configured.'); return false;},
    getLastError(){return lastError;}, getLastReadStatus(){return lastReadStatus;}, wasLastReadError(){return true;},
    getWorkspaceId(){return currentRecordId;}, getDefaultWorkspaceId(){return defaultWorkspaceId;}, setWorkspaceId(value){currentRecordId=sanitizeWorkspaceId(value||defaultWorkspaceId); setString(KEYS.workspaceId,currentRecordId); return currentRecordId;}, sanitizeWorkspaceId,
    listWorkspaces(){return [];}, readSession(defaultValue){return getJSON(KEYS.session,defaultValue);}, saveSession(value){return setJSON(KEYS.session,value);}, isLoggedIn(){return getString(KEYS.loggedIn,'0')==='1';}, setLoggedIn(value){return setString(KEYS.loggedIn,value?'1':'0');}, readNotificationsRead(){return getJSON(KEYS.notificationsRead,{});}, saveNotificationsRead(value){return setJSON(KEYS.notificationsRead,value||{});}, readPreference(key, defaultValue=null){return getJSON(key,defaultValue);}, savePreference(key,value){return setJSON(key,value);}, getJSON, setJSON, getString, setString, remove
  };

  if(!shouldUseSupabase){
    window.SupabaseDataAdapter = failAdapter;
    window.DataAdapter = failAdapter;
    return;
  }

  const SupabaseDataAdapter = Object.assign({}, failAdapter, {
    readPlanner(){return readRemotePlanner();},
    savePlanner(plannerData, options){return saveRemotePlanner(plannerData, options || {});},
    getLastError(){return lastError;},
    getLastReadStatus(){return lastReadStatus;},
    wasLastReadError(){return lastReadStatus === 'error';},
    getWorkspaceId(){return currentRecordId;},
    getDefaultWorkspaceId(){return defaultWorkspaceId;},
    setWorkspaceId(value){currentRecordId = sanitizeWorkspaceId(value || defaultWorkspaceId); setString(KEYS.workspaceId, currentRecordId); lastReadStatus='idle'; return currentRecordId;},
    listWorkspaces(){return listRemoteWorkspaces();}
  });

  window.SupabaseDataAdapter = SupabaseDataAdapter;
  window.DataAdapter = SupabaseDataAdapter;
})();
