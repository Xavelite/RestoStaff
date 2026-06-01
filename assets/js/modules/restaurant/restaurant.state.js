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
    readiness(){
      return Restogogo.services.setupReadiness?.build?.(data) || {percent:0,issues:['Setup readiness unavailable'],steps:[],ready:false,tone:'warning',label:'Setup needed',detail:'Setup guide unavailable'};
    },
    issues(){
      return RestaurantModel.readiness().issues || [];
    },
    readinessPercent(){
      return RestaurantModel.readiness().percent || 0;
    }
  };
  window.Restogogo = window.Restogogo || {};
  Restogogo.modules = Restogogo.modules || {};
  Restogogo.modules.RestaurantModel = RestaurantModel;
})();
