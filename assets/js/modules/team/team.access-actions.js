(function(){
  async function resetEmployeePin(options={}){
    const employee=options.employee;
    const button=options.button;
    const isDirty=options.isDirty || (()=>false);
    const loadData=options.loadData || (()=>Promise.resolve());
    const render=options.render || (()=>{});
    if(!employee?.id)return;
    if(isDirty(employee)){
      Restogogo.ui?.toast?.('Save or cancel profile changes before resetting the PIN.', {tone:'warning', icon:'alert', centered:true});
      return;
    }
    const input = button?.closest('[data-team-profile-panel]')?.querySelector('[data-team-pin-input]');
    const pin = String(input?.value || '').trim();
    if(pin && !/^\d{4}$/.test(pin)){
      Restogogo.ui?.toast?.('PIN must be exactly 4 digits.', {tone:'warning', icon:'alert', centered:true});
      input?.focus?.();
      return;
    }
    if(button)button.disabled = true;
    try{
      const result = await window.RestogogoAuthService?.resetEmployeePin?.({
        p_restaurant_id:window.Restogogo?.workspace?.current?.()?.restaurantId || window.DataAdapter?.getWorkspaceId?.(),
        p_employee_id:employee.id,
        p_pin:pin || null,
        p_require_change:true
      });
      if(input)input.value = '';
      await loadData();
      render();
      const tempPin = result?.temporary_pin ? ` Temporary PIN: ${result.temporary_pin}` : '';
      Restogogo.ui?.toast?.(`${employee.name || 'Employee'} PIN reset.${tempPin}`, {tone:'success', icon:'check', centered:true, timeout:5200});
    }catch(error){
      Restogogo.ui?.toast?.(error?.message || 'PIN reset failed.', {tone:'danger', icon:'alert', centered:true, timeout:3600});
    }finally{
      if(button)button.disabled = false;
    }
  }

  Restogogo.modules.TeamAccessActions={resetEmployeePin};
})();
