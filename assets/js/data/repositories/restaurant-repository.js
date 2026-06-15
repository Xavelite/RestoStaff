/* restogogo Restaurant repository — Restaurant setup payloads only. */
(function(){
  function create(context){
    const U = window.RestogogoRepositoryUtils.create(context);
    const {DAYS,SHIFTS,P,getWorkspaceId,auth,okSnapshot,fail,text,num,date,monday,weekdayFromName,serviceKey} = U;
    function setup(source){return source?.restaurantSetup || {};}
    function codeFromName(value,fallback){
      return String(value || fallback || 'item').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || fallback || 'item';
    }
    function restaurantRowsFromState(source){
      const general = setup(source).general || {};
      return {
        restaurant:{name:text(source?.restaurant?.name || general.legalName), legal_name:text(general.legalName || source?.restaurant?.name), company_number:text(general.companyNumber) || null, email:text(general.email) || null, phone:text(general.phone) || null, address_line1:text(general.address) || null, postal_code:text(general.postalCode) || null, city:text(general.city || source?.restaurant?.city) || null, country_code:'BE', active:true},
        settings:{payroll_provider:text(setup(source).payrollRules?.provider) || null, active_week_start:date(source?.weekStart) || monday(), settings:{notifications:Array.isArray(source?.notifications) ? source.notifications : []}, payroll_settings:setup(source).payrollRules?.settings || {}}
      };
    }
    function departmentRowsFromState(source){return (setup(source).departments || []).map((department,index)=>({id:text(department.id), restaurant_id:getWorkspaceId(), code:text(department.code) || codeFromName(department.name, `department-${index+1}`), name:text(department.name), active:department.active !== false, sort_order:index, metadata:isPlainObject(department.metadata) ? department.metadata : {}})).filter(row=>row.id && row.name);}
    function teamRowsFromState(source){return (setup(source).teams || []).map((team,index)=>({id:text(team.id), restaurant_id:getWorkspaceId(), department_id:text(team.departmentId) || null, code:text(team.code) || codeFromName(team.name, `team-${index+1}`), name:text(team.name), active:team.active !== false, sort_order:index, metadata:isPlainObject(team.metadata) ? team.metadata : {}})).filter(row=>row.id && row.name);}
    function jobFunctionRowsFromState(source){return (setup(source).jobFunctions || []).map((p,index)=>({id:text(p.id), restaurant_id:getWorkspaceId(), department_id:text(p.departmentId) || null, team_id:text(p.teamId) || null, code:text(p.code) || codeFromName(p.name, `job-function-${index+1}`), name:text(p.name), estimated_hourly_cost:num(p.estimatedHourlyCost), active:p.active !== false, sort_order:index, metadata:isPlainObject(p.metadata) ? p.metadata : {}})).filter(row=>row.id && row.name);}
    function contractTypeRowsFromState(source){return (setup(source).contractTypes || []).map((contractType,index)=>({id:text(contractType.id), restaurant_id:getWorkspaceId(), code:text(contractType.code) || codeFromName(contractType.name, `contract-type-${index+1}`), name:text(contractType.name), category:text(contractType.category || 'other'), payroll_code:text(contractType.payrollCode) || null, active:contractType.active !== false, sort_order:index, metadata:isPlainObject(contractType.metadata) ? contractType.metadata : {}})).filter(row=>row.id && row.name);}
    function zoneRowsFromState(source){return (setup(source).zones || []).map((z,index)=>({id:text(z.id), restaurant_id:getWorkspaceId(), name:text(z.name), active:z.active !== false, sort_order:index, notes:text(z.notes) || null})).filter(row=>row.id && row.name);}
    function openingRowsFromState(source){
      const rows=[]; const opening=setup(source).openingHours || {};
      DAYS.forEach(day=>{const weekday=weekdayFromName(day); const info=opening[day] || {}; SHIFTS.forEach(label=>{const [opens, closes] = String(info[label] || '').split('-'); rows.push({restaurant_id:getWorkspaceId(), weekday, service_key:serviceKey(label), is_open:info.open === true, opens_at:P.validClock(opens) || null, closes_at:P.validClock(closes) || null});});});
      return rows;
    }
    // The restaurant's opening hours are the default a zone inherits when it has no
    // explicit service time of its own. Representative range = the first open day with a
    // valid range for that service (any day with a valid range as a fallback).
    function restaurantServiceRange(source, label){
      const opening = setup(source).openingHours || {};
      const fromDays = filterFn => {
        for(const day of DAYS){
          const info = opening[day] || {};
          if(filterFn && info.open !== true)continue;
          const [start, end] = String(info[label] || '').split('-');
          if(P.validClock(start) && P.validClock(end))return {start:P.validClock(start), end:P.validClock(end)};
        }
        return null;
      };
      return fromDays(true) || fromDays(false);
    }
    function zoneDefaultRowsFromState(source){
      const rows=[]; (setup(source).zones || []).forEach(zone=>{SHIFTS.forEach(label=>{
        const [ownStart, ownEnd] = String(zone.defaultTimes?.[label] || '').split('-');
        let start = P.validClock(ownStart) || null;
        let end = P.validClock(ownEnd) || null;
        if(!start || !end){
          // Zone left this service blank ("Use opening hours"): inherit the restaurant hours.
          const inherited = restaurantServiceRange(source, label);
          if(inherited){start = inherited.start; end = inherited.end;}
        }
        rows.push({restaurant_id:getWorkspaceId(), zone_id:text(zone.id), service_key:serviceKey(label), start_time:start, end_time:end});
      });});
      return rows.filter(row=>row.zone_id);
    }
    function coverageRowsFromState(source){return (setup(source).coverageRequirements || []).map((req,index)=>{const scope=text(req.metadata?.coverageScope || req.coverageScope || 'default') === 'weekday' ? 'weekday' : 'default'; const rawWeekday = req.metadata?.weekday ?? req.weekday ?? 1; const weekday=scope === 'weekday' ? Math.max(1, Math.min(7, Math.round(num(rawWeekday)))) : null; return {restaurant_id:getWorkspaceId(), zone_id:text(req.zoneId), job_function_id:text(req.jobFunctionId), service_key:serviceKey(req.serviceKey), coverage_scope:scope, weekday, required_count:Math.max(0, Math.round(num(req.requiredCount))), active:true, sort_order:index};}).filter(row=>row.zone_id && row.job_function_id && row.service_key);}
    function absenceTypeRowsFromState(source){
      return normalizeAbsenceTypeList(setup(source).absenceTypes || []).map((type,index)=>({
        id:text(type.id),
        restaurant_id:getWorkspaceId(),
        name:text(type.name),
        code:text(type.code),
        category:text(type.category || 'other'),
        paid_policy:text(type.paidPolicy || 'neutral'),
        payroll_code:text(type.payrollCode) || null,
        color:text(type.color || '#94a3b8'),
        requires_approval:type.requiresApproval !== false,
        affects_planning:type.affectsPlanning !== false,
        affects_payroll:type.affectsPayroll !== false,
        active:type.active !== false,
        sort_order:Number.isFinite(Number(type.sortOrder)) ? Number(type.sortOrder) : index,
        metadata:isPlainObject(type.metadata) ? type.metadata : {}
      })).filter(row=>row.id && row.name && row.code);
    }
    async function saveRestaurant(source){
      const rows = restaurantRowsFromState(source);
      try{
        const result = await auth()?.saveRestaurantSetup?.({
          p_restaurant_id:getWorkspaceId(),
          p_restaurant:rows.restaurant,
          p_settings:rows.settings,
          p_departments:departmentRowsFromState(source),
          p_teams:teamRowsFromState(source),
          p_job_functions:jobFunctionRowsFromState(source),
          p_contract_types:contractTypeRowsFromState(source),
          p_zones:zoneRowsFromState(source),
          p_opening_hours:openingRowsFromState(source),
          p_zone_service_defaults:zoneDefaultRowsFromState(source),
          p_coverage_requirements:coverageRowsFromState(source),
          p_absence_types:absenceTypeRowsFromState(source)
        });
        return okSnapshot(result?.runtime_snapshot || result || null, {source:'restaurant'});
      }catch(error){
        return fail(error?.message || String(error || 'Restaurant save failed.'), {code:'restaurant_save_failed'});
      }
    }
    return Object.freeze({saveRestaurant});
  }
  window.RestogogoRestaurantRepository = Object.freeze({create});
})();
