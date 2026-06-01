/*
 * restogogo premium login entry.
 * Handles login screen tabs (Real login / Quick login), password toggle,
 * entry module grid, and login state signals. Onboarding lives in onboarding.js.
 */

(function(){
  const $ = id => document.getElementById(id);
  const esc = window.RestogogoPrimitives.esc;

  const modules = [
    {title:'Planning',subtitle:'Build smarter schedules.',color:'#9b6dff',glow:'rgba(155,109,255,.20)',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="10" width="32" height="28" rx="6"/><path d="M15 8v7M33 8v7M8 18h32"/><path d="M17 29l5 5 10-11"/></svg>`},
    {title:'Actuals',subtitle:'Track real performance.',color:'#44d4ff',glow:'rgba(68,212,255,.18)',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="15"/><path d="M24 16v9l6 5"/></svg>`},
    {title:'Badge terminal',subtitle:'Clock in fast, secure time tracking.',color:'#52df83',glow:'rgba(82,223,131,.18)',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><rect x="10" y="12" width="28" height="24" rx="5"/><path d="M18 20h12M18 27h8"/><circle cx="34" cy="32" r="4"/></svg>`},
    {title:'Team',subtitle:'Manage your team.',color:'#a970ff',glow:'rgba(169,112,255,.18)',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="18" cy="18" r="6"/><circle cx="31" cy="20" r="5"/><path d="M8 36c1.6-5.4 5.8-8 10-8s8.4 2.6 10 8"/><path d="M26 36c1.1-3.8 4-5.8 7-5.8 2.4 0 4.8 1.1 6 3.2"/></svg>`},
    {title:'Restaurant',subtitle:'Configure zones and settings.',color:'#ffb14a',glow:'rgba(255,177,74,.18)',icon:`<svg class="brand-module-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M10 32h28"/><path d="M14 32a10 10 0 0 1 20 0"/><path d="M24 12v4"/><path d="M8 38h32"/></svg>`},
  ];

  const loginFields = {
    real: {
      mode: 'real',
      workspaceInputId: 'emailLoginRestaurant',
      identityId: 'emailLoginName',
      secretId: 'emailLoginPassword',
      helpId: 'emailLoginHelp',
      buttonId: 'emailLoginBtn',
      defaultButtonLabel: 'Sign in',
    },
    quick: {
      mode: 'quick',
      workspaceInputId: 'quickLoginRestaurant',
      identityId: 'quickLoginName',
      secretId: 'quickLoginPin',
      helpId: 'quickLoginHelp',
      buttonId: 'quickLoginBtn',
      defaultButtonLabel: 'Sign in',
    },
  };

  let activeMode = 'real'; // 'real' | 'quick'

  function loginButtonHtml(label='Sign in'){
    return `<span>${esc(label)}</span><span class="brand-login-arrow" aria-hidden="true">→</span>`;
  }

  function fieldSet(mode=activeMode){
    return loginFields[mode] || loginFields.real;
  }

  function getLoginContext(mode=activeMode){
    const fields = fieldSet(mode);
    const workspaceEl = $(fields.workspaceInputId);
    const identityEl = $(fields.identityId);
    const secretEl = $(fields.secretId);
    const helpEl = $(fields.helpId);
    const buttonEl = $(fields.buttonId);
    return {
      mode: fields.mode,
      workspaceEl,
      identityEl,
      secretEl,
      helpEl,
      buttonEl,
      workspaceId: workspaceEl?.value || '',
      identity: String(identityEl?.value || '').trim(),
      secret: String(secretEl?.value || '').trim(),
    };
  }

  function renderEntryModules(){
    const grid = $('entryModuleGrid');
    if(!grid) return;
    grid.innerHTML = modules.map(mod => (
      `<article class="brand-module-card" style="--tile-color:${esc(mod.color)};--tile-glow:${esc(mod.glow)}">` +
        `<span class="brand-module-art" aria-hidden="true">${mod.icon}</span>` +
        `<span class="brand-module-copy"><b>${esc(mod.title)}</b><small>${esc(mod.subtitle)}</small></span>` +
      `</article>`
    )).join('');
  }

  function clearLoginMessages(){
    Object.values(loginFields).forEach(fields => {
      const help = $(fields.helpId);
      if(help){
        help.textContent = '';
        help.classList.remove('error');
      }
    });
  }

  /* Keep both workspace text inputs in sync when switching tabs. */
  function syncWorkspaceInputs(sourceId){
    const emailInput = $('emailLoginRestaurant');
    const quickInput = $('quickLoginRestaurant');
    if(!emailInput || !quickInput) return;
    const value = $(sourceId)?.value || emailInput.value || quickInput.value || '';
    if(value){
      emailInput.value = value;
      quickInput.value = value;
    }
  }

  function switchLoginRole(mode){
    if(!loginFields[mode]) return;
    if(mode === activeMode) return;
    activeMode = mode;

    const realForm  = $('loginFormEmail');
    const quickForm = $('loginFormQuick');
    const tabs      = document.querySelectorAll('.brand-login-tab');

    tabs.forEach(tab => {
      const isActive = tab.dataset.loginRole === mode;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });

    if(mode === 'quick'){
      realForm?.classList.add('is-hidden');
      quickForm?.classList.remove('is-hidden');
      syncWorkspaceInputs('emailLoginRestaurant');
      setTimeout(() => $('quickLoginName')?.focus?.(), 20);
    } else {
      quickForm?.classList.add('is-hidden');
      realForm?.classList.remove('is-hidden');
      syncWorkspaceInputs('quickLoginRestaurant');
      setTimeout(() => $('emailLoginName')?.focus?.(), 20);
    }

    clearLoginMessages();
  }

  function bindLoginTabs(){
    document.querySelectorAll('.brand-login-tab').forEach(tab => {
      tab.addEventListener('click', () => switchLoginRole(tab.dataset.loginRole));
    });
  }

  function bindQuickLogin(){
    const btn = $('quickLoginBtn');
    if(!btn || btn.dataset.bound) return;
    btn.dataset.bound = 'true';
    const doLogin = () => {
      void window.Restogogo?.auth?.enterSelectedWorkspace?.({ mode: 'quick' });
    };
    btn.addEventListener('click', doLogin);
    $('quickLoginPin')?.addEventListener('keydown', e => { if(e.key === 'Enter') doLogin(); });
    $('quickLoginName')?.addEventListener('keydown', e => { if(e.key === 'Enter') doLogin(); });
  }


  function setPinChangeError(message=''){
    const help = $('pinChangeHelp');
    if(help){
      help.textContent = message;
      help.classList.toggle('error', !!message);
    }
  }

  function showPinChangePanel(onSubmit){
    const realForm = $('loginFormEmail');
    const quickForm = $('loginFormQuick');
    const panel = $('pinChangePanel');
    if(!panel)return;
    realForm?.classList.add('is-hidden');
    quickForm?.classList.add('is-hidden');
    panel.classList.remove('is-hidden');
    setPinChangeError('');
    ['pinChangeCurrent','pinChangeNew','pinChangeConfirm'].forEach(id=>{const el=$(id); if(el)el.value='';});
    const btn = $('confirmPinChangeBtn');
    if(btn){
      btn.disabled = false;
      btn.onclick = async()=>{
        const current = String($('pinChangeCurrent')?.value || '').trim();
        const next = String($('pinChangeNew')?.value || '').trim();
        const confirm = String($('pinChangeConfirm')?.value || '').trim();
        if(!/^\d{4}$/.test(current))return setPinChangeError('Enter your temporary 4-digit PIN.');
        if(!/^\d{4}$/.test(next))return setPinChangeError('Choose a new 4-digit PIN.');
        if(next !== confirm)return setPinChangeError('The new PIN confirmation does not match.');
        btn.disabled = true;
        try{ await onSubmit?.(current, next); }
        catch(error){ btn.disabled = false; setPinChangeError(error?.message || 'PIN change failed.'); }
      };
    }
    setTimeout(()=>$('pinChangeCurrent')?.focus?.(), 20);
  }

  function hidePinChangePanel(){
    $('pinChangePanel')?.classList.add('is-hidden');
  }

  function bindOnboardingTrigger(){
    const btn = $('openOnboardingBtn');
    if(!btn) return;
    btn.addEventListener('click', () => {
      window.Restogogo?.onboarding?.show?.();
    });
  }

  function resetLoginState(){
    hidePinChangePanel();
    const panel = $('brandLoginPanel');
    if(panel) panel.classList.remove('is-error','is-success');
    Object.values(loginFields).forEach(fields => {
      const button = $(fields.buttonId);
      if(button){
        button.disabled = false;
        button.classList.remove('is-loading');
        button.innerHTML = loginButtonHtml(fields.defaultButtonLabel);
      }
    });
  }

  function signalLoginError(message=''){
    const panel = $('brandLoginPanel');
    const ctx = getLoginContext();

    resetLoginState();
    clearLoginMessages();

    if(ctx.helpEl){
      ctx.helpEl.textContent = message;
      ctx.helpEl.classList.add('error');
    }

    if(panel){
      panel.classList.add('is-error');
      setTimeout(() => panel.classList.remove('is-error'), 1400);
    }

    const msg = String(message || '').toLowerCase();
    if((msg.includes('wrong') || msg.includes('password') || msg.includes('pin')) && ctx.secretEl){
      ctx.secretEl.value = '';
    }
    const target = msg.includes('name') || msg.includes('email') || msg.includes('staff') ? ctx.identityEl : ctx.secretEl || ctx.identityEl;
    setTimeout(() => target?.focus?.(), 20);
  }

  function signalLoginSuccess(){
    const panel = $('brandLoginPanel');
    const ctx = getLoginContext();
    if(panel) panel.classList.add('is-success');
    if(ctx.buttonEl){
      ctx.buttonEl.disabled = true;
      ctx.buttonEl.classList.add('is-loading');
      ctx.buttonEl.innerHTML = loginButtonHtml('Signing in…');
    }
  }

  function shouldDelayEntry(){
    const el = $('login');
    return !!el && getComputedStyle(el).display !== 'none';
  }

  function bindPasswordToggle(){
    const toggle = $('toggleLoginPassword');
    const input  = $('emailLoginPassword');
    if(!toggle || !input || toggle.dataset.bound) return;
    toggle.dataset.bound = 'true';
    toggle.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      toggle.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
      input.focus?.();
    });
  }

  bindPasswordToggle();
  bindLoginTabs();
  bindQuickLogin();
  bindOnboardingTrigger();

  window.Restogogo = window.Restogogo || {};
  window.Restogogo.brandEntry = Object.freeze({
    renderEntryModules,
    resetLoginState,
    showPinChangePanel,
    hidePinChangePanel,
    signalLoginError,
    signalLoginSuccess,
    shouldDelayEntry,
    bindPasswordToggle,
    switchLoginRole,
    getLoginContext,
    syncWorkspaceInputs,
    clearLoginMessages,
  });
})();
