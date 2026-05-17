/** Planning module slice. Loaded in order by index.html. */
function planningFilterButton(label,value,current,kind){
  const selected=String(value)===String(current);
  return [
    `<button type="button" class="rs-picklist-option ${selected?'is-selected':''}"`,
    ` data-filter-kind="${esc(kind)}" data-filter-value="${esc(value)}"`,
    ` aria-pressed="${selected?'true':'false'}">`,
    `<span class="rs-picklist-option-label">${esc(label)}</span>`,
    selected?Restogogo.icons.checkmark():'',
    `</button>`
  ].join('');
}

function planningSearchControl(){
  return [
    `<label class="rs-control rs-search-control" aria-label="Search employees">`,
    `${Restogogo.icons.svg('search')}`,
    `<input value="${esc(planningSearch||'')}" placeholder="Search" data-planning-search="true">`,
    `</label>`
  ].join('');
}

function planningFilterMenu(info){
  const positions=planningPositionsForFilter(info.all);
  const currentRole=cleanPositionName(planningPositionFilter||'all');
  const employeeViews=[
    ['All employees','all'],
    ['Relevant employees','relevant'],
    ['Planned only','planned'],
    ['Available only','available'],
    ['Conflicts only','conflicts']
  ];
  const employeeOptions=employeeViews.map(([label,value])=>planningFilterButton(label,value,planningView||'all','employees')).join('');
  const roleOptions=[planningFilterButton('All roles','all',currentRole,'role')]
    .concat(positions.map(p=>planningFilterButton(p,p,currentRole,'role')))
    .join('');

  return [
    `<details class="rs-toolbar-picklist">`,
    `<summary class="rs-control-button" aria-label="Planning filters" title="Filters">${Restogogo.icons.svg('filter')}<span>Filters</span>${Restogogo.icons.svg('chevronDown')}</summary>`,
    `<div class="rs-picklist-menu rs-picklist-menu--toolbar rs-picklist-menu--anchored">`,
    `<div class="rs-picklist-group"><span class="rs-picklist-label">Employees</span><div class="rs-picklist-options">${employeeOptions}</div></div>`,
    `<div class="rs-picklist-group"><span class="rs-picklist-label">Role</span><div class="rs-picklist-options">${roleOptions}</div></div>`,
    `</div>`,
    `</details>`
  ].join('');
}


function planningActionsMenu(){
  const actions=[
    ['copy-previous-week','Copy previous week'],
    ['print','Print view'],
    ['export-csv','Export CSV']
  ].map(([action,label])=>`<button type="button" data-planning-action="${action}">${label}</button>`).join('');

  return [
    `<details class="rs-actions-menu">`,
    `<summary class="rs-control-button rs-icon-button" aria-label="Planning actions" title="Planning actions">${Restogogo.icons.svg('more')}</summary>`,
    `<div class="rs-actions-menu__panel">${actions}</div>`,
    `</details>`
  ].join('');
}

function planningGridToolbar(info){
  return [
    `<section class="planning-grid-toolbar rs-grid-toolbar" aria-label="Planning calendar controls">`,
    `<div class="rs-grid-toolbar__title"><strong>Employees</strong><span>${info.planned} planned / ${info.total} total</span></div>`,
    `<div class="rs-grid-toolbar__controls">`,
    planningSearchControl(),
    planningFilterMenu(info),
    planningActionsMenu(),
    `</div>`,
    `</section>`
  ].join('');
}

function planningConflictBanner(info){
  if(!info.conflictCount)return '';
  return `<section class="planning-conflict-banner" role="status"><strong>${info.conflictCount} conflict${info.conflictCount===1?'':'s'} found</strong><span>Some shifts are outside availability.</span></section>`;
}

function planningShortDay(day){
  return String(day || '').slice(0,3);
}

function planningCoverageIssueLabel(issue){
  const delta=Number(issue.delta || 0);
  const sign=delta>0?'+':'';
  const gap=delta<0?`${Math.abs(delta)} missing`:`${sign}${delta} extra`;
  return `${planningShortDay(issue.day)} ${issue.serviceKey} · ${issue.zoneName || 'Zone'} · ${issue.positionName || 'Role'} · ${gap}`;
}

