/* restogogo metric detail UI primitives.
 * Pure dialog row/section markup lives here so metric-detail-service stays focused on data/model routing.
 */
(function(){
  const R = window.Restogogo = window.Restogogo || {};
  R.services = R.services || {};
  const Icons = R.icons;

  function icon(name){return Icons.svg(name);}
  function badge(name,tone=''){return `<span class="rs-detail-icon${tone?` is-${esc(tone)}`:''}" aria-hidden="true">${icon(name)}</span>`;}
  function employeeName(employee){return employee?.name || `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || 'Employee';}
  function roleName(employee){return employeePositionName(employee) || 'Team';}
  function dateLabel(value){return value ? shortDisplayDate(value) : '—';}
  function tone(status){
    const clean = String(status || '').toLowerCase();
    if(['danger','under','late','no-show','rejected'].includes(clean))return 'danger';
    if(['warning','pending','over','draft'].includes(clean))return 'warning';
    if(['success','approved','ok','published','ready','active'].includes(clean))return 'success';
    return 'neutral';
  }

  function empty(text='No details to review.'){return `<div class="rs-detail-empty">${icon('check')}<span>${esc(text)}</span></div>`;}
  function pill(label,state='neutral'){return `<span class="rs-detail-pill is-${esc(tone(state))}">${esc(label)}</span>`;}

  function row(options={}){
    const actions = options.actions || '';
    return `<article class="rs-detail-row is-${esc(tone(options.tone))}">
      ${badge(options.icon || 'info',tone(options.tone))}
      <div class="rs-detail-row__copy"><strong>${esc(options.title || '')}</strong>${options.meta?`<small>${esc(options.meta)}</small>`:''}</div>
      ${options.value?`<b>${esc(options.value)}</b>`:''}
      ${actions?`<div class="rs-detail-row__actions">${actions}</div>`:''}
    </article>`;
  }

  function section(title,meta,content){
    return `<section class="rs-detail-section"><header><h3>${esc(title)}</h3>${meta?`<small>${esc(meta)}</small>`:''}</header><div class="rs-detail-list">${content || empty()}</div></section>`;
  }

  function footer(items=[]){
    const buttons = items.filter(Boolean).map(item=>{
      if(item.action === 'close')return `<button type="button" class="rs-modal-btn" data-rs-detail-close>${esc(item.label || 'Close')}</button>`;
      return `<button type="button" class="rs-modal-btn ${item.primary?'is-primary':''}" data-rs-detail-go="${esc(item.page || '')}">${esc(item.label || 'Open')}</button>`;
    }).join('');
    return `<footer class="rs-detail-footer">${buttons || `<button type="button" class="rs-modal-btn is-primary" data-rs-detail-close>Close</button>`}</footer>`;
  }

  function modal(title,subtitle,iconName,toneName,body,footerItems){
    return `<section class="rs-detail-card" data-tone="${esc(tone(toneName))}">
      <header class="rs-detail-head">
        ${badge(iconName || 'info',toneName)}
        <div><span>Metric details</span><h2>${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>
        <button type="button" class="rs-detail-close" data-rs-detail-close aria-label="Close">${icon('close')}</button>
      </header>
      <div class="rs-detail-body">${body}</div>
      ${footer(footerItems)}
    </section>`;
  }

  R.services.metricDetailUi={icon,badge,employeeName,roleName,dateLabel,tone,empty,pill,row,section,footer,modal};
})();
