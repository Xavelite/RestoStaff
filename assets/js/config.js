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

  // Prototype multi-restaurant workspaces.
  // Each restaurant uses one planner_state row. The optional "main" row can bootstrap the first clean workspace when present.
  supabaseRecordId: "bouillon-bruxelles",
  supabaseBootstrapRecordId: "main",
  defaultWorkspaceId: "bouillon-bruxelles",

  // Automatic version reseeding is disabled. Empty rows can still be created intentionally.
  seedSetupOnlyOnce: false,
  setupSeedVersion: "clean-v2-base"
};
