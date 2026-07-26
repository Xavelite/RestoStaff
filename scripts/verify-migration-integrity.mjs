import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = process.cwd();
const migrationsDirectory = path.join(repositoryRoot, 'supabase', 'migrations');
const manifestPath = path.join(migrationsDirectory, 'checksums.json');
const filenamePattern = /^(\d{12}|\d{14})_([a-z0-9_]+)\.sql$/;
const writeManifest = process.argv.includes('--write');

// These two applied migrations intentionally share a historical name. Applied
// migration filenames are immutable, so future duplicate names are rejected
// while this reviewed legacy pair remains explicit.
const allowedDuplicateNames = new Map([
  ['fix_fixed_schedule_guard_privileges', ['202607030009', '202607050010']]
]);

function normalizedSql(source) {
  return source.replaceAll('\r\n', '\n').trimEnd() + '\n';
}

function sha256(source) {
  return createHash('sha256').update(normalizedSql(source), 'utf8').digest('hex');
}

function fail(messages) {
  for (const message of messages) console.error(`Migration integrity: ${message}`);
  process.exitCode = 1;
}

const directoryEntries = (await readdir(migrationsDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
  .sort((left, right) => left.name.localeCompare(right.name));

const errors = [];
const migrations = [];

for (const entry of directoryEntries) {
  const match = entry.name.match(filenamePattern);
  if (!match) {
    errors.push(
      `${entry.name} must follow <12-or-14-digit-version>_<snake_case_name>.sql.`
    );
    continue;
  }

  const source = await readFile(path.join(migrationsDirectory, entry.name), 'utf8');
  migrations.push({
    filename: entry.name,
    version: match[1],
    name: match[2],
    hash: sha256(source)
  });
}

for (const [label, selector] of [
  ['version', (migration) => migration.version],
  ['SQL content hash', (migration) => migration.hash]
]) {
  const groups = Map.groupBy(migrations, selector);
  for (const [value, group] of groups) {
    if (group.length > 1) {
      errors.push(
        `duplicate ${label} ${value}: ${group.map((migration) => migration.filename).join(', ')}.`
      );
    }
  }
}

const names = Map.groupBy(migrations, (migration) => migration.name);
for (const [name, group] of names) {
  if (group.length < 2) continue;
  const allowedVersions = allowedDuplicateNames.get(name) ?? [];
  const actualVersions = group.map((migration) => migration.version).sort();
  if (
    actualVersions.length !== allowedVersions.length ||
    actualVersions.some((version, index) => version !== [...allowedVersions].sort()[index])
  ) {
    errors.push(
      `duplicate migration name ${name}: ${group.map((migration) => migration.filename).join(', ')}.`
    );
  }
}

if (errors.length) {
  fail(errors);
} else if (writeManifest) {
  const manifest = {
    version: 1,
    algorithm: 'sha256-normalized-lf',
    migrations: Object.fromEntries(
      migrations.map((migration) => [migration.filename, migration.hash])
    )
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Recorded ${migrations.length} migration checksums.`);
} else {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    fail(['checksums.json is missing or invalid. Run npm run migrations:record after review.']);
    process.exit();
  }

  const recorded = manifest?.migrations ?? {};
  const currentFiles = new Set(migrations.map((migration) => migration.filename));

  for (const migration of migrations) {
    if (!(migration.filename in recorded)) {
      errors.push(`${migration.filename} is not recorded in checksums.json.`);
    } else if (recorded[migration.filename] !== migration.hash) {
      errors.push(`${migration.filename} changed after its checksum was recorded.`);
    }
  }

  for (const filename of Object.keys(recorded)) {
    if (!currentFiles.has(filename)) {
      errors.push(`${filename} is recorded but missing from supabase/migrations.`);
    }
  }

  if (errors.length) fail(errors);
  else console.log(`Verified ${migrations.length} immutable migration files.`);
}
