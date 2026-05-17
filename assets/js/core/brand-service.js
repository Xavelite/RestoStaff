/* restogogo brand and color helpers. Product branding is global and fixed. */
function colorForPosition(p){return defaultPositionPalette[Math.max(0,positionIndex(p))%defaultPositionPalette.length];}
function hexToRgb(hex){let h=String(hex||'#999').replace('#',''); if(h.length===3)h=h.split('').map(x=>x+x).join(''); const n=parseInt(h,16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255};}
function rgba(hex,a){const c=hexToRgb(hex); return `rgba(${c.r},${c.g},${c.b},${a})`;}
function positionStyle(p){const c=colorForPosition(p); return `--pos-color:${c};--pos-bg:${c};--pos-border:${rgba(c,.72)};`;}
function styleAttr(css){return css?` style="${css}"`:'';}
function positionClass(position=''){const p=String(position).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); if(p.includes('maitre')||p.includes('manager'))return 'pos-maitre'; if(p.includes('chef'))return 'pos-chef'; if(p.includes('barman')||p.includes('barmaid'))return 'pos-barman'; if(p.includes('extra')||p.includes('student')||p.includes('flexi'))return 'pos-extra'; return 'pos-other';}

function applyAppTheme(){document.body?.classList.add('theme-modern');}
function applyProductBrand(){
  applyAppTheme();
  const restaurantNameEl=$('loginRestaurantName');
  const workspaceBadgeEl=$('loginWorkspaceBadge');
  if(restaurantNameEl)restaurantNameEl.textContent='Welcome back';
  if(workspaceBadgeEl)workspaceBadgeEl.textContent='Sign in to continue to your workspace.';
}
