/* restogogo planning module — state, mutation helper and core utils.
 * Establishes Restogogo.planningModule (P); extended by subsequent files.
 * No planning symbols are exposed on window. */
(function(){
  const P = Restogogo.planningModule = {};
  const PlanningLogic = Restogogo.logic.planning;

  P.state = {
    selectedDay:    '',
    selectedRow:    '',
    openZoneKey:    '',
    openEditKey:    '',
    search:         '',
    jobFunctionFilter: 'all',
    view:           'all'
  };

  P.workflow = function workflow(){
    return Restogogo.logic?.workflow;
  };

  P.editability = function editability(){
    return P.workflow()?.canEditPlanning?.(data) || {ok:true,reason:'editable',message:''};
  };

  P.statusEditability = function statusEditability(){
    return P.workflow()?.canChangePlanningStatus?.(data) || {ok:true,reason:'editable',message:''};
  };

  P.blocked = function blocked(check){
    if(check?.ok !== false)return false;
    Restogogo.ui?.toast?.(check.message || 'This planning week is locked.',{tone:'warning',icon:'alert',centered:true,timeout:2200});
    return true;
  };

  P.showToast = function showToast(message,type='success'){
    Restogogo.ui?.toast?.(message,{tone:type==='danger'?'danger':'success',icon:type==='danger'?'alert':'check',centered:true,timeout:2600});
  };

  P.commitMutation = function commitMutation(saveAction,mutate,options){
    return Restogogo.stateService.commitStateMutation(Object.assign({
      saveAction,
      mutate,
      render(){ Restogogo.shell.render(); },
      errorMessage:'Planning change was not saved. The change was rolled back.'
    }, options || {}));
  };

  P.refreshAll = function refreshAll(){
    return P.commitMutation(window.RestogogoSaveContract.actions.planningUpdate(), null);
  };

  P.snapshotRows = function snapshotRows(weekStart){
    const h = data.history?.[weekStart];
    if(!h) return [];
    return PlanningLogic.weekRows({planningSlots:h.planningSlots||{}});
  };
})();
