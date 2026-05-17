/*
 * restogogo page registry.
 * Single source of truth for page access, labels and module ownership.
 */
(function registerAppPages(){
  const pages = {
    planning: {
      id: 'planning',
      title: 'Planning',
      roles: ['owner'],
      nav: true,
      moduleKey: 'planning',
      modeClass: 'planning-mode',
      defaultWeek: true
    },
    actuals: {
      id: 'actuals',
      title: 'Actuals',
      roles: ['owner'],
      nav: true,
      moduleKey: 'actuals',
      modeClass: 'actuals-mode',
      defaultWeek: true
    },
    team: {
      id: 'team',
      title: 'Team',
      roles: ['owner'],
      nav: true,
      moduleKey: 'team',
      modeClass: 'team-mode'
    },
    restaurant: {
      id: 'restaurant',
      title: 'Restaurant',
      roles: ['owner'],
      nav: true,
      moduleKey: 'restaurant',
      modeClass: 'restaurant-mode'
    },
    'badge-terminal': {
      id: 'badge-terminal',
      title: 'Badge Terminal',
      roles: ['owner','employee'],
      nav: false,
      moduleKey: 'badge',
      modeClass: 'badge-terminal-mode',
      htmlModeClass: 'badge-terminal-mode',
      defaultWeek: true
    },
    'employee-schedule': {
      id: 'employee-schedule',
      title: 'My Schedule',
      roles: ['employee'],
      nav: true,
      moduleKey: 'employeeSchedule',
      modeClass: 'employee-schedule-mode',
      defaultWeek: true
    },
    'employee-time': {
      id: 'employee-time',
      title: 'My Time',
      roles: ['employee'],
      nav: true,
      moduleKey: 'employeeSchedule',
      modeClass: 'employee-time-mode',
      defaultWeek: true
    }
  };

  function roleHome(role){
    return normalizeRole(role) === 'owner' ? 'planning' : 'employee-schedule';
  }

  function canAccess(pageId, role){
    return !!pages[pageId]?.roles?.includes(normalizeRole(role));
  }

  function resolvePage(pageId, role){
    const requested = String(pageId || '').trim();
    return canAccess(requested, role) ? requested : roleHome(role);
  }

  function pageElementId(pageId){
    return `page-${pageId}`;
  }

  function normalizeRole(role){
    const clean = String(role || '').trim().toLowerCase();
    return ['owner','manager','admin'].includes(clean) ? 'owner' : 'employee';
  }

  function navItems(role){
    const normalizedRole = normalizeRole(role);
    return Object.values(pages).filter(page => page.nav && page.roles.includes(normalizedRole));
  }

  function pageTitle(pageId, role){
    const resolved = pages[pageId] ? pageId : roleHome(role);
    return pages[resolved]?.title || pages[roleHome(role)].title;
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
    Restogogo[moduleKey]?.render?.();
  }

  function bindModules(){
    moduleKeys().forEach(moduleKey => Restogogo[moduleKey]?.bind?.());
  }

  Restogogo.registry = {
    pages,
    roleHome,
    canAccess,
    resolvePage,
    pageElementId,
    normalizeRole,
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
