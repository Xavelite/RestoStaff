/* restogogo runtime state factory.
 * Strict Supabase build: this file only creates a non-operational shell when
 * Supabase cannot return a restaurant row. It never seeds employees, zones,
 * positions, shifts or opening hours.
 */
function emptySupabaseRuntimeState(idValue){
  return {
    version: DATA_CONTRACT_VERSION,
    schemaVersion: DATA_CONTRACT_VERSION,
    restaurant:{name:'',ownerName:'',city:''},
    weekStart:monday(),
    status:'Draft',
    employees:[],
    restaurantSetup:{
      general:{},
      zones:[],
      positions:[],
      openingHours:{},
      coverageRequirements:[],
      payrollRules:{},
      absenceTypes:normalizeAbsenceTypeList([])
    },
    availability:{},
    planningSlots:{},
    submitted:{},
    notes:{},
    history:{},
    actualEntries:{},
    actualsStatus:'open',
    notifications:[],
    workspaceInitialized:false,
    supabaseMissingWorkspace:true,
    missingWorkspaceId:slugifyWorkspace(idValue || workspaceId())
  };
}
