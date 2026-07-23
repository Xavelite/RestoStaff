import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const connectionString = process.env.RESTOGOGO_BOOTSTRAP_DATABASE_URL ?? '';
const requestedPath = process.argv[2] ?? '';
const repositoryRoot = process.cwd();
const sqlPath = path.resolve(repositoryRoot, requestedPath);
const allowedRoots = [
  path.resolve(repositoryRoot, 'supabase/baseline'),
  path.resolve(repositoryRoot, 'supabase/tests')
];

if (!/^postgres(?:ql)?:\/\//.test(connectionString)) {
  throw new Error('RESTOGOGO_BOOTSTRAP_DATABASE_URL must be a PostgreSQL connection URL.');
}
if (!allowedRoots.some((root) => sqlPath.startsWith(`${root}${path.sep}`))) {
  throw new Error('SQL execution is restricted to canonical baseline and contract files.');
}

const sql = await readFile(sqlPath, 'utf8');
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  await client.query(sql);
  console.log(`Executed ${path.relative(repositoryRoot, sqlPath)}.`);
} finally {
  await client.end().catch(() => undefined);
}
