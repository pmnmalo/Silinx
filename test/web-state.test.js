// The page's state, web/js/app.js S (#4767): every field the page's modules read or write is declared there, each once,
// by its concern (read as text: the modules need a page). A new field is declared with the others, never only set where
// it is first used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DIR = new URL('../web/js/', import.meta.url);
const read = f => fs.readFileSync(new URL(f, DIR), 'utf8');
const app = read('app.js');

// S's declaration: its keys, in order
function declared() {
  const start = app.indexOf('export const S = {'), end = app.indexOf('\n};', start);
  assert.ok(start >= 0 && end > start, 'app.js declares S');
  const body = app.slice(start, end).replace(/\/\/[^\n]*/g, '');
  return [...body.matchAll(/(?:^|[{,\s])([A-Za-z_]\w*)\s*:/g)].map(m => m[1]);
}
// the modules that share S: app.js and those that import it from there
function users() {
  return fs.readdirSync(DIR).filter(f => f.endsWith('.js')).filter(f => f === 'app.js'
    || [...read(f).matchAll(/import \{([^}]*)\} from '\.\/app\.js'/g)].some(m => m[1].split(',').some(n => n.trim() === 'S')));
}

test('S declares each of its fields once', () => {
  const keys = declared();
  assert.ok(keys.length >= 50, `${keys.length} fields`);
  assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), [], 'declared twice');
  for (const k of ['project', 'docs', 'active', 'fileTree', 'hdlToSch', 'currentJob', 'startupChecked']) assert.ok(keys.includes(k), k);
});

test('every field of S the page uses is declared (#4767)', () => {
  const keys = new Set(declared()), files = users(), missing = new Map();
  assert.ok(files.length > 50, `${files.length} modules share S`);
  for (const f of files) {
    const code = read(f);
    const used = [...code.matchAll(/(?<![\w.$])S\.([A-Za-z_]\w*)/g)].map(m => m[1]);
    // (fields set by Object.assign(S, { a, b: … }))
    for (const m of code.matchAll(/Object\.assign\(S,\s*\{([^}]*)\}/g)) used.push(...m[1].split(',').map(x => x.trim().split(/\s*:/)[0]).filter(Boolean));
    for (const k of used) if (!keys.has(k)) missing.set(k, [...(missing.get(k) || []), path.basename(f)]);
  }
  assert.deepEqual(Object.fromEntries(missing), {}, 'declare them in web/js/app.js S, with their concern');
});

test('the undeclared field of a module is found (the check itself)', () => {
  const keys = new Set(declared());
  const code = 'S.project.top; S.newThing = 1; Object.assign(S, { docs, other: 2 }); x.S.nope; const S2 = S.active;';
  const used = [...code.matchAll(/(?<![\w.$])S\.([A-Za-z_]\w*)/g)].map(m => m[1]);
  for (const m of code.matchAll(/Object\.assign\(S,\s*\{([^}]*)\}/g)) used.push(...m[1].split(',').map(x => x.trim().split(/\s*:/)[0]).filter(Boolean));
  assert.deepEqual(used.filter(k => !keys.has(k)), ['newThing', 'other']);
});
