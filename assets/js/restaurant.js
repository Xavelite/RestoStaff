(function(){
  const Metrics = Restogogo.services.metrics;
  let section = 'zones';
  let selectedZoneId = '';
  let selectedPositionId = '';
  let bound = false;

  function setup(){
    ensure(data);
    return data.restaurantSetup;
  }
  function zones(includeInactive=true){return (setup().zones||[]).filter(zone=>includeInactive || zone.active !== false);}
  function setupPositions(includeInactive=true){return (setup().positions||[]).filter(position=>includeInactive || position.active !== false);}
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
  function setupIssues(){
    const issues=[];
    if(!(data.employees||[]).some(employee=>employee.active !== false))issues.push('No active employees');
    if(!zones(false).length)issues.push('No active zones');
    if(!setupPositions(false).length)issues.push('No active positions');
    zones(false).forEach(zone=>{if(!(zone.defaultPositions||[]).length)issues.push(`${zone.name}: positions missing`);});
    if(!setup().payrollRules?.provider)issues.push('Payroll provider missing');
    return issues;
  }
  function readinessPercent(){
    const issues=setupIssues().length;
    return Math.max(0,Math.round(100 - Math.min(4,issues)*25));
  }
  function restaurantMetrics(){
    const openDays=days.filter(day=>setup().openingHours?.[day]?.open !== false).length;
    const activeZones=zones(false).length;
    const activePositions=setupPositions(false).length;
    const issues=setupIssues();
    return `<section class="restaurant-metrics rs-page-metrics rs-weekly-metrics">
      ${Metrics.card({tone:'week',icon:'document',label:'Active zones',value:String(activeZones),meta:activeZones?'Operational zones':'Add zones'})}
      ${Metrics.card({tone:'hours',icon:'check',label:'Positions',value:String(activePositions),meta:'Linked to team & planning'})}
      ${Metrics.card({tone:'week',icon:'clock',label:'Opening days',value:`${openDays}/7`,meta:'Lunch & evening setup'})}
      ${Metrics.card({tone:issues.length?'status':'status',icon:issues.length?'calendar':'check',label:'Export readiness',value:`${readinessPercent()}%`,meta:issues.length?`${issues.length} setup items`:'Ready for exports'})}
    </section>`;
  }
  function restaurantHead(){
    const activeZoneCount=zones(false).length;
    return `<header class="restaurant-main-head">
      <div class="restaurant-photo" aria-hidden="true">${esc(restaurantName().slice(0,1))}</div>
      <div><h2>${esc(restaurantName())}</h2><p><span class="ops-status is-success">Active</span><span>${activeZoneCount} zones</span><span>Updated today</span></p></div>
    </header>`;
  }
  function zoneIcon(zone){
    const name=String(zone.name||'').toLowerCase();
    if(name.includes('bar'))return '🍸';
    if(name.includes('terrace'))return '☂';
    if(name.includes('kitchen'))return '▱';
    if(name.includes('private'))return '▣';
    if(name.includes('delivery'))return '↗';
    return '⌖';
  }
  function zoneCards(){
    const cards=zones(true).map(zone=>{
      const active=zone.id===selectedZoneId;
      const services=shifts.filter(shift=>zone.services?.[shift]).map(shift=>`<small>${esc(shift)}</small>`).join('');
      return `<button type="button" class="restaurant-zone-card rs-card ${active?'is-active':''} ${zone.active===false?'is-muted':''}" data-restaurant-zone="${esc(zone.id)}">
        <span class="restaurant-zone-icon">${zoneIcon(zone)}</span>
        <span class="restaurant-zone-copy"><strong>${esc(zone.name)}</strong><span>Capacity <b>${zone.capacity || '—'}</b></span><span>Positions <b>${(zone.defaultPositions||[]).length || '—'}</b></span><em>${services || '<small>No service</small>'}</em></span>
        <i class="ops-led ${zone.active===false?'is-muted':'is-success'}"></i>
      </button>`;
    }).join('');
    return `<section class="restaurant-zone-grid">${cards}<button type="button" class="restaurant-zone-card add-zone" data-restaurant-action="add-zone"><span>＋</span><strong>Add zone</strong><small>Create a new operational area</small></button></section>`;
  }
  function positionCheckboxes(zone){
    return setupPositions(false).map(position=>{
      const checked=(zone.defaultPositions||[]).includes(position.name);
      return `<label class="ops-chip-check"><input type="checkbox" name="defaultPositions" value="${esc(position.name)}" ${checked?'checked':''}><span>${esc(position.name)}</span></label>`;
    }).join('') || '<div class="ops-empty compact"><strong>No active positions</strong><span>Add positions first.</span></div>';
  }
  function zoneEditor(){
    const zone=selectedZone();
    if(!zone)return `<section class="restaurant-editor rs-card"><div class="ops-empty"><strong>No zones configured</strong><span>Add a zone to connect Restaurant setup with Planning.</span></div></section>`;
    return `<section class="restaurant-editor rs-card"><form data-restaurant-form="zone">
      <div class="ops-section-title"><h3>${esc(zone.name)}</h3><span class="ops-status ${zone.active===false?'is-muted':'is-success'}">${zone.active===false?'Archived':'Active'}</span></div>
      <div class="ops-form-grid restaurant-editor-grid">
        <label>Zone name<input name="name" value="${esc(zone.name)}" required></label>
        <label>Capacity<input name="capacity" value="${esc(zone.capacity || 0)}" min="0" type="number"></label>
        <label>Status<select name="active"><option value="true" ${zone.active!==false?'selected':''}>Active</option><option value="false" ${zone.active===false?'selected':''}>Archived</option></select></label>
        <fieldset><legend>Active services</legend><label><input type="checkbox" name="serviceLunch" ${zone.services?.Lunch?'checked':''}> Lunch</label><label><input type="checkbox" name="serviceEvening" ${zone.services?.Evening?'checked':''}> Evening</label></fieldset>
        <fieldset class="wide"><legend>Default positions</legend><div class="ops-chip-grid">${positionCheckboxes(zone)}</div></fieldset>
        <label class="wide">Notes<textarea name="notes">${esc(zone.notes || '')}</textarea></label>
      </div>
      <footer class="ops-inline-actions restaurant-editor-actions"><button type="button" class="rs-modal-btn secondary" data-restaurant-action="duplicate-zone">Duplicate zone</button><button type="button" class="rs-modal-btn secondary danger" data-restaurant-action="archive-zone">Archive zone</button><button type="submit" class="rs-modal-btn primary">Save zone</button></footer>
    </form></section>`;
  }
  function sectionHead(title,meta='',actionLabel='',action=''){
    return `<div class="restaurant-section-head"><div><h3>${esc(title)}</h3>${meta?`<p>${esc(meta)}</p>`:''}</div>${action?`<button type="button" class="ops-mini-action" data-restaurant-action="${esc(action)}">${esc(actionLabel)}</button>`:''}</div>`;
  }
  function zonesSection(){return `<section class="ops-tab-panel restaurant-tab-panel">${sectionHead('Zones','Operational areas used by Planning.','Add zone','add-zone')}${zoneCards()}${zoneEditor()}</section>`;}
  function positionCards(){
    return setupPositions(true).map(position=>{
      const active=position.id===selectedPositionId;
      const count=(data.employees||[]).filter(employee=>cleanPositionName(employee.position)===cleanPositionName(position.name)).length;
      return `<button type="button" class="restaurant-position-card rs-card ${active?'is-active':''} ${position.active===false?'is-muted':''}" data-restaurant-position="${esc(position.id)}"><strong>${esc(position.name)}</strong><span>${esc(position.department || '—')} · ${count} employees</span><small>${position.defaultZone?`Default: ${esc(position.defaultZone)}`:'No default zone'}</small></button>`;
    }).join('');
  }
  function positionsSection(){
    const position=selectedPosition();
    const zoneOptions=zones(false).map(zone=>`<option value="${esc(zone.name)}" ${zone.name===position?.defaultZone?'selected':''}>${esc(zone.name)}</option>`).join('');
    return `<section class="ops-tab-panel restaurant-tab-panel">${sectionHead('Positions','Roles used by Team, Planning and payroll.','Add position','add-position')}<section class="restaurant-positions-layout">
      <div class="restaurant-position-list">${positionCards()}</div>
      <section class="restaurant-editor rs-card"><form data-restaurant-form="position">
        <div class="ops-section-title"><h3>${esc(position?.name || 'Position')}</h3><span class="ops-status ${position?.active===false?'is-muted':'is-success'}">${position?.active===false?'Inactive':'Active'}</span></div>
        <div class="ops-form-grid restaurant-editor-grid">
          <label>Position name<input name="name" value="${esc(position?.name || '')}" required></label>
          <label>Department<input name="department" value="${esc(position?.department || '')}"></label>
          <label>Default zone<select name="defaultZone"><option value="">No default</option>${zoneOptions}</select></label>
          <label>Hourly cost<input name="hourlyCost" value="${esc(position?.hourlyCost || '')}" type="number" min="0" step="0.01"></label>
          <label>Status<select name="active"><option value="true" ${position?.active!==false?'selected':''}>Active</option><option value="false" ${position?.active===false?'selected':''}>Inactive</option></select></label>
        </div>
        <footer class="ops-inline-actions restaurant-editor-actions"><button type="submit" class="rs-modal-btn primary">Save position</button></footer>
      </form></section>
    </section></section>`;
  }
  function hoursSection(){
    const rows=days.map(day=>{
      const h=setup().openingHours?.[day] || {open:false,Lunch:'',Evening:''};
      return `<article class="restaurant-hours-row rs-card">
        <label class="hours-day"><input type="checkbox" data-hours-day="${esc(day)}" data-hours-field="open" ${h.open!==false?'checked':''}><strong>${esc(day)}</strong></label>
        <label>Lunch<input value="${esc(h.Lunch || '')}" data-hours-day="${esc(day)}" data-hours-field="Lunch" placeholder="11:00-15:00"></label>
        <label>Evening<input value="${esc(h.Evening || '')}" data-hours-day="${esc(day)}" data-hours-field="Evening" placeholder="18:00-23:00"></label>
      </article>`;
    }).join('');
    return `<section class="ops-tab-panel restaurant-tab-panel restaurant-hours-panel">${sectionHead('Opening hours','Used by Planning default shift times.','Save setup','save-setup')}<section class="restaurant-hours">${rows}</section></section>`;
  }
  function payrollSection(){
    const rules=setup().payrollRules || {};
    const issues=setupIssues();
    return `<section class="ops-tab-panel restaurant-tab-panel restaurant-editor"><form data-restaurant-form="payroll">
      <div class="ops-section-title"><h3>Payroll / export rules</h3><span class="ops-status ${issues.length?'is-warn':'is-success'}">${issues.length?`${issues.length} issues`:'Ready'}</span></div>
      <div class="ops-form-grid restaurant-editor-grid">
        <label>Payroll provider<input name="provider" value="${esc(rules.provider || '')}" placeholder="SD Worx, Securex, CSV..."></label>
        <label>Export format<select name="exportFormat"><option ${rules.exportFormat==='CSV'?'selected':''}>CSV</option><option ${rules.exportFormat==='Excel'?'selected':''}>Excel</option><option ${rules.exportFormat==='API'?'selected':''}>API</option></select></label>
        <label>Cost center<input name="costCenter" value="${esc(rules.costCenter || '')}" placeholder="Optional"></label>
      </div>
      <div class="ops-list-rows restaurant-checklist">${issues.map(issue=>`<article><span class="ops-status is-warn">!</span><strong>${esc(issue)}</strong></article>`).join('') || '<article><span class="ops-status is-success">✓</span><strong>All required setup items are configured.</strong></article>'}</div>
      <footer class="ops-inline-actions restaurant-editor-actions"><button type="submit" class="rs-modal-btn primary">Save rules</button></footer>
    </form></section>`;
  }
  function generalSection(){
    const general=setup().general || {};
    return `<section class="ops-tab-panel restaurant-tab-panel restaurant-editor"><form data-restaurant-form="general">
      <div class="ops-section-title"><h3>General info</h3><span>Workspace identity</span></div>
      <div class="ops-form-grid restaurant-editor-grid">
        <label>Restaurant name<input name="name" value="${esc(data.restaurant.name || '')}"></label>
        <label>Manager name<input name="ownerName" value="${esc(data.restaurant.ownerName || '')}"></label>
        <label>Legal name<input name="legalName" value="${esc(general.legalName || '')}"></label>
        <label>Company number<input name="companyNumber" value="${esc(general.companyNumber || '')}"></label>
        <label>City<input name="city" value="${esc(general.city || data.restaurant.city || '')}"></label>
        <label>Email<input name="email" value="${esc(general.email || '')}" type="email"></label>
        <label class="wide">Address<input name="address" value="${esc(general.address || '')}"></label>
      </div>
      <footer class="ops-inline-actions restaurant-editor-actions"><button type="submit" class="rs-modal-btn primary">Save general info</button></footer>
    </form></section>`;
  }
  function documentsSection(){
    const docs=(setup().documents||[]).map(doc=>`<article class="ops-list-row restaurant-document rs-card"><span>${esc((doc.type||'File').slice(0,3).toUpperCase())}</span><strong>${esc(doc.name)}</strong><small>${esc(doc.status || 'Uploaded')}</small><button type="button" data-restaurant-action="remove-document" data-document-id="${esc(doc.id)}">×</button></article>`).join('') || '<div class="ops-empty"><strong>No restaurant documents</strong><span>Add floor plans, payroll mapping or setup files as metadata for now.</span></div>';
    return `<section class="ops-tab-panel restaurant-tab-panel restaurant-documents-panel">${sectionHead('Restaurant documents','Document metadata only for now; Supabase Storage comes later.','Upload document','add-document')}<section class="restaurant-documents">${docs}</section></section>`;
  }
  function activeSection(){
    if(section==='general')return generalSection();
    if(section==='positions')return positionsSection();
    if(section==='hours')return hoursSection();
    if(section==='payroll')return payrollSection();
    if(section==='documents')return documentsSection();
    return zonesSection();
  }
  function render(){
    const root=$('restaurantRoot');
    if(!root||!data)return;
    ensure(data);
    root.innerHTML=`${restaurantMetrics()}<section class="ops-shell-grid restaurant-layout"><main class="restaurant-main rs-panel"><nav class="ops-tabs restaurant-tabs">${['general','zones','positions','hours','payroll','documents'].map(value=>`<button type="button" class="ops-tab ${section===value?'is-active':''}" data-restaurant-section="${esc(value)}">${esc(value==='hours'?'Opening hours':value==='payroll'?'Payroll / export':value.charAt(0).toUpperCase()+value.slice(1))}</button>`).join('')}</nav>${restaurantHead()}${activeSection()}</main></section>`;
  }
  function persist(reason='restaurant-setup'){
    ensure(data);
    void save({reason});
    Restogogo.router?.render?.();
  }
  function addZone(){
    const name=`Zone ${zones(true).length + 1}`;
    const zone={id:`zone-${id()}`,name,capacity:0,active:true,services:{Lunch:false,Evening:false},defaultPositions:[],notes:''};
    setup().zones.push(zone);
    selectedZoneId=zone.id;
    section='zones';
    persist('restaurant-zone-add');
  }
  function duplicateZone(){
    const zone=selectedZone();
    if(!zone)return;
    const copy=clone(zone);
    copy.id=`zone-${id()}`;
    copy.name=`${zone.name} copy`;
    setup().zones.push(copy);
    selectedZoneId=copy.id;
    persist('restaurant-zone-duplicate');
  }
  function archiveZone(){
    const zone=selectedZone();
    if(!zone)return;
    zone.active=false;
    persist('restaurant-zone-archive');
  }
  function addPosition(){
    const name=`Position ${setupPositions(true).length + 1}`;
    const position={id:`position-${id()}`,name,active:true,department:'',defaultZone:'',hourlyCost:0};
    setup().positions.push(position);
    selectedPositionId=position.id;
    section='positions';
    persist('restaurant-position-add');
  }
  async function addDocument(){
    const name=await Restogogo.ui?.prompt?.({title:'Add restaurant document',message:'Real uploads can be linked to Supabase Storage later.',label:'File name',placeholder:'floor_plan.pdf',confirmText:'Add'});
    if(!String(name||'').trim())return;
    setup().documents.push({id:`doc-${id()}`,name:String(name).trim(),type:documentTypeFromName(name),uploadedAt:new Date().toISOString(),status:'Uploaded'});
    persist('restaurant-document');
  }
  function saveZone(form){
    const zone=selectedZone();
    if(!zone)return;
    const values=Object.fromEntries(new FormData(form).entries());
    zone.name=String(values.name||'').trim() || zone.name;
    zone.capacity=Number(values.capacity)||0;
    zone.active=values.active === 'true';
    zone.services={Lunch:!!values.serviceLunch, Evening:!!values.serviceEvening};
    zone.defaultPositions=[...form.querySelectorAll('input[name="defaultPositions"]:checked')].map(input=>cleanPositionName(input.value)).filter(Boolean);
    zone.notes=String(values.notes||'').trim();
    persist('restaurant-zone-save');
  }
  function savePosition(form){
    const position=selectedPosition();
    if(!position)return;
    const oldName=position.name;
    const values=Object.fromEntries(new FormData(form).entries());
    position.name=cleanPositionName(values.name||oldName) || oldName;
    position.department=String(values.department||'').trim();
    position.defaultZone=String(values.defaultZone||'').trim();
    position.hourlyCost=Number(values.hourlyCost)||0;
    position.active=values.active === 'true';
    if(oldName!==position.name){
      (data.employees||[]).forEach(employee=>{if(cleanPositionName(employee.position)===cleanPositionName(oldName))employee.position=position.name;});
      zones(true).forEach(zone=>{zone.defaultPositions=(zone.defaultPositions||[]).map(p=>cleanPositionName(p)===cleanPositionName(oldName)?position.name:p);});
    }
    persist('restaurant-position-save');
  }
  function savePayroll(form){
    const values=Object.fromEntries(new FormData(form).entries());
    setup().payrollRules.provider=String(values.provider||'').trim();
    setup().payrollRules.exportFormat=String(values.exportFormat||'').trim();
    setup().payrollRules.costCenter=String(values.costCenter||'').trim();
    persist('restaurant-payroll-save');
  }
  function saveGeneral(form){
    const values=Object.fromEntries(new FormData(form).entries());
    data.restaurant.name=String(values.name||data.restaurant.name).trim();
    data.restaurant.ownerName=String(values.ownerName||data.restaurant.ownerName).trim();
    data.restaurant.city=String(values.city||'').trim();
    Object.assign(setup().general,{
      legalName:String(values.legalName||'').trim(),
      companyNumber:String(values.companyNumber||'').trim(),
      city:String(values.city||'').trim(),
      email:String(values.email||'').trim(),
      address:String(values.address||'').trim()
    });
    persist('restaurant-general-save');
  }
  function updateHours(input){
    const day=input.dataset.hoursDay;
    const field=input.dataset.hoursField;
    setup().openingHours[day]=setup().openingHours[day] || {open:false,Lunch:'',Evening:''};
    if(field==='open')setup().openingHours[day].open=input.checked;
    else setup().openingHours[day][field]=normalizeTimeRangeInput(input.value)||input.value;
    persist('restaurant-hours');
  }
  function handleAction(action,target){
    if(action==='add-zone')return addZone();
    if(action==='duplicate-zone')return duplicateZone();
    if(action==='archive-zone')return archiveZone();
    if(action==='add-position')return addPosition();
    if(action==='open-team')return Restogogo.router?.showPage?.('team');
    if(action==='save-setup')return persist('restaurant-manual-save');
    if(action==='add-document')return void addDocument();
    if(action==='remove-document'){
      setup().documents=(setup().documents||[]).filter(doc=>doc.id!==target.dataset.documentId);
      return persist('restaurant-document-remove');
    }
  }
  function bind(){
    if(bound)return;
    bound=true;
    const root=$('restaurantRoot');
    root?.addEventListener('click',event=>{
      const sec=event.target.closest('[data-restaurant-section]');
      if(sec){section=sec.dataset.restaurantSection||'zones'; render(); return;}
      const zone=event.target.closest('[data-restaurant-zone]');
      if(zone){selectedZoneId=zone.dataset.restaurantZone; section='zones'; render(); return;}
      const position=event.target.closest('[data-restaurant-position]');
      if(position){selectedPositionId=position.dataset.restaurantPosition; section='positions'; render(); return;}
      const action=event.target.closest('[data-restaurant-action]');
      if(action){event.preventDefault(); handleAction(action.dataset.restaurantAction, action);}
    });
    root?.addEventListener('submit',event=>{
      const form=event.target.closest('[data-restaurant-form]');
      if(!form)return;
      event.preventDefault();
      const type=form.dataset.restaurantForm;
      if(type==='zone')saveZone(form);
      if(type==='position')savePosition(form);
      if(type==='payroll')savePayroll(form);
      if(type==='general')saveGeneral(form);
      Restogogo.ui?.toast?.('Restaurant setup saved.',{tone:'success',icon:'✓',centered:true});
    });
    root?.addEventListener('change',event=>{
      const input=event.target.closest('[data-hours-day][data-hours-field]');
      if(input)updateHours(input);
    });
  }
  Restogogo.restaurant={render,bind};
})();
