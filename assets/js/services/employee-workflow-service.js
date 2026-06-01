/* restogogo employee workflow service.
 * Single source of truth for employee self-service status, availability submission,
 * leave request and worked-time summaries. Employee pages and metric dialogs consume
 * this service instead of recalculating the same workflow state in each view.
 */
(function(){
  const R = window.Restogogo = window.Restogogo || {};
  R.services = R.services || {};

  const emptyDraft = Object.freeze({availabilityDraft:{}, leaveDraft:{}});

  function safeEmployee(employee){return employee || null;}
  function sourceOf(source){return source || window.data || {};}
  function actualLogic(){return R.logic?.actuals;}
  function absenceLogic(){return R.logic?.absences;}
  function dateObject(value){return value instanceof Date ? value : parseISO(value);}
  function dayNameForDate(date){const value=dateObject(date);return days[(value.getDay()+6)%7];}
  function dateValue(date){return localISO(dateObject(date));}
  function weekDateFor(source,dayName){return addDays(sourceOf(source)?.weekStart || data?.weekStart || localISO(new Date()), days.indexOf(dayName));}
  function draftKey(date,shift){return `${dateValue(date)}|${shift}`;}

  function payloadForDate(source,date){
    const src=sourceOf(source);
    const cleanDate=dateValue(date);
    const week=monday(cleanDate);
    const active=monday(src?.weekStart || new Date());
    if(week===active)return src;
    return src?.history?.[week] || null;
  }

  function isPlanned(employee,day,shift,source){
    const person=safeEmployee(employee);
    const src=sourceOf(source);
    return !!person && !!src?.planningSlots?.[person.id]?.[day]?.[shift]?.planned;
  }

  function plannedForDate(employee,date,shift,source){
    const payload=payloadForDate(source,date);
    return payload ? isPlanned(employee,dayNameForDate(date),shift,payload) : false;
  }

  function availabilityValue(employee, day, shift, source){
    const person=safeEmployee(employee);
    const src=sourceOf(source);
    return person ? src?.availability?.[person.id]?.[day]?.[shift] : undefined;
  }

  function isAvailable(employee,day,shift,source){
    const raw=availabilityValue(employee,day,shift,source);
    return raw === true || raw === 'available' || raw?.state === 'available';
  }

  function isAvailableForDate(employee,date,shift,source){
    const payload=payloadForDate(source,date);
    return payload ? isAvailable(employee,dayNameForDate(date),shift,payload) : false;
  }

  function blockingLeaveForDate(employee,date,shift,source,draftState=emptyDraft){
    const person=safeEmployee(employee);
    if(!person)return null;
    const key=draftKey(date,shift);
    if(draftState?.leaveDraft?.[key])return {status:'Pending', draft:true};
    return absenceLogic()?.primaryForDateShift?.(person,dateValue(date),shift,{statuses:['Approved','Pending'],source,requirePlanningEffect:true}) || null;
  }

  function effectiveAvailability(employee,date,shift,source,draftState=emptyDraft){
    if(blockingLeaveForDate(employee,date,shift,source,draftState))return false;
    const key=draftKey(date,shift);
    const draft=draftState?.availabilityDraft || {};
    if(Object.prototype.hasOwnProperty.call(draft,key))return !!draft[key];
    return isAvailableForDate(employee,date,shift,source);
  }

  function slotRange(employee,day,shift,source){
    const src=sourceOf(source);
    if(isPlanned(employee,day,shift,src))return R.logic?.planning?.rangeFor?.(employee,day,shift,src) || timeRangeFor(employee,day,shift,src);
    return timeRangeFor(employee,day,shift,src);
  }

  function rangeForDate(employee,date,shift,source){
    const payload=payloadForDate(source,date);
    const day=dayNameForDate(date);
    return payload ? (R.logic?.planning?.rangeFor?.(employee,day,shift,payload) || timeRangeFor(employee,day,shift,payload)) : '';
  }

  function actualEntryForDate(employee,date,shift,source){
    const payload=payloadForDate(source,date);
    const day=dayNameForDate(date);
    return payload ? (actualLogic()?.entry?.(employee.id,day,shift,payload) || getActualEntry(employee.id,day,shift,payload)) : normalizeActualEntry();
  }

  function weekStats(employee,source){
    const person=safeEmployee(employee);
    const src=sourceOf(source);
    if(!person)return {plannedHours:0,plannedSlots:0,availableSlots:0,workedHours:0,openBadges:0,workedDays:0};
    let plannedHours=0, plannedSlots=0, availableSlots=0, workedHours=0, openBadges=0, workedDays=0;
    days.forEach(day=>{
      let hasWork=false;
      shifts.forEach(shift=>{
        if(isPlanned(person,day,shift,src)){
          plannedSlots++;
          plannedHours += hoursFromRange(slotRange(person,day,shift,src));
        }
        if(isAvailable(person,day,shift,src) && !blockingLeaveForDate(person,weekDateFor(src,day),shift,src))availableSlots++;
        const entry=actualLogic()?.entry?.(person.id,day,shift,src) || getActualEntry(person.id,day,shift,src);
        if(entry.clockIn){
          hasWork=true;
          if(!entry.clockOut)openBadges++;
          workedHours += actualLogic()?.actualHoursFor?.(person,day,shift,src) || hoursFromRange(entry.clockIn && entry.clockOut ? `${entry.clockIn}-${entry.clockOut}` : '');
        }
      });
      if(hasWork)workedDays++;
    });
    return {plannedHours,plannedSlots,availableSlots,workedHours,openBadges,workedDays};
  }

  function monthStats(employee,source,dates=[],draftState=emptyDraft){
    const person=safeEmployee(employee);
    if(!person)return {availableSlots:0,workedHours:0,openBadges:0,workedDays:0,leavePending:0};
    let availableSlots=0, workedHours=0, openBadges=0, workedDays=0, leavePending=0;
    dates.forEach(date=>{
      let hasWork=false;
      shifts.forEach(shift=>{
        if(effectiveAvailability(person,date,shift,source,draftState))availableSlots++;
        const entry=actualEntryForDate(person,date,shift,source);
        if(entry.clockIn){
          hasWork=true;
          if(!entry.clockOut)openBadges++;
          workedHours += hoursFromRange(entry.clockIn && entry.clockOut ? `${entry.clockIn}-${entry.clockOut}` : '');
        }
        const cleanDate=dateValue(date);
        const absence=absenceForDate(person,cleanDate,shift,['Pending']);
        if(absence || !!draftState?.leaveDraft?.[`${cleanDate}|${shift}`])leavePending++;
      });
      if(hasWork)workedDays++;
    });
    return {availableSlots,workedHours,openBadges,workedDays,leavePending};
  }

  function draftCounts(draftState=emptyDraft){
    return {
      availability:Object.keys(draftState?.availabilityDraft || {}).length,
      leave:Object.keys(draftState?.leaveDraft || {}).length
    };
  }

  function availabilitySubmission(employee,source,draftState=emptyDraft){
    const person=safeEmployee(employee);
    const src=sourceOf(source);
    const counts=draftCounts(draftState);
    const slots=person ? weekStats(person,src).availableSlots : 0;
    const submitted=!!person && !!src?.submitted?.[person.id];
    if(counts.availability || counts.leave){
      const parts=[];
      if(counts.availability)parts.push(`${counts.availability} availability`);
      if(counts.leave)parts.push(`${counts.leave} leave`);
      return {state:'draft',tone:'warning',label:'Unsaved changes',value:String(counts.availability + counts.leave),detail:`${parts.join(' / ')} selected`,submitted,slots,draftCounts:counts};
    }
    if(submitted)return {state:'submitted',tone:'success',label:'Submitted',value:'Submitted',detail:`${slots} available slots`,submitted,slots,draftCounts:counts};
    if(slots)return {state:'started',tone:'warning',label:'Started',value:'Started',detail:`${slots} slots saved, not submitted`,submitted,slots,draftCounts:counts};
    return {state:'missing',tone:'danger',label:'Not submitted',value:'Missing',detail:'Add availability in My Time',submitted,slots,draftCounts:counts};
  }

  function leaveSummary(employee,draftState=emptyDraft){
    const person=safeEmployee(employee);
    const absences=Array.isArray(person?.absences) ? person.absences : [];
    const pending=absences.filter(absence=>absence.status==='Pending').length;
    const approved=absences.filter(absence=>absence.status==='Approved').length;
    const drafts=Object.keys(draftState?.leaveDraft || {}).length;
    return {pending,approved,drafts,totalPending:pending+drafts};
  }

  function holidayBalance(employee,draftLeaveDays=0){
    const person=safeEmployee(employee);
    const entitlement=Number(person?.annualLeaveEntitlementDays) || 0;
    let taken=0, pending=0;
    (person?.absences || []).forEach(absence=>{
      if(!absenceLogic()?.isHoliday?.(absence,sourceOf()))return;
      const amount=absenceLogic()?.effectiveDays?.(absence.shift || 'Full day',absence.start,absence.end,0) || 0;
      if(absence.status==='Approved')taken += amount;
      if(absence.status==='Pending')pending += amount;
    });
    pending += Number(draftLeaveDays) || 0;
    return {entitlement,taken,pending,remaining:Math.max(0,entitlement-taken)};
  }

  function nextShift(employee,source){
    const person=safeEmployee(employee);
    if(!person)return 'No shift planned';
    const todayIndex=(new Date().getDay()+6)%7;
    const ordered=days.map((day,index)=>({day,index})).sort((a,b)=>((a.index-todayIndex+7)%7)-((b.index-todayIndex+7)%7));
    for(const item of ordered){
      for(const shift of shifts){
        if(isPlanned(person,item.day,shift,source))return `${item.day.slice(0,3)} ${shift} · ${displayTimeRange(slotRange(person,item.day,shift,source))}`;
      }
    }
    return 'No shift planned';
  }

  function workflow(employee,options={}){
    const src=sourceOf(options.source);
    const draftState=options.draftState || emptyDraft;
    const dates=Array.isArray(options.monthDates) ? options.monthDates : [];
    const week=weekStats(employee,src);
    const month=monthStats(employee,src,dates,draftState);
    const submission=availabilitySubmission(employee,src,draftState);
    const leave=leaveSummary(employee,draftState);
    const balance=holidayBalance(employee,options.draftLeaveDays || 0);
    return {weekStats:week,monthStats:month,availabilitySubmission:submission,leaveSummary:leave,balance,nextShift:nextShift(employee,src)};
  }

  R.services.employeeWorkflow = {
    payloadForDate,
    dayNameForDate,
    isPlanned,
    plannedForDate,
    availabilityValue,
    isAvailable,
    isAvailableForDate,
    blockingLeaveForDate,
    effectiveAvailability,
    slotRange,
    rangeForDate,
    actualEntryForDate,
    weekStats,
    monthStats,
    availabilitySubmission,
    leaveSummary,
    holidayBalance,
    nextShift,
    workflow
  };
})();
