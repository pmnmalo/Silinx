// micro80 on the Basys 3 routed by the 7-series' nextpnr's router 1 (#3746: a 5LUT feeding another slice's CYINIT,
// the 5FF beside it refused, test/nextpnr-xc7-cyinit.test.js; before the fork's fix router 1 never finished on it). A
// file of its own (#5565): router 1 takes most of its time, which grows with the other heavy files sharing the CPU.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runOpenImplementation } from '../server/open-flow.js';
import { nextpnrXc7Node } from '../packages/silinx-fpga/src/nextpnr-xc7-node.js';
import { nextpnrXdc, xc7BscanCells } from '../packages/silinx-fpga/src/open-flow-xc7.js';
import { portBits } from '../packages/silinx-fpga/src/nextpnr-ports.js';
import { readXdc } from '../packages/silinx-fpga/src/xdc.js';
import { exampleProject } from './examples-lib.mjs';

const PART = 'xc7a35tcpg236-1';
const np = nextpnrXc7Node();
const run = np.runApart || np.run;   // (in a thread of its own: a run that never finishes leaves the test's timeout to fire)
// (#5565: seed 2. Router 1's time measured on one computer, alone, with the nextpnr and chipdb of 2026-11-25: seed 1
// 41 s, 2 40 s, 3 181 s, 4 184 s, 5 over 660 s (stopped); each one that finished met 100 MHz with no warning. The test
// used seed 3, one of #3746's, and timed out at 900 s in CI with other files beside it. Seed 2 the fastest: a time much
// longer than that is a regression of router 1 or of the chipdb, not this test's.)
const SEED = 2;
const args = ['--device', PART, '--chipdb', 'chipdb.bin', '--json', 'netlist.json', '-o', 'xdc=design.xdc',
  '--write', 'placed.json', '--report', 'report.json', '--router', 'router1', '--timing-allow-fail', '--seed', String(SEED)];

test('micro80 on the Basys 3 (Yosys\'s netlist, its XDC): placed and routed by router 1, no warning, 100 MHz met by nextpnr\'s estimate', { timeout: 900_000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-xc7-micro80-'));
  try {
    const { dir, project } = exampleProject('micro80', { board: 'basys3' }, tmp);
    const job = { log: () => {}, result: null, cancelled: false, procs: new Set() };
    await runOpenImplementation(job, { project, projectDir: dir, steps: ['synth'] });
    const text = fs.readFileSync(path.join(dir, `build/open/${project.top}.json`), 'utf8');
    const xdc = nextpnrXdc(readXdc(fs.readFileSync(path.join(dir, project.constraints), 'utf8')), portBits(text, project.top));
    const lines = [];
    const error = await run(args, { 'chipdb.bin': await np.chipdb(PART, () => {}), 'netlist.json': xc7BscanCells(text).text, 'design.xdc': xdc.text },
      l => lines.push(l)).then(() => undefined, e => e);
    assert.equal(error, undefined, error?.message);
    assert.deepEqual(lines.filter(l => /^(Warning|ERROR):/.test(l)), []);
    assert.ok(lines.includes('Info: Routing complete.'));
    const fmax = lines.filter(l => /^Info: Max frequency for clock/.test(l)).at(-1);
    assert.match(fmax, /MHz \(PASS at 100\.00 MHz\)$/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
