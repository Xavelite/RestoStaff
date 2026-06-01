/* restogogo Absence repository — absence lifecycle payloads only. */
(function(){
  function create(context){
    const U = window.RestogogoRepositoryUtils.create(context);
    const {getWorkspaceId,auth,okSnapshot,fail,text,num,date,serviceKey} = U;
    function employeeAbsenceRowsFromState(source, employeeId){
      const employee = (Array.isArray(source?.employees) ? source.employees : []).find(item=>text(item.id) === employeeId);
      return (Array.isArray(employee?.absences) ? employee.absences : [])
        .filter(absence=>String(absence?.id || '').startsWith('absence-'))
        .map(absence=>({
          absence_type_id:text(absence.absenceTypeId) || null,
          start_date:date(absence.start),
          end_date:date(absence.end || absence.start),
          service_key:serviceKey(absence.shift),
          employee_comment:text(absence.employeeComment) || null,
          duration_days:num(absence.durationDays),
          duration_hours:num(absence.durationHours)
        }))
        .filter(row=>row.start_date && row.end_date);
    }

    async function saveAbsenceLifecycle(options={}){
      const employeeId = text(options.employeeId || options.p_employee_id || '');
      const absenceId = text(options.absenceId || options.p_absence_id || '');
      const action = String(options.action || options.p_action || '').trim().toLowerCase();
      if(!employeeId)return fail('Absence save blocked: no employee is selected.', {code:'missing_employee'});
      if(!action)return fail('Absence save blocked: no lifecycle action is selected.', {code:'missing_absence_action'});
      const payload = options.payload && typeof options.payload === 'object' ? options.payload : {};
      try{
        const result = await auth()?.saveAbsenceLifecycle?.({
          p_restaurant_id:getWorkspaceId(),
          p_employee_id:employeeId,
          p_absence_id:absenceId && !absenceId.startsWith('absence-') ? absenceId : null,
          p_action:action,
          p_payload:payload
        });
        return okSnapshot(result?.runtime_snapshot || result || null, {source:'absence', action, employeeId});
      }catch(error){
        return fail(error?.message || String(error || 'Absence save failed.'), {code:'absence_save_failed'});
      }
    }

    return Object.freeze({saveAbsenceLifecycle,employeeAbsenceRowsFromState});
  }
  window.RestogogoAbsenceRepository = Object.freeze({create});
})();
