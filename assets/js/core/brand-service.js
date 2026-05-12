/* restogogo brand styling helpers. */
function colorForPosition(p){return data.positionColors?.[cleanPositionName(p)]||defaultPositionPalette[Math.max(0,positionIndex(p))%defaultPositionPalette.length];}
function colorForZone(z){return data.zoneColors?.[z]||defaultZonePalette[Math.abs(String(z||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0))%defaultZonePalette.length];}
function hexToRgb(hex){let h=String(hex||'#999').replace('#',''); if(h.length===3)h=h.split('').map(x=>x+x).join(''); const n=parseInt(h,16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255};}
function rgba(hex,a){const c=hexToRgb(hex); return `rgba(${c.r},${c.g},${c.b},${a})`;}
function positionStyle(p){const c=colorForPosition(p); return `--pos-color:${c};--pos-bg:${c};--pos-border:${rgba(c,.72)};`;}
function zoneStyle(z){return `--zone-accent:${colorForZone(z)};`;}
function styleAttr(css){return css?` style="${css}"`:'';}
function positionClass(position=''){const p=String(position).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); if(p.includes('maitre')||p.includes('manager'))return 'pos-maitre'; if(p.includes('chef'))return 'pos-chef'; if(p.includes('barman')||p.includes('barmaid'))return 'pos-barman'; if(p.includes('extra')||p.includes('student')||p.includes('flexi'))return 'pos-extra'; return 'pos-other';}

function applyAppTheme(){document.body?.classList.add('theme-modern');}
function applyRestaurantBrand(){
  if(!data)return;
  const accent=restaurantAccent();
  document.documentElement.style.setProperty('--rst-ui-accent',accent);
  document.documentElement.style.setProperty('--rst-ui-accent-dark',darkenHex(accent,.22));
  applyAppTheme();
  const explicitLogo=String(data.restaurant?.logoUrl||'').trim();
  const logo=explicitLogo;
  const initial=(restaurantName().charAt(0)||'R').toUpperCase();
  const logoEl=$('brandLogo');
  const initialEl=$('brandRestaurantInitial');
  const eyebrowEl=$('brandEyebrow');
  const restaurantNameEl=$('loginRestaurantName');
  const workspaceBadgeEl=$('loginWorkspaceBadge');
  if(logoEl){
    logoEl.style.display=logo?'block':'none';
    if(logo){logoEl.src=logo;logoEl.alt=restaurantName();}
    logoEl.closest('.restaurant-brand-mark')?.classList.toggle('has-logo',!!logo);
  }
  if(initialEl){
    initialEl.style.display=logo?'none':'grid';
    initialEl.textContent=initial;
    initialEl.style.background=accent;
  }
  if(eyebrowEl)eyebrowEl.textContent='restogogo';
  if(restaurantNameEl)restaurantNameEl.textContent='Welcome back';
  if(workspaceBadgeEl)workspaceBadgeEl.textContent='Sign in to continue to your workspace.';
}
