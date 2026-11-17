// The 7-series' nextpnr (@silinx/nextpnr-himbaechel-xc7) and a LUT pair's 5LUT whose only user is another slice's CARRY4,
// on its CYINIT (#3746): its O5 leaves its site by the AMUX..DMUX output, the one the 5FF beside it would take, so that
// flip-flop is refused there (before the fork's fix, xc7-v0.2.0, the 5LUT counted as feeding its own carry chain inside
// the site: the placement was taken and router 1 never finished, ripping up the two nets that need the same output); a
// design that has one routed by router 1 (the browser's, when router 2 runs out of its memory); and micro80, where it
// was found, routed by router 1 on the Basys 3 (seed 3, one of the issue's).
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
const chipdb = () => np.chipdb(PART, () => {});
const args = (router, seed = 1) => ['--device', PART, '--chipdb', 'chipdb.bin', '--json', 'netlist.json', '-o', 'xdc=design.xdc',
  '--write', 'placed.json', '--report', 'report.json', '--router', router, '--timing-allow-fail', '--seed', String(seed)];

// The design: two LUT3s on the same three inputs (a LUT pair, #3495: y on the 6LUT, two users; ci on the 5LUT), ci the
// CYINIT of a CARRY4 (s its S, q its O), and a flip-flop (d to r); each port through its buffer (yosys's net n as n + 100).
// locks: a cell's BEL.
function design(locks = {}) {
  const port = (direction, bits) => ({ direction, bits });
  const cell = (name, type, dirs, connections, parameters = {}) => ({ type, parameters, attributes: locks[name] ? { BEL: locks[name] } : {},
    port_directions: Object.fromEntries(Object.keys(connections).map(p => [p, dirs.includes(p) ? 'output' : 'input'])), connections });
  const lut = (name, init, o) => cell(name, 'LUT3', ['O'], { I0: [103], I1: [104], I2: [105], O: [o] }, { INIT: init.toString(2).padStart(32, '0') });
  const ports = { clk: port('input', [2]), i0: port('input', [3]), i1: port('input', [4]), i2: port('input', [5]), d: port('input', [6]),
    s: port('input', [7, 8, 9, 10]), q: port('output', [11, 12, 13, 14]), r: port('output', [15]), y: port('output', [16]), y2: port('output', [17]) };
  const cells = {
    lut6: lut('lut6', 0x96, 116), lut5: lut('lut5', 0xe8, 120),
    carry: cell('carry', 'CARRY4', ['O', 'CO'], { CI: ['0'], CYINIT: [120], DI: ['0', '0', '0', '0'], S: [107, 108, 109, 110], O: [111, 112, 113, 114], CO: [121, 122, 123, 124] }),
    ff: cell('ff', 'FDRE', ['Q'], { C: [102], CE: ['1'], D: [106], R: ['0'], Q: [115] }, { INIT: '0' }),
    clk_ibuf: cell('', 'IBUF', ['O'], { I: [2], O: [101] }), clk_bufg: cell('', 'BUFG', ['O'], { I: [101], O: [102] }),
  };
  for (const [name, p] of Object.entries(ports)) if (name !== 'clk') p.bits.forEach((b, i) => {
    cells[`${name}_buf${i}`] = p.direction === 'input' ? cell('', 'IBUF', ['O'], { I: [b], O: [b + 100] })
      : cell('', 'OBUF', ['O'], { I: [name === 'y2' ? 116 : b + 100], O: [b] });
  });
  return JSON.stringify({ creator: 'test', modules: { top: { attributes: { top: '00000000000000000000000000000001' }, ports, cells, netnames: {} } } });
}
// the Basys 3's clock, switches and LEDs
const PINS = { clk: 'W5', i0: 'V17', i1: 'V16', i2: 'W16', d: 'W17', 's[0]': 'W15', 's[1]': 'V15', 's[2]': 'W14', 's[3]': 'W13',
  'q[0]': 'U16', 'q[1]': 'E19', 'q[2]': 'U19', 'q[3]': 'V19', r: 'W18', y: 'U15', y2: 'U14' };
