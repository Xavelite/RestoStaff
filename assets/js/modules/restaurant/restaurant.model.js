(function(){
  const RestaurantModel = {
    setup(){
      ensure(data);
      return data.restaurantSetup;
    },
    zones(includeInactive=true){
      const restaurantSetup=RestaurantModel.setup();
      return (restaurantSetup.zones||[]).filter(zone=>includeInactive || zone.active !== false);
    },
    positions(includeInactive=true){
      const restaurantSetup=RestaurantModel.setup();
      return (restaurantSetup.positions||[]).filter(position=>includeInactive || position.active !== false);
    },
    issues(){
      const restaurantSetup=RestaurantModel.setup();
      const activeZones=(restaurantSetup.zones||[]).filter(zone=>zone.active !== false);
      const activePositions=(restaurantSetup.positions||[]).filter(position=>position.active !== false);
      const coverageRequirements=normalizeCoverageRequirements(restaurantSetup.coverageRequirements || [], restaurantSetup);
      const issues=[];
      if(!(data.employees||[]).some(employee=>employee.active !== false))issues.push('No active employees');
      if(!activeZones.length)issues.push('No active zones');
      if(!activePositions.length)issues.push('No active positions');
      activeZones.forEach(zone=>{
        const coverage = coverageRequirements.filter(req=>req.zoneId===zone.id && req.requiredCount > 0);
        if(!coverage.length)issues.push(`${zone.name}: coverage missing`);
      });
      if(!restaurantSetup.payrollRules?.provider)issues.push('Payroll provider missing');
      return issues;
    },
    readinessPercent(){
      const issueCount=RestaurantModel.issues().length;
      return Math.max(0,Math.round(100 - Math.min(4,issueCount)*25));
    }
  };
  window.Restogogo = window.Restogogo || {};
  Restogogo.modules = Restogogo.modules || {};
  Restogogo.modules.RestaurantModel = RestaurantModel;
})();
