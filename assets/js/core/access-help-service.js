/* restogogo access help.
 * Owns login/access recovery guidance. This is intentionally separate from the
 * private pilot testing guide: forgotten passwords/PINs are an access lifecycle
 * concern, not a testing tutorial.
 */
(function(){
  const R = window.Restogogo || (window.Restogogo = {});
  const $ = id => document.getElementById(id);
  const esc = window.RestogogoPrimitives.esc;

  function selectedRestaurantName(){
    const select = $('emailLoginRestaurant') || $('quickLoginRestaurant');
    const option = select?.selectedOptions?.[0];
    return option?.textContent?.trim?.() || R.workspace?.current?.()?.restaurantName || 'your restaurant';
  }

  function show(){
    let dialog = $('accessHelpDialog');
    if(!dialog){
      dialog = document.createElement('dialog');
      dialog.id = 'accessHelpDialog';
      dialog.className = 'pilot-guide-dialog access-help-dialog';
      document.body.appendChild(dialog);
      dialog.addEventListener('click', event => {
        if(event.target === dialog || event.target.closest('[data-access-help-close]'))dialog.close();
        const quickTab = event.target.closest('[data-access-help-quick]');
        if(quickTab){
          dialog.close();
          R.brandEntry?.switchLoginRole?.('quick');
          setTimeout(() => $('quickLoginName')?.focus?.(), 20);
        }
      });
      dialog.addEventListener('cancel', event => {event.preventDefault(); dialog.close();});
    }

    dialog.innerHTML = `<section class="pilot-guide-card access-help-card">
      <header class="pilot-guide-head access-help-head">
        <span class="pilot-guide-icon" aria-hidden="true">${R.icons?.svg?.('alert') || '!'}</span>
        <div><p>Access help</p><h2>Recover access</h2><small>${esc(selectedRestaurantName())}</small></div>
      </header>
      <div class="pilot-guide-grid access-help-grid">
        <article><strong>Owner or manager password</strong><span>Use the real login email. Password reset emails will be handled by the production auth flow. For now, ask the project owner/admin to reset the Supabase Auth password.</span></article>
        <article><strong>Employee quick PIN</strong><span>Use the restaurant, quick login name and 4-digit PIN. If the PIN is forgotten, the manager resets it from Team → employee profile → Temporary PIN / Reset PIN.</span></article>
        <article><strong>First quick login</strong><span>A temporary PIN is only for first use. The employee must choose a personal 4-digit PIN before entering the app.</span></article>
        <article><strong>Badge terminal</strong><span>The badge terminal uses the same quick PIN as employee login. Resetting the employee PIN also resets badge access.</span></article>
      </div>
      <aside class="pilot-guide-note access-help-note"><strong>Current build</strong><span>Email invitations and self-service password reset are planned for the production auth phase. PIN reset is already manager-owned in Team.</span></aside>
      <footer class="pilot-guide-actions">
        <button type="button" class="rs-modal-btn is-secondary" data-access-help-quick>Try quick login</button>
        <button type="button" class="rs-modal-btn is-primary" data-access-help-close>Close</button>
      </footer>
    </section>`;
    if(dialog.open)dialog.close();
    dialog.showModal();
  }

  R.accessHelp = Object.freeze({show});
})();
