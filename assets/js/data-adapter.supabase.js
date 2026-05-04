/**
 * Supabase data adapter
 * ---------------------
 * Supabase-only planner storage for the online prototype.
 *
 * Shared restaurant data lives in public.planner_state where id = "main".
 * Session/preferences stay local because the current login is still a prototype
 * role switcher, not real authentication.
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
  const recordId = config.supabaseRecordId || 'main';
  const baseUrl = String(config.supabaseUrl || '').replace(/\/rest\/v1\/?$/,'').replace(/\/+$/,'');
  const restUrl = `${baseUrl}/rest/v1/${encodeURIComponent(table)}`;
  const apiKey = config.supabaseKey;
  const seedVersion = config.setupSeedVersion || 'setup-only-v1';
  let lastError = '';
  let needsSetupSeed = false;

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

  function isEmptyObject(value){
    return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
  }

  function readRemotePlanner(){
    const url = `${restUrl}?id=eq.${encodeURIComponent(recordId)}&select=data`;
    const result = request('GET', url, undefined, {Accept:'application/json'});
    if(!result.ok) return null;
    const row = Array.isArray(result.data) ? result.data[0] : null;
    const remote = row && row.data ? row.data : null;

    if(!remote || isEmptyObject(remote)){
      needsSetupSeed = true;
      return null;
    }

    if(config.seedSetupOnlyOnce && remote?._supabaseSeed?.setupOnlyVersion !== seedVersion){
      // Intentionally return null so app.js creates the clean default restaurant setup,
      // then savePlanner() writes it back to Supabase with an empty planning calendar.
      needsSetupSeed = true;
      return null;
    }

    needsSetupSeed = false;
    return remote;
  }

  function saveRemotePlanner(plannerData){
    const payloadData = structuredClone ? structuredClone(plannerData) : JSON.parse(JSON.stringify(plannerData));
    if(needsSetupSeed || config.seedSetupOnlyOnce){
      payloadData._supabaseSeed = Object.assign({}, payloadData._supabaseSeed || {}, {
        setupOnlyVersion: seedVersion,
        seededAt: new Date().toISOString()
      });
      needsSetupSeed = false;
    }

    const payload = {
      id: recordId,
      data: payloadData,
      updated_at: new Date().toISOString()
    };
    const url = `${restUrl}?on_conflict=id`;
    const result = request('POST', url, payload, {
      Prefer: 'resolution=merge-duplicates,return=minimal'
    });
    return result.ok;
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
      needsSetupSeed = true;
      return saveRemotePlanner({});
    },

    getLastError(){return lastError;},

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
