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
  // (a plain field, `name: value`, or a slice's, `get name() {…}, set name(v) {…}`: #4767)
  const keys = [...body.matchAll(/(?:^|[{,\s])([A-Za-z_]\w*)\s*:|\bget ([A-Za-z_]\w*)\(\)/g)].map(m => m[1] || m[2]);
  return keys;
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

// the slices (#4767): a slice's module owns its fields, S reads and writes them through getters and setters
test('the drawings\' HDL slice (state-sync.js): S\'s fields are its own, both ways; a project opened resets it', async () => {
  globalThis.window ??= {};
  const { syncState, resetSync } = await import('../web/js/state-sync.js');
  assert.deepEqual(Object.keys(syncState), ['outOfSync', 'staleHdl', 'staleSeen', 'hdlClash', 'hdlClashWarned']);
  assert.ok(Object.values(syncState).every(v => v === undefined), 'undefined until a project opens');
  assert.throws(() => { syncState.other = 1; }, TypeError, 'its fields only');
  resetSync();
  assert.deepEqual([syncState.outOfSync, syncState.staleHdl, syncState.hdlClash], [{}, {}, {}]);
  assert.ok(syncState.staleSeen instanceof Map && syncState.hdlClashWarned instanceof Set);
  // (S's getters and setters, as app.js writes them, onto the slice)
  const block = app.slice(app.indexOf('export const S = {'), app.indexOf('\n};', app.indexOf('export const S = {')));
  for (const k of Object.keys(syncState)) assert.ok(block.includes(`get ${k}() { return syncState.${k}; }, set ${k}(v) { syncState.${k} = v; }`), k);
  // no module reads them through S any more but through the slice
  const through = fs.readdirSync(DIR).filter(f => f.endsWith('.js'))
    .filter(f => /(?<![\w.$])S\.(outOfSync|staleHdl|staleSeen|hdlClash|hdlClashWarned)\b/.test(read(f)));
  assert.deepEqual(through, []);
});

test('the C sources\' slice (state-c.js): S\'s fields are its own, both ways; a project opened resets its failures', async () => {
  const { cState, resetC } = await import('../web/js/state-c.js');
  assert.deepEqual(Object.keys(cState), ['hls', 'bbUndeclared', 'cFailed', 'cFailedSaid']);
  assert.ok(Object.values(cState).every(v => v === undefined), 'undefined until a project opens');
  assert.throws(() => { cState.other = 1; }, TypeError, 'its fields only');
  cState.hls = { models: 1 };
  resetC();
  assert.deepEqual(cState.cFailed, {});
  assert.ok(cState.cFailedSaid instanceof Map);
  assert.deepEqual(cState.hls, { models: 1 }, 'its black boxes kept: read again as the project opens');
  const block = app.slice(app.indexOf('export const S = {'), app.indexOf('\n};', app.indexOf('export const S = {')));
  for (const k of Object.keys(cState)) assert.ok(block.includes(`get ${k}() { return cState.${k}; }, set ${k}(v) { cState.${k} = v; }`), k);
  const through = fs.readdirSync(DIR).filter(f => f.endsWith('.js')).filter(f => /(?<![\w.$])S\.(hls|bbUndeclared|cFailed|cFailedSaid)\b/.test(read(f)));
  assert.deepEqual(through, []);
});

test('the page\'s start slice (state-start.js): S\'s fields are its own, both ways, as the UI tests wait for them', async () => {
  const { startState } = await import('../web/js/state-start.js');
  const FIELDS = ['linkOpened', 'linksWatched', 'startupChecked'];
  assert.deepEqual(Object.keys(startState), FIELDS);
  assert.ok(Object.values(startState).every(v => v === undefined), 'undefined until the start-up gets there');
  assert.throws(() => { startState.other = 1; }, TypeError, 'its fields only');
  const block = app.slice(app.indexOf('export const S = {'), app.indexOf('\n};', app.indexOf('export const S = {')));
  for (const k of FIELDS) assert.ok(block.includes(`get ${k}() { return startState.${k}; }, set ${k}(v) { startState.${k} = v; }`), k);
  assert.deepEqual(fs.readdirSync(DIR).filter(f => f.endsWith('.js')).filter(f => /(?<![\w.$])S\.(linkOpened|linksWatched|startupChecked)\b/.test(read(f))), []);
  // (S's declaration evaluated, app.js itself needs a page: window.Silinx.startupChecked is the slice's)
  const { cState } = await import('../web/js/state-c.js');
  const { syncState } = await import('../web/js/state-sync.js');
  const S = new Function('startState', 'cState', 'syncState', `return ${block.slice('export const S = '.length)}\n};`)(startState, cState, syncState);
  startState.startupChecked = true;
  assert.equal(S.startupChecked, true);
  S.linkOpened = false;
  assert.equal(startState.linkOpened, false);
});
