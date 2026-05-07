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
    showMetrics: 'bb_show_metrics',
    workspaceId: 'restostaff_workspace_id',
    workspaceCatalog: 'restostaff_workspace_catalog'
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
      const workspaceId = this.getWorkspaceId ? this.getWorkspaceId() : 'local';
      return readJSON(KEYS.planner + ':' + workspaceId, readJSON(KEYS.planner, null));
    },

    savePlanner(plannerData){
      const workspaceId = this.getWorkspaceId ? this.getWorkspaceId() : 'local';
      return writeJSON(KEYS.planner + ':' + workspaceId, plannerData);
    },

    resetPlanner(){
      const workspaceId = this.getWorkspaceId ? this.getWorkspaceId() : 'local';
      return remove(KEYS.planner + ':' + workspaceId);
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

    getWorkspaceId(){
      return readString(KEYS.workspaceId, 'local-restaurant');
    },

    getDefaultWorkspaceId(){
      return 'local-restaurant';
    },

    sanitizeWorkspaceId(value){
      const raw = String(value || '').trim().toLowerCase();
      return raw.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64) || 'local-restaurant';
    },

    setWorkspaceId(value){
      const id = this.sanitizeWorkspaceId(value || 'local-restaurant');
      writeString(KEYS.workspaceId, id);
      return id;
    },

    listWorkspaces(){
      return readJSON(KEYS.workspaceCatalog, []);
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
