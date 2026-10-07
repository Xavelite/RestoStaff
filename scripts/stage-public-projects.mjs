import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
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

const universal = resolve(root, 'public-projects/universal');
await access(resolve(universal, 'public/index.html'));
await cp(resolve(universal, 'public'), resolve(output, 'universal'), { recursive: true });
if (usesVercelAdapter) {
  const functionPath = resolve(root, '.vercel/output/functions/universal/api/widgets.func');
  await mkdir(functionPath, { recursive: true });
  await cp(resolve(universal, 'server'), functionPath, { recursive: true });
  const configPath = resolve(root, '.vercel/output/config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.routes ||= [];
  config.routes.unshift({ src: '^/universal/api/widgets$', dest: '/universal/api/widgets' });
  await writeFile(configPath, JSON.stringify(config, null, 2));
}
console.log('Staged Universal at /universal/ with its widget endpoint.');
