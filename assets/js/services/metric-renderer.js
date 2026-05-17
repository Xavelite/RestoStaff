/*
 * restogogo shared metric renderer.
 * Owns the markup for top summary cards so Planning, Actuals and Employee Schedule
 * do not keep separate copies of the same component structure.
 */
(function(){
  const services = Restogogo.services = Restogogo.services || {};
  const Icons = Restogogo.icons;

  function attrs(attributes){
    return Object.entries(attributes || {})
      .filter(([,value])=>value!==undefined && value!==null && value!==false)
      .map(([key,value])=>value===true ? ` ${key}` : ` ${key}="${esc(String(value))}"`)
      .join('');
  }

  function icon(name){
    return Icons.svg(name);
  }

  function iconBadge(name,className=''){
    return Icons.badge(name,className);
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
