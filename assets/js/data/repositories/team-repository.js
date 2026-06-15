/* restogogo Team repository — Team setup/access payloads only. */
(function(){
  function create(context){
    const U = window.RestogogoRepositoryUtils.create(context);
    const {getWorkspaceId, auth, okSnapshot, fail, text, date, num} = U;

    function employeeRowsFromState(source){
      return (Array.isArray(source?.employees) ? source.employees : []).map((employee,index)=>({
        id:text(employee.id),
        restaurant_id:getWorkspaceId(),
        display_name:text(employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim()),
        first_name:text(employee.firstName),
        last_name:text(employee.lastName),
        job_function_id:text(employee.jobFunctionId) || null,
        active:employee.active !== false,
        sort_order:index
      })).filter(row=>row.id && row.display_name);
    }
    function contactRowsFromState(source){
      return (Array.isArray(source?.employees) ? source.employees : []).map(employee=>({
        restaurant_id:getWorkspaceId(),
        employee_id:text(employee.id),
        email:text(employee.email) || null,
        phone:text(employee.phone) || null,
        address_line1:text(employee.address) || null,
        postal_code:text(employee.postalCode) || null,
        city:text(employee.city) || null,
        emergency_name:text(employee.emergencyName) || null,
        emergency_relation:text(employee.emergencyRelation) || null,
        emergency_phone:text(employee.emergencyPhone) || null,
        notes:text(employee.notes) || null
      })).filter(row=>row.employee_id);
    }
    function legalRowsFromState(source){
      return (Array.isArray(source?.employees) ? source.employees : []).map(employee=>({
        restaurant_id:getWorkspaceId(),
        employee_id:text(employee.id),
        birth_date:date(employee.birthDate) || null,
        national_registry_number:text(employee.socialSecurityNo) || null,
        sex:text(employee.sex) || null,
        nationality:text(employee.nationality) || null,
        language:text(employee.language) || null
      })).filter(row=>row.employee_id);
    }
    function contractRowsFromState(source){
      return (Array.isArray(source?.employees) ? source.employees : []).map(employee=>({restaurant_id:getWorkspaceId(), employee_id:text(employee.id), contract_type_id:text(employee.contractTypeId) || null, contract_type:text(employee.contractType) || null, job_function_id:text(employee.jobFunctionId) || null, work_regime:text(employee.workRegime) || null, contract_start:date(employee.contractStart) || null, contract_end:date(employee.contractEnd) || null, weekly_contract_hours:num(employee.contractHours), contract_days:num(employee.contractDays), annual_leave_entitlement_days:num(employee.annualLeaveEntitlementDays), active:true})).filter(row=>row.employee_id);
    }
    function payrollRowsFromState(source){
      return (Array.isArray(source?.employees) ? source.employees : []).map(employee=>({restaurant_id:getWorkspaceId(), employee_id:text(employee.id), payroll_provider:text(employee.payrollProvider) || text(source?.restaurantSetup?.payrollRules?.provider) || null, payroll_employee_id:text(employee.payrollId) || null, iban:text(employee.iban) || null, bic:text(employee.bic) || null, hourly_wage_rate:num(employee.hourlyWageRate), estimated_hourly_cost:num(employee.estimatedHourlyCost), company_cost_formula:text(employee.companyCostFormula) || null, payroll_notes:text(employee.payrollNotes) || null})).filter(row=>row.employee_id);
    }
    function accessStatusFromEmployee(employee){
      if(employee?.active === false)return 'disabled';
      const status = text(employee?.accessStatus).toLowerCase();
      if(['active','invited','temporary','not_invited','disabled'].includes(status))return status;
      if(text(employee?.pinStatus).toLowerCase() === 'active' && employee?.badgeEnabled !== false)return 'active';
      return 'not_invited';
    }
    function accessRowsFromState(source){
      return (Array.isArray(source?.employees) ? source.employees : []).map(employee=>{
        const status = accessStatusFromEmployee(employee);
        return {
          restaurant_id:getWorkspaceId(),
          employee_id:text(employee.id),
          profile_id:text(employee.profileId) || null,
          access_status:status,
          badge_enabled:status !== 'disabled' && employee.badgeEnabled !== false
        };
      }).filter(row=>row.employee_id);
    }

    async function saveTeam(source){
      const employees = employeeRowsFromState(source);
      if(!employees.length)return fail('Team save blocked: at least one employee is required.', {code:'missing_employees'});
      try{
        const result = await auth()?.saveTeamSetup?.({
          p_restaurant_id:getWorkspaceId(),
          p_employees:employees,
          p_contacts:contactRowsFromState(source),
          p_legal_profiles:legalRowsFromState(source),
          p_contracts:contractRowsFromState(source),
          p_payroll_profiles:payrollRowsFromState(source),
          p_access:accessRowsFromState(source)
        });
        return okSnapshot(result?.runtime_snapshot || result || null, {source:'team'});
      }catch(error){
        return fail(error?.message || String(error || 'Team save failed.'), {code:'team_save_failed'});
      }
    }
    return Object.freeze({saveTeam});
  }
  window.RestogogoTeamRepository = Object.freeze({create});
})();
