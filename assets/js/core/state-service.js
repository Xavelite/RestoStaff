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
  Restogogo.state.loadedDataCounts = coreSetupCounts(data);
  Restogogo.state.validation = validatePlannerState(data);
  const storedSession=window.DataAdapter.readSession(session)||session;
  session={role:Restogogo.registry.normalizeRole(storedSession.role), employeeId:storedSession.employeeId||null};
  if(Restogogo.registry.isEmployee(session.role)){
    data = window.DataAdapter.stripEmployeePrivateFields?.(data) || data;
  }
  if(Restogogo.registry.isEmployee(session.role) && (!session.employeeId || !activeEmployees().some(employee=>String(employee.id) === String(session.employeeId)))){
    Restogogo.warn?.('[restogogo:employee-session-missing]', {employeeId: session.employeeId || null});
    session.employeeId = null;
  }
  Restogogo.log?.('[restogogo:supabase-load]', {
    workspace: workspaceId(),
    readStatus,
    employees: Array.isArray(data?.employees) ? data.employees.length : 0,
    zones: Array.isArray(data?.restaurantSetup?.zones) ? data.restaurantSetup.zones.length : 0,
    jobFunctions: Array.isArray(data?.restaurantSetup?.jobFunctions) ? data.restaurantSetup.jobFunctions.length : 0,
    readOnly: storageReadOnly
  });
}


function normalizeSaveOptions(options='save'){
  if(window.RestogogoSaveContract?.normalize)return window.RestogogoSaveContract.normalize(options);
  return typeof options === 'string' ? {reason:options} : Object.assign({reason:'save'}, options || {});
}


function applySaveResultSnapshot(result){
  const normalized = window.RestogogoRepositoryResult?.fromSaveOutcome?.(result) || {ok:result !== false, snapshot:null, details:null, message:''};
  if(normalized.ok !== true)return normalized;
  if(normalized.snapshot){
    const details = normalized.details || {};
    window.DataAdapter.applyRuntimeSnapshot(normalized.snapshot);
    if(details.activeWeekStart && data){
      const week = monday(details.activeWeekStart);
      if(week)data.weekStart = week;
    }
    ensure(data);
    // restoreActiveWeek applies the history snapshot for the active week through
    // applyWeeklyPayloadToState → ensureWeeklyShape, which normalises weekly fields.
    // A second full ensure() is not needed because restoreActiveWeek does not touch
    // employees, restaurant or history; those were already normalised by the call above.
    if(details.restoreActiveWeek === true)restoreActiveWeek();
  }else{
    ensure(data);
  }
  return normalized;
}

async function persistCurrentState(options='save'){
  const saveOptions = normalizeSaveOptions(options);
  const reason = String(saveOptions.reason || 'save');
  ensure(data);
  archiveActiveWeek();
  const validation = validateStateBeforeSave();
  window.DataAdapter.saveSession(session);
  if(!validation.ok)return false;
  if(!dataLoadedFromSupabase){
    const message='Save blocked: Supabase data was not loaded successfully. Refresh and confirm the workspace before saving.';
    updateSaveController({status:'readonly', lastError:message, lastReason:reason});
    notifySaveIssue(message, 'warning');
    return false;
  }
  const baseline = Restogogo.state.loadedDataCounts || {employees:0,zones:0,jobFunctions:0};
  const currentCounts = coreSetupCounts(data);
  const destructiveMasterLoss = (baseline.employees > 0 && currentCounts.employees === 0)
    || (baseline.zones > 0 && currentCounts.zones === 0)
    || (baseline.jobFunctions > 0 && currentCounts.jobFunctions === 0);
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
  const saveOutcome=await Promise.resolve(window.DataAdapter.savePlanner(data, saveOptions));
  const saveResult=applySaveResultSnapshot(saveOutcome);
  if(saveResult.ok === true){
    Restogogo.state.loadedDataCounts = coreSetupCounts(data);
    dataLoadedFromSupabase = true;
    lastDataReadStatus = 'ok';
    updateSaveController({status:'saved', lastError:'', lastSavedAt:new Date().toISOString(), lastReason:reason});
    clearSaveIssueNotice();
    return true;
  }
  const err=(saveResult.message || '') || (window.DataAdapter.getLastError&&window.DataAdapter.getLastError());
  const message=err||'Save failed';
  try{ console.error('[restogogo:save-failed]', {reason, message}); }catch{}
  updateSaveController({status:'error', lastError:message, lastReason:reason});
  notifySaveIssue(message, 'danger');
  return false;
}

