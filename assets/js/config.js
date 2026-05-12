/*
 * App configuration
 * -----------------
 * This build is Supabase-only for operational data.
 * Core business objects live in normalized Supabase tables; JSONB is reserved
 * for flexible settings such as payroll rules and small UI preferences.
 */
window.APP_CONFIG = {
  storageMode: "supabase",
  supabaseOnly: true,
  supabaseUrl: "https://pmdfczjomqaglqshbdlw.supabase.co",
  supabaseKey: "sb_publishable_-f96yE-hAbWr4XXrut5TUQ_1zLV1b7s",

  supabaseTables: {
    restaurants: "restogogo_restaurants",
    employees: "restogogo_employees",
    employeeAbsences: "restogogo_employee_absences",
    employeeDocuments: "restogogo_employee_documents",
    restaurantDocuments: "restogogo_restaurant_documents",
    positions: "restogogo_positions",
    zones: "restogogo_zones",
    openingHours: "restogogo_opening_hours",
    weeklyStatus: "restogogo_weekly_status",
    availabilitySlots: "restogogo_availability_slots",
    plannedShifts: "restogogo_planned_shifts",
    employeeWeekSubmissions: "restogogo_employee_week_submissions",
    weeklyNotes: "restogogo_weekly_notes",
    actualShiftEntries: "restogogo_actual_shift_entries"
  },

  defaultWorkspaceId: "bouillon-bruxelles",
  // Initial selected workspace id only. The actual workspace must exist in Supabase.
  exposeWorkspaceCatalog: false,
  showDemoWorkspace: false,

  setupSeedVersion: "restogogo_strict_supabase_source_v3"
};
