import { access, cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'public-projects/idleage');
// Match the adapter selection in svelte.config.js, including Linux CI builds.
const usesVercelAdapter = process.platform !== 'win32' || process.env.VERCEL === '1';
const output = resolve(root, usesVercelAdapter ? '.vercel/output/static' : 'build');

await access(resolve(source, 'index.html'));
await mkdir(resolve(output, 'IdleAge'), { recursive: true });
await cp(source, resolve(output, 'IdleAge'), { recursive: true });
console.log('Staged the standalone IdleAge release at /IdleAge/.');
