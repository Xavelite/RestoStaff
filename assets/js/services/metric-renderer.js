/*
 * restogogo shared metric renderer.
 * Owns the markup for top summary cards so Planning, Actuals and Employee Schedule
 * do not keep separate copies of the same component structure.
 */
(function(){
  const services = Restogogo.services = Restogogo.services || {};

  const iconPaths = {
    calendar:'<rect height="14" rx="2.5" width="16" x="4" y="5.5"></rect><path d="M8 3.5v4M16 3.5v4M4 9.5h16"></path>',
    clock:'<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5l3 2"></path>',
    open:'<circle cx="12" cy="12" r="8"></circle><path d="M12 8v5"></path><path d="M12 16h.01"></path>',
    variance:'<path d="M4 14l4-4 4 4 7-7"></path><path d="M4 20h16"></path>',
    document:'<path d="M8 4h7l4 4v12H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z"></path><path d="M15 4v5h4"></path><path d="M9 13h6"></path><path d="M9 16h4"></path>',
    check:'<path d="M20 6 9 17l-5-5"></path>',
    euro:'<path d="M15.5 6.5a5.5 5.5 0 1 0 0 11"></path><path d="M4 10h10M4 14h9"></path>'
  };

  function attrs(attributes){
    return Object.entries(attributes || {})
      .filter(([,value])=>value!==undefined && value!==null && value!==false)
      .map(([key,value])=>value===true ? ` ${key}` : ` ${key}="${esc(String(value))}"`)
      .join('');
  }

  function icon(name){
    return `<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24">${iconPaths[name]||''}</svg>`;
  }

  function iconBadge(name,className=''){
    return `<span aria-hidden="true" class="rs-icon-badge${className?` ${esc(className)}`:''}">${icon(name)}</span>`;
  }

  function card(options={}){
    const tag = options.tag || 'article';
    const tone = options.tone ? ` is-${options.tone}` : '';
    const className = `${options.className || ''} rs-metric-card${tone}`.trim();
    const extraAttrs = attrs(Object.assign({}, options.attrs, {
      id: options.id,
      'aria-label': options.ariaLabel,
      role: options.role,
      tabindex: options.tabIndex
    }));
    const copyClass = options.copyClass || '';
    return `<${tag} class="${esc(className)}"${extraAttrs}>${iconBadge(options.icon || 'document',options.iconClass || '')}<div class="rs-metric-copy${copyClass?` ${esc(copyClass)}`:''}"><span>${esc(options.label || '')}</span><strong>${esc(options.value || '')}</strong><small>${esc(options.meta || '')}</small></div></${tag}>`;
  }

  function week(options={}){
    const tag = options.tag || 'article';
    const tone = options.tone || 'week';
    const className = `${options.className || ''} rs-metric-card is-${tone} rs-week-metric`.trim();
    const buttonClass = options.buttonClass || 'rs-week-btn';
    const fieldClass = options.fieldClass || 'rs-week-field';
    const extraAttrs = attrs({
      id: options.id,
      'aria-label': options.ariaLabel,
      role: options.role || 'button',
      tabindex: options.tabIndex ?? 0
    });
    return `<${tag} class="${esc(className)}"${extraAttrs}>
      <button aria-label="${esc(options.prevAriaLabel || 'Previous week')}" class="${esc(buttonClass)}" id="${esc(options.prevId || '')}" type="button">←</button>
      ${iconBadge(options.icon || 'calendar',options.iconClass || '')}
      <label aria-label="${esc(options.inputAriaLabel || 'Select week')}" class="${esc(fieldClass)}">
        <span>${esc(options.label || 'Week range')}</span>
        <strong${options.valueId?` id="${esc(options.valueId)}"`:''}>${esc(options.value || '')}</strong>
        <small${options.metaId?` id="${esc(options.metaId)}"`:''}>${esc(options.meta || 'Click to change')}</small>
        <input id="${esc(options.inputId || '')}" type="date" value="${esc(options.inputValue || '')}" />
      </label>
      <button aria-label="${esc(options.nextAriaLabel || 'Next week')}" class="${esc(buttonClass)}" id="${esc(options.nextId || '')}" type="button">→</button>
    </${tag}>`;
  }

  services.metrics = {card,week,icon,iconBadge};
})();
