/* restogogo workspace realtime service — Phase 6A.
 * Broadcast + Presence via @supabase/supabase-js channel API (vendored UMD).
 *
 * All public methods degrade to no-ops when:
 *   - supabase.min.js vendor file failed to load
 *   - WebSocket connection is unavailable (offline / CSP / network)
 *   - No restaurant workspace is active
 *
 * SECURITY / TRUST BOUNDARY (pilot-level):
 *   Broadcast events (planning-saved, badge-entry) and Presence payloads are
 *   UI hints only. They are NOT authoritative DB state. Any action triggered by
 *   a broadcast re-fetches real data from the Supabase DB. The publishable/anon
 *   key is appropriate for Broadcast + Presence because these channels carry no
 *   sensitive data and do not bypass RLS. Before using Realtime for anything
 *   beyond UI hints (live mutations, access control), implement authenticated
 *   channels with signed JWTs.
 *
 * No custom WebSocket protocol — standard Supabase channel API only.
 */
(function(){
  const R = window.Restogogo = window.Restogogo || {};
  R.services = R.services || {};

  let _client       = null;  // supabase client (realtime-only config)
  let _channel      = null;  // active broadcast + presence channel
  let _displayName  = '';
  let _role         = '';
  let _selfKey      = '';    // presence key for this session — used to exclude self from chips

  // Local presence mirror — keyed by session presence-key, value is the latest tracked payload.
  // Updated immediately on track() so getPresence() is synchronous and accurate.
  // Also refreshed on presence:sync events from the server.
  let _localPresence = {};   // { [sessionKey]: { name, role, page, weekStart } }

  // Registered event listeners — Sets so deregistration is O(1).
  // Module bind() guards (if(bound)return) ensure each handler is registered once,
  // so these Sets do not grow across login/logout cycles without page reload.
  const _planningListeners    = new Set();
  const _badgeListeners       = new Set();
  const _presenceSyncListeners = new Set();

  /* True only when the vendor UMD was loaded. */
  function isAvailable(){
    return typeof window.supabase?.createClient === 'function';
  }

  /* The presence key for this session.
   * Uses quick_session_id when available so the same employee logging in twice
   * shows only one chip. Falls back to a random string per page load. */
  function getSelfKey(){ return _selfKey; }

  /* Connect to the workspace channel and begin tracking presence.
   * Safe to call multiple times — disconnects any previous channel first. */
  function connect(restaurantId, displayName, role){
    if(!isAvailable() || !restaurantId) return;
    disconnect();
    _displayName   = String(displayName || 'User').trim();
    _role          = window.RestogogoAuthDomain?.normalizeRole?.(role) || '';
    if(!_role){
      Restogogo.warn?.('[realtime] connect blocked: missing or invalid role');
      return;
    }
    _selfKey       = _makeSessionKey();
    _localPresence = {};

    try{
      _client = window.supabase.createClient(
        window.APP_CONFIG?.supabaseUrl,
        window.APP_CONFIG?.supabaseKey,
        { auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } }
      );

      _channel = _client.channel(`workspace:${restaurantId}`, {
        config:{ broadcast:{ ack:false, self:false }, presence:{ key:_selfKey } }
      });

      _channel
        .on('broadcast', { event:'planning-saved' }, msg => {
          _dispatch(_planningListeners, msg?.payload || {});
        })
        .on('broadcast', { event:'badge-entry' }, msg => {
          _dispatch(_badgeListeners, msg?.payload || {});
        })
        .on('presence', { event:'sync' }, () => {
          _syncLocalPresence();
          // Notify subscribers (e.g. planning view) rather than calling module internals directly.
          _dispatch(_presenceSyncListeners, {});
        })
        .subscribe(status => {
          if(status === 'SUBSCRIBED'){
            _doTrack(_displayName, _role, '', '');
          } else if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'){
            Restogogo.warn?.('[realtime] channel status', status);
          }
        });
    }catch(e){
      Restogogo.warn?.('[realtime] connect error', e);
      _client  = null;
      _channel = null;
    }
  }

  /* Graceful disconnect — cleans up channel, client and local presence.
   * Safe to call even when not connected.
   *
   * Listener Sets (_planningListeners / _badgeListeners) are intentionally NOT
   * cleared here. Module bind() functions (planningBind, actualsActionsBind) are
   * guarded by `if(bound) return` so each handler is registered exactly once per
   * page load and must survive login → logout → login cycles. Clearing them would
   * prevent banners and live-refresh from working after a quick-session switch. */
  function disconnect(){
    try{ _channel?.unsubscribe(); }catch{}
    try{ _client?.removeAllChannels(); }catch{}
    _channel       = null;
    _client        = null;
    _selfKey       = '';
    _localPresence = {};
  }

  /* Broadcast that this session saved planning for a given week. */
  function broadcastPlanningSaved(weekStart, updatedAt, actor){
    _send('planning-saved', { weekStart, updatedAt, actor: String(actor || _displayName) });
  }

  /* Broadcast that a badge entry was recorded. */
  function broadcastBadgeEntry(employeeId, day, shift){
    _send('badge-entry', { employeeId, day, shift });
  }

  /* Update presence payload — called from app-shell.showPage() on every page
   * navigation so presence always reflects where the user currently is. */
  function trackPage(page, weekStart){
    _doTrack(_displayName, _role, page || '', weekStart || '');
  }

  /* Returns the local presence mirror — a plain object keyed by session key.
   * Excludes the current session's own entry.
   * Each value is { name, role, page, weekStart }. */
  function getPresence(){
    const next = {};
    Object.entries(_localPresence || {}).forEach(([key, value]) => {
      if(key !== _selfKey && value?.name) next[key] = value;
    });
    return next;
  }

  /* Register / deregister event callbacks. */
  function onPlanningUpdate(cb)  { if(typeof cb === 'function') _planningListeners.add(cb); }
  function offPlanningUpdate(cb) { _planningListeners.delete(cb); }
  function onBadgeEntry(cb)      { if(typeof cb === 'function') _badgeListeners.add(cb); }
  function offBadgeEntry(cb)     { _badgeListeners.delete(cb); }
  /* Called when the Supabase presence:sync event fires — use this to refresh
   * any UI that shows who else is online. Preferred over the module accessing
   * planningModule.renderPresenceChips directly (which inverts the dependency). */
  function onPresenceSync(cb)    { if(typeof cb === 'function') _presenceSyncListeners.add(cb); }
  function offPresenceSync(cb)   { _presenceSyncListeners.delete(cb); }

  /* ── private helpers ──────────────────────────────────────────────────── */

  function _send(event, payload){
    if(!_channel) return;
    try{ _channel.send({ type:'broadcast', event, payload }); }
    catch(e){ Restogogo.warn?.('[realtime] send error', e); }
  }

  function _doTrack(name, role, page, weekStart){
    if(!_channel) return;
    const payload = { name, role, page: page || '', weekStart: weekStart || '' };
    try{
      _channel.track(payload);
      // Update local mirror immediately — don't wait for async presence:sync.
      _localPresence[_selfKey] = payload;
    }catch{}
  }

  /* Rebuild the local presence mirror from the Supabase channel state.
   * Called on presence:sync events. Excludes own session so getPresence()
   * always returns only OTHER users. */
  function _syncLocalPresence(){
    if(!_channel) return;
    try{
      const state = _channel.presenceState();
      const next  = {};
      Object.entries(state).forEach(([key, entries]) => {
        if(key === _selfKey) return;          // exclude self
        const latest = Array.isArray(entries) ? entries[entries.length - 1] : entries;
        if(latest?.name) next[key] = latest;
      });
      _localPresence = next;
    }catch{}
  }

  function _dispatch(listeners, payload){
    listeners.forEach(cb => {
      try{ cb(payload); }
      catch(e){ Restogogo.warn?.('[realtime] listener error', e); }
    });
  }

  function _makeSessionKey(){
    return String(
      window.RestogogoAuthService?.getQuickSession?.()?.quick_session_id ||
      Math.random().toString(36).slice(2)
    );
  }

  R.services.realtime = Object.freeze({
    isAvailable,
    getSelfKey,
    connect,
    disconnect,
    broadcastPlanningSaved,
    broadcastBadgeEntry,
    trackPage,
    getPresence,
    onPlanningUpdate,
    offPlanningUpdate,
    onBadgeEntry,
    offBadgeEntry,
    onPresenceSync,
    offPresenceSync
  });
})();
