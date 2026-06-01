/* restogogo module UI contract.
 * Standardizes metrics, actions and loading/empty/error states so modules pass
 * data/config instead of inventing page chrome.
 */
(function(){
  const services = Restogogo.services = Restogogo.services || {};

  function normalizeMetric(metric={}){
    return Object.freeze({
      label:String(metric.label || '').trim(),
      value:String(metric.value ?? '').trim(),
      meta:String(metric.meta || '').trim(),
      tone:String(metric.tone || '').trim(),
      icon:String(metric.icon || 'document').trim(),
      detailKey:String(metric.detailKey || '').trim(),
      className:String(metric.className || '').trim(),
      disabled:metric.disabled === true
    });
  }

  function normalizeAction(action={}){
    return Object.freeze({
      label:String(action.label || '').trim(),
      action:String(action.action || '').trim(),
      icon:String(action.icon || '').trim(),
      tone:String(action.tone || '').trim(),
      title:String(action.title || action.label || '').trim(),
      disabled:action.disabled === true,
      data:action.data && typeof action.data === 'object' ? Object.assign({}, action.data) : {}
    });
  }

  function renderMetrics(metrics=[], options={}){
    const renderer = services.metrics;
    const items = (Array.isArray(metrics) ? metrics : []).map(normalizeMetric);
    return items.map(metric=>renderer.card(Object.assign({}, metric, {
      className:[metric.className, metric.disabled ? 'is-disabled' : ''].filter(Boolean).join(' ')
    }))).join('');
  }

  function renderActions(actions=[], options={}){
    const toolbar = services.toolbar;
    const actionAttr = options.actionAttr || 'data-module-action';
    return (Array.isArray(actions) ? actions : []).map(raw=>{
      const action = normalizeAction(raw);
      const data = Object.assign({}, action.data);
      data[actionAttr] = action.action;
      return toolbar.actionButton({
        label:action.label,
        icon:action.icon || 'more',
        tone:action.tone,
        title:action.title,
        disabled:action.disabled,
        data
      });
    }).join('');
  }

  function stateView(state={}, options={}){
    const type = String(state.type || options.type || 'empty').trim().toLowerCase();
    const tone = ['loading','empty','error'].includes(type) ? type : 'empty';
    const title = String(state.title || (tone === 'loading' ? 'Loading…' : tone === 'error' ? 'Something went wrong' : 'Nothing to show yet')).trim();
    const message = String(state.message || '').trim();
    const actionHtml = state.actionHtml || '';
    return `<div class="rs-state rs-state--${esc(tone)}" role="${tone === 'error' ? 'alert' : 'status'}"><strong>${esc(title)}</strong>${message?`<p>${esc(message)}</p>`:''}${actionHtml?`<div class="rs-state__actions">${actionHtml}</div>`:''}</div>`;
  }

  function fromProvider(provider, context={}){
    if(typeof provider !== 'function')return [];
    const value = provider(context);
    return Array.isArray(value) ? value : [];
  }

  services.moduleUi = Object.freeze({
    normalizeMetric,
    normalizeAction,
    renderMetrics,
    renderActions,
    stateView,
    fromProvider
  });
})();