function planningCoverageBanner(){
  const coverage=Restogogo.logic?.coverage;
  if(!coverage)return '';
  const summary=coverage.weekSummary(data);
  if(!summary.requirementCount){
    return `<section class="planning-coverage-banner is-missing" role="status"><div class="planning-coverage-banner__head"><span>${Restogogo.icons.status('warning',{label:'Coverage setup missing',className:'is-inline'})}</span><strong>Coverage setup missing</strong><em>Define expected staffing by zone, service and position in Restaurant setup.</em></div></section>`;
  }
  if(!summary.issueCount)return '';
  const visibleIssues=summary.issues.slice(0,8).map(issue=>{
    const tone=issue.status==='under'?'under':'over';
    const label=planningCoverageIssueLabel(issue);
    return `<button type="button" class="planning-coverage-chip is-${tone}" data-planning-coverage-day="${esc(issue.day)}" data-planning-coverage-shift="${esc(issue.serviceKey)}" title="${esc(label)}"><span>${Restogogo.icons.status(issue.status==='under'?'danger':'warning',{label:issue.status==='under'?'Under-covered':'Over-covered',className:'is-inline'})}</span><b>${esc(planningShortDay(issue.day))} ${esc(issue.serviceKey)}</b><em>${esc(issue.zoneName || 'Zone')}</em><strong>${esc(issue.positionName || 'Role')}</strong><i>${issue.delta<0?`-${Math.abs(issue.delta)}`:`+${issue.delta}`}</i></button>`;
  }).join('');
  const more=summary.issues.length>8?`<span class="planning-coverage-more">+${summary.issues.length-8} more</span>`:'';
  return `<section class="planning-coverage-banner" role="status"><div class="planning-coverage-banner__head"><span>${Restogogo.icons.status('warning',{label:'Coverage issues',className:'is-inline'})}</span><strong>${summary.issueCount} coverage issue${summary.issueCount===1?'':'s'}</strong><em>${summary.missingPeople} missing · ${summary.extraPeople} extra</em></div><div class="planning-coverage-list">${visibleIssues}${more}</div></section>`;
}


function planningDayHeader(d,di,totals){
  const selected=selectedPlanningDay===d?'col-selected':'';
  return Grid.dayHeader({
    moduleName:'planning',
    day:d,
    index:di,
    totals,
    headClass:'day-group',
    extraClass:selected,
    attributes:{
      'data-planning-action':'select-day',
      'data-day':d,
      title:`Select ${d}`,
      tabindex:'0',
      role:'button'
    }
  });
}

function planningTableHead(totals){
  return Grid.tableHead({
    moduleName:'planning',
    totals,
    dayHeaderRenderer:planningDayHeader,
    totalHeadHtml:`<div class="rs-weekly-total-head-copy"><span>WEEK</span><strong>${esc(fmtHours(totals.grand))}</strong></div>`
  });
}

function planningPersonCell(e,rowKey){
  return Grid.personCell({
    moduleName:'planning',
    employee:e,
    tag:'td',
    avatarStyle:planningAvatarStyle(e.position),
    leadingHtml:submissionIcon(e.id),
    attributes:{
      'data-planning-action':'select-row',
      'data-rowkey':rowKey,
      title:`Select ${e.name}`,
      tabindex:'0',
      role:'button'
    }
  });
}

function planningEmployeeDayCell(e,d,di){
  const selected=selectedPlanningDay===d?'col-selected':'';
  return Grid.dayCell({
    moduleName:'planning',
    day:d,
    index:di,
    extraClass:selected,
    content:shifts.map(sh=>planningSlotCard(e,d,sh)).join('')
  });
}

function planningEmployeeRow(e){
  const rowKey='emp:'+e.id;
  const selected=selectedPlanningRow===rowKey?'row-selected':'';
  return Grid.row({
    moduleName:'planning',
    employee:e,
    rowClass:selected,
    rowAttributes:{'data-rowkey':rowKey},
    personCellHtml:planningPersonCell(e,rowKey),
    dayCellRenderer:(d,di)=>planningEmployeeDayCell(e,d,di),
    totalCellHtml:Grid.totalCell({
      moduleName:'planning',
      content:`<strong>${esc(fmtHours(PlanningLogic.employeeWeekTotal(e)))}</strong>`
    })
  });
}

function planningEmptyRow(){
  return Grid.emptyRow({
    className:'planning-empty-row',
    content:`<div class="planning-empty-state rs-empty-state"><span class="rs-empty-state__icon">${Restogogo.icons.svg('search')}</span><strong>No employees found.</strong><span>Try another search term.</span><span class="rs-empty-state__actions"><button type="button" class="rs-empty-state__action" data-planning-action="clear-filters">Clear search</button></span></div>`
  });
}

function planningCalendar(){
  const info=planningVisibleEmployeeInfo();
  planningApplyMicroFeedback(info.conflictCount);
  const list=info.list;
  const totals=PlanningLogic.dayTotals(list);
  const rows=list.map(planningEmployeeRow).join('') || planningEmptyRow();
  return `${planningGridToolbar(info)}${planningConflictBanner(info)}${planningCoverageBanner()}<div class="rs-weekly-scroll"><table class="rs-weekly-table">${Grid.colgroup('planning')}${planningTableHead(totals)}<tbody>${rows}</tbody></table></div>`;
}
