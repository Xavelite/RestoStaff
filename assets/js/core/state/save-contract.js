/* restogogo save/action contract.
 * Owns the official domain/action vocabulary for persistence.
 * Modules describe what changed with {domain, action}; repositories decide how to persist it.
 */
(function(){
  const DOMAIN = Object.freeze({
    RESTAURANT:'restaurant',
    TEAM:'team',
    ABSENCE:'absence',
    EMPLOYEE_SELF_SERVICE:'employee-self-service',
    PLANNING:'planning',
    ACTUALS:'actuals'
  });

  const ACTION = Object.freeze({
    RESTAURANT:Object.freeze({SETUP:'setup'}),
    TEAM:Object.freeze({PROFILE:'profile'}),
    ABSENCE:Object.freeze({
      CREATE_BY_MANAGER:'create_by_manager',
      APPROVE:'approve',
      REJECT:'reject',
      CANCEL_BY_MANAGER:'cancel_by_manager',
      CANCEL_FOR_PLANNING:'cancel_for_planning'
      // NOTE: employee-side absence actions (create_by_employee, cancel_by_employee) are
      // intentionally absent here. Employee-created absence requests go through
      // EMPLOYEE_SELF_SERVICE.SUBMIT via save_employee_self_service RPC, not through the
      // absence lifecycle. If a dedicated employee cancellation UI is ever added, extend
      // this domain and route through save_absence_lifecycle with create_by_employee/cancel_by_employee.
    }),
    EMPLOYEE_SELF_SERVICE:Object.freeze({SUBMIT:'submit'}),
    PLANNING:Object.freeze({UPDATE:'update', STATUS:'status'}),
    ACTUALS:Object.freeze({
      MANUAL_ENTRY:'manual_entry',
      ADJUST_ENTRY:'adjust_entry',
      CANCEL_ENTRY:'cancel_entry',
      APPROVE_WEEK:'approve_week',
      REOPEN_WEEK:'reopen_week'
    })
  });

  const DEFINITIONS = [
    {domain:DOMAIN.RESTAURANT,         action:ACTION.RESTAURANT.SETUP,                  reason:'restaurant-setup'},
    {domain:DOMAIN.TEAM,               action:ACTION.TEAM.PROFILE,                      reason:'team-profile'},
    {domain:DOMAIN.ABSENCE,            action:ACTION.ABSENCE.CREATE_BY_MANAGER,         reason:'absence-create-by-manager'},
    {domain:DOMAIN.ABSENCE,            action:ACTION.ABSENCE.APPROVE,                   reason:'absence-approve'},
    {domain:DOMAIN.ABSENCE,            action:ACTION.ABSENCE.REJECT,                    reason:'absence-reject'},
    {domain:DOMAIN.ABSENCE,            action:ACTION.ABSENCE.CANCEL_BY_MANAGER,         reason:'absence-cancel-by-manager'},
    {domain:DOMAIN.ABSENCE,            action:ACTION.ABSENCE.CANCEL_FOR_PLANNING,       reason:'absence-cancel-for-planning'},
    {domain:DOMAIN.EMPLOYEE_SELF_SERVICE, action:ACTION.EMPLOYEE_SELF_SERVICE.SUBMIT,   reason:'employee-self-service-submit'},
    {domain:DOMAIN.PLANNING,           action:ACTION.PLANNING.UPDATE,                   reason:'planning-update'},
    {domain:DOMAIN.PLANNING,           action:ACTION.PLANNING.STATUS,                   reason:'planning-status'},
    {domain:DOMAIN.ACTUALS,            action:ACTION.ACTUALS.MANUAL_ENTRY,              reason:'actuals-manual-entry'},
    {domain:DOMAIN.ACTUALS,            action:ACTION.ACTUALS.ADJUST_ENTRY,              reason:'actuals-adjust-entry'},
    {domain:DOMAIN.ACTUALS,            action:ACTION.ACTUALS.CANCEL_ENTRY,              reason:'actuals-cancel-entry'},
    {domain:DOMAIN.ACTUALS,            action:ACTION.ACTUALS.APPROVE_WEEK,              reason:'actuals-approve-week'},
    {domain:DOMAIN.ACTUALS,            action:ACTION.ACTUALS.REOPEN_WEEK,               reason:'actuals-reopen-week'}
  ];

  const REASON = Object.freeze(DEFINITIONS.reduce((acc,{domain,action,reason})=>{
    acc[`${domain}:${action}`]=reason;
    return acc;
  },{}));

  function text(value){return String(value || '').trim();}
  function cleanDomain(value){
    const clean = text(value).toLowerCase();
    return Object.values(DOMAIN).includes(clean) ? clean : '';
  }
  function cleanAction(domain,value){
    const clean = text(value).toLowerCase();
    const groups = Object.entries(DOMAIN).reduce((acc,[key,domainValue])=>{acc[domainValue]=ACTION[key] || {}; return acc;},{});
    const valid = Object.values(groups[domain] || {});
    return valid.includes(clean) ? clean : '';
  }
  function reasonFor(domain,action){return REASON[`${domain}:${action}`] || '';}  
  function normalize(input={}){
    const source = typeof input === 'string' ? {reason:input} : Object.assign({}, input || {});
    // Backward-compat bridge: callers that pass { saveAction: contractObject, ...rest }
    // (commitStateMutation options) have their nested contract object unwrapped here so
    // domain/action reach the router as flat properties. String saveAction values are
    // ignored — they are DOM click identifiers used by toolbar views, not contract objects.
    const embedded = source.saveAction && typeof source.saveAction === 'object' ? source.saveAction : null;
    const merged = embedded ? Object.assign({}, source, embedded) : source;
    const domain = cleanDomain(merged.domain || merged.saveDomain);
    const action = cleanAction(domain, merged.action || merged.saveActionName);
    const reason = text(merged.reason) || reasonFor(domain, action) || 'save';
    delete merged.saveAction;
    delete merged.saveDomain;
    delete merged.saveActionName;
    return Object.assign({}, merged, {domain, action, reason});
  }

  function build(domain,action,extra={}){return normalize(Object.assign({}, extra || {}, {domain, action}));}
  const actions = Object.freeze({
    restaurantSetup:(extra)=>build(DOMAIN.RESTAURANT, ACTION.RESTAURANT.SETUP, extra),
    teamProfile:(extra)=>build(DOMAIN.TEAM, ACTION.TEAM.PROFILE, extra),
    absence:(action,extra)=>build(DOMAIN.ABSENCE, action, extra),
    employeeSelfService:(extra)=>build(DOMAIN.EMPLOYEE_SELF_SERVICE, ACTION.EMPLOYEE_SELF_SERVICE.SUBMIT, extra),
    planningUpdate:(extra)=>build(DOMAIN.PLANNING, ACTION.PLANNING.UPDATE, extra),
    planningStatus:(extra)=>build(DOMAIN.PLANNING, ACTION.PLANNING.STATUS, extra),
    actuals:(action,extra)=>build(DOMAIN.ACTUALS, action, extra)
  });

  window.RestogogoSaveContract = Object.freeze({DOMAIN,ACTION,REASON,normalize,build,actions,reasonFor});
})();
