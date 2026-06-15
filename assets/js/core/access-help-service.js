/* restogogo access help.
 * Owns login/access recovery guidance. This is intentionally separate from the
 * private pilot testing guide: forgotten passwords/PINs are an access lifecycle
 * concern, not a testing tutorial.
 */
(function(){
  const R = window.Restogogo || (window.Restogogo = {});
  const $ = id => document.getElementById(id);
  const esc = window.RestogogoPrimitives.esc;

  function show(){
    let dialog = $('accessHelpDialog');
    if(!dialog){
      dialog = document.createElement('dialog');
      dialog.id = 'accessHelpDialog';
      dialog.className = 'pilot-guide-dialog access-help-dialog';
      document.body.appendChild(dialog);
      dialog.addEventListener('click', event => {
        if(event.target === dialog || event.target.closest('[data-access-help-close]'))dialog.close();
      });
      dialog.addEventListener('cancel', event => {event.preventDefault(); dialog.close();});
    }

    dialog.innerHTML = `<section class="pilot-guide-card access-help-card">
      <header class="pilot-guide-head access-help-head">
        <span class="pilot-guide-icon" aria-hidden="true">${R.icons?.svg?.('alert') || '!'}</span>
        <div><p>Access help</p><h2>Recover access</h2><small>Email and password access</small></div>
      </header>
      <div class="pilot-guide-grid access-help-grid">
        <article><strong>Signing in</strong><span>App access is your email and password. If you forget your password, ask the project owner/admin to reset it (self-service password reset arrives with the production auth phase).</span></article>
        <article><strong>Joining the app</strong><span>Staff join by email invitation. Open the invite link from your inbox and set your own password and 4-digit badge PIN to finish joining your team.</span></article>
        <article><strong>Badge terminal PIN</strong><span>The 4-digit PIN is used at the badge terminal only, not to sign in. You set it when accepting your invite.</span></article>
        <article><strong>Not invited yet?</strong><span>Your owner or manager invites you from Team → employee profile → Invite to app, using your email address.</span></article>
      </div>
      <aside class="pilot-guide-note access-help-note"><strong>Current build</strong><span>Self-service password reset is planned for the production auth phase. App access is email + password; the PIN is badge-terminal only.</span></aside>
      <footer class="pilot-guide-actions">
        <button type="button" class="rs-modal-btn is-primary" data-access-help-close>Close</button>
      </footer>
    </section>`;
    if(dialog.open)dialog.close();
    dialog.showModal();
  }

  R.accessHelp = Object.freeze({show});
})();