const XDC = Object.entries(PINS).map(([p, pin]) => `set_property -dict {PACKAGE_PIN ${pin} IOSTANDARD LVCMOS33} [get_ports {${p}}]`).join('\n') + '\n';

async function place(netlist, xdc, router, seed) {
  const lines = [];
  try {
    const out = await run(args(router, seed), { 'chipdb.bin': await chipdb(), 'netlist.json': netlist, 'design.xdc': xdc }, l => lines.push(l));
    const placed = JSON.parse(new TextDecoder().decode(out['placed.json'])).modules;
    const bels = Object.fromEntries(Object.entries(Object.values(placed)[0].cells).map(([n, c]) => [n, c.attributes.NEXTPNR_BEL]));
    return { lines, bels, out };
  } catch (error) { return { lines, error }; }
}
const said = lines => lines.filter(l => /^(Warning|ERROR):/.test(l));

test('a 5LUT feeding another slice\'s CYINIT: the 5FF beside it refused (its O5 takes the site\'s AMUX), not taken and left to the router (#3746)', { timeout: 120_000 }, async () => {
  const site = 'X10Y153/SLICE_X0Y0', locks = { lut6: `${site}.A6LUT`, lut5: `${site}.A5LUT`, ff: `${site}.A5FF`, carry: 'X10Y150/SLICE_X0Y0.CARRY4' };
  const { lines, error } = await place(design(locks), XDC, 'router1');
  // (nextpnr's error, its exception a WebAssembly.Exception with no message: the run apart rejects with it, #4260)
  assert.equal(error?.message, `nextpnr stopped on an error: Bel '${site}.A5FF' of type 'SLICE_FFX' is not valid for cell 'ff' of type 'SLICE_FFX'`);
  assert.ok(lines.includes('Info: Constrained 1 LUT pairs (a 6LUT and a 5LUT sharing their inputs).'), 'the LUT pair');
  assert.deepEqual(said(lines), [`ERROR: Bel '${site}.A5FF' of type 'SLICE_FFX' is not valid for cell 'ff' of type 'SLICE_FFX'`]);
});

test('the same design placed by nextpnr: routed by router 1, no warning; the 5FF of the LUT pair\'s site left empty', { timeout: 300_000 }, async () => {
  const { lines, bels, error } = await place(design(), XDC, 'router1');
  assert.equal(error, undefined, error?.message);
  assert.deepEqual(said(lines), []);
  assert.ok(lines.includes('Info: Constrained 1 LUT pairs (a 6LUT and a 5LUT sharing their inputs).'), 'the LUT pair');
  const [, slice, letter] = /^(.+)\.([A-D])6LUT$/.exec(bels.lut6);
  assert.equal(bels.lut5, `${slice}.${letter}5LUT`);
  assert.notEqual(bels.ff, `${slice}.${letter}5FF`);
});

test('micro80 on the Basys 3 (Yosys\'s netlist, its XDC): placed and routed by router 1, no warning, 100 MHz met by nextpnr\'s estimate', { timeout: 900_000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-xc7-cyinit-'));
  try {
    const { dir, project } = exampleProject('micro80', { board: 'basys3' }, tmp);
    const job = { log: () => {}, result: null, cancelled: false, procs: new Set() };
    await runOpenImplementation(job, { project, projectDir: dir, steps: ['synth'] });
    const text = fs.readFileSync(path.join(dir, `build/open/${project.top}.json`), 'utf8');
    const xdc = nextpnrXdc(readXdc(fs.readFileSync(path.join(dir, project.constraints), 'utf8')), portBits(text, project.top));
    // (seed 3, one of the issue's; seed 1 routes too, but router 1 takes far longer on it)
    const { lines, error } = await place(xc7BscanCells(text).text, xdc.text, 'router1', 3);
    assert.equal(error, undefined, error?.message);
    assert.deepEqual(said(lines), []);
    assert.ok(lines.includes('Info: Routing complete.'));
    const fmax = lines.filter(l => /^Info: Max frequency for clock/.test(l)).at(-1);
    assert.match(fmax, /MHz \(PASS at 100\.00 MHz\)$/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
