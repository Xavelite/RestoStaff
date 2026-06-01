/* restogogo workspace auth — DB v2 front-door.
 * Real login uses Supabase Auth email/password.
 * Quick login uses restaurant-scoped FirstName.LastName + 4-digit PIN.
 * Badge Terminal uses the same quick PIN credential.
 */
(function(){
  const Restogogo = window.Restogogo = window.Restogogo || {};
  const $ = id => document.getElementById(id);

  function slugify(value){return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
  function defaultWorkspaceSlug(){return window.APP_CONFIG?.defaultWorkspaceSlug || window.APP_CONFIG?.defaultWorkspaceId || 'demo-restaurant';}
  function requestedWorkspaceId(){
    try{
      const params = new URLSearchParams(location.search || '');
      const raw = params.get('workspace') || params.get('restaurant') || '';
      return raw ? slugify(raw) : defaultWorkspaceSlug();
    }catch{return defaultWorkspaceSlug();}
  }
  function isBadgeTerminalLaunchRoute(){
    try{
      const params = new URLSearchParams(location.search || '');
      return ['badge','badge-terminal'].includes(String(params.get('terminal') || params.get('kiosk') || '').toLowerCase());
    }catch{return false;}
  }
  function badgeTerminalUrl(){
    const url = new URL(location.href);
    url.searchParams.set('terminal','badge-terminal');
    const context = Restogogo.workspace?.current?.();
    if(context?.workspaceSlug)url.searchParams.set('workspace', context.workspaceSlug);
    else if(context?.restaurantId)url.searchParams.set('workspace', context.restaurantId);
    else url.searchParams.set('workspace', defaultWorkspaceSlug());
    return url.href;
  }
  function openBadgeTerminal(){
    const win = window.open(badgeTerminalUrl(), '_blank', 'noopener,noreferrer');
    if(!win){
      Restogogo.ui?.toast?.('Allow pop-ups to open the badge terminal.', {tone:'warning', icon:'alert', centered:true, timeout:2200});
      return;
    }
    win.focus?.();
  }

  function normalizeRuntimeRole(role){
    return window.RestogogoAuthDomain?.normalizeRole?.(role) || '';
  }
  function runtimeSessionFromContext(context){
    const role = normalizeRuntimeRole(context?.role);
    if(!role)throw new Error('Workspace session role is missing or invalid.');
    return {role, employeeId:context?.employeeId || null};
  }

  function loginContext(mode){
    return Restogogo.brandEntry?.getLoginContext?.(mode) || {
      mode: mode || 'real',
      identity: String($('emailLoginName')?.value || '').trim(),
      secret: String($('emailLoginPassword')?.value || '').trim(),
      workspaceId: defaultWorkspaceSlug()
    };
  }
  function showError(message){Restogogo.brandEntry?.signalLoginError?.(message || 'Login failed.'); return null;}
  function clearLoginMessages(){Restogogo.brandEntry?.clearLoginMessages?.();}
  function clearLoginFields(){
    ['emailLoginName','emailLoginPassword','quickLoginName','quickLoginPin'].forEach(id=>{const el=$(id); if(el)el.value='';});
    clearLoginMessages();
  }
  /* Workspace slug inputs — no unauthenticated RPC; fill from current context or URL param. */
  function populateRestaurantLoginSelect(){
    const slug = Restogogo.workspace?.current?.()?.workspaceSlug
      || Restogogo.workspace?.current?.()?.restaurantId
      || window.DataAdapter?.getWorkspaceId?.()
      || requestedWorkspaceId();
    ['emailLoginRestaurant','quickLoginRestaurant'].forEach(id=>{
      const el=$(id);
      if(el)el.value=slug;
    });
  }
  async function changeLoginWorkspace(idValue){
    if(!idValue)return;
    window.DataAdapter?.setWorkspaceId?.(idValue);
    if(window.RestogogoAuthService?.isAuthenticated?.()){
      const context = await Restogogo.workspace?.loadCurrentContext?.(idValue);
      if(context)session = runtimeSessionFromContext(context);
    }
  }

  async function loadAuthenticatedWorkspace(preferredRestaurantId=''){
    const context = await Restogogo.workspace?.loadCurrentContext?.(preferredRestaurantId || requestedWorkspaceId());
    if(!context)return null;
    session = runtimeSessionFromContext(context);
    window.DataAdapter?.saveSession?.(session);
    window.DataAdapter?.setWorkspaceId?.(context.restaurantId);
    return context;
  }

  async function enterAppAfterContext(context, source='auth'){
    if(!context)return showError('Your account is not linked to a restaurant workspace.');
    Restogogo.brandEntry?.signalLoginSuccess?.();
    try{await load();}catch(error){console.warn(`[restogogo:load-after-${source}-failed]`, error);}
    const finish = async()=>{Restogogo.shell.enterApp(true);};
    Restogogo.brandEntry?.shouldDelayEntry?.() ? setTimeout(()=>void finish(), 180) : await finish();
    return context;
  }

  async function enterAuthenticatedWorkspace(preferredRestaurantId=''){
    return enterAppAfterContext(await loadAuthenticatedWorkspace(preferredRestaurantId), 'auth');
  }

  async function enterQuickWorkspace(ctx){
    const identity = String(ctx.identity || '').trim();
    const pin = String(ctx.secret || '').trim();
    const workspaceId = ctx.workspaceId || requestedWorkspaceId();
    if(!identity)return showError('Enter your quick login name.');
    if(!/^\d{4}$/.test(pin))return showError('Enter your 4-digit PIN.');
    const payload = await window.RestogogoAuthService.quickLogin(workspaceId, identity, pin);
    const context = Restogogo.workspace?.loadQuickContext?.(payload);
    if(!context)return showError('Quick login did not return a workspace.');
    session = runtimeSessionFromContext(context);
    window.DataAdapter?.saveSession?.(session);
    window.DataAdapter?.setWorkspaceId?.(context.restaurantId);
    if(payload?.employee?.must_change_pin === true){
      Restogogo.brandEntry?.showPinChangePanel?.(async(currentPin, newPin)=>{
        await window.RestogogoAuthService.changeOwnPin(currentPin, newPin);
        const nextContext = Restogogo.workspace?.bootstrapQuickContext?.() || context;
        await enterAppAfterContext(nextContext, 'quick-pin-change');
      });
      return context;
    }
    return enterAppAfterContext(context, 'quick-login');
  }

  async function enterSelectedWorkspace(options={}){
    const mode = options.mode || options.role || undefined;
    const ctx = loginContext(mode);
    clearLoginMessages();
    try{
      if(ctx.mode === 'quick')return await enterQuickWorkspace(ctx);
      const email = String(ctx.identity || '').trim();
      const password = String(ctx.secret || '');
      if(!email)return showError('Enter your email address.');
      if(!password)return showError('Enter your password.');
      await window.RestogogoAuthService.signIn(email, password);
      return await enterAuthenticatedWorkspace(ctx.workspaceId || requestedWorkspaceId());
    }catch(error){
      return showError(error?.message || (ctx.mode === 'quick' ? 'Quick login failed.' : 'Secure login failed.'));
    }
  }

  async function bootstrapAuthenticatedSession(){
    const auth = window.RestogogoAuthService;
    if(!auth?.isEnabled?.())return false;
    await auth.ensureFreshSession?.();
    if(auth.isAuthenticated?.()){
      try{
        await auth.fetchMemberships?.();
        return !!(await loadAuthenticatedWorkspace(requestedWorkspaceId()));
      }catch(error){
        console.warn('[restogogo:session-bootstrap-failed]', error);
        await auth.signOut?.({remote:false});
        Restogogo.workspace?.clear?.();
        return false;
      }
    }
    const quickContext = Restogogo.workspace?.bootstrapQuickContext?.();
    if(quickContext){
      session = runtimeSessionFromContext(quickContext);
      window.DataAdapter?.saveSession?.(session);
      window.DataAdapter?.setWorkspaceId?.(quickContext.restaurantId);
      return true;
    }
    return false;
  }

  async function showRestaurantLogin(){
    document.documentElement.classList.remove('badge-terminal-mode');
    document.body.classList.remove('planning-mode','employee-schedule-mode','employee-time-mode','badge-terminal-mode','actuals-mode','team-mode','restaurant-mode');
    document.body.classList.add('logged-out');
    document.getElementById('invalidRoleScreen')?.remove();
    Restogogo.services?.realtime?.disconnect?.();
    const loginEl = $('login');
    if(loginEl)loginEl.style.display = 'grid';
    const onboardingEl = $('onboarding');
    if(onboardingEl)onboardingEl.style.display = 'none';
    Restogogo.brandEntry?.renderEntryModules?.();
    await populateRestaurantLoginSelect();
    clearLoginFields();
    Restogogo.brandEntry?.resetLoginState?.();
    setTimeout(()=>loginContext().identityEl?.focus?.(), 0);
  }

  async function signOut(){
    await window.RestogogoAuthService?.signOut?.();
    Restogogo.workspace?.clear?.();
    session = {role:'', employeeId:null};
    window.DataAdapter?.saveSession?.(session);
    Restogogo.state.data = null;
    await showRestaurantLogin();
  }

  Restogogo.auth = Object.freeze({
    requestedWorkspaceId,
    isBadgeTerminalLaunchRoute,
    badgeTerminalUrl,
    openBadgeTerminal,
    populateRestaurantLoginSelect,
    changeLoginWorkspace,
    enterSelectedWorkspace,
    enterAuthenticatedWorkspace,
    bootstrapAuthenticatedSession,
    showRestaurantLogin,
    signOut
  });
})();
