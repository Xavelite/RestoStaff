// Disposable owner/manager/employee fixtures for a development or staging project.
// Run only with ALLOW_DESTRUCTIVE_FIXTURES=YES. Never use production credentials.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { hash } from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const password = Deno.env.get('FIXTURE_PASSWORD') ?? '';
const allowed = Deno.env.get('ALLOW_DESTRUCTIVE_FIXTURES') === 'YES';

if (!allowed || !url || !serviceRole || password.length < 12) {
  throw new Error(
    'Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FIXTURE_PASSWORD (12+ chars) and ALLOW_DESTRUCTIVE_FIXTURES=YES.'
  );
}

const admin = createClient(url, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const stamp = Date.now();
const accounts = [
  { key: 'owner', email: 'owner+restogogo-fixture@example.com', first: 'Olivia', last: 'Owner' },
  { key: 'manager', email: 'manager+restogogo-fixture@example.com', first: 'Marc', last: 'Manager' },
  { key: 'employee', email: 'employee+restogogo-fixture@example.com', first: 'Emma', last: 'Employee' }
] as const;

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

// Fixtures own an isolated restaurant namespace. Remove that namespace before
// replacing users so owner-of-record foreign keys and all child data disappear
// through the database's canonical cascades.
const { error: fixtureCleanupError } = await admin
  .from('restaurants')
  .delete()
  .like('workspace_slug', 'restogogo-fixture-%');
if (fixtureCleanupError) throw fixtureCleanupError;

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

const profileRows = accounts.map((account) => ({
  auth_user_id: users.get(account.key)!.id,
  email: account.email,
  first_name: account.first,
  last_name: account.last
}));
const { data: profiles, error: profileError } = await admin
  .from('profiles')
  .upsert(profileRows, { onConflict: 'email' })
  .select('id,email');
if (profileError || !profiles) throw profileError ?? new Error('Profiles were not created.');
const profileByEmail = new Map(profiles.map((profile) => [profile.email, profile.id]));

const { data: restaurant, error: restaurantError } = await admin
  .from('restaurants')
  .insert({
    owner_profile_id: profileByEmail.get(accounts[0].email),
    workspace_slug: `restogogo-fixture-${stamp}`,
    name: 'restogogo Fixture Restaurant',
    legal_name: 'restogogo Fixture Restaurant',
    city: 'Brussels',
    country_code: 'BE'
  })
  .select('id')
  .single();
if (restaurantError || !restaurant) throw restaurantError ?? new Error('Restaurant was not created.');
const restaurantId = restaurant.id;

await admin.from('restaurant_settings').insert({
  restaurant_id: restaurantId,
  timezone: 'Europe/Brussels',
  locale: 'fr-BE',
  currency_code: 'EUR',
  week_start_weekday: 1
});
await admin.from('restaurant_onboarding_state').insert({
  restaurant_id: restaurantId,
  state: 'entered_workspace',
  last_step: 'complete',
  workspace_created_at: new Date().toISOString(),
  entered_workspace_at: new Date().toISOString()
});
await admin.from('services').insert([
  { restaurant_id: restaurantId, service_key: 'lunch', name: 'Lunch', sort_order: 10 },
  { restaurant_id: restaurantId, service_key: 'evening', name: 'Evening', sort_order: 20 }
]);

const { data: areas, error: areaError } = await admin
  .from('work_areas')
  .insert([
    { restaurant_id: restaurantId, code: 'salle', name: 'Salle', sort_order: 10 },
    { restaurant_id: restaurantId, code: 'cuisine', name: 'Cuisine', sort_order: 20 }
  ])
  .select('id,name');
if (areaError || !areas) throw areaError ?? new Error('Areas were not created.');

const { data: jobs, error: jobError } = await admin
  .from('job_functions')
  .insert([
    { restaurant_id: restaurantId, code: 'service', name: 'Service', sort_order: 10 },
    { restaurant_id: restaurantId, code: 'cuisine', name: 'Cuisine', sort_order: 20 }
  ])
  .select('id,name');
if (jobError || !jobs) throw jobError ?? new Error('Positions were not created.');

const canonicalContracts = [
  ['CDI', 'CDI', 'permanent', 10],
  ['CDD', 'CDD', 'fixed_term', 20],
  ['FLEXI', 'Flexi', 'flexi', 30],
  ['STUDENT', 'Student', 'student', 40],
  ['EXTRA', 'Extra', 'extra', 50],
  ['FREELANCE', 'Freelance', 'self_employed', 60]
] as const;
const { data: contracts, error: contractTypeError } = await admin
  .from('contract_types')
  .insert(
    canonicalContracts.map(([code, name, category, sort_order]) => ({
      restaurant_id: restaurantId, code, name, category, sort_order, active: true,
      metadata: { system: true }
    }))
  )
  .select('id,code');
if (contractTypeError || !contracts) throw contractTypeError ?? new Error('Contract types failed.');

await admin.from('absence_types').insert([
  ['HOLIDAY', 'Holiday', 'holiday', 'paid', 10],
  ['SICK', 'Sick leave', 'sick', 'paid', 20],
  ['UNPAID', 'Unpaid leave', 'unpaid', 'unpaid', 30],
  ['PUBLIC_HOLIDAY', 'Public holiday', 'other', 'paid', 40],
  ['OTHER', 'Other', 'other', 'neutral', 50]
].map(([code, name, category, paid_policy, sort_order]) => ({
  restaurant_id: restaurantId, code, name, category, paid_policy,
  color: '#64748b', requires_approval: code !== 'PUBLIC_HOLIDAY',
  affects_planning: true, affects_payroll: true, sort_order, active: true,
  metadata: { system: true }
})));

const { data: employees, error: employeeError } = await admin
  .from('employees')
  .insert(accounts.map((account, index) => ({
    restaurant_id: restaurantId,
    display_name: `${account.first} ${account.last}`,
    first_name: account.first,
    last_name: account.last,
    sort_order: index
  })))
  .select('id,display_name');
if (employeeError || !employees) throw employeeError ?? new Error('Employees were not created.');

const employeeByName = new Map(employees.map((employee) => [employee.display_name, employee.id]));
const memberships = accounts.map((account) => ({
  restaurant_id: restaurantId,
  profile_id: profileByEmail.get(account.email),
  role: account.key,
  status: 'active'
}));
const { error: membershipError } = await admin.from('restaurant_memberships').insert(memberships);
if (membershipError) throw membershipError;

const accessRows = accounts.map((account) => ({
  restaurant_id: restaurantId,
  employee_id: employeeByName.get(`${account.first} ${account.last}`),
  profile_id: profileByEmail.get(account.email),
  access_status: 'active',
  badge_enabled: true
}));
const { error: accessError } = await admin.from('employee_access').insert(accessRows);
if (accessError) throw accessError;

const serviceJob = jobs.find((job) => job.name === 'Service')!.id;
await admin.from('employee_job_functions').insert(
  accounts.map((account) => ({
    restaurant_id: restaurantId,
    employee_id: employeeByName.get(`${account.first} ${account.last}`),
    job_function_id: serviceJob,
    is_primary: true,
    active: true
  }))
);

const cdi = contracts.find((contract) => contract.code === 'CDI')!.id;
const student = contracts.find((contract) => contract.code === 'STUDENT')!.id;
await admin.from('employee_contracts').insert(accounts.map((account) => ({
  restaurant_id: restaurantId,
  employee_id: employeeByName.get(`${account.first} ${account.last}`),
  contract_type_id: account.key === 'employee' ? student : cdi,
  work_regime: account.key === 'employee' ? 'weekly_availability' : 'fixed_schedule',
  contract_start: new Date().toISOString().slice(0, 10),
  weekly_contract_hours: account.key === 'employee' ? 16 : 38,
  contract_days: account.key === 'employee' ? 2 : 5,
  is_current: true,
  active: true
})));

const pinHash = await hash('2468');
await admin.from('employee_pin_credentials').insert(accounts.map((account) => ({
  restaurant_id: restaurantId,
  employee_id: employeeByName.get(`${account.first} ${account.last}`),
  pin_hash: pinHash,
  pin_status: 'active',
  failed_attempts: 0,
  last_rotated_at: new Date().toISOString()
})));

console.log(JSON.stringify({
  restaurantId,
  password,
  badgePin: '2468',
  accounts: accounts.map(({ key, email }) => ({ role: key, email }))
}, null, 2));
