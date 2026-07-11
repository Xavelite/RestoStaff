// Disposable owner/manager/employee fixtures for hosted acceptance testing.
// Run only with ALLOW_DESTRUCTIVE_FIXTURES=YES. Never use production credentials.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { hash } from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const password = Deno.env.get('FIXTURE_PASSWORD') ?? '';
const allowed = Deno.env.get('ALLOW_DESTRUCTIVE_FIXTURES') === 'YES';
const projectName = Deno.env.get('FIXTURE_PROJECT_NAME') ?? '';

if (
  !allowed ||
  !url ||
  !anonKey ||
  !serviceRole ||
  password.length < 12 ||
  !/^restogogo-acceptance-[a-z0-9-]+$/.test(projectName)
) {
  throw new Error(
    'Set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, FIXTURE_PASSWORD (12+ chars) and ALLOW_DESTRUCTIVE_FIXTURES=YES.'
  );
}

const admin = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const accounts = [
  { key: 'owner', email: 'owner+restogogo-fixture@example.com', first: 'Olivia', last: 'Owner' },
  { key: 'manager', email: 'manager+restogogo-fixture@example.com', first: 'Marc', last: 'Manager' },
  { key: 'employee', email: 'employee+restogogo-fixture@example.com', first: 'Emma', last: 'Employee' }
] as const;

const { data: existingRestaurants, error: existingRestaurantError } = await admin
  .from('restaurants')
  .select('id')
  .like('workspace_slug', 'restogogo-fixture-%')
  .limit(1);
if (existingRestaurantError) throw existingRestaurantError;
if (existingRestaurants?.length) {
  throw new Error('Disposable role fixtures already exist. Use a fresh disposable project.');
}

async function existingUser(email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((item) => item.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
  return null;
}

for (const account of accounts) {
  const existing = await existingUser(account.email);
  if (existing) {
    const { error } = await admin.auth.admin.deleteUser(existing.id);
    if (error) throw error;
  }
}

const users = new Map<string, { id: string; email: string }>();
for (const account of accounts) {
  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    user_metadata: { first_name: account.first, last_name: account.last, fixture: true }
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${account.key}.`);
  users.set(account.key, { id: data.user.id, email: account.email });
}

const ownerClient = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const { error: ownerSignInError } = await ownerClient.auth.signInWithPassword({
  email: accounts[0].email,
  password
});
if (ownerSignInError) throw ownerSignInError;

const openingHours = Array.from({ length: 7 }, (_, index) => index + 1).flatMap((weekday) => [
  { weekday, service_key: 'lunch', is_open: weekday !== 7, opens_at: '11:30', closes_at: '15:00' },
  { weekday, service_key: 'evening', is_open: weekday !== 7, opens_at: '18:00', closes_at: '23:00' }
]);
const starterEmployees = accounts.slice(1).map((account) => ({
  display_name: `${account.first} ${account.last}`,
  first_name: account.first,
  last_name: account.last,
  email: account.email,
  phone: '',
  job_function: 'Service'
}));
const { data: setup, error: setupError } = await ownerClient.rpc('setup_owner_workspace', {
  p_owner_first_name: accounts[0].first,
  p_owner_last_name: accounts[0].last,
  p_owner_email: accounts[0].email,
  p_restaurant_name: 'restogogo Fixture Restaurant',
  p_city: 'Brussels',
  p_employees: starterEmployees,
  p_opening_hours: openingHours,
  p_areas: [
    { name: 'Salle', lunch_start: '11:30', lunch_end: '15:00', evening_start: '18:00', evening_end: '23:00' },
    { name: 'Cuisine', lunch_start: '10:30', lunch_end: '15:00', evening_start: '17:00', evening_end: '23:00' }
  ],
  p_job_functions: ['Service', 'Cuisine'],
  p_coverage: [{ area: 'Salle', job_function: 'Service' }]
});
if (setupError) throw setupError;
const restaurantId = String((setup as { restaurant_id?: unknown } | null)?.restaurant_id ?? '');
if (!restaurantId) throw new Error('Owner workspace setup did not return a restaurant.');

const profileRows = accounts.slice(1).map((account) => ({
  auth_user_id: users.get(account.key)!.id,
  email: account.email,
  first_name: account.first,
  last_name: account.last
}));
const { error: profileError } = await admin
  .from('profiles')
  .upsert(profileRows, { onConflict: 'email' });
if (profileError) throw profileError;

const { data: profiles, error: profilesError } = await admin
  .from('profiles')
  .select('id,email')
  .in('email', accounts.map((account) => account.email));
if (profilesError || !profiles) throw profilesError ?? new Error('Profiles were not created.');
const profileByEmail = new Map(profiles.map((profile) => [profile.email, profile.id]));

const { data: employees, error: employeeError } = await admin
  .from('employees')
  .select('id,display_name')
  .eq('restaurant_id', restaurantId);
if (employeeError || !employees) throw employeeError ?? new Error('Employees were not created.');
const employeeByName = new Map(employees.map((employee) => [employee.display_name, employee.id]));

const secondaryAccounts = accounts.slice(1);
const { error: membershipError } = await admin.from('restaurant_memberships').insert(
  secondaryAccounts.map((account) => ({
    restaurant_id: restaurantId,
    profile_id: profileByEmail.get(account.email),
    role: account.key,
    status: 'active'
  }))
);
if (membershipError) throw membershipError;

for (const account of secondaryAccounts) {
  const { error } = await admin
    .from('employee_access')
    .update({
      profile_id: profileByEmail.get(account.email),
      access_status: 'active',
      badge_enabled: true
    })
    .eq('restaurant_id', restaurantId)
    .eq('employee_id', employeeByName.get(`${account.first} ${account.last}`));
  if (error) throw error;
}

const { error: onboardingError } = await admin
  .from('restaurant_onboarding_state')
  .update({
    state: 'entered_workspace',
    last_step: 'entered_workspace',
    entered_workspace_at: new Date().toISOString()
  })
  .eq('restaurant_id', restaurantId);
if (onboardingError) throw onboardingError;

const { data: contracts, error: contractTypeError } = await admin
  .from('contract_types')
  .select('id,code')
  .eq('restaurant_id', restaurantId);
if (contractTypeError || !contracts) throw contractTypeError ?? new Error('Contract types are missing.');
const contractByCode = new Map(contracts.map((contract) => [contract.code, contract.id]));
const { error: contractsError } = await admin.from('employee_contracts').insert(
  accounts.map((account) => ({
    restaurant_id: restaurantId,
    employee_id: employeeByName.get(`${account.first} ${account.last}`),
    contract_type_id: contractByCode.get(account.key === 'employee' ? 'STUDENT' : 'CDI'),
    work_regime: account.key === 'employee' ? 'weekly_availability' : 'fixed_schedule',
    contract_start: new Date().toISOString().slice(0, 10),
    weekly_contract_hours: account.key === 'employee' ? 16 : 38,
    contract_days: account.key === 'employee' ? 2 : 5,
    is_current: true,
    active: true
  }))
);
if (contractsError) throw contractsError;

const pinHash = await hash('2468');
const { error: pinError } = await admin.from('employee_pin_credentials').insert(
  accounts.map((account) => ({
    restaurant_id: restaurantId,
    employee_id: employeeByName.get(`${account.first} ${account.last}`),
    pin_hash: pinHash,
    pin_status: 'active',
    failed_attempts: 0,
    last_rotated_at: new Date().toISOString()
  }))
);
if (pinError) throw pinError;

console.log(JSON.stringify({
  restaurantId,
  accounts: accounts.map(({ key, email }) => ({ role: key, email }))
}, null, 2));
