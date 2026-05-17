/* restogogo badge terminal. */
(function(){
  let bound=false;
  let selectedEmployeeId='';
  let pin='';
  let isProcessing=false;
  let pinError=false;
  let liveTimer=null;

  const PHOTO_WIDTH=160;
  const PHOTO_HEIGHT=120;

  function now(){return new Date();}

  function clockTime(date=now()){
    return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  }

  function fullClockDate(date=now()){
    return date.toLocaleDateString('en-GB',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  }

  function currentDay(){
    return days[(now().getDay()+6)%7] || 'Monday';
  }

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
    const current=now();
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
    const day=currentDay();
    const shift=bestCurrentShift(employee,day) || shifts[0];
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

  function proofStatusLabel(status){
    if(status==='ok')return 'Photo proof captured';
    if(status==='unsupported')return 'Camera not available';
    if(status==='blocked')return 'Camera permission blocked';
    return 'Photo proof skipped';
  }

  function renderEmployeeList(employees){
    if(!employees.length){
      return `<div class="badge-terminal-empty rs-empty-state"><span class="rs-empty-state__icon">${Restogogo.icons.svg('alert')}</span><strong>No active employees</strong><span>Add active employees in Team before using the terminal.</span></div>`;
    }
    return employees.map(employee=>{
      const active=employee.id===selectedEmployeeId;
      return `<button class="badge-terminal-person${active?' is-active':''}" type="button" data-badge-terminal-action="select-employee" data-employee-id="${esc(employee.id)}">
        <span class="rs-weekly-avatar badge-terminal-avatar" style="${esc(positionStyle(employeePositionName(employee)))}">${esc(employeeInitials(employee.name).slice(0,1))}</span>
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
    const copy=targetCopy(employee);
    return `<div class="badge-terminal-pin-flow${pinError?' is-error':''}">
      <div class="badge-terminal-selected-person">
        <span class="rs-weekly-avatar badge-terminal-avatar" style="${esc(positionStyle(employeePositionName(employee)))}">${esc(employeeInitials(employee.name).slice(0,1))}</span>
        <span><strong>${esc(employee.name)}</strong><small>${esc(employeePositionName(employee))}</small></span>
      </div>
      <div class="badge-terminal-center-copy">
        <span class="badge-terminal-state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="10" width="14" height="10" rx="3"></rect><path d="M8 10V7.5a4 4 0 0 1 8 0V10"></path><path d="M12 14v2.5"></path></svg>
        </span>
        <span class="badge-terminal-kicker">${esc(copy.kicker)}</span>
        ${isProcessing ? '<h2>Checking…</h2>' : ''}
        <p>${isProcessing?'Taking photo proof and recording the badge.':esc(copy.body)}</p>
        <small>${esc(copy.meta)}</small>
      </div>
      <div class="badge-terminal-pin-entry" aria-label="PIN entry">
        <div class="badge-terminal-pin-dots">${renderPinDots()}</div>
        ${renderKeypad()}
      </div>
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
        <div class="badge-terminal-live" aria-label="Current time"><span>${esc(clockTime())}</span><small>${esc(fullClockDate())}</small></div>
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
      live.innerHTML=`<span>${esc(clockTime())}</span><small>${esc(fullClockDate())}</small>`;
    },1000*20);
  }

  function setEmployee(employeeId){
    selectedEmployeeId=employeeId||'';
    pin='';
    pinError=false;
    isProcessing=false;
    render();
  }

  async function captureProofPhoto(){
    if(!navigator.mediaDevices?.getUserMedia)return {dataUrl:'',status:'unsupported'};
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
      ctx.drawImage(video,0,0,PHOTO_WIDTH,PHOTO_HEIGHT);
      return {dataUrl:canvas.toDataURL('image/jpeg',0.45),status:'ok'};
    }catch(error){
      return {dataUrl:'',status:error?.name==='NotAllowedError'?'blocked':'error'};
    }finally{
      stream?.getTracks?.().forEach(track=>track.stop());
    }
  }

  function addBadgeNotification(employee,target,action,time){
    const title=action==='out'?'Clock-out recorded':'Clock-in recorded';
    addNotification(`actual-${action}-${employee.id}-${Date.now()}`,'yellow',title,`${employee.name} · ${target.day} ${target.shift} · ${time}`,{kind:'actual'});
  }

  async function recordBadge(employee){
    const proof=await captureProofPhoto();
    const time=clockTime();
    const stamp=now().toISOString();
    let savedResult=null;
    const ok=await Restogogo.stateService.commitStateMutation({
      reason:'badge-entry',
      mutate:()=>{
        const target=badgeTarget(employee,true);
        const action=target.mode;
        if(action==='out'){
          target.entry.clockOut=time;
          target.entry.clockOutAt=stamp;
          target.entry.clockOutPhoto=proof.dataUrl;
          target.entry.clockOutPhotoStatus=proof.status;
          target.entry.clockOutPhotoCapturedAt=proof.dataUrl?stamp:'';
          target.entry.source='badge-terminal';
          target.entry.updatedAt=stamp;
        }else{
          const isResume=!!(target.entry.clockIn && target.entry.clockOut);
          if(!target.entry.clockIn){
            target.entry.clockIn=time;
            target.entry.clockInAt=stamp;
            target.entry.clockInPhoto=proof.dataUrl;
            target.entry.clockInPhotoStatus=proof.status;
            target.entry.clockInPhotoCapturedAt=proof.dataUrl?stamp:'';
          }else if(isResume){
            target.entry.lastBreakOut=target.entry.clockOut;
            target.entry.lastBreakOutAt=target.entry.clockOutAt || '';
          }
          target.entry.clockOut='';
          target.entry.clockOutAt='';
          target.entry.clockOutPhoto='';
          target.entry.clockOutPhotoStatus='';
          target.entry.clockOutPhotoCapturedAt='';
          target.entry.resumeAt=isResume?stamp:(target.entry.resumeAt||'');
          target.entry.source='badge-terminal';
          target.entry.createdAt=target.entry.createdAt||stamp;
          target.entry.updatedAt=stamp;
        }
        addBadgeNotification(employee,target,action,time);
        savedResult={action,time,target,proof};
      },
      render,
      errorMessage:'Badge entry was not saved. Please try again.'
    });
    return ok ? savedResult : null;
  }

  function resetToHome(delay=1700){
    window.setTimeout(()=>{
      selectedEmployeeId='';
      pin='';
      pinError=false;
      isProcessing=false;
      render();
    },delay);
  }

  async function submitPin(){
    const employee=selectedEmployee();
    if(!employee||isProcessing)return;
    if(!sanitizePin(employee.pin) || pin!==sanitizePin(employee.pin)){
      pin='';
      pinError=true;
      render();
      Restogogo.ui?.toast?.('Wrong PIN. Please try again.',{tone:'danger',icon:'alert',centered:true,timeout:1600});
      window.setTimeout(()=>{pinError=false;render();},520);
      return;
    }

    isProcessing=true;
    render();
    const result=await recordBadge(employee);
    const proofText=result?.proof ? ` · ${proofStatusLabel(result.proof.status)}` : '';
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
    Restogogo.router?.render?.();
    resetToHome();
  }

  function setPinKey(key){
    if(!selectedEmployeeId||isProcessing)return;
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
      const keyButton=event.target.closest('[data-badge-terminal-key]');
      if(keyButton){setPinKey(keyButton.dataset.badgeTerminalKey); return;}
    });
    document.addEventListener('keydown',handleKeyboard);
  }

  const badgeTerminalApi={render,bind};
  Restogogo.badge=badgeTerminalApi;
})();
