/** Employee self-service state and domain helpers. Loaded before view/actions/page. */
(function(){
  const ESS = Restogogo.employeeSelfServiceModule = Restogogo.employeeSelfServiceModule || {};

  ESS.state = ESS.state || {
    bound: false,
    draftMode: 'availability',
    leaveDraft: {},
    availabilityDraft: {}
  };

  ESS.A = () => Restogogo.logic?.actuals;

  ESS.currentEmployee = function currentEmployee(){
    const employeeId = String(session.employeeId || '').trim();
    if(!employeeId)return null;
    const employee = emp(employeeId);
    return employee?.active !== false ? employee : null;
  };

  ESS.isSlotPlanned = function isSlotPlanned(employee, day, shift){
    return Restogogo.services?.employeeWorkflow?.isPlanned?.(employee,day,shift,data) || false;
  };

  ESS.isSlotAvailable = function isSlotAvailable(employee, day, shift){
    return Restogogo.services?.employeeWorkflow?.isAvailable?.(employee,day,shift,data) || false;
  };

  ESS.availabilityEditability = function availabilityEditability(dateValue){
    return Restogogo.logic?.workflow?.canEditAvailability?.(dateValue, data) || {ok:true, reason:'editable', message:''};
  };

  ESS.leaveEditability = function leaveEditability(dateValue){
    return Restogogo.logic?.workflow?.canRequestLeave?.(dateValue, data) || {ok:true, reason:'editable', message:''};
  };

  ESS.currentModeEditability = function currentModeEditability(dateValue){
    return ESS.state.draftMode === 'leave' ? ESS.leaveEditability(dateValue) : ESS.availabilityEditability(dateValue);
  };

  ESS.canEditSelfServiceDate = function canEditSelfServiceDate(dateValue){
    return ESS.currentModeEditability(dateValue).ok;
  };

  ESS.absenceTypes = function absenceTypes(){
    return Restogogo.logic?.absences?.activeTypes?.(data) || [];
  };

  ESS.isHolidayAbsenceType = function isHolidayAbsenceType(type){
    return Restogogo.logic?.absences?.isHolidayType?.(type) || false;
  };

  ESS.defaultAbsenceType = function defaultAbsenceType(){
    return Restogogo.logic?.absences?.defaultType?.(data) || {id:'holiday',name:'Holiday'};
  };

  ESS.defaultAbsenceTypeId = function defaultAbsenceTypeId(){
    return Restogogo.logic?.absences?.defaultTypeId?.(data) || 'holiday';
  };

  ESS.defaultAbsenceLabel = function defaultAbsenceLabel(){
    return Restogogo.logic?.absences?.defaultLabel?.(data) || 'Holiday';
  };


  ESS.defaultAbsenceDraft = function defaultAbsenceDraft(){
    return {absenceTypeId: ESS.defaultAbsenceTypeId(), reason: ESS.defaultAbsenceLabel(), status:'Pending'};
  };

  ESS.defaultAbsenceIconMarkup = function defaultAbsenceIconMarkup(className=''){
    return Restogogo.logic?.absences?.iconMarkup?.(ESS.defaultAbsenceDraft(), className, data) || '';
  };

  ESS.isHolidayAbsence = function isHolidayAbsence(absence){
    return Restogogo.logic?.absences?.isHoliday?.(absence,data) || false;
  };

  ESS.absenceCoversSlot = function absenceCoversSlot(absence, date, shift){
    return Restogogo.logic?.absences?.coversDateShift?.(absence,date,shift) || false;
  };

  ESS.absenceOverlapsRange = function absenceOverlapsRange(absence,start,end,shift){
    return Restogogo.logic?.absences?.overlapsRange?.(absence,start,end,shift) || false;
  };

  ESS.absencePriority = function absencePriority(status){
    return Restogogo.logic?.absences?.statusRank?.(status,'planning') ?? 9;
  };

  ESS.absencesForSlot = function absencesForSlot(employee, day, shift){
    return Restogogo.logic?.absences?.forDateShift?.(employee,dateForDay(day),shift,{statuses:[],source:data,requirePlanningEffect:false,order:'planning',startOrder:'desc'}) || [];
  };

  ESS.visibleAbsenceForSlot = function visibleAbsenceForSlot(employee, day, shift){
    return ESS.absencesForSlot(employee,day,shift).find(absence=>['Approved','Pending'].includes(absence.status)) || null;
  };

  ESS.dateObject = function dateObject(value){
    return value instanceof Date ? value : parseISO(value);
  };

  ESS.dayNameForDate = function dayNameForDate(date){
    const value=ESS.dateObject(date);
    return days[(value.getDay()+6)%7];
  };

  ESS.weekPayloadForDate = function weekPayloadForDate(date){
    return Restogogo.services?.employeeWorkflow?.payloadForDate?.(data,date) || null;
  };

  ESS.isAvailableForDate = function isAvailableForDate(employee, date, shift){
    return Restogogo.services?.employeeWorkflow?.isAvailableForDate?.(employee,date,shift,data) || false;
  };

  ESS.availabilityDraftKey = function availabilityDraftKey(dateValue,shift){
    return `${dateValue}|${shift}`;
  };

  ESS.hasAvailabilityDrafts = function hasAvailabilityDrafts(){
    return Object.keys(ESS.state.availabilityDraft || {}).length > 0;
  };

  ESS.leaveDraftKey = function leaveDraftKey(dateValue,shift){
    return `${dateValue}|${shift}`;
  };

  ESS.hasLeaveDrafts = function hasLeaveDrafts(){
    return Object.keys(ESS.state.leaveDraft || {}).length > 0;
  };

  ESS.hasSelfServiceDrafts = function hasSelfServiceDrafts(){
    return ESS.hasAvailabilityDrafts() || ESS.hasLeaveDrafts();
  };

  ESS.firstBlockedDraft = function firstBlockedDraft(){
    for(const key of Object.keys(ESS.state.availabilityDraft || {})){
      const dateValue=key.split('|')[0];
      const check=ESS.availabilityEditability(dateValue);
      if(!check.ok)return check;
    }
    for(const key of Object.keys(ESS.state.leaveDraft || {})){
      const dateValue=key.split('|')[0];
      const check=ESS.leaveEditability(dateValue);
      if(!check.ok)return check;
    }
    return null;
  };

  ESS.isLeaveDrafted = function isLeaveDrafted(dateValue,shift){
    return !!ESS.state.leaveDraft?.[ESS.leaveDraftKey(dateValue,shift)];
  };

  ESS.effectiveAvailabilityForDate = function effectiveAvailabilityForDate(employee,date,shift){
    return Restogogo.services?.employeeWorkflow?.effectiveAvailability?.(employee,date,shift,data,{availabilityDraft:ESS.state.availabilityDraft, leaveDraft:ESS.state.leaveDraft}) || false;
  };

  ESS.writableWeekPayload = function writableWeekPayload(dateValue){
    const week=monday(dateValue);
    if(week===monday(data?.weekStart || new Date()))return data;
    data.history = data.history && typeof data.history === 'object' ? data.history : {};
    data.history[week] = data.history[week] || emptyWeeklyPayload();
    return data.history[week];
  };

  ESS.durationDays = function durationDays(start,end){
    return Restogogo.logic?.absences?.rangeDays?.(start,end,0) || 0;
  };

  ESS.absenceDurationDays = function absenceDurationDays(shift,start,end){
    return Restogogo.logic?.absences?.effectiveDays?.(shift,start,end,0) || 0;
  };

  ESS.durationHours = function durationHours(shift,start,end){
    return Restogogo.logic?.absences?.effectiveHours?.(shift,start,end) || 0;
  };

  ESS.selectedLeaveDraftItems = function selectedLeaveDraftItems(){
    const byDate=new Map();
    Object.keys(ESS.state.leaveDraft || {}).forEach(key=>{
      const [dateValue,shift]=key.split('|');
      const date=normalizeDateString(dateValue);
      if(!date || !shifts.includes(shift))return;
      const set=byDate.get(date) || new Set();
      set.add(shift);
      byDate.set(date,set);
    });
    return Array.from(byDate.entries()).map(([date,set])=>({
      date,
      shift:set.has('Lunch') && set.has('Evening') ? 'Full day' : (set.has('Lunch') ? 'Lunch' : 'Evening')
    })).sort((a,b)=>a.date.localeCompare(b.date));
  };

  ESS.groupedLeaveDrafts = function groupedLeaveDrafts(){
    return ESS.selectedLeaveDraftItems().reduce((groups,item)=>{
      const last=groups[groups.length-1];
      if(last && last.shift===item.shift && addDays(last.end,1)===item.date){
        last.end=item.date;
      }else{
        groups.push({start:item.date,end:item.date,shift:item.shift});
      }
      return groups;
    },[]);
  };

  ESS.draftLeaveDays = function draftLeaveDays(){
    return ESS.groupedLeaveDrafts().reduce((sum,group)=>sum+ESS.absenceDurationDays(group.shift,group.start,group.end),0);
  };

  ESS.formatDayCount = function formatDayCount(value){
    const n=Math.max(0,Math.round((Number(value)||0)*10)/10);
    return Number.isInteger(n) ? String(n) : String(n).replace(/\.0$/,'');
  };

  ESS.employeeWorkflow = function employeeWorkflow(employee){
    return Restogogo.services?.employeeWorkflow?.workflow?.(employee,{
      source:data,
      monthDates:ESS.monthDates(),
      draftState:{availabilityDraft:ESS.state.availabilityDraft, leaveDraft:ESS.state.leaveDraft},
      draftLeaveDays:ESS.draftLeaveDays()
    }) || {
      weekStats:{plannedHours:0,plannedSlots:0,availableSlots:0,workedHours:0,openBadges:0,workedDays:0},
      monthStats:{availableSlots:0,workedHours:0,openBadges:0,workedDays:0,leavePending:0},
      availabilitySubmission:{state:'missing',tone:'danger',label:'Not submitted',value:'Missing',detail:'Add availability in My Time',draftCounts:{availability:0,leave:0}},
      leaveSummary:{pending:0,approved:0,drafts:0,totalPending:0},
      balance:{entitlement:0,taken:0,pending:0,remaining:0},
      nextShift:'No shift planned'
    };
  };

  ESS.holidayBalance = function holidayBalance(employee){
    return Restogogo.services?.employeeWorkflow?.holidayBalance?.(employee,ESS.draftLeaveDays()) || {entitlement:0,taken:0,pending:0,remaining:0};
  };

  ESS.plannedZone = function plannedZone(employee, day, shift){
    return assignmentZoneName(employee.id,day,shift) || suggestZone(employee,shift) || 'Unassigned';
  };

  ESS.slotRange = function slotRange(employee, day, shift){
    return Restogogo.services?.employeeWorkflow?.slotRange?.(employee,day,shift,data) || timeRangeFor(employee,day,shift);
  };

  ESS.employeeWeekStats = function employeeWeekStats(employee){
    return Restogogo.services?.employeeWorkflow?.weekStats?.(employee,data) || {plannedHours:0, plannedSlots:0, availableSlots:0, workedHours:0, openBadges:0, workedDays:0};
  };

  ESS.employeeMonthStats = function employeeMonthStats(employee){
    return Restogogo.services?.employeeWorkflow?.monthStats?.(employee,data,ESS.monthDates(),{availabilityDraft:ESS.state.availabilityDraft, leaveDraft:ESS.state.leaveDraft}) || {availableSlots:0,workedHours:0,openBadges:0,workedDays:0,leavePending:0};
  };

  ESS.nextPlannedShift = function nextPlannedShift(employee){
    return Restogogo.services?.employeeWorkflow?.nextShift?.(employee,data) || 'No shift planned';
  };

  ESS.addMonths = function addMonths(dateLike, delta){
    const base=new Date(validDate(dateLike) || data?.weekStart || new Date());
    const day=base.getDate();
    base.setDate(1);
    base.setMonth(base.getMonth()+delta);
    const last=new Date(base.getFullYear(),base.getMonth()+1,0).getDate();
    base.setDate(Math.min(day,last));
    return localISO(base);
  };

  ESS.monthLabel = function monthLabel(){
    const base=new Date(validDate(data?.weekStart) || new Date());
    return base.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  };

  ESS.monthDates = function monthDates(){
    const base=new Date(validDate(data?.weekStart) || new Date());
    const first=new Date(base.getFullYear(),base.getMonth(),1);
    const firstGrid=new Date(first);
    firstGrid.setDate(first.getDate()-((first.getDay()+6)%7));
    const last=new Date(base.getFullYear(),base.getMonth()+1,0);
    const lastGrid=new Date(last);
    lastGrid.setDate(last.getDate()+(6-((last.getDay()+6)%7)));
    const count=Math.max(35,Math.round((lastGrid-firstGrid)/86400000)+1);
    return Array.from({length:count},(_,i)=>{const d=new Date(firstGrid);d.setDate(firstGrid.getDate()+i);return d;});
  };

  ESS.plannedForDate = function plannedForDate(employee, date, shift){
    return Restogogo.services?.employeeWorkflow?.plannedForDate?.(employee,date,shift,data) || false;
  };

  ESS.actualEntryForDate = function actualEntryForDate(employee, date, shift){
    return Restogogo.services?.employeeWorkflow?.actualEntryForDate?.(employee,date,shift,data) || normalizeActualEntry();
  };

  ESS.rangeForDate = function rangeForDate(employee,date,shift){
    return Restogogo.services?.employeeWorkflow?.rangeForDate?.(employee,date,shift,data) || '';
  };
})();
