import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const allowedBreakpoints = new Set(['1180', '980', '760', '520']);

async function sourceFiles(directory, extensions) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(target, extensions)));
    else if (extensions.some((extension) => target.endsWith(extension))) files.push(target);
  }
  return files;
}

test('responsive CSS uses only the product breakpoint ladder', async () => {
  const violations = [];
  for (const file of await sourceFiles('src', ['.svelte', '.css'])) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)) {
      if (!allowedBreakpoints.has(match[1])) violations.push(`${file}:${match[1]}px`);
    }
  }
  assert.deepEqual(violations, []);
});

test('every authenticated route atmosphere has its image asset', async () => {
  const layout = await readFile('src/routes/(app)/+layout.svelte', 'utf8');
  const backgrounds = new Set(await readdir('static/module-backgrounds'));
  const atmosphereByRoute = {
    '/home': 'home',
    '/schedule': 'schedule',
    '/timesheet': 'timesheet',
    '/badge-terminal': 'badge',
    '/team': 'team',
    '/restaurant': 'restaurant',
    '/my-service': 'my-service',
    '/my-time': 'my-time'
  };
  for (const [route, atmosphere] of Object.entries(atmosphereByRoute)) {
    assert.match(layout, new RegExp(`pathname === '${route}'\\) return '${atmosphere}'`));
    assert.ok(backgrounds.has(`${atmosphere}.webp`));
  }
});

test('service labels are not reimplemented outside their domain helper', async () => {
  const offenders = [];
  for (const file of await sourceFiles('src', ['.ts', '.svelte'])) {
    if (file.endsWith(path.join('calendar', 'date.ts'))) continue;
    const source = await readFile(file, 'utf8');
    if (/'lunch'\s*\?\s*'Lunch'\s*:\s*'Evening'/.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});
