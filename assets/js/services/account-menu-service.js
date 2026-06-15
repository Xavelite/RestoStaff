/* restogogo account menu.
 * The top-right user button opens a dropdown (My account / Log out) instead of
 * logging out on click. "My account" shows profile details and lets the signed-in
 * user change their own password and badge PIN through the authenticated session
 * (updatePassword / setOwnPin). Mirrors the notification dropdown + rs-detail modal.
 */
(function(){
  const R = window.Restogogo = window.Restogogo || {};
  R.services = R.services || {};

  let menuOpen = false;
  let dialog = null;
  let bound = false;

  function icon(name){return R.icons?.svg?.(name) || '';}
  function auth(){return window.RestogogoAuthService;}
  function pill(){return document.getElementById('userPill');}
  function panel(){return document.getElementById('accountMenu');}
  function toast(message, options){R.ui?.toast?.(message, options);}

  function currentName(){return pill()?.textContent?.trim() || 'Account';}
  function roleLabel(){
    const role = String(R.state?.session?.role || '').toLowerCase();
    return role === 'owner' ? 'Owner' : role === 'manager' ? 'Manager' : 'Employee';
  }
  function currentEmail(){return auth()?.getUser?.()?.email || '';}
  function workspaceName(){
    return R.workspace?.current?.()?.restaurantName
      || (typeof restaurantName === 'function' ? restaurantName() : '')
      || '—';
  }

  /* ---- dropdown menu ---- */
  function menuHtml(){
    return `
      <button type="button" class="account-menu__item" role="menuitem" tabindex="-1" data-account-action="my-account">
        <span class="account-menu__icon" aria-hidden="true">${icon('user')}</span><span>My account</span>
      </button>
      <div class="account-menu__divider" role="separator"></div>
      <button type="button" class="account-menu__item is-danger" role="menuitem" tabindex="-1" data-account-action="logout">
        <span class="account-menu__icon" aria-hidden="true">${icon('close')}</span><span>Log out</span>
      </button>`;
  }

  function renderMenu(){
    const p = panel();
    if(!p)return;
    p.classList.toggle('open', menuOpen);
    pill()?.setAttribute('aria-expanded', String(menuOpen));
    p.innerHTML = menuOpen ? menuHtml() : '';
  }
  function openMenu(){menuOpen = true; renderMenu(); panel()?.querySelector('[role="menuitem"]')?.focus?.();}
  function closeMenu(focusPill){if(!menuOpen)return; menuOpen = false; renderMenu(); if(focusPill)pill()?.focus?.();}
  function toggleMenu(){menuOpen ? closeMenu() : openMenu();}

  function moveFocus(delta){
    const items = Array.from(panel()?.querySelectorAll('[role="menuitem"]') || []);
    if(!items.length)return;
    const current = items.indexOf(document.activeElement);
    const next = (current + delta + items.length) % items.length;
    items[next]?.focus?.();
  }

  /* ---- My account modal ---- */
  function profileRow(label, value){
    return `<article class="rs-detail-row is-neutral">
      <div class="rs-detail-row__copy"><strong>${esc(label)}</strong></div>
      <b>${esc(value || '—')}</b>
    </article>`;
  }

  function field(label, id, attrs){
    return `<label class="rs-field"><span>${esc(label)}</span><input id="${esc(id)}" ${attrs}></label>`;
  }

  function modalHtml(){
    const credentials = auth()?.isEnabled?.() ? `
      <section class="rs-detail-section">
        <header><h3>Change password</h3></header>
        <div class="rs-detail-list account-form" data-account-form="password">
          ${field('New password', 'accPwdNew', 'type="password" autocomplete="new-password" maxlength="64" placeholder="At least 6 characters"')}
          ${field('Confirm password', 'accPwdConfirm', 'type="password" autocomplete="new-password" maxlength="64" placeholder="Repeat password"')}
          <button type="button" class="rs-modal-btn primary" data-account-action="save-password">Update password</button>
        </div>
      </section>
      <section class="rs-detail-section">
        <header><h3>Change badge PIN</h3><small>Used at the badge terminal</small></header>
        <div class="rs-detail-list account-form" data-account-form="pin">
          ${field('New 4-digit PIN', 'accPinNew', 'type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="4 digits"')}
          ${field('Confirm PIN', 'accPinConfirm', 'type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="Repeat PIN"')}
          <button type="button" class="rs-modal-btn primary" data-account-action="save-pin">Update PIN</button>
        </div>
      </section>` : '';

    return `<section class="rs-detail-card account-dialog__card" data-tone="neutral">
      <header class="rs-detail-head">
        <span class="rs-detail-icon" aria-hidden="true">${icon('user')}</span>
        <div><span>My account</span><h2>${esc(currentName())}</h2><p>${esc(roleLabel())}</p></div>
        <button type="button" class="rs-detail-close" data-account-close aria-label="Close">${icon('close')}</button>
      </header>
      <div class="rs-detail-body">
        <section class="rs-detail-section">
          <header><h3>Profile</h3></header>
          <div class="rs-detail-list">
            ${profileRow('Name', currentName())}
            ${profileRow('Role', roleLabel())}
            ${profileRow('Email', currentEmail())}
            ${profileRow('Restaurant', workspaceName())}
          </div>
        </section>
        ${credentials}
      </div>
      <footer class="rs-detail-footer">
        <button type="button" class="rs-modal-btn" data-account-close>Close</button>
      </footer>
    </section>`;
  }

  function ensureDialog(){
    if(dialog)return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'rs-detail-dialog account-dialog';
    document.body.appendChild(dialog);
    dialog.addEventListener('click', handleDialogClick);
    dialog.addEventListener('cancel', event=>{event.preventDefault(); closeDialog();});
    dialog.addEventListener('close', ()=>{dialog.innerHTML = '';});
    return dialog;
  }
  function openMyAccount(){
    closeMenu();
    ensureDialog();
    if(dialog.open)dialog.close();
    dialog.innerHTML = modalHtml();
    dialog.showModal();
  }
  function closeDialog(){if(dialog?.open)dialog.close();}

  async function savePassword(button){
    const next = String(document.getElementById('accPwdNew')?.value || '');
    const confirm = String(document.getElementById('accPwdConfirm')?.value || '');
    if(next.length < 6)return toast('Password must be at least 6 characters.', {tone:'warning', icon:'alert', centered:true});
    if(next !== confirm)return toast('The password confirmation does not match.', {tone:'warning', icon:'alert', centered:true});
    if(button)button.disabled = true;
    try{
      await auth().updatePassword(next);
      toast('Password updated.', {tone:'success', icon:'check', centered:true});
      ['accPwdNew','accPwdConfirm'].forEach(id=>{const el=document.getElementById(id); if(el)el.value='';});
    }catch(error){
      toast(error?.message || 'Could not update your password.', {tone:'danger', icon:'alert', centered:true, timeout:3600});
    }finally{
      if(button)button.disabled = false;
    }
  }

  async function savePin(button){
    const next = String(document.getElementById('accPinNew')?.value || '').trim();
    const confirm = String(document.getElementById('accPinConfirm')?.value || '').trim();
    if(!/^\d{4}$/.test(next))return toast('Choose a 4-digit PIN.', {tone:'warning', icon:'alert', centered:true});
    if(next !== confirm)return toast('The PIN confirmation does not match.', {tone:'warning', icon:'alert', centered:true});
    if(button)button.disabled = true;
    try{
      await auth().setOwnPin(next);
      toast('Badge PIN updated.', {tone:'success', icon:'check', centered:true});
      ['accPinNew','accPinConfirm'].forEach(id=>{const el=document.getElementById(id); if(el)el.value='';});
    }catch(error){
      toast(error?.message || 'Could not update your PIN.', {tone:'danger', icon:'alert', centered:true, timeout:3600});
    }finally{
      if(button)button.disabled = false;
    }
  }

  function handleDialogClick(event){
    if(event.target === dialog || event.target.closest('[data-account-close]')){event.preventDefault(); closeDialog(); return;}
    const action = event.target.closest('[data-account-action]')?.dataset.accountAction;
    if(action === 'save-password'){event.preventDefault(); void savePassword(event.target.closest('button')); return;}
    if(action === 'save-pin'){event.preventDefault(); void savePin(event.target.closest('button'));}
  }

  function bind(){
    if(bound)return;
    bound = true;
    pill()?.addEventListener('click', event=>{event.stopPropagation(); toggleMenu();});
    pill()?.addEventListener('keydown', event=>{
      if(event.key === 'ArrowDown'){event.preventDefault(); openMenu();}
      else if(event.key === 'Escape')closeMenu(true);
    });
    panel()?.addEventListener('click', event=>{
      const action = event.target.closest('[data-account-action]')?.dataset.accountAction;
      if(action === 'my-account'){event.preventDefault(); openMyAccount();}
      else if(action === 'logout'){event.preventDefault(); closeMenu(); void R.auth?.signOut?.();}
    });
    panel()?.addEventListener('keydown', event=>{
      if(event.key === 'Escape'){event.preventDefault(); closeMenu(true);}
      else if(event.key === 'ArrowDown'){event.preventDefault(); moveFocus(1);}
      else if(event.key === 'ArrowUp'){event.preventDefault(); moveFocus(-1);}
    });
    document.addEventListener('click', event=>{if(!event.target.closest('.account-wrap'))closeMenu();});
  }

  R.services.accountMenu = Object.freeze({bind, openMyAccount, close:closeMenu});
})();
