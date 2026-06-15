/*
 * restogogo weekly grid renderer.
 * Shared structural renderer for Planning and Actuals weekly tables.
 * Page modules only provide slot content, totals and page-specific actions.
 */
(function(){
  const R = window.Restogogo = window.Restogogo || {};
  R.services = R.services || {};

  function dayTone(index){return index % 2 ? 'day-alt' : 'day-base';}
  function joinClasses(parts){return (parts || []).filter(Boolean).join(' ');}
  function attrs(values={}){
    return Object.entries(values)
      .filter(([,value])=>value !== undefined && value !== null && value !== false)
      .map(([key,value])=>value === true ? key : `${key}="${esc(value)}"`)
      .join(' ');
  }

  function colgroup(moduleName){
    return `<colgroup><col class="rs-weekly-person-col">${days.map(()=>`<col class="rs-weekly-day-col">`).join('')}<col class="rs-weekly-total-col"></colgroup>`;
  }

  function dayHeader({moduleName,day,index,totals={},headClass='',copyClass='',extraClass='',attributes={}}){
    const dayTotals = totals.dayTotals || {};
    const dayPeople = totals.dayPeople || {};
    const people = dayPeople[day] instanceof Set ? dayPeople[day].size : Number(dayPeople[day] || 0);
    const attrString = attrs(attributes);
    return `<th class="${joinClasses([headClass, 'rs-weekly-day-head', dayTone(index), extraClass])}"${attrString?` ${attrString}`:''}><div class="${joinClasses([copyClass, 'rs-weekly-day-head-copy'])}"><strong>${esc(day.slice(0,3))}</strong><span>${esc(shortDisplayDate(dateForDay(day)))}</span><small>${esc(fmtHours(dayTotals[day] || 0))} · ${esc(fmtPeople(people))}</small></div></th>`;
  }

  function tableHead({moduleName,totals={},dayHeaderRenderer,totalHeadHtml='',personLabel='Employee',personHeadClass='',totalHeadClass=''}){
    const headers = days.map((day,index)=>dayHeaderRenderer ? dayHeaderRenderer(day,index,totals) : dayHeader({moduleName,day,index,totals})).join('');
    return `<thead><tr><th class="${joinClasses([personHeadClass, 'rs-weekly-person-head'])}">${esc(personLabel)}</th>${headers}<th class="${joinClasses([totalHeadClass, 'rs-weekly-total-head'])}">${totalHeadHtml}</th></tr></thead>`;
  }

  function personCell({moduleName,employee,tag='td',cellClass='',cardClass='',avatarClass='',copyClass='',avatarStyle='',leadingHtml='',attributes={}}){
    const attrString = attrs(attributes);
    const style = avatarStyle ? ` style="${esc(avatarStyle)}"` : '';
    const Tag = tag === 'th' ? 'th' : 'td';
    return `<${Tag} class="${joinClasses([cellClass, 'rs-weekly-person-cell'])}"${attrString?` ${attrString}`:''}><div class="${joinClasses([cardClass, 'rs-weekly-person-card'])}"><span class="${joinClasses([avatarClass, 'rs-weekly-avatar'])}"${style}>${esc(employeeInitials(employee.name))}</span><span class="${joinClasses([copyClass, 'rs-weekly-person-copy'])}"><strong>${leadingHtml || ''}${esc(employee.name)}</strong><small>${esc(employeeJobFunctionName(employee))}</small></span></div></${Tag}>`;
  }

  function dayCell({moduleName,day,index,content='',cellClass='',slotsClass='',extraClass=''}){
    return `<td class="${joinClasses([cellClass, 'rs-calendar-cell', 'rs-weekly-day-cell', dayTone(index), extraClass])}"><div class="${joinClasses([slotsClass, 'rs-calendar-slot-grid', 'rs-weekly-day-slots'])}">${content}</div></td>`;
  }

  function totalCell({moduleName,content='',cellClass='',valueClass=''}){
    return `<td class="${joinClasses([cellClass, 'rs-weekly-total-cell'])}"><div class="${joinClasses([valueClass, 'rs-weekly-total-value'])}">${content}</div></td>`;
  }

  function row({moduleName,employee,rowClass='',rowAttributes={},personCellHtml='',dayCellRenderer,totalCellHtml=''}){
    const attrString = attrs(rowAttributes);
    const dayCells = days.map((day,index)=>dayCellRenderer(day,index)).join('');
    return `<tr class="${joinClasses(['calendar-row', rowClass])}"${attrString?` ${attrString}`:''}>${personCellHtml}${dayCells}${totalCellHtml}</tr>`;
  }

  function emptyRow({className='',content='',colspan=9}){
    return `<tr class="${esc(className)}"><td colspan="${Number(colspan)||9}">${content}</td></tr>`;
  }

  function legend({items=[],ariaLabel='Calendar legend',className='' }={}){
    const rows = (items || [])
      .filter(item=>item && item.label)
      .map(item=>`<span class="rs-weekly-legend__item"><i class="${esc(item.className || '')}" aria-hidden="true"></i>${esc(item.label)}</span>`)
      .join('');
    return `<footer class="rs-weekly-legend ${esc(className)}" aria-label="${esc(ariaLabel)}">${rows}</footer>`;
  }

  R.services.weeklyGrid = {colgroup,dayHeader,tableHead,personCell,dayCell,totalCell,row,emptyRow,legend,dayTone};
})();
