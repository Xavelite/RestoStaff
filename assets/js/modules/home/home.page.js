/* Manager Home page: compact operational cockpit. */
(function(){
  const Icons = Restogogo.icons;
  const HomeService = Restogogo.services.home;
  const Metrics = Restogogo.services.metrics;
  const ModuleHeader = Restogogo.services.moduleHeader;

  function icon(name){return Icons.svg(name);}

  function statusDot(tone='neutral', label=''){
    return `<span class="rs-status-dot is-${esc(tone)}" title="${esc(label)}" aria-label="${esc(label)}"></span>`;
  }

  function compactCount(value, singular, plural = `${singular}s`){
    const count = Number(value || 0);
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function coverageAffectedCount(model){
    const issues = model.actions.planningConflicts.filter(issue => issue.status === 'under');
    return new Set(issues.map(issue => `${issue.day || ''}|${issue.serviceKey || ''}`)).size || issues.length;
  }

  function actionRows(model){
    const affected = coverageAffectedCount(model);
    return [
      {iconName:'palm', label:'Leave approvals', count:model.actions.pendingAbsences.length, meta:'Pending requests', route:'team', tone:model.actions.pendingAbsences.length?'warning':'success'},
      {iconName:'payroll', label:'Missing payroll info', count:model.actions.missingPayroll.length, meta:'Employees', route:'team', tone:model.actions.missingPayroll.length?'warning':'success'},
      {iconName:'alert', label:'Planning conflicts', count:affected, meta:'Services affected', route:'planning', tone:affected?'danger':'success'},
      {iconName:'calendar', label:'Unsubmitted availability', count:model.actions.unsubmittedAvailability.length, meta:'Employees', route:'planning', tone:model.actions.unsubmittedAvailability.length?'warning':'success'}
    ];
  }

  function actionTotal(model){
    return actionRows(model).reduce((sum,row)=>sum + Number(row.count || 0),0);
  }

  function primaryActionRoute(model){
    return actionRows(model).find(row=>Number(row.count || 0)>0)?.route || 'planning';
  }

  function upcomingMeta(model){
    const next = model.today.upcoming[0];
    if(!next)return 'No upcoming shifts';
    return `${next.range || 'Next shift'} · ${next.name || 'Team'}`;
  }

  function topMetrics(model){
    const lateCount = model.today.late.length;
    const upcomingCount = model.today.upcoming.length;
    const totalActions = actionTotal(model);
    const coverage = model.week.coverage;
    const missingBadges = model.week.missingBadges.length;
    const cards = [
      {
        icon: lateCount ? 'alert' : 'check',
        tone: lateCount ? 'danger' : 'success',
        label: 'Today live',
        value: lateCount ? compactCount(lateCount,'late staff','late / no-show') : 'On track',
        meta: lateCount ? 'Needs attention now' : 'Team is running on time',
        detailKey: 'home.todayLive'
      },
      {
        icon: 'calendar',
        tone: upcomingCount ? 'info' : 'neutral',
        label: 'Upcoming today',
        value: upcomingCount ? compactCount(upcomingCount,'shift') : 'Clear',
        meta: upcomingMeta(model),
        detailKey: 'home.upcoming'
      },
      {
        icon: totalActions ? 'alert' : 'check',
        tone: totalActions ? 'warning' : 'success',
        label: 'Action required',
        value: totalActions ? String(totalActions) : 'Clear',
        meta: totalActions ? 'Items to review' : 'Nothing pending',
        detailKey: 'home.actions'
      },
      {
        icon: coverage.tone === 'success' ? 'check' : 'zone',
        tone: coverage.tone || 'neutral',
        label: 'Week pulse',
        value: coverage.label || 'Good',
        meta: missingBadges ? `${compactCount(missingBadges,'missing badge')}` : 'No badge issues',
        detailKey: 'home.weekPulse'
      }
    ];
    return cards.map(card => Metrics.card({
      className:`home-summary-metric${card.detailKey === 'home.todayLive' ? ' rs-metric--hero' : ''}`,
      detailKey:card.detailKey,
      tone:card.tone,
      icon:card.icon,
      label:card.label,
      value:card.value,
      meta:card.meta
    })).join('');
  }

  function liveRows(model){
    const lateRows = model.today.late.map(slot => ({slot, tone:'danger', status:slot.status || 'Late'}));
    const workingRows = model.today.working.map(slot => ({slot, tone:'success', status:slot.unplanned ? 'Unplanned live' : 'Working now'}));
    const upcomingRows = model.today.upcoming.map(slot => ({slot, tone:'neutral', status:'Upcoming'}));
    return [...lateRows, ...workingRows, ...upcomingRows]
      .sort((a,b) => (a.tone === 'danger' ? -1 : 0) - (b.tone === 'danger' ? -1 : 0) || a.slot.start - b.slot.start || a.slot.name.localeCompare(b.slot.name))
      .slice(0,9);
  }

  function avatar(name){
    const initial = String(name || 'E').trim().charAt(0).toUpperCase() || 'E';
    return `<span class="home-avatar rs-avatar">${esc(initial)}</span>`;
  }

  function currentUserFirstName(){
    const ctx = Restogogo.workspace?.current?.() || {};
    const employee = (data?.employees || []).find(item=>item.id === ctx.employeeId) || null;
    const quickEmployee = ctx.employee || null;
    const metadata = ctx.authUser?.user_metadata || {};
    const raw = employee?.firstName || quickEmployee?.first_name || metadata.first_name || metadata.name || ctx.authUser?.email || '';
    return String(raw || '').split(/[ .@]/).filter(Boolean)[0] || 'Manager';
  }

  function cardHead(iconName,title,meta='',tone=''){
    return `<header class="rs-card-head"><div class="rs-card-head-title">${Metrics.iconBadge(iconName,tone?`is-${tone}`:'')}<h2>${esc(title)}</h2></div>${meta?`<small>${meta}</small>`:''}</header>`;
  }

  function liveStat(iconName,value,label,tone='neutral'){
    return `<span class="home-live-stat is-${esc(tone)}">${Metrics.iconBadge(iconName,`is-${tone}`)}<b>${esc(String(value))}</b><small>${esc(label)}</small></span>`;
  }

  function liveEmpty(){
    return `<div class="home-live-empty">
      <span class="home-live-empty__icon" aria-hidden="true">${icon('cloche')}</span>
      <h3>All set for today!</h3>
      <p>Your team is ready to deliver great service.<br>We'll keep you updated if anything changes.</p>
    </div>`;
  }

  /* Compact day marker for the live monitor, without interrupting the page rhythm. */
  function dayProgress(){
    const DAY_START = 7 * 60;
    const DAY_END = 24 * 60;
    const DAY_RANGE = DAY_END - DAY_START;
    function pct(min){ return Math.max(0,Math.min(100,((min - DAY_START) / DAY_RANGE) * 100)).toFixed(2); }

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nowPct = pct(nowMin);
    const nowVisible = nowMin >= DAY_START && nowMin <= DAY_END;

    const timeLabel = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    return `<div class="home-day-progress rs-progress rs-progress--inline" aria-label="Current point in the restaurant day">
      <span class="rs-progress__label">Day progress</span>
      <span class="rs-progress__track" role="presentation">
        ${nowVisible ? `<span class="rs-progress__fill" style="--rs-progress-value:${nowPct}%"></span><span class="rs-progress__marker" style="--rs-progress-marker:${nowPct}%"></span>` : ''}
      </span>
      <span class="rs-progress__value">${esc(timeLabel)}</span>
    </div>`;
  }

  function todayLive(model){
    const rows = liveRows(model);
    const list = rows.length ? rows.map(({slot,tone,status}) => `<article class="home-live-row rs-list-row is-${esc(tone)}">
      ${avatar(slot.name)}
      <div class="home-live-person"><strong>${esc(slot.name || 'Employee')}</strong><small>${esc(slot.role || slot.zone || 'Team')}</small></div>
      <span class="home-live-time">${esc(slot.range || '')}</span>
      <span class="home-live-status">${statusDot(tone,status)}${esc(status)}</span>
    </article>`).join('') : liveEmpty();
    return `<section class="home-card home-live-card rs-card">
      ${cardHead('timer','Today live',`${statusDot('success','Live')} Live monitor`)}
      <div class="home-live-summary rs-card-body">
        ${liveStat('users',model.today.working.length,'Working','success')}
        ${liveStat('timer',model.today.late.length,'Late / no-show',model.today.late.length?'danger':'warning')}
        ${liveStat('calendar',model.today.upcoming.length,'Upcoming','neutral')}
      </div>
      ${dayProgress()}
      <div class="home-live-list rs-card-body">${list}</div>
      <footer class="rs-card-link"><button type="button" data-home-route="actuals">Open Actuals ${icon('chevronRight')}</button></footer>
    </section>`;
  }

  function actionRequired(model){
    const total = actionTotal(model);
    return `<section class="home-card home-actions-card rs-card">
      ${cardHead('alert','Action required',`${total} total`)}
      <div class="home-action-list rs-compact-list rs-card-body">
        ${actionRows(model).map(row=>`<button type="button" class="home-action-row rs-list-row is-${esc(row.tone)}" data-home-route="${esc(row.route)}">
          <span class="rs-list-icon">${icon(row.iconName)}</span>
          <div><strong>${esc(row.label)}</strong><small>${esc(row.meta)}</small></div>
          <b>${esc(String(row.count))}</b>
          ${icon('chevronRight')}
        </button>`).join('')}
      </div>
      <footer class="rs-card-link"><button type="button" data-home-route="${esc(primaryActionRoute(model))}">Review issues ${icon('chevronRight')}</button></footer>
    </section>`;
  }

  function weekPulse(model){
    const coverage = model.week.coverage;
    const rows = [
      {iconName:'clock',label:'Planned hours',value:fmtHours(model.week.plannedHours),meta:model.week.status,route:'planning'},
      {iconName:'badge',label:'Actual hours',value:fmtHours(model.week.actualHours),meta:'Badged so far',route:'actuals'},
      {iconName:'zone',label:'Coverage status',value:coverage.label,meta:coverage.detail,route:'planning',tone:coverage.tone},
      {iconName:'alert',label:'Missing badges',value:String(model.week.missingBadges.length),meta:model.week.missingBadges.length?'Planned missing':'No missing badges',route:'actuals',tone:model.week.missingBadges.length?'warning':'success'},
      {iconName:'check',label:'Planning status',value:model.week.status,meta:model.week.status === 'Published' ? 'Published' : 'Not published',route:'planning',tone:model.week.status === 'Published' ? 'success' : 'neutral'}
    ];
    return `<section class="home-card home-week-card rs-card">
      ${cardHead('variance','Week pulse',esc(model.weekLabel))}
      <div class="home-pulse-list rs-compact-list rs-card-body">
        ${rows.map(row=>`<button type="button" class="home-pulse-row rs-list-row is-${esc(row.tone || 'neutral')}" data-home-route="${esc(row.route)}">
          <span class="rs-list-icon">${icon(row.iconName)}</span><div><small>${esc(row.label)}</small><strong>${esc(row.value)}</strong></div><em>${esc(row.meta || '')}</em>
        </button>`).join('')}
      </div>
    </section>`;
  }


  function quickActions(){
    const items = [
      {label:'Plan week',iconName:'calendar',route:'planning',tone:'planning'},
      {label:'Add employee',iconName:'add',route:'team',tone:'team'},
      {label:'Add absence',iconName:'palm',route:'team',tone:'absence'},
      {label:'Badges',iconName:'badge',terminal:true,tone:'actuals'}
    ];
    return `<section class="home-card home-quick-card rs-card">
      ${cardHead('spark','Quick actions')}
      <div class="home-quick-grid rs-action-tile-grid rs-card-body">
        ${items.map(item=>`<button type="button" class="rs-action-tile is-${esc(item.tone || 'neutral')}" ${item.terminal?'data-home-terminal="1"':`data-home-route="${esc(item.route)}"`}><span>${icon(item.iconName)}</span><strong>${esc(item.label)}</strong></button>`).join('')}
      </div>
    </section>`;
  }


  function render(){
    const root = $('homeRoot');
    if(!root || !data)return;
    const model = HomeService.build(data);
    const lateCount = model.today.late.length;
    const totalActions = actionTotal(model);
    const urgencyClass = lateCount ? 'home-state-critical' : totalActions > 3 ? 'home-state-alert' : 'home-state-clear';
    root.innerHTML = Restogogo.services.pageShell.standard({
      moduleName:'home',
      title:'Home',
      shellClass:urgencyClass,
      headerHtml:ModuleHeader.content({
        moduleName:'home',
        title:`Welcome back, ${currentUserFirstName()}.`,
        subtitle:'Your homepage. What matters today, at a glance.'
      }),
      metricsClass:'home-metrics rs-metrics--hero-first',
      metricsAria:'Home summary',
      metricsHtml:topMetrics(model),
      boardClass:'home-board',
      boardAria:'Home cockpit',
      boardHtml:`<div class="home-cockpit-grid">
        ${todayLive(model)}
        ${actionRequired(model)}
        <aside class="home-side-stack">${weekPulse(model)}${quickActions()}</aside>
      </div>`
    });
    Restogogo.ui?.animateCounters?.(root, 260);
  }

  function bind(){
    const root = $('homeRoot');
    if(!root)return;
    root.addEventListener('click', event => {
      const terminal = event.target.closest('[data-home-terminal]');
      if(terminal){event.preventDefault(); Restogogo.shell?.openBadgeTerminal?.(); return;}
      const route = event.target.closest('[data-home-route]');
      if(route){event.preventDefault(); Restogogo.shell?.showPage?.(route.dataset.homeRoute);}
    });
  }

  Restogogo.home = {render, bind};
})();
