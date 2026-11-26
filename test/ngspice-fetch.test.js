// ngspice's engine downloaded on first use (#5386, server/ngspice.js), with a package of the test's own in place of
// eecircuit-engine (a Simulation that echoes its netlist): downloaded once, its SHA-256 checked, kept and used again;
// a kept file changed, downloaded again; a wrong SHA-256, an offline first run: the errors; run in its worker thread,
// its runs in turn, an engine's error said; the pins declared for the monthly Pins workflow.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NGSPICE, PINNED, ngspiceDir, ngspicePresent, ngspiceModule, createNgspice } from '../server/ngspice.js';
import { pinError } from '../scripts/check-pins.mjs';
import { fakeTgz } from './helpers-fake-tgz.mjs';

// (a Simulation as eecircuit-engine's: start(), setNetList(), runSim(); its result a voltage per line of the netlist)
const FAKE = `export class Simulation {
  async start() { this.ok = true; }
  setNetList(t) { this.t = t; }
  async runSim() {
    if (!this.ok) throw new Error('not started');
    if (this.t.includes('BAD')) throw new Error('syntax error');
    const n = this.t.trim().split('\\n').length;
    return { dataType: 'real', data: [{ name: 'time', values: [0, 1] }, { name: 'v(n0)', values: [n, n] }] };
  }
  getError() { return []; }
  getInfo() { return 'fake'; }
}
`;
let n = 0;
function setup() {
  process.env.SILINX_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ngspice-'));
  const { bytes } = fakeTgz({ 'dist/eecircuit-engine.mjs': FAKE, 'LICENSE': 'MIT' });
  const pin = { ...NGSPICE, version: `0.0.${++n}`, url: 'https://registry.test/e.tgz', sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  const calls = [];
  const fetchFn = async (url) => { calls.push(url); return new Response(bytes); };
  return { pin, fetchFn, calls };
}

test('downloaded once, its SHA-256 checked, kept: the next process uses the files kept; a kept file changed: downloaded again', async () => {
  const { pin, fetchFn, calls } = setup(), log = [];
  assert.equal(ngspicePresent(pin), false);
  const mod = await ngspiceModule({ pin, fetchFn, log: (l) => log.push(l) });
  assert.equal(mod, path.join(ngspiceDir(pin), 'dist', 'eecircuit-engine.mjs'));
  assert.deepEqual(log, [`ngspice: downloading eecircuit-engine ${pin.version} (about 11 MB, from registry.test: once, then kept in ${ngspiceDir(pin)})…`]);
  assert.equal(ngspicePresent(pin), true);
  assert.deepEqual(fs.readdirSync(path.dirname(ngspiceDir(pin))), [path.basename(ngspiceDir(pin))], 'no folder left half written');
  await ngspiceModule({ pin, fetchFn });
  assert.equal(calls.length, 1, 'kept');
  // (a file kept changed, seen by a process that has not checked it yet: written again from npm)
  const other = { ...pin };   // (the same pin: the module reloaded as a new process would, its check map fresh)
  const { ngspiceModule: fresh } = await import(`../server/ngspice.js?again=${n}`);
  fs.writeFileSync(mod, 'export class Simulation {}');
  const log2 = [];
  await fresh({ pin: other, fetchFn, log: (l) => log2.push(l) });
  assert.equal(calls.length, 2);
  assert.equal(log2[0], `ngspice: the files kept in ${ngspiceDir(pin)} are not those of eecircuit-engine ${pin.version}: downloaded again`);
  assert.equal(fs.readFileSync(mod, 'utf8'), FAKE);
});

test('a wrong SHA-256, a download that fails, offline: nothing kept, the errors say what to do', async () => {
  const { pin, fetchFn } = setup();
  await assert.rejects(ngspiceModule({ pin: { ...pin, sha256: '0'.repeat(64) }, fetchFn }), /^Error: ngspice downloaded from https:\/\/registry\.test\/e\.tgz: its SHA-256 is not the one pinned: not used$/);
  assert.equal(ngspicePresent(pin), false);
  await assert.rejects(ngspiceModule({ pin, fetchFn: async () => new Response('', { status: 404 }) }), /could not be downloaded from https:\/\/registry\.test\/e\.tgz \(HTTP 404\): connect to the Internet once/);
  await assert.rejects(ngspiceModule({ pin, fetchFn: async () => { throw new Error('offline'); } }), /\(offline\): connect to the Internet once$/);
  assert.equal(ngspicePresent(pin), false);
});

test('run in its worker thread: its netlists in turn, an engine\'s error said; the server\'s globals untouched', async () => {
  const { pin, fetchFn } = setup();
  const ng = await createNgspice({ pin, fetchFn });
  try {
    const [a, b] = await Promise.all([ng.run('* a\nR1 n0 0 1\n.end\n'), ng.run('* b\n.end\n')]);
    assert.deepEqual(a.result.data[1], { name: 'v(n0)', values: [3, 3] });
    assert.deepEqual(b.result.data[1].values, [2, 2]);
    assert.equal(a.info, 'fake');
    await assert.rejects(ng.run('BAD'), /^Error: ngspice: syntax error$/);
    assert.equal(globalThis.window, undefined);
  } finally { await ng.close(); }
});

test('the pins declared: its version on npm, its tarball\'s SHA-256 (the monthly Pins workflow)', () => {
  assert.deepEqual(PINNED.map((p) => [p.kind, pinError(p)]), [['npm', ''], ['sha256', '']]);
  assert.equal(NGSPICE.url, `https://registry.npmjs.org/${NGSPICE.package}/-/${NGSPICE.package}-${NGSPICE.version}.tgz`);
  assert.match(NGSPICE.sha256, /^[0-9a-f]{64}$/);
});
