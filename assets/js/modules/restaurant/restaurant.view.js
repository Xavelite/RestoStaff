(function(){
  const Metrics = Restogogo.services.metrics;
  const Toolbar = Restogogo.services.toolbar;
  const RestaurantModel = Restogogo.modules.RestaurantModel;
  const setup = RestaurantModel.setup;
  const zones = RestaurantModel.zones;
  const setupJobFunctions = RestaurantModel.jobFunctions;
  const ZONE_PAGE_SIZE = 99;
  const Icons = Restogogo.icons;
  const SetupReadiness = Restogogo.services.setupReadiness;
  const SetupGuide = Restogogo.services.setupGuide;

  function icon(name){return Icons.svg(name);}
  function statusIcon(state,options={}){return Icons.status(state,options);}

  function metrics(){
    const restaurantSetup=setup();
    const openDays=days.filter(day=>restaurantSetup.openingHours?.[day]?.open !== false).length;
    const activeZones=zones(false).length;
    const activeJobFunctions=setupJobFunctions(false).length;
    const activeDepartments=(restaurantSetup.departments || []).filter(item=>item.active !== false).length;
    const readiness=RestaurantModel.readiness();
    return `${Metrics.card({detailKey:'restaurant.setup',className:'rs-metric--hero',tone:readiness.tone,icon:readiness.ready?'check':'list',label:'Setup readiness',value:`${readiness.percent}%`,meta:readiness.detail})}
      ${Metrics.card({detailKey:'restaurant.zones',tone:'week',icon:'zone',label:'Active zones',value:String(activeZones),meta:activeZones?'Operational zones':'Add zones'})}
      ${Metrics.card({detailKey:'restaurant.jobFunctions',tone:'hours',icon:'id',label:'Job functions',value:String(activeJobFunctions),meta:'Linked to team & planning'})}
      ${Metrics.card({detailKey:'restaurant.departments',tone:'week',icon:'grid',label:'Departments',value:String(activeDepartments),meta:'Contract and payroll grouping'})}
      ${Metrics.card({detailKey:'restaurant.opening',tone:'week',icon:'clock',label:'Opening days',value:`${openDays}/7`,meta:'Lunch & evening setup'})}`;
  }

  function heroChip(name,label){
    return `<span class="rs-entity-chip">${icon(name)}${esc(label)}</span>`;
  }

  function restaurantHead(ctx){
    const restaurantSetup=setup();
    const general=restaurantSetup.general || {};
    const activeZoneCount=zones(false).length;
    const openDays=days.filter(day=>restaurantSetup.openingHours?.[day]?.open !== false).length;
    const city=general.city || data.restaurant.city || 'No city';
    const manager=data.restaurant.ownerName || 'No manager';
    return `<header class="restaurant-main-head rs-entity-header rs-entity-header--restaurant">
      <div class="restaurant-hero-identity rs-entity-identity">
        <div class="restaurant-photo rs-avatar rs-entity-avatar" aria-hidden="true">${esc(restaurantName().slice(0,1))}</div>
        <div class="restaurant-hero-copy rs-entity-copy">
          <div class="restaurant-title-line rs-entity-title-line"><h2>${esc(restaurantName())}</h2><span class="rs-chip rs-chip--status is-pill">Active</span></div>
          <p class="rs-entity-chips">${heroChip('grid',`${activeZoneCount} zones`)}${heroChip('calendar',`${openDays}/7 open days`)}${heroChip('pin',city)}${heroChip('user',manager)}</p>
        </div>
      </div>
      ${actionBar(ctx)}
    </header>`;
  }

  function sectionIconName(title){
    const key = String(title || '').toLowerCase();
    if(key.includes('identity'))return 'identity';
    if(key.includes('opening'))return 'clock';
    if(key.includes('payroll'))return 'payroll';
    if(key.includes('zone'))return 'zone';
    if(key.includes('job function'))return 'id';
    if(key.includes('organization'))return 'grid';
    if(key.includes('coverage'))return 'grid';
    return 'list';
  }

  function sectionHead(title,meta='',action=null){
    const button=action?`<button type="${action.submit?'submit':'button'}" class="rs-action-button"${action.name?` data-restaurant-action="${esc(action.name)}"`:''}>${action.icon?icon(action.icon):''}<span>${esc(action.label)}</span></button>`:'';
    const headIcon=`<span class="rs-section-title-icon" aria-hidden="true">${icon(sectionIconName(title))}</span>`;
    return `<div class="rs-section-head restaurant-section-head"><div class="rs-content-head-title">${headIcon}<div><h3>${esc(title)}</h3>${meta?`<p>${esc(meta)}</p>`:''}</div></div>${button}</div>`;
  }

  function identityCard(){
    const restaurantSetup=setup();
    const general=restaurantSetup.general || {};
    return `<form class="rs-section-surface rs-workbench-card restaurant-card restaurant-identity-card" data-restaurant-form="general">
      ${sectionHead('Identity')}
      <div class="restaurant-identity-grid">
        <label class="rs-field restaurant-inline-field"><span>Restaurant name</span><input name="name" value="${esc(data.restaurant.name || '')}" placeholder="Restaurant name"></label>
        <div class="rs-field restaurant-inline-field restaurant-inline-field--readonly"><span>Manager name</span><span class="rs-field-value">${esc(data.restaurant.ownerName || '—')}</span></div>
        <label class="rs-field restaurant-inline-field"><span>City</span><input name="city" value="${esc(general.city || data.restaurant.city || '')}" placeholder="City"></label>
        <label class="rs-field restaurant-inline-field"><span>Email</span><input name="email" value="${esc(general.email || '')}" type="email" placeholder="Email"></label>
        <label class="rs-field restaurant-inline-field is-wide"><span>Address</span><input name="address" value="${esc(general.address || '')}" placeholder="Address"></label>
      </div>
    </form>`;
  }

  function hoursRows(){
    const restaurantSetup=setup();
    return days.map(day=>{
      const h=restaurantSetup.openingHours?.[day] || {open:false,Lunch:'',Evening:''};
      const open=h.open !== false;
      return `<tr class="${open?'':'is-closed'}">
        <td><label class="rs-check-toggle restaurant-day-toggle"><input type="checkbox" data-hours-day="${esc(day)}" data-hours-field="open" ${open?'checked':''}><span>${esc(day)}</span></label></td>
        <td><label class="rs-field-control restaurant-time-chip">${icon('sun')}<input value="${esc(h.Lunch || '')}" data-hours-day="${esc(day)}" data-hours-field="Lunch" placeholder="-"></label></td>
        <td><label class="rs-field-control restaurant-time-chip">${icon('moon')}<input value="${esc(h.Evening || '')}" data-hours-day="${esc(day)}" data-hours-field="Evening" placeholder="-"></label></td>
        <td>${statusIcon(open?'open':'closed')}</td>
      </tr>`;
    }).join('');
  }

  function openingCard(){
    return `<section class="rs-section-surface rs-workbench-card restaurant-card restaurant-opening-card">
      ${sectionHead('Opening schedule')}
      <div class="restaurant-hours-table-wrap">
        <table class="restaurant-hours-table rs-table">
          <thead><tr><th>Day</th><th>Lunch</th><th>Evening</th><th>Status</th></tr></thead>
          <tbody>${hoursRows()}</tbody>
        </table>
      </div>
    </section>`;
  }

  function generalSection(){
    return `<section class="rs-tab-panel restaurant-tab-panel restaurant-profile-panel">
      <div class="restaurant-dashboard-grid">
        <div class="restaurant-dashboard-left">${identityCard()}</div>
        ${openingCard()}
        ${Restogogo.modules.RestaurantAbsenceTypesView.card(setup().absenceTypes || [])}
      </div>
    </section>`;
  }

  function zoneIcon(zone){
    const name=String(zone.name||'Zone').trim();
    return (name.split(/\s+/).map(part=>part[0]).join('') || name.slice(0,2) || 'Z').slice(0,2).toUpperCase();
  }

  function jobFunctionNameById(jobFunctionId){
    const jobFunction=setupJobFunctions(true).find(item=>String(item.id || '')===String(jobFunctionId || ''));
    return jobFunction?.name || jobFunctionId || '';
  }

  function coverageForZoneServiceJobFunction(zone,serviceKey,jobFunctionId){
    return coverageForZone(zone).find(req=>req.serviceKey===serviceKey && req.jobFunctionId===jobFunctionId)?.requiredCount || 0;
  }

  function coverageByServiceForZone(zone){
    const result={Lunch:0,Evening:0};
    coverageForZone(zone).forEach(req=>{
      if(result[req.serviceKey] !== undefined)result[req.serviceKey] += Number(req.requiredCount || 0);
    });
    return result;
  }

  function zoneRoleLabel(zone){
    const roles=coverageJobFunctionIdsForZone(zone).map(jobFunctionNameById).filter(Boolean);
    if(!roles.length)return 'No required roles';
    return `${roles.slice(0,2).join(', ')}${roles.length>2?` +${roles.length-2}`:''}`;
  }

  function operationListHead(mode,count,action){
    const isZones = mode === 'zones';
    return `<div class="restaurant-list-head rs-panel-head">
      <div class="restaurant-list-title"><h3>${esc(isZones ? `Zones (${count})` : `Job functions (${count})`)}</h3></div>
      <div class="restaurant-list-actions">
        <nav class="restaurant-mode-toggle rs-mode-toggle" aria-label="Restaurant setup type">
          <button type="button" class="${isZones?'is-active':''}" data-restaurant-ops="zones">Zones</button>
          <button type="button" class="${!isZones?'is-active':''}" data-restaurant-ops="jobFunctions">Job functions</button>
        </nav>
        <button type="button" class="rs-action-button is-compact" data-restaurant-action="${esc(action.name)}">${icon('plus')}<span>Add</span></button>
      </div>
    </div>`;
  }

  function listFooter(kind,page,total,pageSize,label){
    const pageCount=Math.max(1,Math.ceil(total / pageSize));
    const start=total ? page * pageSize + 1 : 0;
    const end=Math.min(total,(page + 1) * pageSize);
    return `<footer class="restaurant-list-footer rs-list-footer">
      <span>${total?`Showing ${start} to ${end} of ${total} ${label}`:`No ${label}`}</span>
      ${pageCount>1?`<div class="restaurant-pager rs-pager">
        <button type="button" class="rs-action-button rs-icon-action" aria-label="Previous page" data-restaurant-page="${esc(kind)}" data-restaurant-page-dir="-1" ${page<=0?'disabled':''}>${icon('chevronLeft')}</button>
        <strong class="rs-pager-current">${page + 1}</strong>
        <button type="button" class="rs-action-button rs-icon-action" aria-label="Next page" data-restaurant-page="${esc(kind)}" data-restaurant-page-dir="1" ${page>=pageCount-1?'disabled':''}>${icon('chevronRight')}</button>
      </div>`:''}
    </footer>`;
  }


  function coverageForZone(zone){
    const restaurantSetup=setup();
    return normalizeCoverageRequirements(restaurantSetup.coverageRequirements || [], restaurantSetup).filter(req=>req.zoneId===zone?.id && req.requiredCount > 0);
  }
  function coverageJobFunctionIdsForZone(zone){
    return coverageForZone(zone).map(req=>req.jobFunctionId).filter((value,index,array)=>value&&array.indexOf(value)===index);
  }
  function coverageRequiredTotalForZone(zone){
    return coverageForZone(zone).reduce((sum,req)=>sum + Number(req.requiredCount || 0),0);
  }

  function zoneCards(ctx){
    const list=zones(true);
    const pageCount=Math.max(1,Math.ceil(list.length / ZONE_PAGE_SIZE));
    const page=Math.min(Math.max(Number(ctx.zonePage || 0),0),pageCount - 1);
    const slice=list.slice(page * ZONE_PAGE_SIZE,(page + 1) * ZONE_PAGE_SIZE);
    const cards=slice.map(zone=>{
      const active=zone.id===ctx.selectedZoneId;
      const requiredTotal=coverageRequiredTotalForZone(zone);
      const serviceTotals=coverageByServiceForZone(zone);
      const countLabel=requiredTotal ? `<span class="restaurant-service-count is-lunch">${icon('sun')}${esc(String(serviceTotals.Lunch || 0))}</span><span class="restaurant-service-count is-evening">${icon('moon')}${esc(String(serviceTotals.Evening || 0))}</span>` : '';
      return `<button type="button" class="rs-entity-list-row restaurant-zone-card ${active?'is-active':''} ${zone.active===false?'is-muted':''}" data-restaurant-zone="${esc(zone.id)}">
        <span class="rs-list-icon restaurant-zone-icon">${esc(zoneIcon(zone))}</span>
        <span class="rs-entity-list-copy restaurant-zone-copy"><strong>${esc(zone.name)}</strong><small>${esc(zoneRoleLabel(zone))}</small></span>
        ${countLabel?`<span class="rs-entity-list-meta restaurant-zone-meta">${countLabel}</span>`:''}
        ${statusIcon(zone.active===false?'inactive':'active',{className:'is-inline'})}
      </button>`;
    }).join('');
    return `<section class="rs-section-surface rs-workbench-list rs-workbench-list--entity restaurant-list-panel">
      ${operationListHead('zones',list.length,{label:'Add',name:'add-zone'})}
      <div class="rs-workbench-list-scroll restaurant-zone-grid">${cards || '<div class="rs-empty-state rs-empty-state--compact"><strong>No zones configured</strong><span>Add a zone.</span></div>'}</div>
      ${listFooter('zones',page,list.length,ZONE_PAGE_SIZE,'zones')}
    </section>`;
  }

  function serviceLabel(serviceKey){
    const isLunch = serviceKey === 'Lunch';
    return `<span class="restaurant-service-label ${isLunch?'is-lunch':'is-evening'}">${icon(isLunch?'sun':'moon')}<span>${esc(serviceKey)}</span></span>`;
  }

  function coverageCountControl(zone,jobFunction,serviceKey,count){
    const service=serviceKey === 'Evening' ? 'Evening' : 'Lunch';
    const serviceLabelText=service.toLowerCase();
    const zoneId=esc(zone.id);
    const jobFunctionId=esc(jobFunction.id);
    const jobFunctionName=esc(jobFunction.name);
    return `<div class="rs-field-control restaurant-coverage-count" data-coverage-count title="${esc(service)} required count">
      <button type="button" class="restaurant-coverage-step" data-coverage-step="-1" aria-label="Decrease ${jobFunctionName} ${serviceLabelText} required count">-</button>
      <input type="number" inputmode="numeric" min="0" max="20" step="1" name="coverage__${zoneId}__${esc(service)}__${jobFunctionId}" data-coverage-zone="${zoneId}" data-coverage-service="${esc(service)}" data-coverage-job-function="${jobFunctionId}" value="${esc(String(count || 0))}" aria-label="${jobFunctionName} ${serviceLabelText} required count">
      <button type="button" class="restaurant-coverage-step" data-coverage-step="1" aria-label="Increase ${jobFunctionName} ${serviceLabelText} required count">+</button>
    </div>`;
  }

  function coverageEditor(zone){
    const jobFunctions=setupJobFunctions(false);
    if(!jobFunctions.length){
      return `<fieldset class="restaurant-job-function-fieldset restaurant-coverage-fieldset rs-fieldset"><legend>Required roles in this zone</legend><div class="rs-empty-state rs-empty-state--compact"><strong>No active job functions</strong><span>Add job functions before defining required roles.</span></div></fieldset>`;
    }
    const rows=jobFunctions.map(jobFunction=>{
      const lunchCount=coverageForZoneServiceJobFunction(zone,'Lunch',jobFunction.id);
      const eveningCount=coverageForZoneServiceJobFunction(zone,'Evening',jobFunction.id);
      return `<div class="restaurant-coverage-row">
        <div class="restaurant-coverage-jobFunction"><strong>${esc(jobFunction.name)}</strong><span>${esc(jobFunction.estimatedHourlyCost ? `€${jobFunction.estimatedHourlyCost}/h` : 'Required role')}</span></div>
        ${coverageCountControl(zone,jobFunction,'Lunch',lunchCount)}
        ${coverageCountControl(zone,jobFunction,'Evening',eveningCount)}
      </div>`;
    }).join('');
    return `<fieldset class="restaurant-job-function-fieldset restaurant-coverage-fieldset rs-fieldset">
      <legend>Required roles in this zone</legend>
      <div class="restaurant-coverage-head"><span>Role</span>${serviceLabel('Lunch')}${serviceLabel('Evening')}</div>
      <div class="restaurant-coverage-table">${rows}</div>
    </fieldset>`;
  }

  function zoneShiftSettings(zone){
    const defaultTimes = isPlainObject(zone?.defaultTimes) ? zone.defaultTimes : {};
    return `<fieldset class="restaurant-job-function-fieldset restaurant-zone-shift-fieldset rs-fieldset">
      <legend>Default times</legend>
      <div class="restaurant-zone-service-list restaurant-zone-time-list">
        <label class="restaurant-service-row">
          <span class="restaurant-service-toggle">${serviceLabel('Lunch')}</span>
          <input class="restaurant-service-time rs-compact-input" name="defaultLunch" value="${esc(defaultTimes.Lunch || '')}" placeholder="Use opening hours">
        </label>
        <label class="restaurant-service-row">
          <span class="restaurant-service-toggle">${serviceLabel('Evening')}</span>
          <input class="restaurant-service-time rs-compact-input" name="defaultEvening" value="${esc(defaultTimes.Evening || '')}" placeholder="Use opening hours">
        </label>
      </div>
    </fieldset>`;
  }

  function zoneEditor(zone){
    if(!zone)return `<section class="rs-section-surface rs-workbench-detail restaurant-detail-panel"><div class="rs-empty-state"><strong>No zones configured</strong><span>Add a zone.</span></div></section>`;
    return `<section class="rs-section-surface rs-workbench-detail restaurant-detail-panel"><form data-restaurant-form="zone">
      <div class="restaurant-detail-head restaurant-detail-head--compact rs-section-head">
        <div><h3>Zone setup</h3><p>Define default times and required roles.</p></div>
        ${statusIcon(zone.active===false?'inactive':'active')}
      </div>
      <div class="restaurant-zone-identity-row">
        <label class="rs-field restaurant-inline-field"><span>Zone name</span><input name="name" value="${esc(zone.name)}" placeholder="Zone name" required></label>
        <label class="rs-field restaurant-inline-field restaurant-zone-status-field"><span>Status</span><select name="active"><option value="true" ${zone.active!==false?'selected':''}>Active</option><option value="false" ${zone.active===false?'selected':''}>Inactive</option></select></label>
      </div>
      ${zoneShiftSettings(zone)}
      ${coverageEditor(zone)}
    </form></section>`;
  }


  function zonesForJobFunction(jobFunction){
    const id=String(jobFunction?.id || '').trim();
    if(!id)return [];
    return zones(false).filter(zone=>coverageJobFunctionIdsForZone(zone).includes(id));
  }

  function jobFunctionZoneLabel(jobFunction){
    const list=zonesForJobFunction(jobFunction);
    if(!list.length)return 'No linked zone';
    return `${list.slice(0,2).map(zone=>zone.name).join(', ')}${list.length>2?` +${list.length-2}`:''}`;
  }

  function usedInZoneChips(jobFunction){
    const list=zonesForJobFunction(jobFunction);
    return list.map(zone=>`<span class="restaurant-derived-chip rs-chip is-pill">${esc(zone.name)}</span>`).join('') || '<div class="rs-empty-state rs-empty-state--compact"><strong>No linked zones</strong><span>Add this job function in zone coverage.</span></div>';
  }

  function jobFunctionCards(ctx){
    const list=setupJobFunctions(true);
    const cards=list.map(jobFunction=>{
      const active=jobFunction.id===ctx.selectedJobFunctionId;
      const count=(data.employees||[]).filter(employee=>String(employee.jobFunctionId || '')===String(jobFunction.id || '')).length;
      const cost = Number(jobFunction.estimatedHourlyCost || 0);
      return `<button type="button" class="rs-entity-list-row restaurant-job-function-card ${active?'is-active':''} ${jobFunction.active===false?'is-muted':''}" data-restaurant-jobFunction="${esc(jobFunction.id)}">
        <span class="rs-entity-list-copy restaurant-job-function-copy"><strong>${esc(jobFunction.name)}</strong><small>${esc(jobFunctionZoneLabel(jobFunction))}</small></span>
        <span class="rs-entity-list-meta restaurant-job-function-meta">${esc(`${count} employees${cost ? ` · €${cost}/h` : ''}`)}</span>
        ${statusIcon(jobFunction.active===false?'inactive':'active',{className:'is-inline'})}
      </button>`;
    }).join('');
    return `<section class="rs-section-surface rs-workbench-list rs-workbench-list--entity restaurant-list-panel">
      ${operationListHead('jobFunctions',list.length,{label:'Add',name:'add-jobFunction'})}
      <div class="rs-workbench-list-scroll restaurant-job-function-list">${cards || '<div class="rs-empty-state rs-empty-state--compact"><strong>No job functions configured</strong><span>Add a job function.</span></div>'}</div>
    </section>`;
  }

  function jobFunctionEditor(jobFunction){
    return `<section class="rs-section-surface rs-workbench-detail restaurant-detail-panel"><form data-restaurant-form="jobFunction">
      <div class="restaurant-detail-head rs-section-head">
        <div><h3>Job function details</h3></div>
        ${statusIcon(jobFunction?.active===false?'inactive':'active')}
      </div>
      <div class="restaurant-detail-grid">
        <label class="rs-field restaurant-inline-field"><span>Job function name</span><input name="name" value="${esc(jobFunction?.name || '')}" placeholder="Job function name" required></label>
        <label class="rs-field restaurant-inline-field"><span>Estimated hourly cost</span><input name="estimatedHourlyCost" value="${esc(jobFunction?.estimatedHourlyCost || '')}" type="number" min="0" step="0.01" placeholder="Estimated hourly cost"></label>
        <label class="rs-field restaurant-inline-field"><span>Status</span><select name="active"><option value="true" ${jobFunction?.active!==false?'selected':''}>Active</option><option value="false" ${jobFunction?.active===false?'selected':''}>Inactive</option></select></label>
      </div>
      <fieldset class="restaurant-job-function-fieldset restaurant-derived-fieldset rs-fieldset"><legend>Used in zones</legend><div class="restaurant-chip-grid">${usedInZoneChips(jobFunction)}</div></fieldset>
    </form></section>`;
  }

  function operationsSection(ctx){
    const mode=ctx.operationMode === 'jobFunctions' ? 'jobFunctions' : 'zones';
    return `<section class="rs-tab-panel restaurant-tab-panel restaurant-operations-panel">
      <section class="rs-workbench-layout restaurant-operations-workbench">
        ${mode==='jobFunctions'?`${jobFunctionCards(ctx)}${jobFunctionEditor(ctx.selectedJobFunction)}`:`${zoneCards(ctx)}${zoneEditor(ctx.selectedZone)}`}
      </section>
    </section>`;
  }

  function referenceRow(type,item){
    const typeLabel = type === 'departments' ? 'Department' : (type === 'teams' ? 'Team' : 'Contract type');
    const departmentOptions = [['','No department'], ...(setup().departments || []).filter(department=>department.active !== false).map(department=>[department.id, department.name])];
    const categoryOptions = [['permanent','Permanent'],['fixed_term','Fixed-term'],['student','Student'],['flexi','Flexi'],['extra','Extra'],['interim','Interim'],['self_employed','Self-employed'],['other','Other']];
    const departmentSelect = type === 'teams'
      ? `<label class="rs-field restaurant-inline-field"><span>Department</span><select data-restaurant-reference="${esc(type)}" data-reference-id="${esc(item.id)}" data-reference-field="departmentId">${departmentOptions.map(option=>`<option value="${esc(option[0])}" ${String(option[0])===String(item.departmentId || '')?'selected':''}>${esc(option[1])}</option>`).join('')}</select></label>`
      : '';
    const categorySelect = type === 'contractTypes'
      ? `<label class="rs-field restaurant-inline-field"><span>Category</span><select data-restaurant-reference="${esc(type)}" data-reference-id="${esc(item.id)}" data-reference-field="category">${categoryOptions.map(option=>`<option value="${esc(option[0])}" ${String(option[0])===String(item.category || 'other')?'selected':''}>${esc(option[1])}</option>`).join('')}</select></label>`
      : '';
    return `<article class="rs-list-row restaurant-reference-row">
      <label class="rs-field restaurant-inline-field"><span>${esc(typeLabel)} name</span><input value="${esc(item.name || '')}" data-restaurant-reference="${esc(type)}" data-reference-id="${esc(item.id)}" data-reference-field="name" placeholder="${esc(typeLabel)} name"></label>
      ${departmentSelect}${categorySelect}
      <label class="rs-field restaurant-inline-field"><span>Status</span><select data-restaurant-reference="${esc(type)}" data-reference-id="${esc(item.id)}" data-reference-field="active"><option value="true" ${item.active!==false?'selected':''}>Active</option><option value="false" ${item.active===false?'selected':''}>Inactive</option></select></label>
    </article>`;
  }

  function referenceCard(type,title,description,actionName,ctx){
    const list = setup()[type] || [];
    return `<section class="rs-section-surface rs-workbench-card restaurant-card restaurant-reference-card">
      ${sectionHead(title,description,{label:'Add',name:actionName,icon:'plus'})}
      <div class="restaurant-reference-list">${list.map(item=>referenceRow(type,item)).join('') || `<div class="rs-empty-state rs-empty-state--compact"><strong>No ${esc(title.toLowerCase())} configured</strong><span>Add one when it improves contract, team or payroll organization.</span></div>`}</div>
    </section>`;
  }

  function organizationSection(ctx){
    return `<section class="rs-tab-panel restaurant-tab-panel restaurant-organization-panel">
      <div class="restaurant-dashboard-grid">
        ${referenceCard('departments','Departments','Group employees for contract and payroll reporting.','add-department',ctx)}
        ${referenceCard('teams','Teams','Optional teams within departments.','add-team',ctx)}
        ${referenceCard('contractTypes','Contract types','Contract categories used by Team and payroll setup.','add-contract-type',ctx)}
      </div>
    </section>`;
  }

  function setupGuideSection(){
    const summary=SetupReadiness.build(data);
    return `<section class="rs-tab-panel restaurant-tab-panel restaurant-setup-panel">
      ${SetupGuide.guide({
        summary,
        title:'Restaurant setup guide',
        description:'Configure the essentials that power Planning, Home, Actuals and payroll readiness.',
        targetAttr:'data-restaurant-setup-target'
      })}
    </section>`;
  }
  function payrollSection(){
    const restaurantSetup=setup();
    const rules=restaurantSetup.payrollRules || {};
    const issues=RestaurantModel.issues();
    return `<section class="rs-tab-panel restaurant-tab-panel restaurant-payroll-panel"><form class="rs-section-surface rs-workbench-detail restaurant-detail-panel" data-restaurant-form="payroll">
      <input name="exportFormat" type="hidden" value="CSV"><div class="restaurant-detail-head rs-section-head"><div><h3>Payroll / export rules</h3></div>${statusIcon(issues.length?'warning':'ready',{label:issues.length?`${issues.length} setup issues`:'Ready'})}</div>
      <div class="restaurant-detail-grid">
        <label class="rs-field restaurant-inline-field"><span>Payroll provider</span><input name="provider" value="${esc(rules.provider || '')}" placeholder="SD Worx, Securex, CSV..."></label>
        <div class="rs-field restaurant-inline-field restaurant-inline-field--readonly"><span>Export format</span><span class="rs-field-value">CSV payroll prep</span></div>
        <div class="rs-field restaurant-inline-field restaurant-inline-field--readonly"><span>Payroll week</span><span class="rs-field-value">${esc(weekDisplayRange())}</span></div>
        <label class="rs-field restaurant-inline-field"><span>Cost center</span><input name="costCenter" value="${esc(rules.costCenter || '')}" placeholder="Optional"></label>
      </div>
      <div class="restaurant-detail-actions"><button type="button" class="rs-action-button is-secondary" data-restaurant-action="export-payroll-prep">${icon('download')}<span>Export payroll prep</span></button></div>
      <div class="restaurant-checklist">${issues.map(issue=>`<article class="rs-list-row restaurant-checklist-row">${statusIcon('warning',{label:issue,className:'is-inline'})}<strong>${esc(issue)}</strong></article>`).join('') || `<article class="rs-list-row restaurant-checklist-row">${statusIcon('ready',{className:'is-inline'})}<strong>All required setup items are configured.</strong></article>`}</div>
    </form></section>`;
  }
  function activeSection(ctx){
    if(ctx.section==='setup')return setupGuideSection();
    if(ctx.section==='payroll')return payrollSection();
    if(ctx.section==='organization')return organizationSection(ctx);
    if(ctx.section==='operations')return operationsSection(ctx);
    return generalSection();
  }
  function tabs(section){
    const items=[
      ['setup','Setup guide','list'],
      ['general','General','identity'],
      ['organization','Organization','grid'],
      ['operations','Operations','zone'],
      ['payroll','Payroll / export','payroll']
    ];
    return items.map(([value,label,iconName])=>`<button type="button" class="rs-tab restaurant-tab ${section===value?'is-active':''}" data-restaurant-section="${esc(value)}">${icon(iconName)}<span>${esc(label)}</span></button>`).join('');
  }

  function actionBar(ctx){
    return Toolbar.saveActions({
      className:'rs-action-row rs-entity-actions restaurant-action-row',
      dirty:!!ctx.dirty,
      actionAttr:'data-restaurant-action',
      cancelAction:'cancel-restaurant',
      clickAction:'save-restaurant',
      data:{'data-restaurant-actions':true},
      cancelLabel:'Cancel restaurant changes',
      saveLabel:'Save restaurant changes'
    });
  }

  function render(ctx){
    return Restogogo.services.pageShell.standard({
      moduleName:'restaurant',
      title:'Restaurant',
      headerHtml:Restogogo.services.moduleHeader.content({
        moduleName:'restaurant',
        title:'Restaurant',
        subtitle:'Departments, teams, job functions, opening hours and coverage.'
      }),
      metricsClass:'restaurant-metrics rs-metrics--hero-first',
      metricsAria:'Restaurant summary',
      metricsHtml:metrics(),
      boardTag:'main',
      boardClass:'rs-workbench-grid rs-workbench-grid--single restaurant-layout',
      boardAria:'Restaurant workspace',
      boardHtml:`<section class="rs-workbench-shell restaurant-main rs-card">${restaurantHead(ctx)}<div class="rs-workspace-body rs-workbench-body"><div class="rs-tab-bar"><nav class="rs-tabs restaurant-tabs" aria-label="Restaurant detail sections">${tabs(ctx.section)}</nav></div>${activeSection(ctx)}</div></section>`
    });
  }

  Restogogo.modules.RestaurantView = {render};
})();
