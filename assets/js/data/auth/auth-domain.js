/* restogogo auth domain helpers.
 * Pure normalization and message helpers shared by auth ownership modules.
 */
(function(){
  function normalizeEmail(value){return String(value || '').trim().toLowerCase();}

  const KNOWN_ROLES = Object.freeze(['owner','manager','employee']);

  /* normalizeRole is intentionally strict. Unknown or missing runtime roles must
   * stay invalid instead of silently becoming employee. Access decisions should
   * block invalid roles at the session boundary; display code can choose its own
   * explicit label fallback where needed. */
  function normalizeRole(role){
    const value = String(role || '').trim().toLowerCase();
    if(!value)return '';
    if(!KNOWN_ROLES.includes(value)){
      Restogogo?.warn?.(`[auth-domain] unknown role "${role}"`);
      return '';
    }
    return value;
  }

  function requireKnownRole(role, message='Workspace role is missing or invalid.'){
    const value = normalizeRole(role);
    if(!value)throw new Error(message);
    return value;
  }

  function authErrorMessage(payload={}, fallback='Supabase Auth request failed'){
    const raw = String(payload.error_description || payload.msg || payload.message || '').trim();
    const lower = raw.toLowerCase();
    if(lower.includes('already registered') || lower.includes('already been registered') || lower.includes('user already registered') || lower.includes('already exists'))return 'This email already has an account. Sign in with it, or use a different email for a new restaurant.';
    if(lower.includes('invalid email'))return 'Enter a valid email address.';
    if(lower.includes('password') && (lower.includes('weak') || lower.includes('short') || lower.includes('six') || lower.includes('6')))return 'Choose a stronger password with at least 6 characters.';
    if(lower.includes('invalid login credentials'))return 'The email or password is incorrect.';
    if(lower.includes('email not confirmed'))return 'Confirm your email address, then sign in again.';
    return raw || fallback;
  }

  function normalizeOwnerSetupDetails(details={}){
    return {
      firstName:String(details.firstName || '').trim(),
      lastName:String(details.lastName || '').trim(),
      email:normalizeEmail(details.email),
      restaurantName:String(details.restaurantName || '').trim(),
      city:String(details.city || '').trim(),
      defaultZoneName:String(details.defaultZoneName || '').trim() || 'Restaurant',
      defaultPositionName:String(details.defaultPositionName || '').trim() || 'Staff',
      employees:Array.isArray(details.employees) ? details.employees.map(employee=>({name:String(employee?.name || employee?.displayName || '').trim()})).filter(employee=>employee.name) : []
    };
  }

  function quickSessionExpired(payload){
    const raw = payload?.quick_session_expires_at || payload?.expires_at || '';
    if(!raw)return !!payload;
    const expiry = new Date(raw).getTime();
    return !Number.isFinite(expiry) || expiry <= (Date.now() + 60000);
  }

  function emailConfirmedSessionMissing(payload){
    return !!(payload?.user || payload?.id) && !payload?.access_token && !payload?.session?.access_token;
  }

  function isKnownRole(role){
    return !!normalizeRole(role);
  }
  function isOwnerRole(role){return normalizeRole(role) === 'owner';}
  function isOwnerOrManagerRole(role){return ['owner','manager'].includes(normalizeRole(role));}

  window.RestogogoAuthDomain = Object.freeze({
    normalizeEmail,
    normalizeRole,
    requireKnownRole,
    isKnownRole,
    authErrorMessage,
    normalizeOwnerSetupDetails,
    quickSessionExpired,
    emailConfirmedSessionMissing,
    isOwnerRole,
    isOwnerOrManagerRole
  });
})();
