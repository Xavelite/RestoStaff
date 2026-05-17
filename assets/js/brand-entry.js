/*
 * restogogo brand entry
 */

(function(){
  const $ = id => document.getElementById(id);
  const esc = (value='') => String(value).replace(/[&<>\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));

  const modules = [
    {title:'Planning',subtitle:'Build schedules',color:'#6e83ff',glow:'rgba(84,103,255,.22)',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="10" width="32" height="28" rx="6"/><path d="M15 8v7M33 8v7M8 18h32"/><rect class="fill" x="15" y="22" width="6" height="6" rx="2" opacity=".42"/><rect class="fill" x="23" y="22" width="6" height="6" rx="2"/><rect class="fill" x="31" y="22" width="6" height="6" rx="2" opacity=".3"/><rect class="fill" x="15" y="30" width="6" height="6" rx="2"/><path d="M24 33l3 3 7-8"/></svg>`},
    {title:'Actuals',subtitle:'Review real hours',color:'#54d1b4',glow:'rgba(84,209,180,.18)',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="15"/><path d="M24 16v9l6 5"/><path d="M24 9v2M24 37v2M39 24h-2M11 24H9"/></svg>`},
    {title:'Badge Terminal',subtitle:'Tablet clock-in',color:'#58d28a',glow:'rgba(88,210,138,.18)',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><rect x="10" y="8" width="28" height="32" rx="7"/><path d="M18 17h12M18 24h12M18 31h7"/><circle class="fill" cx="33" cy="33" r="5"/></svg>`},
    {title:'Team',subtitle:'Employees & contracts',color:'#8f74ff',glow:'rgba(143,116,255,.18)',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="18" cy="18" r="6"/><circle cx="31" cy="20" r="5" opacity=".7"/><path d="M8 36c1.6-5.4 5.8-8 10-8s8.4 2.6 10 8"/><path d="M26 36c1.1-3.8 4-5.8 7-5.8 2.4 0 4.8 1.1 6 3.2"/></svg>`},
    {title:'Restaurant',subtitle:'Zones & setup',color:'#a7b3c5',glow:'rgba(167,179,197,.17)',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="6"/><path d="M24 10v5M24 33v5M38 24h-5M15 24h-5M33.9 14.1l-3.5 3.5M17.6 30.4l-3.5 3.5M33.9 33.9l-3.5-3.5M17.6 17.6l-3.5-3.5"/></svg>`}
  ];

  const pages = [modules];
  let activePage = 0;
  let switchTimer = null;

  function renderModulePage(grid, dots){
    const pageModules = pages[activePage] || pages[0];

    grid.innerHTML = pageModules.map(mod => (
      `<article class="brand-module-card rs-module-card" style="--tile-color:${esc(mod.color)};--tile-glow:${esc(mod.glow)}">` +
        `<span class="brand-module-art rs-module-card__art" aria-hidden="true">${mod.icon}</span>` +
        `<span class="brand-module-copy rs-module-card__copy"><b>${esc(mod.title)}</b><small>${esc(mod.subtitle)}</small></span>` +
      `</article>`
    )).join('');

    if(dots){
      dots.innerHTML = pages.map((_, index) => (
        `<button class="brand-module-dot ${index===activePage?'active':''}" type="button" aria-label="Show module preview ${index+1}" data-module-page="${index}"></button>`
      )).join('');
      dots.querySelectorAll('[data-module-page]').forEach(button => {
        button.addEventListener('click', () => renderEntryModules(Number(button.dataset.modulePage)));
      });
    }
  }

  function renderEntryModules(pageIndex=activePage){
    const grid = $('entryModuleGrid');
    const dots = $('moduleDots');
    if(!grid) return;

    const nextPage = Math.max(0, Math.min(pages.length - 1, Number(pageIndex) || 0));
    const panel = grid.closest('.brand-module-panel');
    const changed = nextPage !== activePage && grid.children.length > 0;

    clearTimeout(switchTimer);

    if(!changed){
      activePage = nextPage;
      renderModulePage(grid, dots);
      return;
    }

    activePage = nextPage;
    panel?.classList.add('is-switching');
    switchTimer = setTimeout(() => {
      renderModulePage(grid, dots);
      requestAnimationFrame(() => panel?.classList.remove('is-switching'));
    }, 120);
  }

  function pulse(el){
    if(!el) return;
    el.classList.remove('is-shaking');
    void el.offsetWidth;
    el.classList.add('is-shaking');
    setTimeout(() => el.classList.remove('is-shaking'), 420);
  }

  function resetLoginState(){
    const panel = $('brandLoginPanel');
    const button = $('enterBtn');
    if(panel) panel.classList.remove('is-error','is-success','is-shaking');
    if(button){
      button.disabled = false;
      button.classList.remove('is-loading');
      button.textContent = 'Login';
    }
  }

  function signalLoginError(message=''){
    const panel = $('brandLoginPanel');
    const pin = $('accessPin');
    const identity = $('identityLoginName');

    resetLoginState();

    if(panel){
      panel.classList.add('is-error');
      pulse(panel);
      setTimeout(() => panel.classList.remove('is-error'), 1400);
    }

    const msg = String(message || '').toLowerCase();
    if(msg.includes('wrong') && pin) pin.value = '';
    const target = msg.includes('name') ? identity : pin || identity;
    setTimeout(() => target?.focus?.(), 20);
  }

  function signalLoginSuccess(){
    const panel = $('brandLoginPanel');
    const button = $('enterBtn');
    if(panel) panel.classList.add('is-success');
    if(button){
      button.disabled = true;
      button.classList.add('is-loading');
      button.textContent = 'Logging in…';
    }
  }

  function shouldDelayEntry(){
    return !!document.querySelector('#login.brand-page[style*="grid"], #login.brand-page');
  }


  const brandEntryApi = {
    renderEntryModules,
    resetLoginState,
    signalLoginError,
    signalLoginSuccess,
    shouldDelayEntry
  };

  window.Restogogo = window.Restogogo || {};
  window.Restogogo.brandEntry = brandEntryApi;
})();
