/*
 * restogogo app shell.
 * Keeps route/page orchestration separate from page modules.
 */

function fillSelectors(){
  const employees=activeEmployees();
  if(!employees.some(e=>e.id===session.employeeId))session.employeeId=employees[0]?.id||'';
}

function enterApp(goHome=false){
  document.body.classList.remove('logged-out');
  const loginEl=$('login');
  if(loginEl)loginEl.style.display='none';
  fillSelectors();
  applyRestaurantBrand();
  const target=isBadgeTerminalLaunchRoute()?'badge-terminal':(session.role==='owner'?'planning':'employee-schedule');
  if(goHome||!document.querySelector('.page.active'))showPage(target);
  render();
  updateStickyVars();
}

function showPage(pageName){
  const requestedPage = pageName;
  if(pageName==='employee-time'){
    pageName='employee-schedule';
  }
  if(['actuals','planning','team','restaurant'].includes(pageName)&&session.role!=='owner'){
    pageName='employee-schedule';
  }
  if(pageName==='employee-schedule'){
    const view = requestedPage==='employee-time' ? 'worked' : 'schedule';
    Restogogo.employeeSchedule?.setView?.(view);
  }
  const page=$('page-'+pageName);
  if(!page)return;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  page.classList.add('active');
  applyDefaultWeekForPage(pageName);
  updateAppTitle();
  updatePageMode();
  renderAppNav();
  if(data)render();
  requestAnimationFrame(updateStickyVars);
}

function updateAppTitle(){
  const titleEl=$('appTitle');
  if(!titleEl)return;
  const active=activePageName();
  const labels={planning:'Planning',actuals:'Actuals','badge-terminal':'Badge Terminal','employee-schedule':(Restogogo.employeeSchedule?.activeView?.()==='worked'?'My Time':'My Schedule'),team:'Team',restaurant:'Restaurant'};
  titleEl.textContent=labels[active]||(session.role==='owner'?'Planning':'My Schedule');
}

function updatePageMode(){
  const employeeSchedule=$('page-employee-schedule')?.classList.contains('active');
  const planning=$('page-planning')?.classList.contains('active');
  const badgeTerminal=$('page-badge-terminal')?.classList.contains('active');
  const actuals=$('page-actuals')?.classList.contains('active');
  const team=$('page-team')?.classList.contains('active');
  const restaurant=$('page-restaurant')?.classList.contains('active');
  document.body.classList.toggle('planning-mode',!!planning);
  document.body.classList.toggle('employee-schedule-mode',!!(session.role==='employee'&&employeeSchedule));
  document.body.classList.toggle('badge-terminal-mode',!!badgeTerminal);
  document.documentElement.classList.toggle('badge-terminal-mode',!!badgeTerminal);
  document.body.classList.toggle('actuals-mode',!!actuals);
  document.body.classList.toggle('team-mode',!!team);
  document.body.classList.toggle('restaurant-mode',!!restaurant);
}



function setStickyCssVar(name,value){
  document.documentElement.style.setProperty(name,value);
  document.body?.style.setProperty(name,value);
}

function updateStickyVars(){
  if(document.body.classList.contains('logged-out'))return;
  const top=document.querySelector('.topbar');
  const th=top?Math.ceil(top.getBoundingClientRect().height):64;
  setStickyCssVar('--topbar-h',th+'px');
  setStickyCssVar('--toolbar-h','0px');
  setStickyCssVar('--metrics-h','0px');
  setStickyCssVar('--metrics-top',th+'px');
  setStickyCssVar('--sticky-shell-h',th+'px');
  setStickyCssVar('--calendar-sticky-top',th+'px');
}

function activePageName(){
  const active=document.querySelector('.page.active');
  return active ? active.id.replace(/^page-/,'') : '';
}

function navItemsForSession(){
  return session.role==='owner'
    ? [{page:'planning',label:'Planning'},{page:'actuals',label:'Actuals'},{page:'team',label:'Team'},{page:'restaurant',label:'Restaurant'}]
    : [{page:'employee-schedule',label:'My Schedule',employeeView:'schedule'},{page:'employee-time',label:'My Time',employeeView:'worked'}];
}

function renderAppNav(){
  const nav=$('appTopNav');
  if(!nav)return;
  const active=activePageName();
  nav.innerHTML=navItemsForSession().map(item=>{
    const employeeView=Restogogo.employeeSchedule?.activeView?.() || 'schedule';
    const isActive = item.page===active || (active==='employee-schedule' && item.employeeView===employeeView);
    const viewAttr = item.employeeView ? ` data-employee-view="${esc(item.employeeView)}"` : '';
    return `<button type="button" class="app-nav-link${isActive?' is-active':''}" data-app-page="${esc(item.page)}"${viewAttr}>${esc(item.label)}</button>`;
  }).join('');
}

function pilotGuideRows(){
  return [
    {label:'1. Prepare next week',body:'Go to Planning, build or copy the schedule, then publish when ready.'},
    {label:'2. Open the badge terminal',body:'Go to Actuals and open Badge terminal in a separate window for employees.'},
    {label:'3. Employees badge',body:'Employee taps their name, enters PIN, and the terminal records check-in or check-out with photo proof when camera permission is available.'},
    {label:'4. Manager reviews Actuals',body:'Actuals shows planned employees and employees who badged. Review missing badges, open check-outs, unplanned badges and variances.'},
    {label:'5. Export the week',body:'Use Actuals actions to export payroll prep, weekly summary, details or anomalies.'}
  ];
}

