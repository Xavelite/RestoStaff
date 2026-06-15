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
    if(typeof window.employeeContractMissingFields === 'function')return window.employeeContractMissingFields(employee);
    return [];
  }
  function activeZones(setup){return list(setup.zones).filter(zone=>zone.active !== false);}
  function activeJobFunctions(setup){return list(setup.jobFunctions).filter(jobFunction=>jobFunction.active !== false);}
  function activeJobFunctionIds(setup){return new Set(activeJobFunctions(setup).map(jobFunction=>String(jobFunction.id || '')));}
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

  function jobFunctionsStep(source){
    const jobFunctions = activeJobFunctions(setupFrom(source));
    return step('jobFunctions','Job functions','Roles used by employees and coverage.',`${jobFunctions.length} active`,jobFunctions.length ? [] : ['No active job functions'],{section:'operations',operationMode:'jobFunctions'});
  }

  function coverageStep(source){
    const setup = setupFrom(source);
    const zones = activeZones(setup);
    const jobFunctions = activeJobFunctions(setup);
    const requirements = coverageRequirements(setup);
    const coveredZoneIds = new Set(requirements.map(req=>String(req.zoneId || '')));
    const issues = [];
    if(!zones.length)issues.push('Add zones before coverage');
    if(!jobFunctions.length)issues.push('Add job functions before coverage');
    if(zones.length && jobFunctions.length && !requirements.length)issues.push('No coverage rules configured');
    const uncoveredZones = zones.filter(zone=>!coveredZoneIds.has(String(zone.id || '')));
    if(requirements.length && uncoveredZones.length)issues.push(`${uncoveredZones.length} active zone${uncoveredZones.length === 1 ? '' : 's'} without coverage rules`);
    return step('coverage','Coverage rules','Expected staffing per zone, service and job function.',requirements.length ? `${requirements.length} rules` : 'Missing',issues,{section:'operations',operationMode:'zones'});
  }

  function teamStep(source){
    const setup = setupFrom(source);
    const employees = employeesFrom(source);
    const jobFunctionIds = activeJobFunctionIds(setup);
    const issues = [];
    if(!employees.length)issues.push('No active employees');
    const unassigned = employees.filter(employee=>!jobFunctionIds.has(String(employee.jobFunctionId || '')));
    if(unassigned.length)issues.push(`${unassigned.length} employee${unassigned.length === 1 ? '' : 's'} without active job function`);
    return step('team','Team','Active employees linked to job functions.',`${employees.length} active`,issues,{page:'team'});
  }

  function badgeAccessState(employee){
    const accessStatus = text(employee?.accessStatus).toLowerCase();
    const pinStatus = text(employee?.pinStatus).toLowerCase();
    if(employee?.active === false || employee?.badgeEnabled === false || accessStatus === 'disabled')return 'disabled';
    if(['invited','temporary'].includes(accessStatus))return 'invited';
    if(accessStatus === 'active' && pinStatus === 'active')return 'ready';
    return 'missing';
  }

  function badgeAccessCounts(employees){
    return employees.reduce((counts, employee)=>{
      const state = badgeAccessState(employee);
      counts[state] = (counts[state] || 0) + 1;
      return counts;
    }, {ready:0, invited:0, missing:0, disabled:0});
  }

  function badgeAccessIssues(counts){
    const issues = [];
    if(counts.missing)issues.push(`${counts.missing} employee${counts.missing === 1 ? '' : 's'} not invited to the app yet`);
    if(counts.invited)issues.push(`${counts.invited} invitation${counts.invited === 1 ? '' : 's'} still awaiting acceptance`);
    if(counts.disabled)issues.push(`${counts.disabled} employee${counts.disabled === 1 ? '' : 's'} with badge access disabled`);
    return issues;
  }

  function badgesStep(source){
    const employees = employeesFrom(source);
    const counts = badgeAccessCounts(employees);
    const issues = [];
    if(!employees.length)issues.push('Add employees before inviting them to the app');
    issues.push(...badgeAccessIssues(counts));
    return step('badges','App & badge access','Invite staff by email; they set their own password and badge PIN on accept.',employees.length ? `${counts.ready}/${employees.length} active` : 'Missing',issues,{page:'team'});
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
    return step('roster','Team roster','Active employees available for planning.',employees.length ? `${employees.length} active` : 'Missing',employees.length ? [] : ['No active employees'],{page:'team',tab:'core'});
  }

  function teamJobFunctionAssignmentStep(source){
    const setup = setupFrom(source);
    const employees = employeesFrom(source);
    const jobFunctionIds = activeJobFunctionIds(setup);
    const issues = [];
    if(!activeJobFunctions(setup).length)issues.push('Create active job functions in Restaurant first');
    const missing = employees.filter(employee=>!jobFunctionIds.has(String(employee.jobFunctionId || '')));
    if(missing.length)issues.push(`${missing.length} employee${missing.length === 1 ? '' : 's'} without active job function`);
    return step('jobFunctions','Job function assignment','Every active employee linked to an active job function.',employees.length ? `${Math.max(0,employees.length - missing.length)}/${employees.length} assigned` : 'Missing',issues,{page:'team',tab:'core'});
  }

  function teamBadgeAccessStep(source){
    const employees = employeesFrom(source);
    const counts = badgeAccessCounts(employees);
    const issues = [];
    if(!employees.length)issues.push('Add employees before inviting them to the app');
    issues.push(...badgeAccessIssues(counts));
    return step('badges','App & badge access','Invite staff by email; they set their own password and badge PIN on accept.',employees.length ? `${counts.ready}/${employees.length} active` : 'Missing',issues,{page:'team',tab:'contact'});
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
      teamJobFunctionAssignmentStep(safe),
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
      jobFunctionsStep(safe),
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
