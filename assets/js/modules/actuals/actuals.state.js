(function(){
  const state={search:'',roleFilter:'all',employeeScope:'all',statusFilter:'all',selectedDay:'',selectedRow:''};
  function filters(){return {search:state.search,roleFilter:state.roleFilter,employeeScope:state.employeeScope,statusFilter:state.statusFilter};}
  function setSearch(value){state.search=value||'';}
  function setFilter(group,value){
    if(group==='scope')state.employeeScope=value||'relevant';
    if(group==='role')state.roleFilter=value||'all';
    if(group==='status')state.statusFilter=value||'all';
  }
  function resetFilters(){state.search='';state.roleFilter='all';state.employeeScope='all';state.statusFilter='all';state.selectedDay='';state.selectedRow='';}
  function selectDay(day){state.selectedDay=state.selectedDay===day?'':day;}
  function selectRow(key){state.selectedRow=state.selectedRow===key?'':key;}
  Restogogo.actuals=Object.assign(Restogogo.actuals||{},{state,filters,setSearch,setFilter,resetFilters,selectDay,selectRow});
})();
