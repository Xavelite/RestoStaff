/*
 * restogogo app shell
 * Shared state, login/session, routing, persistence, notifications and helpers.
 * Page-specific rendering and behavior live in the product page modules.
 */

window.Restogogo = window.Restogogo || {};
const Restogogo = window.Restogogo;
Restogogo.config = Object.assign({debug:false}, window.APP_CONFIG || {}, Restogogo.config || {});
Restogogo.log = function log(...args){ if(Restogogo.config.debug) console.info(...args); };
Restogogo.warn = function warn(...args){ if(Restogogo.config.debug) console.warn(...args); };
Restogogo.core = Restogogo.core || {};
Restogogo.services = Restogogo.services || {};
Restogogo.pages = Restogogo.pages || {};

function $(id){return document.getElementById(id);}
var days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
var shifts = ['Lunch','Evening'];
var defaultPositionPalette = ['#14b8a6','#f0b84a','#8b5cf6','#60a5fa','#64748b','#22c7d7','#c084fc'];
var data;
var session = {role:'employee', employeeId:null};
var positions = [];
var notifOpen = false;
var notifRead = {};
var storageReadOnly = false;
var dataLoadedFromSupabase = false;
var lastDataReadStatus = 'idle';
var workspaceCatalog = [];

var PILOT_OWNER_PIN = '0000';
var WORKSPACE_ROUTE_ALIASES = {bouillon:'bouillon-bruxelles'};


Restogogo.constants = Object.assign(Restogogo.constants || {}, {
  days,
  shifts,
  pilotOwnerPin: PILOT_OWNER_PIN
});
Restogogo.state = Restogogo.state || {};
Object.defineProperties(Restogogo.state, {
  data: {get(){return data;}, set(value){data=value;}},
  session: {get(){return session;}, set(value){session=value;}},
  positions: {get(){return positions;}, set(value){positions=value;}},
  storageReadOnly: {get(){return storageReadOnly;}, set(value){storageReadOnly=!!value;}},
  dataLoadedFromSupabase: {get(){return dataLoadedFromSupabase;}, set(value){dataLoadedFromSupabase=!!value;}},
  lastDataReadStatus: {get(){return lastDataReadStatus;}, set(value){lastDataReadStatus=String(value||'idle');}},
  workspaceCatalog: {get(){return workspaceCatalog;}, set(value){workspaceCatalog=Array.isArray(value)?value:[];}}
});
