// A System's Zynq PS in the scheduler (#4689, part 5b of #4688): core/system-sim-zynq.js's ZynqPsNode, its program in a
// Worker (core/zynq-ps-engine.js, Node's: server/zynq-ps-spawn.js) in lockstep with the scheduler. Against the PS's
// model run alone (core/zynq-ps-sim.js runPs, the reference): the same bytes, each frame's start bit at its byte's time
// on its TX, decoded by a terminal; LD4's changes at the model's times; the same run twice. The program's end and its
// errors said; the plan's PS node and its UART's wires (core/system-build.js); where it cannot run, said.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../server/zynq-ps-spawn.js';
import { prepareZynqPs, ZynqPsNode, zynqPsProblem } from '../core/system-sim-zynq.js';
import { runPs } from '../core/zynq-ps-sim.js';
import { psOfBoard } from '../core/zynq-ps.js';
import { SystemSim } from '../core/system-sim.js';
import { TerminalNode } from '../core/system-sim-terminal.js';
import { systemPlan, psNodeId } from '../core/system-build.js';
import { readSystem } from '../core/system-doc.js';
import { fidelityProblem } from '../core/system-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PS = psOfBoard('zybo-z7', '20');
// (uart-zynq's program, its blink's delay shortened: 20 000 000 iterations are seconds of the A9's time)
const HELLO = fs.readFileSync(path.join(ROOT, 'examples/uart-zynq/zybo/ps/main.c'), 'utf8').replace(/20000000u/g, '20000u');
const made = [];
after(() => { for (const n of made) n.dispose(); });

async function run(source, until, { name = 'zybo/ps/main.c', terminal = true } = {}) {
  await prepareZynqPs(['zybo_ps']);
  const sim = new SystemSim();
  const ps = sim.addNode('zybo_ps', new ZynqPsNode({ id: 'zybo_ps', ps: PS, program: { name, data: source } }));
  made.push(ps);
  const term = terminal ? sim.addNode('term', new TerminalNode({ baud: 115200, frame: '8N1' })) : null;
  if (term) sim.link({ from: 'zybo_ps.tx', to: 'term.rx', kind: 'uart', baud: 115200 });
  sim.run(until);
  return { sim, ps, term };
}

test('#4689 the PS in the scheduler: uart-zynq\'s hello on a terminal, the bytes and their times the PS\'s model\'s; LD4\'s changes; the same run twice', async () => {
  const until = 6e9;   // (6 ms: the hello's 46 bytes at 115200 baud, 4 ms; LD4's first changes)
  const ref = runPs(HELLO, { ps: PS, untilNs: until / 1000 });
  const a = await run(HELLO, until);
  const text = String.fromCharCode(...a.term.received.map((b) => b.byte));
  assert.equal(text, 'Hello from the Cortex-A9 of Digilent Zybo Z7\r\n');
  assert.deepEqual(a.term.received.map((b) => b.byte), ref.uart.bytes.map((b) => b.byte));
  assert.ok(a.term.received.every((b) => !b.error));
  assert.deepEqual(a.sim.log, []);
  assert.equal(a.ps.finished, null);
  // (each frame: its start bit's fall at its byte's time, as the model sent it; its stop bit back to 1)
  const tx = [];
  await prepareZynqPs(['zybo_ps']);
  const node = new ZynqPsNode({ id: 'zybo_ps', ps: PS, program: { name: 'zybo/ps/main.c', data: HELLO } });
  made.push(node);
  for (let t = 1e8; t <= until; t += 1e8) tx.push(...node.advanceTo(t));
  const falls = tx.filter((c) => c.pin === 'tx' && c.value === 0);
  // (a fall per byte at least: its start bit; the first of each the byte's own time)
  for (const r of ref.uart.bytes) assert.ok(falls.some((f) => f.t === r.t), `the start bit of a byte at ${r.t}`);
  assert.ok(tx.every((c, i) => i === 0 || c.t >= tx[i - 1].t), 'in time order');
  // (LD4: MIO 7's changes, at the model's times)
  const ld4 = tx.filter((c) => c.pin === 'LD4');
  assert.deepEqual(ld4.map((c) => [c.t, c.value]), ref.gpio.filter((g) => g.t <= until).map((g) => [g.t, g.value]));
  assert.ok(ld4.length >= 2, JSON.stringify(ld4));
  // (the same run twice: deterministic)
  const again = await run(HELLO, until);
  assert.deepEqual(again.term.received, a.term.received);
});

