(function(){
  let section = 'restaurant';
  let operationMode = 'zones';
  let selectedZoneId = '';
  let selectedPositionId = '';
  let zonePage = 0;
  let bound = false;
  let dirty = false;
  let savedSnapshot = null;
  const ZONE_PAGE_SIZE = 99;

  const RestaurantModel = Restogogo.modules.RestaurantModel;
  const RestaurantView = Restogogo.modules.RestaurantView;
  const setup = RestaurantModel.setup;
  const zones = RestaurantModel.zones;
  const setupPositions = RestaurantModel.positions;

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

  function selectedPosition(){
    const list=setupPositions(true);
    if(!selectedPositionId || !list.some(position=>position.id===selectedPositionId)) selectedPositionId=list.find(position=>position.active!==false)?.id || list[0]?.id || '';
    return list.find(position=>position.id===selectedPositionId) || null;
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
      selectedPositionId,
      zonePage,
      selectedZone:selectedZone(),
      selectedPosition:selectedPosition(),
      dirty
    });
  }

  function showDirtyState(){
    const bar=document.querySelector('[data-restaurant-save-bar]');
    if(!bar)return;
    bar.classList.add('is-dirty');
    bar.querySelector('span').textContent='Unsaved restaurant setup changes';
    bar.querySelectorAll('button').forEach(button=>button.disabled=false);
  }

  function markDirty({rerender=false}={}){
    ensureSnapshot();
    dirty = true;
    if(rerender)render();
    else showDirtyState();
  }

  async function persist(reason='restaurant-setup'){
    ensure(data);
    const ok = await save({reason});
    if(!ok){
      dirty = true;
      showDirtyState();
      Restogogo.ui?.toast?.('Restaurant setup could not be saved. Check the save warning and try again.',{tone:'danger',icon:'alert',centered:true});
      return false;
    }
    savedSnapshot = snapshot();
    dirty = false;
    Restogogo.router?.render?.();
    Restogogo.ui?.toast?.('Restaurant setup saved.',{tone:'success',icon:'check',centered:true});
    return true;
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
    const zone={id:`zone-${id()}`,name,active:true,defaultTimes:{Lunch:'',Evening:''},notes:''};
    const restaurantSetup=setup();
    restaurantSetup.zones.push(zone);
    selectedZoneId=zone.id;
    zonePage=Math.max(0,Math.ceil(zones(true).length / ZONE_PAGE_SIZE) - 1);
    operationMode='zones';
    section='operations';
    markDirty({rerender:true});
  }

  function addPosition(){
    const name=`Position ${setupPositions(true).length + 1}`;
    const position={id:`position-${id()}`,name,active:true,hourlyCost:0,metadata:{}};
    const restaurantSetup=setup();
    restaurantSetup.positions.push(position);
    selectedPositionId=position.id;
    operationMode='positions';
    section='operations';
    markDirty({rerender:true});
  }


  function coverageCountValue(value){
    const raw = String(value ?? '').replace(/[^0-9]/g,'');
    const count = Math.round(Number(raw || 0));
    return Math.max(0,Math.min(20,Number.isFinite(count) ? count : 0));
  }

  function coverageRequirementSortOrder(zoneId,serviceKey,positionId){
    const zoneIndex=Math.max(0,zones(true).findIndex(zone=>String(zone?.id || '')===String(zoneId || '')));
    const serviceIndex=Math.max(0,shifts.indexOf(serviceKey));
    const positionIndex=Math.max(0,setupPositions(true).findIndex(position=>String(position?.id || '')===String(positionId || '')));
    return (zoneIndex * 1000) + (serviceIndex * 100) + positionIndex;
  }

  function coverageCellKey(zoneId,serviceKey,positionId){
    return `${String(zoneId || '').trim()}|${String(serviceKey || '').trim()}|${String(positionId || '').trim()}`;
  }

  function coverageInputIdentity(input){
    if(!input)return null;
    const zoneId=String(input.dataset.coverageZone || selectedZoneId || selectedZone()?.id || '').trim();
    const serviceKey=String(input.dataset.coverageService || '').trim();
    const positionId=String(input.dataset.coveragePosition || '').trim();
    const service=shifts.includes(serviceKey) ? serviceKey : '';
    if(!zoneId || !service || !positionId)return null;
    return {zoneId,serviceKey:service,positionId};
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
      positionId:identity.positionId,
      requiredCount,
      sortOrder:coverageRequirementSortOrder(identity.zoneId,identity.serviceKey,identity.positionId),
      metadata:{}
    };
  }

  function setCoverageRequirementCell(zoneId,serviceKey,positionId,requiredCount){
    const zoneKey=String(zoneId || '').trim();
    const service=shifts.includes(serviceKey) ? serviceKey : '';
    const roleId=String(positionId || '').trim();
    if(!zoneKey || !service || !roleId)return false;
    const restaurantSetup=setup();
    const current=normalizeCoverageRequirements(restaurantSetup.coverageRequirements || [], restaurantSetup, {keepZero:true});
    const targetKey=coverageCellKey(zoneKey,service,roleId);
    const next=current.filter(req=>coverageCellKey(req.zoneId,req.serviceKey,req.positionId)!==targetKey);
    next.push({
      zoneId:zoneKey,
      serviceKey:service,
      positionId:roleId,
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
    return setCoverageRequirementCell(requirement.zoneId,requirement.serviceKey,requirement.positionId,requirement.requiredCount);
  }

  function syncCoverageForm(form){
    const inputs=[...(form?.querySelectorAll?.('[data-coverage-zone][data-coverage-service][data-coverage-position]') || [])];
    if(!inputs.length)return;
    const edited=[];
    const editedKeys=new Set();
    inputs.forEach(input=>{
      const requirement=coverageInputRequirement(input);
      if(!requirement)return;
      edited.push(requirement);
      editedKeys.add(coverageCellKey(requirement.zoneId,requirement.serviceKey,requirement.positionId));
    });
    const restaurantSetup=setup();
    const retained=normalizeCoverageRequirements(restaurantSetup.coverageRequirements || [], restaurantSetup, {keepZero:true})
      .filter(req=>!editedKeys.has(coverageCellKey(req.zoneId,req.serviceKey,req.positionId)));
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

  function applyPosition(form){
    const position=selectedPosition();
    if(!position)return;
    const oldName=position.name;
    const values=Object.fromEntries(new FormData(form).entries());
    position.name=cleanPositionName(values.name||oldName) || oldName;
    position.metadata = isPlainObject(position.metadata) ? position.metadata : {};
    position.hourlyCost=Number(values.hourlyCost)||0;
    position.active=values.active === 'true';
  }

  function applyPayroll(form){
    const values=Object.fromEntries(new FormData(form).entries());
    const restaurantSetup=setup();
    restaurantSetup.payrollRules.provider=String(values.provider||'').trim();
    restaurantSetup.payrollRules.exportFormat=String(values.exportFormat||'').trim();
    restaurantSetup.payrollRules.costCenter=String(values.costCenter||'').trim();
  }

  function applyGeneral(form){
    const values=Object.fromEntries(new FormData(form).entries());
    data.restaurant.name=String(values.name||data.restaurant.name).trim();
    data.restaurant.ownerName=String(values.ownerName||data.restaurant.ownerName).trim();
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
    if(type==='position')applyPosition(form);
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
    if(action==='add-position')return addPosition();
    if(action==='open-team')return Restogogo.router?.showPage?.('team');
    if(action==='save-restaurant'){
      const activeCoverageInput=document.activeElement?.closest?.('[data-coverage-zone][data-coverage-service][data-coverage-position]');
      if(activeCoverageInput)syncCoverageInput(activeCoverageInput,activeCoverageInput.value);
      applyVisibleForms();
      return persist('restaurant-setup-save');
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

  function bind(){
    if(bound)return;
    bound=true;
    const root=$('restaurantRoot');
    root?.addEventListener('click',event=>{
      const coverageStep=event.target.closest('[data-coverage-step]');
      if(coverageStep){
        event.preventDefault();
        const input=coverageStep.closest('[data-coverage-count]')?.querySelector('[data-coverage-zone][data-coverage-service][data-coverage-position]');
        if(input){
          const delta=Number(coverageStep.dataset.coverageStep || 0);
          syncCoverageInput(input,coverageCountValue(coverageInputValue(input) + delta));
          markDirty();
        }
        return;
      }
      const sec=event.target.closest('[data-restaurant-section]');
      if(sec){section=sec.dataset.restaurantSection||'restaurant'; render(); return;}
      const ops=event.target.closest('[data-restaurant-ops]');
      if(ops){operationMode=ops.dataset.restaurantOps||'zones'; section='operations'; render(); return;}
      const page=event.target.closest('[data-restaurant-page]');
      if(page){event.preventDefault(); if(page.dataset.restaurantPage==='zones')changeZonePage(Number(page.dataset.restaurantPageDir)||0); return;}
      const zone=event.target.closest('[data-restaurant-zone]');
      if(zone){selectedZoneId=zone.dataset.restaurantZone; operationMode='zones'; section='operations'; render(); return;}
      const position=event.target.closest('[data-restaurant-position]');
      if(position){selectedPositionId=position.dataset.restaurantPosition; operationMode='positions'; section='operations'; render(); return;}
      const action=event.target.closest('[data-restaurant-action]');
      if(action){event.preventDefault(); void handleAction(action.dataset.restaurantAction, action);}
    });
    root?.addEventListener('submit',event=>{
      const form=event.target.closest('[data-restaurant-form]');
      if(!form)return;
      event.preventDefault();
      applyForm(form);
      markDirty();
    });
    root?.addEventListener('input',event=>{
      const hours=event.target.closest('[data-hours-day][data-hours-field]');
      if(hours){updateHours(hours); markDirty(); return;}
      const coverageInput=event.target.closest('[data-coverage-zone][data-coverage-service][data-coverage-position]');
      if(coverageInput){syncCoverageInput(coverageInput,coverageInput.value); markDirty(); return;}
      const form=event.target.closest('[data-restaurant-form]');
      if(!form)return;
      applyForm(form);
      markDirty();
    });
    root?.addEventListener('change',event=>{
      const hours=event.target.closest('[data-hours-day][data-hours-field]');
      if(hours){updateHours(hours); markDirty({rerender:hours.dataset.hoursField==='open'}); return;}
      const coverageInput=event.target.closest('[data-coverage-zone][data-coverage-service][data-coverage-position]');
      if(coverageInput){syncCoverageInput(coverageInput,coverageInput.value); markDirty(); return;}
      const form=event.target.closest('[data-restaurant-form]');
      if(!form)return;
      applyForm(form);
      markDirty({rerender:event.target?.name === 'active'});
    });
  }

  Restogogo.restaurant={render,bind};
})();
