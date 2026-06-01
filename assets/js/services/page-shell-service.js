/*
 * Shared page shell renderer.
 * Owns the standard module shell skeleton so new modules do not invent their
 * own header / metrics / board structure from scratch.
 */
(function(){
  const services = Restogogo.services = Restogogo.services || {};

  function classes(...items){
    return items.flat().filter(Boolean).join(' ');
  }

  function standard(config={}){
    const moduleName = config.moduleName || 'module';
    const shellClass = classes(`${moduleName}-shell`, 'rs-page-shell', config.shellClass);
    const headerClass = classes(`${moduleName}-page-head`, 'rs-module-header', `rs-module-header--${moduleName}`, config.headerClass);
    const metricsClass = classes(`${moduleName}-summary`, 'rs-page-metrics', 'rs-metrics-row', config.metricsClass);
    const boardClass = classes(`${moduleName}-board`, 'rs-page-board', config.boardClass);
    const boardTag = config.boardTag || 'section';
    const metricsTag = config.metricsTag || 'section';
    const headerId = config.headerId || `${moduleName}Header`;
    const metricsId = config.metricsId || `${moduleName}Metrics`;
    const boardId = config.boardId || `${moduleName}Board`;
    const metricsAria = config.metricsAria || `${config.title || moduleName} summary`;
    const boardAria = config.boardAria || `${config.title || moduleName} board`;
    const moduleUi = services.moduleUi;
    const metricsHtml = Array.isArray(config.metrics) && moduleUi?.renderMetrics ? moduleUi.renderMetrics(config.metrics, config.metricsOptions || {}) : (config.metricsHtml || '');
    const actionsHtml = Array.isArray(config.actions) && moduleUi?.renderActions ? moduleUi.renderActions(config.actions, config.actionsOptions || {}) : (config.actionsHtml || '');
    const stateHtml = config.state && moduleUi?.stateView ? moduleUi.stateView(config.state, config.stateOptions || {}) : '';
    return `<div class="${esc(shellClass)}" data-page-shell="${esc(moduleName)}">
      <header class="${esc(headerClass)}" id="${esc(headerId)}">${config.headerHtml || ''}</header>
      <${metricsTag} aria-label="${esc(metricsAria)}" class="${esc(metricsClass)}" id="${esc(metricsId)}">${metricsHtml}</${metricsTag}>
      ${actionsHtml?`<section class="rs-page-actions" aria-label="${esc(config.actionsAria || `${config.title || moduleName} actions`)}">${actionsHtml}</section>`:''}
      <${boardTag} aria-label="${esc(boardAria)}" class="${esc(boardClass)}" id="${esc(boardId)}">${stateHtml || config.boardHtml || ''}</${boardTag}>
    </div>`;
  }

  services.pageShell = {standard};
})();
