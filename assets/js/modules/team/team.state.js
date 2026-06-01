(function(){
  const TeamModel = {
    today(){return todayISO();},
    daysUntil(dateValue){
      const date = normalizeDateString(dateValue);
      if(!date)return null;
      return Math.ceil((parseISO(date)-parseISO(todayISO()))/86400000);
    },
    currentMonthBounds(){
      const now = new Date();
      const start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
      const endDate = new Date(now.getFullYear(), now.getMonth()+1, 0);
      return {start,end:localISO(endDate)};
    },
    payrollMissingFields(employee){return employeePayrollMissingFields(employee);},
    generalMissingFields(employee){
      const missing=[];
      if(!String(employee.firstName || '').trim())missing.push('First name');
      if(!String(employee.lastName || '').trim())missing.push('Last name');
      if(!String(employee.positionId || '').trim())missing.push('Position');
      if(!String(employee.phone || '').trim())missing.push('Phone');
      return missing;
    },
    contractMissingFields(employee){
      return Restogogo.services.setupReadiness.employeeContractMissingFields(employee);
    },
    pendingAbsenceApprovalCount(employee){
      const today=todayISO();
      return (employee.absences || []).filter(absence=>{
        const status=String(absence.status || 'Pending');
        if(status !== 'Pending')return false;
        const end=normalizeDateString(absence.end || absence.start);
        return !end || end >= today;
      }).length;
    },
    isPayrollReady(employee){return TeamModel.payrollMissingFields(employee).length === 0;},
    expiringSoon(employee){
      const days = TeamModel.daysUntil(employee.contractEnd);
      return Number.isFinite(days) && days >= 0 && days <= 45;
    },
    approvedAbsenceCovers(employee,dateValue){
      const date = normalizeDateString(dateValue || todayISO());
      if(!date)return false;
      return (employee.absences||[]).some(absence=>{
        if(absence.status && absence.status !== 'Approved')return false;
        const aStart = normalizeDateString(absence.start);
        const aEnd = normalizeDateString(absence.end || absence.start) || aStart;
        return aStart && aStart <= date && aEnd >= date;
      });
    },
    absenceThisMonth(employee){
      const {start,end} = TeamModel.currentMonthBounds();
      return (employee.absences||[]).some(absence=>{
        if(absence.status && absence.status !== 'Approved')return false;
        const aStart = normalizeDateString(absence.start);
        const aEnd = normalizeDateString(absence.end || absence.start) || aStart;
        return aStart && aStart <= end && aEnd >= start;
      });
    },
    employeeStatus(employee){
      if(!employee.active)return {label:'Inactive',tone:'muted'};
      if(TeamModel.approvedAbsenceCovers(employee, todayISO()))return {label:'On leave',tone:'warning'};
      return {label:'Active',tone:'success'};
    },
    setupIssues(employee){
      return {
        general:TeamModel.generalMissingFields(employee).length,
        contract:TeamModel.contractMissingFields(employee).length,
        payroll:TeamModel.payrollMissingFields(employee).length,
        absences:TeamModel.pendingAbsenceApprovalCount(employee)
      };
    },
    issueCount(employee){
      const issues = TeamModel.setupIssues(employee);
      return issues.general + issues.contract + issues.payroll + issues.absences;
    },
    directoryCounts(employees){
      const list = employees || [];
      return {
        all:list.length,
        active:list.filter(employee=>employee.active !== false).length,
        action:list.filter(employee=>TeamModel.issueCount(employee) > 0).length
      };
    },
    payrollPercent(employees){
      const list = employees || [];
      if(!list.length)return 0;
      return Math.round((list.filter(TeamModel.isPayrollReady).length / list.length) * 100);
    },
    visibleEmployees(employees, query, filter='all'){
      let list = [...(employees || [])];
      const q=String(query||'').trim().toLowerCase();
      if(filter === 'active')list=list.filter(employee=>employee.active !== false);
      if(filter === 'action')list=list.filter(employee=>TeamModel.issueCount(employee) > 0);
      if(q)list=list.filter(employee=>`${employee.name} ${employee.firstName} ${employee.lastName} ${employeePositionName(employee)} ${employee.email} ${employee.phone} ${employee.loginName}`.toLowerCase().includes(q));
      return sortEmployees(list);
    },
    countAbsencesThisMonth(employees){
      return (employees || []).reduce((count,employee)=>count+(employee.absences||[]).filter(absence=>TeamModel.absenceThisMonth({absences:[absence]})).length,0);
    }
  };
  window.Restogogo = window.Restogogo || {};
  Restogogo.modules = Restogogo.modules || {};
  Restogogo.modules.TeamModel = TeamModel;
})();
