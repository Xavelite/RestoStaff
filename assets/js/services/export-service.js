/* restogogo export service. */
(function(){
  function csvCell(value){
    return `"${String(value ?? '').replaceAll('"','""')}"`;
  }

  function fileName(part,ext='csv',weekStart){
    const safeRestaurant = typeof restaurantName === 'function' ? restaurantName() : 'restaurant';
    const safeWeek = String(weekStart || (typeof data !== 'undefined' && data?.weekStart) || (typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0,10))).replaceAll('-','');
    const slug = typeof slugifyWorkspace === 'function' ? slugifyWorkspace(safeRestaurant) : String(safeRestaurant).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'restaurant';
    return `${slug}-${part}-${safeWeek}.${ext}`;
  }

  function downloadCsv(filename,headers,rows){
    const lines=[headers.map(csvCell).join(','),...rows.map(row=>row.map(csvCell).join(','))];
    const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function decimalHours(value){
    return (Number(value)||0).toFixed(2);
  }

  function toast(message){
    Restogogo.ui?.toast?.(message,{tone:'success',icon:'✓',centered:false,timeout:1800});
  }

  function actualsLogic(){
    return Restogogo.logic.actuals;
  }

  function actualTimeLabel(row){
    return row.actual ? displayTimeRange(row.actual) : (row.entry.clockIn ? `${row.entry.clockIn}–…` : '');
  }

  function actualSlotCsvRow(row){
    const A=actualsLogic();
    return [
      row.date,
      row.day,
      row.shift,
      A.employeeCode(row.employee),
      row.employee.name,
      row.employee.position,
      row.zone,
      row.planned ? displayTimeRange(row.planned) : '',
      actualTimeLabel(row),
      decimalHours(row.plannedHours),
      decimalHours(row.actualHours),
      decimalHours(row.variance),
      fmtHours(row.variance),
      row.status,
      A.proofStatus(row.entry,'clockIn'),
      A.proofStatus(row.entry,'clockOut')
    ];
  }

  function exportActualsDetails(){
    const headers=['Date','Day','Shift','Employee code','Employee','Position','Zone','Planned time','Actual time','Planned hours','Actual hours','Variance hours','Variance label','Status','Clock-in proof','Clock-out proof'];
    downloadCsv(fileName('actuals-detail','csv',data.weekStart),headers,actualsLogic().exportRows().map(actualSlotCsvRow));
    toast('Detailed actuals CSV exported.');
  }

  function exportActualsSummary(){
    const A=actualsLogic();
    const rows=A.relevantEmployees().map(employee=>{
      const totals=A.totalsForEmployee(employee);
      const stats=A.employeeStats(employee);
      return [
        data.weekStart,
        addDays(data.weekStart,6),
        A.employeeCode(employee),
        employee.name,
        employee.position,
        decimalHours(totals.planned),
        decimalHours(totals.actual),
        decimalHours(totals.variance),
        fmtHours(totals.planned),
        fmtHours(totals.actual),
        fmtHours(totals.variance),
        totals.badged,
        stats.missingBadges,
        stats.openClockouts,
        stats.unplannedBadges,
        stats.varianceIssues,
        stats.proofCaptured,
        stats.proofWarnings
      ];
    });
    const headers=['Week start','Week end','Employee code','Employee','Position','Planned hours decimal','Actual hours decimal','Variance hours decimal','Planned hours','Actual hours','Variance','Badged shifts','Missing badges','Missing clock-outs','Unplanned badges','Variance issues','Photo proofs','Photo warnings'];
    downloadCsv(fileName('actuals-summary','csv',data.weekStart),headers,rows);
    toast('Weekly summary CSV exported.');
  }

  function exportActualsPayroll(){
    const A=actualsLogic();
    const rows=A.relevantEmployees().map(employee=>{
      const totals=A.totalsForEmployee(employee);
      const stats=A.employeeStats(employee);
      return [
        restaurantName(),
        data.weekStart,
        addDays(data.weekStart,6),
        A.employeeCode(employee),
        employee.payrollId || employee.employeeNumber || '',
        employee.name,
        employee.position,
        employee.contractType || '',
        decimalHours(totals.actual),
        decimalHours(totals.planned),
        decimalHours(totals.variance),
        stats.openClockouts,
        stats.missingBadges,
        stats.unplannedBadges,
        employeePayrollMissingFields(employee).length ? 'missing-team-info' : 'ready-for-payroll'
      ];
    });
    const headers=['Restaurant','Week start','Week end','Employee code','Payroll ID','Employee','Position','Contract type','Actual hours decimal','Planned hours decimal','Variance hours decimal','Missing clock-outs','Missing badges','Unplanned badges','Export status'];
    downloadCsv(fileName('payroll-prep','csv',data.weekStart),headers,rows);
    toast('Payroll prep CSV exported.');
  }

  function exportActualsAnomalies(){
    const rows=actualsLogic().anomalies().map(row=>[row.issue,...actualSlotCsvRow(row)]);
    const headers=['Issue','Date','Day','Shift','Employee code','Employee','Position','Zone','Planned time','Actual time','Planned hours','Actual hours','Variance hours','Variance label','Status','Clock-in proof','Clock-out proof'];
    downloadCsv(fileName('actuals-anomalies','csv',data.weekStart),headers,rows);
    toast(rows.length ? 'Anomalies CSV exported.' : 'No anomalies found. Empty CSV exported.');
  }

  Restogogo.export={
    csvCell,
    fileName,
    downloadCsv,
    decimalHours,
    actuals:{
      details: exportActualsDetails,
      summary: exportActualsSummary,
      payroll: exportActualsPayroll,
      anomalies: exportActualsAnomalies
    }
  };
})();
