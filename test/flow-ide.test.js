// The open flow's front end and simulation models as hooks of its io (#1675, the toolchain's separation, #1651):
// packages/silinx-fpga/src/open-flow-core.js runFlow, the toolchain's, without them (the sources are the flat Verilog Yosys synthesizes;
// the simulation models' steps fail), and core/flow-ide.js runOpenFlow, the IDE's, with core/synth-front.js
// flowFrontEnd and core/flow-models.js mountSimModels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../packages/silinx-fpga/src/open-flow-core.js';
import * as api from '../packages/silinx-fpga/src/index.js';
import { runOpenFlow } from '../core/flow-ide.js';
import { flowFrontEnd } from '../core/synth-front.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

const COUNTER = 'module cnt(input clk, input rst, output reg [3:0] q);\n  always @(posedge clk) if (rst) q <= 0; else q <= q + 1;\nendmodule\n';
const spec = { top: 'cnt', part: 'xc3s250ecp132-4', device: 'xc3s250e', pkg: 'cp132', family: 'spartan3e', synthEffort: 'normal' };
function memoryIo(sources, extra = {}) {
  const store = {}, lines = [];
  return { store, lines, io: { log: l => lines.push(l), sources: () => sources, ucf: null, yosys: yosysNode,
    write: (name, data) => { store[name] = data; return `build/${name}`; }, read: name => (typeof store[name] === 'string' ? store[name] : null),
    save: () => {}, ...extra } };
}

test('#1675 #1678 the toolchain\'s flow (runFlow, the package\'s API) and the IDE\'s (runOpenFlow, core/flow-ide.js) apart', () => {
  assert.equal(typeof core.runFlow, 'function');
  assert.equal(api.runFlow, core.runFlow);
  assert.ok(!('runOpenFlow' in core) && !('runOpenFlow' in api));
  assert.equal(typeof runOpenFlow, 'function');
});

test('#1675 flowFrontEnd: the errors of the sources and of the elaboration, the synthesis input on demand', () => {
  const ok = flowFrontEnd([{ path: 'cnt.v', lang: 'verilog', text: COUNTER }], 'cnt');
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.input().top, 'cnt');
  assert.match(ok.input().text, /module cnt/);
  const bad = flowFrontEnd([{ path: 'bad.v', lang: 'verilog', text: 'module bad(input a, output b);\n  assign b = c;\nendmodule\n' }], 'bad');
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /^bad\.v:2 /);
});

test('#1675 runFlow without the front end: a flat Verilog module synthesized as it is', { timeout: 300000 }, async () => {
  const { io, lines, store } = memoryIo([{ path: 'cnt.v', lang: 'verilog', text: COUNTER }]);
  const res = await core.runFlow({ ...spec, steps: ['synth'] }, io);
  assert.ok(res.ok, `${res.error}\n${lines.join('\n')}`);
  assert.equal(store['open/cnt_syn.v'], COUNTER);
  assert.ok(store['open/cnt.json']);
  assert.deepEqual(lines.filter(l => /warning/i.test(l)), []);
  assert.deepEqual(res.report.synthesis.summary, { luts: { used: 0 }, ffs: { used: 4 }, iobs: { used: 6 } });
});

test('#1675 runFlow without the front end: a VHDL source is an error, before Yosys runs', async () => {
  let ran = 0;
  const { io, lines } = memoryIo([{ path: 'top.vhd', lang: 'vhdl', text: 'entity top is end;' }], { yosys: async () => { ran++; return {}; } });
  const res = await core.runFlow({ ...spec, top: 'top', steps: ['synth'] }, io);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'the design has errors');
  assert.ok(lines.includes('  top.vhd: VHDL needs the HDL front end (io.frontEnd)'), lines.join('\n'));
  assert.equal(ran, 0);
});

