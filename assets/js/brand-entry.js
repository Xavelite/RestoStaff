/*
 * restogogo login entry.
 * Owns the email/password form behavior, first-login invite panel and login
 * state signals. App login is email + password only; badge PIN remains a
 * badge-terminal credential.
 */
(function(){
  const $ = id => document.getElementById(id);
  const esc = window.RestogogoPrimitives.esc;

  const loginField = {
    mode: 'email',
    identityId: 'emailLoginName',
    secretId: 'emailLoginPassword',
    helpId: 'emailLoginHelp',
    buttonId: 'emailLoginBtn',
    defaultButtonLabel: 'Sign in',
  };

  function loginButtonHtml(label='Sign in'){
    return `<span>${esc(label)}</span><span class="brand-login-arrow" aria-hidden="true">&rarr;</span>`;
  }

  function getLoginContext(){
    const identityEl = $(loginField.identityId);
    const secretEl = $(loginField.secretId);
    const helpEl = $(loginField.helpId);
    const buttonEl = $(loginField.buttonId);
    return {
      mode: loginField.mode,
      identityEl,
      secretEl,
      helpEl,
      buttonEl,
      workspaceId: '',
      identity: String(identityEl?.value || '').trim(),
      secret: String(secretEl?.value || '').trim(),
    };
  }

  function clearLoginMessages(){
    const help = $(loginField.helpId);
    if(help){
      help.textContent = '';
      help.classList.remove('error');
    }
  }

  function setAcceptInviteError(message=''){
    const help = $('acceptInviteHelp');
    if(help){
      help.textContent = message;
      help.classList.toggle('error', !!message);
    }
  }

  function showAcceptInvitePanel(onSubmit){
    const panel = $('acceptInvitePanel');
    if(!panel)return;
    $('loginFormEmail')?.classList.add('is-hidden');
    panel.classList.remove('is-hidden');
    setAcceptInviteError('');
    ['acceptPassword','acceptPasswordConfirm','acceptPin','acceptPinConfirm'].forEach(id=>{const el=$(id); if(el)el.value='';});
    const btn = $('acceptInviteBtn');
    if(btn){
      btn.disabled = false;
      btn.onclick = async()=>{
        const password = String($('acceptPassword')?.value || '');
        const passwordConfirm = String($('acceptPasswordConfirm')?.value || '');
        const pin = String($('acceptPin')?.value || '').trim();
        const pinConfirm = String($('acceptPinConfirm')?.value || '').trim();
        if(password.length < 6)return setAcceptInviteError('Choose a password with at least 6 characters.');
        if(password !== passwordConfirm)return setAcceptInviteError('The password confirmation does not match.');
        if(!/^\d{4}$/.test(pin))return setAcceptInviteError('Choose a 4-digit badge PIN.');
        if(pin !== pinConfirm)return setAcceptInviteError('The PIN confirmation does not match.');
        btn.disabled = true;
        try{ await onSubmit?.({password, pin}); }
        catch(error){ btn.disabled = false; setAcceptInviteError(error?.message || 'Could not finish setup.'); }
      };
    }
    setTimeout(()=>$('acceptPassword')?.focus?.(), 20);
  }

  function hideAcceptInvitePanel(){
    $('acceptInvitePanel')?.classList.add('is-hidden');
    $('loginFormEmail')?.classList.remove('is-hidden');
  }

  function bindOnboardingTrigger(){
    const btn = $('openOnboardingBtn');
    if(!btn) return;
    btn.addEventListener('click', () => {
      window.Restogogo?.onboarding?.show?.();
    });
  }

  function resetLoginState(){
    const panel = $('brandLoginPanel');
    if(panel) panel.classList.remove('is-error','is-success');
    const button = $(loginField.buttonId);
    if(button){
      button.disabled = false;
      button.classList.remove('is-loading');
      button.innerHTML = loginButtonHtml(loginField.defaultButtonLabel);
    }
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
    if((msg.includes('wrong') || msg.includes('password')) && ctx.secretEl){
      ctx.secretEl.value = '';
    }
    const target = msg.includes('email') ? ctx.identityEl : ctx.secretEl || ctx.identityEl;
    setTimeout(() => target?.focus?.(), 20);
  }

  function signalLoginSuccess(){
    const panel = $('brandLoginPanel');
    const ctx = getLoginContext();
    if(panel) panel.classList.add('is-success');
    if(ctx.buttonEl){
      ctx.buttonEl.disabled = true;
      ctx.buttonEl.classList.add('is-loading');
      ctx.buttonEl.innerHTML = loginButtonHtml('Signing in...');
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
  bindOnboardingTrigger();

  window.Restogogo = window.Restogogo || {};
  window.Restogogo.brandEntry = Object.freeze({
    resetLoginState,
    showAcceptInvitePanel,
    hideAcceptInvitePanel,
    signalLoginError,
    signalLoginSuccess,
    shouldDelayEntry,
    bindPasswordToggle,
    getLoginContext,
    clearLoginMessages,
  });
})();
