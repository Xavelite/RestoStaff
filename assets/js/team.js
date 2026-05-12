(function(){
  const Metrics = Restogogo.services.metrics;
  let selectedEmployeeId = '';
  let teamSearch = '';
  let teamFilter = 'all';
  let teamTab = 'personal';
  let bound = false;

  function today(){return todayISO();}
  function daysUntil(dateValue){
    const date = normalizeDateString(dateValue);
    if(!date)return null;
    return Math.ceil((parseISO(date)-parseISO(today()))/86400000);
  }
  function currentMonthBounds(){
    const now = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const endDate = new Date(now.getFullYear(), now.getMonth()+1, 0);
    const end = localISO(endDate);
    return {start,end};
  }
  function missingFields(employee){return employeePayrollMissingFields(employee);}
  function isPayrollReady(employee){return missingFields(employee).length === 0 || employee.payrollReady === true;}
  function expiringSoon(employee){
    const days = daysUntil(employee.contractEnd);
    return Number.isFinite(days) && days >= 0 && days <= 45;
  }
  function absenceThisMonth(employee){
    const {start,end} = currentMonthBounds();
    return (employee.absences||[]).some(absence=>{
      const aStart = normalizeDateString(absence.start);
      const aEnd = normalizeDateString(absence.end || absence.start) || aStart;
      return aStart && aStart <= end && aEnd >= start;
    });
  }
  function selectedEmployee(){
    if(!selectedEmployeeId || !data.employees.some(employee=>employee.id===selectedEmployeeId)){
      selectedEmployeeId = activeEmployees()[0]?.id || data.employees[0]?.id || '';
    }
    return data.employees.find(employee=>employee.id===selectedEmployeeId) || null;
  }
  function employeeStatus(employee){
    if(!employee.active)return {label:'Inactive',tone:'muted'};
    if(absenceThisMonth(employee))return {label:'On leave',tone:'warn'};
    return {label:'Active',tone:'success'};
  }
  function initialsAvatar(employee){
    const color = colorForPosition(employee.position);
    return `<span class="team-avatar" style="--team-avatar:${esc(color)}">${esc(employeeInitials(employee.name).slice(0,1))}</span>`;
  }
  function payrollPercent(){
    const employees = data.employees || [];
    if(!employees.length)return 0;
    return Math.round((employees.filter(isPayrollReady).length / employees.length) * 100);
  }
  function teamMetrics(){
    const employees=data.employees || [];
    const active=employees.filter(employee=>employee.active).length;
    const inactive=employees.length-active;
    const expiring=employees.filter(expiringSoon);
    const nextExpiry=expiring.map(employee=>daysUntil(employee.contractEnd)).filter(Number.isFinite).sort((a,b)=>a-b)[0];
    const absences=employees.reduce((count,employee)=>count+(employee.absences||[]).filter(absence=>absenceThisMonth({absences:[absence]})).length,0);
    const ready=employees.filter(isPayrollReady).length;
    return `<section class="team-metrics rs-page-metrics rs-weekly-metrics">
      ${Metrics.card({tone:'status',icon:'document',label:'Total employees',value:String(employees.length),meta:`${active} active · ${inactive} inactive`})}
      ${Metrics.card({tone:'week',icon:'calendar',label:'Contracts expiring',value:String(expiring.length),meta:nextExpiry!==undefined?`Next: ${nextExpiry} days`:'No urgent renewals'})}
      ${Metrics.card({tone:'hours',icon:'clock',label:'Absences this month',value:String(absences),meta:'Linked to planning availability'})}
      ${Metrics.card({tone:'status',icon:'check',label:'Payroll ready',value:`${payrollPercent()}%`,meta:`${ready} of ${employees.length || 0} employees ready`})}
    </section>`;
  }
  function teamVisibleEmployees(){
    let employees = [...(data.employees || [])];
    if(teamFilter==='active')employees=employees.filter(employee=>employee.active);
    if(teamFilter==='missing')employees=employees.filter(employee=>missingFields(employee).length>0);
    if(teamFilter==='expiring')employees=employees.filter(expiringSoon);
    if(teamFilter==='leave')employees=employees.filter(absenceThisMonth);
    const q=teamSearch.trim().toLowerCase();
    if(q)employees=employees.filter(employee=>`${employee.name} ${employee.position} ${employee.email} ${employee.phone}`.toLowerCase().includes(q));
    return sortEmployees(employees);
  }
  function filterButton(label,value,count=''){
    return `<button type="button" class="team-filter ${teamFilter===value?'is-active':''}" data-team-filter="${esc(value)}"><span>${esc(label)}</span>${count!==''?`<small>${esc(count)}</small>`:''}</button>`;
  }
  function directory(){
    const employees=teamVisibleEmployees();
    const all=data.employees||[];
    const rows=employees.map(employee=>{
      const status=employeeStatus(employee);
      const active=employee.id===selectedEmployeeId;
      const issues=missingFields(employee).length;
      return `<button type="button" class="team-person ${active?'is-active':''}" data-team-select="${esc(employee.id)}">
        ${initialsAvatar(employee)}
        <span class="team-person-copy"><strong>${esc(employee.name)}</strong><small>${esc(employee.position)}</small></span>
        <span class="team-dot is-${esc(status.tone)}"></span>
        ${issues?`<span class="team-issue-dot" title="${issues} missing payroll fields">${issues}</span>`:''}
      </button>`;
    }).join('') || `<div class="ops-empty"><strong>No employees found</strong><span>Clear filters or add a new employee.</span></div>`;
    return `<aside class="team-directory rs-panel">
      <div class="ops-panel-head"><h2>Team Directory</h2><button type="button" class="ops-mini-action" data-team-action="add-employee">+ Add</button></div>
      <label class="ops-search"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path></svg><input value="${esc(teamSearch)}" placeholder="Search employees..." data-team-search></label>
      <div class="team-filters">
        ${filterButton('All','all',all.length)}
        ${filterButton('Active','active',all.filter(e=>e.active).length)}
        ${filterButton('Missing info','missing',all.filter(e=>missingFields(e).length>0).length)}
        ${filterButton('Expiring','expiring',all.filter(expiringSoon).length)}
        ${filterButton('On leave','leave',all.filter(absenceThisMonth).length)}
      </div>
      <div class="team-list">${rows}</div>
      <div class="ops-panel-foot"><span>Showing ${employees.length} of ${all.length}</span></div>
    </aside>`;
  }
  function field(label,value){
    return `<div class="ops-field team-field"><span>${esc(label)}</span><strong>${esc(value || '—')}</strong></div>`;
  }
  function profileHeader(employee){
    const status=employeeStatus(employee);
    const endDays=daysUntil(employee.contractEnd);
    const contractMeta = Number.isFinite(endDays) ? (endDays < 0 ? 'Expired' : `Ends in ${endDays} days`) : 'No end date';
    return `<header class="team-profile-head">
      ${initialsAvatar(employee)}
      <div class="team-profile-title"><h2>${esc(employee.name)}</h2><p>${esc(employee.position)} · ${esc(employee.contractType || 'Contract')}</p><small>${esc(employee.email || employee.phone || 'No contact info yet')}</small></div>
      <span class="ops-status is-${esc(status.tone)}">${esc(status.label)}</span>
      <div class="team-profile-kpis">
        <span><small>Start date</small><strong>${esc(employee.contractStart || '—')}</strong></span>
        <span><small>Contract</small><strong>${esc(employee.contractType || '—')}</strong></span>
        <span><small>Weekly hours</small><strong>${esc(fmtHours(employee.contractHours || 0))}</strong></span>
        <span><small>Renewal</small><strong>${esc(contractMeta)}</strong></span>
      </div>
    </header>`;
  }
  function absenceList(employee){
    const rows=(employee.absences||[]).slice().sort((a,b)=>String(b.start).localeCompare(String(a.start))).slice(0,8).map(absence=>`
      <article class="ops-list-row team-mini-row"><span><strong>${esc(absence.reason)}</strong><small>${esc(absence.start)}${absence.end&&absence.end!==absence.start?` → ${esc(absence.end)}`:''} · ${esc(absence.shift || 'Full day')}</small></span><button type="button" data-team-action="remove-absence" data-absence-id="${esc(absence.id)}">Remove</button></article>`).join('');
    return rows || '<div class="ops-empty compact"><strong>No absences</strong><span>Planned availability is clear.</span></div>';
  }
  function documentList(employee){
    const rows=(employee.documents||[]).map(doc=>`<article class="ops-list-row team-document"><span class="team-document-icon">${esc((doc.type||'File').slice(0,3).toUpperCase())}</span><span><strong>${esc(doc.name)}</strong><small>${esc(doc.type || 'File')} · ${esc(doc.status || 'Uploaded')}</small></span><button type="button" data-team-action="remove-document" data-document-id="${esc(doc.id)}">Remove</button></article>`).join('');
    return rows || '<div class="ops-empty compact"><strong>No documents</strong><span>Add contract, ID card or certificate metadata.</span></div>';
  }
  function tabButton(label,value,badge=''){
    return `<button type="button" class="ops-tab team-tab ${teamTab===value?'is-active':''}" data-team-tab="${esc(value)}"><span>${esc(label)}</span>${badge?`<small>${esc(badge)}</small>`:''}</button>`;
  }
  function profileTabs(employee){
    const missing=missingFields(employee);
    const docs=(employee.documents||[]).length;
    const abs=(employee.absences||[]).length;
    return `<nav class="ops-tabs team-tabs" aria-label="Employee detail sections">
      ${tabButton('Personal info','personal')}
      ${tabButton('Contract','contract', expiringSoon(employee)?'!':'')}
      ${tabButton('Payroll','payroll', missing.length?String(missing.length):'')}
      ${tabButton('Absences','absences', abs?String(abs):'')}
      ${tabButton('Documents','documents', docs?String(docs):'')}
    </nav>`;
  }
  function tabIntro(title,meta='',actionLabel='',action=''){
    return `<div class="team-tab-head"><div><h3>${esc(title)}</h3>${meta?`<p>${esc(meta)}</p>`:''}</div>${action?`<button type="button" class="ops-mini-action" data-team-action="${esc(action)}">${esc(actionLabel)}</button>`:''}</div>`;
  }
  function profileTabContent(employee){
    const missing=missingFields(employee);
    if(teamTab==='contract'){
      const endDays=daysUntil(employee.contractEnd);
      const renewal = Number.isFinite(endDays) ? (endDays < 0 ? 'Contract expired' : `Ends in ${endDays} days`) : 'No end date';
      return `<section class="ops-tab-panel team-tab-panel">
        ${tabIntro('Contract','Employment details and renewal dates.','Renew contract','renew-contract')}
        <div class="ops-field-grid team-field-grid">
          ${field('Contract type',employee.contractType)}${field('Start date',employee.contractStart)}${field('Contract end',employee.contractEnd)}
          ${field('Weekly hours',fmtHours(employee.contractHours || 0))}${field('Hourly cost',money(employee.hourlyCost || employee.rate || 0))}${field('Renewal',renewal)}
        </div>
        <div class="ops-inline-actions team-inline-actions"><button type="button" data-team-action="edit-employee">Edit contract details</button></div>
      </section>`;
    }
    if(teamTab==='payroll'){
      return `<section class="ops-tab-panel team-tab-panel">
        ${tabIntro('Payroll','Fields used for payroll export readiness.','Mark ready','mark-payroll-ready')}
        <div class="ops-readiness team-readiness ${missing.length?'is-warn':'is-ok'}"><strong>${missing.length?'Missing information':'Ready for export'}</strong><span>${missing.length?missing.join(', '):'This employee can be included in payroll export.'}</span></div>
        <div class="ops-field-grid team-field-grid">
          ${field('Payroll number',employee.payrollId)}${field('Employee ID',employee.employeeNumber || employee.id)}${field('PIN',employee.pin ? 'Configured' : 'Missing')}
          ${field('IBAN',employee.iban)}${field('Tax status',employee.taxStatus)}${field('Social security no.',employee.socialSecurityNumber)}
        </div>
        <div class="ops-inline-actions team-inline-actions"><button type="button" data-team-action="edit-employee">Edit payroll fields</button></div>
      </section>`;
    }
    if(teamTab==='absences'){
      return `<section class="ops-tab-panel team-tab-panel">
        ${tabIntro('Absences','Absences are linked to planning availability.','Add absence','add-absence')}
        <div class="ops-list-rows team-list-rows">${absenceList(employee)}</div>
      </section>`;
    }
    if(teamTab==='documents'){
      return `<section class="ops-tab-panel team-tab-panel">
        ${tabIntro('Documents','Document metadata only for now; real upload comes with Supabase Storage.','Upload','add-document')}
        <div class="team-documents">${documentList(employee)}</div>
      </section>`;
    }
    return `<section class="ops-tab-panel team-tab-panel">
      ${tabIntro('Personal information','Core contact details for this employee.','Edit','edit-employee')}
      <div class="ops-field-grid team-field-grid">
        ${field('Email',employee.email)}${field('Phone',employee.phone)}${field('Date of birth',employee.dateOfBirth)}
        ${field('Address',employee.address)}${field('Nationality',employee.nationality)}${field('Language',employee.language)}
      </div>
      <div class="team-subsection">
        <div class="ops-section-title"><h3>Emergency contact</h3></div>
        <div class="ops-field-grid team-field-grid three">${field('Name',employee.emergencyName)}${field('Relationship',employee.emergencyRelation)}${field('Phone',employee.emergencyPhone)}</div>
      </div>
    </section>`;
  }
  function profile(employee){
    if(!employee)return `<main class="team-profile rs-panel"><div class="ops-empty"><strong>No employee selected</strong><span>Add an employee to start building the Team module.</span><button type="button" class="rs-primary-button" data-team-action="add-employee">Add employee</button></div></main>`;
    return `<main class="team-profile rs-panel">
      ${profileHeader(employee)}
      ${profileTabs(employee)}
      ${profileTabContent(employee)}
    </main>`;
  }
  function render(){
    const root=$('teamRoot');
    if(!root||!data)return;
    ensure(data);
    const employee=selectedEmployee();
    root.innerHTML=`${teamMetrics()}<section class="ops-shell-grid team-layout">${directory()}${profile(employee)}</section>`;
  }

  function ensurePosition(name){
    const clean=cleanPositionName(name);
    if(!clean)return;
    data.restaurantSetup.positions = Array.isArray(data.restaurantSetup.positions) ? data.restaurantSetup.positions : [];
    if(!data.restaurantSetup.positions.some(position=>cleanPositionName(position.name)===clean)){
      data.restaurantSetup.positions.push({id:normalizeSlug(clean,'position'),name:clean,active:true,department:'',defaultZone:''});
    }
    if(!data.positions.includes(clean))data.positions.push(clean);
  }
  function dialogShell(idValue,title,body,submitText='Save'){
    let dialog=$(idValue);
    if(!dialog){dialog=document.createElement('dialog'); dialog.id=idValue; dialog.className='ops-dialog'; document.body.appendChild(dialog);}
    dialog.innerHTML=`<form method="dialog" class="ops-dialog-card"><header><h2>${esc(title)}</h2><button type="button" data-dialog-close>×</button></header>${body}<footer><button type="button" class="rs-modal-btn secondary" data-dialog-close>Cancel</button><button type="submit" class="rs-modal-btn primary">${esc(submitText)}</button></footer></form>`;
    dialog.querySelectorAll('[data-dialog-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
    if(dialog.open)dialog.close();
    dialog.showModal();
    return dialog;
  }
  function openEmployeeDialog(mode='edit'){
    const employee = mode==='add' ? {} : selectedEmployee();
    if(mode!=='add' && !employee)return;
    const positionOptions=[...new Set([...(positions||[]), employee.position].filter(Boolean))].map(position=>`<option value="${esc(position)}"></option>`).join('');
    const body=`<section class="ops-form-grid">
      <label>Name<input name="employeeName" value="${esc(employee.name||'')}" required></label>
      <label>Position<input name="position" value="${esc(employee.position||'')}" list="teamPositionList" required><datalist id="teamPositionList">${positionOptions}</datalist></label>
      <label>Status<select name="active"><option value="true" ${employee.active!==false?'selected':''}>Active</option><option value="false" ${employee.active===false?'selected':''}>Inactive</option></select></label>
      <label>PIN<input name="pin" value="${esc(employee.pin||'')}" maxlength="4" inputmode="numeric" required></label>
      <label>Email<input name="email" value="${esc(employee.email||'')}" type="email"></label>
      <label>Phone<input name="phone" value="${esc(employee.phone||'')}"></label>
      <label>Contract type<input name="contractType" value="${esc(employee.contractType||'')}"></label>
      <label>Start date<input name="contractStart" value="${esc(employee.contractStart||'')}" type="date"></label>
      <label>Contract end<input name="contractEnd" value="${esc(employee.contractEnd||'')}" type="date"></label>
      <label>Weekly hours<input name="contractHours" value="${esc(employee.contractHours||'')}" type="number" min="0" step="0.5"></label>
      <label>Hourly cost<input name="hourlyCost" value="${esc(employee.hourlyCost||employee.rate||'')}" type="number" min="0" step="0.01"></label>
      <label>Payroll number<input name="payrollId" value="${esc(employee.payrollId||'')}"></label>
    </section>`;
    const dialog=dialogShell('teamEmployeeDialog', mode==='add'?'Add employee':'Edit employee', body, mode==='add'?'Add employee':'Save changes');
    dialog.querySelector('form').addEventListener('submit',event=>{
      event.preventDefault();
      const form=event.currentTarget;
      const values=Object.fromEntries(new FormData(form).entries());
      const name=String(values.employeeName||'').trim();
      const position=cleanPositionName(values.position||'');
      if(!name||!position)return;
      ensurePosition(position);
      let target=employee;
      if(mode==='add'){
        target={id:`emp-${id()}`,absences:[],documents:[]};
        data.employees.push(target);
        selectedEmployeeId=target.id;
      }
      Object.assign(target,{
        name,
        position,
        active:values.active === 'true',
        pin:sanitizePin(values.pin),
        email:String(values.email||'').trim(),
        phone:String(values.phone||'').trim(),
        contractType:String(values.contractType||'').trim(),
        contractStart:normalizeDateString(values.contractStart),
        contractEnd:normalizeDateString(values.contractEnd),
        contractHours:Number(values.contractHours)||0,
        hourlyCost:Number(values.hourlyCost)||0,
        rate:Number(values.hourlyCost)||Number(target.rate)||0,
        payrollId:String(values.payrollId||'').trim()
      });
      target.payrollReady = missingFields(target).length === 0;
      ensure(data);
      dialog.close();
      void save({reason:'team-employee'});
      Restogogo.router?.render?.();
      Restogogo.ui?.toast?.(mode==='add'?'Employee added.':'Employee updated.',{tone:'success',icon:'✓',centered:true});
    }, {once:true});
  }
  function openAbsenceDialog(){
    const employee=selectedEmployee();
    if(!employee)return;
    const body=`<section class="ops-form-grid compact-form">
      <label>Start date<input name="start" type="date" value="${esc(today())}" required></label>
      <label>End date<input name="end" type="date" value="${esc(today())}" required></label>
      <label>Shift<select name="shift"><option>Full day</option><option>Lunch</option><option>Evening</option></select></label>
      <label>Reason<input name="reason" value="Holiday"></label>
    </section>`;
    const dialog=dialogShell('teamAbsenceDialog',`Add absence · ${employee.name}`,body,'Add absence');
    dialog.querySelector('form').addEventListener('submit',event=>{
      event.preventDefault();
      const values=Object.fromEntries(new FormData(event.currentTarget).entries());
      employee.absences=Array.isArray(employee.absences)?employee.absences:[];
      employee.absences.push({id:`absence-${id()}`,start:normalizeDateString(values.start),end:normalizeDateString(values.end)||normalizeDateString(values.start),shift:values.shift,reason:String(values.reason||'Absence').trim(),status:'Approved'});
      ensure(data);
      addNotification(`absence-${employee.id}-${Date.now()}`,'yellow','Absence added',`${employee.name} · ${values.start}`,{kind:'employee',id:employee.id});
      dialog.close();
      void save({reason:'team-absence'});
      Restogogo.router?.render?.();
    }, {once:true});
  }
  async function renewContract(){
    const employee=selectedEmployee();
    if(!employee)return;
    const value=await Restogogo.ui?.prompt?.({title:'Renew contract',message:`New end date for ${employee.name}`,label:'Contract end',defaultValue:employee.contractEnd||'',placeholder:'YYYY-MM-DD',confirmText:'Save'});
    if(value===null || value===undefined)return;
    employee.contractEnd=normalizeDateString(value);
    ensure(data);
    void save({reason:'team-contract'});
    render();
  }
  async function addDocument(){
    const employee=selectedEmployee();
    if(!employee)return;
    const name=await Restogogo.ui?.prompt?.({title:'Add document metadata',message:'Real file upload will be connected with Supabase Storage later.',label:'File name',placeholder:'contract.pdf',confirmText:'Add'});
    if(!String(name||'').trim())return;
    employee.documents=Array.isArray(employee.documents)?employee.documents:[];
    employee.documents.push({id:`doc-${id()}`,name:String(name).trim(),type:documentTypeFromName(name),uploadedAt:new Date().toISOString(),status:'Uploaded'});
    ensure(data);
    void save({reason:'team-document'});
    render();
  }
  function handleAction(action,target){
    const employee=selectedEmployee();
    if(action==='add-employee')return openEmployeeDialog('add');
    if(!employee)return;
    if(action==='edit-employee')return openEmployeeDialog('edit');
    if(action==='add-absence')return openAbsenceDialog();
    if(action==='renew-contract')return void renewContract();
    if(action==='mark-payroll-ready'){
      employee.payrollReady = missingFields(employee).length === 0;
      Restogogo.ui?.toast?.(employee.payrollReady?'Employee marked ready.':'Some required payroll fields are still missing.',{tone:employee.payrollReady?'success':'warning',icon:employee.payrollReady?'✓':'!',centered:true});
      void save({reason:'team-payroll-ready'});
      render();
      return;
    }
    if(action==='add-document')return void addDocument();
    if(action==='remove-document'){
      employee.documents=(employee.documents||[]).filter(doc=>doc.id!==target.dataset.documentId);
      void save({reason:'team-document-remove'});
      render();
      return;
    }
    if(action==='remove-absence'){
      employee.absences=(employee.absences||[]).filter(absence=>absence.id!==target.dataset.absenceId);
      ensure(data);
      void save({reason:'team-absence-remove'});
      Restogogo.router?.render?.();
    }
  }
  function bind(){
    if(bound)return;
    bound=true;
    const root=$('teamRoot');
    root?.addEventListener('click',event=>{
      const select=event.target.closest('[data-team-select]');
      if(select){selectedEmployeeId=select.dataset.teamSelect; render(); return;}
      const filter=event.target.closest('[data-team-filter]');
      if(filter){teamFilter=filter.dataset.teamFilter || 'all'; render(); return;}
      const tab=event.target.closest('[data-team-tab]');
      if(tab){teamTab=tab.dataset.teamTab || 'personal'; render(); return;}
      const action=event.target.closest('[data-team-action]');
      if(action){event.preventDefault(); handleAction(action.dataset.teamAction, action);}
    });
    root?.addEventListener('input',event=>{
      const input=event.target.closest('[data-team-search]');
      if(!input)return;
      teamSearch=input.value;
      render();
      requestAnimationFrame(()=>{
        const next=document.querySelector('[data-team-search]');
        next?.focus?.({preventScroll:true});
        try{next?.setSelectionRange?.(teamSearch.length,teamSearch.length);}catch{}
      });
    });
  }
  Restogogo.team={render,bind};
})();
