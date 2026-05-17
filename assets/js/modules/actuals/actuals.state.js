(function(){
  const state={search:'',roleFilter:'all',employeeScope:'relevant',statusFilter:'all'};
  function filters(){return {search:state.search,roleFilter:state.roleFilter,employeeScope:state.employeeScope,statusFilter:state.statusFilter};}
  function setSearch(value){state.search=value||'';}
  function setFilter(group,value){
    if(group==='scope')state.employeeScope=value||'relevant';
    if(group==='role')state.roleFilter=value||'all';
    if(group==='status')state.statusFilter=value||'all';
  }
  function resetFilters(){state.search='';state.roleFilter='all';state.employeeScope='relevant';state.statusFilter='all';}
  Restogogo.actuals=Object.assign(Restogogo.actuals||{},{state,filters,setSearch,setFilter,resetFilters});
})();
