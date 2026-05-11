/*
 * restogogo time clock v3
 * Clean employee-facing badge terminal.
 * Flow: tap employee -> enter PIN -> capture low-res proof photo -> clock in/out -> reset.
 */
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

  function minutesFromTime(value=''){
    const match=String(value||'').match(/^(\d{1,2}):(\d{2})$/);
    return match ? (+match[1])*60+(+match[2]) : null;
  }

  function rangeBounds(range=''){
    const [startRaw,endRaw]=String(range||'').split('-').map(part=>part.trim());
    let start=minutesFromTime(startRaw);
    let end=minutesFromTime(endRaw);
    if(start===null||end===null)return null;
    if(end<start)end+=1440;
    return {start,end};
  }

  function currentDay(){
    return days[(now().getDay()+6)%7] || 'Monday';
  }

  function ensureActualSlot(employeeId,day,shift){
    data.actualEntries=data.actualEntries||{};
    data.actualEntries[employeeId]=data.actualEntries[employeeId]||{};
    data.actualEntries[employeeId][day]=data.actualEntries[employeeId][day]||{};
    data.actualEntries[employeeId][day][shift]=data.actualEntries[employeeId][day][shift]||{};
    return data.actualEntries[employeeId][day][shift];
  }

  function findOpenEntry(employeeId){
    for(const day of days){
      for(const shift of shifts){
        const entry=data.actualEntries?.[employeeId]?.[day]?.[shift];
        if(entry?.clockIn && !entry.clockOut)return {day,shift,entry};
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
      const range=plannedRange(employee,day,shift) || (shift==='Lunch'?'11:00-15:00':'17:00-00:00');
      const bounds=rangeBounds(range);
      if(!bounds)return {shift,score:99999};
      let m=minute;
      if(bounds.end>=1440 && m<360)m+=1440;
      const inside=m>=bounds.start-90 && m<=bounds.end+150;
      const middle=(bounds.start+bounds.end)/2;
      return {shift,score:(inside?0:5000)+Math.abs(m-middle)};
    }).sort((a,b)=>a.score-b.score);
    return candidates[0]?.shift || (current.getHours()>=16?'Evening':'Lunch');
  }

  function selectedEmployee(){
    if(!selectedEmployeeId)return null;
    return activeEmployees().find(employee=>employee.id===selectedEmployeeId) || null;
  }

  function badgeTarget(employee){
    const open=findOpenEntry(employee.id);
    if(open){
      return {mode:'out',day:open.day,shift:open.shift,entry:open.entry,range:plannedRange(employee,open.day,open.shift)};
    }
    const day=currentDay();
    const shift=bestCurrentShift(employee,day);
    const entry=ensureActualSlot(employee.id,day,shift);
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
    return employees.map(employee=>{
      const active=employee.id===selectedEmployeeId;
      return `<button class="time-clock-person${active?' is-active':''}" type="button" data-time-clock-action="select-employee" data-employee-id="${esc(employee.id)}">
        <span class="time-clock-avatar" style="${positionStyle(employee.position)}">${esc(employeeInitials(employee.name).slice(0,1))}</span>
        <span class="time-clock-person-name">${esc(employee.name)}</span>
      </button>`;
    }).join('');
  }

  function renderPinDots(){
    return Array.from({length:4},(_,index)=>`<span class="${pin.length>index?'is-filled':''}"></span>`).join('');
  }

  function renderKeypad(){
    const keys=['1','2','3','4','5','6','7','8','9','clear','0','back'];
    return `<div class="time-clock-keypad" aria-label="PIN keypad">${keys.map(key=>{
      const label=key==='clear'?'Clear':key==='back'?'⌫':key;
      const extra=key==='clear'?' is-clear':key==='back'?' is-back':'';
      return `<button type="button" class="${extra}" data-time-clock-key="${esc(key)}">${esc(label)}</button>`;
    }).join('')}</div>`;
  }

  function renderIdlePanel(){
    return `<div class="time-clock-center-copy">
      <span class="time-clock-state-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 2.75a3.4 3.4 0 0 1 3.4 3.4v5.8l.8-.7a2.2 2.2 0 0 1 3.2 2.9l-3.15 4.75a5.2 5.2 0 0 1-4.35 2.35H9.8a5 5 0 0 1-4.68-3.25l-1.78-4.8a2.05 2.05 0 0 1 3.75-1.65l1.5 2.65V6.15A3.4 3.4 0 0 1 12 2.75Z"></path><path d="M12 2.75v8.4"></path></svg>
      </span>
      <h2>Tap your name</h2>
      <p>to clock in or out</p>
    </div>`;
  }

  function renderPinPanel(employee){
    const copy=targetCopy(employee);
    return `<div class="time-clock-pin-flow${pinError?' is-error':''}">
      <div class="time-clock-selected-person">
        <span class="time-clock-avatar" style="${positionStyle(employee.position)}">${esc(employeeInitials(employee.name).slice(0,1))}</span>
        <span><strong>${esc(employee.name)}</strong><small>${esc(employee.position)}</small></span>
      </div>
      <div class="time-clock-center-copy">
        <span class="time-clock-state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="10" width="14" height="10" rx="3"></rect><path d="M8 10V7.5a4 4 0 0 1 8 0V10"></path><path d="M12 14v2.5"></path></svg>
        </span>
        <span class="time-clock-kicker">${esc(copy.kicker)}</span>
        ${isProcessing ? '<h2>Checking…</h2>' : ''}
        <p>${isProcessing?'Taking photo proof and recording the badge.':esc(copy.body)}</p>
        <small>${esc(copy.meta)}</small>
      </div>
      <div class="time-clock-pin-entry" aria-label="PIN entry">
        <div class="time-clock-pin-dots">${renderPinDots()}</div>
        ${renderKeypad()}
      </div>
    </div>`;
  }

  function renderClockPanel(employee){
    return `<section class="time-clock-terminal-card rs-card${employee?' has-employee':' is-idle'}${isProcessing?' is-processing':''}">
      <div class="time-clock-orbit" aria-hidden="true"></div>
      ${employee?renderPinPanel(employee):renderIdlePanel()}
    </section>`;
  }

  function render(){
    const root=$('timeClockRoot');
    if(!root||!data)return;
    const employees=activeEmployees();
    const employee=selectedEmployee();
    root.innerHTML=`<div class="time-clock-terminal">
      <header class="time-clock-kiosk-header" aria-label="Badge terminal header">
        <div class="time-clock-kiosk-brand">
          <img class="time-clock-kiosk-logo" src="assets/img/brand/restogogo_logo_transparent.png" alt="restogogo">
          <span class="time-clock-kiosk-divider" aria-hidden="true"></span>
          <span class="time-clock-kiosk-title">Badge terminal</span>
        </div>
        <div class="time-clock-live" aria-label="Current time"><span>${esc(clockTime())}</span><small>${esc(fullClockDate())}</small></div>
      </header>
      <div class="time-clock-layout">
        <aside class="time-clock-people rs-card" aria-label="Employees">
          <div class="time-clock-people-list">${renderEmployeeList(employees)}</div>
        </aside>
        ${renderClockPanel(employee)}
      </div>
    </div>`;
    startLiveClock();
  }

  function startLiveClock(){
    if(liveTimer)return;
    liveTimer=setInterval(()=>{
      if(!document.body.classList.contains('time-clock-mode'))return;
      const live=document.querySelector('.time-clock-live');
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
    const target=badgeTarget(employee);
    const action=target.mode;
    const proof=await captureProofPhoto();
    const time=clockTime();
    const stamp=now().toISOString();

    if(action==='out'){
      target.entry.clockOut=time;
      target.entry.clockOutAt=stamp;
      target.entry.clockOutPhoto=proof.dataUrl;
      target.entry.clockOutPhotoStatus=proof.status;
      target.entry.updatedAt=stamp;
    }else{
      if(target.entry.clockIn && target.entry.clockOut){
        window.RestogogoUI?.toast?.('This shift is already complete.',{tone:'warning',icon:'!',centered:true,timeout:2200});
        return {action:'complete',time,proof};
      }
      target.entry.clockIn=time;
      target.entry.clockOut='';
      target.entry.clockInAt=stamp;
      target.entry.clockInPhoto=proof.dataUrl;
      target.entry.clockInPhotoStatus=proof.status;
      target.entry.createdAt=target.entry.createdAt||stamp;
      target.entry.updatedAt=stamp;
    }

    addBadgeNotification(employee,target,action,time);
    save();
    return {action,time,target,proof};
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
    if(pin!==sanitizePin(employee.pin||PROTOTYPE_PIN)){
      pin='';
      pinError=true;
      render();
      window.RestogogoUI?.toast?.('Wrong PIN. Please try again.',{tone:'danger',icon:'!',centered:true,timeout:1600});
      window.setTimeout(()=>{pinError=false;render();},520);
      return;
    }

    isProcessing=true;
    render();
    const result=await recordBadge(employee);
    const proofText=result?.proof ? ` · ${proofStatusLabel(result.proof.status)}` : '';
    if(result?.action==='in'){
      window.RestogogoUI?.toast?.(`${employee.name} checked in at ${result.time}${proofText}` ,{tone:'success',icon:'✓',centered:true,timeout:2400});
    }else if(result?.action==='out'){
      window.RestogogoUI?.toast?.(`${employee.name} checked out at ${result.time}${proofText}`,{tone:'success',icon:'✓',centered:true,timeout:2400});
    }
    pin='';
    window.RestogogoApp?.render?.();
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
    if(!document.body.classList.contains('time-clock-mode'))return;
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
      const root=$('timeClockRoot');
      if(!root || !root.contains(event.target))return;
      const employeeButton=event.target.closest('[data-time-clock-action="select-employee"]');
      if(employeeButton){setEmployee(employeeButton.dataset.employeeId||''); return;}
      const keyButton=event.target.closest('[data-time-clock-key]');
      if(keyButton){setPinKey(keyButton.dataset.timeClockKey); return;}
    });
    document.addEventListener('keydown',handleKeyboard);
  }

  window.TimeClock={render,bind};
})();
