/* restogogo DB snapshot mapper.
 * Owns the DB v2 runtime snapshot -> UI runtime state translation.
 * It must stay pure-ish: no remote reads/writes and no save routing.
 */
(function(){
  const config = window.APP_CONFIG || {};
  const P = window.RestogogoPrimitives;
  const DAYS = P.DAYS.slice();
  const SHIFTS = P.SHIFTS.slice();

  function text(value){return P.text(value);}
  function num(value){return P.numberValue(value);}
  function iso(value){return P.validIso(value);}
  function date(value){return P.validDateUtc(value);}
  function monday(value=new Date()){return P.monday(value);}
  function range(start,end){const s=P.validClock(start); const e=P.validClock(end); return s && e ? `${s}-${e}` : '';}
  function clockFromIso(value){const stamp=iso(value); if(!stamp)return ''; const d=new Date(stamp); if(!Number.isFinite(d.getTime()))return ''; return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
  function photoStatusFromDb(value){
    const raw=String(value || '').trim().toLowerCase().replace(/[-\s]+/g,'_');
    if(!raw)return '';
    if(raw==='ok' || raw==='captured')return 'captured';
    if(raw==='blocked' || raw==='denied')return 'denied';
    if(raw==='unsupported' || raw==='unavailable' || raw==='not_available')return 'unavailable';
    if(raw==='error' || raw==='failed')return 'failed';
    if(raw==='skipped' || raw==='waived')return 'waived';
    if(raw==='not_required')return 'not_required';
    if(raw==='missing')return 'missing';
    return '';
  }
  function dayName(weekday){return DAYS[(Number(weekday) || 1) - 1] || '';}
  function serviceLabel(key){const value = String(key || '').toLowerCase(); return value === 'lunch' ? 'Lunch' : (value === 'evening' ? 'Evening' : '');}
  function serviceKey(label){const value = String(label || '').trim().toLowerCase(); return value === 'lunch' ? 'lunch' : (value === 'evening' ? 'evening' : '');}
  function ensureWeek(history, weekStart){
    const week = date(weekStart) ? monday(weekStart) : monday();
    history[week] = history[week] && typeof history[week] === 'object' ? history[week] : emptyWeeklyPayload();
    return history[week];
  }
  function setSlot(root, employeeId, day, service, value){
    if(value === undefined || value === null || value === '' || value === false)return;
    root[employeeId] = root[employeeId] && typeof root[employeeId] === 'object' ? root[employeeId] : {};
    root[employeeId][day] = root[employeeId][day] && typeof root[employeeId][day] === 'object' ? root[employeeId][day] : {};
    root[employeeId][day][service] = value;
  }
  function normalizeArray(value){return Array.isArray(value) ? value : [];}
  function byKey(rows, key){const map=new Map(); normalizeArray(rows).forEach(row=>{if(row?.[key])map.set(String(row[key]), row);}); return map;}
  function groupBy(rows, key){const map=new Map(); normalizeArray(rows).forEach(row=>{const value=String(row?.[key] || ''); if(!value)return; if(!map.has(value))map.set(value, []); map.get(value).push(row);}); return map;}
  function firstBy(rows, key){const grouped = groupBy(rows, key); const map = new Map(); grouped.forEach((list,id)=>map.set(id, list[0])); return map;}

  function assertDbV2Snapshot(snapshot){
    if(!snapshot || typeof snapshot !== 'object'){
      throw new TypeError('[restogogo:snapshot-mapper] Expected a DB v2 runtime snapshot object, got ' + typeof snapshot + '.');
    }
    if(!snapshot.restaurant?.id){
      throw new Error('[restogogo:snapshot-mapper] Snapshot is missing restaurant.id — is this a DB v2 snapshot?');
    }
  }

  function stateFromSnapshot(snapshot){
    assertDbV2Snapshot(snapshot);
    const restaurant = snapshot?.restaurant || {};
    const settings = snapshot?.restaurant_settings || snapshot?.settings || {};
    const setupStatus = snapshot?.restaurant_setup_status || snapshot?.setup_status || {};
    const rows = {
      profiles: normalizeArray(snapshot?.profiles),
      memberships: normalizeArray(snapshot?.restaurant_memberships),
      employees: normalizeArray(snapshot?.employees),
      employeeAccess: normalizeArray(snapshot?.employee_access),
      contacts: normalizeArray(snapshot?.employee_contact_details),
      contracts: normalizeArray(snapshot?.employee_contracts),
      payroll: normalizeArray(snapshot?.employee_payroll_profiles),
      pinCredentials: normalizeArray(snapshot?.employee_pin_credentials),
      positions: normalizeArray(snapshot?.positions),
      zones: normalizeArray(snapshot?.zones),
      services: normalizeArray(snapshot?.services),
      openingHours: normalizeArray(snapshot?.opening_hours),
      zoneDefaults: normalizeArray(snapshot?.zone_service_defaults),
      coverage: normalizeArray(snapshot?.coverage_requirements),
      absenceTypes: normalizeArray(snapshot?.absence_types),
      absences: normalizeArray(snapshot?.absences),
      workWeeks: normalizeArray(snapshot?.work_weeks),
      plannedShifts: normalizeArray(snapshot?.planned_shifts),
      availabilitySlots: normalizeArray(snapshot?.employee_availability_slots),
      availabilitySubmissions: normalizeArray(snapshot?.employee_availability_submissions),
      weeklyNotes: normalizeArray(snapshot?.weekly_notes),
      timeEntries: normalizeArray(snapshot?.time_entries)
    };

    const accessByEmployee = firstBy(rows.employeeAccess, 'employee_id');
    const contactByEmployee = firstBy(rows.contacts, 'employee_id');
    const contractByEmployee = firstBy(rows.contracts.filter(row=>row.active !== false), 'employee_id');
    const payrollByEmployee = firstBy(rows.payroll, 'employee_id');
    const pinByEmployee = firstBy(rows.pinCredentials, 'employee_id');
    const membershipsByProfile = firstBy(rows.memberships, 'profile_id');
    const profilesById = byKey(rows.profiles, 'id');
    const absencesByEmployee = groupBy(rows.absences, 'employee_id');

    const employees = rows.employees.map((employee, index)=>{
      const access = accessByEmployee.get(String(employee.id)) || {};
      const contact = contactByEmployee.get(String(employee.id)) || {};
      const contract = contractByEmployee.get(String(employee.id)) || {};
      const payroll = payrollByEmployee.get(String(employee.id)) || {};
      const pinCredential = pinByEmployee.get(String(employee.id)) || {};
      const profile = profilesById.get(String(access.profile_id || '')) || {};
      const membership = membershipsByProfile.get(String(access.profile_id || '')) || {};
      const rawMembershipRole = text(membership.role);
      const membershipRole = rawMembershipRole ? (window.RestogogoAuthDomain?.normalizeRole?.(rawMembershipRole) || '') : 'employee';
      return {
        id:text(employee.id),
        name:text(employee.display_name || `${employee.first_name || ''} ${employee.last_name || ''}`.trim()),
        firstName:text(employee.first_name),
        lastName:text(employee.last_name),
        positionId:text(employee.position_id),
        active:employee.active !== false,
        role:membershipRole,
        managerAccess:['owner','manager'].includes(membershipRole),
        profileId:text(access.profile_id),
        loginName:text(access.login_name),
        quickLoginEnabled:access.quick_login_enabled !== false,
        pinStatus:text(pinCredential.pin_status || ''),
        accessStatus:text(access.access_status || ''),
        mustChangePin:access.must_change_pin === true,
        email:text(contact.email || profile.email),
        phone:text(contact.phone || profile.phone),
        address:text(contact.address_line1),
        postalCode:text(contact.postal_code),
        city:text(contact.city),
        nationality:text(contact.nationality),
        emergencyName:text(contact.emergency_name),
        emergencyRelation:text(contact.emergency_relation),
        emergencyPhone:text(contact.emergency_phone),
        contractType:text(contract.contract_type),
        contractStart:date(contract.contract_start),
        contractEnd:date(contract.contract_end),
        contractHours:num(contract.weekly_contract_hours),
        annualLeaveEntitlementDays:num(contract.annual_leave_entitlement_days),
        workRegime:text(contract.work_regime),
        payrollProvider:text(payroll.payroll_provider || settings.payroll_provider),
        payrollId:text(payroll.payroll_employee_id),
        socialSecurityNo:text(payroll.national_registry_no),
        iban:text(payroll.iban),
        bic:text(payroll.bic),
        hourlyCost:num(payroll.hourly_cost),
        payrollReady:payroll.payroll_ready === true,
        payrollNotes:text(payroll.payroll_notes),
        notes:text(contact.notes),
        absences:normalizeArray(absencesByEmployee.get(String(employee.id))).map(absence=>({
          id:text(absence.id),
          absenceTypeId:text(absence.absence_type_id),
          start:date(absence.start_date),
          end:date(absence.end_date || absence.start_date),
          shift:serviceLabel(absence.service_key) || 'Full day',
          status:text(absence.status || 'pending').replace(/^./, c=>c.toUpperCase()),
          requestedBy:text(absence.requested_by_profile_id),
          approvedBy:text(absence.approved_by_profile_id),
          approvedAt:iso(absence.approved_at),
          rejectedBy:text(absence.rejected_by_profile_id),
          rejectedAt:iso(absence.rejected_at),
          cancelledAt:iso(absence.cancelled_at),
          employeeComment:text(absence.employee_comment),
          managerComment:text(absence.manager_comment),
          durationDays:num(absence.duration_days),
          durationHours:num(absence.duration_hours),
          payrollExportStatus:text(absence.payroll_export_status || 'not_exported'),
          payrollExportId:text(absence.payroll_export_id)
        })),
        _sortOrder:num(employee.sort_order || index)
      };
    }).sort((a,b)=>a._sortOrder-b._sortOrder).map(employee=>{delete employee._sortOrder; return employee;});

    const services = rows.services.filter(row=>row.active !== false).sort((a,b)=>num(a.sort_order)-num(b.sort_order));
    const opening = {};
    rows.openingHours.forEach(row=>{
      const day = dayName(row.weekday);
      const service = serviceLabel(row.service_key);
      if(!day || !service)return;
      opening[day] = opening[day] || {open:false, Lunch:'', Evening:''};
      opening[day].open = opening[day].open || row.is_open === true;
      opening[day][service] = range(row.opens_at, row.closes_at);
    });
    DAYS.forEach(day=>{opening[day] = opening[day] || {open:false, Lunch:'', Evening:''};});

    const zoneDefaults = new Map(rows.zoneDefaults.map(row=>[`${row.zone_id}|${row.service_key}`, row]));
    const zones = rows.zones.map((zone,index)=>{
      const defaults = {};
      SHIFTS.forEach(label=>{
        const key = serviceKey(label);
        const row = zoneDefaults.get(`${zone.id}|${key}`);
        defaults[label] = row ? range(row.start_time, row.end_time) : '';
      });
      return {id:text(zone.id), name:text(zone.name), active:zone.active !== false, sortOrder:num(zone.sort_order || index), notes:text(zone.notes), defaultTimes:defaults, metadata:{}};
    }).sort((a,b)=>a.sortOrder-b.sortOrder);

    const positions = rows.positions.map((position,index)=>({id:text(position.id), name:text(position.name), active:position.active !== false, hourlyCost:num(position.hourly_cost), sortOrder:num(position.sort_order || index), metadata:{}})).sort((a,b)=>a.sortOrder-b.sortOrder);
    const coverageRequirements = rows.coverage.map(row=>({zoneId:text(row.zone_id), serviceKey:serviceLabel(row.service_key), positionId:text(row.position_id), requiredCount:num(row.required_count), sortOrder:num(row.sort_order), metadata:{coverageScope:text(row.coverage_scope || (row.weekday ? 'weekday' : 'default')) || 'default', weekday:row.weekday === null || row.weekday === undefined ? null : num(row.weekday)}})).filter(row=>row.zoneId && row.positionId && row.serviceKey);
    const absenceTypes = rows.absenceTypes.map((type,index)=>({id:text(type.id), name:text(type.name), code:text(type.code), category:text(type.category), paidPolicy:text(type.paid_policy), requiresApproval:type.requires_approval !== false, affectsPlanning:type.affects_planning !== false, affectsPayroll:type.affects_payroll !== false, payrollCode:text(type.payroll_code), color:text(type.color), active:type.active !== false, sortOrder:num(type.sort_order || index), metadata:{}}));

    const history = {};
    rows.workWeeks.forEach(row=>{
      const week = ensureWeek(history, row.week_start);
      week.status = row.planning_status === 'published' ? 'Published' : 'Draft';
      week.actualsStatus = text(row.actuals_status) || 'open';
      week.actualsApprovedAt = iso(row.actuals_approved_at);
      week.actualsLockedAt = iso(row.actuals_locked_at);
      week.updatedAt = iso(row.updated_at) || null;
    });
    rows.availabilitySlots.forEach(row=>{
      const week = ensureWeek(history, row.week_start);
      const day = dayName(row.weekday); const service = serviceLabel(row.service_key);
      const value = row.availability_state === 'partial' ? 'partial' : (row.availability_state === 'available' ? true : (row.availability_state === 'unavailable' ? 'unavailable' : undefined));
      if(day && service)setSlot(week.availability, row.employee_id, day, service, value);
    });
    rows.availabilitySubmissions.forEach(row=>{
      if(row.status !== 'submitted')return;
      const week = ensureWeek(history, row.week_start);
      week.submitted[row.employee_id] = true;
    });
    rows.plannedShifts.forEach(row=>{
      const week = ensureWeek(history, row.week_start);
      const day = dayName(row.weekday); const service = serviceLabel(row.service_key);
      if(!day || !service)return;
      const slot = {planned:true};
      const zoneId = text(row.zone_id);
      const positionId = text(row.position_id);
      const timeRange = range(row.starts_at, row.ends_at);
      if(zoneId) slot.zoneId = zoneId;
      if(positionId) slot.positionId = positionId;
      if(timeRange) slot.timeRange = timeRange;
      setSlot(week.planningSlots, row.employee_id, day, service, slot);
    });
    rows.weeklyNotes.forEach(row=>{
      const week = ensureWeek(history, row.week_start);
      const day = dayName(row.weekday); const service = serviceLabel(row.service_key);
      if(!day || !service || !row.note)return;
      week.notes[day] = week.notes[day] || {};
      week.notes[day][service] = text(row.note);
    });
    rows.timeEntries.forEach(row=>{
      if(String(row.status || '').toLowerCase() === 'cancelled')return;
      const week = ensureWeek(history, monday(row.business_date));
      const dt = new Date(`${row.business_date}T12:00:00`);
      const day = DAYS[(dt.getDay()+6)%7];
      const service = serviceLabel(row.service_key);
      if(!day || !service)return;
      const clockInAt = iso(row.clock_in_at);
      const clockOutAt = iso(row.clock_out_at);
      const entry = {
        id:text(row.id),
        clockIn:clockFromIso(clockInAt),
        clockOut:clockFromIso(clockOutAt),
        clockInAt,
        clockOutAt,
        clockInPhoto:text(row.clock_in_photo_url),
        clockOutPhoto:text(row.clock_out_photo_url),
        clockInPhotoStatus:photoStatusFromDb(row.clock_in_photo_status),
        clockOutPhotoStatus:photoStatusFromDb(row.clock_out_photo_status),
        clockInPhotoCapturedAt:iso(row.clock_in_photo_captured_at),
        clockOutPhotoCapturedAt:iso(row.clock_out_photo_captured_at),
        source:text(row.source),
        status:text(row.status),
        adjustedAt:iso(row.adjusted_at),
        adjustmentReason:text(row.adjustment_reason),
        cancelledAt:iso(row.cancelled_at),
        cancellationReason:text(row.cancellation_reason)
      };
      setSlot(week.actualEntries, row.employee_id, day, service, entry);
    });

    const storedWeek = date(settings.active_week_start);
    const fourWeeksAgo = monday(new Date(Date.now() - 28 * 24 * 60 * 60 * 1000));
    const activeWeek = (storedWeek && storedWeek >= fourWeeksAgo) ? storedWeek : monday();
    const activePayload = history[activeWeek] || emptyWeeklyPayload();
    return {
      version:Number(window.APP_CONFIG?.dataContractVersion || 40),
      schemaVersion:Number(window.APP_CONFIG?.dataContractVersion || 40),
      restaurant:{name:text(restaurant.name), ownerName:(()=>{const om=rows.memberships.find(m=>String(m.role||'').toLowerCase()==='owner'); const op=om?profilesById.get(String(om.profile_id||'')):null; return op?text(`${op.first_name||''} ${op.last_name||''}`.trim()):'';})(), city:text(restaurant.city)},
      weekStart:activeWeek,
      status:activePayload.status || 'Draft',
      employees,
      restaurantSetup:{
        general:{legalName:text(restaurant.legal_name || restaurant.name), companyNumber:text(restaurant.company_number), address:text(restaurant.address_line1), city:text(restaurant.city), phone:text(restaurant.phone), email:text(restaurant.email)},
        zones,
        positions,
        coverageRequirements,
        openingHours:opening,
        services:services.map(service=>({key:text(service.service_key), name:text(service.name), active:service.active !== false, sortOrder:num(service.sort_order)})),
        payrollRules:{provider:text(settings.payroll_provider), settings:settings.payroll_settings || {}},
        absenceTypes
      },
      availability:activePayload.availability || {},
      planningSlots:activePayload.planningSlots || {},
      submitted:activePayload.submitted || {},
      notes:activePayload.notes || {},
      actualEntries:activePayload.actualEntries || {},
      updatedAt:activePayload.updatedAt || null,
      history,
      notifications:Array.isArray(settings.settings?.notifications) ? settings.settings.notifications : [],
      workspaceInitialized:setupStatus.current_step === 'ready'
    };
  }


  window.RestogogoSnapshotMapper = Object.freeze({
    stateFromSnapshot,
    assertDbV2Snapshot
  });
})();
