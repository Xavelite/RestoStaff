/* restogogo Supabase Auth service facade — DB v2 only.
 * Owns session and RPC primitives, then delegates role access, quick access
 * and owner-onboarding ownership to focused auth modules.
 * It does not know UI pages or module state.
 */
(function(){
  const config = window.APP_CONFIG || {};
  const authConfig = Object.assign({enabled:true, required:true, loginIdentifierMode:'email'}, config.auth || {});
  const baseUrl = String(config.supabaseUrl || '').replace(/\/rest\/v1\/?$/,'').replace(/\/+$/,'');
  const apiKey = String(config.supabaseKey || '');
  const authBase = `${baseUrl}/auth/v1`;
  const restBase = `${baseUrl}/rest/v1`;
  const store = window.RestogogoSessionStore;
  const domain = window.RestogogoAuthDomain;
  const roleAccess = window.RestogogoRoleAccessService;
  const ownerOnboardingStateFactory = window.RestogogoOwnerOnboardingState;
  const ownerOnboardingFactory = window.RestogogoOwnerOnboardingService;
  const quickAccessFactory = window.RestogogoQuickAccessService;
  if(!domain || !roleAccess || !ownerOnboardingStateFactory || !ownerOnboardingFactory || !quickAccessFactory){
    throw new Error('Auth ownership modules must load before RestogogoAuthService.');
  }
  const {
    normalizeEmail,
    normalizeRole,
    authErrorMessage,
    normalizeOwnerSetupDetails,
    quickSessionExpired,
    emailConfirmedSessionMissing,
    isOwnerRole,
    isOwnerOrManagerRole
  } = domain;
  const KEYS = Object.freeze({
    authSession:'restogogo.auth.session.v2',
    memberships:'restogogo.auth.memberships.v2',
    quickSession:'restogogo.quick.session.v2',
    pendingOwnerSetup:'restogogo.onboarding.pending-owner-setup.v1'
  });

  let cachedSession = store?.getJSON?.(KEYS.authSession, null) || null;
  let cachedMemberships = store?.getJSON?.(KEYS.memberships, []) || [];
  let cachedQuickSession = store?.getJSON?.(KEYS.quickSession, null) || null;
  const pendingOwner = ownerOnboardingStateFactory.create({
    store,
    key:KEYS.pendingOwnerSetup,
    normalizeOwnerSetupDetails,
    normalizeEmail
  });

  function isEnabled(){return !!(authConfig.enabled || authConfig.required);}
  function isRequired(){return !!authConfig.required;}
  function saveAuthSession(session){cachedSession = session || null; cachedSession ? store?.setJSON?.(KEYS.authSession, cachedSession) : store?.remove?.(KEYS.authSession);}
  function saveMemberships(rows){cachedMemberships = Array.isArray(rows) ? rows : []; store?.setJSON?.(KEYS.memberships, cachedMemberships);}
  function saveQuickSession(payload){
    cachedQuickSession = payload && !quickSessionExpired(payload) ? payload : null;
    if(cachedQuickSession){
      store?.setJSON?.(KEYS.quickSession, cachedQuickSession);
    }else{
      store?.remove?.(KEYS.quickSession);
    }
  }
  function accessToken(){return cachedSession?.access_token || '';}
  function refreshToken(){return cachedSession?.refresh_token || '';}
  function currentUser(){return cachedSession?.user || null;}
  function tokenExpired(session){const expiresAt = Number(session?.expires_at || 0); return !!expiresAt && (Date.now()/1000) > (expiresAt - 60);}
  function headers(token){return Object.assign({apikey:apiKey, 'Content-Type':'application/json'}, token ? {Authorization:`Bearer ${token}`} : {});}

  async function authRequest(path, body={}, token=''){
    if(!baseUrl || !apiKey)throw new Error('Supabase is not configured.');
    const response = await fetch(`${authBase}${path}`, {method:'POST', headers:headers(token), body:JSON.stringify(body || {})});
    const payload = await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(authErrorMessage(payload, `Supabase Auth request failed (${response.status})`));
    return payload;
  }

  async function authedFetch(path, options={}){
    await ensureFreshSession();
    const token = accessToken();
    if(!token)throw new Error('No authenticated Supabase session.');
    const response = await fetch(`${restBase}${path}`, Object.assign({}, options, {
      headers:Object.assign(headers(token), options.headers || {})
    }));
    const text = await response.text();
    let payload = null;
    if(text){try{payload = JSON.parse(text);}catch{payload = text;}}
    if(!response.ok){
      const message = payload?.message || payload?.error_description || payload?.msg || `Supabase request failed (${response.status})`;
      throw new Error(message);
    }
    return payload;
  }


  async function rpc(functionName, payload={}){
    return authedFetch(`/rpc/${encodeURIComponent(functionName)}`, {
      method:'POST',
      headers:{Accept:'application/json', Prefer:'return=representation'},
      body:JSON.stringify(payload || {})
    });
  }

  async function anonRpc(functionName, payload={}){
    if(!baseUrl || !apiKey)throw new Error('Supabase is not configured.');
    const response = await fetch(`${restBase}/rpc/${encodeURIComponent(functionName)}`, {
      method:'POST',
      headers:headers(''),
      body:JSON.stringify(payload || {})
    });
    const text = await response.text();
    let data = null;
    if(text){try{data = JSON.parse(text);}catch{data = text;}}
    if(!response.ok){
      const message = data?.message || data?.error_description || data?.msg || `Supabase RPC failed (${response.status})`;
      throw new Error(message);
    }
    return data;
  }

  async function refreshSession(){
    if(!isEnabled() || !refreshToken())return null;
    const payload = await authRequest('/token?grant_type=refresh_token', {refresh_token:refreshToken()});
    saveAuthSession(payload);
    return payload;
  }

  async function ensureFreshSession(){
    if(!isEnabled())return null;
    if(!cachedSession)return null;
    if(tokenExpired(cachedSession)){
      try{return await refreshSession();}
      catch(error){console.warn('[restogogo:auth-refresh-failed]', error); await signOut({remote:false}); return null;}
    }
    return cachedSession;
  }

  function isAuthenticated(){return !!accessToken() && !tokenExpired(cachedSession);}
  function memberships(){return Array.isArray(cachedMemberships) ? cachedMemberships : [];}

  async function fetchMemberships(){
    if(!isEnabled() || !isAuthenticated())return cachedMemberships;
    const rows = await rpc('get_current_memberships', {});
    const normalized = Array.isArray(rows) ? rows.map(roleAccess.normalizeMembership) : [];
    saveMemberships(normalized);
    return normalized;
  }

  function membershipForWorkspace(workspaceId){
    const target = String(workspaceId || '').trim();
    if(!target)return null;
    return cachedMemberships.find(row => row?.restaurant_id === target || row?.workspace_slug === target) || null;
  }

  async function signIn(email, password){
    if(!isEnabled())throw new Error('Secure login is not enabled for this build.');
    const cleanEmail = normalizeEmail(email);
    if(!cleanEmail || !cleanEmail.includes('@'))throw new Error('Enter your email address.');
    if(!password)throw new Error('Enter your password.');
    const payload = await authRequest('/token?grant_type=password', {email:cleanEmail, password});
    saveAuthSession(payload);
    let rows = await fetchMemberships();
    let onboardingCompleted = false;
    if(!rows.length){
      const pending = pendingOwner.forEmail(cleanEmail);
      if(pending){
        await setupOwnerWorkspace(pending);
        pendingOwner.clear();
        rows = memberships();
        onboardingCompleted = true;
      }
    }
    if(!rows.length)throw new Error('Your account is not linked to a restaurant yet.');
    return {session:payload, memberships:rows, onboardingCompleted};
  }

  function getQuickSession(){
    if(quickSessionExpired(cachedQuickSession))saveQuickSession(null);
    return cachedQuickSession;
  }
  function isQuickAuthenticated(){
    const quick = getQuickSession();
    return !!quick?.restaurant?.id && !!quick?.membership?.role;
  }

  async function signUp(email, password, metadata={}){
    const cleanEmail = normalizeEmail(email);
    if(!cleanEmail || !cleanEmail.includes('@'))throw new Error('Enter a valid email address.');
    if(String(password || '').length < 6)throw new Error('Password must be at least 6 characters.');
    const payload = await authRequest('/signup', {email:cleanEmail, password, data:metadata || {}});
    if(payload?.access_token)saveAuthSession(payload);
    else if(payload?.session?.access_token)saveAuthSession(payload.session);
    return payload;
  }

  async function setupOwnerWorkspace(details){
    const normalized = normalizeOwnerSetupDetails(details || {});
    const data = await rpc('setup_owner_workspace', {
      p_owner_first_name:normalized.firstName,
      p_owner_last_name:normalized.lastName,
      p_owner_email:normalized.email,
      p_restaurant_name:normalized.restaurantName,
      p_city:normalized.city,
      p_employees:normalized.employees.map(employee=>({name: employee.name})),
      p_default_zone_name:normalized.defaultZoneName,
      p_default_position_name:normalized.defaultPositionName
    });
    await fetchMemberships();
    return data;
  }

  function withQuickSession(payload={}){
    const quick = getQuickSession() || {};
    const body = Object.assign({}, payload || {});
    if(!body.p_quick_session_id && quick.quick_session_id)body.p_quick_session_id = quick.quick_session_id;
    if(!body.p_quick_session_token && quick.quick_session_token)body.p_quick_session_token = quick.quick_session_token;
    return body;
  }

  function roleForRestaurant(restaurantId){return roleAccess.roleForRestaurant(restaurantId, memberships());}
  function quickRoleForRestaurant(restaurantId){return roleAccess.quickRoleForRestaurant(restaurantId, getQuickSession());}
  function requireAuthenticatedRole(restaurantId, predicate, message){return roleAccess.requireAuthenticatedRole(restaurantId, predicate, message, memberships());}
  function requireQuickRole(restaurantId, predicate, message){return roleAccess.requireQuickRole(restaurantId, predicate, message, getQuickSession());}

  const quickAccess = quickAccessFactory.create({
    anonRpc,
    saveQuickSession,
    saveAuthSession,
    saveMemberships,
    getQuickSession,
    withQuickSession,
    defaultWorkspace:config.defaultWorkspaceSlug || config.defaultWorkspaceId
  });

  const ownerOnboarding = ownerOnboardingFactory.create({
    normalizeOwnerSetupDetails,
    normalizeEmail,
    emailConfirmedSessionMissing,
    signUp,
    setupOwnerWorkspace,
    isAuthenticated,
    currentUser,
    accessToken,
    pendingState:pendingOwner
  });

  async function saveEmployeeSelfService(payload={}){
    const body = withQuickSession(payload);
    if(isAuthenticated())return rpc('save_employee_self_service', body);
    if(body.p_quick_session_id && body.p_quick_session_token)return anonRpc('save_employee_self_service', body);
    throw new Error('A valid app session is required to save employee time.');
  }

  function updateQuickSessionSnapshot(snapshot){
    const current = getQuickSession();
    if(current && snapshot)saveQuickSession(Object.assign({}, current, {runtime_snapshot: snapshot}));
  }

  async function saveManagerPlanning(payload={}){
    const body = withQuickSession(payload);
    if(isAuthenticated()){
      requireAuthenticatedRole(body.p_restaurant_id, isOwnerOrManagerRole, 'Owner or manager access is required to save planning.');
      return rpc('save_manager_planning', body);
    }
    if(body.p_quick_session_id && body.p_quick_session_token){
      requireQuickRole(body.p_restaurant_id, isOwnerOrManagerRole, 'Owner or manager access is required to save planning.');
      return anonRpc('save_manager_planning', body);
    }
    throw new Error('A valid owner or manager session is required to save planning.');
  }


  async function saveAbsenceLifecycle(payload={}){
    const body = withQuickSession(payload);
    const action = String(body.p_action || '').trim().toLowerCase();
    const managerActions = new Set(['create_by_manager','approve','reject','cancel_by_manager','cancel_for_planning','update_manager_comment']);
    const employeeActions = new Set(['create_by_employee','cancel_by_employee']);
    if(isAuthenticated()){
      if(managerActions.has(action))requireAuthenticatedRole(body.p_restaurant_id, isOwnerOrManagerRole, 'Owner or manager access is required to change absences.');
      else if(employeeActions.has(action))requireAuthenticatedRole(body.p_restaurant_id, role=>String(role||'').toLowerCase()==='employee', 'Employee access is required to change your own absence requests.');
      else throw new Error('Unsupported absence lifecycle action.');
      return rpc('save_absence_lifecycle', body);
    }
    if(body.p_quick_session_id && body.p_quick_session_token){
      if(managerActions.has(action))requireQuickRole(body.p_restaurant_id, isOwnerOrManagerRole, 'Owner or manager access is required to change absences.');
      else if(employeeActions.has(action))requireQuickRole(body.p_restaurant_id, role=>String(role||'').toLowerCase()==='employee', 'Employee access is required to change your own absence requests.');
      else throw new Error('Unsupported absence lifecycle action.');
      return anonRpc('save_absence_lifecycle', body);
    }
    throw new Error('A valid app session is required to change absences.');
  }


  async function saveActualsLifecycle(payload={}){
    const body = withQuickSession(payload);
    const action = String(body.p_action || '').trim().toLowerCase();
    const actions = new Set(['manual_entry','adjust_entry','cancel_entry','approve_week','reopen_week']);
    if(!actions.has(action))throw new Error('Unsupported actuals lifecycle action.');
    if(isAuthenticated()){
      requireAuthenticatedRole(body.p_restaurant_id, isOwnerOrManagerRole, 'Owner or manager access is required to manage actuals.');
      return rpc('save_actuals_lifecycle', body);
    }
    if(body.p_quick_session_id && body.p_quick_session_token){
      requireQuickRole(body.p_restaurant_id, isOwnerOrManagerRole, 'Owner or manager access is required to manage actuals.');
      return anonRpc('save_actuals_lifecycle', body);
    }
    throw new Error('A valid owner or manager session is required to manage actuals.');
  }

  async function getWorkspaceContext(restaurantId){
    if(!isAuthenticated())throw new Error('A real Supabase session is required to load workspace context.');
    return rpc('get_workspace_context', {p_restaurant_id:restaurantId || null});
  }

  async function getWorkspaceRuntimeSnapshot(restaurantId, dateRange={}){
    if(!isAuthenticated())throw new Error('A real Supabase session is required to load this workspace.');
    const payload = {p_restaurant_id:restaurantId || null};
    if(dateRange?.from)payload.p_from_date = dateRange.from;
    if(dateRange?.to)payload.p_to_date = dateRange.to;
    return rpc('get_workspace_runtime_snapshot', payload);
  }

  async function saveRestaurantSetup(payload={}){
    const body = withQuickSession(payload);
    if(isAuthenticated()){
      requireAuthenticatedRole(body.p_restaurant_id, isOwnerRole, 'Owner access is required to save restaurant settings.');
      return rpc('save_restaurant_setup', body);
    }
    if(body.p_quick_session_id && body.p_quick_session_token){
      requireQuickRole(body.p_restaurant_id, isOwnerRole, 'Owner access is required to save restaurant settings.');
      return anonRpc('save_restaurant_setup', body);
    }
    throw new Error('A valid owner session is required to save restaurant setup.');
  }

  async function saveTeamSetup(payload={}){
    const body = withQuickSession(payload);
    if(isAuthenticated()){
      requireAuthenticatedRole(body.p_restaurant_id, isOwnerOrManagerRole, 'Owner or manager access is required to save Team.');
      return rpc('save_team_setup', body);
    }
    if(body.p_quick_session_id && body.p_quick_session_token){
      requireQuickRole(body.p_restaurant_id, isOwnerOrManagerRole, 'Owner or manager access is required to save Team.');
      return anonRpc('save_team_setup', body);
    }
    throw new Error('A valid owner or manager session is required to save team setup.');
  }

  async function verifyBadgePin(payload={}){
    return anonRpc('verify_badge_pin', payload);
  }

  async function recordBadgeEntry(payload={}){
    return anonRpc('record_badge_entry', payload);
  }


  async function resetEmployeePin(payload={}){
    const body = withQuickSession(payload);
    if(isAuthenticated()){
      requireAuthenticatedRole(body.p_restaurant_id, isOwnerOrManagerRole, 'Owner or manager access is required to reset a PIN.');
      return rpc('reset_employee_pin', body);
    }
    if(body.p_quick_session_id && body.p_quick_session_token){
      requireQuickRole(body.p_restaurant_id, isOwnerOrManagerRole, 'Owner or manager access is required to reset a PIN.');
      return anonRpc('reset_employee_pin', body);
    }
    throw new Error('A valid owner or manager session is required to reset a PIN.');
  }

  async function signOut(options={remote:true}){
    const token = accessToken();
    if(options.remote !== false && token){
      try{await fetch(`${authBase}/logout`, {method:'POST', headers:headers(token)});}catch{}
    }
    saveAuthSession(null);
    saveMemberships([]);
    saveQuickSession(null);
  }

  window.RestogogoAuthService = Object.freeze({
    isEnabled,
    isRequired,
    getSession:()=>cachedSession,
    getUser:currentUser,
    getAccessToken:accessToken,
    isAuthenticated,
    ensureFreshSession,
    signIn,
    signUp,
    signUpOwnerAndSetup:ownerOnboarding.signUpOwnerAndSetup,
    setupOwnerWorkspace,
    getPendingOwnerSetup:pendingOwner.read,
    clearPendingOwnerSetup:pendingOwner.clear,
    quickLogin:quickAccess.quickLogin,
    saveEmployeeSelfService,
    saveManagerPlanning,
    saveAbsenceLifecycle,
    saveActualsLifecycle,
    getWorkspaceContext,
    getWorkspaceRuntimeSnapshot,
    saveRestaurantSetup,
    saveTeamSetup,
    resetEmployeePin,
    changeOwnPin:quickAccess.changeOwnPin,
    verifyBadgePin,
    recordBadgeEntry,
    getQuickSession,
    updateQuickSessionSnapshot,
    isQuickAuthenticated,
    signOut,
    fetchMemberships,
    memberships,
    membershipForWorkspace,
    runtimeSessionFromMembership:roleAccess.runtimeSessionFromMembership,
    roleForRestaurant
  });
})();
