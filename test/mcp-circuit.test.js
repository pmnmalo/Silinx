// The MCP server's tools of a digital circuit (#3897, server/mcp-circuit.js, server/mcp-simulate-circuit.js): its parts'
// library (circuit_parts), a half adder built from New Source's circuit by edit_circuit (its HDL file made again, its
// check's messages), a refused operation (nothing written), check_drawing's errors and warnings, simulate_drawing's
// steps (the LEDs, the time, an oscillation, the shorts) and its refusals.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { halfAdder } from './circuit-helpers.mjs';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-circuit-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, text) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${text}`); return r; };
const read = (rel) => fs.readFileSync(path.join(tmp, 'ws', 'c', rel), 'utf8');

test('circuit_parts: the library, one part with its pins, gates and delay; an unknown part', async () => {
  const all = await ok('circuit_parts', {});
  assert.deepEqual(all.data.parts.map((p) => p.type), ['breadboard-half', 'supply', 'logic-switch', 'button', 'led', '7400', '7404', '7408', '7432', '7486']);
  const one = await ok('circuit_parts', { type: '7486' });
  assert.equal(one.text, '7486: Quad 2-input XOR (SN74LS86, 12 ns); pins 1 1A in, 2 1B in, 3 1Y out, 4 2A in, 5 2B in, 6 2Y out, 7 GND gnd, 8 3Y out, 9 3A in, 10 3B in, 11 4Y out, 12 4A in, 13 4B in, 14 VCC vcc; gates xor (1, 2) → 3; xor (4, 5) → 6; xor (9, 10) → 8; xor (12, 13) → 11');
  assert.deepEqual(one.data.parts[0].pins[0], { n: 1, name: '1A', dir: 'in', dx: 0, dy: 0 });
  assert.equal((await ok('circuit_parts', { type: 'led' })).text, 'led: LED; pins 1 A in, 2 K in');
  await fails('circuit_parts', { type: '555' }, 'no part \'555\' (the parts: breadboard-half, supply, logic-switch, button, led, 7400, 7404, 7408, 7432, 7486)');
});

