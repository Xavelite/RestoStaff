/*
 * restogogo app shell.
 * Keeps route/page orchestration separate from page modules.
 * All helpers are IIFE-local. Public surface: Restogogo.shell + Restogogo.init.
 */
(function(){

function hasKnownRuntimeRole(){
  return Restogogo.registry.isKnownRole(session.role);
}

function handleInvalidRuntimeRole(){
  if(hasKnownRuntimeRole())return false;
  showInvalidRoleScreen();
  return true;
}

function hasValidEmployeeSession(){
  const normalizedRole = Restogogo.registry.normalizeRole(session.role);
  if(!normalizedRole)return false;
  if(normalizedRole !== 'employee')return true;
  const employeeId = String(session.employeeId || '').trim();
  return !!employeeId && activeEmployees().some(employee=>String(employee.id) === employeeId);
}

function handleInvalidEmployeeSession(){
  if(hasValidEmployeeSession())return false;
  Restogogo.warn?.('[restogogo:employee-session-invalid]', {employeeId: session.employeeId || null});
  Restogogo.ui?.toast?.('Your employee session is no longer valid. Please log in again.', {tone:'warning', icon:'alert', centered:true, timeout:2400});
  void Restogogo.auth.signOut();
  return true;
}

function fillSelectors(){
  if(Restogogo.registry.normalizeRole(session.role) === 'employee' && !hasValidEmployeeSession()){
    session.employeeId = null;
  }
}

function showInvalidRoleScreen(){
  // Remove any previous instance (e.g. after a session switch).
  document.getElementById('invalidRoleScreen')?.remove();
  // Block all page navigation visually.
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const rawRole = String(Restogogo.workspace?.current?.()?.role || session.role || '').trim();
  Restogogo.warn?.('[restogogo:unknown-role]', {rawRole});
  const screen = document.createElement('div');
  screen.id = 'invalidRoleScreen';
  screen.className = 'rs-invalid-role-screen';
  screen.innerHTML = `
    <div class="rs-invalid-role-card">
      <div class="rs-invalid-role-icon" aria-hidden="true">⚠</div>
      <h1 class="rs-invalid-role-title">Access problem</h1>
      <p class="rs-invalid-role-body">Your account role could not be determined. Contact your manager or restaurant owner to verify your access level.</p>
      <button class="rs-action-button is-primary" id="invalidRoleSignOutBtn">Sign out and try again</button>
    </div>`;
  (document.getElementById('appMain') || document.body).appendChild(screen);
  document.getElementById('invalidRoleSignOutBtn')?.addEventListener('click', () => void Restogogo.auth.signOut());
}

function enterApp(goHome=false){
  document.body.classList.remove('logged-out');
  const loginEl=$('login');
  if(loginEl)loginEl.style.display='none';
  // Unknown-role guard — runs before the module platform initialises.
  const rawRole = Restogogo.workspace?.current?.()?.role || session.role;
  if(!rawRole || !Restogogo.registry.isKnownRole(rawRole)){
    showInvalidRoleScreen();
    return;
  }
  if(handleInvalidRuntimeRole())return;
  fillSelectors();
  if(handleInvalidEmployeeSession())return;
  // Connect Realtime presence (graceful no-op if vendor not loaded or offline).
  (()=>{
    const ctx = Restogogo.workspace?.current?.();
    const displayName = ctx?.employee?.display_name || ctx?.employee?.first_name || 'Manager';
    Restogogo.services?.realtime?.connect?.(ctx?.restaurantId || window.DataAdapter?.getWorkspaceId?.(), displayName, session.role);
  })();
  const target=Restogogo.auth.isBadgeTerminalLaunchRoute() ? 'badge-terminal' : Restogogo.registry.roleHome(session.role);
  if(goHome||!document.querySelector('.page.active'))showPage(target);
  render();
  updateStickyVars();
}

function beginNavigationMotion(enabled){
  document.body.classList.toggle('is-nav-transitioning', !!enabled);
  if(!enabled)return;
  window.clearTimeout(beginNavigationMotion.timer);
  beginNavigationMotion.timer = window.setTimeout(()=>document.body.classList.remove('is-nav-transitioning'), 950);
}

function showPage(pageName, options={}){
  const targetPage = Restogogo.registry.resolvePage(pageName, session.role);
  beginNavigationMotion(!!options.fromNav);
  const page = $(Restogogo.registry.pageElementId(targetPage));
  if(!page)return;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  page.classList.add('active');
  applyDefaultWeekForPage(targetPage);
  syncShellChrome();
  if(data)render();
  requestAnimationFrame(updateStickyVars);
  // Keep realtime presence in sync with the current page and active week.
  Restogogo.services?.realtime?.trackPage?.(targetPage, data?.weekStart);
}

function syncShellChrome(){
  Restogogo.appLayout?.apply?.({ pageId: activePageName(), role: session.role, loggedOut: document.body.classList.contains('logged-out') });
}

function setStickyCssVar(name,value){
  document.documentElement.style.setProperty(name,value);
  document.body?.style.setProperty(name,value);
}

function updateStickyVars(){
  if(document.body.classList.contains('logged-out'))return;
  const top=document.getElementById('appTopbar');
  const th=top?Math.ceil(top.getBoundingClientRect().height):64;
  setStickyCssVar('--topbar-h',th+'px');
  setStickyCssVar('--toolbar-h','0px');
  setStickyCssVar('--metrics-h','0px');
  setStickyCssVar('--metrics-top',th+'px');
  setStickyCssVar('--sticky-shell-h',th+'px');
  setStickyCssVar('--calendar-sticky-top',th+'px');
}

function activePageName(){
  return Restogogo.registry.activePage();
}

function showPilotGuide(){
  Restogogo.pilotGuide?.show?.();
}

function showAccessHelp(){
  Restogogo.accessHelp?.show?.();
}

function render(){
  if(!data)return;
  if(handleInvalidRuntimeRole())return;
  fillSelectors();
  if(handleInvalidEmployeeSession())return;
  const weekStartEl=$('weekStart');
  if(weekStartEl)weekStartEl.value=data.weekStart;
  const who=(()=>{
    if(Restogogo.registry.isEmployee(session.role))return emp(session.employeeId)?.name||'Employee';
    // Real login: pull name from profile metadata or workspace context
    const ctx = Restogogo.workspace?.current?.() || {};
    const meta = ctx.authUser?.user_metadata || {};
    const firstName = String(meta.first_name || meta.name || '').split(/[ .@]/)[0] || '';
    if(firstName)return firstName;
    // Quick login as owner: pull from employee record
    const ownerEmployee = (data?.employees || []).find(e=>e.id === ctx.employeeId);
    return ownerEmployee?.firstName || ownerEmployee?.name?.split(' ')[0] || 'Owner';
  })();
  const userPillEl=$('userPill');
  if(userPillEl){
    userPillEl.textContent=who;
    userPillEl.setAttribute('aria-label',`Log out ${who} and return to login`);
  }
  syncShellChrome();
  Restogogo.registry.renderActiveModule();
  renderNotifications();
  requestAnimationFrame(updateStickyVars);
}

function changeWeek(delta){
  if(!data) return;
  const n = Number(delta);
  if(!Number.isFinite(n)) return;
  setWeekStartAndLoad(addDays(data.weekStart, n));
  render();
}

function bind(){
  const on=(idValue,event,handler)=>{$(idValue)?.addEventListener(event,handler);};
  on('emailLoginBtn','click',()=>void Restogogo.auth.enterSelectedWorkspace());
  on('emailLoginPassword','keydown',e=>{if(e.key==='Enter')void Restogogo.auth.enterSelectedWorkspace();});
  on('emailLoginName','keydown',e=>{if(e.key==='Enter')void Restogogo.auth.enterSelectedWorkspace();});
  on('emailLoginRestaurant','change',e=>void Restogogo.auth.changeLoginWorkspace(e.target.value));
  on('accessHelpLoginBtn','click',showAccessHelp);
  on('userPill','click',()=>{void Restogogo.auth.signOut();});
  on('notifBtn','click',e=>{e.stopPropagation(); notifOpen=!notifOpen; renderNotifications();});
  document.addEventListener('click',event=>{
    const accessHelp=event.target.closest('[data-login-access-help]');
    if(accessHelp){event.preventDefault();showAccessHelp();return;}
    const launch=event.target.closest('[data-launch-badge-terminal]');
    if(!launch)return;
    event.preventDefault();
    Restogogo.auth.openBadgeTerminal();
  });
  $('appTopNav')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-app-page]');
    if(!button)return;
    event.preventDefault();
    showPage(button.dataset.appPage,{fromNav:true});
  });
  $('notifPanel')?.addEventListener('click',event=>{
    const markAll=event.target.closest('[data-notification-action="mark-all-read"]');
    if(markAll){event.preventDefault();markAllNotificationsRead();return;}
    const item=event.target.closest('[data-notification-key]');
    if(item){event.preventDefault();markNotificationRead(item.dataset.notificationKey);}
  });
  Restogogo.registry.bindModules();
  Restogogo.services.metricDetails?.bind?.();
  document.addEventListener('click',e=>{if(!e.target.closest('.notif-wrap')){notifOpen=false; renderNotifications();}});
  window.addEventListener('resize',()=>requestAnimationFrame(updateStickyVars));
}

/* Public app shell API — consumed by modules via Restogogo.shell.
 * showPilotGuide, showAccessHelp and fillSelectors are IIFE-private.
 * Week archive/restore helpers stay in the state layer and are not exposed
 * through the shell. Only the six below have external callers. */
Restogogo.shell={
  render,
  changeWeek,
  showPage,
  enterApp,
  activePageName,
  openBadgeTerminal: ()=>Restogogo.auth.openBadgeTerminal()
};

async function initRestogogoApp(){
  Restogogo.diagnostics?.checkBootGraph?.();
  notifRead=window.DataAdapter.readNotificationsRead();
  bind();
  Restogogo.diagnostics?.reportBootOk?.();
  const requested=Restogogo.auth.requestedWorkspaceId();
  if(requested&&window.DataAdapter.setWorkspaceId)window.DataAdapter.setWorkspaceId(requested);
  const hasSession = await Restogogo.auth.bootstrapAuthenticatedSession();
  if(hasSession){
    await load();
    enterApp(true);
  } else {
    await Restogogo.auth.showRestaurantLogin();
  }
  updateStickyVars();
}

/* Bootstrap entry point — called by app.js as the final script. */
Restogogo.init = initRestogogoApp;

})();
