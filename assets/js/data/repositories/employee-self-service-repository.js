/* restogogo Employee self-service repository — availability + own absence requests. */
(function(){
  function create(context, dependencies={}){
    const U = window.RestogogoRepositoryUtils.create(context);
    const {DAYS,SHIFTS,getWorkspaceId,auth,okSnapshot,fail,text,monday,serviceKey,weekPayloadForState} = U;
    const absenceRepository = dependencies.absenceRepository;
    function dateForWeekDay(weekStart, day){
      const index = DAYS.indexOf(String(day || ''));
      if(index < 0)return '';
      return U.P.addDays(weekStart, index);
    }
    function availabilityStateFromValue(value){
      if(value === true || value === 'available')return 'available';
      if(value === 'partial')return 'partial';
      if(value === false || value === 'unavailable')return 'unavailable';
      if(value && typeof value === 'object'){
        if(value.state === 'available')return 'available';
        if(value.state === 'partial')return 'partial';
        if(value.state === 'unavailable')return 'unavailable';
      }
      return '';
    }
    function employeeSelfServiceEmployeeId(source){
      const employeeId = text(window.Restogogo?.state?.session?.employeeId || '');
      if(!employeeId)return '';
      const employees = Array.isArray(source?.employees) ? source.employees : [];
      return employees.some(employee=>text(employee?.id) === employeeId) ? employeeId : '';
    }
    function employeeAvailabilityRowsFromState(source, employeeId, weekStarts){
      const weeks = (Array.isArray(weekStarts) && weekStarts.length ? weekStarts : [monday(source?.weekStart || new Date())]).map(week=>monday(week)).filter(Boolean);
      const rows=[];
      weeks.forEach(weekStart=>{
        const payload = weekPayloadForState(source, weekStart);
        const employeeMap = payload?.availability?.[employeeId] || {};
        DAYS.forEach(day=>{
          const dayMap = employeeMap?.[day] || {};
          SHIFTS.forEach(label=>{
            const state = availabilityStateFromValue(dayMap[label]);
            if(!state)return;
            rows.push({date:dateForWeekDay(weekStart, day), service_key:serviceKey(label), availability_state:state});
          });
        });
      });
      return rows;
    }
    async function saveEmployeeSelfService(source, options={}){
      const employeeId = employeeSelfServiceEmployeeId(source);
      if(!employeeId)return fail('Employee time save blocked: no valid employee session is selected.', {code:'missing_employee_session'});
      const weekStarts = (Array.isArray(options.weekStarts) ? options.weekStarts : []).map(week=>monday(week)).filter(Boolean);
      const availability = options.includeAvailability ? employeeAvailabilityRowsFromState(source, employeeId, weekStarts) : [];
      const hasAbsences = !!options.includeAbsences && absenceRepository?.employeeAbsenceRowsFromState?.(source, employeeId).length > 0;
      if(!availability.length && !hasAbsences)return fail('Employee time save blocked: no DB v2 self-service changes found.', {code:'empty_employee_self_service_save'});
      // Single atomic RPC call — availability and absence requests are saved together in one DB transaction.
      // The save_employee_self_service RPC now writes absence_events audit rows for each p_absences entry
      // (DB patch 029), so this call has the same audit trail as separate save_absence_lifecycle calls.
      const absenceRows = hasAbsences ? (absenceRepository?.employeeAbsenceRowsFromState?.(source, employeeId) || []) : [];
      try{
        const result = await auth()?.saveEmployeeSelfService?.({
          p_restaurant_id:getWorkspaceId(),
          p_employee_id:employeeId,
          p_availability:availability,
          p_absences:absenceRows,
          p_submit_availability:!!(availability.length)
        });
        return okSnapshot(result?.runtime_snapshot || null, {source:'employee_self_service', employeeId});
      }catch(error){
        return fail(error?.message || String(error || 'Employee time save failed.'), {code:'employee_self_service_save_failed'});
      }
    }
    return Object.freeze({saveEmployeeSelfService});
  }
  window.RestogogoEmployeeSelfServiceRepository = Object.freeze({create});
})();
