/* restogogo workspace login helpers. */
function getUrlWorkspaceId(){try{const p=new URLSearchParams(location.search||''); return p.get('workspace')||p.get('restaurant')||'';}catch{return '';}}
function directWorkspaceFromHost(){const host=String(location.hostname||'').toLowerCase(); if(!host||host==='localhost'||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.endsWith('.vercel.app'))return ''; const parts=host.split('.').filter(Boolean); if(parts.length<3)return ''; const sub=parts[0]; return ['www','app','portal','restogogo','preview'].includes(sub)?'':sub;}
function requestedWorkspaceId(){const raw=getUrlWorkspaceId()||directWorkspaceFromHost(); if(!raw)return ''; const slug=slugifyWorkspace(raw); return WORKSPACE_ROUTE_ALIASES[slug]||slug;}
function isBadgeTerminalLaunchRoute(){try{const p=new URLSearchParams(location.search||''); const value=String(p.get('terminal')||p.get('kiosk')||'').toLowerCase(); return ['badge','badge-terminal'].includes(value);}catch{return false;}}
function badgeTerminalUrl(){const url=new URL(location.href); url.searchParams.set('terminal','badge-terminal'); url.searchParams.set('workspace',workspaceId()); return url.href;}
function openBadgeTerminal(){
  const url=badgeTerminalUrl();
  const win=window.open(url,'_blank','noopener,noreferrer');
  if(!win){
    Restogogo.ui?.toast?.('Allow pop-ups to open the badge terminal.',{tone:'warning',icon:'!',centered:true,timeout:2200});
    return;
  }
  win.focus?.();
}
function workspaceNameFromMeta(w){return (w?.restaurant?.name||w?.name||w?.id||'Restaurant').trim()||'Restaurant';}
function pilotConfig(){return window.APP_CONFIG||{};}
async function mergedWorkspaceList(){
  if(!window.DataAdapter.listWorkspaces)return [];
  try{return (await Promise.resolve(window.DataAdapter.listWorkspaces())).filter(w=>w?.id);}catch{return [];}
}

async function populateRestaurantLoginSelect(){const select=$('restaurantLoginSelect'); if(!select)return; workspaceCatalog=await mergedWorkspaceList(); const current=workspaceId(); select.innerHTML=workspaceCatalog.map(w=>`<option value="${esc(w.id)}">${esc(workspaceNameFromMeta(w))}</option>`).join(''); if(workspaceCatalog.some(w=>w.id===current))select.value=current; else if(workspaceCatalog[0]){window.DataAdapter.setWorkspaceId?.(workspaceCatalog[0].id); select.value=workspaceCatalog[0].id; await load();}}
async function changeLoginWorkspace(idValue){const next=slugifyWorkspace(idValue||workspaceId()); if(window.DataAdapter.setWorkspaceId)window.DataAdapter.setWorkspaceId(next); window.DataAdapter.setLoggedIn(false); await load(); await populateRestaurantLoginSelect(); fillSelectors(); applyRestaurantBrand(); const nameEl=$('identityLoginName'); const pinEl=$('accessPin'); if(nameEl)nameEl.value=''; if(pinEl)pinEl.value=''; Restogogo.brandEntry?.resetLoginState?.();}
function normalizeLoginIdentity(value){return String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');}
function resolveLoginIdentity(){
  const raw=String($('identityLoginName')?.value||'').trim();
  const pin=sanitizePin($('accessPin')?.value||'');
  const help=$('loginPinHelp');
  const fail=message=>{if(help){help.textContent=message; help.classList.add('error');} Restogogo.brandEntry?.signalLoginError?.(message); return null;};
  if(help){help.textContent=''; help.classList.remove('error');}
  if(!raw)return fail('Enter your name.');
  if(!pin)return fail('Enter your password or PIN.');
  const key=normalizeLoginIdentity(raw);
  const employee=activeEmployees().find(e=>{const full=normalizeLoginIdentity(e.name); const first=normalizeLoginIdentity(String(e.name||'').split(/\s+/)[0]); return key===full || key===first || key===normalizeLoginIdentity(e.id);});
  if(employee){if(!sanitizePin(employee.pin)||pin!==sanitizePin(employee.pin))return fail('Wrong password or PIN.'); return {role:'employee',employeeId:employee.id};}
  const ownerAliases=new Set([normalizeLoginIdentity(restaurantOwnerName()),'owner','manager'].filter(Boolean));
  if(ownerAliases.has(key)){if(pin!==PILOT_OWNER_PIN)return fail('Wrong password or PIN.'); return {role:'owner',employeeId:activeEmployees()[0]?.id||null};}
  return fail('Name not found for this workspace.');
}
async function enterSelectedWorkspace(){const identity=resolveLoginIdentity(); if(!identity)return; session={role:identity.role,employeeId:identity.employeeId}; Restogogo.brandEntry?.signalLoginSuccess?.(); window.DataAdapter.saveSession?.(session); window.DataAdapter.setLoggedIn(true); const finish=async()=>{enterApp(true);}; Restogogo.brandEntry?.shouldDelayEntry?.()?setTimeout(()=>void finish(),180):await finish();}
async function showRestaurantLogin(){document.documentElement.classList.remove('badge-terminal-mode'); document.body.classList.remove('planning-mode','employee-schedule-mode','employee-time-mode','badge-terminal-mode','actuals-mode','team-mode','restaurant-mode'); document.body.classList.add('logged-out'); await load(); await populateRestaurantLoginSelect(); fillSelectors(); applyRestaurantBrand(); Restogogo.brandEntry?.renderEntryModules?.(); const loginEl=$('login'); const pinEl=$('accessPin'); const nameEl=$('identityLoginName'); const helpEl=$('loginPinHelp'); if(loginEl)loginEl.style.display='grid'; if(pinEl)pinEl.value=''; if(nameEl)nameEl.value=''; if(helpEl){helpEl.textContent=''; helpEl.classList.remove('error');} Restogogo.brandEntry?.resetLoginState?.(); setTimeout(()=>(nameEl||pinEl)?.focus?.(),0);}
