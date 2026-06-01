/*
 * restogogo shared toolbar/action renderer.
 * Owns recurring search, filter, action-menu, grid-toolbar and save/cancel markup.
 * Modules pass data + handlers through data attributes; this file only renders UI primitives.
 */
(function(){
  const services = Restogogo.services = Restogogo.services || {};
  const Icons = Restogogo.icons;

  function attrName(name){
    return String(name || '').trim();
  }

  function attrs(attributes){
    return Object.entries(attributes || {})
      .filter(([,value])=>value!==undefined && value!==null && value!==false)
      .map(([key,value])=>value===true ? ` ${key}` : ` ${key}="${esc(String(value))}"`)
      .join('');
  }

  function dataAttrs(attributes){
    return attrs(attributes || {});
  }

  function searchControl(options={}){
    return `<label class="rs-control rs-search-control ${esc(options.className || '')}" aria-label="${esc(options.ariaLabel || 'Search')}">${Icons.svg(options.icon || 'search')}<input${attrs({id:options.id, placeholder:options.placeholder || 'Search', value:options.value || ''})}${dataAttrs(options.data || {})}></label>`;
  }

  function filterOption(options={}){
    const selected = String(options.value) === String(options.current);
    const data = Object.assign({}, options.data || {});
    if(options.kindAttr)data[attrName(options.kindAttr)] = options.kind;
    if(options.valueAttr)data[attrName(options.valueAttr)] = options.value;
    return `<button type="button" class="rs-picklist-option${selected?' is-selected':''}"${dataAttrs(data)} aria-pressed="${selected?'true':'false'}"><span class="rs-picklist-option-label">${esc(options.label || '')}</span>${selected?Icons.checkmark():''}</button>`;
  }

  function optionGroup(group={}){
    const options = Array.isArray(group.options) ? group.options.map(filterOption).join('') : String(group.optionsHtml || '');
    return `<div class="rs-picklist-group"><span class="rs-picklist-label">${esc(group.label || '')}</span><div class="rs-picklist-options">${options}</div></div>`;
  }

  function filterMenu(options={}){
    const groups = (options.groups || []).map(optionGroup).join('');
    const className = ['rs-toolbar-picklist', options.className || ''].filter(Boolean).join(' ');
    const activeCount = Number(options.activeCount || 0);
    const label = options.label ? `<span>${esc(options.label)}</span>` : '';
    const count = activeCount > 0 ? `<em class="rs-filter-count" aria-label="${esc(String(activeCount))} active filters">${esc(String(activeCount))}</em>` : '';
    return `<details class="${esc(className)}"><summary class="rs-control-button rs-filter-button rs-icon-button" aria-label="${esc(options.ariaLabel || 'Filters')}" title="${esc(options.title || 'Filters')}">${Icons.svg(options.icon || 'filter')}${label}${count}</summary><div class="rs-picklist-menu rs-picklist-menu--toolbar rs-picklist-menu--anchored">${groups}</div></details>`;
  }

  function actionMenu(options={}){
    const className = ['rs-actions-menu', options.className || ''].filter(Boolean).join(' ');
    const actionAttr = attrName(options.actionAttr || 'data-action');
    const actions = (options.items || []).map(item=>{
      const data = Object.assign({}, item.data || {});
      data[actionAttr] = item.action;
      return `<button type="button"${dataAttrs(data)}${attrs({disabled:!!item.disabled,title:item.title || item.label})}>${item.icon?Icons.svg(item.icon):''}${item.icon?`<span>${esc(item.label || '')}</span>`:esc(item.label || '')}</button>`;
    }).join('');
    return `<details class="${esc(className)}"><summary class="rs-control-button rs-icon-button" aria-label="${esc(options.ariaLabel || 'Actions')}" title="${esc(options.title || options.ariaLabel || 'Actions')}">${Icons.svg(options.icon || 'more')}</summary><div class="rs-actions-menu__panel">${actions}</div></details>`;
  }

  function controlButton(options={}){
    const className = ['rs-control-button', options.iconOnly ? 'rs-icon-button' : '', options.className || ''].filter(Boolean).join(' ');
    const content = `${Icons.svg(options.icon || 'more')}${options.label?`<span>${esc(options.label)}</span>`:''}`;
    return `<button type="button" class="${esc(className)}"${dataAttrs(options.data || {})}${attrs({id:options.id,disabled:!!options.disabled,'aria-label':options.ariaLabel || options.label || 'Action',title:options.title || options.label || options.ariaLabel || 'Action'})}>${content}</button>`;
  }

  function actionButton(options={}){
    const className = ['rs-action-button', options.tone || '', options.className || ''].filter(Boolean).join(' ');
    const label = esc(options.label || 'Action');
    return `<button type="button" class="${esc(className)}"${dataAttrs(options.data || {})}${attrs({id:options.id,disabled:!!options.disabled,'aria-label':options.ariaLabel || options.label,title:options.title || options.label})}>${options.icon?Icons.svg(options.icon):''}${options.iconOnly?'':`<span>${label}</span>`}</button>`;
  }

  function saveActions(options={}){
    const dirty = !!options.dirty;
    const wrapperClass = [options.className || 'rs-action-row', 'rs-save-actions', dirty ? 'is-dirty' : 'is-clean'].filter(Boolean).join(' ');
    const actionAttr = attrName(options.actionAttr || 'data-action');
    const cancelData = Object.assign({}, options.cancelData || {});
    const saveData = Object.assign({}, options.saveData || {});
    cancelData[actionAttr] = options.cancelAction || 'cancel';
    // clickAction: the DOM data-attribute value for the save button click handler.
    // Distinct from saveAction in commitStateMutation which is a RestogogoSaveContract object.
    saveData[actionAttr] = options.clickAction || options.saveAction || 'save';
    return `<div class="${esc(wrapperClass)}"${dataAttrs(options.data || {})} aria-label="${esc(options.ariaLabel || 'Save controls')}">
      ${actionButton({className:'rs-icon-action is-cancel',icon:'close',iconOnly:true,data:cancelData,ariaLabel:options.cancelLabel || 'Cancel changes',title:options.cancelLabel || 'Cancel changes',disabled:!dirty})}
      ${actionButton({className:`rs-icon-action is-save ${dirty?'is-active':''}`,icon:'save',iconOnly:true,data:saveData,ariaLabel:options.saveLabel || 'Save changes',title:options.saveLabel || 'Save changes',disabled:!dirty})}
      ${options.extraHtml || ''}
    </div>`;
  }

  function gridToolbar(options={}){
    const tag = options.tag || 'div';
    const className = ['rs-grid-toolbar', options.className || ''].filter(Boolean).join(' ');
    const leading = Array.isArray(options.leading) ? options.leading.join('') : String(options.leading || '');
    const actions = Array.isArray(options.actions) ? options.actions.join('') : String(options.actions || '');
    return `<${tag} class="${esc(className)}"${attrs({'aria-label':options.ariaLabel})}>
      ${leading
        ? `<div class="rs-grid-toolbar__leading">${leading}</div>`
        : `<div class="rs-grid-toolbar__title"><strong>${esc(options.title || '')}</strong>${options.meta?`<span>${esc(options.meta)}</span>`:''}</div>`}
      <div class="rs-grid-toolbar__center">${options.center || ''}</div>
      <div class="rs-grid-toolbar__actions">${actions}</div>
    </${tag}>`;
  }

  function threeCellToolbar(options={}){
    const tag = options.tag || 'div';
    const className = options.className || 'rs-three-cell-toolbar';
    const cellClassName = options.cellClassName || 'rs-three-cell-toolbar__cell';
    return `<${tag} class="${esc(className)}"${attrs({'aria-label':options.ariaLabel})}><div class="${esc(`${cellClassName} is-left`)}">${options.left || ''}</div><div class="${esc(`${cellClassName} is-center`)}">${options.center || ''}</div><div class="${esc(`${cellClassName} is-right`)}">${options.right || ''}</div></${tag}>`;
  }

  services.toolbar = {searchControl,filterOption,filterMenu,actionMenu,controlButton,actionButton,saveActions,gridToolbar,threeCellToolbar};
})();
