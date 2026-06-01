/* restogogo actuals module — public API contract seal.
   Mirrors planning.page.js: seals Restogogo.actuals as the canonical module surface
   so module-platform.js can call render() and bind() via the standard contract.
   actuals.state.js, actuals.view.js and actuals.actions.js are loaded before this file. */
(function(){
  const render = Restogogo.actuals.render;
  const bind   = Restogogo.actuals.bind;

  if(typeof render !== 'function' || typeof bind !== 'function'){
    Restogogo.warn?.('[actuals.page] render or bind not found — check load order');
  }

  Restogogo.actuals = {
    render,
    bind,
    showProof:          Restogogo.actuals.showProof,
    openCorrectionDialog: Restogogo.actuals.openCorrectionDialog,
    state:              Restogogo.actuals.state,
    filters:            Restogogo.actuals.filters,
    setSearch:          Restogogo.actuals.setSearch,
    setFilter:          Restogogo.actuals.setFilter,
    resetFilters:       Restogogo.actuals.resetFilters,
    selectDay:          Restogogo.actuals.selectDay,
    selectRow:          Restogogo.actuals.selectRow
  };
})();