test('edit_circuit: a half adder built on New Source\'s breadboard, its HDL made again; check_drawing; a refused operation writes nothing', async () => {
  await ok('new_project', { name: 'c' });
  await ok('new_source', { project: 'c', type: 'circuit', name: 'half_adder', language: 'vhdl' });
  const ref = halfAdder();
  const ops = [...ref.parts.filter((p) => !['BB1', 'P1'].includes(p.id)).map((p) => ({ op: 'add', type: p.type, at: [p.x, p.y], id: p.id, ...(p.label ? { label: p.label } : {}) })),
    // the VCC wires by the pins' and holes' names
    ...ref.wires.filter((w) => !['w1', 'w2'].includes(w.id)).map((w) => (w.id === 'wv1' ? { op: 'wire', id: w.id, from: 'U1.14', to: 'BB1.tp5', color: 'red' }
      : { op: 'wire', id: w.id, from: w.points[0], to: w.points.at(-1), via: w.points.slice(1, -1) }))];
  const r = await ok('edit_circuit', { project: 'c', path: 'src/half_adder.circ.json', operations: ops });
  const lines = r.text.split('\n');
  assert.equal(lines[0], 'U1 (7486) added');
  assert.equal(lines[6], 'wv1 wired from "U1.14" to "BB1.tp5"');
  assert.deepEqual(lines.slice(-2), ['Process "Check Circuit" of half_adder.circ.json completed successfully.', 'src/half_adder.vhd updated from src/half_adder.circ.json']);
  assert.deepEqual([r.data.parts, r.data.wires, r.data.errors, r.data.warnings, r.data.hdl], [8, 15, [], [], { file: 'src/half_adder.vhd', written: true }]);
  assert.match(read('src/half_adder.vhd'), /^entity half_adder is\n  port \(\n    a : in std_logic;/m);
  assert.equal((await ok('check_drawing', { project: 'c', file: 'src/half_adder.circ.json' })).text, 'Process "Check Circuit" of half_adder.circ.json completed successfully.');
  // a refused operation: the reason, its index, nothing written
  const before = read('src/half_adder.circ.json');
  await fails('edit_circuit', { project: 'c', path: 'src/half_adder.circ.json', operations: [{ op: 'add', type: '7404', at: 'BB1.f22' }, { op: 'wire', from: 'U9.1', to: 'BB1.a1' }] },
    'operation 1 (wire): \'U9.1\': no part U9 in the circuit (nothing written)');
  await fails('edit_circuit', { project: 'c', path: 'src/half_adder.circ.json', operations: [{ op: 'paint' }] }, 'operations[0].op: one of add, move, rotate, delete, wire, set');
  await fails('edit_circuit', { project: 'c', path: 'src/x.pn.json', operations: [{ op: 'delete', id: 'U1' }] }, 'src/x.pn.json: not a circuit (.circ.json)');
  assert.equal(read('src/half_adder.circ.json'), before);
  // a 7404 added beside the breadboard, unpowered: its error, its HDL not made again
  const bad = await ok('edit_circuit', { project: 'c', path: 'src/half_adder.circ.json', operations: [{ op: 'add', type: '7404', at: [40, 20] }, { op: 'set', id: 'D1', color: 'green' }] });
  assert.deepEqual(bad.text.split('\n').slice(0, 4), ['U3 (7404) added', 'D1: color "green"', 'ERROR: U3 (7404) is not powered: its VCC (pin 14) is not on the supply\'s + and its GND (pin 7) is not on the supply\'s −',
    'Process "Check Circuit" of half_adder.circ.json failed (1 error(s), 0 warning(s)).']);
  assert.deepEqual(bad.data.errors, [{ message: 'U3 (7404) is not powered: its VCC (pin 14) is not on the supply\'s + and its GND (pin 7) is not on the supply\'s −', item: 'U3' }]);
  // its power wired, its unused gates' inputs not warned; then one of its inputs wired to an output's net: a warning
  const fixed = await ok('edit_circuit', { project: 'c', path: 'src/half_adder.circ.json', operations: [{ op: 'wire', from: 'U3.14', to: 'BB1.tp30' }, { op: 'wire', from: 'U3.7', to: 'BB1.bn30' }] });
  assert.deepEqual(fixed.data.errors, []);
  assert.deepEqual(fixed.data.warnings, []);
  const w = await ok('edit_circuit', { project: 'c', path: 'src/half_adder.circ.json', operations: [{ op: 'add', type: 'led', at: 'BB1.a22', id: 'D3' }, { op: 'wire', from: 'U3.2', to: 'BB1.b22' }, { op: 'wire', from: 'D3.K', to: 'BB1.tn23' }] });
  assert.deepEqual(w.data.warnings, [{ message: 'U3 pin 1 (1A) is floating: a 74LS input reads high', item: 'U3' }]);
  assert.match(w.text, /^WARNING: U3 pin 1 \(1A\) is floating: a 74LS input reads high\nProcess "Check Circuit" of half_adder\.circ\.json completed successfully with 1 warning\(s\)\.$/m);
});

test('simulate_drawing: a circuit\'s steps, its switches by their labels, its LEDs and time; a floating input; its refusals', async () => {
  const sim = (cycles) => call('simulate_drawing', { project: 'c', file: 'src/half_adder.circ.json', cycles });
  const r = await sim([{ a: 1 }, { b: 1 }, { a: 0 }, { b: '0' }]);
  assert.equal(r.isError, false, r.text);
  assert.equal(r.text, ['half_adder.circ.json from time 0, 4 step(s):', 'start: t = 12 ns; LEDs s=0 c=0 D3=0',
    'step 0: inputs a=1 b=0; t = 24 ns; LEDs s=1 c=0 D3=0', 'step 1: inputs a=1 b=1; t = 36 ns; LEDs s=0 c=1 D3=0',
    'step 2: inputs a=0 b=1; t = 48 ns; LEDs s=1 c=0 D3=0', 'step 3: inputs a=0 b=0; t = 60 ns; LEDs s=0 c=0 D3=0'].join('\n'), 'D3 off: its 7404\'s 1A floats (high), 1Y is 0');
  assert.deepEqual(r.data.steps[1], { step: 1, time: 36, quiet: true, inputs: { a: 1, b: 1 }, leds: { s: 0, c: 1, D3: 0 } });
  assert.deepEqual(r.data.warnings, []);
  assert.equal((await sim([{ x: 1 }])).text, 'simulate_drawing: step 0: \'x\' is not a switch or a button of the circuit (its inputs: a, b)');
  assert.equal((await sim([{ a: 2 }])).text, 'simulate_drawing: step 0: a = 2: 0 or 1');
  assert.equal((await sim([[]])).text, 'simulate_drawing: cycles[0]: an object');
  // a circuit with errors is not simulated
  await ok('edit_circuit', { project: 'c', path: 'src/half_adder.circ.json', operations: [{ op: 'add', type: '7400', at: [60, 60] }] });
  assert.equal((await sim([{}])).text, ['simulate_drawing: ERROR: U4 (7400) is not powered: its VCC (pin 14) is not on the supply\'s + and its GND (pin 7) is not on the supply\'s −',
    'Correct the errors of the circuit to simulate it.'].join('\n'));
  assert.equal((await call('simulate_drawing', { project: 'c', file: 'src/x.vhd', cycles: [{}] })).text,
    'simulate_drawing: \'src/x.vhd\' is not an ASM chart, a state diagram, a schematic or a circuit (.asm.json, .fsm.json, .sch.json, .circ.json)');
});

test('simulate_drawing: a gated ring oscillator says it oscillates; a short while a button is pressed', async () => {
  await ok('new_source', { project: 'c', type: 'circuit', name: 'ring', language: 'verilog' });
  const P = 'src/ring.circ.json';
  // a 7400 on f5 and a 7404 on f14, powered; en → the NAND's 1A; its 1Y → the 7404's 1A; 1Y → 2A; 2Y → the NAND's 1B and the LED
  await ok('edit_circuit', { project: 'c', path: P, operations: [{ op: 'add', type: '7400', at: 'BB1.f5' }, { op: 'add', type: '7404', at: 'BB1.f14' }] });
  const pw = (u, c) => [{ op: 'wire', from: `${u}.14`, to: `BB1.tp${c}` }, { op: 'wire', from: `${u}.7`, to: `BB1.bn${c + 6}` }];
  const r = await ok('edit_circuit', { project: 'c', path: P, operations: [...pw('U1', 5), ...pw('U2', 14), { op: 'wire', from: 'BB1.tn1', to: 'BB1.bn1' },
    { op: 'add', type: 'logic-switch', at: [-6, 9], label: 'en' }, { op: 'wire', from: [-6, 9], to: 'BB1.g5' },
    { op: 'wire', from: 'BB1.h7', to: 'BB1.h14' }, { op: 'wire', from: 'BB1.i15', to: 'BB1.i16' }, { op: 'wire', from: 'BB1.i17', to: 'BB1.j6' },
    { op: 'add', type: 'led', at: 'BB1.a25', label: 'blink' }, { op: 'wire', from: 'BB1.j17', to: 'BB1.e25', via: [[16, 12], [24, 12]] }, { op: 'wire', from: 'BB1.a26', to: 'BB1.tn26' }] });
  assert.deepEqual([r.data.errors, r.data.warnings], [[], []], r.text);
  const s = await ok('simulate_drawing', { project: 'c', file: P, cycles: [{ en: 1 }, { en: 0 }] });
  const lines = s.text.split('\n');
  assert.equal(lines[1], 'start: t = 30 ns; LEDs blink=1');
  assert.match(lines[2], /^step 0: inputs en=1; t = 1030 ns \(still changing\); LEDs blink=[01]$/);
  assert.match(lines[3], /^WARNING: The circuit oscillates: still changing 1000 ns after 30 ns \(.+\)$/);
  assert.equal(s.data.warnings.length, 1);
  assert.equal(s.data.steps[0].quiet, false);
  assert.match(lines[4], /^step 1: inputs en=0; t = \d+ ns; LEDs blink=1$/);
  assert.equal(s.data.steps[1].quiet, true);
});
