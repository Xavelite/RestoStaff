/* restogogo DB v2 data adapter facade.
 * Owns DataAdapter's public API and delegates specialized work to:
 * - RestogogoSnapshotMapper: DB snapshot -> UI runtime state
 * - RestogogoDataRepositories: UI runtime state -> RPC payloads/saves
 */
(function(){
  const config = window.APP_CONFIG || {};
  const store = window.RestogogoSessionStore;
  const auth = () => window.RestogogoAuthService;
  const mapper = window.RestogogoSnapshotMapper;
  const Result = window.RestogogoRepositoryResult;
  const KEYS = Object.freeze({
    session:'restogogo.ui.session.v2',
    notificationsRead:'restogogo.notifications.read.v2',
    workspaceId:'restogogo.workspace.id.v2'
  });

  const defaultWorkspaceId = config.defaultWorkspaceSlug || config.defaultWorkspaceId || 'demo-restaurant';
  let currentRecordId = store?.getString?.(KEYS.workspaceId, defaultWorkspaceId) || defaultWorkspaceId;
  let lastError = '';
  let lastReadStatus = 'idle';

  function setError(message){
    lastError = String(message || '').trim();
    if(lastError)window.Restogogo?.warn?.(lastError);
  }
  function activeContext(){return window.Restogogo?.workspace?.current?.() || null;}
  function quickSnapshot(){return auth()?.getQuickSession?.()?.runtime_snapshot || null;}
  function mapSnapshot(snapshot){return mapper?.stateFromSnapshot?.(snapshot);}

  /* Compute a ±8-week date window around today's ISO Monday.
   * Returned as { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } for the snapshot RPC. */
  function snapshotDateRange(){
    const WINDOW_DAYS = 56; // 8 weeks
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Monday
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    function isoDate(d){return d.toISOString().slice(0,10);}
    const from = new Date(monday); from.setDate(monday.getDate() - WINDOW_DAYS);
    const to   = new Date(monday); to.setDate(monday.getDate() + WINDOW_DAYS);
    return {from:isoDate(from), to:isoDate(to)};
  }

  function applyRuntimeSnapshot(snapshot){
    if(!snapshot)return null;
    const nextState = mapSnapshot(snapshot);
    if(window.Restogogo?.state)window.Restogogo.state.data = nextState;
    // Central snapshot application point for all repository save results.
    // Keeps quick-session reloads aligned without repositories mutating state directly.
    auth()?.updateQuickSessionSnapshot?.(snapshot);
    setError('');
    lastReadStatus = 'ok';
    return nextState;
  }

  async function readRemotePlanner(){
    lastReadStatus = 'loading';
    try{
      let snapshot = null;
      const context = activeContext();
      if(context?.authMode === 'quick_login')snapshot = quickSnapshot();
      if(!snapshot && auth()?.isAuthenticated?.()){
        snapshot = await auth()?.getWorkspaceRuntimeSnapshot?.(currentRecordId, snapshotDateRange());
      }
      if(!snapshot){lastReadStatus = 'empty'; return null;}
      const state = mapSnapshot(snapshot);
      lastReadStatus = 'ok';
      setError('');
      return state;
    }catch(error){
      lastReadStatus = 'error';
      setError(error?.message || String(error || 'Could not load DB v2 workspace.'));
      return null;
    }
  }

  const repositories = window.RestogogoDataRepositories?.create?.({
    auth,
    setError,
    getWorkspaceId:() => currentRecordId,
    stateFromSnapshot:mapSnapshot
  });

  async function saveRemotePlanner(source, options={}){
    if(!repositories?.saveRemotePlanner){setError('Save blocked: DB repositories are not loaded.'); return Result?.fail?.('Save blocked: DB repositories are not loaded.', {code:'repositories_missing'}) || false;}
    const result = await repositories.saveRemotePlanner(source, options);
    const normalized = Result?.fromSaveOutcome ? Result.fromSaveOutcome(result) : {ok:result!==false,message:''};
    if(normalized.ok !== true && normalized.message)setError(normalized.message);
    return normalized;
  }

  const adapter = {
    mode:'supabase', supabaseOnly:true, KEYS,
    readPlanner:readRemotePlanner,
    savePlanner:saveRemotePlanner,
    applyRuntimeSnapshot,
    getLastError(){return lastError;},
    getLastReadStatus(){return lastReadStatus;},
    wasLastReadError(){return lastReadStatus === 'error';},
    getWorkspaceId(){return currentRecordId;},
    getDefaultWorkspaceId(){return defaultWorkspaceId;},
    setWorkspaceId(value){currentRecordId = String(value || defaultWorkspaceId).trim() || defaultWorkspaceId; store?.setString?.(KEYS.workspaceId,currentRecordId); lastReadStatus='idle'; return currentRecordId;},
    readSession(defaultValue){return store?.getJSON?.(KEYS.session, defaultValue) || defaultValue;},
    saveSession(value){return store?.setJSON?.(KEYS.session, value);},
    isLoggedIn(){return auth()?.isAuthenticated?.() || auth()?.isQuickAuthenticated?.();},
    readNotificationsRead(){return store?.getJSON?.(KEYS.notificationsRead, {}) || {};},
    saveNotificationsRead(value){return store?.setJSON?.(KEYS.notificationsRead, value || {});},
    readPreference(key, defaultValue=null){return store?.getJSON?.(key, defaultValue);},
    savePreference(key,value){return store?.setJSON?.(key,value);},
    getJSON(key, defaultValue=null){return store?.getJSON?.(key, defaultValue);},
    setJSON(key,value){return store?.setJSON?.(key,value);},
    getString(key, defaultValue=''){return store?.getString?.(key, defaultValue);},
    setString(key,value){return store?.setString?.(key,value);},
    remove(key){return store?.remove?.(key);}
  };

  window.DataAdapter = adapter;
})();
