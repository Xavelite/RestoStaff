/* restogogo pilot guide.
 * Owns the private pilot help dialog shown from login and app shell.
 */
(function(){
  const R = window.Restogogo || (window.Restogogo = {});

  function guideRows(){
    return [
      {label:'1. Prepare next week',body:'Go to Planning, build or copy the schedule, then publish when ready.'},
      {label:'2. Open the badge terminal',body:'Go to Actuals and open Badge terminal in a separate window for employees.'},
      {label:'3. Employees badge',body:'Employee taps their name, enters PIN, and the terminal records check-in or check-out with photo proof when camera permission is available.'},
      {label:'4. Manager reviews Actuals',body:'Actuals shows planned employees and employees who badged. Review missing badges, open check-outs, unplanned badges and variances.'},
      {label:'5. Export the week',body:'Use Actuals actions to export payroll prep, weekly summary, details or anomalies.'}
    ];
  }

  function show(){
    let dialog=$('pilotGuideDialog');
    if(!dialog){
      dialog=document.createElement('dialog');
      dialog.id='pilotGuideDialog';
      dialog.className='pilot-guide-dialog';
      document.body.appendChild(dialog);
      dialog.addEventListener('click',event=>{
        if(event.target===dialog || event.target.closest('[data-pilot-guide-close]'))dialog.close();
        if(event.target.closest('[data-pilot-open-terminal]'))R.shell?.openBadgeTerminal?.();
      });
      dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();});
    }
    dialog.innerHTML=`<section class="pilot-guide-card">
      <header class="pilot-guide-head">
        <span class="pilot-guide-icon" aria-hidden="true">${R.icons.svg('check')}</span>
        <div><p>Private pilot</p><h2>Testing guide</h2><small>${esc(restaurantName())} · ${esc(weekDisplayRange())}</small></div>
      </header>
      <div class="pilot-guide-grid">
        ${guideRows().map(row=>`<article><strong>${esc(row.label)}</strong><span>${esc(row.body)}</span></article>`).join('')}
      </div>
      ${R.config?.pilotMode ? `<aside class="pilot-guide-note"><strong>Private pilot</strong><span>Please do not redistribute access, screenshots, files, or rebuild/copy the concept/design without permission.</span></aside>` : ''}
      <footer class="pilot-guide-actions">
        <button type="button" class="rs-modal-btn is-secondary" data-pilot-open-terminal>Open badge terminal</button>
        <button type="button" class="rs-modal-btn is-primary" data-pilot-guide-close>Close</button>
      </footer>
    </section>`;
    if(dialog.open)dialog.close();
    dialog.showModal();
  }

  R.pilotGuide = {show};
})();
