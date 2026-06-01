/* restogogo Planning repository — planning/week payloads only. */
(function(){
  function create(context){
    const U = window.RestogogoRepositoryUtils.create(context);
    const {DAYS,SHIFTS,getWorkspaceId,auth,okSnapshot,fail,text,date,monday,weekdayFromName,serviceKey,weekPayloadForState,splitRange} = U;
    function plannedShiftRowsFromState(source, weekStart){
      const payload = weekPayloadForState(source, weekStart);
      const rows = [];
      const planningSlots = payload?.planningSlots || {};
      Object.keys(planningSlots).forEach(employeeId=>{
        const employeeMap = planningSlots[employeeId] || {};
        DAYS.forEach(day=>{
          const dayMap = employeeMap[day] || {};
          SHIFTS.forEach(label=>{
            const slot = dayMap[label];
            if(!slot?.planned)return;
            const time = splitRange(slot.timeRange);
            rows.push({
              employee_id:text(employeeId),
              weekday:weekdayFromName(day),
              service_key:serviceKey(label),
              zone_id:text(slot.zoneId) || null,
              position_id:text(slot.positionId) || null,
              starts_at:time.starts_at,
              ends_at:time.ends_at,
              source:'manual'
            });
          });
        });
      });
      return rows.filter(row=>row.employee_id && row.weekday && row.service_key);
    }
    function weeklyNoteRowsFromState(source, weekStart){
      const payload = weekPayloadForState(source, weekStart);
      const rows = [];
      const notes = payload?.notes || {};
      DAYS.forEach(day=>{
        const dayMap = notes[day] || {};
        SHIFTS.forEach(label=>{
          const note = text(dayMap[label]);
          if(!note)return;
          rows.push({weekday:weekdayFromName(day), service_key:serviceKey(label), note});
        });
      });
      return rows.filter(row=>row.weekday && row.service_key && row.note);
    }
    function updatedAtFromSnapshot(snapshot, weekStart){
      const rows = Array.isArray(snapshot?.work_weeks) ? snapshot.work_weeks : [];
      const match = rows.find(row=>date(row?.week_start) === weekStart);
      return text(match?.updated_at) || null;
    }
    async function saveManagerPlanning(source, options={}){
      const weekStart = monday(source?.weekStart || new Date());
      if(!weekStart)return fail('Planning save blocked: no work week is selected.', {code:'missing_week_start'});
      const planningStatus = String(source?.status || 'Draft').toLowerCase() === 'published' ? 'published' : 'draft';
      // Optimistic lock: pass the work_weeks.updated_at this client loaded so the DB can
      // reject the save if another session wrote to this week in the meantime.
      const knownUpdatedAt = weekPayloadForState(source, weekStart)?.updatedAt || null;
      try{
        const result = await auth()?.saveManagerPlanning?.({
          p_restaurant_id:getWorkspaceId(),
          p_week_start:weekStart,
          p_planning_status:planningStatus,
          p_planned_shifts:plannedShiftRowsFromState(source, weekStart),
          p_weekly_notes:weeklyNoteRowsFromState(source, weekStart),
          p_absence_updates:[],
          p_work_week_updated_at:knownUpdatedAt
        });
        const snapshot = result?.runtime_snapshot || null;
        // Notify other sessions via Realtime so they can offer a reload.
        // Resolve actor name: employee display_name → first_name → auth user metadata → generic.
        const ctx = window.Restogogo?.workspace?.current?.();
        const actor = ctx?.employee?.display_name
          || ctx?.employee?.first_name
          || ctx?.authUser?.user_metadata?.first_name
          || String(ctx?.authUser?.email || '').split('@')[0]
          || 'A manager';
        window.Restogogo?.services?.realtime?.broadcastPlanningSaved?.(weekStart, updatedAtFromSnapshot(snapshot, weekStart), actor);
        return okSnapshot(snapshot, {
          source:'planning',
          activeWeekStart:weekStart,
          restoreActiveWeek:true,
          savedShifts:result?.saved_shifts ?? null,
          savedNotes:result?.saved_notes ?? null,
          planningStatus:result?.planning_status || planningStatus
        });
      }catch(error){
        const msg = error?.message || String(error || 'Planning save failed.');
        return fail(msg, {code:msg.startsWith('CONFLICT:') ? 'planning_conflict' : 'planning_save_failed'});
      }
    }
    return Object.freeze({saveManagerPlanning});
  }
  window.RestogogoPlanningRepository = Object.freeze({create});
})();
