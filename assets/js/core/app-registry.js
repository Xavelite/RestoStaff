/*
 * restogogo page registry.
 * Single source of truth for page access, labels and module ownership.
 */
(function registerAppPages(){
  const OWNER = 'owner';
  const MANAGER = 'manager';
  const EMPLOYEE = 'employee';
  const MANAGERIAL_ROLES = Object.freeze([OWNER, MANAGER]);

  const pages = {
    home: {
      id: 'home',
      title: 'Home',
      icon: 'home',
      route: 'home',
      mountId: 'homeRoot',
      roles: [OWNER, MANAGER],
      nav: true,
      moduleKey: 'home',
      repository: 'workspace',
      shell: 'standard',
      metricsProvider: 'module',
      actionsProvider: 'module',
      stateProvider: 'module',
      modeClass: 'home-mode',
      defaultPeriod: 'week',
      defaultWeek: true
    },
    planning: {
      id: 'planning',
      title: 'Planning',
      icon: 'calendar',
      route: 'planning',
      mountId: 'planningRoot',
      roles: [OWNER, MANAGER],
      nav: true,
      moduleKey: 'planning',
      repository: 'planning',
      shell: 'weekly',
      metricsProvider: 'module',
      actionsProvider: 'module',
      stateProvider: 'module',
      modeClass: 'planning-mode',
      defaultPeriod: 'week',
      defaultWeek: true
    },
    actuals: {
      id: 'actuals',
      title: 'Actuals',
      icon: 'clock',
      route: 'actuals',
      mountId: 'actualsRoot',
      roles: [OWNER, MANAGER],
      nav: true,
      moduleKey: 'actuals',
      repository: 'actuals',
      shell: 'weekly',
      metricsProvider: 'module',
      actionsProvider: 'module',
      stateProvider: 'module',
      modeClass: 'actuals-mode',
      defaultPeriod: 'week',
      defaultWeek: true
    },
    restaurant: {
      id: 'restaurant',
      title: 'Restaurant',
      icon: 'restaurant',
      route: 'restaurant',
      mountId: 'restaurantRoot',
      roles: [OWNER],
      nav: true,
      moduleKey: 'restaurant',
      repository: 'restaurant',
      shell: 'workbench',
      metricsProvider: 'module',
      actionsProvider: 'module',
      stateProvider: 'module',
      modeClass: 'restaurant-mode',
      defaultPeriod: 'none'
    },
    team: {
      id: 'team',
      title: 'Team',
      icon: 'users',
      route: 'team',
      mountId: 'teamRoot',
      roles: [OWNER, MANAGER],
      nav: true,
      moduleKey: 'team',
      repository: 'team',
      shell: 'workbench',
      metricsProvider: 'module',
      actionsProvider: 'module',
      stateProvider: 'module',
      modeClass: 'team-mode',
      defaultPeriod: 'none'
    },
    'employee-schedule': {
      id: 'employee-schedule',
      title: 'My Schedule',
      icon: 'calendar',
      route: 'employee-schedule',
      mountId: 'employeeScheduleRoot',
      roles: [EMPLOYEE],
      nav: true,
      moduleKey: 'employee-self-service',
      repository: 'employee-self-service',
      shell: 'employee-weekly',
      metricsProvider: 'module',
      actionsProvider: 'module',
      stateProvider: 'module',
      modeClass: 'employee-schedule-mode',
      defaultPeriod: 'week',
      defaultWeek: true
    },
    'employee-time': {
      id: 'employee-time',
      title: 'My Time',
      icon: 'clock',
      route: 'employee-time',
      mountId: 'employeeTimeRoot',
      roles: [EMPLOYEE],
      nav: true,
      moduleKey: 'employee-self-service',
      repository: 'employee-self-service',
      shell: 'employee-weekly',
      metricsProvider: 'module',
      actionsProvider: 'module',
      stateProvider: 'module',
      modeClass: 'employee-time-mode',
      defaultPeriod: 'week',
      defaultWeek: true
    },
    'badge-terminal': {
      id: 'badge-terminal',
      title: 'Badge Terminal',
      icon: 'badge',
      route: 'badge-terminal',
      mountId: 'badgeTerminalRoot',
      roles: [OWNER, MANAGER, EMPLOYEE],
      nav: false,
      moduleKey: 'badge',
      repository: 'badge',
      shell: 'kiosk',
      metricsProvider: 'module',
      actionsProvider: 'module',
      stateProvider: 'module',
      modeClass: 'badge-terminal-mode',
      htmlModeClass: 'badge-terminal-mode',
      defaultPeriod: 'day',
      defaultWeek: true
    }
  };

  // Delegate to the canonical implementations in auth-domain.js.
  function normalizeRole(role){
    return window.RestogogoAuthDomain.normalizeRole(role);
  }
  function isKnownRole(role){
    return window.RestogogoAuthDomain.isKnownRole(role);
  }

  function isOwner(role){ return normalizeRole(role) === OWNER; }
  function isManager(role){ return normalizeRole(role) === MANAGER; }
  function isEmployee(role){ return normalizeRole(role) === EMPLOYEE; }
  function isOwnerOrManager(role){ return MANAGERIAL_ROLES.includes(normalizeRole(role)); }

  function roleHome(role){
    const normalizedRole = normalizeRole(role);
    if(MANAGERIAL_ROLES.includes(normalizedRole))return 'home';
    if(normalizedRole === EMPLOYEE)return 'employee-schedule';
    return '';
  }

  function canAccess(pageId, role){
    const normalizedRole = normalizeRole(role);
    return !!normalizedRole && !!pages[pageId]?.roles?.includes(normalizedRole);
  }

  function resolvePage(pageId, role){
    const requested = String(pageId || '').trim();
    return canAccess(requested, role) ? requested : roleHome(role);
  }

  function pageElementId(pageId){
    return `page-${pageId}`;
  }

  function navItems(role){
    const normalizedRole = normalizeRole(role);
    if(!normalizedRole)return [];
    return Object.values(pages).filter(page => page.nav && page.roles.includes(normalizedRole));
  }

  function pageTitle(pageId, role){
    const home = roleHome(role) || 'home';
    const resolved = pages[pageId] ? pageId : home;
    return pages[resolved]?.title || pages[home]?.title || '';
  }

  function defaultWeekPages(){
    return new Set(Object.values(pages).filter(page => page.defaultWeek).map(page => page.id));
  }

  function moduleKeys(){
    return [...new Set(Object.values(pages).map(page => page.moduleKey).filter(Boolean))];
  }

  function activePage(){
    const active = document.querySelector('.page.active');
    return active ? active.id.replace(/^page-/,'') : '';
  }

  function activeModuleKey(){
    return pages[activePage()]?.moduleKey || '';
  }

  function renderActiveModule(){
    const moduleKey = activeModuleKey();
    if(Restogogo.modulePlatform?.renderPage)return Restogogo.modulePlatform.renderPage(activePage());
    Restogogo[moduleKey]?.render?.();
  }

  function bindModules(){
    if(Restogogo.modulePlatform?.bindAll)return Restogogo.modulePlatform.bindAll();
    moduleKeys().forEach(moduleKey => Restogogo[moduleKey]?.bind?.());
  }

  Restogogo.registry = {
    pages,
    roleHome,
    canAccess,
    resolvePage,
    pageElementId,
    normalizeRole,
    isKnownRole,
    isOwner,
    isManager,
    isEmployee,
    isOwnerOrManager,
    navItems,
    pageTitle,
    defaultWeekPages,
    moduleKeys,
    activePage,
    activeModuleKey,
    renderActiveModule,
    bindModules
  };
})();
