(function(){
  let section = 'setup';
  let operationMode = 'zones';
  let selectedZoneId = '';
  let selectedJobFunctionId = '';
  let zonePage = 0;
  let bound = false;
  let dirty = false;
  let savedSnapshot = null;
  const ZONE_PAGE_SIZE = 99;

  const RestaurantModel = Restogogo.modules.RestaurantModel;
  const RestaurantView = Restogogo.modules.RestaurantView;
  const setup = RestaurantModel.setup;
  const zones = RestaurantModel.zones;
  const setupJobFunctions = RestaurantModel.jobFunctions;

  function snapshot(){
    ensure(data);
    return {
      restaurant: clone(data.restaurant || {}),
      restaurantSetup: clone(data.restaurantSetup || {})
    };
  }

  function ensureSnapshot(){
    if(!savedSnapshot)savedSnapshot = snapshot();
  }

  function selectedZone(){
    const list=zones(true);
    if(!selectedZoneId || !list.some(zone=>zone.id===selectedZoneId)) selectedZoneId=list.find(zone=>zone.active!==false)?.id || list[0]?.id || '';
    return list.find(zone=>zone.id===selectedZoneId) || null;
  }

  function selectedJobFunction(){
    const list=setupJobFunctions(true);
    if(!selectedJobFunctionId || !list.some(jobFunction=>jobFunction.id===selectedJobFunctionId)) selectedJobFunctionId=list.find(jobFunction=>jobFunction.active!==false)?.id || list[0]?.id || '';
    return list.find(jobFunction=>jobFunction.id===selectedJobFunctionId) || null;
  }

  function bindRenderedActions(root){
    root.querySelectorAll('[data-restaurant-action]').forEach(button=>{
      button.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        void handleAction(button.getAttribute('data-restaurant-action'), button);
      });
    });
  }

  function render(){
    const root=$('restaurantRoot');
    if(!root||!data)return;
    ensure(data);
    ensureSnapshot();
    root.innerHTML=RestaurantView.render({
      section,
      operationMode,
      selectedZoneId,
      selectedJobFunctionId,
      zonePage,
      selectedZone:selectedZone(),
      selectedJobFunction:selectedJobFunction(),
      dirty
    });
    bindRenderedActions(root);
    Restogogo.ui?.animateCounters?.(root.querySelector('.restaurant-metrics'));
  }

  function showDirtyState(){
    const actions=document.querySelector('[data-restaurant-actions]');
    if(!actions)return;
    actions.classList.remove('is-clean');
    actions.classList.add('is-dirty');
    actions.querySelectorAll('button').forEach(button=>button.disabled=false);
    actions.querySelector('.is-save')?.classList.add('is-active');
  }

  function markDirty({rerender=false}={}){
    ensureSnapshot();
    dirty = true;
    if(rerender)render();
    else showDirtyState();
  }

  async function persist(){
    ensure(data);
    const ok = await Restogogo.stateService.commitStateMutation({
      saveAction:window.RestogogoSaveContract.actions.restaurantSetup(),
      mutate:()=>{},
      rollback:false,
      renderBeforeSave:false,
      successMessage:'Restaurant setup saved.',
      errorMessage:'Restaurant setup could not be saved. The changes were rolled back.',
      onSuccess:()=>{
        savedSnapshot = snapshot();
        dirty = false;
        Restogogo.shell?.render?.();
      },
      onError:()=>restoreSnapshot()
    });
    return ok === true;
  }

  function restoreSnapshot(){
    if(!savedSnapshot)return;
    data.restaurant = clone(savedSnapshot.restaurant || {});
    data.restaurantSetup = clone(savedSnapshot.restaurantSetup || {});
    dirty = false;
    render();
  }

  function addZone(){
    const name=`Zone ${zones(true).length + 1}`;
    const zone={id:(crypto.randomUUID ? crypto.randomUUID() : `zone-${id()}`),name,active:true,defaultTimes:{Lunch:'',Evening:''},notes:''};
    const restaurantSetup=setup();
    restaurantSetup.zones.push(zone);
    selectedZoneId=zone.id;
    zonePage=Math.max(0,Math.ceil(zones(true).length / ZONE_PAGE_SIZE) - 1);
    operationMode='zones';
    section='operations';
    markDirty({rerender:true});
  }

  function addJobFunction(){
    const name=`Job function ${setupJobFunctions(true).length + 1}`;
    const jobFunction={id:(crypto.randomUUID ? crypto.randomUUID() : `job-function-${id()}`),name,active:true,estimatedHourlyCost:0,metadata:{}};
    const restaurantSetup=setup();
    restaurantSetup.jobFunctions.push(jobFunction);
    selectedJobFunctionId=jobFunction.id;
    operationMode='jobFunctions';
    section='operations';
    markDirty({rerender:true});
  }

  function referenceList(type){
    const restaurantSetup=setup();
    restaurantSetup[type]=Array.isArray(restaurantSetup[type]) ? restaurantSetup[type] : [];
    return restaurantSetup[type];
  }

  function referenceDefaults(type, list=[], restaurantSetup={}){
    const label = type === 'departments' ? 'Department' : (type === 'teams' ? 'Team' : 'Contract type');
    const slug = type === 'departments' ? 'department' : (type === 'teams' ? 'team' : 'contract-type');
    const name = `${label} ${list.length + 1}`;
    const record = {id:(crypto.randomUUID ? crypto.randomUUID() : `${slug}-${id()}`), name, active:true, metadata:{}};
    if(type === 'teams')record.departmentId = ((restaurantSetup.departments || []).find(item=>item.active !== false)?.id || '');
    if(type === 'contractTypes')record.category = 'other';
    return record;
  }

  function addReference(type){
    const restaurantSetup=setup();
    restaurantSetup[type]=Array.isArray(restaurantSetup[type]) ? restaurantSetup[type] : [];
    restaurantSetup[type].push(referenceDefaults(type, restaurantSetup[type], restaurantSetup));
    section='organization';
    markDirty({rerender:true});
  }

  function updateReference(input){
    const type=String(input?.dataset?.restaurantReference || '').trim();
    const referenceId=String(input?.dataset?.referenceId || '').trim();
    const field=String(input?.dataset?.referenceField || '').trim();
    if(!type || !referenceId || !field)return false;
    const item=referenceList(type).find(record=>String(record.id || '')===referenceId);
    if(!item)return false;
    if(field === 'active')item.active = input.value !== 'false';
    else if(field === 'departmentId')item.departmentId = String(input.value || '').trim();
    else if(field === 'category')item.category = ['permanent','fixed_term','student','flexi','extra','interim','self_employed','other'].includes(input.value) ? input.value : 'other';
    else item[field] = String(input.value || '').trim();
    item.metadata = isPlainObject(item.metadata) ? item.metadata : {};
    return true;
  }

  function absenceTypeCode(name, fallback){
    const raw=String(name || fallback || 'CUSTOM').trim().toUpperCase().replace(/[^A-Z0-9_]+/g,'_').replace(/^_+|_+$/g,'');
    return raw || 'CUSTOM';
  }

  function addAbsenceType(){
    const restaurantSetup=setup();
    const existing=normalizeAbsenceTypeList(restaurantSetup.absenceTypes || []);
    const count=existing.length + 1;
    const name=`Custom absence ${count}`;
    const code=absenceTypeCode(name,`CUSTOM_${count}`);
    restaurantSetup.absenceTypes=existing.concat([{
      id:(crypto.randomUUID ? crypto.randomUUID() : `absence-type-${id()}`),
      name,
      code,
      category:'other',
      paidPolicy:'neutral',
      payrollCode:code,
      color:'#94a3b8',
      requiresApproval:true,
      affectsPlanning:true,
      affectsPayroll:false,
      active:true,
      sortOrder:count * 10,
      metadata:{}
    }]);
    section='general';
    markDirty({rerender:true});
  }

  function updateAbsenceType(input){
    const typeId=String(input?.dataset?.absenceTypeId || '').trim();
    const field=String(input?.dataset?.absenceTypeField || '').trim();
    if(!typeId || !field)return false;
    const restaurantSetup=setup();
    const types=normalizeAbsenceTypeList(restaurantSetup.absenceTypes || []);
    const type=types.find(item=>String(item.id || '')===typeId);
    if(!type)return false;
    const value=input.type==='checkbox' ? !!input.checked : String(input.value || '').trim();
    if(field==='name')type.name=value || type.name;
    else if(field==='code')type.code=absenceTypeCode(value,type.code);
    else if(field==='category')type.category=['holiday','sick','unpaid','training','other'].includes(value) ? value : 'other';
    else if(field==='paidPolicy')type.paidPolicy=['paid','unpaid','neutral'].includes(value) ? value : 'neutral';
    else if(field==='payrollCode')type.payrollCode=absenceTypeCode(value,type.code);
    else if(field==='color')type.color=/^#[0-9a-fA-F]{6}$/.test(value) ? value : type.color;
    else if(['requiresApproval','affectsPlanning','affectsPayroll','active'].includes(field))type[field]=!!value;
    else return false;
    restaurantSetup.absenceTypes=types;
    if(field==='code')input.value=type.code;
    if(field==='payrollCode')input.value=type.payrollCode || '';
    return true;
  }


  function coverageCountValue(value){
    const raw = String(value ?? '').replace(/[^0-9]/g,'');
    const count = Math.round(Number(raw || 0));
    return Math.max(0,Math.min(20,Number.isFinite(count) ? count : 0));
  }

  function coverageRequirementSortOrder(zoneId,serviceKey,jobFunctionId){
    const zoneIndex=Math.max(0,zones(true).findIndex(zone=>String(zone?.id || '')===String(zoneId || '')));
    const serviceIndex=Math.max(0,shifts.indexOf(serviceKey));
    const jobFunctionIndex=Math.max(0,setupJobFunctions(true).findIndex(jobFunction=>String(jobFunction?.id || '')===String(jobFunctionId || '')));
    return (zoneIndex * 1000) + (serviceIndex * 100) + jobFunctionIndex;
  }

  function coverageCellKey(zoneId,serviceKey,jobFunctionId){
    return `${String(zoneId || '').trim()}|${String(serviceKey || '').trim()}|${String(jobFunctionId || '').trim()}`;
  }

  function coverageInputIdentity(input){
    if(!input)return null;
    const zoneId=String(input.dataset.coverageZone || selectedZoneId || selectedZone()?.id || '').trim();
    const serviceKey=String(input.dataset.coverageService || '').trim();
    const jobFunctionId=String(input.dataset.coverageJobFunction || '').trim();
    const service=shifts.includes(serviceKey) ? serviceKey : '';
    if(!zoneId || !service || !jobFunctionId)return null;
    return {zoneId,serviceKey:service,jobFunctionId};
  }

  function coverageInputValue(input){
    return coverageCountValue(input?.value);
  }

  function coverageInputRequirement(input,valueOverride){
    const identity=coverageInputIdentity(input);
    if(!identity)return null;
    const requiredCount=valueOverride === undefined ? coverageInputValue(input) : coverageCountValue(valueOverride);
    input.value=String(requiredCount);
    return {
      zoneId:identity.zoneId,
      serviceKey:identity.serviceKey,
      jobFunctionId:identity.jobFunctionId,
      requiredCount,
      sortOrder:coverageRequirementSortOrder(identity.zoneId,identity.serviceKey,identity.jobFunctionId),
      metadata:{}
    };
  }

  function setCoverageRequirementCell(zoneId,serviceKey,jobFunctionId,requiredCount){
    const zoneKey=String(zoneId || '').trim();
    const service=shifts.includes(serviceKey) ? serviceKey : '';
    const roleId=String(jobFunctionId || '').trim();
    if(!zoneKey || !service || !roleId)return false;
    const restaurantSetup=setup();
    const current=normalizeCoverageRequirements(restaurantSetup.coverageRequirements || [], restaurantSetup, {keepZero:true});
    const targetKey=coverageCellKey(zoneKey,service,roleId);
    const next=current.filter(req=>coverageCellKey(req.zoneId,req.serviceKey,req.jobFunctionId)!==targetKey);
    next.push({
      zoneId:zoneKey,
      serviceKey:service,
      jobFunctionId:roleId,
      requiredCount:coverageCountValue(requiredCount),
      sortOrder:coverageRequirementSortOrder(zoneKey,service,roleId),
      metadata:{}
    });
    restaurantSetup.coverageRequirements=normalizeCoverageRequirements(next, restaurantSetup, {keepZero:true});
    return true;
  }

  function syncCoverageInput(input,valueOverride){
    const requirement=coverageInputRequirement(input,valueOverride);
    if(!requirement)return false;
    return setCoverageRequirementCell(requirement.zoneId,requirement.serviceKey,requirement.jobFunctionId,requirement.requiredCount);
  }

  function syncCoverageForm(form){
    const inputs=[...(form?.querySelectorAll?.('[data-coverage-zone][data-coverage-service][data-coverage-job-function]') || [])];
    if(!inputs.length)return;
    const edited=[];
    const editedKeys=new Set();
    inputs.forEach(input=>{
      const requirement=coverageInputRequirement(input);
      if(!requirement)return;
      edited.push(requirement);
      editedKeys.add(coverageCellKey(requirement.zoneId,requirement.serviceKey,requirement.jobFunctionId));
    });
    const restaurantSetup=setup();
    const retained=normalizeCoverageRequirements(restaurantSetup.coverageRequirements || [], restaurantSetup, {keepZero:true})
      .filter(req=>!editedKeys.has(coverageCellKey(req.zoneId,req.serviceKey,req.jobFunctionId)));
    restaurantSetup.coverageRequirements=normalizeCoverageRequirements(retained.concat(edited), restaurantSetup, {keepZero:true});
  }

  function applyZone(form){
    const zone=selectedZone();
    if(!zone)return;
    const values=Object.fromEntries(new FormData(form).entries());
    zone.name=String(values.name||'').trim() || zone.name;
    zone.active=values.active === 'true';
    zone.defaultTimes={
      Lunch:normalizeTimeRangeInput(values.defaultLunch) || '',
      Evening:normalizeTimeRangeInput(values.defaultEvening) || ''
    };
    syncCoverageForm(form);
    zone.metadata = isPlainObject(zone.metadata) ? Object.assign({}, zone.metadata) : {};
    delete zone.metadata.defaultTimes;
    delete zone.metadata.default_times;
  }

  function applyJobFunction(form){
    const jobFunction=selectedJobFunction();
    if(!jobFunction)return;
    const oldName=jobFunction.name;
    const values=Object.fromEntries(new FormData(form).entries());
    jobFunction.name=cleanJobFunctionName(values.name||oldName) || oldName;
    jobFunction.metadata = isPlainObject(jobFunction.metadata) ? jobFunction.metadata : {};
    jobFunction.estimatedHourlyCost=Number(values.estimatedHourlyCost)||0;
    jobFunction.active=values.active === 'true';
  }

  function applyPayroll(form){
    const values=Object.fromEntries(new FormData(form).entries());
    const restaurantSetup=setup();
    restaurantSetup.payrollRules.provider=String(values.provider||'').trim();
    restaurantSetup.payrollRules.exportFormat='CSV';
    restaurantSetup.payrollRules.costCenter=String(values.costCenter||'').trim();
  }

  function applyGeneral(form){
    const values=Object.fromEntries(new FormData(form).entries());
    data.restaurant.name=String(values.name||data.restaurant.name).trim();
    data.restaurant.city=String(values.city||'').trim();
    const restaurantSetup=setup();
    Object.assign(restaurantSetup.general,{
      city:String(values.city||'').trim(),
      email:String(values.email||'').trim(),
      address:String(values.address||'').trim()
    });
  }

  function applyForm(form){
    const type=form?.dataset?.restaurantForm;
    if(type==='zone')applyZone(form);
    if(type==='jobFunction')applyJobFunction(form);
    if(type==='payroll')applyPayroll(form);
    if(type==='general')applyGeneral(form);
  }

  function applyVisibleForms(){
    document.querySelectorAll('#restaurantRoot [data-restaurant-form]').forEach(form=>applyForm(form));
  }

  function updateHours(input){
    const day=input.dataset.hoursDay;
    const field=input.dataset.hoursField;
    const restaurantSetup=setup();
    restaurantSetup.openingHours[day]=restaurantSetup.openingHours[day] || {open:false,Lunch:'',Evening:''};
    if(field==='open')restaurantSetup.openingHours[day].open=input.checked;
    else restaurantSetup.openingHours[day][field]=normalizeTimeRangeInput(input.value)||input.value;
  }

  async function handleAction(action,target){
    if(action==='add-zone')return addZone();
    if(action==='add-jobFunction')return addJobFunction();
    if(action==='add-department')return addReference('departments');
    if(action==='add-team')return addReference('teams');
    if(action==='add-contract-type')return addReference('contractTypes');
    if(action==='add-absence-type')return addAbsenceType();
    if(action==='open-team')return Restogogo.shell?.showPage?.('team');
    if(action==='export-payroll-prep'){
      applyVisibleForms();
      Restogogo.export?.actuals?.payroll?.();
      return;
    }
    if(action==='save-restaurant'){
      const activeCoverageInput=document.activeElement?.closest?.('[data-coverage-zone][data-coverage-service][data-coverage-job-function]');
      if(activeCoverageInput)syncCoverageInput(activeCoverageInput,activeCoverageInput.value);
      applyVisibleForms();
      return persist();
    }
    if(action==='cancel-restaurant')return restoreSnapshot();
  }

  function changeZonePage(dir){
    const list=zones(true);
    const maxPage=Math.max(0,Math.ceil(list.length / ZONE_PAGE_SIZE) - 1);
    zonePage=Math.min(maxPage,Math.max(0,zonePage + dir));
    selectedZoneId=list[zonePage * ZONE_PAGE_SIZE]?.id || selectedZoneId;
    operationMode='zones';
    section='operations';
    render();
  }


  function openSetupTarget(key){
    const target=String(key || '').trim();
    if(['team','badges'].includes(target))return Restogogo.shell?.showPage?.('team');
    if(target==='payroll'){section='payroll'; render(); return;}
    if(['departments','teams','contractTypes'].includes(target)){section='organization'; render(); return;}
    if(target==='jobFunctions'){section='operations'; operationMode='jobFunctions'; render(); return;}
    if(['zones','coverage'].includes(target)){section='operations'; operationMode='zones'; render(); return;}
    section='general'; render();
  }

  function bind(){
    if(bound)return;
    bound=true;
    function restaurantEventRoot(event){
      return event.target?.closest?.('#restaurantRoot') || null;
    }
    document.addEventListener('click',event=>{
      if(!restaurantEventRoot(event))return;
      const setupTarget=event.target.closest('[data-restaurant-setup-target]');
      if(setupTarget){event.preventDefault(); openSetupTarget(setupTarget.dataset.restaurantSetupTarget); return;}
      const coverageStep=event.target.closest('[data-coverage-step]');
      if(coverageStep){
        event.preventDefault();
        const input=coverageStep.closest('[data-coverage-count]')?.querySelector('[data-coverage-zone][data-coverage-service][data-coverage-job-function]');
        if(input){
          const delta=Number(coverageStep.dataset.coverageStep || 0);
          syncCoverageInput(input,coverageCountValue(coverageInputValue(input) + delta));
          markDirty();
        }
        return;
      }
      const sec=event.target.closest('[data-restaurant-section]');
      if(sec){section=sec.dataset.restaurantSection||'general'; render(); return;}
      const ops=event.target.closest('[data-restaurant-ops]');
      if(ops){operationMode=ops.dataset.restaurantOps||'zones'; section='operations'; render(); return;}
      const page=event.target.closest('[data-restaurant-page]');
      if(page){event.preventDefault(); if(page.dataset.restaurantPage==='zones')changeZonePage(Number(page.dataset.restaurantPageDir)||0); return;}
      const zone=event.target.closest('[data-restaurant-zone]');
      if(zone){selectedZoneId=zone.dataset.restaurantZone; operationMode='zones'; section='operations'; render(); return;}
      const jobFunction=event.target.closest('[data-restaurant-jobFunction]');
      if(jobFunction){selectedJobFunctionId=jobFunction.dataset.restaurantJobFunction; operationMode='jobFunctions'; section='operations'; render(); return;}
    }, {capture:true});
    document.addEventListener('submit',event=>{
      if(!restaurantEventRoot(event))return;
      const form=event.target.closest('[data-restaurant-form]');
      if(!form)return;
      event.preventDefault();
      applyForm(form);
      markDirty();
    });
    document.addEventListener('input',event=>{
      if(!restaurantEventRoot(event))return;
      const absenceType=event.target.closest('[data-absence-type-id][data-absence-type-field]');
      if(absenceType){updateAbsenceType(absenceType); markDirty(); return;}
      const referenceInput=event.target.closest('[data-restaurant-reference][data-reference-id][data-reference-field]');
      if(referenceInput){updateReference(referenceInput); markDirty(); return;}
      const hours=event.target.closest('[data-hours-day][data-hours-field]');
      if(hours){updateHours(hours); markDirty(); return;}
      const coverageInput=event.target.closest('[data-coverage-zone][data-coverage-service][data-coverage-job-function]');
      if(coverageInput){syncCoverageInput(coverageInput,coverageInput.value); markDirty(); return;}
      const form=event.target.closest('[data-restaurant-form]');
      if(!form)return;
      applyForm(form);
      markDirty();
    });
    document.addEventListener('change',event=>{
      if(!restaurantEventRoot(event))return;
      const absenceType=event.target.closest('[data-absence-type-id][data-absence-type-field]');
      if(absenceType){updateAbsenceType(absenceType); markDirty({rerender:absenceType.dataset.absenceTypeField==='active'}); return;}
      const referenceInput=event.target.closest('[data-restaurant-reference][data-reference-id][data-reference-field]');
      if(referenceInput){updateReference(referenceInput); markDirty({rerender:referenceInput.dataset.referenceField==='active' || referenceInput.dataset.referenceField==='departmentId'}); return;}
      const hours=event.target.closest('[data-hours-day][data-hours-field]');
      if(hours){updateHours(hours); markDirty({rerender:hours.dataset.hoursField==='open'}); return;}
      const coverageInput=event.target.closest('[data-coverage-zone][data-coverage-service][data-coverage-job-function]');
      if(coverageInput){syncCoverageInput(coverageInput,coverageInput.value); markDirty(); return;}
      const form=event.target.closest('[data-restaurant-form]');
      if(!form)return;
      applyForm(form);
      markDirty({rerender:event.target?.name === 'active'});
    });
  }

  Restogogo.restaurant={render,bind,model:Restogogo.modules.RestaurantModel};
})();
