/* restogogo state service: thin orchestration, persistence and public API. */
function ensure(target=data){ return window.RestogogoStateNormalizer.ensure(target); }

async function load(){
  storageReadOnly=false;
  dataLoadedFromSupabase=false;
  lastDataReadStatus='loading';
  updateSaveController({status:'idle', lastError:''});
  const loaded=await Promise.resolve(window.DataAdapter.readPlanner());
  const err=window.DataAdapter.getLastError&&window.DataAdapter.getLastError();
  const readStatus=window.DataAdapter.getLastReadStatus?window.DataAdapter.getLastReadStatus():(err?'error':'ok');
  lastDataReadStatus=readStatus;
  if(loaded){
    data=loaded;
    dataLoadedFromSupabase=readStatus==='ok';
  }else{
    data=emptySupabaseRuntimeState(workspaceId());
    storageReadOnly=true;
    dataLoadedFromSupabase=false;
    const message=readStatus==='empty'
      ? `Workspace "${workspaceId()}" does not exist in Supabase. Run the schema + seed SQL or create the restaurant row first.`
      : (err || 'Could not load workspace data from Supabase.');
    updateSaveController({status:'readonly', lastError:message});
    notifySaveIssue(message, readStatus==='empty'?'warning':'danger');
  }
  ensure(data);
  Restogogo.state.supabaseBaselineCounts = coreSetupCounts(data);
  Restogogo.state.validation = validatePlannerState(data);
  const storedSession=window.DataAdapter.readSession(session)||session;
  session={role:storedSession.role==='owner'?'owner':'employee', employeeId:storedSession.employeeId||null};
  if(!session.employeeId||!emp(session.employeeId))session.employeeId=activeEmployees()[0]?.id||null;
  applyProductBrand();
  Restogogo.log?.('[restogogo:supabase-load]', {
    workspace: workspaceId(),
    readStatus,
    employees: Array.isArray(data?.employees) ? data.employees.length : 0,
    zones: Array.isArray(data?.restaurantSetup?.zones) ? data.restaurantSetup.zones.length : 0,
    positions: Array.isArray(data?.restaurantSetup?.positions) ? data.restaurantSetup.positions.length : 0,
    readOnly: storageReadOnly
  });
}


async function persistCurrentState(reason='save'){
  ensure(data);
  saveWeekSnapshot();
  const validation = validateStateBeforeSave();
  window.DataAdapter.saveSession(session);
  if(!validation.ok)return false;
  if(!dataLoadedFromSupabase){
    const message='Save blocked: Supabase data was not loaded successfully. Refresh and confirm the workspace before saving.';
    updateSaveController({status:'readonly', lastError:message, lastReason:reason});
    notifySaveIssue(message, 'warning');
    return false;
  }
  const baseline = Restogogo.state.supabaseBaselineCounts || {employees:0,zones:0,positions:0};
  const currentCounts = coreSetupCounts(data);
  const destructiveMasterLoss = (baseline.employees > 0 && currentCounts.employees === 0)
    || (baseline.zones > 0 && currentCounts.zones === 0)
    || (baseline.positions > 0 && currentCounts.positions === 0);
  if(destructiveMasterLoss){
    const message='Save blocked: loaded master data would be erased. Refresh before continuing.';
    updateSaveController({status:'error', lastError:message, lastReason:reason});
    notifySaveIssue(message, 'danger');
    Restogogo.warn?.('[restogogo:supabase-save-blocked]', {reason, baseline, current:currentCounts});
    return false;
  }
  if(storageReadOnly){
    updateSaveController({status:'readonly', lastReason:reason});
    notifySaveIssue('Workspace is read-only until Supabase data is initialized.', 'warning');
    return false;
  }
  const ok=await Promise.resolve(window.DataAdapter.savePlanner(data, {reason}));
  if(ok!==false){
    Restogogo.state.supabaseBaselineCounts = coreSetupCounts(data);
    dataLoadedFromSupabase = true;
    lastDataReadStatus = 'ok';
    updateSaveController({status:'saved', lastError:'', lastSavedAt:new Date().toISOString(), lastReason:reason});
    clearSaveIssueNotice();
    return true;
  }
  const err=window.DataAdapter.getLastError&&window.DataAdapter.getLastError();
  const message=err||'Save failed';
  try{ console.error('[restogogo:save-failed]', {reason, message}); }catch{}
  updateSaveController({status:'error', lastError:message, lastReason:reason});
  notifySaveIssue(message, 'danger');
  return false;
}

