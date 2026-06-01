/*
 * Shared module identity header renderer.
 * Modules provide meaning; this service keeps the structure and atmosphere consistent.
 */
(function(){
  const services = Restogogo.services = Restogogo.services || {};

  function array(value){
    if(!value)return [];
    return Array.isArray(value) ? value.filter(Boolean) : [value];
  }

  function content(options){
    const moduleName = options.moduleName;
    if(!moduleName || !options.title){
      throw new Error('ModuleHeader requires moduleName and title.');
    }
    const subtitles = array(options.subtitle);
    const subtitleHtml = subtitles.map(text => `<p class="rs-page-subtitle">${esc(text)}</p>`).join('');
    const aside = options.aside || '';

    return `<div class="rs-module-header__content">
      <div class="rs-module-header__identity">
        <div class="rs-module-header__copy">
          <h1 class="rs-page-title">${esc(options.title || '')}</h1>
          ${subtitleHtml}
        </div>
      </div>
      ${aside ? `<div class="rs-module-header__aside">${aside}</div>` : ''}
    </div>`;
  }

  function render(options){
    const moduleName = options.moduleName;
    return `<header class="${esc(moduleName)}-page-head rs-module-header rs-module-header--${esc(moduleName)}">
      ${content(options)}
    </header>`;
  }

  services.moduleHeader = {content,render};
})();
