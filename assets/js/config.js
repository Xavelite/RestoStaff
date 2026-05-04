/*
 * App configuration
 * -----------------
 * storageMode:
 *   - "local"    = browser localStorage only
 *   - "supabase" = shared Supabase planner_state row
 */
window.APP_CONFIG = {
  storageMode: "supabase",
  supabaseOnly: true,
  supabaseUrl: "https://pmdfczjomqaglqshbdlw.supabase.co",
  supabaseKey: "sb_publishable_-f96yE-hAbWr4XXrut5TUQ_1zLV1b7s",
  supabaseTable: "planner_state",
  supabaseRecordId: "main",

  // v113: first load will reset the shared row to the clean restaurant setup
  // when the row was not already seeded by this build. Planning slots/history stay empty.
  seedSetupOnlyOnce: true,
  setupSeedVersion: "v113-setup-only"
};
