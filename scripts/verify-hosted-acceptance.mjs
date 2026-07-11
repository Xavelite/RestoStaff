import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = process.env;
const url = env.SUPABASE_URL ?? '';
const anonKey = env.SUPABASE_ANON_KEY ?? '';
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const password = env.FIXTURE_PASSWORD ?? '';
const restaurantId = env.FIXTURE_RESTAURANT_ID ?? '';
const appOrigin = (env.APP_ORIGIN ?? '').replace(/\/$/, '');
const projectName = env.ACCEPTANCE_PROJECT_NAME ?? '';
const projectRef = new URL(url || 'https://invalid.local').hostname.split('.')[0];
let linkedRef = '';
try {
  linkedRef = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
} catch {
  // An unlinked checkout has no development ref to compare.
}

if (
  env.ALLOW_HOSTED_ACCEPTANCE !== 'YES' ||
  !url ||
  !anonKey ||
  !serviceRoleKey ||
  password.length < 12 ||
  !restaurantId ||
  !appOrigin ||
  !/^restogogo-acceptance-[a-z0-9-]+$/.test(projectName) ||
  projectRef === linkedRef
) {
  throw new Error('Hosted acceptance requires explicit disposable-project environment variables.');
}

const accounts = {
  owner: 'owner+restogogo-fixture@example.com',
  manager: 'manager+restogogo-fixture@example.com',
  employee: 'employee+restogogo-fixture@example.com'
};
const clients = Object.fromEntries(
  Object.keys(accounts).map((role) => [
    role,
    createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  ])
);
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function signIn(role) {
  const { data, error } = await clients[role].auth.signInWithPassword({
    email: accounts[role],
    password
  });
  assert.ifError(error);
  assert.ok(data.session?.access_token, `${role} did not receive an Auth session`);
  return data.session;
}

async function subscribe(channel, expected = 'SUBSCRIBED') {
  const status = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('TIMED_OUT'), 15_000);
    channel.subscribe((next) => {
      if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(next)) {
        clearTimeout(timer);
        resolve(next);
      }
    });
  });
  assert.equal(status, expected);
}

