/*
 * restogogo shared icon service.
 * One icon/status language for metrics, headers, cards, lists and compact state displays.
 */
(function(){
  const services = Restogogo.services = Restogogo.services || {};

  const paths = {
    add:'<path d="M12 5v14M5 12h14"></path>',
    alert:'<path d="M12 4 3.5 19h17L12 4Z"></path><path d="M12 9v4M12 16h.01"></path>',
    bank:'<path d="M4 10h16"></path><path d="M6 10V8l6-4 6 4v2"></path><path d="M7 10v8M12 10v8M17 10v8M5 18h14"></path>',
    badge:'<rect x="6" y="4" width="12" height="16" rx="3"></rect><path d="M9 9h6M9 13h6M10 17h4"></path>',
    building:'<path d="M4 20h16"></path><path d="M6 20V9l6-4 6 4v11"></path><path d="M9 20v-6h6v6"></path><path d="M9 10h.01M15 10h.01"></path>',
    calendar:'<rect x="4" y="5" width="16" height="15" rx="2.5"></rect><path d="M8 3v4M16 3v4M4 10h16"></path>',
    camera:'<path d="M8.5 7.5 10 5h4l1.5 2.5H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2h2.5Z"></path><circle cx="12" cy="13" r="3"></circle>',
    chef:'<path d="M8 10.5a4 4 0 1 1 8 0"></path><path d="M6.5 11a3.2 3.2 0 1 1 4.4-4"></path><path d="M17.5 11a3.2 3.2 0 1 0-4.4-4"></path><path d="M7 11h10v8H7z"></path><path d="M9 15h6"></path>',
    check:'<path d="M20 6 9 17l-5-5"></path>',
    chevronDown:'<path d="m6 9 6 6 6-6"></path>',
    chevronLeft:'<path d="m15 18-6-6 6-6"></path>',
    chevronRight:'<path d="m9 18 6-6-6-6"></path>',
    clock:'<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5l3 2"></path>',
    close:'<path d="M6 6l12 12M18 6 6 18"></path>',
    cloche:'<path d="M5 17h14"></path><path d="M7 17a5 5 0 0 1 10 0"></path><path d="M12 8V6"></path><path d="M10 6h4"></path><path d="M4 20h16"></path>',
    contact:'<circle cx="12" cy="8" r="3"></circle><path d="M5 20c1.2-4.1 3.8-6 7-6s5.8 1.9 7 6"></path><path d="M18 8h3M19.5 6.5v3"></path>',
    copy:'<rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M5 15V6a1 1 0 0 1 1-1h9"></path>',
    document:'<path d="M8 4h7l4 4v12H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z"></path><path d="M15 4v5h4"></path><path d="M9 13h6"></path><path d="M9 16h4"></path>',
    edit:'<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z"></path>',
    euro:'<path d="M15.5 6.5a5.5 5.5 0 1 0 0 11"></path><path d="M4 10h10M4 14h9"></path>',
    filter:'<path d="M4 6h16M7 12h10M10 18h4"></path>',
    grid:'<rect x="4" y="4" width="6" height="6" rx="1.5"></rect><rect x="14" y="4" width="6" height="6" rx="1.5"></rect><rect x="4" y="14" width="6" height="6" rx="1.5"></rect><rect x="14" y="14" width="6" height="6" rx="1.5"></rect>',
    heart:'<path d="M20.5 8.5c0 5.4-8.5 10.5-8.5 10.5S3.5 13.9 3.5 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8.5 2.5Z"></path>',
    home:'<path d="M4 11.5 12 5l8 6.5"></path><path d="M6.5 10v10h11V10"></path><path d="M10 20v-5h4v5"></path>',
    id:'<rect x="4" y="6" width="16" height="12" rx="2"></rect><path d="M8 10h5M8 14h8"></path><circle cx="16.5" cy="10.5" r="1.5"></circle>',
    info:'<circle cx="12" cy="12" r="8.5"></circle><path d="M12 11v5M12 8h.01"></path>',
    key:'<circle cx="8.5" cy="13.5" r="3.5"></circle><path d="M12 11l7-7M16 4l3 3M14.5 6.5l3 3"></path>',
    list:'<path d="M8 6h12M8 12h12M8 18h12"></path><path d="M4 6h.01M4 12h.01M4 18h.01"></path>',
    celebration:'<path d="M6 18c1-3.6 3.3-6.2 7.8-8.8l1.6 1.6C13 15.2 10.2 17.5 6 18Z"></path><path d="M13.8 8.8l1.6 1.6 2.3-2.3a1.6 1.6 0 0 0 0-2.3l-.9-.9a1.6 1.6 0 0 0-2.3 0Z"></path><path d="M16.5 4.5l3-1"></path><path d="M18.5 7.5h3"></path><path d="M15.5 2.5V1"></path><path d="M9 5.5l1.2 1.2"></path><path d="M7.2 8.2 5.8 9.6"></path><path d="M10.8 3.4 10 1.8"></path>',
    thermometer:'<path d="M14 14.8V6a2 2 0 1 0-4 0v8.8a4 4 0 1 0 4 0Z"></path><path d="M12 10v6"></path><path d="M10.3 17h3.4"></path><path d="M12 19.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z"></path>',
    minus:'<path d="M6 12h12"></path>',
    moon:'<path d="M18.5 14.2A7 7 0 0 1 9.8 5.5 7 7 0 1 0 18.5 14.2Z"></path>',
    more:'<circle cx="12" cy="12" r="1.8"></circle><circle cx="19" cy="12" r="1.8"></circle><circle cx="5" cy="12" r="1.8"></circle>',
    note:'<path d="M6 4h12v16H6z"></path><path d="M9 8h6M9 12h6M9 16h4"></path>',
    payroll:'<rect x="5" y="4" width="14" height="16" rx="2"></rect><path d="M8 8h8M8 12h8M8 16h5"></path>',
    palm:'<path d="M12 21v-9"></path><path d="M12 12c-2.6-1.2-5-.7-7 1.4 1-3.3 3.4-5.3 7-5.4"></path><path d="M12 12c2.6-1.3 5-.8 7 1.4-1-3.3-3.4-5.3-7-5.4"></path><path d="M12 8c-1.4-2.5-3.3-3.8-5.8-3.5 1.8-1.5 4.8-1.4 5.8 3.5Z"></path><path d="M12 8c1.5-2.5 3.5-3.8 6-3.5-1.8-1.5-4.9-1.4-6 3.5Z"></path><path d="M4 21c2.4-1.1 4.8-1.1 7.2 0 2.4 1.1 4.8 1.1 7.2 0"></path>',
    phone:'<path d="M8 5c.5 4.6 2.9 8.5 7 11l2.1-2.1 2.9 1.1v4.2c0 .6-.4 1-1 1C10.7 20 4 13.3 4 5c0-.6.4-1 1-1h4.2L10.3 7 8 5Z"></path>',
    pin:'<path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"></path><circle cx="12" cy="10" r="2"></circle>',
    print:'<path d="M7 8V4h10v4"></path><rect x="5" y="10" width="14" height="8" rx="2"></rect><path d="M8 15h8M8 18h8"></path>',
    restaurant:'<path d="M7 3v18"></path><path d="M4 3v5a3 3 0 0 0 6 0V3"></path><path d="M17 3v18"></path><path d="M17 3c2 1.6 3 4 3 7v2h-3"></path>',
    save:'<path d="M6 4h10l2 2v14H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"></path><path d="M8 4v6h7V4"></path><path d="M8 16h8"></path>',
    search:'<circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path>',
    spark:'<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"></path>',
    sun:'<circle cx="12" cy="12" r="3.2"></circle><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"></path>',
    timer:'<circle cx="12" cy="13" r="7.5"></circle><path d="M9 3h6M12 13l3-3"></path>',
    user:'<circle cx="12" cy="8" r="3.4"></circle><path d="M5 20c1.2-4.2 3.8-6.2 7-6.2s5.8 2 7 6.2"></path>',
    users:'<circle cx="9" cy="8" r="3"></circle><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5"></path><path d="M15 11a3 3 0 0 0 0-6"></path><path d="M16.5 14c1.8.5 3.2 2 4 5"></path>',
    variance:'<path d="M4 14l4-4 4 4 7-7"></path><path d="M4 20h16"></path>',
    zone:'<path d="M4 6h16v12H4z"></path><path d="M4 12h16M10 6v12"></path>'
  };

  const aliases = {
    plus:'add', terminal:'badge', jobFunction:'id', contract:'document', date:'calendar', emergency:'heart', identity:'user', notes:'note', warning:'alert', missing:'alert', pending:'timer', ready:'check', active:'check', inactive:'minus', open:'check', closed:'minus', approved:'check', rejected:'close', cancelled:'minus', draft:'edit', published:'check'
  };

  const statusMap = {
    active:{tone:'success', icon:'check', label:'Active'},
    inactive:{tone:'muted', icon:'minus', label:'Inactive'},
    open:{tone:'success', icon:'check', label:'Open'},
    closed:{tone:'muted', icon:'minus', label:'Closed'},
    ready:{tone:'success', icon:'check', label:'Ready'},
    ok:{tone:'success', icon:'check', label:'OK'},
    missing:{tone:'warning', icon:'alert', label:'Missing information'},
    warning:{tone:'warning', icon:'alert', label:'Warning'},
    issue:{tone:'warning', icon:'alert', label:'Issue'},
    pending:{tone:'warning', icon:'timer', label:'Pending'},
    approved:{tone:'success', icon:'check', label:'Approved'},
    rejected:{tone:'muted', icon:'close', label:'Rejected'},
    cancelled:{tone:'muted', icon:'minus', label:'Cancelled'},
    published:{tone:'success', icon:'check', label:'Published'},
    draft:{tone:'warning', icon:'edit', label:'Draft'},
    live:{tone:'info', icon:'timer', label:'Live'},
    danger:{tone:'danger', icon:'alert', label:'Critical'},
    info:{tone:'info', icon:'info', label:'Information'}
  };

  function path(name){
    const key = aliases[name] || name || 'info';
    return paths[key] || paths.info;
  }

  function svg(name, className=''){
    const cls = className ? ` class="${esc(className)}"` : '';
    return `<svg${cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" aria-hidden="true">${path(name)}</svg>`;
  }

  function badge(name,className=''){
    return `<span class="rs-icon-badge${className?` ${esc(className)}`:''}" aria-hidden="true">${svg(name)}</span>`;
  }

  function status(state,options={}){
    const key = String(state || '').toLowerCase().replace(/\s+/g,'-');
    const spec = statusMap[key] || statusMap.info || {tone:'info', icon:'info', label:'Status'};
    const tone = options.tone || spec.tone;
    const label = options.label || spec.label;
    const title = options.title || label;
    const className = options.className ? ` ${esc(options.className)}` : '';
    return `<span class="rs-status-icon is-${esc(tone)}${className}" role="img" aria-label="${esc(label)}" title="${esc(title)}">${svg(options.icon || spec.icon)}</span>`;
  }

  function checkmark(){
    return `<span class="rs-picklist-check" aria-hidden="true">${svg('check')}</span>`;
  }

  const api = {path,svg,badge,status,checkmark,statusMap,paths};
  Restogogo.icons = api;
})();
