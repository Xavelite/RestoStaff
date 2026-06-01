/* restogogo planning module — shell builder, event binding and public API. */
(function(){
  const P = Restogogo.planningModule;
  let bound = false;

  function ensurePlanningShell(){
    const root=$('planningRoot');
    if(!root)return false;
    if($('planningHeader')&&$('planningMetrics')&&$('planningBoard'))return true;
    root.innerHTML=Restogogo.services.pageShell.standard({
      moduleName:'planning',
      title:'Planning',
      metricsClass:'rs-metrics--hero-first',
      boardClass:'rs-weekly-board',
      metricsAria:'Planning summary',
      boardAria:'Planning board'
    });
    return true;
  }

  function renderPlanningHeader(){
    const root=$('planningHeader');
    if(!root)return;
    root.className='planning-page-head rs-module-header rs-module-header--planning';
    root.innerHTML=Restogogo.services.moduleHeader.content({
      moduleName:'planning',
      title:'Planning',
      subtitle:'Orchestrate your week. Build and publish the schedule.'
    });
  }

  function planningHandleCalendarAction(target,event){
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const setupNav=target.dataset.setupNav;
    if(setupNav){Restogogo.shell?.showPage?.(setupNav);return;}
    const action=target.dataset.planningAction;
    if(action==='clear-filters')return P.clearFilters();
    if(action==='toggle-slot')return P.toggleSlot(target.dataset.employeeId,target.dataset.day,target.dataset.shift);
    if(action==='select-day')return P.selectDay(target.dataset.day);
    if(action==='select-row')return P.selectRow(target.dataset.rowkey);
    if(action==='publish')return P.togglePublish();
    if(action==='copy-previous-week')return P.copyPreviousWeek();
    if(action==='print')return window.print();
    if(action==='export-csv')return P.exportCsv();
    if(action==='reload-from-realtime'){
      planningHideUpdateBanner();
      // Snapshot filter/search state so the user's board config survives the reload.
      const savedState = Object.assign({}, P.state);
      return void Restogogo.stateService.load().then(()=>{
        Object.assign(P.state, savedState);
        Restogogo.shell.render();
      });
    }
    if(action==='dismiss-realtime-banner')return planningHideUpdateBanner();
  }

  /* ── Realtime: update banner ──────────────────────────────────────────── */

  function planningShowUpdateBanner(actorName, weekStart){
    // Only surface if the changed week is the one currently on screen.
    if(weekStart && weekStart !== data?.weekStart) return;
    let banner = document.getElementById('planningRealtimeBanner');
    if(!banner){
      banner = document.createElement('div');
      banner.id = 'planningRealtimeBanner';
      banner.className = 'rs-realtime-banner';
      // Insert directly before planningBoard so it sits as a full-width row
      // above the calendar — not as a flex child of planningRoot.
      const board = $('planningBoard');
      if(board) board.insertAdjacentElement('beforebegin', banner);
    }
    const name = String(actorName || 'Another manager');
    banner.innerHTML =
      `<span class="rs-realtime-banner__msg">Planning updated by <strong>${esc(name)}</strong></span>` +
      `<button class="rs-realtime-banner__btn rs-action-button is-compact" data-planning-action="reload-from-realtime">Reload</button>` +
      `<button class="rs-realtime-banner__dismiss" data-planning-action="dismiss-realtime-banner" aria-label="Dismiss">×</button>`;
    banner.hidden = false;
  }

  function planningHideUpdateBanner(){
    const b = document.getElementById('planningRealtimeBanner');
    if(b) b.hidden = true;
  }

  function planningRender(){
    ensurePlanningShell();
    renderPlanningHeader();
    P.renderMetrics();
    const el=$('planningBoard');
    if(el) el.innerHTML=P.calendar();
  }

  function planningBind(){
    if(bound)return;
    bound=true;
    ensurePlanningShell();

    const page=$('page-planning');
    /* Banner action buttons live outside planningBoard so the calendar listener
       cannot catch them. Handle them here at page level first. */
    page?.addEventListener('click',event=>{
      const bannerBtn = event.target.closest('[data-planning-action="reload-from-realtime"],[data-planning-action="dismiss-realtime-banner"]');
      if(bannerBtn){ event.preventDefault(); event.stopPropagation(); planningHandleCalendarAction(bannerBtn, event); }
    }, true);
    /* Week-nav clicks (#prevWeek, #nextWeek, #planningWeekMetric) are caught and
       stopped by the calendar listener on #planningBoard — they never reach this
       page listener. The page listener only handles events that bubble past the board. */
    page?.addEventListener('change',event=>{
      if(event.target?.id==='weekStart')P.setWeek(event.target.value);
    });
    page?.addEventListener('keydown',event=>{
      if(event.target.closest?.('#planningWeekMetric')&&(event.key==='Enter'||event.key===' ')){
        event.preventDefault();
        P.openWeekPicker(event);
      }
    });

    const calendar=$('planningBoard');
    calendar?.addEventListener('input',event=>{
      const input=event.target.closest('[data-planning-search]');
      if(input&&calendar.contains(input))P.setSearch(input.value,input.selectionStart);
    });
    calendar?.addEventListener('keydown',event=>{
      if(event.target.closest('[data-planning-search]')&&event.key==='Enter'){event.preventDefault();event.target.blur();return;}
      const editTarget=event.target.closest('[data-planning-slot-edit]');
      if(editTarget&&calendar.contains(editTarget)&&(event.key==='ContextMenu'||(event.key==='F10'&&event.shiftKey))){
        event.preventDefault();
        P.openSlotEditMenu({employeeId:editTarget.dataset.employeeId,day:editTarget.dataset.day,shift:editTarget.dataset.shift,key:editTarget.dataset.planningSlotKey});
        return;
      }
      const setupTarget=event.target.closest('[data-setup-nav]');
      const actionTarget=event.target.closest('[data-planning-action]');
      const target=setupTarget||actionTarget;
      if(target&&calendar.contains(target)&&(event.key==='Enter'||event.key===' ')){
        event.preventDefault();
        planningHandleCalendarAction(target,event);
      }
    });

    calendar?.addEventListener('contextmenu',event=>{
      const absenceTarget=event.target.closest('[data-calendar-absence]');
      if(absenceTarget&&calendar.contains(absenceTarget)){
        event.preventDefault();
        event.stopPropagation();
        const absence=absenceForDayShift(absenceTarget.dataset.employeeId,absenceTarget.dataset.day,absenceTarget.dataset.shift,['Approved','Pending']);
        if(absence)Restogogo.services.calendarActions.showAbsenceContextMenu(event,{employeeId:absenceTarget.dataset.employeeId,absence,source:'planning',render(){Restogogo.shell.render();}});
        return;
      }
      const editTarget=event.target.closest('[data-planning-slot-edit]');
      if(!editTarget||!calendar.contains(editTarget))return;
      event.preventDefault();
      event.stopPropagation();
      P.openSlotEditMenu({
        employeeId:editTarget.dataset.employeeId,
        day:editTarget.dataset.day,
        shift:editTarget.dataset.shift,
        key:editTarget.dataset.planningSlotKey
      });
    });
    calendar?.addEventListener('click',event=>{
      if(event.target.closest('#prevWeek')){event.preventDefault();event.stopPropagation();P.changeWeek(-7);return;}
      if(event.target.closest('#nextWeek')){event.preventDefault();event.stopPropagation();P.changeWeek(7);return;}
      if(event.target.closest('#planningWeekMetric')){event.stopPropagation();P.openWeekPicker(event);return;}
      if(event.target.closest('.planning-slot-edit-menu,.planning-zone-menu'))return;
      const setupTarget=event.target.closest('[data-setup-nav]');
      if(setupTarget&&calendar.contains(setupTarget))return planningHandleCalendarAction(setupTarget,event);
      const actionTarget=event.target.closest('[data-planning-action]');
      if(actionTarget&&calendar.contains(actionTarget))planningHandleCalendarAction(actionTarget,event);
    });
    document.addEventListener('click',P.handleDocumentClick,true);
    document.addEventListener('keydown',P.handleDocumentKeydown);
    // Register realtime listeners once at bind time.
    window.Restogogo?.services?.realtime?.onPlanningUpdate?.(payload => {
      if(Restogogo.registry.activePage() !== 'planning') return;
      planningShowUpdateBanner(payload?.actor, payload?.weekStart);
    });
    // Refresh presence chips when the server confirms a presence state change.
    // Using onPresenceSync keeps the dependency direction correct: realtime service
    // dispatches an event; the planning module decides how to react.
    window.Restogogo?.services?.realtime?.onPresenceSync?.(() => {
      if(Restogogo.registry.activePage() === 'planning') P.renderPresenceChips?.();
    });
  }

  Restogogo.planning = {
    bind:      planningBind,
    render:    planningRender,
    conflicts: P.conflicts,
    toggleSlot:P.toggleSlot
  };
})();
