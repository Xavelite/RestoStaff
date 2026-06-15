/* restogogo workspace/session service — DB v2 runtime context.
 * Resolves the authenticated user's current profile, restaurant, membership,
 * setup state and employee link. Modules should depend on this context rather
 * than direct storage reads.
 */
(function(){
  const Restogogo = window.Restogogo = window.Restogogo || {};
  const store = window.RestogogoSessionStore;
  const KEY = 'restogogo.currentRestaurantId.v2';
  let currentContext = null;

  function pickMembership(preferred){
    const auth = window.RestogogoAuthService;
    // Try candidates in priority order; fall back to first available membership so
    // a fresh-wizard owner whose APP_CONFIG default slug differs from their new
    // restaurant's slug is not left stranded on reload.
    const candidates = [
      preferred,
      store?.getString?.(KEY, ''),
      window.DataAdapter?.getWorkspaceId?.()
    ].filter(Boolean);
    for(const id of candidates){
      const m = auth?.membershipForWorkspace?.(id);
      if(m) return m;
    }
    return auth?.memberships?.()?.[0] || null;
  }
  async function loadCurrentContext(preferredRestaurantId=''){
    const auth = window.RestogogoAuthService;
    if(!auth?.isAuthenticated?.()){
      currentContext = null;
      return null;
    }
    await auth.fetchMemberships();
    const membership = pickMembership(preferredRestaurantId);
    if(!membership){
      currentContext = null;
      return null;
    }
    const restaurantId = membership.restaurant_id;
    if(!auth.getWorkspaceContext)throw new Error('Workspace context RPC is not available. Refresh the app.');
    const contextPayload = await auth.getWorkspaceContext(restaurantId);
    if(!contextPayload?.restaurant?.id)throw new Error('Workspace context RPC returned an invalid restaurant context.');
    const restaurant = contextPayload.restaurant;
    const settings = contextPayload?.settings || contextPayload?.restaurant_settings || {};
    const onboardingState = contextPayload?.onboarding_state || contextPayload?.restaurant_onboarding_state || {};
    const resolvedMembership = contextPayload?.membership || membership;
    const employee = contextPayload?.employee || null;
    const role = window.RestogogoAuthDomain?.requireKnownRole?.(resolvedMembership.role, 'Workspace membership role is missing or invalid.');
    currentContext = Object.freeze({
      authUser: auth.getUser?.() || null,
      membership: resolvedMembership,
      restaurant,
      settings,
      onboardingState,
      restaurantId: restaurant.id || restaurantId,
      workspaceSlug: restaurant?.workspace_slug || resolvedMembership.workspace_slug || '',
      restaurantName: restaurant?.name || resolvedMembership.restaurant_name || 'Restaurant',
      role,
      employeeId: resolvedMembership.employee_id || employee?.id || null,
      employee,
      workspaceCreated: ['workspace_created','entered_workspace'].includes(String(onboardingState?.state || ''))
    });
    store?.setString?.(KEY, restaurantId);
    window.DataAdapter?.setWorkspaceId?.(restaurantId);
    return currentContext;
  }

  function current(){return currentContext;}
  function clear(){currentContext = null; store?.remove?.(KEY);}

  Restogogo.workspace = Object.freeze({
    loadCurrentContext,
    current,
    clear,
    pickMembership
  });
})();
