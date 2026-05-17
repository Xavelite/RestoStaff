/* Coverage business logic: compares Restaurant setup expectations with Planning assignments. */
(function(){
  const R = window.Restogogo = window.Restogogo || {};
  R.logic = R.logic || {};

  function requirements(source = data){
    return normalizeCoverageRequirements(source?.restaurantSetup?.coverageRequirements || [], source?.restaurantSetup || data?.restaurantSetup || {});
  }

  function assignedRows(day, serviceKey, source = data){
    const rows = [];
    const employees = Array.isArray(source?.employees) ? source.employees : activeEmployees(source);
    employees.forEach(employee=>{
      if(!source?.planning?.[employee.id]?.[day]?.[serviceKey])return;
      const zoneId = assignmentZoneId(employee.id, day, serviceKey, source) || suggestZoneId(employee, serviceKey, source);
      const positionId = assignmentPositionId(employee.id, day, serviceKey, source) || employee.positionId || '';
      rows.push({employee, employeeId:employee.id, day, serviceKey, zoneId, positionId});
    });
    return rows;
  }

  function slotCoverage(day, serviceKey, source = data){
    const required = requirements(source).filter(req=>req.serviceKey===serviceKey);
    const assigned = assignedRows(day, serviceKey, source);
    const assignedCounts = new Map();
    assigned.forEach(row=>{
      if(!row.zoneId || !row.positionId)return;
      const key = `${row.zoneId}|${serviceKey}|${row.positionId}`;
      assignedCounts.set(key, (assignedCounts.get(key) || 0) + 1);
    });
    const seen = new Set();
    const rows = required.map(req=>{
      const key = `${req.zoneId}|${serviceKey}|${req.positionId}`;
      seen.add(key);
      const assignedCount = assignedCounts.get(key) || 0;
      const delta = assignedCount - req.requiredCount;
      return {
        zoneId:req.zoneId,
        zoneName:zoneDisplayName(req.zoneId, source),
        serviceKey,
        positionId:req.positionId,
        positionName:(source?.restaurantSetup?.positions || data?.restaurantSetup?.positions || []).find(position=>String(position.id)===String(req.positionId))?.name || '',
        requiredCount:req.requiredCount,
        assignedCount,
        delta,
        status:delta<0?'under':delta>0?'over':'ok'
      };
    });
    assignedCounts.forEach((assignedCount,key)=>{
      if(seen.has(key))return;
      const [zoneId,,positionId] = key.split('|');
      rows.push({
        zoneId,
        zoneName:zoneDisplayName(zoneId, source),
        serviceKey,
        positionId,
        positionName:(source?.restaurantSetup?.positions || data?.restaurantSetup?.positions || []).find(position=>String(position.id)===String(positionId))?.name || '',
        requiredCount:0,
        assignedCount,
        delta:assignedCount,
        status:'over'
      });
    });
    return rows;
  }

  function positionSummary(day, serviceKey, source = data){
    return slotCoverage(day, serviceKey, source).reduce((acc,row)=>{
      const key = row.positionId || 'unknown';
      acc[key] = acc[key] || {positionId:row.positionId, positionName:row.positionName, serviceKey, requiredCount:0, assignedCount:0, delta:0, status:'ok'};
      acc[key].requiredCount += row.requiredCount;
      acc[key].assignedCount += row.assignedCount;
      acc[key].delta = acc[key].assignedCount - acc[key].requiredCount;
      acc[key].status = acc[key].delta < 0 ? 'under' : (acc[key].delta > 0 ? 'over' : 'ok');
      return acc;
    },{});
  }

  function issues(day, serviceKey, source = data){
    return slotCoverage(day, serviceKey, source).filter(row=>row.status !== 'ok');
  }

  function weekIssues(source = data){
    const output = [];
    (window.days || []).forEach(day=>{
      (window.shifts || []).forEach(serviceKey=>{
        issues(day, serviceKey, source).forEach(row=>{
          output.push(Object.assign({day}, row));
        });
      });
    });
    return output.sort((a,b)=>{
      const daySort=(window.days || []).indexOf(a.day)-(window.days || []).indexOf(b.day);
      if(daySort)return daySort;
      const shiftSort=(window.shifts || []).indexOf(a.serviceKey)-(window.shifts || []).indexOf(b.serviceKey);
      if(shiftSort)return shiftSort;
      const statusSort=(a.status==='under'?0:1)-(b.status==='under'?0:1);
      if(statusSort)return statusSort;
      return String(a.zoneName||'').localeCompare(String(b.zoneName||'')) || String(a.positionName||'').localeCompare(String(b.positionName||''));
    });
  }

  function weekSummary(source = data){
    const reqs = requirements(source);
    const issueRows = weekIssues(source);
    const summary = issueRows.reduce((acc,row)=>{
      if(row.status === 'under'){
        acc.underCount += 1;
        acc.missingPeople += Math.abs(Number(row.delta || 0));
      }
      if(row.status === 'over'){
        acc.overCount += 1;
        acc.extraPeople += Math.max(0, Number(row.delta || 0));
      }
      return acc;
    },{
      requirementCount:reqs.length,
      issueCount:issueRows.length,
      underCount:0,
      overCount:0,
      missingPeople:0,
      extraPeople:0,
      issues:issueRows
    });
    summary.status = !summary.requirementCount ? 'missing' : (summary.issueCount ? 'issue' : 'ok');
    return summary;
  }

  function slotRequirementStatus(day, serviceKey, zoneId, positionId, source = data){
    const z=String(zoneId || '').trim();
    const p=String(positionId || '').trim();
    if(!z || !p)return null;
    return slotCoverage(day, serviceKey, source).find(row=>row.zoneId===z && row.positionId===p) || null;
  }

  R.logic.coverage = {requirements, assignedRows, slotCoverage, positionSummary, issues, weekIssues, weekSummary, slotRequirementStatus};
})();
