(function(){
  const EMPLOYEE_FIELDS = [
    'name','firstName','lastName','positionId','active','role','loginName','quickLoginEnabled','email','phone','address','postalCode','city','nationality',
    'contractType','contractStart','contractEnd','contractHours','annualLeaveEntitlementDays','workRegime','hourlyCost',
    'payrollProvider','payrollId','socialSecurityNo','iban','bic','payrollNotes',
    'emergencyName','emergencyRelation','emergencyPhone','notes','absences'
  ];

  const NUMERIC_FIELDS = new Set(['contractHours','annualLeaveEntitlementDays','hourlyCost']);
  const BOOLEAN_FIELDS = new Set(['active','quickLoginEnabled']);
  const DATE_FIELDS = new Set(['contractStart','contractEnd']);

  function toDraft(employee){
    const draft={id:employee.id};
    EMPLOYEE_FIELDS.forEach(field=>{
      if(field === 'absences')draft.absences=Array.isArray(employee.absences) ? employee.absences.map(absence=>({...absence})) : [];
      else draft[field]=employee[field] ?? '';
    });
    if(draft.active === '')draft.active = employee.active !== false;
    return draft;
  }

  function normalizedDraftValue(name,value){
    if(BOOLEAN_FIELDS.has(name))return value === true || value === 'true';
    if(NUMERIC_FIELDS.has(name))return Number(value) || 0;
    if(DATE_FIELDS.has(name))return normalizeDateString(value);
    return String(value ?? '').trim();
  }

  function createEmployee(defaultPosition){
    return {
      id:(crypto.randomUUID ? crypto.randomUUID() : `emp-${id()}`),
      name:'',
      positionId:defaultPosition.id,
      hourlyCost:defaultPosition.hourlyCost || 0,
      active:true,
      role:'employee',
      quickLoginEnabled:true,
      accessStatus:'reset_required',
      mustChangePin:true,
      absences:[]
    };
  }

  function applyDraftToEmployee(options={}){
    const employee=options.employee;
    const draft=options.draft || {};
    const selectedPosition=options.selectedPosition;
    const payrollMissingFields=options.payrollMissingFields || (()=>[]);
    if(!employee)return {ok:false,message:'Employee profile is missing.'};
    const firstName = String(draft.firstName||'').trim();
    const lastName = String(draft.lastName||'').trim();
    const fallbackName = `${firstName} ${lastName}`.trim();
    const name=String(draft.name || fallbackName).trim();
    const pickedPosition = selectedPosition?.(draft.positionId) || null;
    const positionId=String(pickedPosition?.id || '').trim();
    if(!name || !positionId){
      return {ok:false,message:'Name and position are required. Create positions in Restaurant, then select one here.'};
    }
    const role = Restogogo.registry.normalizeRole(draft.role || employee.role);
    if(!role)return {ok:false,message:'Employee role is invalid. Choose a valid role before saving.'};
    const hourlyCost = Number(draft.hourlyCost) || Number(pickedPosition?.hourlyCost) || 0;
    Object.assign(employee,{
      name,
      firstName,
      lastName,
      positionId,
      active:draft.active !== false,
      role,
      loginName:String(draft.loginName || `${firstName}.${lastName}`.replace(/\s+/g,'')).trim(),
      quickLoginEnabled:draft.quickLoginEnabled !== false,
      accessStatus:employee.accessStatus || '',
      mustChangePin:employee.mustChangePin === true,
      email:String(draft.email||'').trim(),
      phone:String(draft.phone||'').trim(),
      address:String(draft.address||'').trim(),
      postalCode:String(draft.postalCode||'').trim(),
      city:String(draft.city||'').trim(),
      nationality:String(draft.nationality||'').trim(),
      contractType:String(draft.contractType||'').trim(),
      contractStart:normalizeDateString(draft.contractStart),
      contractEnd:normalizeDateString(draft.contractEnd),
      contractHours:Number(draft.contractHours)||0,
      workRegime:String(draft.workRegime||'').trim(),
      hourlyCost,
      annualLeaveEntitlementDays:Number(draft.annualLeaveEntitlementDays)||0,
      payrollProvider:String(draft.payrollProvider||'').trim(),
      payrollId:String(draft.payrollId||'').trim(),
      socialSecurityNo:String(draft.socialSecurityNo||'').trim(),
      iban:String(draft.iban||'').trim(),
      bic:String(draft.bic||'').trim(),
      payrollNotes:String(draft.payrollNotes||'').trim(),
      emergencyName:String(draft.emergencyName||'').trim(),
      emergencyRelation:String(draft.emergencyRelation||'').trim(),
      emergencyPhone:String(draft.emergencyPhone||'').trim(),
      notes:String(draft.notes||'').trim(),
      absences:Array.isArray(draft.absences) ? draft.absences : employee.absences || []
    });
    employee.payrollReady = payrollMissingFields(employee).length === 0;
    return {ok:true};
  }

  Restogogo.modules.TeamProfileDomain={
    EMPLOYEE_FIELDS,
    toDraft,
    normalizedDraftValue,
    createEmployee,
    applyDraftToEmployee
  };
})();
