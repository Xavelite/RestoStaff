/*
 * App configuration
 * -----------------
 * storageMode:
 *   - "local"    = browser localStorage only
 *   - "supabase" = shared Supabase planner_state rows
 */
window.APP_CONFIG = {
  storageMode: "supabase",
  supabaseOnly: true,
  supabaseUrl: "https://pmdfczjomqaglqshbdlw.supabase.co",
  supabaseKey: "sb_publishable_-f96yE-hAbWr4XXrut5TUQ_1zLV1b7s",
  supabaseTable: "planner_state",

  // v128+: prototype multi-restaurant workspaces.
  // Each restaurant uses one planner_state row. The old "main" row remains a safe legacy fallback.
  supabaseRecordId: "bouillon-bruxelles",
  supabaseLegacyRecordId: "main",
  defaultWorkspaceId: "bouillon-bruxelles",

  // v128+ disables automatic version reseeding. Empty rows can still be created intentionally.
  seedSetupOnlyOnce: false,
  setupSeedVersion: "v147-recovery"
};
