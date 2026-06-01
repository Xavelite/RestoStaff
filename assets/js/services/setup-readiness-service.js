/* Setup readiness service.
 * One source of truth for restaurant and team setup progress across modules and metric details.
 */
(function(){
  const R = window.Restogogo = window.Restogogo || {};
  R.services = R.services || {};

  function text(value){return String(value || '').trim();}
  function list(value){return Array.isArray(value) ? value : [];}
  function setupFrom(source){return source?.restaurantSetup || {};}
  function restaurantFrom(source){return source?.restaurant || {};}
  function employeesFrom(source){return activeEmployees(source || data || {});}
  function employeeContractMissingFields(employee){
    const missing=[];
    if(!employee?.contractType)missing.push('Contract type');
    if(!employee?.workRegime)missing.push('Work regime');
    if(!Number(employee?.contractHours))missing.push('Weekly hours');
    if(!employee?.contractStart)missing.push('Start date');
    if(!Number(employee?.annualLeaveEntitlementDays))missing.push('Annual leave entitlement');
    return missing;
  }
  function activeZones(setup){return list(setup.zones).filter(zone=>zone.active !== false);}
  function activePositions(setup){return list(setup.positions).filter(position=>position.active !== false);}
  function activePositionIds(setup){return new Set(activePositions(setup).map(position=>String(position.id || '')));}
  function coverageRequirements(setup){return normalizeCoverageRequirements(setup.coverageRequirements || [], setup).filter(req=>Number(req.requiredCount || 0) > 0);}
  function openDays(setup){return days.filter(day=>setup.openingHours?.[day]?.open !== false);}
  function dayHasServiceRange(setup,day){
    const info = setup.openingHours?.[day] || {};
    return shifts.some(shift=>!!normalizeTimeRangeInput(info[shift] || ''));
  }
  function doneStep(key,title,description,count,route){return step(key,title,description,count,[],route);}
  function step(key,title,description,count,issues,route){
    const cleanIssues = list(issues).map(text).filter(Boolean);
    return {
      key,
      title,
      description,
      count,
      issues:cleanIssues,
      done:cleanIssues.length === 0,
      status:cleanIssues.length ? 'Needs attention' : 'Ready',
      tone:cleanIssues.length ? 'warning' : 'success',
      route:route || 'restaurant'
    };
  }

  function basicsStep(source){
    const restaurant = restaurantFrom(source);
    const setup = setupFrom(source);
    const general = setup.general || {};
    const issues = [];
    if(!text(restaurant.name))issues.push('Restaurant name missing');
    if(!text(general.city || restaurant.city))issues.push('City missing');
    return step('basics','Restaurant basics','Name and city.',text(restaurant.name) || 'Not named',issues,{section:'restaurant'});
  }

  function openingStep(source){
    const setup = setupFrom(source);
    const open = openDays(setup);
    const issues = [];
    if(!open.length)issues.push('No opening days configured');
    const missingRanges = open.filter(day=>!dayHasServiceRange(setup,day));
    if(missingRanges.length)issues.push(`${missingRanges.length} open day${missingRanges.length === 1 ? '' : 's'} without service times`);
    return step('opening','Opening schedule','Open days and service times.',`${open.length}/7 days`,issues,{section:'restaurant'});
  }

  function zonesStep(source){
    const zones = activeZones(setupFrom(source));
    return step('zones','Zones','Operational areas used for planning.',`${zones.length} active`,zones.length ? [] : ['No active zones'],{section:'operations',operationMode:'zones'});
  }

  function positionsStep(source){
    const positions = activePositions(setupFrom(source));
    return step('positions','Positions','Roles used by employees and coverage.',`${positions.length} active`,positions.length ? [] : ['No active positions'],{section:'operations',operationMode:'positions'});
  }

  function coverageStep(source){
    const setup = setupFrom(source);
    const zones = activeZones(setup);
    const positions = activePositions(setup);
    const requirements = coverageRequirements(setup);
    const coveredZoneIds = new Set(requirements.map(req=>String(req.zoneId || '')));
    const issues = [];
    if(!zones.length)issues.push('Add zones before coverage');
    if(!positions.length)issues.push('Add positions before coverage');
    if(zones.length && positions.length && !requirements.length)issues.push('No coverage rules configured');
    const uncoveredZones = zones.filter(zone=>!coveredZoneIds.has(String(zone.id || '')));
    if(requirements.length && uncoveredZones.length)issues.push(`${uncoveredZones.length} active zone${uncoveredZones.length === 1 ? '' : 's'} without coverage rules`);
    return step('coverage','Coverage rules','Expected staffing per zone, service and position.',requirements.length ? `${requirements.length} rules` : 'Missing',issues,{section:'operations',operationMode:'zones'});
  }

  function teamStep(source){
    const setup = setupFrom(source);
    const employees = employeesFrom(source);
    const positionIds = activePositionIds(setup);
    const issues = [];
    if(!employees.length)issues.push('No active employees');
    const unassigned = employees.filter(employee=>!positionIds.has(String(employee.positionId || '')));
    if(unassigned.length)issues.push(`${unassigned.length} employee${unassigned.length === 1 ? '' : 's'} without active position`);
    return step('team','Team','Active employees linked to positions.',`${employees.length} active`,issues,{page:'team'});
  }

  function quickAccessState(employee){
    const loginName = text(employee?.loginName);
    const accessStatus = text(employee?.accessStatus).toLowerCase();
    const pinStatus = text(employee?.pinStatus).toLowerCase();
    if(employee?.active === false || employee?.quickLoginEnabled === false || accessStatus === 'disabled')return 'disabled';
    if(!loginName || accessStatus === 'not_invited' || pinStatus !== 'active')return 'missing';
    if(employee?.mustChangePin === true || ['temporary','reset_required'].includes(accessStatus))return 'temporary';
    return accessStatus === 'active' ? 'ready' : 'missing';
  }

  function quickAccessCounts(employees){
    return employees.reduce((counts, employee)=>{
      const state = quickAccessState(employee);
      counts[state] = (counts[state] || 0) + 1;
      return counts;
    }, {ready:0, temporary:0, missing:0, disabled:0});
  }

  function quickAccessIssues(counts){
    const issues = [];
    if(counts.missing)issues.push(`${counts.missing} employee${counts.missing === 1 ? '' : 's'} missing quick access credentials`);
    if(counts.temporary)issues.push(`${counts.temporary} employee${counts.temporary === 1 ? '' : 's'} still need first PIN change`);
    if(counts.disabled)issues.push(`${counts.disabled} employee${counts.disabled === 1 ? '' : 's'} with quick access disabled`);
    return issues;
  }

  function badgesStep(source){
    const employees = employeesFrom(source);
    const counts = quickAccessCounts(employees);
    const issues = [];
    if(!employees.length)issues.push('Add employees before quick access setup');
    issues.push(...quickAccessIssues(counts));
    return step('badges','Quick access','Personal PINs ready for app and badge terminal. Temporary PINs require first-use change.',employees.length ? `${counts.ready}/${employees.length} ready` : 'Missing',issues,{page:'team'});
  }

  function payrollStep(source){
    const setup = setupFrom(source);
    const employees = employeesFrom(source);
    const missingPayroll = employees.filter(employee=>employeePayrollMissingFields(employee).length);
    const issues = [];
    if(!text(setup.payrollRules?.provider))issues.push('Payroll provider missing');
    if(!employees.length)issues.push('Add employees before payroll readiness');
    if(missingPayroll.length)issues.push(`${missingPayroll.length} employee${missingPayroll.length === 1 ? '' : 's'} missing payroll info`);
    return step('payroll','Payroll readiness','Provider and employee export fields.',employees.length ? `${employees.length - missingPayroll.length}/${employees.length} ready` : 'Missing',issues,{section:'payroll'});
  }


  function teamRosterStep(source){
    const employees = employeesFrom(source);
    return step('roster','Team roster','Active employees available for planning.',employees.length ? `${employees.length} active` : 'Missing',employees.length ? [] : ['No active employees'],{page:'team',tab:'general'});
  }

  function teamPositionAssignmentStep(source){
    const setup = setupFrom(source);
    const employees = employeesFrom(source);
    const positionIds = activePositionIds(setup);
    const issues = [];
    if(!activePositions(setup).length)issues.push('Create active positions in Restaurant first');
    const missing = employees.filter(employee=>!positionIds.has(String(employee.positionId || '')));
    if(missing.length)issues.push(`${missing.length} employee${missing.length === 1 ? '' : 's'} without active position`);
    return step('positions','Position assignment','Every active employee linked to an active position.',employees.length ? `${Math.max(0,employees.length - missing.length)}/${employees.length} assigned` : 'Missing',issues,{page:'team',tab:'general'});
  }

  function teamBadgeAccessStep(source){
    const employees = employeesFrom(source);
    const counts = quickAccessCounts(employees);
    const issues = [];
    if(!employees.length)issues.push('Add employees before quick access setup');
    issues.push(...quickAccessIssues(counts));
    return step('badges','Quick access','Personal PINs ready for app and badge terminal. Temporary PINs require first-use change.',employees.length ? `${counts.ready}/${employees.length} ready` : 'Missing',issues,{page:'team',tab:'general'});
  }

  function teamContractStep(source){
    const employees = employeesFrom(source);
    const missing = employees.filter(employee=>employeeContractMissingFields(employee).length);
    const issues = [];
    if(!employees.length)issues.push('Add employees before contract setup');
    if(missing.length)issues.push(`${missing.length} employee${missing.length === 1 ? '' : 's'} missing contract essentials`);
    return step('contracts','Contract essentials','Contract type, regime, weekly hours, start date and leave entitlement.',employees.length ? `${Math.max(0,employees.length - missing.length)}/${employees.length} ready` : 'Missing',issues,{page:'team',tab:'contract'});
  }

  function teamPayrollStep(source){
    const employees = employeesFrom(source);
    const missing = employees.filter(employee=>employeePayrollMissingFields(employee).length);
    const issues = [];
    if(!employees.length)issues.push('Add employees before payroll readiness');
    if(missing.length)issues.push(`${missing.length} employee${missing.length === 1 ? '' : 's'} missing payroll info`);
    return step('payroll','Payroll readiness','Provider, payroll ID, NISS and IBAN ready for export.',employees.length ? `${Math.max(0,employees.length - missing.length)}/${employees.length} ready` : 'Missing',issues,{page:'team',tab:'payroll'});
  }

  function teamAbsenceStep(source){
    const employees = employeesFrom(source);
    const missingEntitlement = employees.filter(employee=>!Number(employee.annualLeaveEntitlementDays));
    const pending = employees.reduce((sum,employee)=>sum + list(employee.absences).filter(absence=>String(absence.status || 'Pending') === 'Pending').length,0);
    const issues = [];
    if(!employees.length)issues.push('Add employees before absence setup');
    if(missingEntitlement.length)issues.push(`${missingEntitlement.length} employee${missingEntitlement.length === 1 ? '' : 's'} without leave entitlement`);
    if(pending)issues.push(`${pending} pending absence request${pending === 1 ? '' : 's'}`);
    return step('absences','Absence readiness','Leave entitlement configured and pending requests reviewed.',employees.length ? `${Math.max(0,employees.length - missingEntitlement.length)}/${employees.length} configured` : 'Missing',issues,{page:'team',tab:'absences'});
  }

  function buildTeam(source=data){
    const safe = source || data || {};
    const steps = [
      teamRosterStep(safe),
      teamPositionAssignmentStep(safe),
      teamBadgeAccessStep(safe),
      teamContractStep(safe),
      teamPayrollStep(safe),
      teamAbsenceStep(safe)
    ];
    const completed = steps.filter(item=>item.done).length;
    const total = steps.length || 1;
    const percent = Math.round((completed / total) * 100);
    const issues = steps.flatMap(item=>item.issues.map(issue=>`${item.title}: ${issue}`));
    const missingCount = total - completed;
    const ready = missingCount === 0;
    const tone = ready ? 'success' : (percent >= 65 ? 'warning' : 'danger');
    const label = ready ? 'Ready' : (percent >= 65 ? 'Almost ready' : 'Team setup needed');
    const detail = ready ? 'Team setup complete' : `${missingCount} team setup step${missingCount === 1 ? '' : 's'} need attention`;
    return {steps,completed,total,percent,issues,missingCount,ready,tone,label,detail,primaryStep:steps.find(item=>!item.done) || steps[0]};
  }

  function build(source=data){
    const safe = source || data || {};
    const steps = [
      basicsStep(safe),
      openingStep(safe),
      zonesStep(safe),
      positionsStep(safe),
      coverageStep(safe),
      teamStep(safe),
      badgesStep(safe),
      payrollStep(safe)
    ];
    const completed = steps.filter(item=>item.done).length;
    const total = steps.length || 1;
    const percent = Math.round((completed / total) * 100);
    const issues = steps.flatMap(item=>item.issues.map(issue=>`${item.title}: ${issue}`));
    const missingCount = total - completed;
    const ready = missingCount === 0;
    const tone = ready ? 'success' : (percent >= 65 ? 'warning' : 'danger');
    const label = ready ? 'Ready' : (percent >= 65 ? 'Almost ready' : 'Setup needed');
    const detail = ready ? 'Restaurant setup complete' : `${missingCount} setup step${missingCount === 1 ? '' : 's'} need attention`;
    return {steps,completed,total,percent,issues,missingCount,ready,tone,label,detail,primaryStep:steps.find(item=>!item.done) || steps[0]};
  }

  R.services.setupReadiness = {build, buildTeam, employeeContractMissingFields};
})();
