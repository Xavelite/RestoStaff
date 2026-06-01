/* restogogo Restaurant repository — Restaurant setup payloads only. */
(function(){
  function create(context){
    const U = window.RestogogoRepositoryUtils.create(context);
    const {DAYS,SHIFTS,P,getWorkspaceId,auth,okSnapshot,fail,text,num,date,monday,weekdayFromName,serviceKey} = U;
    function setup(source){return source?.restaurantSetup || {};}
    function restaurantRowsFromState(source){
      const general = setup(source).general || {};
      return {
        restaurant:{name:text(source?.restaurant?.name || general.legalName), legal_name:text(general.legalName || source?.restaurant?.name), company_number:text(general.companyNumber) || null, email:text(general.email) || null, phone:text(general.phone) || null, address_line1:text(general.address) || null, postal_code:text(general.postalCode) || null, city:text(general.city || source?.restaurant?.city) || null, country_code:'BE', active:true},
        settings:{payroll_provider:text(setup(source).payrollRules?.provider) || null, active_week_start:date(source?.weekStart) || monday(), settings:{notifications:Array.isArray(source?.notifications) ? source.notifications : []}, payroll_settings:setup(source).payrollRules?.settings || {}}
      };
    }
    function positionRowsFromState(source){return (setup(source).positions || []).map((p,index)=>({id:text(p.id), restaurant_id:getWorkspaceId(), name:text(p.name), hourly_cost:num(p.hourlyCost), active:p.active !== false, sort_order:index})).filter(row=>row.id && row.name);}
    function zoneRowsFromState(source){return (setup(source).zones || []).map((z,index)=>({id:text(z.id), restaurant_id:getWorkspaceId(), name:text(z.name), active:z.active !== false, sort_order:index, notes:text(z.notes) || null})).filter(row=>row.id && row.name);}
    function openingRowsFromState(source){
      const rows=[]; const opening=setup(source).openingHours || {};
      DAYS.forEach(day=>{const weekday=weekdayFromName(day); const info=opening[day] || {}; SHIFTS.forEach(label=>{const [opens, closes] = String(info[label] || '').split('-'); rows.push({restaurant_id:getWorkspaceId(), weekday, service_key:serviceKey(label), is_open:info.open === true, opens_at:P.validClock(opens) || null, closes_at:P.validClock(closes) || null});});});
      return rows;
    }
    function zoneDefaultRowsFromState(source){
      const rows=[]; (setup(source).zones || []).forEach(zone=>{SHIFTS.forEach(label=>{const [start,end] = String(zone.defaultTimes?.[label] || '').split('-'); rows.push({restaurant_id:getWorkspaceId(), zone_id:text(zone.id), service_key:serviceKey(label), start_time:P.validClock(start) || null, end_time:P.validClock(end) || null});});});
      return rows.filter(row=>row.zone_id);
    }
    function coverageRowsFromState(source){return (setup(source).coverageRequirements || []).map((req,index)=>{const scope=text(req.metadata?.coverageScope || req.coverageScope || 'default') === 'weekday' ? 'weekday' : 'default'; const rawWeekday = req.metadata?.weekday ?? req.weekday ?? 1; const weekday=scope === 'weekday' ? Math.max(1, Math.min(7, Math.round(num(rawWeekday)))) : null; return {restaurant_id:getWorkspaceId(), zone_id:text(req.zoneId), position_id:text(req.positionId), service_key:serviceKey(req.serviceKey), coverage_scope:scope, weekday, required_count:Math.max(0, Math.round(num(req.requiredCount))), active:true, sort_order:index};}).filter(row=>row.zone_id && row.position_id && row.service_key);}
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
          p_positions:positionRowsFromState(source),
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
