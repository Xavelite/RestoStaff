/* restogogo notification helpers. */
function notificationData(){return data && typeof data==='object' ? data : null;}
function notificationKey(n){return `${n.id||''}-${n.title||''}`;}
function addNotification(idValue,tone,title,body,meta={}){
  const state=notificationData();
  if(!state)return;
  state.notifications=Array.isArray(state.notifications)?state.notifications:[];
  const existing=state.notifications.find(n=>n.id===idValue);
  const next={id:idValue,tone:tone||'warning',title,body,meta,createdAt:new Date().toISOString()};
  if(existing)Object.assign(existing,next); else state.notifications.unshift(next);
  state.notifications=state.notifications.slice(0,50);
}
function notificationAudience(n){
  if(Restogogo.registry.isOwnerOrManager(session.role))return true;
  const meta=n.meta || {};
  if(meta.kind==='employee')return !meta.id || meta.id===session.employeeId;
  if(meta.kind==='status')return true;
  return false;
}
function derivedNotifications(){
  const state=notificationData();
  if(!state)return [];
  const base=(Array.isArray(state.notifications)?state.notifications:[]).filter(notificationAudience);
  const conflicts=(Restogogo.planning?.conflicts&&Restogogo.registry.isOwnerOrManager(session.role))?Restogogo.planning.conflicts():[];
  if(conflicts.length)base.unshift({id:'derived-conflicts-'+state.weekStart,tone:'danger',title:`${conflicts.length} conflict${conflicts.length===1?'':'s'} found`,body:'Some shifts are outside availability.',meta:{kind:'conflict'}});
  return base.slice(0,20);
}
function renderNotifications(){
  const list=derivedNotifications();
  const unread=list.filter(n=>!notifRead[notificationKey(n)]);
  const danger=unread.filter(n=>n.tone==='danger').length;
  const warning=unread.length-danger;
  const dangerBadgeEl=$('notifBadgeDanger');
  if(dangerBadgeEl){dangerBadgeEl.textContent=danger||''; dangerBadgeEl.classList.toggle('show',danger>0);}
  const warningBadgeEl=$('notifBadgeWarning');
  if(warningBadgeEl){warningBadgeEl.textContent=warning||''; warningBadgeEl.classList.toggle('show',warning>0);}
  const panel=$('notifPanel'); if(!panel)return;
  panel.classList.toggle('open',notifOpen);
  if(!notifOpen){panel.replaceChildren(); return;}
  panel.innerHTML=`<div class="notif-head"><strong>Notifications</strong><button type="button" data-notification-action="mark-all-read">Mark read</button></div>${list.length?list.map(notifItemHtml).join(''):'<div class="notif-empty">No notifications yet.</div>'}`;
}
function notifItemHtml(n){const key=notificationKey(n); const isUnread=!notifRead[key]; return `<button type="button" class="notif-item is-${n.tone==='danger'?'danger':'warning'} ${isUnread?'unread':''}" data-notification-key="${esc(key)}"><span class="notif-dot"></span><span><strong>${esc(n.title)}</strong><small>${esc(n.body||'')}</small></span></button>`;}
function markNotificationRead(key){notifRead[key]=true; window.DataAdapter.saveNotificationsRead(notifRead); renderNotifications();}
function markAllNotificationsRead(){derivedNotifications().forEach(n=>{notifRead[notificationKey(n)]=true;}); window.DataAdapter.saveNotificationsRead(notifRead); renderNotifications();}
