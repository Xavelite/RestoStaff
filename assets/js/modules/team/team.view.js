(function(){
  const Metrics = Restogogo.services.metrics;
  const TeamModel = Restogogo.modules.TeamModel;
  const Icons = Restogogo.icons;

  const OPTION_GROUPS = {
    contractType:[
      ['', 'Select contract type'],
      ['permanent', 'CDI / Permanent'],
      ['fixed_term', 'CDD / Fixed-term'],
      ['student', 'Student'],
      ['flexi_job', 'Flexi-job'],
      ['extra', 'Extra'],
      ['interim', 'Interim'],
      ['self_employed', 'Self-employed'],
      ['other', 'Other']
    ],
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

  function currentPositionName(employee, ctx){
    const position = (ctx.positionChoices || []).find(item=>String(item.id)===String(employee.positionId || ''));
    return position?.name || 'No position';
  }

  function icon(name,className=''){
    return Icons.svg(name,className);
  }

  function statusIcon(state,options={}){
    return Icons.status(state,options);
  }

  function employeeStatusState(employee,status=TeamModel.employeeStatus(employee)){
    if(employee?.active === false)return 'inactive';
    return status.tone === 'warn' ? 'warning' : 'active';
  }

  function employeeStatusIcon(employee){
    const status = TeamModel.employeeStatus(employee);
    return statusIcon(employeeStatusState(employee,status),{label:status.label,className:'is-inline'});
  }

  function absenceStatusState(status){
    const clean = String(status || 'Pending');
    if(clean === 'Approved')return 'approved';
    if(clean === 'Rejected')return 'rejected';
    if(clean === 'Cancelled')return 'cancelled';
    return 'pending';
  }

  function initialsAvatar(employee){
    const name = employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'New';
    return `<span class="rs-weekly-avatar team-avatar" style="${esc(positionStyle(employeePositionName(employee)))}">${esc(employeeInitials(name).slice(0,1))}</span>`;
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
    return `<section class="team-metrics rs-page-metrics rs-weekly-metrics">
      ${Metrics.card({tone:'status',icon:'document',label:'Total employees',value:String(employees.length),meta:`${active} active · ${inactive} inactive`})}
      ${Metrics.card({tone:'week',icon:'calendar',label:'Contracts expiring',value:String(expiring.length),meta:nextExpiry!==undefined?`Next: ${nextExpiry} days`:'No urgent renewals'})}
      ${Metrics.card({tone:'hours',icon:'clock',label:'Absences this month',value:String(absences),meta:'Linked to planning availability'})}
      ${Metrics.card({tone:'status',icon:'check',label:'Payroll ready',value:`${payrollPercent(employees)}%`,meta:`${ready} of ${employees.length || 0} employees ready`})}
    </section>`;
  }

  function directoryFilterButton(label,value,current,count){
    return `<button type="button" class="team-directory-filter ${current===value?'is-active':''}" data-team-filter="${esc(value)}"><span>${esc(label)}</span><strong>${esc(String(count))}</strong></button>`;
  }

  function directoryIssueBadges(employee){
    const issues = TeamModel.setupIssues(employee);
    const setup = issues.general + issues.contract + issues.payroll;
    const badges = [];
    if(setup){
      badges.push(`<small class="team-person-badge is-warning" title="${esc(String(setup))} setup items" aria-label="${esc(String(setup))} setup items">${esc(String(setup))}</small>`);
    }
    if(issues.absences){
      const label = issues.absences === 1 ? '1 pending approval' : `${issues.absences} pending approvals`;
      badges.push(`<small class="team-person-badge is-action" title="${esc(label)}" aria-label="${esc(label)}">${esc(String(issues.absences))}</small>`);
    }
    return badges.join('');
  }

  function directory(ctx){
    const filter = ctx.teamFilter || 'all';
    const counts = TeamModel.directoryCounts(ctx.employees);
    const employees = TeamModel.visibleEmployees(ctx.employees, ctx.teamSearch, filter);
    const rows = employees.map(employee=>{
      const status = TeamModel.employeeStatus(employee);
      const active = employee.id === ctx.selectedEmployeeId;
      const name = employee.name || 'New employee';
      return `<button type="button" class="team-person ${active?'is-active':''}" data-team-select="${esc(employee.id)}">
        ${initialsAvatar(employee)}
        <span class="team-person-copy">
          <span class="team-person-line"><strong>${esc(name)}</strong><span class="team-person-badges">${directoryIssueBadges(employee)}</span>${employeeStatusIcon(employee)}</span>
          <small>${esc(currentPositionName(employee, ctx))}</small>
        </span>
      </button>`;
    }).join('') || `<div class="rs-empty-state"><strong>No employees found</strong><span>Search another name or add a new employee.</span></div>`;
    return `<aside class="team-directory rs-panel">
      <div class="rs-panel-head"><h2>Team Directory</h2><button type="button" class="rs-action-button is-compact" data-team-action="add-employee">+ Add</button></div>
      <label class="rs-search">${icon('search')}<input value="${esc(ctx.teamSearch)}" placeholder="Search employees..." data-team-search></label>
      <div class="team-directory-filters" aria-label="Team directory filters">
        ${directoryFilterButton('All','all',filter,counts.all)}
        ${directoryFilterButton('Active','active',filter,counts.active)}
        ${directoryFilterButton('Needs','action',filter,counts.action)}
      </div>
      <div class="team-list">${rows}</div>
      <div class="rs-panel-foot"><span>Showing ${employees.length} of ${ctx.employees.length}</span></div>
    </aside>`;
  }

  function formatProfileDate(value,fallback='—'){
    return value ? shortDisplayDate(value) : fallback;
  }


  function teamHeaderIllustration(){
    return `<div class="team-profile-illustration rs-entity-illustration" aria-hidden="true"><svg viewBox="0 0 260 96" fill="none">
      <path d="M22 78h216"></path>
      <circle cx="74" cy="34" r="16"></circle><path d="M43 80c5-20 16-31 31-31s26 11 31 31"></path>
      <circle cx="134" cy="29" r="18"></circle><path d="M99 80c6-23 19-35 35-35s29 12 35 35"></path>
      <circle cx="194" cy="36" r="14"></circle><path d="M168 80c5-18 14-28 26-28s22 10 26 28"></path>
      <path d="M31 21h28M204 20h25M215 31h15M112 18h44"></path>
    </svg></div>`;
  }

  function profileChip(iconName,label){
    return `<span class="rs-entity-chip team-profile-chip">${icon(iconName,'rs-inline-icon')}${esc(label)}</span>`;
  }

  function profileHeader(employee, ctx){
    const status = TeamModel.employeeStatus(employee);
    const endDays = TeamModel.daysUntil(employee.contractEnd);
    const renewal = Number.isFinite(endDays) ? (endDays < 0 ? 'Expired' : `Ends in ${endDays} days`) : 'No end';
    const name = employee.name || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'New employee';
    const contract = employee.contractType ? optionLabel(OPTION_GROUPS.contractType, employee.contractType) : 'No contract';
    const weeklyHours = employee.contractHours ? `${fmtHours(employee.contractHours)} / week` : '0h / week';
    const avatar = initialsAvatar({...employee,name}).replace('team-avatar', 'team-avatar rs-entity-avatar');
    return `<header class="team-profile-head team-profile-hero rs-entity-header rs-entity-header--team">
      <div class="team-profile-main rs-entity-identity">
        ${avatar}
        <div class="team-profile-title rs-entity-copy">
          <div class="rs-entity-title-line"><h2>${esc(name)}</h2>${statusIcon(employeeStatusState(employee,status),{label:status.label})}</div>
          <p class="team-profile-meta-chips rs-entity-chips" aria-label="Employee summary">
            ${profileChip('position', currentPositionName(employee, ctx))}
            ${profileChip('clock', weeklyHours)}
            ${profileChip('document', contract)}
            ${profileChip('calendar', formatProfileDate(employee.contractStart,'No start'))}
            ${profileChip('timer', renewal)}
          </p>
        </div>
      </div>
      ${teamHeaderIllustration()}
    </header>`;
  }

  function requiredFieldClass(isMissing){
    return isMissing ? ' is-required-missing' : '';
  }

  function inputField(label,name,value,type='text',attrs='',fieldClass=''){
    return `<label class="rs-field team-inline-field${fieldClass}"><span>${esc(label)}</span><input name="${esc(name)}" value="${esc(value ?? '')}" type="${esc(type)}" data-team-field="${esc(name)}" ${attrs}></label>`;
  }

  function selectField(label,name,value,options,fieldClass=''){
    const current = String(value ?? '');
    const normalizedOptions = options.map(option=>Array.isArray(option) ? option : (typeof option === 'string' ? [option, option] : [option.value, option.label]));
    const opts = normalizedOptions.map(option=>`<option value="${esc(option[0])}" ${String(option[0])===current?'selected':''}>${esc(option[1])}</option>`).join('');
    return `<label class="rs-field team-inline-field${fieldClass}"><span>${esc(label)}</span><select name="${esc(name)}" data-team-field="${esc(name)}">${opts}</select></label>`;
  }


  function positionSelect(employee, ctx){
    const choices = ctx.positionChoices || [];
    if(!choices.length){
      return `<div class="rs-empty-state rs-empty-state--compact team-position-empty"><strong>No positions configured</strong><span>Create positions in Restaurant first, then assign them here.</span></div>`;
    }
    const current = String(employee.positionId || '');
    const opts = [['','Select position'], ...choices.map(item=>[item.id,item.name])].map(option=>`<option value="${esc(option[0])}" ${String(option[0])===current?'selected':''}>${esc(option[1])}</option>`).join('');
    return `<label class="rs-field team-inline-field${requiredFieldClass(!String(employee.positionId || '').trim())}"><span>Position</span><select name="positionId" data-team-field="positionId" required>${opts}</select></label>`;
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
        <button type="button" class="rs-action-button is-compact success" data-team-action="approve-absence" data-absence-id="${idValue}">Approve</button>
        <button type="button" class="rs-action-button is-compact danger" data-team-action="reject-absence" data-absence-id="${idValue}">Reject</button>
      </div>`;
    }
    if(status === 'Approved'){
      return `<div class="team-absence-actions">
        <button type="button" class="rs-action-button is-compact secondary" data-team-action="cancel-absence" data-absence-id="${idValue}">Cancel</button>
      </div>`;
    }
    return `<div class="team-absence-actions"><small>History</small></div>`;
  }


  function absenceDateValue(value){
    return String(value || '').slice(0,10);
  }

  function absenceDurationDays(absence){
    const start = new Date(`${absenceDateValue(absence?.start)}T00:00:00`);
    const end = new Date(`${absenceDateValue(absence?.end || absence?.start)}T00:00:00`);
    if(Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))return 1;
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
  }

  function absenceYear(absence){
    const start = absenceDateValue(absence?.start);
    return Number(start.slice(0,4)) || new Date().getFullYear();
  }

  function absenceTypeIcon(label){
    return /sick|ill|medical|doctor|health|malad/i.test(String(label || '')) ? 'medical' : 'palm';
  }

  function absenceDateRange(absence){
    const start = absenceDateValue(absence?.start);
    const end = absenceDateValue(absence?.end || absence?.start);
    if(!start)return '—';
    if(!end || end === start)return shortDisplayDate(start);
    return `${shortDisplayDate(start)} → ${shortDisplayDate(end)}`;
  }

  function absenceDayRange(absence){
    const start = absenceDateValue(absence?.start);
    const end = absenceDateValue(absence?.end || absence?.start);
    if(!start)return '';
    const startDay = new Date(`${start}T00:00:00`).toLocaleDateString(undefined,{weekday:'short'});
    const endDay = end && end !== start ? new Date(`${end}T00:00:00`).toLocaleDateString(undefined,{weekday:'short'}) : '';
    return endDay ? `${startDay} → ${endDay}` : startDay;
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
      return `<tr class="team-absence-table-row is-${esc(String(absence.status || 'Pending').toLowerCase())}">
        <td><span class="team-absence-type"><i aria-hidden="true">${icon(absenceTypeIcon(label))}</i><strong>${esc(label)}</strong></span></td>
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
    const value = String(status || 'Pending');
    return value === 'Pending' ? 0 : value === 'Approved' ? 1 : value === 'Rejected' ? 2 : 3;
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
  function tabButton(label,value,teamTab,badge=''){
    return `<button type="button" class="ops-tab team-tab ${teamTab===value?'is-active':''}" data-team-tab="${esc(value)}"><span>${esc(label)}</span>${badge?`<small>${esc(badge)}</small>`:''}</button>`;
  }

  function profileTabs(employee,teamTab){
    const generalMissing = TeamModel.generalMissingFields(employee);
    const contractMissing = TeamModel.contractMissingFields(employee);
    const payrollMissing = TeamModel.payrollMissingFields(employee);
    const absences = TeamModel.pendingAbsenceApprovalCount(employee);
    const contractBadge = contractMissing.length ? String(contractMissing.length) : (TeamModel.expiringSoon(employee) ? '!' : '');
    return `<nav class="ops-tabs team-tabs" aria-label="Employee detail sections">
      ${tabButton('General','general',teamTab,generalMissing.length?String(generalMissing.length):'')}
      ${tabButton('Contract','contract',teamTab,contractBadge)}
      ${tabButton('Payroll','payroll',teamTab,payrollMissing.length?String(payrollMissing.length):'')}
      ${tabButton('Absences','absences',teamTab,absences?String(absences):'')}
    </nav>`;
  }


  function profileCard(title,iconName,content,extraClass='',meta=''){
    const help = meta ? ` title="${esc(meta)}"` : '';
    return `<article class="team-profile-card ${extraClass}"${help}><header><span aria-hidden="true">${icon(iconName)}</span><div><strong>${esc(title)}</strong></div></header><div class="team-profile-card-grid">${content}</div></article>`;
  }

  function readinessPanel(title,missing,total){
    const list = Array.isArray(missing) ? missing.filter(Boolean) : [];
    const requiredTotal = Math.max(Number(total) || list.length || 1, list.length);
    const complete = Math.max(0, requiredTotal - list.length);
    const percent = Math.round((complete / requiredTotal) * 100);
    const ready = list.length === 0;
    const chips = ready
      ? `<span class="team-readiness-chip is-ok">All essentials complete</span>`
      : list.map(item=>`<span class="team-readiness-chip"><i aria-hidden="true"></i>${esc(item)}</span>`).join('');
    return `<article class="team-readiness-panel ${ready?'is-ready':'is-missing'}" aria-label="${esc(title)}">
      <div class="team-readiness-ring" style="--readiness:${percent};" aria-label="${esc(percent)}% complete"><strong>${esc(String(percent))}%</strong></div>
      <div class="team-readiness-summary"><strong>${esc(`${complete} of ${requiredTotal} completed`)}</strong>${statusIcon(ready?'ready':'missing',{label:ready?'Ready':'Missing information',className:'is-inline'})}</div>
      <div class="team-readiness-missing" aria-label="Missing fields">${chips}</div>
    </article>`;
  }

  function generalTabContent(employee,ctx){
    const missing = TeamModel.generalMissingFields(employee);
    const missingSet = new Set(missing);
    return `<section class="ops-tab-panel team-tab-panel team-general-dashboard">
      <div class="team-profile-card-grid-layout">
        ${profileCard('Identity','identity',`
          ${inputField('First name','firstName',employee.firstName,'text','',requiredFieldClass(missingSet.has('First name')))}${inputField('Last name','lastName',employee.lastName,'text','',requiredFieldClass(missingSet.has('Last name')))}
          ${inputField('Display name','name',employee.name,'text','placeholder="Name shown in planning"')}${inputField('Nationality','nationality',employee.nationality)}
        `)}
        ${profileCard('Work profile','position',`
          ${positionSelect(employee, ctx)}${selectField('Status','active',employee.active === false ? 'false' : 'true',[['true','Active'],['false','Inactive']])}
        `)}
        ${profileCard('Contact information','phone',`
          ${inputField('Email','email',employee.email,'email')}${inputField('Phone','phone',employee.phone,'text','',requiredFieldClass(missingSet.has('Phone')))}
          ${inputField('Address','address',employee.address)}${inputField('Postal code','postalCode',employee.postalCode)}${inputField('City','city',employee.city)}
        `,'is-wide')}
        ${profileCard('Access & identifiers','key',`
          ${inputField('PIN code','pin',employee.pin,'text','maxlength="4" inputmode="numeric" placeholder="4 digits"')}${inputField('Employee code','employeeNumber',employee.employeeNumber || employee.id)}
          ${selectField('Manager access','managerAccess',employee.managerAccess ? 'true' : 'false',[['false','No'],['true','Yes']])}
        `)}
        ${profileCard('Emergency contact','heart',`
          ${inputField('Contact name','emergencyName',employee.emergencyName)}${inputField('Relationship','emergencyRelation',employee.emergencyRelation)}${inputField('Emergency phone','emergencyPhone',employee.emergencyPhone)}
        `)}
        ${profileCard('Notes','note',`
          <label class="rs-field team-inline-field wide"><span>Notes</span><textarea name="notes" data-team-field="notes">${esc(employee.notes || '')}</textarea></label>
        `,'is-wide')}
      </div>
    </section>`;
  }

  function profileTabContent(employee,teamTab,ctx){
    const missing = TeamModel.payrollMissingFields(employee);
    if(teamTab==='contract'){
      const contractMissing = TeamModel.contractMissingFields(employee);
      return `<section class="ops-tab-panel team-tab-panel team-profile-dashboard team-contract-dashboard">
        <div class="team-contract-stack">
          ${readinessPanel('Contract readiness', contractMissing, 5)}
          <div class="team-contract-layout">
            <div class="team-contract-main">
              ${profileCard('Employment','document',`
                ${selectField('Contract type','contractType',employee.contractType,OPTION_GROUPS.contractType,requiredFieldClass(contractMissing.includes('Contract type')))}
                ${selectField('Work regime','workRegime',employee.workRegime,OPTION_GROUPS.workRegime,requiredFieldClass(contractMissing.includes('Work regime')))}
                ${inputField('Weekly hours','contractHours',employee.contractHours,'number','min="0" step="0.5"',requiredFieldClass(contractMissing.includes('Weekly hours')))}
              `,'is-wide team-contract-employment','Core contract details used by planning and payroll prep.')}
              <div class="team-contract-split">
                ${profileCard('Contract dates','calendar',`
                  ${inputField('Start date','contractStart',employee.contractStart,'date','',requiredFieldClass(contractMissing.includes('Start date')))}
                  ${inputField('Contract end','contractEnd',employee.contractEnd,'date')}
                `,'team-contract-dates','Leave contract end empty for open-ended contracts.')}
                ${profileCard('Cost setup','euro',`
                  ${inputField('Hourly cost','hourlyCost',employee.hourlyCost,'number','min="0" step="0.01"')}
                  ${inputField('Annual leave entitlement','annualLeaveEntitlementDays',employee.annualLeaveEntitlementDays || 0,'number','min="0" step="0.5"',requiredFieldClass(contractMissing.includes('Annual leave entitlement')))}
                `,'team-contract-cost','Employee cost is used by Planning and Actuals. Defaults can come from the selected Restaurant position.')}
              </div>
            </div>
          </div>
        </div>
      </section>`;
    }
    if(teamTab==='payroll'){
      const essentials = `<div class="team-profile-card-grid-layout">
        ${readinessPanel('Payroll readiness', missing, 4)}
        ${profileCard('Payroll setup','payroll',`
          ${selectField('Payroll provider','payrollProvider',employee.payrollProvider,OPTION_GROUPS.payrollProvider,requiredFieldClass(missing.includes('Payroll provider')))}
          ${inputField('Payroll employee ID','payrollId',employee.payrollId,'text','',requiredFieldClass(missing.includes('Payroll employee ID')))}
        `,'is-wide','Provider and employee identifier used for handoff/export.')}
        ${profileCard('Identity & banking','bank',`
          ${inputField('NISS / social security no.','socialSecurityNo',employee.socialSecurityNo,'text','',requiredFieldClass(missing.includes('NISS / social security no.')))}
          ${inputField('IBAN','iban',employee.iban,'text','',requiredFieldClass(missing.includes('IBAN')))}
          ${inputField('BIC','bic',employee.bic)}
        `,'is-wide','Only the essentials needed for payroll handoff.')}
        ${profileCard('Payroll notes','note',`
          <label class="rs-field team-inline-field wide is-compact-note"><span>Payroll notes</span><textarea name="payrollNotes" data-team-field="payrollNotes">${esc(employee.payrollNotes || '')}</textarea></label>
        `,'is-wide','Optional notes for the person preparing payroll.')}
      </div>`;
      return `<section class="ops-tab-panel team-tab-panel team-profile-dashboard">${essentials}</section>`;
    }
    if(teamTab==='absences'){
      const typeOptions = [['','Select absence type'], ...absenceTypeOptions(ctx)];
      const absenceEntryForm = ctx.absenceEntryOpen ? `<form class="team-absence-form team-absence-entry-panel" data-team-absence-form>
        ${selectField('Type','absenceTypeId','holiday',typeOptions)}
        ${inputField('Start date','absenceStart',todayISO(),'date','required')}
        ${inputField('End date','absenceEnd',todayISO(),'date','required')}
        ${selectField('Shift','absenceShift','Full day',['Full day','Lunch','Evening'])}
        ${selectField('Status','absenceStatus','Approved',['Pending','Approved','Rejected','Cancelled'])}
        <label class="rs-field team-inline-field wide"><span>Manager comment</span><input name="managerComment" value="" type="text" placeholder="Optional note"></label>
        <button type="button" class="rs-action-button is-compact team-card-action" data-team-action="add-absence">Add absence</button>
      </form>` : '';
      return `<section class="ops-tab-panel team-tab-panel team-profile-dashboard team-absence-dashboard">
        <section class="team-profile-card team-absence-overview-card is-wide">
          <header><span aria-hidden="true">${icon('palm')}</span><div><strong>Absence balance</strong></div></header>
          ${absenceOverview(employee)}
        </section>
        <section class="team-profile-card team-absence-table-card is-wide">
          <header><span aria-hidden="true">${icon('list')}</span><div><strong>Upcoming absences</strong></div><button type="button" class="rs-action-button is-compact" data-team-toggle-request>${ctx.absenceEntryOpen?'Close form':'+ Add absence'}</button></header>
          ${absenceEntryForm}
          <div class="team-absence-table-wrap">
            <table class="team-absence-table">
              <thead><tr><th>Type</th><th>Dates</th><th>Duration</th><th>Status</th><th>Manager</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>${absenceRows(employee,ctx)}</tbody>
            </table>
          </div>
          <details class="team-absence-history-details">
            <summary>View history</summary>
            <div class="team-absence-table-wrap">
              <table class="team-absence-table is-history">
                <thead><tr><th>Type</th><th>Dates</th><th>Duration</th><th>Status</th><th>Manager</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>${absenceRows(employee,ctx,{history:true})}</tbody>
              </table>
            </div>
          </details>
        </section>
      </section>`;
    }
    return generalTabContent(employee,ctx);
  }

  function saveBar(ctx){
    const dirty = ctx.dirty ? 'is-dirty' : '';
    return `<div class="rs-save-bar ${dirty}" data-team-save-bar>
      <span>${ctx.dirty ? (ctx.isNew ? 'New employee draft' : 'Unsaved profile changes') : 'Click any field to edit'}</span>
      <button type="button" class="rs-modal-btn secondary" data-team-action="cancel-profile" ${ctx.dirty?'':'disabled'}>Cancel</button>
      <button type="button" class="rs-modal-btn primary" data-team-action="save-profile" ${ctx.dirty?'':'disabled'}>Save changes</button>
    </div>`;
  }

  function profile(employee,teamTab,ctx){
    if(!employee)return `<main class="team-profile rs-panel"><div class="rs-empty-state"><strong>No employee selected</strong><span>Add an employee to start building the Team module.</span><button type="button" class="rs-primary-button" data-team-action="add-employee">Add employee</button></div></main>`;
    return `<main class="team-profile rs-panel">
      ${profileHeader(employee,ctx)}
      ${profileTabs(employee,teamTab)}
      ${profileTabContent(employee,teamTab,ctx)}
      ${saveBar(ctx)}
    </main>`;
  }

  function render(ctx){
    const employees = ctx.employees || [];
    const positionChoices = Array.isArray(ctx.positionChoices) ? ctx.positionChoices : [];
    return `${metrics(employees)}<section class="ops-shell-grid team-layout">${directory({...ctx, employees, positionChoices})}${profile(ctx.employee, ctx.teamTab, {...ctx, positionChoices})}</section>`;
  }

  Restogogo.modules.TeamView = {render, optionGroups:OPTION_GROUPS};
})();
