/* restogogo planning module — calendar view renderer. */
(function(){
  const P = Restogogo.planningModule;
  const PlanningLogic = Restogogo.logic.planning;
  const Grid = Restogogo.services.weeklyGrid;
  const Metrics = Restogogo.services.metrics;

  /* --- IIFE-local render helpers --- */

  function planningSearchControl(){
    return Restogogo.services.toolbar.searchControl({
      ariaLabel:'Search employees',
      value:P.state.search||'',
      data:{'data-planning-search':'true'}
    });
  }

  function planningFilterMenu(info){
    const positions=P.positionsForFilter(info.all);
    const currentRole=cleanPositionName(P.state.positionFilter||'all');
    const employeeViews=[
      ['All employees','all'],
      ['Relevant employees','relevant'],
      ['Planned only','planned'],
      ['Available only','available'],
      ['Conflicts only','conflicts']
    ];
    return Restogogo.services.toolbar.filterMenu({
      ariaLabel:'Planning filters',
      groups:[
        {
          label:'Employees',
          options:employeeViews.map(([label,value])=>({label,value,current:P.state.view||'all',kind:'employees',kindAttr:'data-filter-kind',valueAttr:'data-filter-value'}))
        },
        {
          label:'Role',
          options:[{label:'All roles',value:'all',current:currentRole,kind:'role',kindAttr:'data-filter-kind',valueAttr:'data-filter-value'}]
            .concat(positions.map(position=>({label:position,value:position,current:currentRole,kind:'role',kindAttr:'data-filter-kind',valueAttr:'data-filter-value'})))
        }
      ]
    });
  }

  function planningPublishButton(){
    const isPublished=data.status==='Published';
    const editability=P.statusEditability();
    const label=isPublished?'Revert to draft':'Publish planning';
    const tone=isPublished?'is-secondary':'is-primary';
    const icon=isPublished?'edit':'check';
    return `<button type="button" class="rs-action-button ${tone} planning-publish-action" data-planning-action="publish" aria-label="${esc(label)}" title="${esc(editability.message||label)}" ${editability.ok?'':'disabled'}>${Restogogo.icons.svg(icon)}<span>${esc(label)}</span></button>`;
  }

  function planningActionsMenu(){
    const editability=P.editability();
    return Restogogo.services.toolbar.actionMenu({
      ariaLabel:'Planning actions',
      title:'Planning actions',
      actionAttr:'data-planning-action',
      items:[
        {action:'copy-previous-week',label:'Copy previous week',disabled:!editability.ok,title:editability.message||'Copy previous week'},
        {action:'print',label:'Print view'},
        {action:'export-csv',label:'Export CSV'}
      ]
    });
  }

  function planningPresenceChips(){
    const rt      = window.Restogogo?.services?.realtime;
    const presence = rt?.getPresence?.() || {};
    // getPresence() already excludes self (keyed by session-key; self removed in service).
    // Each key is a unique session — no name-based dedup needed.
    // Show only users currently on the planning page for the same week.
    const weekStart = data?.weekStart || '';
    const others = Object.values(presence)
      .filter(p => p?.name && p.page === 'planning' && p.weekStart === weekStart);
    if(!others.length) return '';
    const chips = others.slice(0,5).map(p =>
      `<span class="rs-presence-chip" title="${esc(p.name)} · ${esc(p.role||'')}">` +
      `${esc(String(p.name||'?').trim().charAt(0).toUpperCase())}</span>`
    ).join('');
    const label = others.length === 1
      ? `${esc(others[0].name)} is also editing this week`
      : `${others.length} others editing this week`;
    return `<div class="rs-presence-bar" aria-label="${label}" title="${label}">${chips}</div>`;
  }

  function planningGridToolbar(info){
    return Restogogo.services.toolbar.gridToolbar({
      tag:'section',
      className:'rs-weekly-toolbar planning-grid-toolbar',
      ariaLabel:'Planning calendar controls',
      leading:[planningSearchControl(),planningFilterMenu(info)],
      center:Metrics.periodSelector({
        id:'planningWeekMetric',
        ariaLabel:'Change planning week',
        prevId:'prevWeek',
        nextId:'nextWeek',
        inputId:'weekStart',
        inputAriaLabel:'Select planning week',
        valueId:'planningWeekLabel',
        label:'Week',
        value:weekDisplayRange(),
        inputValue:data.weekStart
      }),
      actions:[planningPresenceChips(),planningPublishButton(),planningActionsMenu()]
    });
  }

  /* Triggered by the planning page's onPresenceSync listener — kept on P so
   * planning.page.js can call it without duplicating the chip-render logic. */
  P.renderPresenceChips = function renderPresenceChips(){
    const toolbar = document.querySelector('.planning-grid-toolbar');
    if(!toolbar) return;
    const existing = toolbar.querySelector('.rs-presence-bar');
    const next = planningPresenceChips();
    if(next){
      if(existing){ existing.outerHTML = next; }
      else{
        const actionsArea = toolbar.querySelector('.rs-grid-toolbar__actions');
        if(actionsArea) actionsArea.insertAdjacentHTML('afterbegin', next);
      }
    } else if(existing){
      existing.remove();
    }
  };

  function planningLegend(){
    return Grid.legend({
      ariaLabel:'Planning legend',
      items:[
        {className:'is-planned',label:'Scheduled shift'},
        {className:'is-available',label:'Available'},
        {className:'is-unavailable',label:'Unavailable'},
        {className:'is-absence',label:'Leave / absence'},
        {className:'is-conflict',label:'Coverage conflict'}
      ]
    });
  }

  function planningTodayIndex(){
    if(!data||!data.weekStart)return -1;
    const offset=Math.round((parseISO(todayISO())-parseISO(data.weekStart))/86400000);
    return (offset>=0&&offset<=6)?offset:-1;
  }

  function planningDayHeader(d,di,totals){
    const selected=P.state.selectedDay===d?'col-selected':'';
    const isToday=planningTodayIndex()===di?'is-today':'';
    const dayTotals=totals.dayTotals||{};
    const dayPeople=totals.dayPeople||{};
    const people=dayPeople[d] instanceof Set ? dayPeople[d].size : Number(dayPeople[d]||0);
    const classes=['day-group','rs-weekly-day-head',Grid.dayTone(di),selected,isToday].filter(Boolean).join(' ');
    return `<th class="${esc(classes)}" data-planning-action="select-day" data-day="${esc(d)}" title="${esc(`Select ${d}`)}" tabindex="0" role="button"><div class="rs-weekly-day-head-copy"><strong>${esc(d.slice(0,3))}</strong><span>${esc(shortDisplayDate(dateForDay(d)))}</span><small>${esc(fmtHours(dayTotals[d]||0))} · ${esc(fmtPeople(people))}</small></div></th>`;
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
      tag:'th',
      avatarStyle:positionStyle(employeePositionName(e)),
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
    const selected=P.state.selectedDay===d?'col-selected':'';
    const isToday=planningTodayIndex()===di?'is-today':'';
    return Grid.dayCell({
      moduleName:'planning',
      day:d,
      index:di,
      extraClass:[selected,isToday].filter(Boolean).join(' '),
      content:shifts.map(sh=>P.slotCard(e,d,sh)).join('')
    });
  }

  function planningEmployeeRow(e){
    const rowKey='emp:'+e.id;
    const selected=P.state.selectedRow===rowKey?'row-selected':'';
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

  P.calendar = function calendar(){
    const info=P.visibleEmployeeInfo();
    const list=info.list;
    const totals=PlanningLogic.dayTotals(list);
    const rows=list.map(planningEmployeeRow).join('')||planningEmptyRow();
    return `${planningGridToolbar(info)}<div class="rs-workspace-body rs-weekly-body"><div class="rs-weekly-scroll"><table class="rs-weekly-table">${Grid.colgroup('planning')}${planningTableHead(totals)}<tbody>${rows}</tbody></table></div>${planningLegend()}</div>`;
  };
})();
