(function(){
  const Metrics = Restogogo.services.metrics;
  const Toolbar = Restogogo.services.toolbar;
  const TeamModel = Restogogo.modules.TeamModel;
  const SetupReadiness = Restogogo.services.setupReadiness;
  const SetupGuide = Restogogo.services.setupGuide;
  const Icons = Restogogo.icons;

  function canSeeSensitiveTeamData(){
    return Restogogo.registry?.isOwner?.(session.role) === true;
  }

  const OPTION_GROUPS = {
    workRegime:[
      ['', 'Select work regime'],
      ['full_time', 'Full-time'],
      ['part_time', 'Part-time'],
      ['variable', 'Variable'],
      ['extra', 'Extra'],
      ['student', 'Student'],
      ['flexi', 'Flexi']
    ],
    payrollProvider:[
      ['', 'Select provider'],
      ['manual_csv', 'Manual CSV'],
      ['sd_worx', 'SD Worx'],
      ['partena', 'Partena'],
      ['acerta', 'Acerta'],
      ['liantis', 'Liantis'],
      ['securex', 'Securex'],
      ['other', 'Other']
    ]
  };

  function optionLabel(options,value){
    const current = String(value || '');
    const found = (options || []).find(option=>String(option[0])===current);
    return found ? found[1] : '—';
  }

  function currentjobFunctionName(employee, ctx){
    const jobFunction = (ctx.jobFunctionChoices || []).find(item=>String(item.id)===String(employee.jobFunctionId || ''));
    return jobFunction?.name || 'No job function';
  }

  function icon(name,className=''){
    return Icons.svg(name,className);
  }

  function statusIcon(state,options={}){
    return Icons.status(state,options);
  }

  function employeeStatusState(employee,status=TeamModel.employeeStatus(employee)){
    if(employee?.active === false)return 'inactive';
    return status.tone === 'warning' ? 'warning' : 'active';
  }

  function employeeStatusIcon(employee){
    const status = TeamModel.employeeStatus(employee);
    const state = employeeStatusState(employee,status);
    return `<span class="rs-status-dot is-${esc(state)}" title="${esc(status.label)}" aria-label="${esc(status.label)}"></span>`;
  }

  function employeeStatusPill(employee){
    const status = TeamModel.employeeStatus(employee);
    return `<span class="rs-chip rs-chip--status is-pill">${esc(status.label)}</span>`;
  }

  function absenceStatusState(status){
    return Restogogo.logic?.absences?.statusState?.(status) || 'pending';
  }

  function initialsAvatar(employee){
    const name = employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'New';
    return `<span class="rs-avatar rs-person-avatar team-avatar" style="${esc(jobFunctionStyle(employeeJobFunctionName(employee)))}">${esc(employeeInitials(name).slice(0,1))}</span>`;
  }

  function payrollPercent(employees){
    return TeamModel.payrollPercent(employees || []);
  }

  function metrics(employees){
    const active = employees.filter(employee=>employee.active).length;
    const inactive = employees.length-active;
    const expiring = employees.filter(TeamModel.expiringSoon);
    const nextExpiry = expiring.map(employee=>TeamModel.daysUntil(employee.contractEnd)).filter(Number.isFinite).sort((a,b)=>a-b)[0];
    const absences = TeamModel.countAbsencesThisMonth(employees);
    const ready = employees.filter(TeamModel.isPayrollReady).length;
    return `${Metrics.card({detailKey:'team.employees',className:'rs-metric--hero',tone:'status',icon:'users',label:'Total employees',value:String(employees.length),meta:`${active} active · ${inactive} inactive`})}
      ${Metrics.card({detailKey:'team.contracts',tone:expiring.length?'warning':'success',icon:'document',label:'Contracts expiring',value:String(expiring.length),meta:nextExpiry!==undefined?`Next: ${nextExpiry} days`:'No urgent renewals'})}
      ${Metrics.card({detailKey:'team.absences',tone:'hours',icon:'palm',label:'Absences this month',value:String(absences),meta:'Linked to planning availability'})}
      ${Metrics.card({detailKey:'team.payroll',tone:ready === (employees.length || 0)?'success':'warning',icon:'payroll',label:'Payroll ready',value:`${payrollPercent(employees)}%`,meta:`${ready} of ${employees.length || 0} employees ready`})}`;
  }

  function directoryFilterButton(label,value,current,count){
    return `<button type="button" class="rs-filter-chip team-directory-filter ${current===value?'is-active':''}" data-team-filter="${esc(value)}"><span>${esc(label)}</span><strong>${esc(String(count))}</strong></button>`;
  }

  function directoryIssueBadges(employee){
    const issues = TeamModel.setupIssues(employee);
    if(!issues.absences) return '';
    const label = issues.absences === 1 ? '1 pending approval' : `${issues.absences} pending approvals`;
    return `<small class="rs-person-badge is-warning" title="${esc(label)}" aria-label="${esc(label)}">${esc(String(issues.absences))}</small>`;
  }

  function directory(ctx){
    const filter = ctx.teamFilter || 'all';
    const counts = TeamModel.directoryCounts(ctx.employees);
    const employees = TeamModel.visibleEmployees(ctx.employees, ctx.teamSearch, filter);
    const rows = employees.map(employee=>{
      const status = TeamModel.employeeStatus(employee);
      const active = employee.id === ctx.selectedEmployeeId;
      const name = employee.name || 'New employee';
      return `<button type="button" class="rs-person-row team-person ${active?'is-active':''}" data-team-select="${esc(employee.id)}">
        ${initialsAvatar(employee)}
        <span class="rs-person-copy team-person-copy">
          <span class="rs-person-line team-person-line"><strong>${esc(name)}</strong><span class="rs-person-badges team-person-badges">${directoryIssueBadges(employee)}</span>${employeeStatusIcon(employee)}</span>
          <small>${esc(currentjobFunctionName(employee, ctx))}</small>
        </span>
      </button>`;
    }).join('') || `<div class="rs-empty-state"><strong>No employees found</strong><span>Search another name or add a new employee.</span></div>`;
    return `<aside class="rs-section-surface rs-workbench-list rs-workbench-list--directory team-directory">
      <div class="rs-panel-head"><h2>Employees</h2><button type="button" class="rs-action-button is-compact" data-team-action="add-employee">${icon('plus')}<span>Add</span></button></div>
      ${Toolbar.searchControl({className:'team-directory-search',ariaLabel:'Search employees',placeholder:'Search employees...',value:ctx.teamSearch,data:{'data-team-search':true}})}
      <div class="team-directory-filters" aria-label="Team directory filters">
        ${directoryFilterButton('All','all',filter,counts.all)}
        ${directoryFilterButton('Active','active',filter,counts.active)}
        ${directoryFilterButton('Issues','action',filter,counts.action)}
      </div>
      <div class="rs-workbench-list-scroll team-list">${rows}</div>
      <div class="rs-panel-foot"><span>Showing ${employees.length} of ${ctx.employees.length}</span></div>
    </aside>`;
  }

  function formatProfileDate(value,fallback='—'){
    return value ? shortDisplayDate(value) : fallback;
  }

  function profileChip(iconName,label){
    return `<span class="rs-entity-chip team-profile-chip">${icon(iconName,'rs-inline-icon')}${esc(label)}</span>`;
  }


  function profileHeader(employee, ctx){
    const name = employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'New employee';
    const weeklyHours = employee.contractHours ? `${fmtHours(employee.contractHours)} / week` : '0h / week';
    const avatar = initialsAvatar({...employee,name}).replace('team-avatar', 'team-avatar rs-entity-avatar');
    return `<header class="team-profile-head team-profile-hero rs-entity-header rs-entity-header--team">
      <div class="team-profile-main rs-entity-identity">
        ${avatar}
        <div class="team-profile-title rs-entity-copy">
          <div class="rs-entity-title-line"><h2>${esc(name)}</h2>${employeeStatusPill(employee)}</div>
          <p class="team-profile-meta-chips rs-entity-chips" aria-label="Employee summary">
            ${profileChip('jobFunction', currentjobFunctionName(employee, ctx))}
            ${profileChip('clock', weeklyHours)}
          </p>
        </div>
      </div>
      ${profileActions(ctx)}
    </header>`;
  }

  function requiredFieldClass(isMissing){
    return isMissing ? ' is-required-missing' : '';
  }

  function inputField(label,name,value,type='text',attrs='',fieldClass=''){
    return `<label class="rs-field team-inline-field${fieldClass}"><span>${esc(label)}</span><input name="${esc(name)}" value="${esc(value ?? '')}" type="${esc(type)}" placeholder="${esc(label)}" data-team-field="${esc(name)}" ${attrs}></label>`;
  }

  function selectField(label,name,value,options,fieldClass=''){
    const current = String(value ?? '');
    const normalizedOptions = options.map(option=>Array.isArray(option) ? option : (typeof option === 'string' ? [option, option] : [option.value, option.label]));
    const opts = normalizedOptions.map(option=>`<option value="${esc(option[0])}" ${String(option[0])===current?'selected':''}>${esc(option[1])}</option>`).join('');
    return `<label class="rs-field team-inline-field${fieldClass}"><span>${esc(label)}</span><select name="${esc(name)}" data-team-field="${esc(name)}">${opts}</select></label>`;
  }


  function jobFunctionselect(employee, ctx){
    const choices = ctx.jobFunctionChoices || [];
    if(!choices.length){
      return `<div class="rs-empty-state rs-empty-state--compact team-job-function-empty"><strong>No job functions configured</strong><span>Create job functions in Restaurant first, then assign them here.</span></div>`;
    }
    const current = String(employee.jobFunctionId || '');
    const opts = [['','Select job function'], ...choices.map(item=>[item.id,item.name])].map(option=>`<option value="${esc(option[0])}" ${String(option[0])===current?'selected':''}>${esc(option[1])}</option>`).join('');
    return `<label class="rs-field team-inline-field${requiredFieldClass(!String(employee.jobFunctionId || '').trim())}"><span>Job function</span><select name="jobFunctionId" data-team-field="jobFunctionId" required>${opts}</select></label>`;
  }

  function contractTypeSelect(employee, ctx, fieldClass=''){
    const choices = Array.isArray(ctx.contractTypeChoices) ? ctx.contractTypeChoices : [];
    if(!choices.length){
      return `<div class="rs-empty-state rs-empty-state--compact team-job-function-empty"><strong>No contract types configured</strong><span>Create contract types in Restaurant first, then assign them here.</span></div>`;
    }
    const current = String(employee.contractTypeId || '');
    const opts = [['','Select contract type'], ...choices.map(item=>[item.id,item.name])].map(option=>`<option value="${esc(option[0])}" ${String(option[0])===current?'selected':''}>${esc(option[1])}</option>`).join('');
    return `<label class="rs-field team-inline-field${fieldClass}"><span>Contract type</span><select name="contractTypeId" data-team-field="contractTypeId">${opts}</select></label>`;
  }

  function absenceTypeOptions(ctx){
    const types = normalizeAbsenceTypeList(ctx.absenceTypes || []);
    return types.filter(type=>type.active !== false).map(type=>[type.id, type.name]);
  }

  function absenceStatusBadge(status){
    const clean = String(status || 'Pending');
    return statusIcon(absenceStatusState(clean),{label:clean,className:'is-inline'});
  }

  function absenceActions(absence){
    const idValue = esc(absence.id);
    const status = String(absence.status || 'Pending');
    if(status === 'Pending'){
      return `<div class="team-absence-actions">
        <button type="button" class="rs-action-button is-compact is-success" data-team-action="approve-absence" data-absence-id="${idValue}">Approve</button>
        <button type="button" class="rs-action-button is-compact is-danger" data-team-action="reject-absence" data-absence-id="${idValue}">Reject</button>
      </div>`;
    }
    if(status === 'Approved'){
      return `<div class="team-absence-actions">
        <button type="button" class="rs-action-button is-compact is-secondary" data-team-action="cancel-absence" data-absence-id="${idValue}">Cancel</button>
      </div>`;
    }
    return `<div class="team-absence-actions"><small>History</small></div>`;
  }


  function absenceDateValue(value){
    return Restogogo.logic?.absences?.dateValue?.(value) || String(value || '').slice(0,10);
  }

  function absenceDurationDays(absence){
    return Restogogo.logic?.absences?.calendarDays?.(absence,1) || 1;
  }

  function absenceYear(absence){
    return Restogogo.logic?.absences?.year?.(absence) || new Date().getFullYear();
  }

  function absenceTypeIcon(label){
    return Restogogo.logic?.absences?.iconNameForText?.(label) || 'palm';
  }

  function absenceDateRange(absence){
    return Restogogo.logic?.absences?.dateRangeLabel?.(absence) || '—';
  }

  function absenceDayRange(absence){
    return Restogogo.logic?.absences?.weekdayRangeLabel?.(absence) || '';
  }

  function absenceManager(absence){
    if(absence?.approvedBy)return 'Manager';
    if(absence?.rejectedBy)return 'Manager';
    if(absence?.cancelledAt)return 'Manager';
    return '—';
  }

  function absenceCreated(absence){
    return absence?.createdAt ? shortDisplayDate(absence.createdAt) : (absence?.requestedBy === 'employee' ? 'Employee request' : '—');
  }

  function absenceRows(employee,ctx,{history=false}={}){
    const types = normalizeAbsenceTypeList(ctx.absenceTypes || []);
    const today = todayISO();
    const rows = (employee.absences || [])
      .filter(absence=>{
        const status = String(absence.status || 'Pending');
        if(history)return ['Rejected','Cancelled'].includes(status) || absenceDateValue(absence.end || absence.start) < today;
        return ['Pending','Approved'].includes(status) && absenceDateValue(absence.end || absence.start) >= today;
      })
      .sort((a,b)=>String(a.start).localeCompare(String(b.start)) || absenceStatusRank(a.status)-absenceStatusRank(b.status));
    if(!rows.length){
      return `<tr class="team-absence-empty-row"><td colspan="7"><strong>${history?'No history yet':'No upcoming absences'}</strong><span>${history?'Rejected, cancelled and past absences will appear here.':'Approved and pending future absences will appear here.'}</span></td></tr>`;
    }
    return rows.map(absence=>{
      const label = absenceTypeLabel(types, absence.absenceTypeId, absence.reason || 'Leave');
      const duration = absenceDurationDays(absence);
      const absenceIcon = absenceTypeIcon(label);
      const absenceIconClass = Restogogo.logic?.absences?.iconClassName?.(absenceIcon) || 'calendar';
      return `<tr class="team-absence-table-row is-${esc(String(absence.status || 'Pending').toLowerCase())}">
        <td><span class="team-absence-type"><i class="rs-absence-icon team-absence-type-icon is-${esc(absenceIconClass)}" aria-hidden="true">${icon(absenceIcon)}</i><strong>${esc(label)}</strong></span></td>
        <td><strong>${esc(absenceDateRange(absence))}</strong><small>${esc(absenceDayRange(absence))}</small></td>
        <td>${esc(duration === 1 ? '1 day' : `${duration} days`)}${absence.shift && absence.shift !== 'Full day' ? `<small>${esc(absence.shift)}</small>` : ''}</td>
        <td>${absenceStatusBadge(absence.status)}</td>
        <td>${esc(absenceManager(absence))}</td>
        <td>${esc(absenceCreated(absence))}</td>
        <td>${absenceActions(absence)}</td>
      </tr>`;
    }).join('');
  }

  function absenceStatusRank(status){
    return Restogogo.logic?.absences?.statusRank?.(status,'workflow') ?? 9;
  }

  function absenceFact(label,value,meta='',tone=''){
    return `<span class="team-absence-fact ${tone?`is-${esc(tone)}`:''}"><small>${esc(label)}</small><strong>${esc(value)}</strong>${meta?`<em>${esc(meta)}</em>`:''}</span>`;
  }

  function formatDays(value){
    const number = Number(value) || 0;
    return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/,'');
  }

  function absenceOverview(employee){
    const currentYear = new Date().getFullYear();
    const today = todayISO();
    const approvedThisYear = (employee.absences || []).filter(absence=>String(absence.status || '') === 'Approved' && absenceYear(absence) === currentYear);
    const pending = (employee.absences || []).filter(absence=>String(absence.status || 'Pending') === 'Pending').length;
    const upcoming = (employee.absences || []).filter(absence=>['Pending','Approved'].includes(String(absence.status || 'Pending')) && absenceDateValue(absence.end || absence.start) >= today).length;
    const taken = approvedThisYear.reduce((sum,absence)=>sum + absenceDurationDays(absence),0);
    const entitlement = Number(employee.annualLeaveEntitlementDays) || 0;
    const remaining = entitlement ? Math.max(0, entitlement - taken) : 0;
    return `<div class="team-absence-facts" aria-label="Absence overview">
      ${absenceFact('Entitlement', entitlement ? `${formatDays(entitlement)} days` : 'Not configured','',entitlement ? '' : 'warning')}
      ${absenceFact('Taken this year',`${taken} ${taken === 1 ? 'day' : 'days'}`,'Approved')}
      ${absenceFact('Remaining',entitlement ? `${formatDays(remaining)} ${remaining === 1 ? 'day' : 'days'}` : '—')}
      ${absenceFact('Pending',String(pending),pending === 1 ? 'request' : 'requests')}
      ${absenceFact('Upcoming',String(upcoming),upcoming === 1 ? 'record' : 'records')}
    </div>`;
  }
  function tabButton(label,value,teamTab,iconName=''){
    return `<button type="button" class="rs-tab team-tab ${teamTab===value?'is-active':''}" data-team-tab="${esc(value)}">${iconName?icon(iconName,'rs-inline-icon'):''}<span>${esc(label)}</span></button>`;
  }

  function profileTabs(employee,teamTab){
    if(!employee){
      return `<nav class="rs-tabs team-tabs" aria-label="Team detail sections">
        ${tabButton('Setup guide','setup',teamTab,'list')}
      </nav>`;
    }
    const sensitiveTabs = canSeeSensitiveTeamData()
      ? `${tabButton('Legal/private','legal',teamTab,'lock')}${tabButton('Contract','contract',teamTab,'document')}${tabButton('Payroll','payroll',teamTab,'payroll')}`
      : '';
    return `<nav class="rs-tabs team-tabs" aria-label="Employee detail sections">
      ${tabButton('Setup guide','setup',teamTab,'list')}
      ${tabButton('Core','core',teamTab,'user')}
      ${tabButton('Contact','contact',teamTab,'phone')}
      ${sensitiveTabs}
      ${tabButton('Absences','absences',teamTab,'calendar')}
    </nav>`;
  }



  function profileCardHead(title,iconName,action=''){
    const headIcon = iconName ? `<span class="rs-section-title-icon" aria-hidden="true">${icon(iconName)}</span>` : '';
    return `<header class="rs-section-surface__head"><div class="rs-content-head-title">${headIcon}<strong>${esc(title)}</strong></div>${action}</header>`;
  }

  function panelKey(title){
    return String(title || 'panel').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'panel';
  }

  function profileCard(title,iconName,content,extraClass='',meta='',gridClass='rs-section-grid'){
    const help = meta ? ` title="${esc(meta)}"` : '';
    return `<article class="rs-section-surface rs-workbench-card team-profile-card ${extraClass}" data-team-profile-panel="${esc(panelKey(title))}"${help}>${profileCardHead(title,iconName)}<div class="${esc(gridClass)}">${content}</div></article>`;
  }

  function accessLabel(employee){
    if(employee.active === false)return 'Disabled';
    if(employee.badgeEnabled === false)return 'Badge access off';
    const status = String(employee.pinStatus || '').trim();
    if(status === 'active')return 'Active';
    if(status === 'disabled')return 'Badge disabled';
    const access = String(employee.accessStatus || '').trim();
    if(access === 'invited' || access === 'temporary')return 'Invited — awaiting accept';
    return 'Not invited';
  }

  function coreTabContent(employee,ctx){
    const missing = TeamModel.generalMissingFields(employee);
    const missingSet = new Set(missing);
    return `${profileCard('Identity','identity',`
        ${inputField('First name','firstName',employee.firstName,'text','',requiredFieldClass(missingSet.has('First name')))}${inputField('Last name','lastName',employee.lastName,'text','',requiredFieldClass(missingSet.has('Last name')))}
        ${inputField('Display name','name',employee.name,'text','placeholder="Name shown in planning"')}
      `)}
      ${profileCard('Work profile','jobFunction',`
        ${jobFunctionselect(employee, ctx)}${selectField('Status','active',employee.active === false ? 'false' : 'true',[['true','Active'],['false','Inactive']])}
      `)}`;
  }

  function contactTabContent(employee){
    const missing = TeamModel.generalMissingFields(employee);
    const missingSet = new Set(missing);
    return `${profileCard('Contact information','phone',`
        ${inputField('Email','email',employee.email,'email')}${inputField('Phone','phone',employee.phone,'text','',requiredFieldClass(missingSet.has('Phone')))}
        ${inputField('Address','address',employee.address)}${inputField('Postal code','postalCode',employee.postalCode)}${inputField('City','city',employee.city)}
      `)}
      ${profileCard('Access','key',`
        <label class="rs-field team-inline-field"><span>Access status</span><input value="${esc(accessLabel(employee))}" disabled></label>
        ${selectField('Badge access','badgeEnabled',employee.badgeEnabled === false ? 'false' : 'true',[['true','Enabled'],['false','Disabled']])}
        <label class="rs-field team-inline-field"><span>App role</span><select data-team-invite-role><option value="employee" selected>Employee</option><option value="manager">Manager</option></select></label>
        <button class="rs-action-button is-secondary team-inline-action" data-team-action="invite-app" type="button">Invite to app</button>
      `)}
      ${profileCard('Emergency contact','heart',`
        ${inputField('Contact name','emergencyName',employee.emergencyName)}${inputField('Relationship','emergencyRelation',employee.emergencyRelation)}${inputField('Emergency phone','emergencyPhone',employee.emergencyPhone)}
      `)}
      ${profileCard('Notes','note',`
        <label class="rs-field team-inline-field is-wide"><span>Notes</span><textarea name="notes" data-team-field="notes">${esc(employee.notes || '')}</textarea></label>
      `,'','', 'rs-section-stack')}`;
  }

  function legalTabContent(employee){
    const missing = TeamModel.payrollMissingFields(employee);
    return `${profileCard('Legal identity','lock',`
        ${inputField('Nationality','nationality',employee.nationality)}
        ${inputField('NISS / social security no.','socialSecurityNo',employee.socialSecurityNo,'text','',requiredFieldClass(missing.includes('NISS / social security no.')))}
      `,'','Owner-only legal identity fields.','rs-section-stack')}`;
  }

  function teamSetupGuide(){
    const summary = SetupReadiness.buildTeam(data);
    return SetupGuide.guide({
      summary,
      title:'Team setup guide',
      description:'Prepare employees for Planning, Badge Terminal, Absences and payroll readiness.',
      targetAttr:'data-team-setup-target'
    });
  }

  function profileTabContent(employee,teamTab,ctx){
    if(teamTab==='setup' || !employee)return teamSetupGuide();
    if(!canSeeSensitiveTeamData() && ['legal','contract','payroll'].includes(teamTab)){
      return profileCard('Owner-only details','lock',`<p class="team-muted-copy">Legal, contract and payroll information is owner-only. Managers can continue with Core, Contact, Absences and quick-access operations.</p>`,'is-wide','', 'rs-section-stack');
    }
    const missing = TeamModel.payrollMissingFields(employee);
    if(teamTab==='core')return coreTabContent(employee,ctx);
    if(teamTab==='contact')return contactTabContent(employee);
    if(teamTab==='legal')return legalTabContent(employee);
    if(teamTab==='contract'){
      const contractMissing = TeamModel.contractMissingFields(employee);
      return `${profileCard('Employment','document',`
          ${contractTypeSelect(employee, ctx, requiredFieldClass(contractMissing.includes('Contract type')))}
          ${selectField('Work regime','workRegime',employee.workRegime,OPTION_GROUPS.workRegime,requiredFieldClass(contractMissing.includes('Work regime')))}
          ${inputField('Weekly hours','contractHours',employee.contractHours,'number','min="0" step="0.5"',requiredFieldClass(contractMissing.includes('Weekly hours')))}
        `,'team-contract-employment','Core contract details used by planning and payroll prep.','rs-section-grid rs-section-grid--three')}
        ${profileCard('Contract dates','calendar',`
          ${inputField('Start date','contractStart',employee.contractStart,'date','',requiredFieldClass(contractMissing.includes('Start date')))}
          ${inputField('Contract end','contractEnd',employee.contractEnd,'date')}
        `,'team-contract-dates','Leave contract end empty for open-ended contracts.','rs-section-stack')}
        ${profileCard('Cost setup','euro',`
          ${inputField('Estimated hourly cost','estimatedHourlyCost',employee.estimatedHourlyCost,'number','min="0" step="0.01"')}
          ${inputField('Annual leave entitlement','annualLeaveEntitlementDays',employee.annualLeaveEntitlementDays || 0,'number','min="0" step="0.5"',requiredFieldClass(contractMissing.includes('Annual leave entitlement')))}
        `,'team-contract-cost','Employee cost is used by Planning and Actuals. Defaults can come from the selected Restaurant job function.','rs-section-stack')}`;
    }
    if(teamTab==='payroll'){
      return `${profileCard('Payroll setup','payroll',`
          ${selectField('Payroll provider','payrollProvider',employee.payrollProvider,OPTION_GROUPS.payrollProvider,requiredFieldClass(missing.includes('Payroll provider')))}
          ${inputField('Payroll employee ID','payrollId',employee.payrollId,'text','',requiredFieldClass(missing.includes('Payroll employee ID')))}
        `,'','Provider and employee identifier used for handoff/export.')}
        ${profileCard('Identity & banking','bank',`
          ${inputField('IBAN','iban',employee.iban,'text','',requiredFieldClass(missing.includes('IBAN')))}
          ${inputField('BIC','bic',employee.bic)}
        `,'','Only the essentials needed for payroll handoff.')}
        ${profileCard('Payroll notes','note',`
          <label class="rs-field team-inline-field is-wide is-compact-note"><span>Payroll notes</span><textarea name="payrollNotes" data-team-field="payrollNotes">${esc(employee.payrollNotes || '')}</textarea></label>
        `,'','Optional notes for the person preparing payroll.','rs-section-stack')}`;
    }
    if(teamTab==='absences'){
      const typeOptions = [['','Select absence type'], ...absenceTypeOptions(ctx)];
      const absenceEntryForm = ctx.absenceEntryOpen ? `<form class="team-absence-form team-absence-entry-panel" data-team-absence-form>
        ${selectField('Type','absenceTypeId','holiday',typeOptions)}
        ${inputField('Start date','absenceStart',todayISO(),'date','required')}
        ${inputField('End date','absenceEnd',todayISO(),'date','required')}
        ${selectField('Shift','absenceShift','Full day',['Full day','Lunch','Evening'])}
        ${selectField('Status','absenceStatus','Approved',['Pending','Approved','Rejected','Cancelled'])}
        <label class="rs-field team-inline-field is-wide"><span>Manager comment</span><input name="managerComment" value="" type="text" placeholder="Optional note"></label>
        <button type="button" class="rs-action-button is-compact team-card-action" data-team-action="add-absence">Add</button>
      </form>` : '';
      return `${profileCard('Absence balance','palm',absenceOverview(employee),'team-absence-overview-card','', 'rs-section-stack')}
        <section class="rs-section-surface rs-workbench-card team-profile-card team-absence-table-card" data-team-profile-panel="upcoming-absences">
          ${profileCardHead('Upcoming absences','list',`<button type="button" class="rs-action-button is-compact" data-team-toggle-request>${ctx.absenceEntryOpen?'Close':'Add'}</button>`)}
          ${absenceEntryForm}
          <div class="team-absence-table-wrap">
            <table class="team-absence-table rs-table">
              <thead><tr><th>Type</th><th>Dates</th><th>Duration</th><th>Status</th><th>Manager</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>${absenceRows(employee,ctx)}</tbody>
            </table>
          </div>
          <details class="team-absence-history-details">
            <summary>View history</summary>
            <div class="team-absence-table-wrap">
              <table class="team-absence-table rs-table is-history">
                <thead><tr><th>Type</th><th>Dates</th><th>Duration</th><th>Status</th><th>Manager</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>${absenceRows(employee,ctx,{history:true})}</tbody>
              </table>
            </div>
          </details>
        </section>`;
    }
    return coreTabContent(employee,ctx);
  }

  function profileActions(ctx){
    const dirty=!!ctx.dirty;
    return Toolbar.saveActions({
      className:'rs-action-row rs-entity-actions team-profile-actions',
      dirty,
      actionAttr:'data-team-action',
      cancelAction:'cancel-profile',
      clickAction:'save-profile',
      data:{'data-team-actions':true},
      cancelLabel:'Cancel employee changes',
      saveLabel:'Save employee changes',
      extraHtml:Toolbar.actionMenu({
        className:'team-profile-menu',
        ariaLabel:'Employee actions',
        title:'Employee actions',
        actionAttr:'data-team-action',
        items:[
          {action:'renew-contract',label:'Renew contract'}
        ]
      })
    });
  }

  function teamWorkbenchHead(employee,ctx){
    if(employee)return profileHeader(employee,ctx);
    const employeeCount = (ctx.employees || []).length;
    const status = employeeCount ? `${employeeCount} employees` : 'Needs employee';
    const chip = employeeCount ? 'Team setup readiness' : 'Add employees to start planning';
    return `<header class="team-profile-head team-profile-hero rs-entity-header rs-entity-header--team">
      <div class="team-profile-main rs-entity-identity">
        <span class="rs-weekly-avatar team-avatar rs-entity-avatar">T</span>
        <div class="team-profile-title rs-entity-copy">
          <div class="rs-entity-title-line"><h2>Team setup</h2><span class="rs-chip rs-chip--status is-pill">${esc(status)}</span></div>
          <p class="team-profile-meta-chips rs-entity-chips" aria-label="Team setup summary">
            ${profileChip('users', chip)}
          </p>
        </div>
      </div>
    </header>`;
  }

  function profile(employee,teamTab,ctx){
    const isSetupTab = teamTab === 'setup' || !employee;
    const addEmployeePanel = employee ? '' : profileCard('Add first employee','users',`<p class="team-muted-copy">Create an employee to unlock Core, Contact, Contract, Payroll and Absences details.</p><button type="button" class="rs-primary-button" data-team-action="add-employee">Add employee</button>`,'team-add-employee-panel','', 'rs-section-stack');
    return `<div class="rs-workbench-detail rs-workbench-detail-stack team-profile-stack">${profileTabContent(employee, isSetupTab ? 'setup' : teamTab, ctx)}${addEmployeePanel}</div>`;
  }

  function render(ctx){
    const employees = ctx.employees || [];
    const jobFunctionChoices = Array.isArray(ctx.jobFunctionChoices) ? ctx.jobFunctionChoices : [];
    const contractTypeChoices = Array.isArray(ctx.contractTypeChoices) ? ctx.contractTypeChoices : [];
    const employee = ctx.employee || null;
    const teamTab = employee ? (ctx.teamTab || 'setup') : 'setup';
    const isSetupTab = teamTab === 'setup';
    const workbenchHead = teamWorkbenchHead(isSetupTab ? null : employee,{...ctx, employees, jobFunctionChoices, contractTypeChoices});
    const tabs = profileTabs(employee,teamTab);
    const workbenchLayoutClass = `rs-workbench-layout team-workbench-layout ${isSetupTab ? 'rs-workbench-layout--single team-workbench-layout--setup' : ''}`.trim();
    const workbenchHtml = isSetupTab
      ? profile(employee, 'setup', {...ctx, employees, jobFunctionChoices, contractTypeChoices})
      : `${directory({...ctx, employees, jobFunctionChoices, contractTypeChoices})}${profile(employee, teamTab, {...ctx, employees, jobFunctionChoices, contractTypeChoices})}`;
    return Restogogo.services.pageShell.standard({
      moduleName:'team',
      title:'Team',
      headerHtml:Restogogo.services.moduleHeader.content({
        moduleName:'team',
        title:'Team',
        subtitle:'Your people. Contracts, absences and payroll readiness.'
      }),
      metricsClass:'team-metrics rs-metrics--hero-first',
      metricsAria:'Team summary',
      metricsHtml:metrics(employees),
      boardTag:'main',
      boardClass:'rs-workbench-grid rs-workbench-grid--single team-layout',
      boardAria:'Team workspace',
      boardHtml:`<section class="rs-workbench-shell team-main rs-card">${workbenchHead}<div class="rs-workspace-body rs-workbench-body"><div class="rs-tab-bar">${tabs}</div><section class="${esc(workbenchLayoutClass)}">${workbenchHtml}</section></div></section>`
    });
  }

  Restogogo.modules.TeamView = {render, optionGroups:OPTION_GROUPS};
})();