async function save(options={}){
  const reason=typeof options==='string'?options:(options.reason||'save');
  if(saveController.inFlight){
    updateSaveController({pending:true, pendingReason:reason, status:'queued', lastReason:reason});
    return activeSavePromise || Promise.resolve(false);
  }

  activeSavePromise = (async()=>{
    let ok=false;
    let currentReason=reason;
    updateSaveController({inFlight:true, pending:false, pendingReason:'', status:'saving', lastReason:currentReason});
    try{
      do{
        updateSaveController({pending:false, pendingReason:'', status:'saving', lastReason:currentReason});
        ok=await persistCurrentState(currentReason);
        currentReason=saveController.pendingReason || currentReason;
      }while(saveController.pending);
    }catch(error){
      const message=error?.message||String(error);
      try{ console.error('[restogogo:save-exception]', {reason:currentReason, error}); }catch{}
      updateSaveController({status:'error', lastError:message, lastReason:currentReason});
      notifySaveIssue(message, 'danger');
      ok=false;
    }finally{
      updateSaveController({inFlight:false, pending:false, pendingReason:''});
      activeSavePromise=null;
    }
    return ok;
  })();

  return activeSavePromise;
}


function cloneRuntimeState(source=data){
  const cloneFn = window.RestogogoSupabaseUtils?.cloneData || clone;
  return cloneFn(source || {});
}

function restoreRuntimeState(snapshot){
  if(!snapshot)return;
  data = cloneRuntimeState(snapshot);
  ensure(data);
  Restogogo.state.validation = validatePlannerState(data);
}

async function commitStateMutation(options={}){
  const opts = typeof options === 'function' ? {mutate:options} : (options || {});
  const reason = String(opts.reason || 'save');
  const mutate = typeof opts.mutate === 'function' ? opts.mutate : null;
  const renderFn = typeof opts.render === 'function' ? opts.render : null;
  const renderBeforeSave = opts.renderBeforeSave !== false;
  const renderOnSuccess = opts.renderOnSuccess === true;
  const rollback = opts.rollback !== false;
  const successMessage = String(opts.successMessage || '').trim();
  const errorMessage = String(opts.errorMessage || 'Change was not saved. The last local change was rolled back.').trim();
  if(saveController.inFlight && activeSavePromise){
    const previousOk = await activeSavePromise;
    if(previousOk === false && opts.blockOnPendingFailure !== false)return false;
  }
  const stateSnapshot = cloneRuntimeState(data);
  const localSnapshot = typeof opts.snapshotLocal === 'function' ? opts.snapshotLocal() : undefined;
  try{
    if(mutate) await mutate(data);
    ensure(data);
    if(renderFn && renderBeforeSave)renderFn();
    const ok = await save({reason});
    if(ok){
      if(typeof opts.onSuccess === 'function')opts.onSuccess(data);
      if(renderFn && renderOnSuccess)renderFn();
      if(successMessage)Restogogo.ui?.toast?.(successMessage,{tone:opts.successTone || 'success',icon:opts.successIcon || 'check',centered:opts.centered !== false,timeout:opts.successTimeout || 2200});
      return true;
    }
    if(rollback){
      restoreRuntimeState(stateSnapshot);
      if(typeof opts.restoreLocal === 'function')opts.restoreLocal(localSnapshot);
      if(renderFn)renderFn();
    }
    if(errorMessage)Restogogo.ui?.toast?.(errorMessage,{tone:'danger',icon:'alert',centered:true,timeout:3600});
    if(typeof opts.onError === 'function')opts.onError(saveController.lastError || 'Save failed');
    return false;
  }catch(error){
    try{ console.error('[restogogo:mutation-exception]', {reason, error}); }catch{}
    if(rollback){
      restoreRuntimeState(stateSnapshot);
      if(typeof opts.restoreLocal === 'function')opts.restoreLocal(localSnapshot);
      if(renderFn)renderFn();
    }
    const message = error?.message || String(error || 'Change failed.');
    updateSaveController({status:'error', lastError:message, lastReason:reason});
    notifySaveIssue(message,'danger');
    Restogogo.ui?.toast?.(errorMessage || message,{tone:'danger',icon:'alert',centered:true,timeout:3600});
    if(typeof opts.onError === 'function')opts.onError(message);
    return false;
  }
}

Restogogo.stateService = {
  ensure,
  load,
  save,
  commitStateMutation,
  saveController,
  validateStateBeforeSave,
  setupRequirements,
  isSetupReady,
  emp,
  activeEmployees,
  sortEmployees,
  activeRestaurantZones,
  restaurantPositions,
  openingRangeForDayShift,
  saveWeekSnapshot,
  loadWeekSnapshot,
  setWeekStartAndLoad,
  weeklyPayloadFromState,
  applyWeeklyPayloadToState,
  compactWeeklyPayload,
  getActualEntry,
  ensureActualEntry,
  setAvailabilitySlot,
  setPlanningSlot,
  setAssignmentSlot,
  setAssignmentPositionSlot,
  setAssignmentTimeSlot,
  setSubmitted,
  isPlanned,
  employeePlannedWeekTotal,
  employeeAbsentForSlot,
  availabilityOverlayState,
  timeRangeFor,
  plannedSlotHours,
  slotHours,
  hoursFromRange
};
Object.assign(Restogogo.employees, {
  get: emp,
  active: activeEmployees,
  sort: sortEmployees,
  plannedWeekTotal: employeePlannedWeekTotal
});
Restogogo.actuals = Object.assign(Restogogo.actuals || {}, {
  getEntry: getActualEntry,
  ensureEntry: ensureActualEntry
});
