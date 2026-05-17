(function(){
  let bound=false;
  function actualsPrintView(){Restogogo.ui?.toast?.('Opening print view.',{tone:'success',icon:'check',centered:false,timeout:1200});setTimeout(()=>window.print(),80);}
  function changeWeek(delta){Restogogo.router.changeWeek(delta);}
  function setWeek(value){if(!data||!value)return;setWeekStartAndLoad(value);Restogogo.router?.render?.();}
  function openWeekPicker(event){
    if(event){const interactive=event.target.closest('button, input');if(interactive && !event.target.closest('.rs-week-field'))return;}
    const input=$('actualsWeekStart');if(!input)return;if(typeof input.showPicker==='function')input.showPicker();else {input.focus();input.click();}
  }
  function closeMenus(){document.querySelectorAll('.actuals-filter-menu[open], .actuals-actions[open]').forEach(el=>el.removeAttribute('open'));}
  function bind(){
    if(bound)return;bound=true;
    document.addEventListener('input',event=>{if(event.target?.id==='actualSearch'){Restogogo.actuals.setSearch(event.target.value||'');const pos=event.target.selectionStart||Restogogo.actuals.state.search.length;Restogogo.actuals.render();const input=$('actualSearch');input?.focus?.();input?.setSelectionRange?.(pos,pos);}});
    document.addEventListener('change',event=>{if(event.target?.id==='actualsWeekStart')setWeek(event.target.value);});
    document.addEventListener('keydown',event=>{
      if(event.target?.id==='actualSearch' && event.key==='Enter'){event.preventDefault();event.target.blur();return;}
      if(event.key==='Escape'){closeMenus();return;}
      const weekMetric=event.target.closest?.('#actualsWeekMetric');
      if(weekMetric && (event.key==='Enter'||event.key===' ')){event.preventDefault();openWeekPicker(event);}
    });
    document.addEventListener('click',event=>{
      if(event.target.closest('#actualPrevWeek')){event.preventDefault();event.stopPropagation();changeWeek(-7);return;}
      if(event.target.closest('#actualNextWeek')){event.preventDefault();event.stopPropagation();changeWeek(7);return;}
      if(event.target.closest('#actualsWeekMetric')){openWeekPicker(event);return;}
      const filter=event.target.closest('[data-actuals-filter]');
      if(filter){Restogogo.actuals.setFilter(filter.dataset.actualsFilter,filter.dataset.actualsValue);closeMenus();Restogogo.actuals.render();return;}
      if(event.target.closest('[data-actuals-clear-filters]')){Restogogo.actuals.resetFilters();Restogogo.actuals.render();return;}
      const proofCard=event.target.closest('[data-actuals-proof]');
      if(proofCard){Restogogo.actuals.showProof(proofCard.dataset.employeeId,proofCard.dataset.day,proofCard.dataset.shift);return;}
      const action=event.target.closest('[data-actuals-action]')?.dataset.actualsAction;
      if(action){closeMenus();}
      if(action==='export-payroll'){Restogogo.export.actuals.payroll();return;}
      if(action==='export-summary'){Restogogo.export.actuals.summary();return;}
      if(action==='export-details'){Restogogo.export.actuals.details();return;}
      if(action==='export-anomalies'){Restogogo.export.actuals.anomalies();return;}
      if(action==='print'){actualsPrintView();return;}
      if(!event.target.closest('.actuals-filter-menu, .actuals-actions'))closeMenus();
    });
  }
  Restogogo.actuals=Object.assign(Restogogo.actuals||{},{bind});
})();
