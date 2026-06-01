/*
 * restogogo app layout.
 * One deterministic rule: Badge Terminal is kiosk; every other authenticated page uses the app topbar.
 */
(function registerAppLayout(){
  const KIOSK_PAGE = 'badge-terminal';
  const APP_CHROME_CLASS = 'has-app-chrome';
  const KIOSK_CLASS = 'badge-terminal-mode';

  function el(id){ return document.getElementById(id); }

  function isKioskPage(pageId){
    return pageId === KIOSK_PAGE;
  }

  function syncPageModeClasses(pageId){
    Object.values(Restogogo.registry.pages).forEach(page => {
      if(page.modeClass) document.body.classList.toggle(page.modeClass, page.id === pageId);
      if(page.htmlModeClass) document.documentElement.classList.toggle(page.htmlModeClass, page.id === pageId);
    });
  }

  function renderNavigation({ pageId, role, showChrome }){
    const nav = el('appTopNav');
    if(!nav) return;

    if(!showChrome){
      nav.replaceChildren();
      nav.hidden = true;
      return;
    }

    const items = Restogogo.registry.navItems(role);
    nav.innerHTML = items.map(item => {
      const activeClass = item.id === pageId ? ' is-active' : '';
      const icon = item.icon && Restogogo.icons ? `<span class="app-nav-link__icon">${Restogogo.icons.svg(item.icon)}</span>` : '';
      return `<button type="button" class="app-nav-link${activeClass}" data-app-page="${esc(item.id)}">${icon}<span>${esc(item.title)}</span></button>`;
    }).join('');
    nav.hidden = items.length === 0;
  }

  function apply({ pageId, role, loggedOut = false } = {}){
    const resolvedPageId = pageId || Restogogo.registry.activePage() || Restogogo.registry.roleHome(role);
    const kiosk = isKioskPage(resolvedPageId);
    const showChrome = !loggedOut && !kiosk;

    syncPageModeClasses(resolvedPageId);

    document.body.classList.toggle(APP_CHROME_CLASS, showChrome);
    document.body.classList.toggle(KIOSK_CLASS, !loggedOut && kiosk);
    document.documentElement.classList.toggle(KIOSK_CLASS, !loggedOut && kiosk);

    const topbar = el('appTopbar');
    if(topbar) topbar.hidden = !showChrome;

    renderNavigation({ pageId: resolvedPageId, role, showChrome });
    return { pageId: resolvedPageId, showChrome, kiosk };
  }

  Restogogo.appLayout = { apply, isKioskPage, renderNavigation };
})();
