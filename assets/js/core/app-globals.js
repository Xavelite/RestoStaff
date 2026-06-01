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
/* Derive from primitives — single canonical source. Current modules use the
   short names; new shared logic should prefer Restogogo.constants.DAYS/SHIFTS. */
var days = Restogogo.primitives.DAYS;
var shifts = Restogogo.primitives.SHIFTS;
var data;
var session = {role:'', employeeId:null};
var notifOpen = false;
var notifRead = {};
var storageReadOnly = false;
var dataLoadedFromSupabase = false;
var lastDataReadStatus = 'idle';

Restogogo.constants = Object.assign(Restogogo.constants || {}, {
  DAYS:   Restogogo.primitives.DAYS,   // canonical uppercase — use in new code
  SHIFTS: Restogogo.primitives.SHIFTS, // canonical uppercase — use in new code
  days,
  shifts,
});
Restogogo.state = Restogogo.state || {};
Object.defineProperties(Restogogo.state, {
  data: {get(){return data;}, set(value){data=value;}},
  session: {get(){return session;}, set(value){session=value;}},
  storageReadOnly: {get(){return storageReadOnly;}, set(value){storageReadOnly=!!value;}},
  dataLoadedFromSupabase: {get(){return dataLoadedFromSupabase;}, set(value){dataLoadedFromSupabase=!!value;}},
  lastDataReadStatus: {get(){return lastDataReadStatus;}, set(value){lastDataReadStatus=String(value||'idle');}},
});
