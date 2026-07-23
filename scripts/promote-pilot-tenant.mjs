import { spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	realpathSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_PROJECT_NAME = 'RestoGogo';
const TARGET_PROJECT_NAME = 'Restogogo Production';
const EXECUTION_GUARD = 'ALLOW_PRODUCTION_TENANT_PROMOTION';
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(repositoryRoot, 'supabase', 'config.toml');
const npxCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');

const tenantTables = [
	'services',
	'contract_types',
	'absence_types',
	'work_areas',
	'job_functions',
	'restaurant_settings',
	'restaurant_onboarding_state',
	'restaurant_memberships',
	'employees',
	'employee_access',
	'employee_contact_details',
	'employee_contracts',
	'employee_legal_profiles',
	'employee_payroll_profiles',
	'employee_pin_credentials',
	'employee_job_functions',
	'opening_hours',
	'area_service_defaults',
	'coverage_requirements',
	'work_weeks',
	'work_week_events',
	'planned_shifts',
	'recurring_schedule_slots',
	'weekly_notes',
	'employee_availability_slots',
	'employee_availability_submissions',
	'work_pattern_exceptions',
	'work_pattern_exception_events',
	'absences',
	'absence_events',
	'time_entries',
	'time_entry_adjustments',
	'employee_invitations',
	'restaurant_stations',
	'badge_verification_challenges',
	'notification_preferences',
	'notification_receipts',
	'payroll_export_runs',
	'push_notification_deliveries',
	'workspace_realtime_events'
];

function fail(message) {
	throw new Error(message);
}

function parseArguments(argv) {
	const values = { execute: false };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === '--execute') {
			values.execute = true;
			continue;
		}
		const next = argv[index + 1];
		if (!next || next.startsWith('--')) fail(`Missing value for ${argument}.`);
		if (argument === '--source-ref') values.sourceRef = next;
		else if (argument === '--target-ref') values.targetRef = next;
		else if (argument === '--restaurant-id') values.restaurantId = next;
		else if (argument === '--owner-email') values.ownerEmail = next.trim().toLowerCase();
		else fail(`Unknown argument: ${argument}.`);
		index += 1;
	}

	for (const key of ['sourceRef', 'targetRef', 'restaurantId', 'ownerEmail']) {
		if (!values[key]) fail(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required.`);
	}
	if (!/^[a-z]{20}$/.test(values.sourceRef) || !/^[a-z]{20}$/.test(values.targetRef)) {
		fail('Project refs must be 20 lowercase letters.');
	}
	if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(values.restaurantId)) {
		fail('Restaurant id must be a UUID.');
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.ownerEmail)) fail('Owner email is invalid.');
	if (values.sourceRef === values.targetRef) fail('Source and target projects must differ.');
	return values;
}

function runCli(arguments_, { input, sensitive = false } = {}) {
	const executable = process.platform === 'win32' ? process.execPath : 'npx';
	const commandArguments = process.platform === 'win32' ? [npxCli, ...arguments_] : arguments_;
	const result = spawnSync(executable, commandArguments, {
		cwd: repositoryRoot,
		encoding: 'utf8',
		input,
		maxBuffer: 16 * 1024 * 1024,
		windowsHide: true
	});
	if (result.status !== 0) {
		if (sensitive) fail('A protected database operation failed; its transaction was rolled back.');
		if (result.error) fail(`Supabase CLI could not start: ${result.error.message}`);
		const detail = String(result.stderr ?? '').trim().split(/\r?\n/).at(-1);
		fail(detail ? `Supabase CLI failed: ${detail}` : 'Supabase CLI failed.');
	}
	return String(result.stdout ?? '').trim();
}

function createProjectWorkspace(projectRef) {
	const root = mkdtempSync(join(tmpdir(), 'restogogo-tenant-promotion-'));
	const supabaseRoot = join(root, 'supabase');
	mkdirSync(join(supabaseRoot, '.temp'), { recursive: true });
	cpSync(configPath, join(supabaseRoot, 'config.toml'));
	writeFileSync(join(supabaseRoot, '.temp', 'project-ref'), projectRef, 'utf8');
	return root;
}

function removeProjectWorkspace(root) {
	const resolvedTemp = `${realpathSync(tmpdir()).replace(/[\\/]$/, '')}${sep}`.toLowerCase();
	const resolvedRoot = realpathSync(root).toLowerCase();
	if (!resolvedRoot.startsWith(resolvedTemp) || !basename(resolvedRoot).startsWith('restogogo-tenant-promotion-')) {
		fail('Refusing to remove an unexpected temporary path.');
	}
	rmSync(resolvedRoot, { recursive: true, force: true });
}

function queryProject(workspace, sql, { sensitive = false } = {}) {
	const output = runCli(
		['supabase', '--workdir', workspace, 'db', 'query', '--linked', '--output-format', 'json'],
		{ input: sql, sensitive }
	);
	let parsed;
	try {
		parsed = JSON.parse(output);
	} catch {
		fail('Supabase returned an unreadable database response.');
	}
	if (!Array.isArray(parsed.rows)) fail('Supabase returned no database rows.');
	return parsed.rows;
}

function sqlLiteral(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
}

function qualifiedName(schema, table) {
	if (!/^[a-z_][a-z0-9_]*$/.test(schema) || !/^[a-z_][a-z0-9_]*$/.test(table)) {
		fail('Unsafe database identifier.');
	}
	return `"${schema}"."${table}"`;
}

function insertRows(schema, table, rows, excludedColumns = []) {
	if (!rows.length) return '';
	const excluded = new Set(excludedColumns);
	const columns = Object.keys(rows[0]).filter((column) => !excluded.has(column)).sort();
	if (!columns.length || columns.some((column) => !/^[a-z_][a-z0-9_]*$/.test(column))) {
		fail(`Unsafe or empty column set for ${schema}.${table}.`);
	}
	for (const row of rows) {
		const rowColumns = Object.keys(row).filter((column) => !excluded.has(column)).sort();
		if (rowColumns.join('|') !== columns.join('|')) fail(`Inconsistent rows for ${schema}.${table}.`);
	}
	const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
	const json = sqlLiteral(JSON.stringify(rows));
	return `insert into ${qualifiedName(schema, table)} (${quotedColumns})\nselect ${quotedColumns}\nfrom jsonb_populate_recordset(null::${qualifiedName(schema, table)}, ${json}::jsonb);`;
}

function sourceExportSql(restaurantId, ownerEmail) {
	const tablePairs = tenantTables
		.map(
			(table) =>
				`${sqlLiteral(table)}, (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.${table} t where t.restaurant_id = ${sqlLiteral(restaurantId)}::uuid)`
		)
		.join(',\n');
	return `
select jsonb_build_object(
  'restaurant', (select to_jsonb(r) from public.restaurants r where r.id = ${sqlLiteral(restaurantId)}::uuid),
  'owner_profile', (
    select to_jsonb(p) from public.profiles p
    join public.restaurants r on r.owner_profile_id = p.id
    where r.id = ${sqlLiteral(restaurantId)}::uuid and lower(p.email::text) = ${sqlLiteral(ownerEmail)}
  ),
  'auth_user', (
    select to_jsonb(u) from auth.users u
    join public.profiles p on p.auth_user_id = u.id
    join public.restaurants r on r.owner_profile_id = p.id
    where r.id = ${sqlLiteral(restaurantId)}::uuid and lower(u.email) = ${sqlLiteral(ownerEmail)}
  ),
  'auth_identities', (
    select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from auth.identities i
    join public.profiles p on p.auth_user_id = i.user_id
    join public.restaurants r on r.owner_profile_id = p.id
    where r.id = ${sqlLiteral(restaurantId)}::uuid
  ),
  'storage_object_count', (
    select count(*) from storage.objects o
    where o.bucket_id = 'badge-proofs' and o.name like ${sqlLiteral(`${restaurantId}/%`)}
  ),
  'owner_related', jsonb_build_object(
    'onboarding_drafts', (select count(*) from public.owner_onboarding_drafts d join public.profiles p on p.auth_user_id = d.auth_user_id where lower(p.email::text) = ${sqlLiteral(ownerEmail)}),
    'push_subscriptions', (select count(*) from public.push_subscriptions s join public.profiles p on p.id = s.profile_id where lower(p.email::text) = ${sqlLiteral(ownerEmail)}),
    'platform_admins', (select count(*) from public.platform_admins a join public.profiles p on p.id = a.profile_id where lower(p.email::text) = ${sqlLiteral(ownerEmail)})
  ),
  'tables', jsonb_build_object(${tablePairs})
) as payload;
`;
}

function targetPreflightSql(restaurantId, ownerEmail) {
	return `
select jsonb_build_object(
  'auth_users', (select count(*) from auth.users),
  'profiles', (select count(*) from public.profiles),
  'restaurants', (select count(*) from public.restaurants),
  'memberships', (select count(*) from public.restaurant_memberships),
  'employees', (select count(*) from public.employees),
  'same_restaurant', (select count(*) from public.restaurants where id = ${sqlLiteral(restaurantId)}::uuid),
  'same_owner', (select count(*) from auth.users where lower(email) = ${sqlLiteral(ownerEmail)})
) as preflight;
`;
}

function buildImportSql(payload) {
	const statements = [
		'begin;',
		'set constraints all deferred;',
		`do $guard$ begin
  if (select count(*) from auth.users) <> 0
     or (select count(*) from public.profiles) <> 0
     or (select count(*) from public.restaurants) <> 0 then
    raise exception 'Production target is no longer empty.';
  end if;
end $guard$;`,
		insertRows('auth', 'users', [payload.auth_user], ['confirmed_at']),
		insertRows('auth', 'identities', payload.auth_identities, ['email']),
		insertRows('public', 'profiles', [payload.owner_profile]),
		insertRows('public', 'restaurants', [payload.restaurant])
	];
	for (const table of tenantTables) statements.push(insertRows('public', table, payload.tables[table]));
	statements.push('commit;');
	statements.push(`select jsonb_build_object(
  'restaurant_id', r.id,
  'restaurant_name', r.name,
  'owner_profile_id', r.owner_profile_id,
  'owner_email', p.email,
  'employee_count', (select count(*) from public.employees e where e.restaurant_id = r.id),
  'membership_count', (select count(*) from public.restaurant_memberships m where m.restaurant_id = r.id)
) as imported
from public.restaurants r
join public.profiles p on p.id = r.owner_profile_id
where r.id = ${sqlLiteral(payload.restaurant.id)}::uuid;`);
	return statements.filter(Boolean).join('\n\n');
}

function countsFor(payload) {
	return Object.fromEntries(tenantTables.map((table) => [table, payload.tables[table].length]));
}

function assertSource(payload, expected) {
	if (!payload?.restaurant || !payload?.owner_profile || !payload?.auth_user) {
		fail('The requested restaurant, owner profile, or Auth user was not found.');
	}
	if (payload.restaurant.id !== expected.restaurantId) fail('Source restaurant id changed unexpectedly.');
	if (String(payload.restaurant.name).toLowerCase().includes('test lab')) fail('Refusing to promote a test restaurant.');
	if (String(payload.owner_profile.email).toLowerCase() !== expected.ownerEmail) fail('Owner profile email does not match.');
	if (String(payload.auth_user.email).toLowerCase() !== expected.ownerEmail) fail('Auth user email does not match.');
	if (!payload.auth_user.encrypted_password) fail('The owner has no password credential to preserve.');
	if (!Array.isArray(payload.auth_identities) || payload.auth_identities.length !== 1) {
		fail('The owner must have exactly one Auth identity for this promotion.');
	}
	if (payload.auth_identities[0].provider !== 'email') fail('Only an email Auth identity can be promoted safely.');
	if (Number(payload.storage_object_count) !== 0) fail('Badge proof objects require a separate Storage migration.');
	const related = payload.owner_related ?? {};
	if (Number(related.onboarding_drafts) || Number(related.push_subscriptions) || Number(related.platform_admins)) {
		fail('The owner has environment-specific records that must be handled separately.');
	}
	for (const table of tenantTables) {
		if (!Array.isArray(payload.tables?.[table])) fail(`Source export omitted ${table}.`);
	}
}

function assertEmptyTarget(preflight) {
	for (const [name, value] of Object.entries(preflight)) {
		if (Number(value) !== 0) fail(`Production preflight failed: ${name} is not empty.`);
	}
}

function assertTarget(payload, sourcePayload, expected) {
	assertSource(payload, expected);
	const sourceCounts = countsFor(sourcePayload);
	const targetCounts = countsFor(payload);
	for (const table of tenantTables) {
		if (targetCounts[table] !== sourceCounts[table]) fail(`Row-count verification failed for ${table}.`);
	}
	if (payload.auth_user.encrypted_password !== sourcePayload.auth_user.encrypted_password) {
		fail('The owner password credential did not transfer exactly.');
	}
}

const arguments_ = parseArguments(process.argv.slice(2));
let sourceWorkspace;
let targetWorkspace;
let sourcePayload;

try {
	if (!existsSync(configPath)) fail('Run this command from the Restogogo repository.');
	const projects = JSON.parse(runCli(['supabase', 'projects', 'list', '-o', 'json']));
	const sourceProject = projects.find((project) => project.id === arguments_.sourceRef);
	const targetProject = projects.find((project) => project.id === arguments_.targetRef);
	if (sourceProject?.name !== SOURCE_PROJECT_NAME) fail(`Source project must be named exactly ${SOURCE_PROJECT_NAME}.`);
	if (targetProject?.name !== TARGET_PROJECT_NAME) fail(`Target project must be named exactly ${TARGET_PROJECT_NAME}.`);

	sourceWorkspace = createProjectWorkspace(arguments_.sourceRef);
	targetWorkspace = createProjectWorkspace(arguments_.targetRef);

	const sourceRows = queryProject(
		sourceWorkspace,
		sourceExportSql(arguments_.restaurantId, arguments_.ownerEmail),
		{ sensitive: true }
	);
	sourcePayload = sourceRows[0]?.payload;
	assertSource(sourcePayload, arguments_);

	const preflight = queryProject(
		targetWorkspace,
		targetPreflightSql(arguments_.restaurantId, arguments_.ownerEmail)
	)[0]?.preflight;
	if (!preflight) fail('Production preflight returned no result.');
	assertEmptyTarget(preflight);

	const counts = countsFor(sourcePayload);
	const nonEmptyCounts = Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
	console.log(`Dry run passed for ${sourcePayload.restaurant.name}.`);
	console.log(`Owner: ${arguments_.ownerEmail}; employees: ${counts.employees}; Auth identities: ${sourcePayload.auth_identities.length}.`);
	console.log(`Tenant rows: ${JSON.stringify(nonEmptyCounts)}.`);

	if (!arguments_.execute) {
		console.log(`No production data changed. Re-run with --execute and ${EXECUTION_GUARD}=<target-ref>.`);
		process.exitCode = 0;
	} else {
		if (process.env[EXECUTION_GUARD] !== arguments_.targetRef) {
			fail(`Set ${EXECUTION_GUARD} to the exact target ref before using --execute.`);
		}
		queryProject(targetWorkspace, buildImportSql(sourcePayload), { sensitive: true });
		const verificationRows = queryProject(
			targetWorkspace,
			sourceExportSql(arguments_.restaurantId, arguments_.ownerEmail),
			{ sensitive: true }
		);
		const targetPayload = verificationRows[0]?.payload;
		assertTarget(targetPayload, sourcePayload, arguments_);
		console.log('Production tenant promotion completed and every table count was verified.');
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
} finally {
	sourcePayload = undefined;
	if (sourceWorkspace && existsSync(sourceWorkspace)) removeProjectWorkspace(sourceWorkspace);
	if (targetWorkspace && existsSync(targetWorkspace)) removeProjectWorkspace(targetWorkspace);
}
