/**
 * Supabase data adapter — strict relational architecture
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
  const SHIFTS = ['Lunch','Evening'];
  const EMPTY_WEEKLY = Object.freeze({
    availability:{}, planning:{}, assignments:{}, assignmentTimes:{}, submitted:{}, notes:{}, actualEntries:{}, status:'Draft'
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
    employeeDocuments:'restogogo_employee_documents',
    restaurantDocuments:'restogogo_restaurant_documents',
    positions:'restogogo_positions',
    zones:'restogogo_zones',
    openingHours:'restogogo_opening_hours',
    weeklyStatus:'restogogo_weekly_status',
    availabilitySlots:'restogogo_availability_slots',
    plannedShifts:'restogogo_planned_shifts',
    employeeWeekSubmissions:'restogogo_employee_week_submissions',
    weeklyNotes:'restogogo_weekly_notes',
    actualShiftEntries:'restogogo_actual_shift_entries'
  }, config.supabaseTables || {});

  const baseUrl = String(config.supabaseUrl || '').replace(/\/rest\/v1\/?$/,'').replace(/\/+$/,'');
  const restBase = `${baseUrl}/rest/v1`;
  const apiKey = config.supabaseKey || '';
  const defaultWorkspaceId = sanitizeWorkspaceId(config.defaultWorkspaceId || 'bouillon-bruxelles');
  let currentRecordId = sanitizeWorkspaceId(getString(KEYS.workspaceId, defaultWorkspaceId) || defaultWorkspaceId);
  let lastError = '';
  let lastReadStatus = 'idle';

  function isPlainObject(value){return !!value && typeof value === 'object' && !Array.isArray(value);}
  function cloneData(value){return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));}
  function text(value){return String(value ?? '').trim();}
  function numberValue(value){const n = Number(value); return Number.isFinite(n) ? n : 0;}
  function boolValue(value){return value === true;}
  function cleanPositionName(value){return String(value || '').replace(/^\s*[A-Z]\.\s*/, '').trim();}
  function sanitizePin(value=''){return String(value || '').replace(/\D/g,'').slice(0,4);}
  function normalizeHexColor(value){const v=String(value||'').trim(); if(/^#[0-9a-f]{6}$/i.test(v))return v; if(/^#[0-9a-f]{3}$/i.test(v))return '#'+v.slice(1).split('').map(ch=>ch+ch).join(''); return '';}
  function sanitizeWorkspaceId(value){const raw = String(value || '').trim().toLowerCase(); return (raw.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64) || 'restaurant');}
  function sanitizeId(value, prefix='item'){
    const raw = String(value || '').trim();
    if(raw)return raw.replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,96) || `${prefix}-${Date.now()}`;
    return `${prefix}-${Date.now()}-${Math.round(Math.random()*10000)}`;
  }
  function localISO(d){const x=new Date(d); x.setHours(12,0,0,0); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;}
  function parseISO(iso){const [y,m,d]=String(iso||localISO(new Date())).split('-').map(Number); const x=new Date(y,(m||1)-1,d||1); x.setHours(12,0,0,0); return x;}
  function monday(d=new Date()){const x=(d instanceof Date)?new Date(d):parseISO(d); x.setHours(12,0,0,0); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); return localISO(x);}
  function validDate(value){const raw=String(value||'').trim(); if(!raw)return ''; if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw; const t=Date.parse(raw); return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):'';}
  function validIso(value){const raw=String(value||'').trim(); if(!raw)return ''; const t=Date.parse(raw); return Number.isFinite(t)?new Date(t).toISOString():'';}
  function validClock(value){const raw=String(value||'').trim(); const m=raw.match(/^(\d{1,2}):(\d{2})$/); if(!m)return ''; const h=Number(m[1]); const mm=Number(m[2]); return h>=0&&h<=23&&mm>=0&&mm<=59?`${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`:'';}
  function validRange(value){const raw=String(value||'').trim().replace(/[–—−]/g,'-').replace(/\s*-\s*/g,'-'); return /^(?:[01]?\d|2[0-3]):[0-5]\d-(?:[01]?\d|2[0-3]):[0-5]\d$/.test(raw)?raw:'';}
  function normalizeDay(value){const raw=String(value||'').trim(); return DAYS.includes(raw) ? raw : '';}
  function normalizeShift(value){const raw=String(value||'').trim(); return SHIFTS.includes(raw) ? raw : '';}
  function documentTypeFromName(name){const lower=String(name||'').toLowerCase(); if(lower.endsWith('.pdf'))return 'PDF'; if(lower.endsWith('.xlsx')||lower.endsWith('.xls'))return 'Excel'; if(lower.endsWith('.docx')||lower.endsWith('.doc'))return 'Word'; return 'File';}

  function setError(message){lastError = message || ''; if(lastError) console.error(lastError);}
  function headers(extra = {}){
    return Object.assign({
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }, extra);
  }
  function tableUrl(table, query=''){
    const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
    return `${restBase}/${encodeURIComponent(table)}${q}`;
  }
  async function request(method, table, query='', body, extraHeaders){
    const url = tableUrl(table, query);
    try{
      const response = await fetch(url, {
        method,
        headers: headers(extraHeaders || {}),
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const textBody = await response.text();
      if(response.ok){
        setError('');
        if(!textBody)return {ok:true,data:null};
        try{return {ok:true,data:JSON.parse(textBody)}}catch{return {ok:true,data:textBody}}
      }
      setError(`Supabase ${method} ${table} failed (${response.status}): ${textBody || 'No response body'}`);
      return {ok:false,data:null};
    }catch(error){
      setError(`Supabase ${method} ${table} error: ${error && error.message ? error.message : error}`);
      return {ok:false,data:null};
    }
  }
  async function selectRows(table, query){
    const result = await request('GET', table, query, undefined, {Accept:'application/json'});
    if(!result.ok)return null;
    return Array.isArray(result.data) ? result.data : [];
  }
  async function deleteRestaurantRows(table){
    const result = await request('DELETE', table, `restaurant_id=eq.${encodeURIComponent(currentRecordId)}`, undefined, {Prefer:'return=minimal'});
    return result.ok;
  }
  async function insertRows(table, rows){
    const payload = (rows || []).filter(Boolean);
    if(!payload.length)return true;
    const chunkSize = 400;
    for(let i=0;i<payload.length;i+=chunkSize){
      const result = await request('POST', table, '', payload.slice(i,i+chunkSize), {Prefer:'return=minimal'});
      if(!result.ok)return false;
    }
    return true;
  }
  async function upsertRows(table, rows, conflictColumns){
    const payload = (rows || []).filter(Boolean);
    if(!payload.length)return true;
    const conflict = Array.isArray(conflictColumns) ? conflictColumns.join(',') : String(conflictColumns || '');
    const query = conflict ? `on_conflict=${conflict}` : '';
    const chunkSize = 400;
    for(let i=0;i<payload.length;i+=chunkSize){
      const result = await request('POST', table, query, payload.slice(i,i+chunkSize), {Prefer:'resolution=merge-duplicates,return=minimal'});
      if(!result.ok)return false;
    }
    return true;
  }
  async function deleteScopedRows(table, query){
    const result = await request('DELETE', table, query, undefined, {Prefer:'return=minimal'});
    return result.ok;
  }
  async function deleteWeekRows(table, weekStart){
    const week = validDate(weekStart) ? monday(weekStart) : monday();
    return deleteScopedRows(table, `restaurant_id=eq.${encodeURIComponent(currentRecordId)}&week_start=eq.${encodeURIComponent(week)}`);
  }
  async function replaceRows(table, rows, deleteQuery, conflictColumns){
    if(!await deleteScopedRows(table, deleteQuery))return false;
    return upsertRows(table, rows, conflictColumns);
  }
  async function upsertRestaurant(row){
    const result = await request('POST', TABLES.restaurants, 'on_conflict=id', row, {Prefer:'resolution=merge-duplicates,return=minimal'});
    return result.ok;
  }

  function getString(key, defaultValue=''){
    try{const value = window.localStorage.getItem(key); return value == null ? defaultValue : value;}catch{return defaultValue;}
  }
  function setString(key, value){try{window.localStorage.setItem(key, String(value ?? ''));}catch{} return value;}
  function getJSON(key, defaultValue=null){try{const raw=window.localStorage.getItem(key); return raw ? JSON.parse(raw) : defaultValue;}catch{return defaultValue;}}
  function setJSON(key, value){try{window.localStorage.setItem(key, JSON.stringify(value));}catch{} return value;}
  function remove(key){try{window.localStorage.removeItem(key);}catch{}}

  function emptyWeekly(){return cloneData(EMPTY_WEEKLY);}
  function ensureWeek(history, weekStart){
    const week = validDate(weekStart) ? monday(weekStart) : monday();
    history[week] = isPlainObject(history[week]) ? history[week] : emptyWeekly();
    history[week].availability = isPlainObject(history[week].availability) ? history[week].availability : {};
    history[week].planning = isPlainObject(history[week].planning) ? history[week].planning : {};
    history[week].assignments = isPlainObject(history[week].assignments) ? history[week].assignments : {};
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
      assignmentTimes:isPlainObject(source?.assignmentTimes)?source.assignmentTimes:{},
      submitted:isPlainObject(source?.submitted)?source.submitted:{},
      notes:isPlainObject(source?.notes)?source.notes:{},
      actualEntries:isPlainObject(source?.actualEntries)?source.actualEntries:{},
      status:source?.status === 'Published' ? 'Published' : 'Draft'
    };
  }
  function hasWeeklyContent(payload){
    return payload?.status === 'Published' || ['availability','planning','assignments','assignmentTimes','submitted','notes','actualEntries'].some(key=>Object.keys(isPlainObject(payload?.[key])?payload[key]:{}).length);
  }

  function mapEmployee(row, absencesByEmployee, docsByEmployee){
    return {
      id:text(row.id),
      name:text(row.name),
      position:cleanPositionName(row.position),
      rate:numberValue(row.rate),
      active:boolValue(row.active),
      managerAccess:boolValue(row.manager_access),
      pin:sanitizePin(row.pin_code || row.pin),
      payrollId:text(row.payroll_id),
      externalId:text(row.external_id),
      employeeNumber:text(row.employee_number),
      email:text(row.email),
      phone:text(row.phone),
      address:text(row.address),
      nationality:text(row.nationality),
      language:text(row.language),
      contractType:text(row.contract_type),
      contractStart:validDate(row.contract_start),
      contractEnd:validDate(row.contract_end),
      documentFolder:text(row.document_folder),
      photoUrl:text(row.photo_url),
      dateOfBirth:validDate(row.date_of_birth),
      taxStatus:text(row.tax_status),
      socialSecurityNo:text(row.social_security_no),
      iban:text(row.iban),
      emergencyName:text(row.emergency_name),
      emergencyRelation:text(row.emergency_relation),
      emergencyPhone:text(row.emergency_phone),
      notes:text(row.notes),
      contractHours:numberValue(row.contract_hours),
      hourlyCost:numberValue(row.hourly_cost),
      payrollReady:boolValue(row.payroll_ready),
      metadata:isPlainObject(row.metadata) ? row.metadata : {},
      absences:absencesByEmployee[row.id] || [],
      documents:docsByEmployee[row.id] || []
    };
  }
  function mapAbsence(row){return {id:text(row.id), start:validDate(row.start_date), end:validDate(row.end_date || row.start_date), shift:text(row.shift_name || row.shift), reason:text(row.reason), status:text(row.status), metadata:isPlainObject(row.metadata)?row.metadata:{}};}
  function mapDocument(row){return {id:text(row.id), name:text(row.name), type:text(row.type) || documentTypeFromName(row.name), uploadedAt:validIso(row.uploaded_at) || validIso(row.created_at), status:text(row.status), size:text(row.size_label || row.size), storagePath:text(row.storage_path), metadata:isPlainObject(row.metadata)?row.metadata:{}};}
  function mapPosition(row){return {id:text(row.id), name:cleanPositionName(row.name), active:boolValue(row.active), department:text(row.department), defaultZone:text(row.default_zone), hourlyCost:numberValue(row.hourly_cost), metadata:isPlainObject(row.metadata)?row.metadata:{}};}
  function mapZone(row){
    const metadata = isPlainObject(row.metadata) ? row.metadata : {};
    const defaultTimes = isPlainObject(metadata.defaultTimes) ? metadata.defaultTimes : {};
    return {
      id:text(row.id),
      name:text(row.name),
      capacity:numberValue(row.capacity),
      active:boolValue(row.active),
      services:isPlainObject(row.services)?row.services:{},
      defaultPositions:Array.isArray(row.default_positions)?row.default_positions.map(cleanPositionName).filter(Boolean):[],
      defaultTimes:{Lunch:validRange(defaultTimes.Lunch), Evening:validRange(defaultTimes.Evening)},
      metadata,
      notes:text(row.notes)
    };
  }

  function buildOpeningHours(rows){
    const byDay = {};
    (rows || []).forEach(row=>{
      const day = normalizeDay(row.day_name);
      if(!day)return;
      byDay[day] = {
        open:boolValue(row.is_open),
        Lunch:validRange(row.lunch_range),
        Evening:validRange(row.evening_range)
      };
    });
    return byDay;
  }

  function hydrateWeeks(rows, state){
    const history = {};
    (rows.weeklyStatus || []).forEach(row=>{ensureWeek(history, row.week_start).status = row.status === 'Published' ? 'Published' : 'Draft';});
    (rows.availabilitySlots || []).forEach(row=>{
      const week = ensureWeek(history, row.week_start);
      const day = normalizeDay(row.day_name); const shift = normalizeShift(row.shift_name);
      const value = row.availability_state === 'partial' ? 'partial' : (row.availability_state === 'available' ? true : undefined);
      if(day && shift)setSparseSlot(week.availability, row.employee_id, day, shift, value);
    });
    (rows.plannedShifts || []).forEach(row=>{
      const week = ensureWeek(history, row.week_start);
      const day = normalizeDay(row.day_name); const shift = normalizeShift(row.shift_name);
      if(!day || !shift)return;
      if(row.planned !== false)setSparseSlot(week.planning, row.employee_id, day, shift, true);
      if(row.zone_name)setSparseSlot(week.assignments, row.employee_id, day, shift, text(row.zone_name));
      if(validRange(row.time_range))setSparseSlot(week.assignmentTimes, row.employee_id, day, shift, validRange(row.time_range));
    });
    (rows.employeeWeekSubmissions || []).forEach(row=>{
      if(row.submitted === false)return;
      const week = ensureWeek(history, row.week_start);
      week.submitted[row.employee_id] = true;
    });
    (rows.weeklyNotes || []).forEach(row=>{
      const week = ensureWeek(history, row.week_start);
      const day = normalizeDay(row.day_name); const shift = normalizeShift(row.shift_name);
      if(!day || !shift || !row.note)return;
      week.notes[day] = isPlainObject(week.notes[day]) ? week.notes[day] : {};
      week.notes[day][shift] = text(row.note);
    });
    (rows.actualShiftEntries || []).forEach(row=>{
      const week = ensureWeek(history, row.week_start);
      const day = normalizeDay(row.day_name); const shift = normalizeShift(row.shift_name);
      if(!day || !shift)return;
      const entry = {
        clockIn:validClock(row.clock_in),
        clockOut:validClock(row.clock_out),
        clockInAt:validIso(row.clock_in_at),
        clockOutAt:validIso(row.clock_out_at),
        createdAt:validIso(row.created_at),
        updatedAt:validIso(row.updated_at),
        clockInPhoto:text(row.clock_in_photo),
        clockOutPhoto:text(row.clock_out_photo),
        clockInPhotoStatus:text(row.clock_in_photo_status),
        clockOutPhotoStatus:text(row.clock_out_photo_status),
        clockInPhotoCapturedAt:validIso(row.clock_in_photo_captured_at),
        clockOutPhotoCapturedAt:validIso(row.clock_out_photo_captured_at),
        source:text(row.source)
      };
      Object.keys(entry).forEach(key=>{if(entry[key] === '')delete entry[key];});
      setSparseSlot(week.actualEntries, row.employee_id, day, shift, entry);
    });

    state.history = history;
    const activeWeek = validDate(state.weekStart) ? monday(state.weekStart) : monday();
    const activePayload = history[activeWeek] || emptyWeekly();
    Object.assign(state, cloneData(activePayload));
    state.weekStart = activeWeek;
    state.status = activePayload.status || 'Draft';
  }

  async function readRemotePlanner(){
    lastReadStatus = 'loading';
    const restaurantRows = await selectRows(TABLES.restaurants, `id=eq.${encodeURIComponent(currentRecordId)}&select=*`);
    if(restaurantRows === null){lastReadStatus='error'; return null;}
    const restaurant = restaurantRows[0];
    if(!restaurant){lastReadStatus='empty'; return null;}

    const scoped = table => `${table}=eq.${encodeURIComponent(currentRecordId)}`;
    const [employees, absences, employeeDocuments, restaurantDocuments, positions, zones, openingHours, weeklyStatus, availabilitySlots, plannedShifts, employeeWeekSubmissions, weeklyNotes, actualShiftEntries] = await Promise.all([
      selectRows(TABLES.employees, `${scoped('restaurant_id')}&select=*&order=sort_order.asc`),
      selectRows(TABLES.employeeAbsences, `${scoped('restaurant_id')}&select=*&order=start_date.desc`),
      selectRows(TABLES.employeeDocuments, `${scoped('restaurant_id')}&select=*&order=uploaded_at.desc`),
      selectRows(TABLES.restaurantDocuments, `${scoped('restaurant_id')}&select=*&order=uploaded_at.desc`),
      selectRows(TABLES.positions, `${scoped('restaurant_id')}&select=*&order=sort_order.asc`),
      selectRows(TABLES.zones, `${scoped('restaurant_id')}&select=*&order=sort_order.asc`),
      selectRows(TABLES.openingHours, `${scoped('restaurant_id')}&select=*&order=sort_order.asc`),
      selectRows(TABLES.weeklyStatus, `${scoped('restaurant_id')}&select=*`),
      selectRows(TABLES.availabilitySlots, `${scoped('restaurant_id')}&select=*`),
      selectRows(TABLES.plannedShifts, `${scoped('restaurant_id')}&select=*`),
      selectRows(TABLES.employeeWeekSubmissions, `${scoped('restaurant_id')}&select=*`),
      selectRows(TABLES.weeklyNotes, `${scoped('restaurant_id')}&select=*`),
      selectRows(TABLES.actualShiftEntries, `${scoped('restaurant_id')}&select=*`)
    ]);
    const allRows = {employees, absences, employeeDocuments, restaurantDocuments, positions, zones, openingHours, weeklyStatus, availabilitySlots, plannedShifts, employeeWeekSubmissions, weeklyNotes, actualShiftEntries};
    if(Object.values(allRows).some(value=>value === null)){lastReadStatus='error'; return null;}

    const absencesByEmployee = {};
    absences.forEach(row=>{(absencesByEmployee[row.employee_id] = absencesByEmployee[row.employee_id] || []).push(mapAbsence(row));});
    const docsByEmployee = {};
    employeeDocuments.forEach(row=>{(docsByEmployee[row.employee_id] = docsByEmployee[row.employee_id] || []).push(mapDocument(row));});

    const mappedPositions = positions.map(mapPosition).filter(p=>p.name);
    const positionNames = mappedPositions.filter(p=>p.active !== false).map(p=>p.name);
    const mappedZones = zones.map(mapZone).filter(z=>z.name);
    const settings = isPlainObject(restaurant.settings) ? restaurant.settings : {};
    const uiPrefs = isPlainObject(restaurant.ui_preferences) ? restaurant.ui_preferences : {};

    const state = {
      version: Number(window.DATA_CONTRACT_VERSION || 24),
      schemaVersion: Number(window.DATA_CONTRACT_VERSION || 24),
      restaurant: {
        name:text(restaurant.name),
        ownerName:text(restaurant.owner_name),
        city:text(restaurant.city),
        logoUrl:text(restaurant.logo_url),
        accentColor:normalizeHexColor(restaurant.accent_color),
        theme:text(restaurant.theme)
      },
      weekStart:monday(),
      status:'Draft',
      employees:employees.map((row,index)=>Object.assign(mapEmployee(row, absencesByEmployee, docsByEmployee), {_sortOrder:index})),
      positions:positionNames,
      zoneRules:[],
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
        openingHours:buildOpeningHours(openingHours),
        payrollRules:isPlainObject(restaurant.payroll_rules) ? restaurant.payroll_rules : {},
        documents:restaurantDocuments.map(mapDocument)
      },
      positionColors:isPlainObject(uiPrefs.positionColors) ? uiPrefs.positionColors : {},
      zoneColors:isPlainObject(uiPrefs.zoneColors) ? uiPrefs.zoneColors : {},
      availability:{}, planning:{}, assignments:{}, assignmentTimes:{}, submitted:{}, notes:{}, history:{}, actualEntries:{},
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
  function restaurantRowFromState(source){
    const restaurant = isPlainObject(source.restaurant) ? source.restaurant : {};
    const setup = isPlainObject(source.restaurantSetup) ? source.restaurantSetup : {};
    const general = isPlainObject(setup.general) ? setup.general : {};
    return {
      id:currentRecordId,
      name:text(restaurant.name || general.legalName),
      owner_name:text(restaurant.ownerName),
      city:text(restaurant.city || general.city),
      logo_url:text(restaurant.logoUrl),
      accent_color:normalizeHexColor(restaurant.accentColor),
      theme:text(restaurant.theme),
      legal_name:text(general.legalName || restaurant.name),
      company_number:text(general.companyNumber),
      address:text(general.address),
      phone:text(general.phone),
      email:text(general.email),
      workspace_initialized:hasCoreSetup(source),
      active_week_start:validDate(source.weekStart) || monday(),
      settings:{
        schemaVersion:Number(window.DATA_CONTRACT_VERSION || source.schemaVersion || source.version || 24),
        notifications:Array.isArray(source.notifications) ? source.notifications : []
      },
      payroll_rules:isPlainObject(setup.payrollRules) ? setup.payrollRules : {},
      ui_preferences:{
        positionColors:isPlainObject(source.positionColors) ? source.positionColors : {},
        zoneColors:isPlainObject(source.zoneColors) ? source.zoneColors : {}
      }
    };
  }
  function rowsFromState(source){
    const setup = isPlainObject(source.restaurantSetup) ? source.restaurantSetup : {};
    const employees = Array.isArray(source.employees) ? source.employees : [];
    const positions = Array.isArray(setup.positions) ? setup.positions : (Array.isArray(source.positions) ? source.positions.map(name=>({name})) : []);
    const zones = Array.isArray(setup.zones) ? setup.zones : [];
    const opening = isPlainObject(setup.openingHours) ? setup.openingHours : {};
    const restaurantDocuments = Array.isArray(setup.documents) ? setup.documents : [];
    const result = {
      positions:[], zones:[], openingHours:[], employees:[], employeeAbsences:[], employeeDocuments:[], restaurantDocuments:[],
      weeklyStatus:[], availabilitySlots:[], plannedShifts:[], employeeWeekSubmissions:[], weeklyNotes:[], actualShiftEntries:[]
    };

    positions.forEach((position,index)=>{
      const p = isPlainObject(position) ? position : {name:position};
      const name = cleanPositionName(p.name || p.position);
      if(!name)return;
      result.positions.push({restaurant_id:currentRecordId, id:sanitizeId(p.id || name,'position'), name, department:text(p.department), active:boolValue(p.active), default_zone:text(p.defaultZone), hourly_cost:numberValue(p.hourlyCost), sort_order:index, metadata:isPlainObject(p.metadata)?p.metadata:{}});
    });

    zones.forEach((zone,index)=>{
      const z = isPlainObject(zone) ? zone : {name:zone};
      const name = text(z.name || z.zone);
      if(!name)return;
      const zoneMetadata = isPlainObject(z.metadata) ? Object.assign({}, z.metadata) : {};
      if(isPlainObject(z.defaultTimes)){
        const times = {Lunch:validRange(z.defaultTimes.Lunch), Evening:validRange(z.defaultTimes.Evening)};
        if(times.Lunch || times.Evening) zoneMetadata.defaultTimes = times;
      }
      result.zones.push({restaurant_id:currentRecordId, id:sanitizeId(z.id || name,'zone'), name, capacity:Math.max(0,Math.round(numberValue(z.capacity,0))), active:boolValue(z.active), services:isPlainObject(z.services)?z.services:{}, default_positions:Array.isArray(z.defaultPositions)?z.defaultPositions.map(cleanPositionName).filter(Boolean):[], notes:text(z.notes), sort_order:index, metadata:zoneMetadata});
    });

    DAYS.forEach((day,index)=>{
      const hours = isPlainObject(opening[day]) ? opening[day] : {};
      result.openingHours.push({restaurant_id:currentRecordId, day_name:day, is_open:boolValue(hours.open), lunch_range:validRange(hours.Lunch), evening_range:validRange(hours.Evening), sort_order:index});
    });

    restaurantDocuments.forEach((doc,index)=>{
      const d = isPlainObject(doc) ? doc : {name:doc};
      const name = text(d.name || d.fileName);
      if(!name)return;
      result.restaurantDocuments.push({restaurant_id:currentRecordId, id:sanitizeId(d.id || name,'document'), name, type:text(d.type, documentTypeFromName(name)), uploaded_at:validIso(d.uploadedAt || d.createdAt) || new Date().toISOString(), status:text(d.status), size_label:text(d.size), storage_path:text(d.storagePath), sort_order:index, metadata:isPlainObject(d.metadata)?d.metadata:{}});
    });

    employees.forEach((employee,index)=>{
      const e = isPlainObject(employee) ? employee : {};
      const employeeId = sanitizeId(e.id || e.name || `employee-${index+1}`,'employee');
      result.employees.push({
        restaurant_id:currentRecordId, id:employeeId, name:text(e.name), position:cleanPositionName(e.position), rate:numberValue(e.rate), active:boolValue(e.active), manager_access:!!e.managerAccess, pin_code:sanitizePin(e.pin), payroll_id:text(e.payrollId), external_id:text(e.externalId), employee_number:text(e.employeeNumber), email:text(e.email), phone:text(e.phone), address:text(e.address), nationality:text(e.nationality), language:text(e.language), contract_type:text(e.contractType), contract_start:validDate(e.contractStart)||null, contract_end:validDate(e.contractEnd)||null, document_folder:text(e.documentFolder), photo_url:text(e.photoUrl), date_of_birth:validDate(e.dateOfBirth)||null, tax_status:text(e.taxStatus), social_security_no:text(e.socialSecurityNo), iban:text(e.iban), emergency_name:text(e.emergencyName), emergency_relation:text(e.emergencyRelation), emergency_phone:text(e.emergencyPhone), notes:text(e.notes), contract_hours:numberValue(e.contractHours), hourly_cost:numberValue(e.hourlyCost), payroll_ready:!!e.payrollReady, sort_order:index, metadata:isPlainObject(e.metadata)?e.metadata:{}
      });
      (Array.isArray(e.absences)?e.absences:[]).forEach((absence,absenceIndex)=>{
        const a = isPlainObject(absence) ? absence : {};
        const start = validDate(a.start || a.date);
        if(!start)return;
        result.employeeAbsences.push({restaurant_id:currentRecordId, employee_id:employeeId, id:sanitizeId(a.id || `${employeeId}-${start}-${absenceIndex}`,'absence'), start_date:start, end_date:validDate(a.end || a.date || start) || start, shift_name:text(a.shift), reason:text(a.reason), status:text(a.status), metadata:isPlainObject(a.metadata)?a.metadata:{}});
      });
      (Array.isArray(e.documents)?e.documents:[]).forEach((doc,docIndex)=>{
        const d = isPlainObject(doc) ? doc : {name:doc};
        const name = text(d.name || d.fileName);
        if(!name)return;
        result.employeeDocuments.push({restaurant_id:currentRecordId, employee_id:employeeId, id:sanitizeId(d.id || `${employeeId}-${name}-${docIndex}`,'document'), name, type:text(d.type, documentTypeFromName(name)), uploaded_at:validIso(d.uploadedAt || d.createdAt) || new Date().toISOString(), status:text(d.status), size_label:text(d.size), storage_path:text(d.storagePath), sort_order:docIndex, metadata:isPlainObject(d.metadata)?d.metadata:{}});
      });
    });

    const history = Object.assign({}, isPlainObject(source.history) ? source.history : {});
    const activeWeek = validDate(source.weekStart) ? monday(source.weekStart) : monday();
    history[activeWeek] = currentWeeklyPayload(source);
    Object.entries(history).forEach(([weekKey,payloadRaw])=>{
      const week = validDate(weekKey) ? monday(weekKey) : '';
      if(!week)return;
      const payload = Object.assign(emptyWeekly(), isPlainObject(payloadRaw) ? payloadRaw : {});
      if(!hasWeeklyContent(payload))return;
      result.weeklyStatus.push({restaurant_id:currentRecordId, week_start:week, status:payload.status === 'Published' ? 'Published' : 'Draft'});
      Object.entries(isPlainObject(payload.availability)?payload.availability:{}).forEach(([employeeId, employeeMap])=>{
        Object.entries(isPlainObject(employeeMap)?employeeMap:{}).forEach(([day, dayMap])=>{
          const dayName = normalizeDay(day); if(!dayName)return;
          Object.entries(isPlainObject(dayMap)?dayMap:{}).forEach(([shift,value])=>{
            const shiftName = normalizeShift(shift); if(!shiftName)return;
            const state = value === 'partial' ? 'partial' : (value === true || value === 'available' ? 'available' : '');
            if(state)result.availabilitySlots.push({restaurant_id:currentRecordId, week_start:week, employee_id:employeeId, day_name:dayName, shift_name:shiftName, availability_state:state});
          });
        });
      });
      const plannedKeys = new Set();
      Object.entries(isPlainObject(payload.planning)?payload.planning:{}).forEach(([employeeId, employeeMap])=>{
        Object.entries(isPlainObject(employeeMap)?employeeMap:{}).forEach(([day, dayMap])=>{
          const dayName = normalizeDay(day); if(!dayName)return;
          Object.entries(isPlainObject(dayMap)?dayMap:{}).forEach(([shift,value])=>{
            const shiftName = normalizeShift(shift); if(!shiftName || !value)return;
            plannedKeys.add(`${employeeId}|${dayName}|${shiftName}`);
          });
        });
      });
      Object.entries(isPlainObject(payload.assignments)?payload.assignments:{}).forEach(([employeeId, employeeMap])=>{
        Object.entries(isPlainObject(employeeMap)?employeeMap:{}).forEach(([day, dayMap])=>{
          const dayName = normalizeDay(day); if(!dayName)return;
          Object.keys(isPlainObject(dayMap)?dayMap:{}).forEach(shift=>{const shiftName=normalizeShift(shift); if(shiftName)plannedKeys.add(`${employeeId}|${dayName}|${shiftName}`);});
        });
      });
      Object.entries(isPlainObject(payload.assignmentTimes)?payload.assignmentTimes:{}).forEach(([employeeId, employeeMap])=>{
        Object.entries(isPlainObject(employeeMap)?employeeMap:{}).forEach(([day, dayMap])=>{
          const dayName = normalizeDay(day); if(!dayName)return;
          Object.keys(isPlainObject(dayMap)?dayMap:{}).forEach(shift=>{const shiftName=normalizeShift(shift); if(shiftName)plannedKeys.add(`${employeeId}|${dayName}|${shiftName}`);});
        });
      });
      plannedKeys.forEach(key=>{
        const [employeeId,dayName,shiftName] = key.split('|');
        const planned = !!payload.planning?.[employeeId]?.[dayName]?.[shiftName];
        const zone = text(payload.assignments?.[employeeId]?.[dayName]?.[shiftName]);
        const range = validRange(payload.assignmentTimes?.[employeeId]?.[dayName]?.[shiftName]);
        result.plannedShifts.push({restaurant_id:currentRecordId, week_start:week, employee_id:employeeId, day_name:dayName, shift_name:shiftName, planned, zone_name:zone, time_range:range});
      });
      Object.entries(isPlainObject(payload.submitted)?payload.submitted:{}).forEach(([employeeId,value])=>{if(value)result.employeeWeekSubmissions.push({restaurant_id:currentRecordId, week_start:week, employee_id:employeeId, submitted:true});});
      Object.entries(isPlainObject(payload.notes)?payload.notes:{}).forEach(([day, dayMap])=>{
        const dayName = normalizeDay(day); if(!dayName)return;
        Object.entries(isPlainObject(dayMap)?dayMap:{}).forEach(([shift,note])=>{const shiftName=normalizeShift(shift); const clean=text(note); if(shiftName && clean)result.weeklyNotes.push({restaurant_id:currentRecordId, week_start:week, day_name:dayName, shift_name:shiftName, note:clean});});
      });
      Object.entries(isPlainObject(payload.actualEntries)?payload.actualEntries:{}).forEach(([employeeId, employeeMap])=>{
        Object.entries(isPlainObject(employeeMap)?employeeMap:{}).forEach(([day, dayMap])=>{
          const dayName = normalizeDay(day); if(!dayName)return;
          Object.entries(isPlainObject(dayMap)?dayMap:{}).forEach(([shift,entryRaw])=>{
            const shiftName = normalizeShift(shift); const entry = isPlainObject(entryRaw) ? entryRaw : {}; if(!shiftName)return;
            const row = {restaurant_id:currentRecordId, week_start:week, employee_id:employeeId, day_name:dayName, shift_name:shiftName, clock_in:validClock(entry.clockIn), clock_out:validClock(entry.clockOut), clock_in_at:validIso(entry.clockInAt)||null, clock_out_at:validIso(entry.clockOutAt)||null, clock_in_photo:text(entry.clockInPhoto), clock_out_photo:text(entry.clockOutPhoto), clock_in_photo_status:text(entry.clockInPhotoStatus), clock_out_photo_status:text(entry.clockOutPhotoStatus), clock_in_photo_captured_at:validIso(entry.clockInPhotoCapturedAt)||null, clock_out_photo_captured_at:validIso(entry.clockOutPhotoCapturedAt)||null, source:text(entry.source)};
            if(row.clock_in || row.clock_out || row.clock_in_at || row.clock_out_at || row.clock_in_photo || row.clock_out_photo || row.clock_in_photo_status || row.clock_out_photo_status)result.actualShiftEntries.push(row);
          });
        });
      });
    });
    return result;
  }

  function saveReasonScope(reason){
    const clean = String(reason || '').toLowerCase();
    if(clean.startsWith('team-'))return 'team';
    if(clean.startsWith('restaurant-'))return 'restaurant';
    if(clean.startsWith('badge-') || clean.startsWith('actuals-'))return 'actuals';
    if(clean.startsWith('employee-schedule'))return 'availability';
    if(clean.startsWith('planning-') || clean === 'week-navigation')return 'planning';
    return 'unknown';
  }
  function rowsForWeek(rows, key, weekStart){
    const week = validDate(weekStart) ? monday(weekStart) : monday();
    return (rows[key] || []).filter(row=>validDate(row.week_start) === week);
  }
  async function saveWeeklyScoped(rows, weekStart, options={}){
    const week = validDate(weekStart) ? monday(weekStart) : monday();
    const include = Object.assign({availability:true, planning:true, submissions:true, notes:true, actuals:true}, options || {});
    const childTables = [];
    if(include.availability)childTables.push(TABLES.availabilitySlots);
    if(include.planning)childTables.push(TABLES.plannedShifts);
    if(include.submissions)childTables.push(TABLES.employeeWeekSubmissions);
    if(include.notes)childTables.push(TABLES.weeklyNotes);
    if(include.actuals)childTables.push(TABLES.actualShiftEntries);
    for(const table of childTables){if(!await deleteWeekRows(table, week))return false;}
    if(!await upsertRows(TABLES.weeklyStatus, rowsForWeek(rows,'weeklyStatus',week), ['restaurant_id','week_start']))return false;
    if(include.availability && !await upsertRows(TABLES.availabilitySlots, rowsForWeek(rows,'availabilitySlots',week), ['restaurant_id','week_start','employee_id','day_name','shift_name']))return false;
    if(include.planning && !await upsertRows(TABLES.plannedShifts, rowsForWeek(rows,'plannedShifts',week), ['restaurant_id','week_start','employee_id','day_name','shift_name']))return false;
    if(include.submissions && !await upsertRows(TABLES.employeeWeekSubmissions, rowsForWeek(rows,'employeeWeekSubmissions',week), ['restaurant_id','week_start','employee_id']))return false;
    if(include.notes && !await upsertRows(TABLES.weeklyNotes, rowsForWeek(rows,'weeklyNotes',week), ['restaurant_id','week_start','day_name','shift_name']))return false;
    if(include.actuals && !await upsertRows(TABLES.actualShiftEntries, rowsForWeek(rows,'actualShiftEntries',week), ['restaurant_id','week_start','employee_id','day_name','shift_name']))return false;
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
      const employeeChildQuery = `restaurant_id=eq.${encodeURIComponent(currentRecordId)}`;
      if(!await replaceRows(TABLES.employeeAbsences, rows.employeeAbsences, employeeChildQuery, ['restaurant_id','employee_id','id']))return false;
      if(!await replaceRows(TABLES.employeeDocuments, rows.employeeDocuments, employeeChildQuery, ['restaurant_id','employee_id','id']))return false;
      return true;
    }

    if(scope === 'restaurant'){
      if(!rows.zones.length){setError('Restaurant save blocked: runtime state has zero zones. Refresh before saving.'); return false;}
      if(!rows.positions.length){setError('Restaurant save blocked: runtime state has zero positions. Refresh before saving.'); return false;}
      if(!await upsertRows(TABLES.positions, rows.positions, ['restaurant_id','id']))return false;
      if(!await upsertRows(TABLES.zones, rows.zones, ['restaurant_id','id']))return false;
      if(!await upsertRows(TABLES.openingHours, rows.openingHours, ['restaurant_id','day_name']))return false;
      if(!await replaceRows(TABLES.restaurantDocuments, rows.restaurantDocuments, `restaurant_id=eq.${encodeURIComponent(currentRecordId)}`, ['restaurant_id','id']))return false;
      return true;
    }

    if(scope === 'availability'){
      return saveWeeklyScoped(rows, source.weekStart, {availability:true, submissions:true, planning:false, notes:false, actuals:false});
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
    const rows = await selectRows(TABLES.restaurants, 'select=id,name,owner_name,city,accent_color,updated_at&order=updated_at.desc');
    if(!rows)return [];
    return rows.map(row=>({id:row.id, updated_at:row.updated_at, restaurant:{name:row.name, ownerName:row.owner_name, city:row.city, accentColor:row.accent_color}, counts:{}})).filter(w=>w.id);
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
