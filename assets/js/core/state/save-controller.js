/* Save readiness and save controller helpers. */
var saveController = {
  status:'idle',
  inFlight:false,
  pending:false,
  pendingReason:'',
  pendingOptions:null,
  lastError:'',
  lastSavedAt:'',
  lastReason:''
};
let activeSavePromise = null;

let lastSaveNotice = '';
function coreSetupCounts(source=data){
  const setup = isPlainObject(source?.restaurantSetup) ? source.restaurantSetup : {};
  return {
    employees:Array.isArray(source?.employees) ? source.employees.length : 0,
    zones:Array.isArray(setup.zones) ? setup.zones.length : 0,
    jobFunctions:Array.isArray(setup.jobFunctions) ? setup.jobFunctions.length : 0
  };
}
function setupRequirements(source=data){
  const target = source || {};
  const setup = isPlainObject(target.restaurantSetup) ? target.restaurantSetup : {};
  const employees = Array.isArray(target.employees) ? target.employees : [];
  const zones = Array.isArray(setup.zones) ? setup.zones : [];
  const setupJobFunctions = Array.isArray(setup.jobFunctions) ? setup.jobFunctions : [];
  const missing = [];
  if(!employees.some(employee=>employee?.active !== false)) missing.push({key:'employee',label:'Add at least one active employee',page:'team'});
  if(!zones.some(zone=>zone?.active !== false && String(zone?.name || '').trim())) missing.push({key:'zone',label:'Add at least one active zone',page:'restaurant'});
  if(!setupJobFunctions.some(jobFunction=>jobFunction?.active !== false && String(jobFunction?.name || '').trim())) missing.push({key:'Job function',label:'Add at least one active job function',page:'restaurant'});
  return {ready:missing.length === 0, missing};
}
function isSetupReady(source=data){return setupRequirements(source).ready;}
function notifySaveIssue(message,tone='danger'){
  const text=String(message||'Save failed. Please refresh and try again.');
  const key=`${tone}:${text}`;
  if(lastSaveNotice===key)return;
  lastSaveNotice=key;
  Restogogo.ui?.toast?.(text,{tone,icon:tone==='warning'?'alert':'close',centered:true,timeout:3600});
}
function clearSaveIssueNotice(){
  lastSaveNotice='';
}

function updateSaveController(nextState={}){
  Object.assign(saveController, nextState);
  Restogogo.state.save = Object.assign({}, saveController);
}

function validateStateBeforeSave(){
  const validation = validatePlannerState(data);
  Restogogo.state.validation = validation;
  if(!validation.ok){
    updateSaveController({status:'error', lastError:validation.errors.join(' | ')});
    Restogogo.warn?.('restogogo save blocked by invalid state', validation.errors);
  }
  return validation;
}
