/*
 * restogogo shared metric renderer.
 * Owns the markup for top summary cards and the shared period selector
 * so Planning, Actuals and Employee Schedule do not keep separate copies.
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
    const hasDetail = !!options.detailKey;
    const tag = options.tag || (hasDetail ? 'button' : 'article');
    const tone = options.tone ? ` is-${options.tone}` : '';
    const className = `${options.className || ''} rs-metric-card${tone}`.trim();
    const role = tag === 'button' ? undefined : options.role;
    const tabIndex = tag === 'button' ? undefined : options.tabIndex;
    const extraAttrs = attrs(Object.assign({}, options.attrs, {
      id: options.id,
      type: tag === 'button' ? (options.type || 'button') : undefined,
      'aria-label': options.ariaLabel || (hasDetail ? `${options.label || 'Metric'} details` : undefined),
      role,
      tabindex: tabIndex,
      'data-rs-metric-detail': options.detailKey
    }));
    const copyClass = options.copyClass || '';
    const iconToneMap = {success:'success', warning:'warning', danger:'danger', info:'info', neutral:'neutral', absence:'absence', week:'info', hours:'info', cost:'danger', status:'info'};
    const iconTone = options.iconClass || (iconToneMap[options.tone] ? `is-${iconToneMap[options.tone]}` : '');
    return `<${tag} class="${esc(className)}"${extraAttrs}>${iconBadge(options.icon || 'document',iconTone)}<div class="rs-metric-copy${copyClass?` ${esc(copyClass)}`:''}"><span>${esc(options.label || '')}</span><strong>${esc(options.value || '')}</strong><small>${esc(options.meta || '')}</small></div></${tag}>`;
  }

  function periodSelector(options={}){
    const tag = options.tag || 'div';
    const className = `${options.className || ''} rs-period-selector`.trim();
    const fieldClass = options.fieldClass || 'rs-period-field';
    const buttonClass = options.buttonClass || 'rs-period-btn';
    const extraAttrs = attrs({
      id: options.id,
      'aria-label': options.ariaLabel,
      role: options.role || 'button',
      tabindex: options.tabIndex ?? 0
    });
    return `<${tag} class="${esc(className)}"${extraAttrs}>
      <button aria-label="${esc(options.prevAriaLabel || 'Previous week')}" class="${esc(buttonClass)}" id="${esc(options.prevId || '')}" type="button">&larr;</button>
      <label aria-label="${esc(options.inputAriaLabel || 'Select date')}" class="${esc(fieldClass)}">
        ${Icons.svg(options.icon || 'calendar','rs-period-field__icon')}
        <span>${esc(options.label || 'Week range')}</span>
        <strong${options.valueId?` id="${esc(options.valueId)}"`:''}>${esc(options.value || '')}</strong>
        ${options.meta?`<small${options.metaId?` id="${esc(options.metaId)}"`:''}>${esc(options.meta)}</small>`:''}
        <input id="${esc(options.inputId || '')}" type="date" value="${esc(options.inputValue || '')}" />
      </label>
      <button aria-label="${esc(options.nextAriaLabel || 'Next week')}" class="${esc(buttonClass)}" id="${esc(options.nextId || '')}" type="button">&rarr;</button>
    </${tag}>`;
  }

  services.metrics = {card,periodSelector,icon,iconBadge};
})();
