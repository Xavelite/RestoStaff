/*
 * App configuration
 * -----------------
 * This build is Supabase-only for operational data.
 * Core business objects live in normalized Supabase tables; JSONB is reserved
 * only for small operational settings such as notifications and payroll rules.
 *
 * PRODUCTION DEPLOYMENT
 * ---------------------
 * The inline supabaseUrl / supabaseKey fallbacks below are for local development
 * and the hosted demo only. For any production deployment, inject real values via
 * window.RESTOGOGO_ENV before this script loads (e.g. from a server-rendered
 * <script> block or a build-time environment variable).
 *
 * The key below is a Supabase *publishable* (anon) key — it is safe to ship
 * in source, but it must be paired with correct Row Level Security policies.
 * Never substitute a service-role key here.
 */
const RESTOGOGO_ENV = window.RESTOGOGO_ENV || {};
const _usingFallbackCredentials = !RESTOGOGO_ENV.supabaseUrl || !RESTOGOGO_ENV.supabaseKey;
if(_usingFallbackCredentials){
  const _host = typeof location !== 'undefined' ? location.hostname : '';
  const _isLocal = _host === 'localhost' || _host === '127.0.0.1' || _host === '' || _host.endsWith('.local');
  if(!_isLocal){
    console.warn(
      '[restogogo:config] Supabase credentials are using the inline demo fallback. ' +
      'Set window.RESTOGOGO_ENV = { supabaseUrl, supabaseKey } before config.js loads in production.'
    );
  }
}
window.APP_CONFIG = {
  dataContractVersion: 43,
  sqlBaselineVersion: 42,
  storageMode: "supabase",
  supabaseOnly: true,
  supabaseUrl: RESTOGOGO_ENV.supabaseUrl || "https://pmdfczjomqaglqshbdlw.supabase.co",
  supabaseKey: RESTOGOGO_ENV.supabaseKey || "sb_publishable_-f96yE-hAbWr4XXrut5TUQ_1zLV1b7s",

  supabaseTables: {
    restaurants: "restaurants",
    restaurantSettings: "restaurant_settings",
    profiles: "profiles",
    restaurantMemberships: "restaurant_memberships",
    restaurantOnboardingState: "restaurant_onboarding_state",
    employees: "employees",
    employeeAccess: "employee_access",
    employeePinCredentials: "employee_pin_credentials",
    employeeContactDetails: "employee_contact_details",
    employeeContracts: "employee_contracts",
    employeePayrollProfiles: "employee_payroll_profiles",
    absenceTypes: "absence_types",
    employeeAbsences: "absences",
    jobFunctions: "job_functions",
    zones: "zones",
    services: "services",
    zoneServiceDefaults: "zone_service_defaults",
    zoneCoverageRequirements: "coverage_requirements",
    openingHours: "opening_hours",
    workWeeks: "work_weeks",
    plannedShifts: "planned_shifts",
    employeeAvailabilitySlots: "employee_availability_slots",
    employeeAvailabilitySubmissions: "employee_availability_submissions",
    weeklyNotes: "weekly_notes",
    timeEntries: "time_entries"
  },

  defaultWorkspaceId: "demo-restaurant",
  defaultWorkspaceSlug: "demo-restaurant",
  debug: RESTOGOGO_ENV.debug === true,

  // DB v2 uses real Supabase Auth + membership-based RLS. App login is email +
  // password only; the 4-digit PIN is a badge-terminal credential, not an app login.
  auth: {
    enabled: true,
    required: true,
    loginIdentifierMode: "email"
  }
};
