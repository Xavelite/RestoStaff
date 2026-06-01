(function(){
  let selectedEmployeeId = '';
  let teamSearch = '';
  let teamFilter = 'all';
  let teamTab = 'setup';
  let absenceEntryOpen = false;
  let bound = false;
  let creatingEmployeeId = '';
  const profileDrafts = {};

  const TeamModel = Restogogo.modules.TeamModel;
  const TeamView = Restogogo.modules.TeamView;
  const payrollMissingFields = TeamModel.payrollMissingFields;
  const TeamProfileDomain = Restogogo.modules.TeamProfileDomain;
  const TeamAccessActions = Restogogo.modules.TeamAccessActions;
  const EMPLOYEE_FIELDS = TeamProfileDomain.EMPLOYEE_FIELDS;

  function isSensitiveTeamTab(tab){return ['contract','payroll'].includes(String(tab || ''));}
  function canSeeSensitiveTeamData(){return Restogogo.registry?.isOwner?.(session.role) === true;}
  function normalizeTeamTab(value){
    const requested = String(value || 'general');
    return !canSeeSensitiveTeamData() && isSensitiveTeamTab(requested) ? 'general' : requested;
  }

  function teamLocalSnapshot(){
    return {
      selectedEmployeeId,
      teamSearch,
      teamFilter,
      teamTab,
      absenceEntryOpen,
      creatingEmployeeId,
      profileDrafts:clone(profileDrafts)
    };
  }

  function restoreTeamLocalSnapshot(snapshot){
    if(!snapshot)return;
    selectedEmployeeId=snapshot.selectedEmployeeId || '';
    teamSearch=snapshot.teamSearch || '';
    teamFilter=snapshot.teamFilter || 'all';
    teamTab=normalizeTeamTab(snapshot.teamTab || 'setup');
    absenceEntryOpen=!!snapshot.absenceEntryOpen;
    creatingEmployeeId=snapshot.creatingEmployeeId || '';
    Object.keys(profileDrafts).forEach(key=>delete profileDrafts[key]);
    Object.assign(profileDrafts, clone(snapshot.profileDrafts || {}));
  }

  function visibleDirectoryEmployees(){
    return TeamModel.visibleEmployees(data?.employees || [], teamSearch, teamFilter);
  }

  function selectedEmployee(){
    const employees = data?.employees || [];
    const selected = employees.find(employee=>employee.id===selectedEmployeeId) || null;
    const visible = visibleDirectoryEmployees();
    if(visible.length && !visible.some(employee=>employee.id===selectedEmployeeId) && !isDirty(selected)){
      selectedEmployeeId = visible[0].id;
    } else if(!selected){
      selectedEmployeeId = activeEmployees()[0]?.id || employees[0]?.id || '';
    }
    return employees.find(employee=>employee.id===selectedEmployeeId) || null;
  }

  function employeeDraft(employee){
    if(!employee)return null;
    if(!profileDrafts[employee.id])profileDrafts[employee.id]=TeamProfileDomain.toDraft(employee);
    return profileDrafts[employee.id];
  }

  function draftForRender(employee){
    if(!employee)return null;
    return profileDrafts[employee.id] ? {...employee,...profileDrafts[employee.id]} : employee;
  }

  function isDirty(employee){
    return !!(employee && profileDrafts[employee.id]);
  }

  function render(){
    teamTab = normalizeTeamTab(teamTab);
    const root=$('teamRoot');
    if(!root||!data)return;
    const listScroll=root.querySelector('.team-list')?.scrollTop || 0;
    ensure(data);
    const employee=selectedEmployee();
    root.innerHTML=TeamView.render({
      employees:data.employees || [],
      selectedEmployeeId,
      teamSearch,
      teamFilter,
      teamTab,
      employee:draftForRender(employee),
      dirty:isDirty(employee),
      isNew:employee?.id === creatingEmployeeId,
      positionChoices:positionChoices(),
      absenceTypes:absenceTypeChoices(),
      absenceEntryOpen
    });
    const nextList=root.querySelector('.team-list');
    if(nextList)nextList.scrollTop=listScroll;
    Restogogo.ui?.animateCounters?.(root.querySelector('.team-metrics'));
  }

  function showDirtyState(){
    const actions=document.querySelector('[data-team-actions]');
    if(!actions)return;
    actions.classList.remove('is-clean');
    actions.classList.add('is-dirty');
    actions.querySelectorAll('button').forEach(button=>button.disabled=false);
    actions.querySelector('.is-save')?.classList.add('is-active');
  }

  function positionChoices(){
    const setupPositions = Array.isArray(data?.restaurantSetup?.positions) ? data.restaurantSetup.positions : [];
    return setupPositions
      .filter(position=>position && position.active !== false && cleanPositionName(position.name))
      .map(position=>({
        id:String(position.id || normalizeSlug(position.name,'position')).trim(),
        name:cleanPositionName(position.name),
        hourlyCost:Number.isFinite(Number(position.hourlyCost)) ? Math.max(0,Number(position.hourlyCost)) : 0
      }))
      .filter(position=>position.id && position.name);
  }

  function absenceTypeChoices(){
    const types = normalizeAbsenceTypeList(data?.restaurantSetup?.absenceTypes);
    if(data?.restaurantSetup)data.restaurantSetup.absenceTypes = types;
    return types.filter(type=>type.active !== false);
  }

  function selectedAbsenceType(absenceTypeId){
    const idValue = String(absenceTypeId || '').trim();
    return absenceTypeChoices().find(type=>type.id === idValue) || null;
  }

  function selectedPosition(positionId){
    const idValue = String(positionId || '').trim();
    return positionChoices().find(position=>position.id === idValue) || null;
  }

  function addEmployee(){
    const defaultPosition = positionChoices()[0] || null;
    if(!defaultPosition){
      Restogogo.ui?.toast?.('Create at least one active position in Restaurant before adding employees.',{tone:'warning',icon:'alert',centered:true});
      Restogogo.shell?.showPage?.('restaurant');
      return;
    }
    const target=TeamProfileDomain.createEmployee(defaultPosition);
    // Direct push is intentional: this is an in-memory draft that has no
    // Supabase record yet. saveProfile() → commitStateMutation handles persistence.
    data.employees.push(target);
    selectedEmployeeId=target.id;
    creatingEmployeeId=target.id;
    profileDrafts[target.id]=TeamProfileDomain.toDraft(target);
    teamSearch='';
    teamFilter='all';
    teamTab='general';
    render();
    requestAnimationFrame(()=>document.querySelector('[data-team-field="firstName"]')?.focus?.());
  }

  function updateDraftFromField(field){
    const employee=selectedEmployee();
    if(!employee || !field?.name || !EMPLOYEE_FIELDS.includes(field.name))return;
    const draft=employeeDraft(employee);
    draft[field.name]=TeamProfileDomain.normalizedDraftValue(field.name, field.value);
    if(field.name === 'positionId'){
      const position = selectedPosition(draft.positionId);
      if(position && !Number(draft.hourlyCost))draft.hourlyCost = Number(position.hourlyCost) || 0;
    }
    showDirtyState();
  }

  function applyDraftToEmployee(employee,draft){
    const result=TeamProfileDomain.applyDraftToEmployee({
      employee,
      draft,
      selectedPosition,
      payrollMissingFields
    });
    if(!result.ok){
      Restogogo.ui?.toast?.(result.message || 'Employee profile is incomplete.',{tone:'warning',icon:'alert',centered:true});
      return false;
    }
    return true;
  }


  async function saveProfile(){
    const employee=selectedEmployee();
    if(!employee)return;
    const draft=employeeDraft(employee);
    await Restogogo.stateService.commitStateMutation({
      saveAction:window.RestogogoSaveContract.actions.teamProfile(),
      snapshotLocal:teamLocalSnapshot,
      restoreLocal:restoreTeamLocalSnapshot,
      mutate:()=>{
        if(!applyDraftToEmployee(employee,draft))throw new Error('Employee profile is incomplete.');
      },
      render,
      renderBeforeSave:false,
      renderOnSuccess:true,
      successMessage:'Employee profile saved.',
      errorMessage:'Employee profile could not be saved. The change was rolled back.',
      onSuccess:()=>{
        delete profileDrafts[employee.id];
        if(creatingEmployeeId === employee.id)creatingEmployeeId='';
      },
      onError:()=>showDirtyState()
    });
  }

  function cancelProfile(){
    const employee=selectedEmployee();
    if(!employee)return;
    if(creatingEmployeeId === employee.id){
      // Direct filter is intentional: we're discarding an unsaved draft that was
      // never persisted, so there is no DB record to roll back via commitStateMutation.
      data.employees=data.employees.filter(item=>item.id!==employee.id);
      delete profileDrafts[employee.id];
      creatingEmployeeId='';
      selectedEmployeeId=activeEmployees()[0]?.id || data.employees[0]?.id || '';
    } else {
      delete profileDrafts[employee.id];
    }
    render();
  }

  async function addAbsence(button){
    const employee=selectedEmployee();
    if(!employee)return;
    const form=button.closest('[data-team-absence-form]');
    if(!form)return;
    const values=Object.fromEntries(new FormData(form).entries());
    const start=normalizeDateString(values.absenceStart);
    const end=normalizeDateString(values.absenceEnd) || start;
    if(!start){
      Restogogo.ui?.toast?.('Start date is required.',{tone:'warning',icon:'alert',centered:true});
      return;
    }
    if(end < start){
      Restogogo.ui?.toast?.('End date cannot be before start date.',{tone:'warning',icon:'alert',centered:true});
      return;
    }
    const type = selectedAbsenceType(values.absenceTypeId) || absenceTypeChoices()[0] || null;
    const status = ['Pending','Approved','Rejected','Cancelled'].includes(values.absenceStatus) ? values.absenceStatus : 'Approved';
    const now = new Date().toISOString();
    const absenceRecord = {
      id:`absence-${id()}`,
      absenceTypeId:type?.id || '',
      start,
      end,
      shift:values.absenceShift || 'Full day',
      reason:type?.name || String(values.absenceReason||'Absence').trim(),
      status,
      requestedBy:'manager',
      approvedBy:status === 'Approved' ? 'manager' : '',
      approvedAt:status === 'Approved' ? now : '',
      rejectedBy:status === 'Rejected' ? 'manager' : '',
      rejectedAt:status === 'Rejected' ? now : '',
      cancelledAt:status === 'Cancelled' ? now : '',
      managerComment:String(values.managerComment||'').trim(),
      payrollExportStatus:'Not exported'
    };
    await Restogogo.stateService.commitStateMutation({
      saveAction:window.RestogogoSaveContract.actions.absence(window.RestogogoSaveContract.ACTION.ABSENCE.CREATE_BY_MANAGER,{
        employeeId:employee.id,
        payload:{
          absence_type_id:absenceRecord.absenceTypeId,
          start_date:absenceRecord.start,
          end_date:absenceRecord.end,
          service_key:absenceRecord.shift === 'Full day' ? null : String(absenceRecord.shift || '').toLowerCase(),
          status:String(absenceRecord.status || 'Approved').toLowerCase(),
          manager_comment:absenceRecord.managerComment || 'Created by manager.',
          duration_days:absenceRecord.durationDays || null,
          duration_hours:absenceRecord.durationHours || null,
          metadata:{source:'team'}
        }
      }),
      snapshotLocal:teamLocalSnapshot,
      restoreLocal:restoreTeamLocalSnapshot,
      mutate:()=>{
        employee.absences=Array.isArray(employee.absences)?employee.absences:[];
        employee.absences.push(absenceRecord);
        if(profileDrafts[employee.id]){
          profileDrafts[employee.id].absences = Array.isArray(profileDrafts[employee.id].absences) ? profileDrafts[employee.id].absences : [];
          profileDrafts[employee.id].absences.push({...absenceRecord});
        }
        addNotification(`absence-${employee.id}-${Date.now()}`,'warning','Absence added',`${employee.name} · ${start}`,{kind:'employee',id:employee.id});
      },
      render:()=>Restogogo.shell?.render?.(),
      renderBeforeSave:false,
      renderOnSuccess:true,
      successMessage:'Absence added.',
      errorMessage:'Absence was not saved. The change was rolled back.',
      onSuccess:()=>{ absenceEntryOpen=false; }
    });
  }


  async function resetEmployeePin(button){
    return TeamAccessActions.resetEmployeePin({
      employee:selectedEmployee(),
      button,
      isDirty,
      loadData:load,
      render
    });
  }


  function focusContractEnd(){
    teamTab='contract';
    render();
    requestAnimationFrame(()=>document.querySelector('[data-team-field="contractEnd"]')?.focus?.());
  }

  async function updateAbsenceStatus(button,status){
    const employee=selectedEmployee();
    if(!employee)return;
    const absenceId = String(button?.dataset?.absenceId || '').trim();
    if(!absenceId)return;
    const absences = Array.isArray(employee.absences) ? employee.absences : [];
    const absence = absences.find(item=>item.id === absenceId);
    if(!absence)return;
    const cleanStatus = ['Approved','Rejected','Cancelled'].includes(status) ? status : 'Pending';
    const now = new Date().toISOString();
    const label = cleanStatus === 'Approved' ? 'Absence approved' : (cleanStatus === 'Rejected' ? 'Absence rejected' : 'Absence cancelled');
    await Restogogo.stateService.commitStateMutation({
      saveAction:window.RestogogoSaveContract.actions.absence(
        cleanStatus === 'Approved' ? window.RestogogoSaveContract.ACTION.ABSENCE.APPROVE : (cleanStatus === 'Rejected' ? window.RestogogoSaveContract.ACTION.ABSENCE.REJECT : window.RestogogoSaveContract.ACTION.ABSENCE.CANCEL_BY_MANAGER),
        {
          employeeId:employee.id,
          absenceId,
          payload:{
          manager_comment:cleanStatus === 'Rejected' ? (absence.managerComment || 'Rejected by manager.') : (absence.managerComment || null),
          cancellation_reason:cleanStatus === 'Cancelled' ? 'Cancelled by manager.' : null,
          metadata:{source:'team'}
          }
        }
      ),
      snapshotLocal:teamLocalSnapshot,
      restoreLocal:restoreTeamLocalSnapshot,
      mutate:()=>{
        absence.status = cleanStatus;
        if(cleanStatus === 'Approved'){
          absence.approvedBy = 'manager';
          absence.approvedAt = now;
          absence.rejectedBy = '';
          absence.rejectedAt = '';
          absence.cancelledAt = '';
        }
        if(cleanStatus === 'Rejected'){
          absence.rejectedBy = 'manager';
          absence.rejectedAt = now;
          absence.approvedBy = '';
          absence.approvedAt = '';
          absence.cancelledAt = '';
        }
        if(cleanStatus === 'Cancelled'){
          absence.cancelledAt = now;
        }
        if(profileDrafts[employee.id]){
          const draftAbsences = Array.isArray(profileDrafts[employee.id].absences) ? profileDrafts[employee.id].absences : [];
          const draftAbsence = draftAbsences.find(item=>item.id === absenceId);
          if(draftAbsence)Object.assign(draftAbsence,{...absence});
        }
      },
      render:()=>Restogogo.shell?.render?.(),
      successMessage:label,
      successTone:cleanStatus === 'Approved' ? 'success' : 'warning',
      successIcon:cleanStatus === 'Approved' ? 'check' : 'alert',
      errorMessage:'Absence status was not saved. The change was rolled back.'
    });
  }


  function firstEmployeeMatching(predicate){
    return (data?.employees || []).filter(employee=>employee.active !== false).find(predicate) || null;
  }

  function openTeamSetupTarget(key){
    const target=String(key || '').trim();
    if(target==='roster'){
      if(!(data?.employees || []).some(employee=>employee.active !== false))return addEmployee();
      teamTab='general';
    }
    if(target==='positions'){
      if(!positionChoices().length){Restogogo.shell?.showPage?.('restaurant'); return;}
      const positionIds = new Set(positionChoices().map(position=>String(position.id)));
      const employee = firstEmployeeMatching(item=>!positionIds.has(String(item.positionId || '')));
      if(employee)selectedEmployeeId=employee.id;
      teamTab='general';
    }
    if(target==='badges'){
      const employee = firstEmployeeMatching(item=>!String(item.loginName || '').trim() || item.quickLoginEnabled === false);
      if(employee)selectedEmployeeId=employee.id;
      teamTab='general';
    }
    if(target==='contracts'){
      const employee = firstEmployeeMatching(item=>TeamModel.contractMissingFields(item).length);
      if(employee)selectedEmployeeId=employee.id;
      teamTab='contract';
    }
    if(target==='payroll'){
      const employee = firstEmployeeMatching(item=>payrollMissingFields(item).length);
      if(employee)selectedEmployeeId=employee.id;
      teamTab='payroll';
    }
    if(target==='absences'){
      const employee = firstEmployeeMatching(item=>!Number(item.annualLeaveEntitlementDays) || (item.absences || []).some(absence=>String(absence.status || 'Pending') === 'Pending'));
      if(employee)selectedEmployeeId=employee.id;
      teamTab='absences';
    }
    absenceEntryOpen=false;
    render();
  }

  function handleAction(action,target){
    const employee=selectedEmployee();
    if(action==='add-employee')return addEmployee();
    if(!employee)return;
    if(action==='save-profile')return void saveProfile();
    if(action==='cancel-profile')return cancelProfile();
    if(action==='reset-pin')return void resetEmployeePin(target);
    if(action==='add-absence')return addAbsence(target);
    if(action==='approve-absence')return updateAbsenceStatus(target,'Approved');
    if(action==='reject-absence')return updateAbsenceStatus(target,'Rejected');
    if(action==='cancel-absence')return updateAbsenceStatus(target,'Cancelled');
    if(action==='renew-contract')return focusContractEnd();
    if(action==='remove-absence'){
      return updateAbsenceStatus(target,'Cancelled');
    }
  }

  function bind(){
    if(bound)return;
    bound=true;
    const root=$('teamRoot');
    root?.addEventListener('click',event=>{
      const setupTarget=event.target.closest('[data-team-setup-target]');
      if(setupTarget){event.preventDefault(); openTeamSetupTarget(setupTarget.dataset.teamSetupTarget); return;}
      const select=event.target.closest('[data-team-select]');
      if(select){selectedEmployeeId=select.dataset.teamSelect; if(teamTab==='setup')teamTab='general'; absenceEntryOpen=false; render(); return;}
      const filter=event.target.closest('[data-team-filter]');
      if(filter){teamFilter=filter.dataset.teamFilter || 'all'; render(); return;}
      const tab=event.target.closest('[data-team-tab]');
      if(tab){teamTab=normalizeTeamTab(tab.dataset.teamTab || 'general'); if(teamTab!=='absences')absenceEntryOpen=false; render(); return;}
      const requestToggle=event.target.closest('[data-team-toggle-request]');
      if(requestToggle){
        absenceEntryOpen = !absenceEntryOpen;
        render();
        return;
      }
      const action=event.target.closest('[data-team-action]');
      if(action){event.preventDefault(); handleAction(action.dataset.teamAction, action);}
    });
    root?.addEventListener('input',event=>{
      const search=event.target.closest('[data-team-search]');
      if(search){
        teamSearch=search.value;
        render();
        requestAnimationFrame(()=>{
          const next=document.querySelector('[data-team-search]');
          next?.focus?.({preventScroll:true});
          try{next?.setSelectionRange?.(teamSearch.length,teamSearch.length);}catch{}
        });
        return;
      }
      const field=event.target.closest('[data-team-field]');
      if(field)updateDraftFromField(field);
    });
    root?.addEventListener('change',event=>{
      const field=event.target.closest('[data-team-field]');
      if(field)updateDraftFromField(field);
    });
  }

  Restogogo.team={render,bind,model:Restogogo.modules.TeamModel};
})();
