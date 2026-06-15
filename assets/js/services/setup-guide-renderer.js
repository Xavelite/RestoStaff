/* Shared setup guide renderer.
 * Keeps setup progress/checklist markup identical in Restaurant and Team.
 */
(function(){
  const R = window.Restogogo = window.Restogogo || {};
  R.services = R.services || {};

  function icon(name){return R.icons?.svg?.(name) || '';}
  function iconName(key){
    return ({
      basics:'building', opening:'clock', zones:'zone', jobFunctions:'id', coverage:'grid',
      team:'users', roster:'users', badges:'badge', payroll:'payroll', contracts:'document', absences:'palm'
    }[key] || 'check');
  }

  function progress(summary){
    return `<div class="rs-setup-progress rs-progress" style="--rs-progress-value:${esc(String(summary?.percent || 0))}%">
      <div class="rs-progress__meta"><span class="rs-progress__label">${esc(summary?.label || 'Setup')}</span><strong>${esc(String(summary?.percent || 0))}%</strong></div>
      <div class="rs-progress__track"><span class="rs-progress__fill"></span></div>
    </div>`;
  }

  function targetAttributes(step,targetAttr){
    if(!targetAttr)return '';
    return `${targetAttr}="${esc(step?.key || '')}"`;
  }

  function stepButton(step,targetAttr){
    const issue = step?.issues?.[0] || step?.description || '';
    const tone = step?.tone || (step?.done ? 'success' : 'warning');
    return `<button type="button" class="rs-setup-step is-${esc(tone)}" ${targetAttributes(step,targetAttr)}>
      <span class="rs-setup-step__icon is-${esc(tone)}">${icon(iconName(step?.key))}</span>
      <span class="rs-setup-step__copy"><strong>${esc(step?.title || 'Setup step')}</strong><small>${esc(issue)}</small><span class="rs-setup-step__count">${esc(step?.count || '')}</span></span>
      <span class="rs-setup-step__status">${esc(step?.status || '')}</span>
    </button>`;
  }

  function guide({summary,title,description,targetAttr,className=''}={}){
    const model = summary || {steps:[],label:'Setup',percent:0,tone:'warning'};
    return `<section class="rs-setup-guide ${esc(className)}">
      <header class="rs-setup-guide__head">
        <div><h3>${esc(title || 'Setup guide')}</h3><p>${esc(description || '')}</p></div>
        ${progress(model)}
      </header>
      <div class="rs-setup-step-list">${(model.steps || []).map(step=>stepButton(step,targetAttr)).join('')}</div>
    </section>`;
  }

  R.services.setupGuide = {guide, progress, stepButton, iconName};
})();
