/**
 * Local data adapter
 * ------------------
 * This is the single storage boundary for the local prototype.
 * The UI should not talk directly to localStorage anymore.
 *
 * Next step: add a SupabaseDataAdapter with the same method names.
 */
(function(){
  const KEYS = Object.freeze({
    planner: 'bb_v14',
    session: 'bb_session',
    loggedIn: 'bb_logged',
    notificationsRead: 'bb_notif_read',
    showZeroRows: 'bb_show_zero_rows',
    showMetrics: 'bb_show_metrics'
  });

  function readString(key, fallback = null){
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function writeString(key, value){
    try {
      window.localStorage.setItem(key, String(value));
      return true;
    } catch {
      return false;
    }
  }

  function remove(key){
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function readJSON(key, fallback = null){
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value){
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  const LocalDataAdapter = {
    mode: 'local',

    KEYS,

    readPlanner(){
      return readJSON(KEYS.planner, null);
    },

    savePlanner(plannerData){
      return writeJSON(KEYS.planner, plannerData);
    },

    resetPlanner(){
      return remove(KEYS.planner);
    },

    readSession(fallback){
      return readJSON(KEYS.session, fallback);
    },

    saveSession(session){
      return writeJSON(KEYS.session, session);
    },

    isLoggedIn(){
      return readString(KEYS.loggedIn, '0') === '1';
    },

    setLoggedIn(value){
      return value ? writeString(KEYS.loggedIn, '1') : remove(KEYS.loggedIn);
    },

    readNotificationsRead(){
      return readJSON(KEYS.notificationsRead, {});
    },

    saveNotificationsRead(value){
      return writeJSON(KEYS.notificationsRead, value || {});
    },

    readPreference(key, fallback = null){
      return readString(key, fallback);
    },

    savePreference(key, value){
      return writeString(key, value);
    },

    // Generic helpers kept for migration compatibility.
    getJSON: readJSON,
    setJSON: writeJSON,
    getString: readString,
    setString: writeString,
    remove
  };

  window.LocalDataAdapter = LocalDataAdapter;
  window.DataAdapter = window.DataAdapter || LocalDataAdapter;
})();