function showPilotGuide(){
  let dialog=$('pilotGuideDialog');
  if(!dialog){
    dialog=document.createElement('dialog');
    dialog.id='pilotGuideDialog';
    dialog.className='pilot-guide-dialog';
    document.body.appendChild(dialog);
    dialog.addEventListener('click',event=>{
      if(event.target===dialog || event.target.closest('[data-pilot-guide-close]'))dialog.close();
      if(event.target.closest('[data-pilot-open-terminal]'))openBadgeTerminal();
    });
    dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();});
  }
  dialog.innerHTML=`<section class="pilot-guide-card">
    <header class="pilot-guide-head">
      <span class="pilot-guide-icon" aria-hidden="true">✓</span>
      <div><p>Private pilot</p><h2>Testing guide</h2><small>${esc(restaurantName())} · ${esc(weekDisplayRange())}</small></div>
    </header>
    <div class="pilot-guide-grid">
      ${pilotGuideRows().map(row=>`<article><strong>${esc(row.label)}</strong><span>${esc(row.body)}</span></article>`).join('')}
    </div>
    <aside class="pilot-guide-note"><strong>Private pilot</strong><span>Please do not redistribute access, screenshots, files, or rebuild/copy the concept/design without permission.</span></aside>
    <footer class="pilot-guide-actions">
      <button type="button" class="rs-modal-btn secondary" data-pilot-open-terminal>Open badge terminal</button>
      <button type="button" class="rs-modal-btn primary" data-pilot-guide-close>Close</button>
    </footer>
  </section>`;
  if(dialog.open)dialog.close();
  dialog.showModal();
}

function render(){
  if(!data)return;
  applyRestaurantBrand();
  fillSelectors();
  const weekStartEl=$('weekStart');
  if(weekStartEl)weekStartEl.value=data.weekStart;
  const who=session.role==='owner'?'Manager':(emp(session.employeeId)?.name||'Employee');
  const userPillEl=$('userPill');
  if(userPillEl){
    userPillEl.textContent=who;
    userPillEl.setAttribute('aria-label',`Log out ${who} and return to login`);
  }
  updateAppTitle();
  updatePageMode();
  renderAppNav();
  if(document.body.classList.contains('employee-schedule-mode'))Restogogo.employeeSchedule?.render?.();
  if(document.body.classList.contains('planning-mode'))Restogogo.planning?.render?.();
  if(document.body.classList.contains('badge-terminal-mode'))Restogogo.badge?.render?.();
  if(document.body.classList.contains('actuals-mode'))Restogogo.actuals?.render?.();
  if(document.body.classList.contains('team-mode'))Restogogo.team?.render?.();
  if(document.body.classList.contains('restaurant-mode'))Restogogo.restaurant?.render?.();
  renderNotifications();
  requestAnimationFrame(updateStickyVars);
}

function changeWeek(delta){
  setWeekStartAndLoad(addDays(data.weekStart,delta));
  render();
}

function bind(){
  const on=(idValue,event,handler)=>{$(idValue)?.addEventListener(event,handler);};
  on('enterBtn','click',()=>void enterSelectedWorkspace());
  on('accessPin','keydown',e=>{if(e.key==='Enter')void enterSelectedWorkspace();});
  on('identityLoginName','keydown',e=>{if(e.key==='Enter')void enterSelectedWorkspace();});
  on('restaurantLoginSelect','change',e=>void changeLoginWorkspace(e.target.value));
  on('pilotGuideLoginBtn','click',showPilotGuide);
  on('userPill','click',()=>{window.DataAdapter.setLoggedIn(false); void showRestaurantLogin();});
  on('notifBtn','click',e=>{e.stopPropagation(); notifOpen=!notifOpen; renderNotifications();});
  document.addEventListener('click',event=>{
    const launch=event.target.closest('[data-launch-badge-terminal]');
    if(!launch)return;
    event.preventDefault();
    openBadgeTerminal();
  });
  $('appTopNav')?.addEventListener('click',event=>{
    const button=event.target.closest('[data-app-page]');
    if(!button)return;
    event.preventDefault();
    if(button.dataset.employeeView){
      Restogogo.employeeSchedule?.setView?.(button.dataset.employeeView);
      showPage(button.dataset.employeeView==='worked'?'employee-time':'employee-schedule');
      return;
    }
    showPage(button.dataset.appPage);
  });
  $('notifPanel')?.addEventListener('click',event=>{
    const markAll=event.target.closest('[data-notification-action="mark-all-read"]');
    if(markAll){event.preventDefault();markAllNotificationsRead();return;}
    const item=event.target.closest('[data-notification-key]');
    if(item){event.preventDefault();markNotificationRead(item.dataset.notificationKey);}
  });
  Restogogo.employeeSchedule?.bind?.();
  Restogogo.planning?.bind?.();
  Restogogo.badge?.bind?.();
  Restogogo.actuals?.bind?.();
  Restogogo.team?.bind?.();
  Restogogo.restaurant?.bind?.();
  document.addEventListener('click',e=>{if(!e.target.closest('.notif-wrap')){notifOpen=false; renderNotifications();}});
  window.addEventListener('resize',()=>requestAnimationFrame(updateStickyVars));
}

const appShellApi={render,changeWeek,saveWeekSnapshot,loadWeekSnapshot,openBadgeTerminal,showPilotGuide,showPage,enterApp,activePageName};
Restogogo.router=appShellApi;

async function initRestogogoApp(){
  notifRead=window.DataAdapter.readNotificationsRead();
  bind();
  const requested=requestedWorkspaceId();
  if(requested&&window.DataAdapter.setWorkspaceId)window.DataAdapter.setWorkspaceId(requested);
  if(window.DataAdapter.isLoggedIn()){
    await load();
    enterApp(true);
  } else {
    await showRestaurantLogin();
  }
  updateStickyVars();
}
