(function(){
  // PINs are owner-untouchable: a teammate sets their own PIN when they accept
  // their invite, and changes it themselves later. The owner only invites and
  // (for offboarding) disables access — never sets or resets a PIN.
  async function inviteEmployee(options={}){
    const employee=options.employee;
    const button=options.button;
    const isDirty=options.isDirty || (()=>false);
    const loadData=options.loadData || (()=>Promise.resolve());
    const render=options.render || (()=>{});
    if(!employee?.id)return;
    if(isDirty(employee)){
      Restogogo.ui?.toast?.('Save or cancel profile changes before sending an invite.', {tone:'warning', icon:'alert', centered:true});
      return;
    }
    const email = String(employee.email || '').trim();
    if(!email || !email.includes('@')){
      Restogogo.ui?.toast?.('Add an email address to this employee before inviting.', {tone:'warning', icon:'alert', centered:true});
      return;
    }
    const roleSelect = button?.closest('[data-team-profile-panel]')?.querySelector('[data-team-invite-role]');
    const role = String(roleSelect?.value || 'employee').trim().toLowerCase();
    if(button)button.disabled = true;
    try{
      await window.RestogogoAuthService?.inviteEmployee?.({
        restaurant_id:window.Restogogo?.workspace?.current?.()?.restaurantId || window.DataAdapter?.getWorkspaceId?.(),
        employee_id:employee.id,
        email,
        role,
        first_name:employee.firstName || '',
        last_name:employee.lastName || ''
      });
      await loadData();
      render();
      Restogogo.ui?.toast?.(`Invitation sent to ${email}.`, {tone:'success', icon:'check', centered:true, timeout:4200});
    }catch(error){
      Restogogo.ui?.toast?.(error?.message || 'Invitation failed.', {tone:'danger', icon:'alert', centered:true, timeout:3600});
    }finally{
      if(button)button.disabled = false;
    }
  }

  Restogogo.modules.TeamAccessActions={inviteEmployee};
})();
