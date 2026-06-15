/* restogogo role-access service.
 * Owns role normalization, membership shaping and client-side role assertions.
 * Server-side RPCs remain the authority; these checks fail fast in the UI.
 */
(function(){
  const domain = window.RestogogoAuthDomain;
  if(!domain)throw new Error('RestogogoAuthDomain must load before RestogogoRoleAccessService.');
  const {normalizeRole, requireKnownRole} = domain;

  function normalizeMembership(row){
    return {
      restaurant_id: row?.restaurant_id || '',
      workspace_slug: row?.workspace_slug || '',
      restaurant_name: row?.restaurant_name || row?.workspace_slug || 'Restaurant',
      role: requireKnownRole(row?.role, 'Membership role is missing or invalid.'),
      employee_id: row?.employee_id || null,
      status: row?.status || 'active',
      is_active: row?.status !== 'disabled'
    };
  }

  function runtimeSessionFromMembership(member){
    if(!member)return {role:'', employeeId:null};
    return {role:requireKnownRole(member.role, 'Membership role is missing or invalid.'), employeeId:member.employee_id || null};
  }

  function roleForRestaurant(restaurantId, memberships=[]){
    const target = String(restaurantId || '').trim();
    if(!target)return '';
    const member = (Array.isArray(memberships) ? memberships : []).find(row => row?.restaurant_id === target || row?.workspace_slug === target);
    return member ? requireKnownRole(member.role, 'Membership role is missing or invalid.') : '';
  }

  function requireRole(role, predicate, message){
    const cleanRole = normalizeRole(role);
    if(!cleanRole || !predicate(cleanRole))throw new Error(message);
    return cleanRole;
  }

  function requireAuthenticatedRole(restaurantId, predicate, message, memberships=[]){
    return requireRole(roleForRestaurant(restaurantId, memberships), predicate, message);
  }

  window.RestogogoRoleAccessService = Object.freeze({
    normalizeMembership,
    runtimeSessionFromMembership,
    roleForRestaurant,
    requireAuthenticatedRole
  });
})();
