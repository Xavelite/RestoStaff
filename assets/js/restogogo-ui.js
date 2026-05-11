/*
 * restogogo shared UI helpers
 * Branded toast, alert, confirm and prompt helpers for v2 pages.
 */

(function(){
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let toastTimer=null;
  let activeResolve=null;

  function ensureModal(){
    let modal=document.getElementById('rsModal');
    if(modal)return modal;
    modal=document.createElement('dialog');
    modal.id='rsModal';
    modal.className='rs-modal';
    modal.innerHTML='<form method="dialog" class="rs-modal-card"><div class="rs-modal-icon" aria-hidden="true"></div><div class="rs-modal-copy"><h2></h2><p></p><label class="rs-modal-field"><span></span><input /></label></div><div class="rs-modal-actions"><button type="button" class="rs-modal-btn secondary" data-rs-modal-cancel>Cancel</button><button type="submit" class="rs-modal-btn primary" data-rs-modal-confirm>Confirm</button></div></form>';
    document.body.appendChild(modal);
    modal.addEventListener('click',event=>{
      if(event.target===modal)closeModal(null);
    });
    modal.addEventListener('cancel',event=>{
      event.preventDefault();
      closeModal(null);
    });
    modal.querySelector('form')?.addEventListener('submit',event=>{
      event.preventDefault();
      const mode=modal.dataset.mode||'alert';
      const input=modal.querySelector('.rs-modal-field input');
      closeModal(mode==='prompt'?(input?.value??''):true);
    });
    modal.querySelector('[data-rs-modal-cancel]')?.addEventListener('click',()=>closeModal(null));
    return modal;
  }

  function closeModal(value){
    const modal=document.getElementById('rsModal');
    const resolve=activeResolve;
    activeResolve=null;
    if(modal?.open)modal.close();
    if(resolve)resolve(value);
  }

  function openModal(options={}){
    const modal=ensureModal();
    const card=modal.querySelector('.rs-modal-card');
    const icon=modal.querySelector('.rs-modal-icon');
    const title=modal.querySelector('h2');
    const body=modal.querySelector('p');
    const field=modal.querySelector('.rs-modal-field');
    const fieldLabel=field?.querySelector('span');
    const input=field?.querySelector('input');
    const cancel=modal.querySelector('[data-rs-modal-cancel]');
    const confirm=modal.querySelector('[data-rs-modal-confirm]');
    const mode=options.mode||'alert';
    const tone=options.tone||'neutral';

    if(activeResolve)closeModal(null);
    card.dataset.tone=tone;
    card.dataset.mode=mode;
    modal.dataset.mode=mode;
    icon.textContent=options.icon || (tone==='danger'?'!':tone==='success'?'✓':'');
    title.textContent=options.title||'restogogo';
    body.textContent=options.message||'';
    field.hidden=mode!=='prompt';
    if(input){
      input.value=options.defaultValue||'';
      input.placeholder=options.placeholder||'';
      input.setAttribute('aria-label',options.label||options.title||'Value');
    }
    if(fieldLabel)fieldLabel.textContent=options.label||'';
    cancel.hidden=mode==='alert';
    cancel.textContent=options.cancelText||'Cancel';
    confirm.textContent=options.confirmText||(mode==='alert'?'OK':'Confirm');

    return new Promise(resolve=>{
      activeResolve=resolve;
      modal.showModal();
      requestAnimationFrame(()=>modal.classList.add('is-visible'));
      setTimeout(()=>mode==='prompt'?input?.focus?.():confirm?.focus?.(),40);
    });
  }

  function toast(message,options={}){
    const tone=options.tone||'success';
    const centered=options.centered!==false;
    const timeout=Number(options.timeout||2200);
    document.querySelectorAll('.rs-toast').forEach(node=>node.remove());
    if(toastTimer)clearTimeout(toastTimer);
    const toastEl=document.createElement('div');
    toastEl.className=`rs-toast ${centered?'is-centered':'is-corner'} is-${tone}`;
    toastEl.setAttribute('role','status');
    toastEl.setAttribute('aria-live','polite');
    const icon=options.icon || (tone==='danger'?'↺':tone==='warning'?'!':'✓');
    toastEl.innerHTML=`<span class="rs-toast__icon">${escapeHtml(icon)}</span><span>${escapeHtml(message)}</span>`;
    document.body.appendChild(toastEl);
    requestAnimationFrame(()=>toastEl.classList.add('is-visible'));
    toastTimer=setTimeout(()=>{
      toastEl.classList.remove('is-visible');
      setTimeout(()=>toastEl.remove(),240);
    },timeout);
  }

  window.RestogogoUI={
    toast,
    alert: options => openModal(Object.assign({mode:'alert',confirmText:'OK'}, typeof options==='string'?{message:options}:options)),
    confirm: options => openModal(Object.assign({mode:'confirm'}, typeof options==='string'?{message:options}:options)).then(Boolean),
    prompt: options => openModal(Object.assign({mode:'prompt'}, typeof options==='string'?{message:options}:options))
  };
})();
