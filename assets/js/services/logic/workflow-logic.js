/* Workflow policy: one source for editability across weekly operations. */
(function(){
  const R = window.Restogogo = window.Restogogo || {};
  R.logic = R.logic || {};

  function ok(){return {ok:true, reason:'editable', message:''};}
  function locked(reason, message){return {ok:false, reason, message};}
  function today(){return todayISO();}
  function currentWeekStart(){return monday(today());}
  function cleanDate(value){return validDate(value) || normalizeDateString(value) || '';}
  function weekStart(value){const date=cleanDate(value); return date ? monday(date) : '';}
  function activeWeekStart(source=data){return weekStart(source?.weekStart || today());}

  function weekStatus(source=data, value=source?.weekStart){
    const week=weekStart(value);
    if(!week)return 'Draft';
    const active=activeWeekStart(source);
    if(active && active===week)return normalizeStatus(source?.status);
    return normalizeStatus(source?.history?.[week]?.status);
  }

  function isPastWeek(value){
    const week=weekStart(value);
    return !!week && week < currentWeekStart();
  }

  function isPastDate(value){
    const date=cleanDate(value);
    return !!date && date < today();
  }

  function canChangePlanningStatus(source=data, value=source?.weekStart){
    const week=weekStart(value);
    if(!week)return locked('invalid-week','Select a valid week first.');
    if(isPastWeek(week))return locked('past-week','Past planning weeks are locked.');
    return ok();
  }

  function canEditPlanning(source=data, value=source?.weekStart){
    const statusCheck=canChangePlanningStatus(source,value);
    if(!statusCheck.ok)return statusCheck;
    if(weekStatus(source,value)==='Published')return locked('published-week','Revert this week to draft before editing.');
    return ok();
  }

  function canEditEmployeeTimeDate(value){
    const date=cleanDate(value);
    if(!date)return locked('invalid-date','Select a valid date first.');
    if(isPastDate(date))return locked('past-date','Past days are locked.');
    return ok();
  }

  function canEditAvailability(value, source=data){
    const dateCheck=canEditEmployeeTimeDate(value);
    if(!dateCheck.ok)return dateCheck;
    const week=weekStart(value);
    if(week && weekStatus(source, week)==='Published'){
      return locked('published-week','Availability is locked after the planning is published.');
    }
    return ok();
  }

  function canRecordBadge(source=data, value=today()){
    const targetWeek=weekStart(value);
    if(!targetWeek)return locked('invalid-date','Cannot resolve today for badging.');
    if(activeWeekStart(source)!==targetWeek)return locked('wrong-week','Badging records only on the current week.');
    return ok();
  }

  R.logic.workflow = {
    today,
    currentWeekStart,
    weekStart,
    activeWeekStart,
    weekStatus,
    isPastWeek,
    isPastDate,
    canChangePlanningStatus,
    canEditPlanning,
    canEditAvailability,
    canRequestLeave: canEditEmployeeTimeDate,
    canRecordBadge
  };
})();
