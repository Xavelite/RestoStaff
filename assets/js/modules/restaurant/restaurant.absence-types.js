(function(){
  const Icons = Restogogo.icons;

  function icon(name){
    return Icons.svg(name);
  }

  function sectionIconName(title){
    const key = String(title || '').toLowerCase();
    if(key.includes('absence'))return 'calendar';
    return 'list';
  }

  function sectionHead(title,meta='',action=null){
    const button=action?`<button type="${action.submit?'submit':'button'}" class="rs-action-button"${action.name?` data-restaurant-action="${esc(action.name)}"`:''}>${action.icon?icon(action.icon):''}<span>${esc(action.label)}</span></button>`:'';
    const headIcon=`<span class="rs-section-title-icon" aria-hidden="true">${icon(sectionIconName(title))}</span>`;
    return `<div class="rs-section-head restaurant-section-head"><div class="rs-content-head-title">${headIcon}<div><h3>${esc(title)}</h3>${meta?`<p>${esc(meta)}</p>`:''}</div></div>${button}</div>`;
  }

  function absenceTypeOptions(value){
    const options=['holiday','sick','unpaid','training','other'];
    return options.map(option=>`<option value="${esc(option)}" ${value===option?'selected':''}>${esc(option[0].toUpperCase()+option.slice(1))}</option>`).join('');
  }

  function paidPolicyOptions(value){
    const options=[['paid','Paid'],['unpaid','Unpaid'],['neutral','Neutral']];
    return options.map(([option,label])=>`<option value="${esc(option)}" ${value===option?'selected':''}>${esc(label)}</option>`).join('');
  }

  function absenceTypeRows(){
    const types=normalizeAbsenceTypeList(absenceTypes || []);
    return types.map(type=>`<tr class="${type.active===false?'is-muted':''}">
      <td><input class="rs-compact-input" data-absence-type-id="${esc(type.id)}" data-absence-type-field="name" value="${esc(type.name)}" placeholder="Absence name"></td>
      <td><input class="rs-compact-input" data-absence-type-id="${esc(type.id)}" data-absence-type-field="code" value="${esc(type.code)}" placeholder="CODE"></td>
      <td><select class="rs-compact-input" data-absence-type-id="${esc(type.id)}" data-absence-type-field="category">${absenceTypeOptions(type.category)}</select></td>
      <td><select class="rs-compact-input" data-absence-type-id="${esc(type.id)}" data-absence-type-field="paidPolicy">${paidPolicyOptions(type.paidPolicy)}</select></td>
      <td><input class="rs-compact-input" data-absence-type-id="${esc(type.id)}" data-absence-type-field="payrollCode" value="${esc(type.payrollCode || '')}" placeholder="Payroll code"></td>
      <td><input class="rs-compact-input" type="color" data-absence-type-id="${esc(type.id)}" data-absence-type-field="color" value="${esc(type.color || '#94a3b8')}"></td>
      <td><label class="rs-check-toggle"><input type="checkbox" data-absence-type-id="${esc(type.id)}" data-absence-type-field="requiresApproval" ${type.requiresApproval!==false?'checked':''}><span>Approval</span></label></td>
      <td><label class="rs-check-toggle"><input type="checkbox" data-absence-type-id="${esc(type.id)}" data-absence-type-field="active" ${type.active!==false?'checked':''}><span>Active</span></label></td>
    </tr>`).join('');
  }

  function card(absenceTypes=[]){
    return `<section class="rs-section-surface rs-workbench-card restaurant-card restaurant-absence-types-card">
      ${sectionHead('Absence types','Manage the leave categories employees and managers can use.',{name:'add-absence-type',label:'Add type',icon:'plus'})}
      <div class="restaurant-hours-table-wrap">
        <table class="restaurant-hours-table restaurant-absence-types-table rs-table">
          <thead><tr><th>Name</th><th>Code</th><th>Category</th><th>Pay</th><th>Payroll</th><th>Color</th><th>Rule</th><th>Status</th></tr></thead>
          <tbody>${absenceTypeRows()}</tbody>
        </table>
      </div>
    </section>`;
  }


  Restogogo.modules.RestaurantAbsenceTypesView = Object.freeze({card});
})();