test('#4689 the PS\'s program\'s end and errors: returned (info), an address with no register (error, the node stopped), not a .c', async () => {
  const ret = await run('int main(void) { return 3; }', 1e8, { terminal: false });
  assert.deepEqual(ret.sim.log.map((m) => [m.node, m.kind, m.text]), [['zybo_ps', 'info', 'its program returned 3']]);
  const bad = await run('#include <stdint.h>\nint main(void) { return (int)*(volatile uint32_t *)0xF8000100; }', 1e8, { terminal: false });
  assert.deepEqual([bad.ps.finished, bad.sim.log.map((m) => [m.kind, m.text])], ['error', [['error', 'its program: the program reads 0xF8000100, where the PS\'s model has no register (its UART1, GPIO bank 0 and M_AXI_GP0\'s window 0x40000000 to 0x7FFFFFFF are simulated)']]]);
  const syntax = await run('int main(void) { return }', 1e8, { terminal: false });
  assert.equal(syntax.ps.finished, 'error');
  assert.match(syntax.sim.log[0].text, /^its program: line 1: /);
  await prepareZynqPs(['zybo_ps']);
  const py = new ZynqPsNode({ id: 'zybo_ps', ps: PS, program: { name: 'zybo/ps/main.py', data: '' } });
  made.push(py);
  assert.deepEqual([py.finished, py.messages().map((m) => m.text)], ['error', ['its program zybo/ps/main.py is not a .c']]);
  // (its fidelity notes, the node contract's: what it models, approximates and omits, #5499)
  assert.deepEqual([fidelityProblem(py.fidelity), py.fidelity.map((f) => f.kind)], [null, ['models', 'approximates', 'omits']]);
  assert.throws(() => new ZynqPsNode({ id: 'other_ps', ps: PS, program: { name: 'a.c', data: '' } }), /other_ps: its PS's engine not started \(prepareZynqPs first\)/);
});

test('#4689 the plan: a Zynq node with a PS program, its PS a node of its own (<id>_ps), its UART\'s wires to the terminal; with none, no PS, no wires', () => {
  const sys = readSystem(fs.readFileSync(path.join(ROOT, 'examples/uart-zynq/uart_zynq.sys.json'), 'utf8')).system;
  const ports = { leds: [{ name: 'clk', dir: 'in', width: 1 }, { name: 'sw', dir: 'in', width: 3 }, { name: 'led', dir: 'out', width: 4 }] };
  const p = systemPlan(sys, { ports });
  assert.equal(psNodeId('zybo'), 'zybo_ps');
  assert.deepEqual([p.errors, p.ps], [[], [{ id: 'zybo_ps', node: 'zybo', program: 'zybo/ps/main.c' }]]);
  assert.deepEqual(p.wires.map((w) => [w.from, w.to, w.kind, w.baud]), [['zybo_ps.tx', 'term.rx', 'uart', 115200], ['term.tx', 'zybo_ps.rx', 'uart', 115200]]);
  const none = systemPlan({ ...sys, nodes: [{ ...sys.nodes[0], ps: undefined }, sys.nodes[1]] }, { ports });
  assert.deepEqual([none.ps, none.wires], [[], []]);
});

test('#4689 where a Zynq\'s PS cannot run: no SharedArrayBuffer, or a page not cross-origin isolated, said', () => {
  assert.equal(zynqPsProblem({ SharedArrayBuffer }, true), null);
  assert.equal(zynqPsProblem({ SharedArrayBuffer, crossOriginIsolated: true }, false), null);
  assert.equal(zynqPsProblem({}, false), 'a Zynq\'s PS runs in a page cross-origin isolated: the page is not cross-origin isolated: its server sent no Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy, or the browser refused them');
  assert.equal(zynqPsProblem({ SharedArrayBuffer, location: { protocol: 'file:' } }, false), 'a Zynq\'s PS runs in a page cross-origin isolated: the page is opened from a file, which cannot be cross-origin isolated: open the site or the local server');
});