async function edge(name, { token, body, origin = appOrigin, method = 'POST' } = {}) {
  const headers = { apikey: anonKey, Origin: origin };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  return fetch(`${url}/functions/v1/${name}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body == null ? undefined : JSON.stringify(body)
  });
}

const sessions = {
  owner: await signIn('owner'),
  manager: await signIn('manager'),
  employee: await signIn('employee')
};

for (const role of Object.keys(accounts)) {
  const { data, error } = await clients[role].rpc('get_current_memberships');
  assert.ifError(error);
  const membership = data.find((item) => item.restaurant_id === restaurantId);
  assert.equal(membership?.role, role, `${role} membership is not Auth-backed`);
}

for (const role of ['owner', 'manager']) {
  const { error } = await clients[role].rpc('get_team_read_model', {
    p_restaurant_id: restaurantId
  });
  assert.ifError(error);
}
const { error: employeeTeamError } = await clients.employee.rpc('get_team_read_model', {
  p_restaurant_id: restaurantId
});
assert.ok(employeeTeamError, 'Employee unexpectedly received the manager Team model');
const { error: employeeModelError } = await clients.employee.rpc('get_employee_operations_read_model', {
  p_restaurant_id: restaurantId,
  p_from_date: new Date().toISOString().slice(0, 10),
  p_to_date: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
});
assert.ifError(employeeModelError);

const topic = `workspace:${restaurantId}`;
let receivedBroadcast = null;
const managerChannel = clients.manager
  .channel(topic, { config: { private: true, broadcast: { ack: true } } })
  .on('broadcast', { event: 'hosted-acceptance' }, ({ payload }) => {
    receivedBroadcast = payload;
  });
const ownerChannel = clients.owner.channel(topic, {
  config: { private: true, broadcast: { ack: true } }
});
await Promise.all([subscribe(managerChannel), subscribe(ownerChannel)]);
assert.equal(
  await ownerChannel.send({
    type: 'broadcast',
    event: 'hosted-acceptance',
    payload: { restaurantId }
  }),
  'ok'
);
for (let index = 0; index < 20 && !receivedBroadcast; index += 1) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.equal(receivedBroadcast?.restaurantId, restaurantId, 'Private Realtime broadcast was not delivered');

const deniedChannel = clients.owner.channel(`workspace:${crypto.randomUUID()}`, {
  config: { private: true }
});
await subscribe(deniedChannel, 'CHANNEL_ERROR');
await Promise.all([
  clients.manager.removeChannel(managerChannel),
  clients.owner.removeChannel(ownerChannel),
  clients.owner.removeChannel(deniedChannel)
]);

const { data: fixtureEmployee, error: fixtureEmployeeError } = await admin
  .from('employees')
  .select('id')
  .eq('restaurant_id', restaurantId)
  .eq('display_name', 'Emma Employee')
  .single();
assert.ifError(fixtureEmployeeError);

const preflight = await edge('send-employee-invitation', { method: 'OPTIONS' });
assert.equal(preflight.status, 200);
assert.equal(preflight.headers.get('access-control-allow-origin'), appOrigin);
const rejectedPreflight = await edge('send-employee-invitation', {
  method: 'OPTIONS',
  origin: 'https://invalid.example'
});
assert.equal(rejectedPreflight.status, 403);
const unauthenticated = await edge('send-employee-invitation', {
  body: {
    restaurant_id: restaurantId,
    employee_id: fixtureEmployee.id,
    email: 'acceptance@example.com',
    role: 'employee'
  }
});
assert.equal(unauthenticated.status, 401);
const employeeInvitation = await edge('send-employee-invitation', {
  token: sessions.employee.access_token,
  body: {
    restaurant_id: restaurantId,
    employee_id: fixtureEmployee.id,
    email: 'acceptance@example.com',
    role: 'employee'
  }
});
assert.equal(employeeInvitation.status, 403);
const managerEscalation = await edge('send-employee-invitation', {
  token: sessions.manager.access_token,
  body: {
    restaurant_id: restaurantId,
    employee_id: fixtureEmployee.id,
    email: 'acceptance@example.com',
    role: 'manager'
  }
});
assert.equal(managerEscalation.status, 403);

const { data: verification, error: verificationError } = await clients.owner.rpc('verify_badge_pin', {
  p_restaurant_id: restaurantId,
  p_employee_id: fixtureEmployee.id,
  p_pin: '2468'
});
assert.ifError(verificationError);
assert.ok(verification?.badge_token, 'Badge verification did not issue a challenge token');

const png = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240,
  31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69,
  78, 68, 174, 66, 96, 130
]);
const uploadBody = new FormData();
uploadBody.set('restaurant_id', restaurantId);
uploadBody.set('employee_id', fixtureEmployee.id);
uploadBody.set('badge_token', verification.badge_token);
uploadBody.set('proof', new File([png], 'acceptance.png', { type: 'image/png' }));
const upload = await edge('upload-badge-proof', {
  token: sessions.owner.access_token,
  body: uploadBody
});
const uploadText = await upload.text();
assert.equal(upload.status, 200, uploadText);
const uploadResult = JSON.parse(uploadText);
assert.ok(uploadResult.path);

let timeEntryId = null;
try {
  const { data: badge, error: badgeError } = await clients.owner.rpc('record_badge_entry', {
    p_restaurant_id: restaurantId,
    p_employee_id: fixtureEmployee.id,
    p_badge_token: verification.badge_token,
    p_service_key: 'lunch',
    p_photo_url: uploadResult.path,
    p_photo_status: 'captured'
  });
  assert.ifError(badgeError);
  assert.equal(badge?.ok, true);

  const { data: timeEntry, error: timeEntryError } = await admin
    .from('time_entries')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('employee_id', fixtureEmployee.id)
    .eq('clock_in_photo_url', uploadResult.path)
    .single();
  assert.ifError(timeEntryError);
  timeEntryId = timeEntry.id;

  const proof = await edge('get-badge-proof', {
    token: sessions.owner.access_token,
    body: { restaurant_id: restaurantId, time_entry_id: timeEntryId, edge: 'clock_in' }
  });
  const proofText = await proof.text();
  assert.equal(proof.status, 200, proofText);
  const proofResult = JSON.parse(proofText);
  const signedProof = await fetch(proofResult.url);
  assert.equal(signedProof.status, 200);
  assert.ok((await signedProof.arrayBuffer()).byteLength > 0);

  const employeeProof = await edge('get-badge-proof', {
    token: sessions.employee.access_token,
    body: { restaurant_id: restaurantId, time_entry_id: timeEntryId, edge: 'clock_in' }
  });
  assert.equal(employeeProof.status, 403);
  const publicProof = await fetch(`${url}/storage/v1/object/public/badge-proofs/${uploadResult.path}`);
  assert.notEqual(publicProof.status, 200, 'Private proof was exposed through the public Storage endpoint');
} finally {
  if (timeEntryId) await admin.from('time_entries').delete().eq('id', timeEntryId);
  await admin.storage.from('badge-proofs').remove([uploadResult.path]);
}

for (const client of Object.values(clients)) {
  await client.auth.signOut();
  client.realtime.disconnect();
}

console.log('Hosted Auth, role boundaries, private Realtime, Edge Functions, and Storage passed.');
