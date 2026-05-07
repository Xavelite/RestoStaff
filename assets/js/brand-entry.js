/*
 * RestoStaff brand entry helpers — v197
 * -------------------------------------
 * Premium, isolated helpers for the private/dev access and restaurant login page.
 * Operational app logic remains in app.js while modules are split safely over time.
 */
(function(){
  const $ = id => document.getElementById(id);
  const esc = (value='') => String(value).replace(/[&<>\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));

  const modules = [
    {title:'Planning',subtitle:'Build schedules',className:'module-planning',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="10" width="32" height="28" rx="6"/><path d="M15 8v7M33 8v7M8 18h32"/><rect class="fill" x="15" y="22" width="6" height="6" rx="2" opacity=".42"/><rect class="fill" x="23" y="22" width="6" height="6" rx="2"/><rect class="fill" x="31" y="22" width="6" height="6" rx="2" opacity=".3"/><rect class="fill" x="15" y="30" width="6" height="6" rx="2"/><path d="M24 33l3 3 7-8"/></svg>`},
    {title:'Time Clock',subtitle:'Track time easily',className:'module-clock',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="15"/><path d="M24 16v9l6 5"/><path d="M24 9v2M24 37v2M39 24h-2M11 24H9"/></svg>`},
    {title:'Costs',subtitle:'Control expenses',className:'module-costs',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M10 35V22"/><path d="M19 35V16"/><path d="M28 35V25"/><path d="M37 35V12"/><circle cx="36" cy="32" r="6"/><path d="M36 29v6M33 32h6"/></svg>`},
    {title:'Daily Close',subtitle:'Cash & payments',className:'module-close',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="13" width="30" height="22" rx="6"/><path d="M15 20h18M15 27h12"/><rect class="fill" x="29" y="24" width="6" height="7" rx="2"/></svg>`},
    {title:'Inventory',subtitle:'Manage stock',className:'module-inventory',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M13 16 24 10l11 6v16l-11 6-11-6V16Z"/><path d="M13 16l11 6 11-6M24 22v16"/><path d="M31 31l3 3 6-7"/></svg>`},
    {title:'Team / HR',subtitle:'Manage your team',className:'module-team',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="18" cy="18" r="6"/><circle cx="31" cy="20" r="5" opacity=".7"/><path d="M8 36c1.6-5.4 5.8-8 10-8s8.4 2.6 10 8"/><path d="M26 36c1.1-3.8 4-5.8 7-5.8 2.4 0 4.8 1.1 6 3.2"/></svg>`},
    {title:'Forecast',subtitle:'Covers & service',className:'module-forecast',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M10 34V18"/><path d="M19 34V22"/><path d="M28 34V15"/><path d="M37 34V24"/><path d="M11 29c4-4 8-8 13-8s7 2 11 2 6-2 9-5"/></svg>`},
    {title:'Exports',subtitle:'Reports & files',className:'module-exports',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M16 10h11l7 7v21H16z"/><path d="M27 10v8h7"/><path d="M24 24v10"/><path d="M20 30l4 4 4-4"/></svg>`},
    {title:'Setup',subtitle:'Restaurant config',className:'module-setup',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="6"/><path d="M24 10v5M24 33v5M38 24h-5M15 24h-5M33.9 14.1l-3.5 3.5M17.6 30.4l-3.5 3.5M33.9 33.9l-3.5-3.5M17.6 17.6l-3.5-3.5"/></svg>`}
  ];

  const pages = [
    modules.slice(0, 6),
    modules.slice(3, 9)
  ];
  let activePage = 0;
  let switchTimer = null;

  function renderModulePage(grid, dots){
    const pageModules = pages[activePage] || pages[0];

    grid.innerHTML = pageModules.map((mod, index) => (
      `<article class="brand-module-card ${mod.className}" style="--brand-card-index:${index}">` +
        `<span class="brand-module-art" aria-hidden="true">${mod.icon}</span>` +
        `<span class="brand-module-copy"><b>${esc(mod.title)}</b><small>${esc(mod.subtitle)}</small></span>` +
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

  function signalDevGateError(){
    pulse(document.querySelector('.dev-gate-card'));
  }

  window.RestoStaffBrandEntry = {
    renderEntryModules,
    resetLoginState,
    signalLoginError,
    signalLoginSuccess,
    shouldDelayEntry,
    signalDevGateError
  };
  window.renderEntryModules = renderEntryModules;
})();
