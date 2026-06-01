/*
 * restogogo module platform.
 * Defines the runtime contract used by the router to load page modules through
 * registry metadata instead of loose global calls. Modules still expose their
 * domain APIs on Restogogo.<moduleKey>, but the router only talks to them via
 * this platform layer.
 */
(function(){
  const REQUIRED_CONTRACT_FIELDS = Object.freeze(['id','route','title','roles','moduleKey','mountId','shell','repository','metricsProvider','actionsProvider','stateProvider']);

  function pages(){
    return Restogogo.registry?.pages || {};
  }

  function contractFor(pageId){
    const contract = pages()[pageId];
    return contract || null;
  }

  function moduleApi(contract){
    if(!contract?.moduleKey)return null;
    return Restogogo[contract.moduleKey] || null;
  }

  function activeContract(){
    return contractFor(Restogogo.registry?.activePage?.());
  }

  function validateContract(contract){
    if(!contract)return ['missing contract'];
    return REQUIRED_CONTRACT_FIELDS.filter(field=>contract[field] === undefined || contract[field] === null || contract[field] === '').map(field=>`missing ${field}`);
  }

  function renderPage(pageId){
    const contract = contractFor(pageId || Restogogo.registry?.activePage?.());
    const issues = validateContract(contract);
    if(issues.length){
      Restogogo.warn?.('[restogogo:module-contract-invalid]', {pageId, issues});
      return;
    }
    const api = moduleApi(contract);
    if(typeof api?.render !== 'function'){
      Restogogo.warn?.('[restogogo:module-render-missing]', {pageId:contract.id, moduleKey:contract.moduleKey});
      return;
    }
    api.render({module: contract});
  }

  function bindPage(contract){
    const issues = validateContract(contract);
    if(issues.length){
      Restogogo.warn?.('[restogogo:module-contract-invalid]', {pageId:contract?.id, issues});
      return;
    }
    const api = moduleApi(contract);
    if(typeof api?.bind !== 'function'){
      Restogogo.warn?.('[restogogo:module-bind-missing]', {pageId:contract.id, moduleKey:contract.moduleKey});
      return;
    }
    api.bind({module: contract});
  }

  function bindAll(){
    const seen = new Set();
    Object.values(pages()).forEach(contract=>{
      if(!contract?.moduleKey || seen.has(contract.moduleKey))return;
      seen.add(contract.moduleKey);
      bindPage(contract);
    });
  }


  function getMetrics(pageId, context={}){
    const contract = contractFor(pageId || Restogogo.registry?.activePage?.());
    const api = moduleApi(contract);
    return typeof api?.getMetrics === 'function' ? api.getMetrics({module:contract, context}) : [];
  }

  function getActions(pageId, context={}){
    const contract = contractFor(pageId || Restogogo.registry?.activePage?.());
    const api = moduleApi(contract);
    return typeof api?.getActions === 'function' ? api.getActions({module:contract, context}) : [];
  }

  function getState(pageId, context={}){
    const contract = contractFor(pageId || Restogogo.registry?.activePage?.());
    const api = moduleApi(contract);
    return typeof api?.getState === 'function' ? api.getState({module:contract, context}) : null;
  }

  function contracts(){
    return Object.freeze(Object.values(pages()).map(contract=>Object.freeze({...contract})));
  }

  function smokeRoutes(){
    return contracts().filter(contract=>contract.smoke !== false).map(contract=>contract.route);
  }

  Restogogo.modulePlatform = {
    REQUIRED_CONTRACT_FIELDS,
    activeContract,
    bindAll,
    contractFor,
    contracts,
    moduleApi,
    getActions,
    getMetrics,
    getState,
    renderPage,
    smokeRoutes,
    validateContract
  };
})();
