(function(){
  const EMPLOYEE_FIELDS = [
    'name','firstName','lastName','jobFunctionId','active','role','badgeEnabled','email','phone','address','postalCode','city','nationality',
    'contractTypeId','contractType','contractStart','contractEnd','contractHours','annualLeaveEntitlementDays','workRegime','estimatedHourlyCost',
    'payrollProvider','payrollId','socialSecurityNo','iban','bic','payrollNotes',
    'emergencyName','emergencyRelation','emergencyPhone','notes','absences'
  ];

  const NUMERIC_FIELDS = new Set(['contractHours','annualLeaveEntitlementDays','estimatedHourlyCost']);
  const BOOLEAN_FIELDS = new Set(['active','badgeEnabled']);
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

  function createEmployee(defaultJobFunction){
    return {
      id:(crypto.randomUUID ? crypto.randomUUID() : `emp-${id()}`),
      name:'',
      jobFunctionId:defaultJobFunction.id,
      estimatedHourlyCost:defaultJobFunction.estimatedHourlyCost || 0,
      active:true,
      role:'employee',
      badgeEnabled:true,
      accessStatus:'not_invited',
      absences:[]
    };
  }

  function applyDraftToEmployee(options={}){
    const employee=options.employee;
    const draft=options.draft || {};
    const selectedJobFunction=options.selectedJobFunction;
    const selectedContractType=options.selectedContractType;
    const payrollMissingFields=options.payrollMissingFields || (()=>[]);
    if(!employee)return {ok:false,message:'Employee profile is missing.'};
    const firstName = String(draft.firstName||'').trim();
    const lastName = String(draft.lastName||'').trim();
    const fallbackName = `${firstName} ${lastName}`.trim();
    const name=String(draft.name || fallbackName).trim();
    const pickedJobFunction = selectedJobFunction?.(draft.jobFunctionId) || null;
    const jobFunctionId=String(pickedJobFunction?.id || '').trim();
    if(!name || !jobFunctionId){
      return {ok:false,message:'Name and job function are required. Create job functions in Restaurant, then select one here.'};
    }
    const role = Restogogo.registry.normalizeRole(draft.role || employee.role);
    if(!role)return {ok:false,message:'Employee role is invalid. Choose a valid role before saving.'};
    const estimatedHourlyCost = Number(draft.estimatedHourlyCost) || Number(pickedJobFunction?.estimatedHourlyCost) || 0;
    const pickedContractType = selectedContractType?.(draft.contractTypeId) || null;
    Object.assign(employee,{
      name,
      firstName,
      lastName,
      jobFunctionId,
      active:draft.active !== false,
      role,
      badgeEnabled:draft.badgeEnabled !== false,
      accessStatus:employee.accessStatus || '',
      email:String(draft.email||'').trim(),
      phone:String(draft.phone||'').trim(),
      address:String(draft.address||'').trim(),
      postalCode:String(draft.postalCode||'').trim(),
      city:String(draft.city||'').trim(),
      nationality:String(draft.nationality||'').trim(),
      contractTypeId:String(pickedContractType?.id || draft.contractTypeId || '').trim(),
      contractType:String(pickedContractType?.name || draft.contractType||'').trim(),
      contractStart:normalizeDateString(draft.contractStart),
      contractEnd:normalizeDateString(draft.contractEnd),
      contractHours:Number(draft.contractHours)||0,
      workRegime:String(draft.workRegime||'').trim(),
      estimatedHourlyCost,
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
