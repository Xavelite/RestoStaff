/*
 * restogogo boot diagnostics.
 * Fails fast only for required runtime contracts.
 * Optional UI enrichments do not block app startup.
 */
(function registerBootDiagnostics(){
  function readPath(path){
    return path.split('.').reduce((value, key) => value?.[key], window);
  }

  function missingPaths(paths){
    return paths.filter(path => readPath(path) == null);
  }

  function assertPaths(paths, label){
    const missing = missingPaths(paths);
    if(!missing.length)return true;
    const message = `[restogogo:${label}] Missing runtime dependencies: ${missing.join(', ')}`;
    console.error(message);
    const target = document.body || document.documentElement;
    target?.classList?.add('boot-error');
    throw new Error(message);
  }

  function warnPaths(paths, label){
    const missing = missingPaths(paths);
    if(!missing.length)return true;
    Restogogo.warn?.(`[restogogo:${label}] Optional runtime modules not available: ${missing.join(', ')}`);
    return false;
  }

  function checkBootGraph(){
    assertPaths([
      'Restogogo',
      'Restogogo.registry',
      'Restogogo.registry.pages',
      'Restogogo.modulePlatform',
      'Restogogo.modulePlatform.renderPage',
      'Restogogo.modulePlatform.bindAll',
      'Restogogo.appLayout',
      'Restogogo.appLayout.apply',
      'Restogogo.ui',
      'Restogogo.stateService',
      'Restogogo.stateService.commitStateMutation',
      'Restogogo.stateService.load',
      'Restogogo.shell',
      'Restogogo.shell.render',
      'Restogogo.shell.showPage',
      'Restogogo.shell.enterApp',
      'Restogogo.export',
      'Restogogo.services.metrics',
      'Restogogo.services.toolbar',
      'Restogogo.services.pageShell',
      'Restogogo.services.moduleUi',
      'Restogogo.services.employeeWorkflow',
      'Restogogo.services.weeklyGrid',
      'Restogogo.logic.workflow',
      'RestogogoRepositoryResult',
      'RestogogoSaveContract',
      'RestogogoSaveContract.actions',
      'DataAdapter',
      'DataAdapter.readPlanner',
      'DataAdapter.savePlanner',
      'renderNotifications'
    ], 'boot');

    assertPaths(Restogogo.registry.moduleKeys().map(moduleKey => `Restogogo.${moduleKey}`), 'modules');

    warnPaths([
      'Restogogo.brandEntry'
    ], 'optional');

    return true;
  }

  function reportBootOk(){
    Restogogo.log?.('[restogogo:boot] Runtime graph OK', {
      pages: Object.keys(Restogogo.registry.pages),
      modules: Restogogo.registry.moduleKeys()
    });
  }

  Restogogo.diagnostics = {checkBootGraph, reportBootOk};
})();