async function save(options={}){
  const initialSaveOptions = normalizeSaveOptions(options);
  const reason=String(initialSaveOptions.reason || 'save');
  if(saveController.inFlight){
    updateSaveController({pending:true, pendingReason:reason, pendingOptions:initialSaveOptions, status:'queued', lastReason:reason});
    return activeSavePromise || Promise.resolve(false);
  }

  activeSavePromise = (async()=>{
    let ok=false;
    let currentSaveOptions=initialSaveOptions;
    let currentReason=reason;
    updateSaveController({inFlight:true, pending:false, pendingReason:'', pendingOptions:null, status:'saving', lastReason:currentReason});
    try{
      do{
        currentReason=String(currentSaveOptions.reason || 'save');
        updateSaveController({pending:false, pendingReason:'', pendingOptions:null, status:'saving', lastReason:currentReason});
        ok=await persistCurrentState(currentSaveOptions);
        currentSaveOptions=saveController.pendingOptions || {reason:saveController.pendingReason || currentReason};
      }while(saveController.pending);
    }catch(error){
      const message=error?.message||String(error);
      try{ console.error('[restogogo:save-exception]', {reason:currentReason, error}); }catch{}
      updateSaveController({status:'error', lastError:message, lastReason:currentReason});
      notifySaveIssue(message, 'danger');
      ok=false;
    }finally{
      updateSaveController({inFlight:false, pending:false, pendingReason:'', pendingOptions:null});
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
  const saveAction = normalizeSaveOptions(opts.saveAction || {domain:opts.domain, action:opts.action, reason:opts.reason});
  const reason = String(saveAction.reason || 'save');
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
    const saveOptions = normalizeSaveOptions(Object.assign({}, opts.saveOptions || {}, saveAction));
    if(Array.isArray(opts.weekStarts))saveOptions.weekStarts = opts.weekStarts.slice();
    const ok = await save(saveOptions);
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
    const persistenceError = String(saveController.lastError || '').trim();
    // CONFLICT detection — Phase 4C optimistic locking.
    // Currently only save_manager_planning (planning week saves) raises CONFLICT errors.
    // If you add optimistic locking to other RPCs (actuals, team, restaurant setup),
    // update the toast message below to name the resource that conflicted.
    const isConflict = persistenceError.startsWith('CONFLICT:');
    const message = isConflict
      ? 'Planning was changed by another session — reload to get the latest version.'
      : (/^Database save command ".+" is missing from Supabase\./.test(persistenceError)
          ? 'Database save commands are missing. Run the current SQL baseline, then verify it.'
          : errorMessage);
    const toastTone    = isConflict ? 'warning' : 'danger';
    const toastIcon    = isConflict ? 'info'    : 'alert';  // 'info' = concurrent-save notice, not an error
    const toastTimeout = isConflict ? 5000      : 3600;
    if(message)Restogogo.ui?.toast?.(message,{tone:toastTone,icon:toastIcon,centered:true,timeout:toastTimeout});
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

/* Public API — consume these via Restogogo.stateService.*.
 * Save-result snapshot application stays in this file so repositories never
 * reach upward into state orchestration after an RPC succeeds. */
Restogogo.stateService = {
  /* Trigger a mutation + save round-trip with rollback on failure. */
  commitStateMutation,
  /* Reload all workspace data from Supabase (used e.g. after a realtime reload). */
  load
};
