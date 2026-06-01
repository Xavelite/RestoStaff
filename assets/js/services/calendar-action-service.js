/* Shared calendar action helpers: absence decisions, absence lifecycle actions and small context menus. */
(function(){
  const R = window.Restogogo = window.Restogogo || {};
  R.services = R.services || {};

  let activeMenu = null;
  let absenceDecisionActive = false;

  function closeMenu(){
    if(activeMenu){activeMenu.remove();activeMenu=null;}
  }

  function floatingMenu(event, options={}){
    closeMenu();
    const items = Array.isArray(options.items) ? options.items.filter(item=>item && !item.hidden) : [];
    if(!items.length)return Promise.resolve('');
    return new Promise(resolve=>{
      const menu=document.createElement('div');
      menu.className='rs-picklist-menu rs-picklist-menu--floating is-open calendar-context-menu';
      menu.setAttribute('role','menu');
      menu.setAttribute('aria-label', options.ariaLabel || 'Calendar actions');
      menu.innerHTML=items.map(item=>`<button type="button" class="rs-picklist-option" role="menuitem" data-calendar-context-action="${esc(item.action||'')}" ${item.disabled?'disabled':''}><span class="rs-picklist-option-label">${esc(item.label||'Action')}</span></button>`).join('');
      document.body.appendChild(menu);
      activeMenu=menu;
      const x=Number(event?.clientX || 0);
      const y=Number(event?.clientY || 0);
      const rect=menu.getBoundingClientRect();
      menu.style.left=`${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
      menu.style.top=`${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
      const finish=value=>{closeMenu();cleanup();resolve(value||'');};
      const onClick=evt=>{
        const button=evt.target.closest('[data-calendar-context-action]');
        if(button && menu.contains(button)){evt.preventDefault();finish(button.dataset.calendarContextAction);return;}
        if(!menu.contains(evt.target))finish('');
      };
      const onKey=evt=>{if(evt.key==='Escape')finish('');};
      const cleanup=()=>{document.removeEventListener('click',onClick,true);document.removeEventListener('keydown',onKey,true);};
      document.addEventListener('click',onClick,true);
      document.addEventListener('keydown',onKey,true);
      setTimeout(()=>menu.querySelector('button:not([disabled])')?.focus?.({preventScroll:true}),0);
    });
  }

  function absenceLayer(absence){
    if(!absence)return '';
    const status=String(absence.status||'Pending');
    const statusKey=status.toLowerCase();
    const state=R.logic?.absences?.statusState?.(status)||'pending';
    const icon=absenceIconName(absence);
    const iconClass=R.logic?.absences?.iconClassName?.(icon)||'calendar';
    const label=absenceDisplayLabel(absence,'Leave');
    return `<span class="rs-absence-layer is-${esc(statusKey)} is-${esc(iconClass)}" aria-label="${esc(`${status} ${label}`)}">${R.icons.status(state,{label:status,className:'is-inline rs-absence-status'})}<em class="rs-absence-icon is-${esc(iconClass)}" aria-hidden="true">${R.icons.svg(icon)}</em><b>${esc(label)}</b></span>`;
  }

  function absenceSlotHtml(absence, attributes=''){
    return `<article class="rs-absence-slot rs-calendar-card rs-calendar-card--absence rs-weekly-slot"${attributes}>${absenceLayer(absence)}</article>`;
  }

  function employeeFor(employeeId){return emp(employeeId);}
  function absenceById(employee, absenceId){return (employee?.absences||[]).find(absence=>String(absence.id)===String(absenceId)) || null;}

  async function persistAbsenceAction(options={}){
    const employeeId=String(options.employeeId||'').trim();
    const sourceAbsence=options.absence || absenceById(employeeFor(employeeId), options.absenceId);
    const absenceId=String(sourceAbsence?.id || options.absenceId || '').trim();
    const action=String(options.action||'').trim().toLowerCase();
    if(!employeeId || !sourceAbsence || !action)return false;
    if(action !== 'approve' && action !== 'cancel' && action !== 'cancel_for_planning')return false;
    const isPlanningBookingCancel = action === 'cancel_for_planning';
    const status = action === 'approve' ? 'Approved' : 'Cancelled';
    const now = new Date().toISOString();
    const saveAction = action === 'approve'
      ? window.RestogogoSaveContract.ACTION.ABSENCE.APPROVE
      : (isPlanningBookingCancel ? window.RestogogoSaveContract.ACTION.ABSENCE.CANCEL_FOR_PLANNING : window.RestogogoSaveContract.ACTION.ABSENCE.CANCEL_BY_MANAGER);
    const cancelCopy = isPlanningBookingCancel ? 'Cancelled from Planning to book a shift.' : 'Cancelled by manager.';
    const message = action === 'approve' ? 'Leave request approved.' : (isPlanningBookingCancel ? 'Leave cancelled from Planning.' : 'Leave cancelled.');
    return R.stateService.commitStateMutation({
      saveAction:window.RestogogoSaveContract.actions.absence(saveAction,{
        employeeId,
        absenceId,
        payload: action === 'approve'
          ? {manager_comment:'Approved from calendar.', metadata:{source:options.source||'calendar'}}
          : {cancellation_reason:cancelCopy, manager_comment:cancelCopy, metadata:{source:options.source||'calendar'}}
      }),
      mutate:()=>{
        const employee=employeeFor(employeeId);
        const absence=absenceById(employee, absenceId) || sourceAbsence;
        absence.status=status;
        if(action==='approve'){
          absence.approvedAt=absence.approvedAt || now;
          absence.managerComment=absence.managerComment || 'Approved from calendar.';
        }else{
          absence.cancelledAt=absence.cancelledAt || now;
          absence.managerComment=absence.managerComment || cancelCopy;
        }
      },
      render: options.render || (()=>R.shell?.render?.()),
      renderOnSuccess:true,
      successMessage:message,
      errorMessage:'Leave change was not saved.'
    });
  }

  async function showAbsenceContextMenu(event, options={}){
    const absence=options.absence;
    const status=String(absence?.status||'Pending');
    const items=status==='Pending'
      ? [{action:'approve',label:'Approve leave request'},{action:'cancel',label:'Cancel leave request'}]
      : status==='Approved'
        ? [{action:'cancel',label:'Cancel leave'}]
        : [];
    const choice=await floatingMenu(event,{ariaLabel:'Leave actions',items});
    if(choice==='approve')return persistAbsenceAction(Object.assign({},options,{action:'approve'}));
    if(choice==='cancel')return persistAbsenceAction(Object.assign({},options,{action:'cancel'}));
    return false;
  }

  function absenceDecision(options={}){
    if(absenceDecisionActive) return Promise.resolve('keep-leave');
    absenceDecisionActive = true;
    return new Promise(resolve=>{
      const absence=options.absence;
      const employee=options.employee;
      const mode=options.mode==='actuals'?'actuals':'planning';
      const verb=mode==='actuals'?'record actual':'plan shift';
      const anyway=mode==='actuals'?'Record actual anyway':'Plan anyway';
      const cancelAnd=String(absence?.status||'Pending')==='Pending'
        ? `Cancel request & ${verb}`
        : `Cancel leave & ${verb}`;
      const dialog=document.createElement('dialog');
      dialog.className='calendar-absence-decision-dialog rs-dialog';
      const label=absenceDisplayLabel(absence,'leave');
      const status=String(absence?.status||'Pending').toLowerCase();
      dialog.innerHTML=`<form method="dialog" class="calendar-absence-decision-card rs-dialog-card">
        <div class="calendar-absence-decision-icon" aria-hidden="true">${absenceLayer(absence)}</div>
        <div class="calendar-absence-decision-copy">
          <h2>${esc(String(absence?.status||'Pending'))} leave already exists</h2>
          <p>${esc(employee?.name||'Employee')} has ${esc(status)} ${esc(label)} for ${esc(options.day||'')} ${esc(options.shift||'')}. How do you want to handle this?</p>
        </div>
        <div class="calendar-absence-decision-actions rs-dialog-card__actions">
          <button type="button" class="rs-modal-btn is-danger" data-calendar-absence-decision="cancel-leave">${esc(cancelAnd)}</button>
          <button type="button" class="rs-modal-btn is-secondary" data-calendar-absence-decision="anyway">${esc(anyway)}</button>
          <button type="button" class="rs-modal-btn is-primary" data-calendar-absence-decision="keep-leave">Keep leave</button>
        </div>
      </form>`;
      /* close() is the single exit point — always resets absenceDecisionActive */
      const close=value=>{absenceDecisionActive=false;if(dialog.open)dialog.close();try{dialog.remove();}catch(_){}resolve(value||'keep-leave');};
      dialog.addEventListener('click',event=>{
        if(event.target===dialog)return close('keep-leave');   /* backdrop */
        const button=event.target.closest('[data-calendar-absence-decision]');
        if(button)return close(button.dataset.calendarAbsenceDecision); /* any button */
      });
      dialog.addEventListener('cancel',event=>{event.preventDefault();close('keep-leave');}); /* Escape */
      try{
        document.body.appendChild(dialog);
        dialog.showModal();
      }catch(_){
        close('keep-leave'); /* safety net: DOM/modal error still releases the lock */
        return;
      }
      setTimeout(()=>dialog.querySelector('[data-calendar-absence-decision="keep-leave"]')?.focus?.(),30);
    });
  }

  R.services.calendarActions = {floatingMenu,absenceLayer,absenceSlotHtml,persistAbsenceAction,showAbsenceContextMenu,absenceDecision};
})();
