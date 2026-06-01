(function(){
  const Metrics = Restogogo.services.metrics;
  const Toolbar = Restogogo.services.toolbar;
  const RestaurantModel = Restogogo.modules.RestaurantModel;
  const setup = RestaurantModel.setup;
  const zones = RestaurantModel.zones;
  const setupPositions = RestaurantModel.positions;
  const ZONE_PAGE_SIZE = 99;
  const Icons = Restogogo.icons;
  const SetupReadiness = Restogogo.services.setupReadiness;
  const SetupGuide = Restogogo.services.setupGuide;

  function icon(name){
    return Icons.svg(name);
  }

  function statusIcon(state,options={}){
    return Icons.status(state,options);
  }

  function metrics(){
    const restaurantSetup=setup();
    const openDays=days.filter(day=>restaurantSetup.openingHours?.[day]?.open !== false).length;
    const activeZones=zones(false).length;
    const activePositions=setupPositions(false).length;
    const readiness=RestaurantModel.readiness();
    return `${Metrics.card({detailKey:'restaurant.setup',className:'rs-metric--hero',tone:readiness.tone,icon:readiness.ready?'check':'list',label:'Setup readiness',value:`${readiness.percent}%`,meta:readiness.detail})}
      ${Metrics.card({detailKey:'restaurant.zones',tone:'week',icon:'zone',label:'Active zones',value:String(activeZones),meta:activeZones?'Operational zones':'Add zones'})}
      ${Metrics.card({detailKey:'restaurant.positions',tone:'hours',icon:'id',label:'Positions',value:String(activePositions),meta:'Linked to team & planning'})}
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
    if(key.includes('position'))return 'id';
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

  function positionNameById(positionId){
    const position=setupPositions(true).find(item=>String(item.id || '')===String(positionId || ''));
    return position?.name || positionId || '';
  }

  function coverageForZoneServicePosition(zone,serviceKey,positionId){
    return coverageForZone(zone).find(req=>req.serviceKey===serviceKey && req.positionId===positionId)?.requiredCount || 0;
  }

  function coverageByServiceForZone(zone){
    const result={Lunch:0,Evening:0};
    coverageForZone(zone).forEach(req=>{
      if(result[req.serviceKey] !== undefined)result[req.serviceKey] += Number(req.requiredCount || 0);
    });
    return result;
  }

  function zoneRoleLabel(zone){
    const roles=coveragePositionIdsForZone(zone).map(positionNameById).filter(Boolean);
    if(!roles.length)return 'No required roles';
    return `${roles.slice(0,2).join(', ')}${roles.length>2?` +${roles.length-2}`:''}`;
  }

  function operationListHead(mode,count,action){
    const isZones = mode === 'zones';
    return `<div class="restaurant-list-head rs-panel-head">
      <div class="restaurant-list-title"><h3>${esc(isZones ? `Zones (${count})` : `Positions (${count})`)}</h3></div>
      <div class="restaurant-list-actions">
        <nav class="restaurant-mode-toggle rs-mode-toggle" aria-label="Restaurant setup type">
          <button type="button" class="${isZones?'is-active':''}" data-restaurant-ops="zones">Zones</button>
          <button type="button" class="${!isZones?'is-active':''}" data-restaurant-ops="positions">Positions</button>
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
  function coveragePositionIdsForZone(zone){
    return coverageForZone(zone).map(req=>req.positionId).filter((value,index,array)=>value&&array.indexOf(value)===index);
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

  function coverageCountControl(zone,position,serviceKey,count){
    const service=serviceKey === 'Evening' ? 'Evening' : 'Lunch';
    const serviceLabelText=service.toLowerCase();
    const zoneId=esc(zone.id);
    const positionId=esc(position.id);
    const positionName=esc(position.name);
    return `<div class="rs-field-control restaurant-coverage-count" data-coverage-count title="${esc(service)} required count">
      <button type="button" class="restaurant-coverage-step" data-coverage-step="-1" aria-label="Decrease ${positionName} ${serviceLabelText} required count">-</button>
      <input type="number" inputmode="numeric" min="0" max="20" step="1" name="coverage__${zoneId}__${esc(service)}__${positionId}" data-coverage-zone="${zoneId}" data-coverage-service="${esc(service)}" data-coverage-position="${positionId}" value="${esc(String(count || 0))}" aria-label="${positionName} ${serviceLabelText} required count">
      <button type="button" class="restaurant-coverage-step" data-coverage-step="1" aria-label="Increase ${positionName} ${serviceLabelText} required count">+</button>
    </div>`;
  }

  function coverageEditor(zone){
    const positions=setupPositions(false);
    if(!positions.length){
      return `<fieldset class="restaurant-position-fieldset restaurant-coverage-fieldset rs-fieldset"><legend>Required roles in this zone</legend><div class="rs-empty-state rs-empty-state--compact"><strong>No active positions</strong><span>Add positions before defining required roles.</span></div></fieldset>`;
    }
    const rows=positions.map(position=>{
      const lunchCount=coverageForZoneServicePosition(zone,'Lunch',position.id);
      const eveningCount=coverageForZoneServicePosition(zone,'Evening',position.id);
      return `<div class="restaurant-coverage-row">
        <div class="restaurant-coverage-position"><strong>${esc(position.name)}</strong><span>${esc(position.hourlyCost ? `€${position.hourlyCost}/h` : 'Required role')}</span></div>
        ${coverageCountControl(zone,position,'Lunch',lunchCount)}
        ${coverageCountControl(zone,position,'Evening',eveningCount)}
      </div>`;
    }).join('');
    return `<fieldset class="restaurant-position-fieldset restaurant-coverage-fieldset rs-fieldset">
      <legend>Required roles in this zone</legend>
      <div class="restaurant-coverage-head"><span>Role</span>${serviceLabel('Lunch')}${serviceLabel('Evening')}</div>
      <div class="restaurant-coverage-table">${rows}</div>
    </fieldset>`;
  }

  function zoneShiftSettings(zone){
    const defaultTimes = isPlainObject(zone?.defaultTimes) ? zone.defaultTimes : {};
    return `<fieldset class="restaurant-position-fieldset restaurant-zone-shift-fieldset rs-fieldset">
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


  function zonesForPosition(position){
    const id=String(position?.id || '').trim();
    if(!id)return [];
    return zones(false).filter(zone=>coveragePositionIdsForZone(zone).includes(id));
  }

  function positionZoneLabel(position){
    const list=zonesForPosition(position);
    if(!list.length)return 'No linked zone';
    return `${list.slice(0,2).map(zone=>zone.name).join(', ')}${list.length>2?` +${list.length-2}`:''}`;
  }

  function usedInZoneChips(position){
    const list=zonesForPosition(position);
    return list.map(zone=>`<span class="restaurant-derived-chip rs-chip is-pill">${esc(zone.name)}</span>`).join('') || '<div class="rs-empty-state rs-empty-state--compact"><strong>No linked zones</strong><span>Add this position in zone coverage.</span></div>';
  }

  function positionCards(ctx){
    const list=setupPositions(true);
    const cards=list.map(position=>{
      const active=position.id===ctx.selectedPositionId;
      const count=(data.employees||[]).filter(employee=>String(employee.positionId || '')===String(position.id || '')).length;
      const cost = Number(position.hourlyCost || 0);
      return `<button type="button" class="rs-entity-list-row restaurant-position-card ${active?'is-active':''} ${position.active===false?'is-muted':''}" data-restaurant-position="${esc(position.id)}">
        <span class="rs-entity-list-copy restaurant-position-copy"><strong>${esc(position.name)}</strong><small>${esc(positionZoneLabel(position))}</small></span>
        <span class="rs-entity-list-meta restaurant-position-meta">${esc(`${count} employees${cost ? ` · €${cost}/h` : ''}`)}</span>
        ${statusIcon(position.active===false?'inactive':'active',{className:'is-inline'})}
      </button>`;
    }).join('');
    return `<section class="rs-section-surface rs-workbench-list rs-workbench-list--entity restaurant-list-panel">
      ${operationListHead('positions',list.length,{label:'Add',name:'add-position'})}
      <div class="rs-workbench-list-scroll restaurant-position-list">${cards || '<div class="rs-empty-state rs-empty-state--compact"><strong>No positions configured</strong><span>Add a position.</span></div>'}</div>
    </section>`;
  }

  function positionEditor(position){
    return `<section class="rs-section-surface rs-workbench-detail restaurant-detail-panel"><form data-restaurant-form="position">
      <div class="restaurant-detail-head rs-section-head">
        <div><h3>Position details</h3></div>
        ${statusIcon(position?.active===false?'inactive':'active')}
      </div>
      <div class="restaurant-detail-grid">
        <label class="rs-field restaurant-inline-field"><span>Position name</span><input name="name" value="${esc(position?.name || '')}" placeholder="Position name" required></label>
        <label class="rs-field restaurant-inline-field"><span>Hourly cost</span><input name="hourlyCost" value="${esc(position?.hourlyCost || '')}" type="number" min="0" step="0.01" placeholder="Hourly cost"></label>
        <label class="rs-field restaurant-inline-field"><span>Status</span><select name="active"><option value="true" ${position?.active!==false?'selected':''}>Active</option><option value="false" ${position?.active===false?'selected':''}>Inactive</option></select></label>
      </div>
      <fieldset class="restaurant-position-fieldset restaurant-derived-fieldset rs-fieldset"><legend>Used in zones</legend><div class="restaurant-chip-grid">${usedInZoneChips(position)}</div></fieldset>
    </form></section>`;
  }

  function operationsSection(ctx){
    const mode=ctx.operationMode === 'positions' ? 'positions' : 'zones';
    return `<section class="rs-tab-panel restaurant-tab-panel restaurant-operations-panel">
      <section class="rs-workbench-layout restaurant-operations-workbench">
        ${mode==='positions'?`${positionCards(ctx)}${positionEditor(ctx.selectedPosition)}`:`${zoneCards(ctx)}${zoneEditor(ctx.selectedZone)}`}
      </section>
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
      <div class="restaurant-detail-head rs-section-head"><div><h3>Payroll / export rules</h3></div>${statusIcon(issues.length?'warning':'ready',{label:issues.length?`${issues.length} setup issues`:'Ready'})}</div>
      <div class="restaurant-detail-grid">
        <label class="rs-field restaurant-inline-field"><span>Payroll provider</span><input name="provider" value="${esc(rules.provider || '')}" placeholder="SD Worx, Securex, CSV..."></label>
        <label class="rs-field restaurant-inline-field"><span>Export format</span><select name="exportFormat"><option ${rules.exportFormat==='CSV'?'selected':''}>CSV</option><option ${rules.exportFormat==='Excel'?'selected':''}>Excel</option><option ${rules.exportFormat==='API'?'selected':''}>API</option></select></label>
        <label class="rs-field restaurant-inline-field"><span>Cost center</span><input name="costCenter" value="${esc(rules.costCenter || '')}" placeholder="Optional"></label>
      </div>
      <div class="restaurant-checklist">${issues.map(issue=>`<article class="rs-list-row restaurant-checklist-row">${statusIcon('warning',{label:issue,className:'is-inline'})}<strong>${esc(issue)}</strong></article>`).join('') || `<article class="rs-list-row restaurant-checklist-row">${statusIcon('ready',{className:'is-inline'})}<strong>All required setup items are configured.</strong></article>`}</div>
    </form></section>`;
  }

  function activeSection(ctx){
    if(ctx.section==='setup')return setupGuideSection();
    if(ctx.section==='payroll')return payrollSection();
    if(ctx.section==='operations')return operationsSection(ctx);
    return generalSection();
  }

  function tabs(section){
    const items=[
      ['setup','Setup guide','list'],
      ['general','General','identity'],
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
        subtitle:'Zones, positions, opening hours and coverage.'
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
