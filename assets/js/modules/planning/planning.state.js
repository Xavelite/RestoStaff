/** Planning module slice. Loaded in order by index.html. */
const PlanningLogic = Restogogo.logic.planning;
const Grid = Restogogo.services.weeklyGrid;
const Export = Restogogo.export;
const Metrics = Restogogo.services.metrics;

let selectedPlanningDay = '';
let selectedPlanningRow = '';
let planningOpenZoneKey = '';
let planningSearch = '';
let planningPositionFilter = 'all';
let planningView = 'all';
let planningLastConflictCount = null;
let planningPendingConflictFlash = false;
let planningPendingSlotKey = '';

function planningSlotKey(id,d,s){return `${id}|${d}|${s}`;}
function markPlanningMutation(id,d,s){
  planningPendingConflictFlash = true;
  planningPendingSlotKey = planningSlotKey(id,d,s);
}


function planningShowToast(message,type='success'){
  Restogogo.ui?.toast?.(message,{tone:type==='danger'?'danger':'success',icon:type==='danger'?'alert':'check',centered:true,timeout:2600});
}

function planningCommitMutation(reason, mutate, options={}){
  return Restogogo.stateService.commitStateMutation(Object.assign({
    reason,
    mutate,
    render,
    errorMessage:'Planning change was not saved. The change was rolled back.'
  }, options || {}));
}

function planningRefreshAll(){
  return planningCommitMutation('planning-refresh', null);
}

function planningSnapshotRows(weekStart){
  const h=data.history?.[weekStart];
  if(!h)return [];
  return PlanningLogic.weekRows({
    planning:h.planning||{},
    assignments:h.assignments||{},
    assignmentPositions:h.assignmentPositions||{},
    assignmentTimes:h.assignmentTimes||{}
  });
}

function planningRestartClass(el,className,duration=900){
  if(!el)return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  setTimeout(()=>el.classList.remove(className),duration);
}

function planningApplyMicroFeedback(conflictCount){
  requestAnimationFrame(()=>{
    const countChanged = planningLastConflictCount !== null && planningLastConflictCount !== conflictCount;
    if(planningPendingConflictFlash && countChanged){
      planningRestartClass(document.querySelector('.planning-board .planning-conflict-banner'),'is-flashing',950);
    }
    planningLastConflictCount = conflictCount;
    if(planningPendingSlotKey){
      const slot=[...document.querySelectorAll('.planning-board .planning-slot[data-planning-slot-key]')].find(el=>el.dataset.planningSlotKey===planningPendingSlotKey);
      planningRestartClass(slot,'is-updated',760);
    }
    planningPendingConflictFlash = false;
    planningPendingSlotKey = '';
  });
}
