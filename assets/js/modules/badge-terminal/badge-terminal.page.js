/* restogogo badge terminal. */
(function(){
  let bound=false;
  let selectedEmployeeId='';
  let selectedShiftOverride='';
  let pin='';
  let isProcessing=false;
  let pinError=false;
  let pinAttempts=0;
  let pinLockout=false;
  let liveTimer=null;
  let resetTimer=null;

  const PHOTO_WIDTH=160;
  const PHOTO_HEIGHT=120;
  const MAX_PIN_ATTEMPTS=3;
  const BadgeTime=Restogogo.modules.BadgeTerminalTime;

  function findOpenEntry(employeeId){
    for(const day of days){
      for(const shift of shifts){
        const entry=getActualEntry(employeeId,day,shift);
        if(entry.clockIn && !entry.clockOut)return {day,shift,entry:ensureActualEntry(employeeId,day,shift)};
      }
    }
    return null;
  }

  function plannedRange(employee,day,shift){
    return employee && isPlanned(employee.id,day,shift) ? timeRangeFor(employee,day,shift) : '';
  }

  function bestCurrentShift(employee,day){
    const current=BadgeTime.now();
    let minute=current.getHours()*60+current.getMinutes();
    const candidates=shifts.map(shift=>{
      const range=plannedRange(employee,day,shift);
      const bounds=timeRangeBounds(range);
      if(!bounds)return {shift,score:99999};
      let m=minute;
      if(bounds.end>=1440 && m<360)m+=1440;
      const inside=m>=bounds.start-90 && m<=bounds.end+150;
      const middle=(bounds.start+bounds.end)/2;
      return {shift,score:(inside?0:5000)+Math.abs(m-middle)};
    }).sort((a,b)=>a.score-b.score);
    const best=candidates.filter(item=>item.score<99999).sort((a,b)=>a.score-b.score)[0];
    return best?.shift || '';
  }

  function selectedEmployee(){
    if(!selectedEmployeeId)return null;
    return activeEmployees().find(employee=>employee.id===selectedEmployeeId) || null;
  }

  function badgeTarget(employee, write=false){
    const open=findOpenEntry(employee.id);
    if(open){
      return {mode:'out',day:open.day,shift:open.shift,entry:open.entry,range:plannedRange(employee,open.day,open.shift)};
    }
    const day=BadgeTime.currentDay();
    /* Use employee's explicit shift choice when set, otherwise fall back to heuristic */
    const shift=(selectedShiftOverride && shifts.includes(selectedShiftOverride)) ? selectedShiftOverride : (bestCurrentShift(employee,day) || shifts[0]);
    const entry=write ? ensureActualEntry(employee.id,day,shift) : getActualEntry(employee.id,day,shift);
    return {mode:'in',day,shift,entry,range:plannedRange(employee,day,shift)};
  }

  function targetCopy(employee){
    if(!employee)return {kicker:'Badge terminal',title:'Tap your name',body:'to clock in or out',meta:''};
    const target=badgeTarget(employee);
    const planned=target.range ? `Planned ${displayTimeRange(target.range)}` : 'No planned shift now';
    if(target.mode==='out'){
      return {
        kicker:`${target.day} · ${target.shift}`,
        title:'',
        body:`Clock out from ${target.entry.clockIn}`,
        meta:planned
      };
    }
    return {
      kicker:`${target.day} · ${target.shift}`,
      title:'',
      body:'Clock in now',
      meta:planned
    };
  }

  function renderEmployeeList(employees){
    if(!employees.length){
      return `<div class="badge-terminal-empty rs-empty-state"><span class="rs-empty-state__icon">${Restogogo.icons.svg('alert')}</span><strong>No active employees</strong><span>Add active employees in Team before using the terminal.</span></div>`;
    }
    return employees.map(employee=>{
      const active=employee.id===selectedEmployeeId;
      return `<button class="badge-terminal-person${active?' is-active':''}" type="button" data-badge-terminal-action="select-employee" data-employee-id="${esc(employee.id)}">
        <span class="rs-weekly-avatar badge-terminal-avatar" style="${esc(jobFunctionStyle(employeeJobFunctionName(employee)))}">${esc(employeeInitials(employee.name).slice(0,1))}</span>
        <span class="badge-terminal-person-name">${esc(employee.name)}</span>
      </button>`;
    }).join('');
  }

  function renderPinDots(){
    return Array.from({length:4},(_,index)=>`<span class="${pin.length>index?'is-filled':''}"></span>`).join('');
  }

  function renderKeypad(){
    const keys=['1','2','3','4','5','6','7','8','9','clear','0','back'];
    return `<div class="badge-terminal-keypad" aria-label="PIN keypad">${keys.map(key=>{
      const label=key==='clear'?'Clear':key==='back'?'⌫':key;
      const extra=key==='clear'?' is-clear':key==='back'?' is-back':'';
      return `<button type="button" class="${extra}" data-badge-terminal-key="${esc(key)}">${esc(label)}</button>`;
    }).join('')}</div>`;
  }

  function renderIdlePanel(){
    return `<div class="badge-terminal-center-copy">
      <span class="badge-terminal-state-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 2.75a3.4 3.4 0 0 1 3.4 3.4v5.8l.8-.7a2.2 2.2 0 0 1 3.2 2.9l-3.15 4.75a5.2 5.2 0 0 1-4.35 2.35H9.8a5 5 0 0 1-4.68-3.25l-1.78-4.8a2.05 2.05 0 0 1 3.75-1.65l1.5 2.65V6.15A3.4 3.4 0 0 1 12 2.75Z"></path><path d="M12 2.75v8.4"></path></svg>
      </span>
      <h2>Tap your name</h2>
      <p>to clock in or out</p>
    </div>`;
  }

  function renderPinPanel(employee){
    const target=badgeTarget(employee);
    const copy=targetCopy(employee);
    /* Shift toggle shown for clock-in only: shift is locked once employee has an open entry */
    const shiftToggle=target.mode==='in' ? `<div class="badge-terminal-shift-toggle" aria-label="Select shift" role="group">
      ${shifts.map(shift=>`<button type="button" class="badge-terminal-shift-btn${target.shift===shift?' is-active':''}" data-badge-shift="${esc(shift)}">${esc(shift)}</button>`).join('')}
    </div>` : '';
    return `<div class="badge-terminal-pin-flow${pinError?' is-error':''}${pinLockout?' is-locked':''}">
      <div class="badge-terminal-selected-person">
        <span class="rs-weekly-avatar badge-terminal-avatar" style="${esc(jobFunctionStyle(employeeJobFunctionName(employee)))}">${esc(employeeInitials(employee.name).slice(0,1))}</span>
        <span><strong>${esc(employee.name)}</strong><small>${esc(employeeJobFunctionName(employee))}</small></span>
      </div>
      <div class="badge-terminal-center-copy">
        <span class="badge-terminal-state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="10" width="14" height="10" rx="3"></rect><path d="M8 10V7.5a4 4 0 0 1 8 0V10"></path><path d="M12 14v2.5"></path></svg>
        </span>
        <span class="badge-terminal-kicker">${esc(copy.kicker)}</span>
        ${isProcessing ? '<h2>Checking…</h2>' : ''}
        <p>${isProcessing?'Checking PIN before photo proof.':esc(copy.body)}</p>
        <small>${esc(copy.meta)}</small>
      </div>
      ${pinLockout
        ?`<div class="badge-terminal-pin-entry badge-terminal-pin-entry--locked" role="alert">
            <p class="badge-terminal-lockout-msg">Too many failed attempts — tap another name or contact your manager.</p>
          </div>`
        :`${shiftToggle}<div class="badge-terminal-pin-entry" aria-label="PIN entry"><div class="badge-terminal-pin-dots">${renderPinDots()}</div>${renderKeypad()}</div>`}
    </div>`;
  }

  function renderClockPanel(employee){
    return `<section class="badge-terminal-terminal-card rs-card${employee?' has-employee':' is-idle'}${isProcessing?' is-processing':''}">
      <div class="badge-terminal-orbit" aria-hidden="true"></div>
      ${employee?renderPinPanel(employee):renderIdlePanel()}
    </section>`;
  }

  function render(){
    const root=$('badgeTerminalRoot');
    if(!root||!data)return;
    const listScroll=root.querySelector('.badge-terminal-people-list')?.scrollTop || 0;
    const employees=activeEmployees();
    const employee=selectedEmployee();
    root.innerHTML=`<div class="badge-terminal-terminal">
      <header class="badge-terminal-kiosk-header" aria-label="Badge terminal header">
        <div class="badge-terminal-kiosk-brand">
          <img class="badge-terminal-kiosk-logo" src="assets/img/brand/restogogo_logo_transparent.png" alt="restogogo">
          <span class="badge-terminal-kiosk-divider" aria-hidden="true"></span>
          <span class="badge-terminal-kiosk-title">Badge terminal</span>
        </div>
        <div class="badge-terminal-live" aria-label="Current time"><span>${esc(BadgeTime.clockTime())}</span><small>${esc(BadgeTime.fullClockDate())}</small></div>
      </header>
      <div class="badge-terminal-layout">
        <aside class="badge-terminal-people rs-card" aria-label="Employees">
          <div class="badge-terminal-people-list">${renderEmployeeList(employees)}</div>
        </aside>
        ${renderClockPanel(employee)}
      </div>
    </div>`;
    const nextList=root.querySelector('.badge-terminal-people-list');
    if(nextList)nextList.scrollTop=listScroll;
    startLiveClock();
  }

  function startLiveClock(){
    if(liveTimer)return;
    liveTimer=setInterval(()=>{
      if(!document.body.classList.contains('badge-terminal-mode'))return;
      const live=document.querySelector('.badge-terminal-live');
      if(!live)return;
      live.innerHTML=`<span>${esc(BadgeTime.clockTime())}</span><small>${esc(BadgeTime.fullClockDate())}</small>`;
    },1000*20);
  }

  function setEmployee(employeeId){
    /* Cancel any pending auto-reset so it can't interrupt this new session */
    if(resetTimer){window.clearTimeout(resetTimer);resetTimer=null;}
    selectedEmployeeId=employeeId||'';
    selectedShiftOverride='';
    pin='';
    pinError=false;
    pinAttempts=0;
    pinLockout=false;
    isProcessing=false;
    render();
  }

  async function captureProofPhoto(){
    if(!navigator.mediaDevices?.getUserMedia)return {dataUrl:'',status:'unavailable'};
    let stream=null;
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:320},height:{ideal:240},facingMode:'user'},audio:false});
      const video=document.createElement('video');
      video.muted=true;
      video.playsInline=true;
      video.srcObject=stream;
      await video.play();
      if(!video.videoWidth){
        await new Promise(resolve=>{
          video.onloadedmetadata=resolve;
          setTimeout(resolve,500);
        });
      }
      const canvas=document.createElement('canvas');
      canvas.width=PHOTO_WIDTH;
      canvas.height=PHOTO_HEIGHT;
      const ctx=canvas.getContext('2d');
      if(!ctx)return {dataUrl:'',status:'failed'};
      ctx.drawImage(video,0,0,PHOTO_WIDTH,PHOTO_HEIGHT);
      return {dataUrl:canvas.toDataURL('image/jpeg',0.45),status:'captured'};
    }catch(error){
      const errorName=String(error?.name || '');
      const denied=errorName==='NotAllowedError' || errorName==='SecurityError' || errorName==='PermissionDeniedError';
      const unavailable=errorName==='NotFoundError' || errorName==='DevicesNotFoundError';
      return {dataUrl:'',status:denied?'denied':(unavailable?'unavailable':'failed')};
    }finally{
      stream?.getTracks?.().forEach(track=>track.stop());
    }
  }

  function addBadgeNotification(employee,target,action,time){
    const title=action==='out'?'Clock-out recorded':'Clock-in recorded';
    addNotification(`actual-${action}-${employee.id}-${Date.now()}`,'warning',title,`${employee.name} · ${target.day} ${target.shift} · ${time}`,{kind:'actual'});
  }

  function ensureCurrentBadgeWeek(){
    const currentWeek=Restogogo.logic?.workflow?.currentWeekStart?.() || currentWeekStart();
    if(data?.weekStart !== currentWeek)setWeekStartAndLoad(currentWeek);
  }

  async function recordBadge(employee, submittedPin){
    ensureCurrentBadgeWeek();
    const editability=Restogogo.logic?.workflow?.canRecordBadge?.(data) || {ok:true};
    if(!editability.ok){
      Restogogo.ui?.toast?.(editability.message || 'Badging is locked for this week.',{tone:'warning',icon:'alert',centered:true,timeout:1800});
      return null;
    }
    const target=badgeTarget(employee,true);
    const restaurantId=Restogogo.workspace?.current?.()?.restaurant?.id || window.DataAdapter?.getWorkspaceId?.();
    const pinValue=String(submittedPin || '').trim();
    await RestogogoAuthService.verifyBadgePin({
      p_restaurant_id:restaurantId,
      p_employee_id:employee.id,
      p_pin:pinValue
    });
    const proof=await captureProofPhoto();
    const payload={
      p_restaurant_id:restaurantId,
      p_employee_id:employee.id,
      p_pin:pinValue,
      p_business_date:BadgeTime.businessDateForDay(target.day),
      p_service_key:BadgeTime.serviceKeyFromShift(target.shift),
      p_photo_url:proof.dataUrl || null,
      p_photo_status:proof.status || 'missing'
    };
    const result=await RestogogoAuthService.recordBadgeEntry(payload);
    // Notify Actuals sessions so they can refresh the board live.
    window.Restogogo?.services?.realtime?.broadcastBadgeEntry?.(employee.id, target.day, target.shift);
    const action=String(result?.action || target.mode || '').toLowerCase();
    const time=BadgeTime.clockTime();
    const stamp=BadgeTime.now().toISOString();
    if(result?.runtime_snapshot){
      window.DataAdapter?.applyRuntimeSnapshot?.(result.runtime_snapshot);
    }else{
      // The RPC succeeded but returned no runtime_snapshot — this is a broken contract.
      // We do NOT silently mutate local state to fabricate a clock-in/out that the DB
      // may or may not reflect. Per project motto: no hidden fallbacks for internal defects.
      // The badge notification below still shows the employee their recorded time (from `time`
      // and `action` variables set from the RPC result). Local state will be corrected on next sync.
      Restogogo.warn?.('[badge-terminal] recordBadgeEntry succeeded with no runtime_snapshot — local state not updated.', {employee:employee?.id, action, time});
    }
    addBadgeNotification(employee,target,action,time);
    return {action,time,target,proof,result};
  }

  function resetToHome(delay=1700){
    if(resetTimer){window.clearTimeout(resetTimer);resetTimer=null;}
    resetTimer=window.setTimeout(()=>{
      resetTimer=null;
      selectedEmployeeId='';
      selectedShiftOverride='';
      pin='';
      pinError=false;
      pinAttempts=0;
      pinLockout=false;
      isProcessing=false;
      render();
    },delay);
  }

  async function submitPin(){
    const employee=selectedEmployee();
    if(!employee||isProcessing||pinLockout)return;
    if(!/^\d{4}$/.test(pin)){
      pin='';
      pinError=true;
      render();
      Restogogo.ui?.toast?.('Enter your 4-digit PIN.',{tone:'danger',icon:'alert',centered:true,timeout:1600});
      window.setTimeout(()=>{pinError=false;render();},520);
      return;
    }

    isProcessing=true;
    render();
    let result=null;
    try{
      result=await recordBadge(employee, pin);
    }catch(error){
      pin='';
      isProcessing=false;
      pinAttempts++;
      if(pinAttempts>=MAX_PIN_ATTEMPTS){
        pinLockout=true;
        render();
        Restogogo.ui?.toast?.('Too many failed attempts — select another employee or contact your manager.',{tone:'danger',icon:'alert',centered:true,timeout:4000});
        return;
      }
      pinError=true;
      render();
      Restogogo.ui?.toast?.(error?.message || 'Wrong PIN. Please try again.',{tone:'danger',icon:'alert',centered:true,timeout:1800});
      window.setTimeout(()=>{pinError=false;render();},520);
      return;
    }
    const proofText=result?.proof ? ` · ${BadgeTime.proofStatusLabel(result.proof.status)}` : '';
    if(result?.action==='in'){
      Restogogo.ui?.toast?.(`${employee.name} checked in at ${result.time}${proofText}` ,{tone:'success',icon:'check',centered:true,timeout:2400});
    }else if(result?.action==='out'){
      Restogogo.ui?.toast?.(`${employee.name} checked out at ${result.time}${proofText}`,{tone:'success',icon:'check',centered:true,timeout:2400});
    }
    if(!result){
      pin='';
      isProcessing=false;
      render();
      return;
    }
    pin='';
    render();
    resetToHome();
  }

  function setPinKey(key){
    if(!selectedEmployeeId||isProcessing||pinLockout)return;
    if(key==='clear')pin='';
    else if(key==='back')pin=pin.slice(0,-1);
    else if(/^\d$/.test(key) && pin.length<4)pin+=key;
    pinError=false;
    render();
    if(pin.length===4)window.setTimeout(submitPin,80);
  }

  function handleKeyboard(event){
    if(!document.body.classList.contains('badge-terminal-mode'))return;
    if(!selectedEmployeeId||isProcessing)return;
    if(event.target?.closest?.('input, textarea, select, button'))return;
    if(/^\d$/.test(event.key)){event.preventDefault();setPinKey(event.key);}
    if(event.key==='Backspace'){event.preventDefault();setPinKey('back');}
    if(event.key==='Escape'){event.preventDefault();setEmployee('');}
  }

  function bind(){
    if(bound)return;
    bound=true;
    document.addEventListener('click',event=>{
      const root=$('badgeTerminalRoot');
      if(!root || !root.contains(event.target))return;
      const employeeButton=event.target.closest('[data-badge-terminal-action="select-employee"]');
      if(employeeButton){setEmployee(employeeButton.dataset.employeeId||''); return;}
      const shiftButton=event.target.closest('[data-badge-shift]');
      if(shiftButton){selectedShiftOverride=shiftButton.dataset.badgeShift||''; render(); return;}
      const keyButton=event.target.closest('[data-badge-terminal-key]');
      if(keyButton){setPinKey(keyButton.dataset.badgeTerminalKey); return;}
    });
    document.addEventListener('keydown',handleKeyboard);
  }

  const badgeTerminalApi={render,bind};
  Restogogo.badge=badgeTerminalApi;
})();
