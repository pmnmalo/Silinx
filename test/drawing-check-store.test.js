// The drawings' check on a store of its own (#5872): the browser edition's (IndexedDB: web/js/api-local.js, its
// versions web/js/versions-local.js on core/versions.js) is the page's store, not the server's folder; checkDrawings
// (core/drawing-sync.js) and its versions (core/versions.js versionStore) are isomorphic. Here on a store in memory with
// a version store in memory: a state diagram written with another port (an import, the browser's MCP) and an HDL file
// edited: made again, the edit kept in a version of the store's own, the same lines as the server's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDrawings } from '../core/drawing-sync.js';
import { versionStore } from '../core/versions.js';

const EX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'traffic');

// a project in memory with the store's operations core/drawing-sync.js uses (web/js/page-store.js's)
function memoryStore() {
  const pj = JSON.parse(fs.readFileSync(path.join(EX, 'silinx.json'), 'utf8'));
  const files = new Map(pj.files.map(f => [f.path, fs.readFileSync(path.join(EX, f.path), 'utf8')]));
  for (const f of ['src/traffic.fsm.json', 'src/lamps.bool.json']) files.set(f, fs.readFileSync(path.join(EX, f), 'utf8'));
  const texts = new Map(), backend = { index: null,
    readIndex: async () => backend.index, writeIndex: async (n, ix) => { backend.index = structuredClone(ix); },
    getText: async (n, h) => texts.get(h) ?? null, putText: async (n, h, t) => { texts.set(h, t); }, dropText: async (n, h) => { texts.delete(h); }, forget: async () => {} };
  const versions = versionStore(backend);
  const P = {
    readProject: async () => structuredClone(pj), fileTree: async () => [...files.keys()],
    readSources: async () => pj.files.map(f => ({ ...f, text: files.get(f.path) })),
    readFile: async (n, p) => { if (!files.has(p)) throw new Error(`${p}: no such file`); return files.get(p); },
    writeFile: async (n, p, t) => { files.set(p, t); }, deleteFile: async (n, p) => { files.delete(p); },
    saveVersion: async (n, opts) => versions.save(n, { json: pj, files: Object.fromEntries(files) }, opts),
  };
  return { P, files, versions };
}

test('the browser edition\'s store: a state diagram written with another port, an HDL file edited: made again, the edit kept in its versions, said', async () => {
  const { P, files, versions } = memoryStore();
  assert.deepEqual(await checkDrawings(P, 'traffic'), { results: [], written: [], messages: [] });
  const lamps = files.get('src/lamps.vhd');
  const fsm = JSON.parse(files.get('src/traffic.fsm.json'));
  fsm.inputs.push({ name: 'hold', width: 1 });
  fsm.transitions.find(t => t.id === 't3').cond = 'done && !hold';
  files.set('src/traffic.fsm.json', JSON.stringify(fsm, null, 2));
  files.set('src/lamps.vhd', lamps.replace('library', '-- mine\nlibrary'));
  const r = await checkDrawings(P, 'traffic');
  assert.deepEqual(r.messages, [
    'WARNING: src/lamps.vhd was changed outside Silinx: made again from src/lamps.bool.json, the drawing being its source; the changed file is kept in version 1 ("src/lamps.vhd changed outside Silinx").',
    'src/traffic.vhd updated from src/traffic.fsm.json (the drawing was changed outside Silinx)']);
  assert.deepEqual(r.written, ['src/lamps.vhd', 'src/traffic.vhd']);
  assert.equal(files.get('src/lamps.vhd'), lamps);
  assert.match(files.get('src/traffic.vhd'), /hold\s+: in\s+std_logic;/);
  const [v] = await versions.list('traffic');
  assert.deepEqual([v.id, v.reason, v.label, v.author], ['1', 'before-regenerate', 'src/lamps.vhd changed outside Silinx', 'Silinx']);
  assert.match((await versions.read('traffic', '1')).files['src/lamps.vhd'], /^-- mine$/m);
});
