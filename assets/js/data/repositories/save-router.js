/* restogogo DB repository save router.
 * Routes the official RestogogoSaveContract domain/action to focused repositories
 * and normalizes every repository response through RestogogoRepositoryResult.
 *
 * Badge entries do NOT go through this router. The badge terminal calls
 * RestogogoAuthService.recordBadgeEntry() directly and never reaches this path.
 */
(function(){
  function requireRepository(name, factory){
    if(!factory?.create)throw new Error(`${name} must load before RestogogoDataRepositories.`);
    return factory;
  }
  function create(context){
    requireRepository('RestogogoRepositoryUtils', window.RestogogoRepositoryUtils);
    const Result = window.RestogogoRepositoryResult;
    const Save = window.RestogogoSaveContract;
    if(!Result)throw new Error('RestogogoRepositoryResult must load before RestogogoDataRepositories.');
    if(!Save?.normalize)throw new Error('RestogogoSaveContract must load before RestogogoDataRepositories.');
    const absenceRepository = requireRepository('RestogogoAbsenceRepository', window.RestogogoAbsenceRepository).create(context);
    const repositories = Object.freeze({
      restaurant:requireRepository('RestogogoRestaurantRepository', window.RestogogoRestaurantRepository).create(context),
      team:requireRepository('RestogogoTeamRepository', window.RestogogoTeamRepository).create(context),
      absence:absenceRepository,
      employeeSelfService:requireRepository('RestogogoEmployeeSelfServiceRepository', window.RestogogoEmployeeSelfServiceRepository).create(context,{absenceRepository}),
      planning:requireRepository('RestogogoPlanningRepository', window.RestogogoPlanningRepository).create(context),
      actuals:requireRepository('RestogogoActualsRepository', window.RestogogoActualsRepository).create(context)
    });
    const setError = message => context?.setError?.(message);

    async function callSave(handler, fallbackMessage){
      const raw = await handler();
      const result = Result.fromSaveOutcome(raw, fallbackMessage);
      if(result.ok !== true)setError(result.message);
      return result;
    }

    async function saveRemotePlanner(source, options={}){
      const saveOptions = Save.normalize(options);
      const domain = saveOptions.domain;
      try{
        switch(domain){
          case Save.DOMAIN.ABSENCE:
            return await callSave(()=>repositories.absence.saveAbsenceLifecycle(saveOptions), 'Absence save failed.');
          case Save.DOMAIN.TEAM:
            return await callSave(()=>repositories.team.saveTeam(source), 'Team save failed.');
          case Save.DOMAIN.RESTAURANT:
            return await callSave(()=>repositories.restaurant.saveRestaurant(source), 'Restaurant save failed.');
          case Save.DOMAIN.EMPLOYEE_SELF_SERVICE:
            return await callSave(()=>repositories.employeeSelfService.saveEmployeeSelfService(source, saveOptions), 'Employee self-service save failed.');
          case Save.DOMAIN.PLANNING:
            return await callSave(()=>repositories.planning.saveManagerPlanning(source, saveOptions), 'Planning save failed.');
          case Save.DOMAIN.ACTUALS:
            return await callSave(()=>repositories.actuals.saveActuals(source, saveOptions), 'Actuals save failed.');
          default:{
            const reason = String(saveOptions.reason || '').trim();
            const message = `Save blocked: ${reason || 'this change'} is not mapped to a supported save domain.`;
            setError(message);
            return Result.fail(message,{code:'unsupported_save_action', details:{reason, domain}});
          }
        }
      }catch(error){
        const message = error?.message || String(error || 'Save failed.');
        setError(message);
        return Result.fail(message,{code:'repository_exception',details:error});
      }
    }

    return Object.freeze({ saveRemotePlanner });
  }
  window.RestogogoDataRepositories = Object.freeze({create});
})();
