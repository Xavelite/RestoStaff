/* Shared custom picklists for native select elements. */
(function(){
  const Restogogo = window.Restogogo = window.Restogogo || {};
  let active = null;
  let scheduled = false;
  let observerStarted = false;
  const esc = window.RestogogoPrimitives.esc;

  function variantFor(select){
    if(select.dataset.picklistVariant)return select.dataset.picklistVariant;
    if(select.closest('.rs-grid-toolbar__actions, .rs-grid-toolbar__center, .rs-grid-toolbar'))return 'toolbar';
    return 'field';
  }

  function shouldEnhance(select){
    return select instanceof HTMLSelectElement && !select.multiple && !select.closest('[data-no-picklist]');
  }

  function selectedOption(select){
    return select.options[select.selectedIndex] || select.options[0] || null;
  }

  function update(select){
    const api = select._rsPicklist;
    if(!api)return;
    const option = selectedOption(select);
    api.wrapper.className = `rs-picklist rs-picklist--${variantFor(select)}${select.disabled ? ' is-disabled' : ''}${active?.select===select ? ' is-open' : ''}`;
    api.button.disabled = !!select.disabled;
    api.button.querySelector('.rs-picklist-trigger-label').textContent = option ? option.textContent : '';
  }

  function enhance(select){
    if(!shouldEnhance(select))return;
    if(select._rsPicklist){ update(select); return; }

    const wrapper = document.createElement('span');
    wrapper.className = `rs-picklist rs-picklist--${variantFor(select)}`;
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    select.classList.add('rs-picklist-native');
    select.tabIndex = -1;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rs-picklist-trigger';
    button.setAttribute('aria-haspopup','listbox');
    button.setAttribute('aria-expanded','false');
    button.innerHTML = '<span class="rs-picklist-trigger-label"></span><span class="rs-picklist-caret" aria-hidden="true"></span>';
    wrapper.appendChild(button);

    select._rsPicklist = {wrapper, button};
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if(select.disabled)return;
      active?.select === select ? close() : open(select);
    });
    button.addEventListener('keydown', event => handleTriggerKeydown(event, select));
    select.addEventListener('change', () => update(select));
    update(select);
  }

  function optionHtml(option, select){
    const selected = option.selected || String(option.value) === String(select.value);
    const disabled = option.disabled;
    return `<button type="button" role="option" class="rs-picklist-option${selected?' is-selected':''}${disabled?' is-disabled':''}" data-rs-picklist-value="${esc(option.value)}" aria-selected="${selected?'true':'false'}" ${disabled?'disabled':''}><span class="rs-picklist-option-label">${esc(option.textContent)}</span>${selected?(Restogogo.icons?.checkmark?.() || '<span class="rs-picklist-check">✓</span>'):''}</button>`;
  }

  function buildMenu(select){
    const menu = document.createElement('div');
    menu.className = `rs-picklist-menu rs-picklist-menu--${variantFor(select)} rs-picklist-menu--floating is-open`;
    menu.setAttribute('role','listbox');
    menu.innerHTML = Array.from(select.options).map(option => optionHtml(option, select)).join('');
    menu.addEventListener('click', event => {
      const option = event.target.closest('.rs-picklist-option[data-rs-picklist-value]');
      if(!option || option.disabled)return;
      setValue(select, option.dataset.rsPicklistValue);
      close();
    });
    menu.addEventListener('keydown', handleMenuKeydown);
    return menu;
  }

  function place(menu, button){
    const rect = button.getBoundingClientRect();
    const width = Math.max(rect.width, 160);
    const margin = 10;
    menu.style.minWidth = `${width}px`;
    menu.style.maxWidth = `${Math.min(Math.max(width, 220), window.innerWidth - margin * 2)}px`;
    document.body.appendChild(menu);
    const menuRect = menu.getBoundingClientRect();
    const left = Math.min(Math.max(margin, rect.left), window.innerWidth - menuRect.width - margin);
    const below = rect.bottom + 8;
    const opensUp = below + menuRect.height > window.innerHeight - margin && rect.top > menuRect.height + margin;
    const top = opensUp ? Math.max(margin, rect.top - menuRect.height - 8) : Math.min(below, window.innerHeight - menuRect.height - margin);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function open(select){
    close();
    const api = select._rsPicklist;
    if(!api)return;
    const menu = buildMenu(select);
    active = {select, menu};
    api.wrapper.classList.add('is-open');
    api.button.setAttribute('aria-expanded','true');
    place(menu, api.button);
    const selected = menu.querySelector('.rs-picklist-option.is-selected:not(:disabled)') || menu.querySelector('.rs-picklist-option:not(:disabled)');
    setTimeout(()=>selected?.focus?.({preventScroll:true}), 0);
  }

  function close(){
    if(!active)return;
    const {select, menu} = active;
    select._rsPicklist?.wrapper.classList.remove('is-open');
    select._rsPicklist?.button.setAttribute('aria-expanded','false');
    menu.remove();
    active = null;
  }

  function setValue(select, value){
    if(String(select.value) === String(value))return;
    select.value = value;
    select.dispatchEvent(new Event('input', {bubbles:true}));
    select.dispatchEvent(new Event('change', {bubbles:true}));
    update(select);
  }

  function handleTriggerKeydown(event, select){
    if(event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown'){
      event.preventDefault();
      if(!select.disabled)open(select);
    }
  }

  function handleMenuKeydown(event){
    if(event.key === 'Escape'){
      event.preventDefault();
      const button = active?.select?._rsPicklist?.button;
      close();
      button?.focus?.({preventScroll:true});
      return;
    }
    const options = Array.from(event.currentTarget.querySelectorAll('.rs-picklist-option:not(:disabled)'));
    const index = options.indexOf(document.activeElement);
    if(event.key === 'ArrowDown' || event.key === 'ArrowUp'){
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? Math.min(options.length - 1, index + 1) : Math.max(0, index - 1);
      options[next]?.focus?.({preventScroll:true});
    }
    if(event.key === 'Home'){
      event.preventDefault();
      options[0]?.focus?.({preventScroll:true});
    }
    if(event.key === 'End'){
      event.preventDefault();
      options[options.length - 1]?.focus?.({preventScroll:true});
    }
  }

  function refresh(root=document){
    root.querySelectorAll?.('select')?.forEach(enhance);
    document.querySelectorAll('select.rs-picklist-native').forEach(update);
  }

  function scheduleRefresh(){
    if(scheduled)return;
    scheduled = true;
    requestAnimationFrame(()=>{scheduled=false; refresh();});
  }

  function startObserver(){
    if(observerStarted || !document.body)return;
    observerStarted = true;
    const observer = new MutationObserver(mutations => {
      if(mutations.every(mutation => mutation.target?.closest?.('.rs-picklist-menu--floating')))return;
      scheduleRefresh();
    });
    observer.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['disabled']});
  }

  document.addEventListener('click', event => {
    if(active && !event.target.closest('.rs-picklist-menu--floating') && !event.target.closest('.rs-picklist'))close();
  });
  document.addEventListener('keydown', event => { if(event.key === 'Escape')close(); });
  window.addEventListener('resize', close);
  window.addEventListener('scroll', close, true);

  Restogogo.picklists = {refresh, close};
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => { refresh(); startObserver(); });
  }else{
    refresh();
    startObserver();
  }
})();