test('#1675 runFlow without the simulation models: their steps fail; runOpenFlow makes them', { timeout: 300000 }, async () => {
  const a = memoryIo([{ path: 'cnt.v', lang: 'verilog', text: COUNTER }]);
  const res = await core.runFlow({ ...spec, steps: ['synth', 'postsynth'] }, a.io);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'the simulation models need the IDE (io.simModels)');
  assert.ok(a.lines.includes('=== SILINX FAILED postsynth (exit 1) ==='));

  const b = memoryIo([{ path: 'cnt.v', lang: 'verilog', text: COUNTER }]);
  const r = await runOpenFlow({ ...spec, steps: ['synth', 'postsynth'] }, b.io);
  assert.ok(r.ok, `${r.error}\n${b.lines.join('\n')}`);
  assert.ok(b.store['netgen/synthesis/cnt_synthesis.vhd'], Object.keys(b.store).join(', '));
  assert.deepEqual(b.lines.filter(l => /warning/i.test(l)), []);
});

// #5592: an unexpected error as the flow says it: its type, its message and its stack's frames, the first one too (Firefox's
// and WebKit's stack start with the frame that threw, which the flow used to leave out as V8's message line)
const FIREFOX_STACK = 'parseXdl@blob:http://127.0.0.1/w:21:601\nplaceRoute@blob:http://127.0.0.1/w:427:9554\nasync*par@blob:http://127.0.0.1/w:427:9667\n';
const thrown = (name, message, stack) => Object.assign(new Error(message), { name, stack });
test('#5592 errorText: the type, the message and the top frames of V8\'s, Firefox\'s and WebKit\'s stacks; none without one', () => {
  assert.equal(core.errorText(thrown('InternalError', 'too much recursion', FIREFOX_STACK)),
    'InternalError: too much recursion\nparseXdl@blob:http://127.0.0.1/w:21:601\nplaceRoute@blob:http://127.0.0.1/w:427:9554\nasync*par@blob:http://127.0.0.1/w:427:9667');
  // (V8's: its message line left, its frames kept; a plain Error without its type)
  assert.equal(core.errorText(thrown('Error', 'x', 'Error: x\n    at a (file:///f.js:1:2)\n    at b (file:///f.js:3:4)')), 'x\n    at a (file:///f.js:1:2)\n    at b (file:///f.js:3:4)');
  // (WebKit's: frames as Firefox's, a native one with no location left)
  assert.equal(core.errorText(thrown('RangeError', 'Maximum call stack size exceeded.', 'f@http://h/w.js:5:6\n[native code]\ng@http://h/w.js:7')),
    'RangeError: Maximum call stack size exceeded.\nf@http://h/w.js:5:6\ng@http://h/w.js:7');
  // (at most `frames`; no stack, or no error at all)
  assert.equal(core.errorText(thrown('InternalError', 'r', FIREFOX_STACK), 1), 'InternalError: r\nparseXdl@blob:http://127.0.0.1/w:21:601');
  assert.equal(core.errorText(thrown('TypeError', 'a is undefined', undefined)), 'TypeError: a is undefined');
  assert.equal(core.errorText('a string thrown'), 'a string thrown');
});

test('#5592 runOpenFlow: an unexpected error\'s line says its type, its message and the frame that threw', async () => {
  const { io, lines } = memoryIo([], { frontEnd: () => { throw thrown('InternalError', 'too much recursion', FIREFOX_STACK); } });
  const res = await runOpenFlow({ ...spec, steps: ['synth'] }, io);
  assert.equal(res.ok, false);
  const at = lines.findIndex(l => l.startsWith('ERROR:Silinx - '));
  assert.deepEqual(lines.slice(at, at + 2), ['ERROR:Silinx - InternalError: too much recursion\nparseXdl@blob:http://127.0.0.1/w:21:601\nplaceRoute@blob:http://127.0.0.1/w:427:9554\nasync*par@blob:http://127.0.0.1/w:427:9667',
    'The Silinx toolchain does not support this yet: implement the design in an ISE mode (Toolchain Settings).']);
  assert.match(res.error, /^InternalError: too much recursion\nparseXdl@/);
});

test('#1675 runOpenFlow: an io\'s own hooks win over the IDE\'s', async () => {
  const { io } = memoryIo([], { frontEnd: () => ({ errors: ['given:1 its own front end'], input: () => null }) });
  const res = await runOpenFlow({ ...spec, steps: ['synth'] }, io);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'the design has errors');
});
