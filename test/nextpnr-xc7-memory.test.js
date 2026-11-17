// The 7-series' nextpnr (@silinx/nextpnr-himbaechel-xc7) and its WebAssembly memory on the xc7a100t, the Nexys A7's (#3669):
// the browser edition runs the same WebAssembly as this process (its memory the same, measured in Chrome and WebKit: router2
// 2043 MB for blinky, 2095 MB for vga, 2026-11), so its peak is guarded here. A WebAssembly memory only grows: its size when
// nextpnr ends is its peak. router2 (the local server's and the browser's) within 2.5 GB, well below wasm32's 4 GB that
// Chrome and Safari allow a page; router1 (the browser's fallback where router2 runs out of memory, web/js/nextpnr-router-fallback.js)
// within 256 MB, and routing both examples with no warning. Each run's peak and time are printed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runOpenImplementation } from '../server/open-flow.js';
import { nextpnrXc7Node } from '../packages/silinx-fpga/src/nextpnr-xc7-node.js';
import { nextpnrXdc, xc7BscanCells, xc7ParArgs } from '../packages/silinx-fpga/src/open-flow-xc7.js';
import { portBits } from '../packages/silinx-fpga/src/nextpnr-ports.js';
import { readXdc } from '../packages/silinx-fpga/src/xdc.js';
import { exampleProject } from './examples-lib.mjs';

const PART = 'xc7a100tcsg324-1', MB = 2 ** 20;
const LIMITS = { router2: 2560 * MB, router1: 256 * MB };
// (in this process, not in a thread of its own: its WebAssembly instances are this process's, seen below)
const np = nextpnrXc7Node();

// the memories of the WebAssembly instances made while a run goes on (WebAssembly.instantiate's, the runtime's)
let memories = null;
const instantiate = WebAssembly.instantiate;
before(() => {
  WebAssembly.instantiate = async function (...a) {
    const r = await instantiate.apply(this, a);
    const m = Object.values((r.instance || r).exports).find(x => x instanceof WebAssembly.Memory);
    if (m && memories) memories.push(m);
    return r;
  };
});
after(() => { WebAssembly.instantiate = instantiate; });

let tmp;
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-xc7-memory-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// an example on the Nexys A7, synthesized by the local server's flow: nextpnr's files (as the flow gives them)
async function design(name) {
  const { dir, project } = exampleProject(name, { board: 'nexys-a7' }, tmp);
  const lines = [];
  await runOpenImplementation({ log: l => lines.push(l), result: null, cancelled: false, procs: new Set() }, { project, projectDir: dir, steps: ['synth'] });
  assert.deepEqual(lines.join('\n').split('\n').filter(l => /WARNING|ERROR/.test(l)), [], 'the synthesis');
  const text = fs.readFileSync(path.join(dir, `build/open/${project.top}.json`), 'utf8');
  const xdc = nextpnrXdc(readXdc(fs.readFileSync(path.join(dir, project.constraints), 'utf8')), portBits(text, project.top));
  return { 'chipdb.bin': await np.chipdb(PART, () => {}), 'netlist.json': xc7BscanCells(text).text, 'design.xdc': xdc.text };
}

/** nextpnr on the files with a router: { peak (bytes: the largest memory when it ended), seconds, lines }. */
async function place(files, router) {
  memories = [];
  const lines = [], t = Date.now();
  try {
    const out = await np.run(xc7ParArgs({ part: PART, router, seed: 1, xdc: true }), files, l => lines.push(l));
    assert.ok(out['routed.fasm'], 'the FASM');
    return { peak: Math.max(...memories.map(m => m.buffer.byteLength)), seconds: (Date.now() - t) / 1000, lines };
  } finally { memories = null; }
}

for (const name of ['blinky', 'vga']) {
  test(`${name} on the Nexys A7 (xc7a100t): router2 within ${LIMITS.router2 / MB} MB of WebAssembly memory, router1 within ${LIMITS.router1 / MB} MB; routed with no warning (#3669)`, { timeout: 600_000 }, async () => {
    const files = await design(name);
    for (const router of ['router2', 'router1']) {
      const { peak, seconds, lines } = await place(files, router);
      const msg = `${name}, ${router}: ${Math.round(peak / MB)} MB, ${seconds.toFixed(1)} s`;
      console.log(`# ${msg}`);
      assert.deepEqual(lines.filter(l => /^(Warning|ERROR):/.test(l)), [], msg);
      // (the router asked routed: its time line; nextpnr ended normally)
      assert.ok(lines.some(l => new RegExp(`^Info: ${router === 'router1' ? 'Router1' : 'Router2'} time [\\d.]+s$`).test(l)), msg);
      assert.equal(lines.at(-1), 'Info: Program finished normally.', msg);
      assert.ok(peak <= LIMITS[router], msg);
      // (the measure itself: nextpnr's memory seen, its chip database in it)
      assert.ok(peak > 36 * MB, msg);
    }
  });
}
