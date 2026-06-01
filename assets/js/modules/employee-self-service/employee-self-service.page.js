/** Employee self-service page binding and public API. Loaded after employee-self-service.actions.js. */
(function(){
  const ESS = Restogogo.employeeSelfServiceModule = Restogogo.employeeSelfServiceModule || {};

  ESS.handleSelfServiceClick = function handleSelfServiceClick(page,event){
    const mode=event.target.closest('[data-employee-self-service-mode]');
    if(mode&&page.contains(mode)){
      ESS.state.draftMode=mode.dataset.employeeSelfServiceMode === 'leave' ? 'leave' : 'availability';
      ESS.render();
      return true;
    }
    if(event.target.closest('[data-employee-self-service-cancel]')){
      ESS.cancelSelfServiceDrafts();
      return true;
    }
    if(event.target.closest('[data-employee-self-service-save]')){
      ESS.saveSelfServiceDrafts();
      return true;
    }
    const slot=event.target.closest('[data-employee-self-service-slot]');
    if(slot&&page.contains(slot)){
      ESS.handleSelfServiceSlotClick(slot.dataset.date,slot.dataset.shift);
      return true;
    }
    return false;
  };

  ESS.handleSelfServiceKey = function handleSelfServiceKey(page,event){
    const slot=event.target.closest?.('[data-employee-self-service-slot]');
    if(slot&&page.contains(slot)){
      ESS.handleSelfServiceSlotKey(event,slot.dataset.date,slot.dataset.shift);
      return true;
    }
    return false;
  };

  ESS.bindSchedulePage = function bindSchedulePage(){
    const page=$('page-employee-schedule');
    page?.addEventListener('click',event=>{
      if(event.target.closest('#employeeSchedulePrevWeek')){
        event.stopPropagation();
        ESS.changeScheduleWeek(-7);
        return;
      }
      if(event.target.closest('#employeeScheduleNextWeek')){
        event.stopPropagation();
        ESS.changeScheduleWeek(7);
        return;
      }
      if(event.target.closest('#employeeScheduleWeekMetric')){
        if(!event.target.closest('button,input'))ESS.openPicker('employeeScheduleWeekStart');
        return;
      }
      if(ESS.handleSelfServiceClick(page,event))return;
    });

    page?.addEventListener('change',event=>{
      if(event.target?.id==='employeeScheduleWeekStart')ESS.setWeek(event.target.value);
    });

    page?.addEventListener('keydown',event=>{
      if(event.target.closest?.('#employeeScheduleWeekMetric')){
        if(event.target.closest('button,input'))return;
        if(event.key==='Enter'||event.key===' '){event.preventDefault();ESS.openPicker('employeeScheduleWeekStart');return;}
      }
      ESS.handleSelfServiceKey(page,event);
    });
  };

  ESS.bindTimePage = function bindTimePage(){
    const page=$('page-employee-time');
    page?.addEventListener('click',event=>{
      if(event.target.closest('#employeeTimePrevMonth')){event.stopPropagation();ESS.changeWorkedMonth(-1);return;}
      if(event.target.closest('#employeeTimeNextMonth')){event.stopPropagation();ESS.changeWorkedMonth(1);return;}
      if(event.target.closest('#employeeTimeWeekMetric')){
        if(!event.target.closest('button,input'))ESS.openPicker('employeeTimeMonthStart');
        return;
      }
      ESS.handleSelfServiceClick(page,event);
    });
    page?.addEventListener('change',event=>{if(event.target?.id==='employeeTimeMonthStart')ESS.setWeek(event.target.value);});
    page?.addEventListener('keydown',event=>{
      if(event.target.closest?.('#employeeTimeWeekMetric')){
        if(event.target.closest('button,input'))return;
        if(event.key==='Enter'||event.key===' '){event.preventDefault();ESS.openPicker('employeeTimeMonthStart');return;}
      }
      ESS.handleSelfServiceKey(page,event);
    });
  };

  ESS.bind = function bind(){
    if(ESS.state.bound)return;
    ESS.state.bound=true;
    ESS.bindSchedulePage();
    ESS.bindTimePage();
  };

  Restogogo['employee-self-service']={
    render: ESS.render,
    bind: ESS.bind,
    openPicker: ESS.openPicker,
    changeScheduleWeek: ESS.changeScheduleWeek,
    changeWorkedMonth: ESS.changeWorkedMonth,
    setWeek: ESS.setWeek
  };
})();
