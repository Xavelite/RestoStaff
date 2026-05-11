/**
 * Supabase data adapter
 * ---------------------
 * Supabase-only planner storage for the online prototype.
 *
 * Prototype restaurant workspaces: every restaurant is a separate
 * public.planner_state row keyed by id. This is not yet secure multi-tenant auth;
 * session/preferences remain local until Supabase Auth + RLS are introduced.
 */
(function(){
  const config = window.APP_CONFIG || {};
  const shouldUseSupabase = config.storageMode === 'supabase' && config.supabaseUrl && config.supabaseKey;
  if(!shouldUseSupabase) return;

  const Local = window.LocalDataAdapter;
  if(!Local){
    console.error('Supabase adapter requires LocalDataAdapter to be loaded first.');
    return;
  }

  const KEYS = Local.KEYS;
  const table = config.supabaseTable || 'planner_state';
  const defaultWorkspaceId = sanitizeWorkspaceId(config.defaultWorkspaceId || config.supabaseRecordId || 'bouillon-bruxelles');
  const bootstrapRecordId = config.supabaseBootstrapRecordId || '';
  const workspaceKey = 'restogogo_workspace_id';
  let currentRecordId = sanitizeWorkspaceId(Local.readPreference(workspaceKey, defaultWorkspaceId) || defaultWorkspaceId);
  const baseUrl = String(config.supabaseUrl || '').replace(/\/rest\/v1\/?$/,'').replace(/\/+$/,'');
  const restUrl = `${baseUrl}/rest/v1/${encodeURIComponent(table)}`;
  const apiKey = config.supabaseKey;
  const seedVersion = config.setupSeedVersion || 'clean-v2-base';
  let lastError = '';
  let lastReadStatus = 'idle';
  let needsSetupSeed = false;

  function sanitizeWorkspaceId(value){
    const raw = String(value || '').trim().toLowerCase();
    return (raw.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64) || 'restaurant');
  }

  function setError(message){
    lastError = message || '';
    window.__SUPABASE_STORAGE_ERROR__ = lastError;
    if(lastError) console.error(lastError);
  }

  function headers(extra = {}){
    return Object.assign({
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }, extra);
  }

  function request(method, url, body, extraHeaders){
    try{
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, false); // sync by design for the current vanilla app
      const h = headers(extraHeaders || {});
      Object.keys(h).forEach(k => xhr.setRequestHeader(k, h[k]));
      xhr.send(body === undefined ? null : JSON.stringify(body));
      if(xhr.status >= 200 && xhr.status < 300){
        setError('');
        if(!xhr.responseText) return {ok:true, data:null};
        try{return {ok:true, data:JSON.parse(xhr.responseText)}}catch{return {ok:true, data:xhr.responseText}}
      }
      setError(`Supabase request failed (${xhr.status}): ${xhr.responseText || method + ' ' + url}`);
      return {ok:false, data:null};
    }catch(err){
      setError(`Supabase request error: ${err && err.message ? err.message : err}`);
      return {ok:false, data:null};
    }
  }

  function cloneData(value){
    return value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  }

  function isEmptyObject(value){
    return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
  }

  function extractPlannerData(result){
    const row = result && Array.isArray(result.data) ? result.data[0] : null;
    const remote = row && row.data ? row.data : null;
    return (!remote || isEmptyObject(remote)) ? null : remote;
  }

  function fetchPlannerRow(idValue){
    const url = `${restUrl}?id=eq.${encodeURIComponent(idValue)}&select=data`;
    return request('GET', url, undefined, {Accept:'application/json'});
  }

  function readRemotePlanner(){
    lastReadStatus = 'loading';
    needsSetupSeed = false;

    const primary = fetchPlannerRow(currentRecordId);
    if(!primary.ok){
      lastReadStatus = 'error';
      needsSetupSeed = false;
      return null;
    }

    let remote = extractPlannerData(primary);
    if(remote){
      if(config.seedSetupOnlyOnce && remote?._supabaseSeed?.setupOnlyVersion !== seedVersion){
        lastReadStatus = 'seed-needed';
        needsSetupSeed = true;
        return null;
      }
      lastReadStatus = 'ok';
      needsSetupSeed = false;
      return remote;
    }

    // Bootstrap convenience: the first Bouillon workspace can seed from the optional "main" row when present.
    if(currentRecordId === defaultWorkspaceId && bootstrapRecordId && bootstrapRecordId !== currentRecordId){
      const bootstrap = fetchPlannerRow(bootstrapRecordId);
      if(bootstrap.ok){
        remote = extractPlannerData(bootstrap);
        if(remote){
          lastReadStatus = 'bootstrap-ok';
          needsSetupSeed = false;
          return remote;
        }
      }
    }

    lastReadStatus = 'empty';
    needsSetupSeed = true;
    return null;
  }

  function saveRemotePlanner(plannerData){
    const payloadData = cloneData(plannerData);
    if(needsSetupSeed || config.seedSetupOnlyOnce){
      payloadData._supabaseSeed = Object.assign({}, payloadData._supabaseSeed || {}, {
        setupOnlyVersion: seedVersion,
        seededAt: new Date().toISOString()
      });
      needsSetupSeed = false;
    }

    const payload = {
      id: currentRecordId,
      data: payloadData,
      updated_at: new Date().toISOString()
    };
    const url = `${restUrl}?on_conflict=id`;
    const result = request('POST', url, payload, {
      Prefer: 'resolution=merge-duplicates,return=minimal'
    });
    return result.ok;
  }

  function listRemoteWorkspaces(){
    const url = `${restUrl}?select=id,data,updated_at&order=updated_at.desc`;
    const result = request('GET', url, undefined, {Accept:'application/json'});
    if(!result.ok || !Array.isArray(result.data)) return [];
    return result.data.map(row=>({
      id: row.id,
      updated_at: row.updated_at,
      restaurant: row.data && row.data.restaurant ? row.data.restaurant : {},
      counts: row.data ? {
        employees: Array.isArray(row.data.employees) ? row.data.employees.length : 0,
        positions: Array.isArray(row.data.positions) ? row.data.positions.length : 0,
        zones: Array.isArray(row.data.zoneRules) ? row.data.zoneRules.filter(z=>z && z.zone).length : 0
      } : {}
    })).filter(w=>w.id && w.id !== 'workspace_index');
  }

  const SupabaseDataAdapter = {
    mode: 'supabase',
    supabaseOnly: !!config.supabaseOnly,
    KEYS,

    readPlanner(){
      return readRemotePlanner();
    },

    savePlanner(plannerData){
      return saveRemotePlanner(plannerData);
    },

    resetPlanner(){
      lastReadStatus = 'seed-needed';
      needsSetupSeed = true;
      return saveRemotePlanner({});
    },

    getLastError(){return lastError;},
    getLastReadStatus(){return lastReadStatus;},
    wasLastReadError(){return lastReadStatus === 'error';},

    getWorkspaceId(){return currentRecordId;},
    getDefaultWorkspaceId(){return defaultWorkspaceId;},
    setWorkspaceId(value){
      currentRecordId = sanitizeWorkspaceId(value || defaultWorkspaceId);
      Local.savePreference(workspaceKey, currentRecordId);
      lastReadStatus = 'idle';
      needsSetupSeed = false;
      return currentRecordId;
    },
    sanitizeWorkspaceId,
    listWorkspaces(){return listRemoteWorkspaces();},

    // Local-only because the login is still prototype access, not Supabase Auth.
    readSession(fallback){return Local.readSession(fallback);},
    saveSession(session){return Local.saveSession(session);},
    isLoggedIn(){return Local.isLoggedIn();},
    setLoggedIn(value){return Local.setLoggedIn(value);},
    readNotificationsRead(){return Local.readNotificationsRead();},
    saveNotificationsRead(value){return Local.saveNotificationsRead(value);},
    readPreference(key, fallback = null){return Local.readPreference(key, fallback);},
    savePreference(key, value){return Local.savePreference(key, value);},

    // Generic helpers kept for session/preferences compatibility only.
    getJSON(key, fallback){return Local.getJSON(key, fallback);},
    setJSON(key, value){return Local.setJSON(key, value);},
    getString(key, fallback){return Local.getString(key, fallback);},
    setString(key, value){return Local.setString(key, value);},
    remove(key){return Local.remove(key);}
  };

  window.SupabaseDataAdapter = SupabaseDataAdapter;
  window.DataAdapter = SupabaseDataAdapter;
})();
