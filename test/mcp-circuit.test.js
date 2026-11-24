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

test('circuit_parts: the library, one part with its pins, gates and delay, its details (#4126); an unknown part', async () => {
  const all = await ok('circuit_parts', {});
  assert.deepEqual(all.data.parts.map((p) => p.type), ['breadboard-half', 'breadboard-full', 'supply', 'logic-switch', 'button', 'spdt', 'dip-4', 'dip-8', 'keypad-4x4', 'rotary-encoder', 'clock', 'pull-up', 'pull-down',
    'led', 'seg7-cc', 'seg7-ca', 'led-bar-10', 'probe', 'lcd-1602', 'oled-ssd1306', 'lm75', 'servo-sg90', 'buzzer', 'stepper-28byj48', 'hc-sr04', 'hc-sr501', 'dht11', 'dht22', 'sd-card', 'arduino-uno', 'arduino-nano', 'fpga-basys2', 'fpga-nexys2', '7400', '7401', '7402', '7403', '7404', '7405', '7406', '7408', '7410', '7411', '7414', '7420', '7427', '7430', '7432', '7486',
    '7407', '7409', '7412', '7413', '7415', '7421', '7422', '7426', '7428', '7433', '7437', '7438', '7440', '74132', '74133', '74136', '74386', '7451', '7454', '7455',
    '74125', '74126', '74240', '74241', '74244', '74365', '74366', '74367', '74368', '74540', '74541', '74242', '74243', '74245',
    '4001', '4011', '4030', '4069', '4070', '4071', '4081', '4002', '4012', '4023', '4025', '4049', '4050', '4072', '4073', '4075', '4077', '7447', '7448', '74138', '74139', '74151', '74153', '74157', '7483', '74283', '7485',
    '7474', '7476', '74112', '7490', '7493', '74161', '74163', '74191', '74193', '74164', '74165', '74194', '74595', '4511', '4017',
    '7473', '7478', '74107', '74109', '74113', '74114', '4013', '4027', '7475', '7477', '74375', '74279', '74174', '74175', '74273', '74377', '74378', '74379', '74173', '74373', '74374', '74573', '74574',
    '74160', '74162', '74168', '74169', '74190', '74192', '74196', '74197', '74290', '74390', '74393', '7492', '74590', '4020', '4040', '4022', '4029', '4510', '4518', '4520',
    '7491', '7495', '74166', '74195', '74295', '74594', '74596', '4021',
    '7442', '74145', '4028', '74137', '74237', '74238', '74154', '74155', '74156', '7446', '7449', '74246', '74247', '74248', '4543', '74147', '74148',
    '74348',
    '74158', '74257', '74258', '74251', '74253', '74352', '74353', '74298', '74181', '74182', '74280', '74688',
    '74670', '74170', '74259', '74256', '74395']);
  const one = await ok('circuit_parts', { type: '7486' });
  assert.equal(one.text.split('\n')[0], '7486: Quad 2-input XOR (SN74LS86, 12 ns); pins 1 1A in, 2 1B in, 3 1Y out, 4 2A in, 5 2B in, 6 2Y out, 7 GND gnd, 8 3Y out, 9 3A in, 10 3B in, 11 4Y out, 12 4A in, 13 4B in, 14 VCC vcc; gates xor (1, 2) → 3; xor (4, 5) → 6; xor (9, 10) → 8; xor (12, 13) → 11');
  assert.deepEqual(one.data.parts[0].pins[0], { n: 1, name: '1A', dir: 'in', dx: 0, dy: 0 });
  // its details too (#4126), as the editor's Part info
  assert.deepEqual(one.text.split('\n').slice(1), ['Chip SN74LS86, 74LS (TTL), DIP-14; supply VCC 14, GND 7', '1Y = XOR(1A, 1B)', '2Y = XOR(2A, 2B)', '3Y = XOR(3A, 3B)', '4Y = XOR(4A, 4B)',
    'Typical delay 12 ns', 'An input left open reads 1', 'Pins: 1 1A (input), 2 1B (input), 3 1Y (output), 4 2A (input), 5 2B (input), 6 2Y (output), 7 GND (supply GND), 8 3Y (output), 9 3A (input), 10 3B (input), 11 4Y (output), 12 4A (input), 13 4B (input), 14 VCC (supply +5 V)']);
  assert.equal(one.data.info.package, 'DIP-14');
  assert.equal((await ok('circuit_parts', {})).data.info, undefined, 'the whole library: no details');
  // (a query, #4495: the parts found by their words, as the Parts panel's search)
  assert.deepEqual((await ok('circuit_parts', { query: 'j-k flip-flop dual' })).data.parts.map((p) => p.type), ['7476', '74112', '7473', '7478', '74107', '74109', '74113', '74114', '4027']);
  assert.deepEqual((await ok('circuit_parts', { query: 'decoder' })).data.parts.map((p) => p.type), ['7447', '7448', '74138', '74139', '4511',
    '7442', '74145', '4028', '74137', '74237', '74238', '74154', '74155', '74156', '7446', '7449', '74246', '74247', '74248', '4543']);   // (#4397's decoders)
  assert.deepEqual((await ok('circuit_parts', { type: 'led' })).text.split('\n'), ['led: LED; pins 1 A in, 2 K in', 'Lights while its anode A is at 1 and its cathode K at 0. An output of the HDL.', 'Pins: 1 A (input), 2 K (input)']);
  assert.equal((await ok('circuit_parts', { type: '7403' })).data.parts[0].openCollector, true);
  // an MSI IC (#3900): its function, its pins by their datasheet's names
  const msi = await ok('circuit_parts', { type: '74138' });
  assert.equal(msi.data.parts[0].function, '3-to-8 line decoder');
  assert.match(msi.text.split('\n')[0], /^74138: 3-to-8 line decoder \(SN74LS138, 22 ns\); pins 1 A in, 2 B in, 3 C in, 4 G2A\u0305 in, [^]* 16 VCC vcc$/);
  assert.match((await ok('circuit_parts', { type: '4001' })).text, /^4001: Quad 2-input NOR \(CD4001B, 60 ns\); pins 1 1A in, 2 1B in, 3 1Y out, 4 2Y out, [^]* 7 VSS gnd, [^]* 14 VDD vcc; gates nor \(1, 2\) → 3; nor \(5, 6\) → 4;/);
  // the AND-OR-INVERTs (#4498): the editor's tip's title (the Parts panel's), its logic (Part info's)
  const { partDef } = await import('../core/circuit-parts.js');
  const { partInfo } = await import('../core/circuit-part-info.js');
  for (const [t, logic] of [['7451', ['1Y = NOR(AND(1A, 1B, 1C), AND(1D, 1E, 1F))', '2Y = NOR(AND(2A, 2B), AND(2C, 2D))']], ['7454', ['Y = NOR(AND(A, B), AND(C, D, E), AND(F, G, H), AND(J, K))']], ['7455', ['Y = NOR(AND(A, B, C, D), AND(E, F, G, H))']]]) {
    const r = await ok('circuit_parts', { type: t });
    assert.ok(r.text.startsWith(`${t}: ${partDef(t).title} (SN74LS${t.slice(2)}, 13 ns)`), r.text);
    assert.deepEqual(r.data.info.logic, logic, t);
    for (const l of logic) assert.ok(r.text.split('\n').includes(l), `${t}: ${l}`);
  }
  // every IC of the library: its title and its details, as the editor's tip and Part info
  for (const p of all.data.parts.filter((x) => x.chip)) {
    const r = await ok('circuit_parts', { type: p.type });
    assert.deepEqual([r.data.info.title, r.data.info.chip], [partDef(p.type).title, p.chip], p.type);
    if (partDef(p.type).gates) assert.deepEqual(r.data.info.logic, partInfo(p.type).logic, p.type);
  }
  await fails('circuit_parts', { type: '555' }, `no part '555' (the parts: ${all.data.parts.map((p) => p.type).join(', ')})`);
});

test('edit_circuit: a half adder built on New Source\'s breadboard, its HDL made again; check_drawing; a refused operation writes nothing', async () => {
  await ok('new_project', { name: 'c' });
  await ok('new_source', { project: 'c', type: 'circuit', name: 'half_adder', language: 'vhdl' });
  const ref = halfAdder();
  const ops = [...ref.parts.filter((p) => !['BB1', 'P1'].includes(p.id)).map((p) => ({ op: 'add', type: p.type, at: [p.x, p.y], id: p.id, ...(p.label ? { label: p.label } : {}) })),
    // the VCC wires by the pins' and holes' names (New Source's own: its supply's two, its rails' jumpers, #4929)
    ...ref.wires.filter((w) => !['w1', 'w2'].includes(w.id)).map((w) => (w.id === 'wv1' ? { op: 'wire', id: w.id, from: 'U1.14', to: 'BB1.tp5', color: 'red' }
      : { op: 'wire', id: w.id, from: w.points[0], to: w.points.at(-1), via: w.points.slice(1, -1) }))];
  const r = await ok('edit_circuit', { project: 'c', path: 'src/half_adder.circ.json', operations: ops });
  const lines = r.text.split('\n');
  assert.equal(lines[0], 'U1 (7486) added');
  assert.equal(lines[6], 'wv1 wired from "U1.14" to "BB1.tp5"');
  assert.deepEqual(lines.slice(-2), ['Process "Check Circuit" of half_adder.circ.json completed successfully.', 'src/half_adder.vhd updated from src/half_adder.circ.json']);
  assert.deepEqual([r.data.parts, r.data.wires, r.data.errors, r.data.warnings, r.data.hdl], [8, 17, [], [], { file: 'src/half_adder.vhd', written: true }]);
  assert.match(read('src/half_adder.vhd'), /^entity half_adder is\n  port \(\n    a : in std_logic;/m);
  assert.equal((await ok('check_drawing', { project: 'c', file: 'src/half_adder.circ.json' })).text, 'Process "Check Circuit" of half_adder.circ.json completed successfully.');
  // a refused operation: the reason, its index, nothing written
  const before = read('src/half_adder.circ.json');
  await fails('edit_circuit', { project: 'c', path: 'src/half_adder.circ.json', operations: [{ op: 'add', type: '7404', at: 'BB1.f22' }, { op: 'wire', from: 'U9.1', to: 'BB1.a1' }] },
    'operation 1 (wire): \'U9.1\': no part U9 in the circuit (nothing written)');
  await fails('edit_circuit', { project: 'c', path: 'src/half_adder.circ.json', operations: [{ op: 'paint' }] }, 'operations[0].op: one of add, move, rotate, copy, delete, wire, reconnect, reshape, set, wires');
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

test('edit_circuit: a breadboard moved with its parts, its wires kept or not; a breadboard turned; a part copied; curved wires (#4059, #4065, #4066, #4064)', async () => {
  await ok('write_file', { project: 'c', path: 'src/moves.circ.json', text: JSON.stringify({ ...halfAdder(), name: 'moves' }, null, 2) });
  const P = 'src/moves.circ.json', m = () => JSON.parse(read(P));
  let r = await ok('edit_circuit', { project: 'c', path: P, operations: [{ op: 'move', id: 'BB1', at: [3, 5] }] });
  assert.deepEqual([r.text.split('\n')[0], r.data.errors, r.data.warnings], ['BB1 moved', [], []]);
  assert.deepEqual(m().parts.find((p) => p.id === 'U1'), { id: 'U1', type: '7486', x: 7, y: 12 });
  assert.deepEqual(m().wires.find((w) => w.id === 'wb1').points, [[-6, 10], [-5, 10], [-5, 11], [8, 16]]);
  // not kept: the switch's wire left where it was, its input floating
  r = await ok('edit_circuit', { project: 'c', path: P, operations: [{ op: 'move', id: 'BB1', at: [0, 0], keep: false }] });
  assert.deepEqual(m().wires.find((w) => w.id === 'wb1').points, [[-6, 10], [-5, 10], [-5, 11], [8, 16]]);
  assert.ok(r.data.warnings.length > 0, r.text);
  await ok('write_file', { project: 'c', path: P, text: JSON.stringify({ ...halfAdder(), name: 'moves' }, null, 2) });
  r = await ok('edit_circuit', { project: 'c', path: P, operations: [{ op: 'rotate', id: 'BB1' }, { op: 'copy', id: 'BB1', by: [0, 40] }, { op: 'copy', id: 'S1' }] });
  assert.deepEqual(r.text.split('\n').slice(0, 3), ['BB1 turned', 'BB1 copied: BB2, U3, U4, D3, D4', 'S1 copied: S3']);
  // (the copy's ICs unpowered: the supply was beside the breadboard; no label twice)
  assert.deepEqual([r.data.parts, r.data.wires, r.data.errors.map((d) => d.item)], [14, 26, ['U3', 'U4']]);
  assert.deepEqual(m().parts.find((p) => p.id === 'U1'), { id: 'U1', type: '7486', x: -7, y: 4, rot: 1 });
  await fails('edit_circuit', { project: 'c', path: P, operations: [{ op: 'copy', id: 'U9' }] }, 'operation 0 (copy): no part U9 in the circuit (nothing written)');
  // (#5162) a part moved onto the leads of another: refused, as in the editor
  await fails('edit_circuit', { project: 'c', path: P, operations: [{ op: 'move', id: 'S3', at: 'S1.out' }] }, 'operation 0 (move): S3 cannot be moved there: it would land on the leads of S1, joining them (nothing written)');
  // (#4064) how its wires are drawn, the editor's ⋮ Curved wires
  r = await ok('edit_circuit', { project: 'c', path: P, operations: [{ op: 'wires', style: 'curved' }] });
  assert.equal(r.text.split('\n')[0], 'the wires drawn curved');
  assert.equal(m().wireStyle, 'curved');
  await ok('edit_circuit', { project: 'c', path: P, operations: [{ op: 'wires', style: 'orthogonal' }] });
  assert.equal(m().wireStyle, 'orthogonal');
  // (#4083) a wire from A to B in the circuit's style: routed, its route said; a boxed-in pin's drawn straight, said
  r = await ok('edit_circuit', { project: 'c', path: P, operations: [{ op: 'wire', from: 'BB1.a3', to: 'BB1.a8', id: 'wj' }] });
  assert.equal(r.text.split('\n')[0], 'wj wired from "BB1.a3" to "BB1.a8", routed [[0,2],[1,2],[1,7],[0,7]]');   // (the board turned above: over its gap beside row a)
  assert.deepEqual(m().wires.find((w) => w.id === 'wj').points, [[0, 2], [1, 2], [1, 7], [0, 7]]);
  await ok('edit_circuit', { project: 'c', path: P, operations: [{ op: 'delete', id: 'wj' }] });
  await ok('edit_circuit', { project: 'c', path: P, operations: [{ op: 'wires', style: 'direct' }] });
  assert.equal(m().wireStyle, undefined);
  await fails('edit_circuit', { project: 'c', path: P, operations: [{ op: 'wires', style: 'wavy' }] }, 'operation 0 (wires): style: direct, orthogonal, curved (nothing written)');
});

test('edit_circuit: a wire\'s colour set, as its Properties\' Colour (#4121); an unknown wire, colour or property refused, nothing written', async () => {
  const P = 'src/colours.circ.json', m = () => JSON.parse(read(P));
  await ok('write_file', { project: 'c', path: P, text: JSON.stringify({ ...halfAdder(), name: 'colours' }, null, 2) });
  const r = await ok('edit_circuit', { project: 'c', path: P, operations: [{ op: 'set', id: 'ws', color: 'yellow' }, { op: 'set', id: 'WB1', color: 'purple' }] });
  assert.deepEqual(r.text.split('\n').slice(0, 2), ['ws: color "yellow"', 'WB1: color "purple"']);
  assert.deepEqual([r.data.errors, r.data.warnings], [[], []]);
  assert.deepEqual([m().wires.find((w) => w.id === 'ws').color, m().wires.find((w) => w.id === 'wb1').color], ['yellow', 'purple']);
  // the other wires as they were, the points too
  assert.deepEqual(m().wires.map((w) => ({ ...w, color: ['ws', 'wb1'].includes(w.id) ? 'x' : w.color })), halfAdder().wires.map((w) => ({ ...w, color: ['ws', 'wb1'].includes(w.id) ? 'x' : w.color })));
  const before = read(P);
  await fails('edit_circuit', { project: 'c', path: P, operations: [{ op: 'set', id: 'ws', color: 'pink' }] }, 'operation 0 (set): color: one of red, black, blue, green, yellow, orange, white, purple (nothing written)');
  await fails('edit_circuit', { project: 'c', path: P, operations: [{ op: 'set', id: 'ws', label: 'x' }] }, 'operation 0 (set): wire ws has no property \'label\' (color) (nothing written)');
  await fails('edit_circuit', { project: 'c', path: P, operations: [{ op: 'set', id: 'w99', color: 'red' }] }, 'operation 0 (set): no part or wire w99 in the circuit (nothing written)');
  assert.equal(read(P), before);
});

test('edit_circuit: a wire\'s colour by default (#4932, #4933): red to VCC or a + rail, black to GND or a − rail, blue otherwise; a colour given kept', async () => {
  const P = 'src/power.circ.json', w = (id) => JSON.parse(read(P)).wires.find((x) => x.id === id).color;
  await ok('write_file', { project: 'c', path: P, text: JSON.stringify({ ...halfAdder(), name: 'power' }, null, 2) });
  const r = await ok('edit_circuit', { project: 'c', path: P, operations: [{ op: 'wire', id: 'wp1', from: 'U2.14', to: 'BB1.tp20' },
    { op: 'wire', id: 'wp2', from: 'U2.GND', to: 'BB1.bn22' }, { op: 'wire', id: 'wp3', from: 'BB1.a23', to: 'BB1.bp23' },
    { op: 'wire', id: 'wp4', from: 'BB1.a29', to: 'BB1.c29' }, { op: 'wire', id: 'wp5', from: 'BB1.a27', to: 'BB1.tp27', color: 'orange' }] });
  assert.deepEqual(r.text.split('\n').slice(0, 2), ['wp1 wired from "U2.14" to "BB1.tp20"', 'wp2 wired from "U2.GND" to "BB1.bn22"']);
  assert.deepEqual([w('wp1'), w('wp2'), w('wp3'), w('wp4'), w('wp5')], ['red', 'black', 'red', 'blue', 'orange']);
});

test('edit_circuit: a wire\'s end reconnected, its bends reshaped, as the editor\'s handles (#4930, #4931); the refusals, nothing written', async () => {
  const P = 'src/reshape.circ.json', w = (id) => JSON.parse(read(P)).wires.find((x) => x.id === id);
  await ok('write_file', { project: 'c', path: P, text: JSON.stringify({ ...halfAdder(), name: 'reshape' }, null, 2) });
  const r = await ok('edit_circuit', { project: 'c', path: P, operations: [{ op: 'reconnect', id: 'wk2', end: 'end', at: 'BB1.tn29' },
    { op: 'reshape', id: 'ws', via: [[6, 13], [24, 13]] }, { op: 'reshape', id: 'wb1', via: [] }, { op: 'reconnect', id: 'wc', end: 'start', at: 'U2.3' }] });
  assert.deepEqual(r.text.split('\n').slice(0, 5), ['wk2\'s end reconnected to "BB1.tn29"', 'ws reshaped: [[6,9],[6,13],[24,13],[24,4]]', 'wb1 reshaped: [[-6,10],[5,11]]',
    'wc\'s start reconnected to "U2.3"', 'Process "Check Circuit" of reshape.circ.json completed successfully.']);
  assert.deepEqual([r.data.errors, r.data.warnings], [[], []]);
  assert.deepEqual([w('wk2').points, w('ws').points, w('wc').color], [[[27, 1], [28, -3]], [[6, 9], [6, 13], [24, 13], [24, 4]], halfAdder().wires.find((x) => x.id === 'wc').color]);
  const before = read(P);
  await fails('edit_circuit', { project: 'c', path: P, operations: [{ op: 'reconnect', id: 'wc', end: 'middle', at: [0, 0] }] }, 'operation 0 (reconnect): end: start or end (nothing written)');
  await fails('edit_circuit', { project: 'c', path: P, operations: [{ op: 'reconnect', id: 'wc', end: 'end', at: 'U2.3' }] }, 'operation 0 (reconnect): a wire joins two different places (nothing written)');
  await fails('edit_circuit', { project: 'c', path: P, operations: [{ op: 'reshape', id: 'ws', via: [[1, 2, 3]] }] }, 'operation 0 (reshape): via: the bends, a list of grid points [[x, y], …] (nothing written)');
  await fails('edit_circuit', { project: 'c', path: P, operations: [{ op: 'reshape', id: 'w99', via: [] }] }, 'operation 0 (reshape): no wire w99 in the circuit (nothing written)');
  assert.equal(read(P), before);
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
  assert.equal((await sim([{ x: 1 }])).text, 'simulate_drawing: step 0: \'x\' is not an input of the circuit (its inputs: a, b)');
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

test('edit_circuit and simulate_drawing with phase 2\'s parts (#3899): a DIP switch\'s levers by their ports, a clock\'s frequency, a display\'s segments', async () => {
  await ok('new_source', { project: 'c', type: 'circuit', name: 'panel', language: 'vhdl' });
  const P = 'src/panel.circ.json';
  // a DIP switch of 4 across the channel at f3 (its pins 1–4 on row f, columns 3–6; 8–5 on row e): levers 1 and 2 from
  // the bottom + rail (joined to the top one) to a common cathode display's segments a and b, beside the breadboard; a
  // clock on an LED
  const r = await ok('edit_circuit', { project: 'c', path: P, operations: [
    { op: 'add', type: 'dip-4', at: 'BB1.f3', id: 'S1', label: 'sw' },
    { op: 'wire', from: 'BB1.j3', to: 'BB1.bp3' }, { op: 'wire', from: 'BB1.j4', to: 'BB1.bp4' }, { op: 'wire', from: 'BB1.bp1', to: 'BB1.tp1', via: [[-2, 15], [-2, -4]] },
    { op: 'add', type: 'seg7-cc', at: [40, 9], id: 'DS1', label: 'hex' },
    { op: 'wire', from: 'BB1.a3', to: 'DS1.a' }, { op: 'wire', from: 'BB1.a4', to: 'DS1.b' }, { op: 'wire', from: 'DS1.3', to: 'BB1.tn20' },
    { op: 'add', type: 'clock', at: [-8, 20], id: 'CK1', label: 'clk' }, { op: 'set', id: 'CK1', hz: 4 },
    { op: 'add', type: 'led', at: [0, 20], id: 'D1', label: 'tick' }, { op: 'wire', from: 'CK1.out', to: 'D1.A' }, { op: 'wire', from: 'D1.K', to: 'BB1.tn2', via: [[1, 18], [-4, 18], [-4, -3]] },
    { op: 'set', id: 'S1', on: { lever: 1, on: true } },
  ] });
  assert.deepEqual([r.data.errors, r.data.warnings], [[], []], r.text);
  const m = JSON.parse(read(P));
  assert.deepEqual(m.parts.find((p) => p.id === 'S1').on, [true, false, false, false]);
  assert.equal(m.parts.find((p) => p.id === 'CK1').hz, 4);
  await fails('edit_circuit', { project: 'c', path: P, operations: [{ op: 'set', id: 'CK1', hz: 100 }] }, 'operation 0 (set): hz: a frequency from 0.1 to 50 Hz (nothing written)');
  const s = await ok('simulate_drawing', { project: 'c', file: P, cycles: [{ clk: 1 }, { sw_2: 1, clk: 0 }, { sw_1: 0 }] });
  const lit = (row) => Object.entries(row.leds).filter(([, v]) => v).map(([k]) => k);
  assert.deepEqual(s.data.steps.map(lit), [['hex_a', 'tick'], ['hex_a', 'hex_b'], ['hex_b']]);
  assert.deepEqual(s.data.steps[1].inputs, { sw_1: 1, sw_2: 1, sw_3: 0, sw_4: 0, clk: 0 });
  assert.match(s.text, /^step 0: inputs sw_1=1 sw_2=0 sw_3=0 sw_4=0 clk=1; t = \d+ ns; LEDs hex_a=1 hex_b=0 hex_c=0 [^\n]* tick=1$/m);
  assert.equal((await call('simulate_drawing', { project: 'c', file: P, cycles: [{ sw: 1 }] })).text,
    'simulate_drawing: step 0: \'sw\' is not an input of the circuit (its inputs: sw_1, sw_2, sw_3, sw_4, clk)');
});

test('simulate_drawing: a circuit\'s logic probes in each step (#3900); no waveforms of its own (#4068)', async () => {
  await ok('new_source', { project: 'c', type: 'circuit', name: 'probed', language: 'verilog' });
  const P = 'src/probed.circ.json';
  const r = await ok('edit_circuit', { project: 'c', path: P, operations: [{ op: 'add', type: '7404', at: 'BB1.f5' }, { op: 'wire', from: 'U1.14', to: 'BB1.tp5' }, { op: 'wire', from: 'U1.7', to: 'BB1.bn11' },
    { op: 'wire', from: 'BB1.tn2', to: 'BB1.bn2', via: [[-2, -3], [-2, 14]] }, { op: 'add', type: 'logic-switch', at: [-6, 9], label: 'a' }, { op: 'wire', from: 'S1.out', to: 'U1.1' },
    { op: 'add', type: 'probe', at: [6, 20], id: 'LP1' }, { op: 'set', id: 'LP1', label: 'y' }, { op: 'wire', from: 'U1.2', to: 'LP1.tip' }] });
  assert.deepEqual([r.data.errors, r.data.warnings], [[], []], r.text);
  const s = await ok('simulate_drawing', { project: 'c', file: P, cycles: [{ a: 1 }, { a: 0 }] });
  assert.deepEqual(s.text.split('\n'), ['probed.circ.json from time 0, 2 step(s):', 'start: t = 10 ns; LEDs none; probes y=1', 'step 0: inputs a=1; t = 20 ns; LEDs none; probes y=0',
    'step 1: inputs a=0; t = 30 ns; LEDs none; probes y=1']);
  assert.deepEqual(s.data.steps[0].probes, { y: '0' });
  assert.equal(s.data.waves, undefined);
  // (the option gone, as the editor's Waveforms button: a circuit's waveforms are its test bench's simulation's)
  assert.equal((await call('simulate_drawing', { project: 'c', file: P, cycles: [], waveforms: true })).isError, true);
});

test('a circuit as an FPGA top (#3901): the breadboard example synthesized and built by run_process, no warning; a bus label by edit_circuit, a vector port, a bit missing its error', async () => {
  await ok('new_project_from_example', { name: 'bb', example: 'breadboard' });
  const run = await ok('run_process', { project: 'bb', process: 'bitstream', toolchain: 'silinx' });
  assert.deepEqual(run.data.warnings, []);
  assert.ok(fs.existsSync(path.join(tmp, 'ws', 'bb', 'build', 'breadboard.bit')));
  // led[8]: a new LED, the bus one bit wider; led[10] without led[9]: refused by the check, the HDL left as it was
  const at = { project: 'bb', path: 'src/breadboard.circ.json' };
  const r = await ok('edit_circuit', { ...at, operations: [{ op: 'add', type: 'led', at: [74, 26], id: 'D9', label: 'led[8]' }, { op: 'wire', from: 'D9.A', to: 'BB1.tp58' }, { op: 'wire', from: 'D9.K', to: 'BB1.bn62' }] });
  assert.deepEqual([r.data.errors, r.data.warnings], [[], []]);
  const hdl = fs.readFileSync(path.join(tmp, 'ws', 'bb', 'src', 'breadboard.vhd'), 'utf8');
  assert.match(hdl, /^ {4}led : out std_logic_vector\(8 downto 0\)$/m);
  assert.match(hdl, /^ {2}led\(8\) <= /m);
  const bad = await ok('edit_circuit', { ...at, operations: [{ op: 'set', id: 'D9', label: 'led[10]' }] });
  assert.deepEqual(bad.data.errors, [{ message: 'The bus led has no bit 8 (its bits: 0, 1, 2, 3, 4, 5, 6, 7, 10): its bits 0 to 10, each a part\'s', item: 'D1' }]);
  assert.equal(fs.readFileSync(path.join(tmp, 'ws', 'bb', 'src', 'breadboard.vhd'), 'utf8'), hdl);
});

test('#5342 simulate_drawing: a temperature sensor\'s temperature set in a step (by its id, °C), its OS; edit_circuit\'s temp; a wrong value refused', async () => {
  // the LM75 powered, its OS pulled up: over TOS (80 °C) active, low
  await ok('write_file', { project: 'c', path: 'src/temp.circ.json', text: JSON.stringify({ format: 'silinx-circuit', version: 1, name: 'temp', lang: 'vhdl',
    parts: [{ id: 'P1', type: 'supply', x: -6, y: -10 }, { id: 'U1', type: 'lm75', x: 0, y: 0, temp: 25 }, { id: 'R1', type: 'pull-up', x: 6, y: -6 }],
    wires: [{ id: 'wg', points: [[3, 0], [-6, -9]], color: 'black' }, { id: 'wv', points: [[0, -3], [-6, -10]], color: 'red' }, { id: 'wo', points: [[6, -6], [2, 0]], color: 'blue' }] }, null, 2) });
  const sim = (cycles) => call('simulate_drawing', { project: 'c', file: 'src/temp.circ.json', cycles });
  const r = await sim([{ U1: 85 }, { U1: 70 }]);
  assert.equal(r.isError, false, r.text);
  assert.deepEqual(r.text.split('\n').slice(1), ['start: t = 0 ns; LEDs none; U1 25.0 °C, OS inactive', 'step 0: inputs none; t = 0 ns; LEDs none; U1 85.0 °C, OS active', 'step 1: inputs none; t = 0 ns; LEDs none; U1 70.0 °C, OS inactive']);
  assert.equal((await sim([{ U1: 'hot' }])).text, 'simulate_drawing: step 0: U1 = "hot": a temperature (°C)');
  await ok('edit_circuit', { project: 'c', path: 'src/temp.circ.json', operations: [{ op: 'set', id: 'U1', temp: 30 }] });
  assert.match((await sim([{}])).text, /start: t = 0 ns; LEDs none; U1 30\.0 °C, OS inactive/);
});

test('#5347 simulate_drawing: a servo\'s arm each step; check_drawing of a servo with no signal', async () => {
  await ok('write_file', { project: 'c', path: 'src/arm.circ.json', text: JSON.stringify({ format: 'silinx-circuit', version: 1, name: 'arm', lang: 'vhdl',
    parts: [{ id: 'P1', type: 'supply', x: -4, y: -10 }, { id: 'M1', type: 'servo-sg90', x: 0, y: 0 }, { id: 'S1', type: 'logic-switch', x: 2, y: 4 }],
    wires: [{ id: 'wg', points: [[0, 0], [-4, -9]], color: 'black' }, { id: 'wv', points: [[1, 0], [-4, -10]], color: 'red' }, { id: 'ws', points: [[2, 4], [2, 0]], color: 'blue' }] }, null, 2) });
  const r = await ok('simulate_drawing', { project: 'c', file: 'src/arm.circ.json', cycles: [{ S1: 1 }, { S1: 0 }] });
  assert.deepEqual(r.text.split('\n').slice(1), ['start: t = 0 ns; LEDs none; M1 at 90°', 'step 0: inputs S1=1; t = 0 ns; LEDs none; M1 at 90°', 'step 1: inputs S1=0; t = 0 ns; LEDs none; M1 at 90°']);
  await ok('edit_circuit', { project: 'c', path: 'src/arm.circ.json', operations: [{ op: 'delete', id: 'S1' }] });
  assert.match((await ok('check_drawing', { project: 'c', file: 'src/arm.circ.json' })).text, /WARNING: M1's signal \(pin 3\) is driven by nothing: its arm stays where it is/);
});

test('#5364 simulate_drawing: a keypad\'s keys by their ports (KP1_2, KP1_5); circuit_parts its pins and what it is', async () => {
  // (R1 on the supply's −; C2 pulled up, lighting D1: key 2, row 1's, darkens it)
  await ok('write_file', { project: 'c', path: 'src/keys.circ.json', text: JSON.stringify({ format: 'silinx-circuit', version: 1, name: 'keys', lang: 'vhdl',
    parts: [{ id: 'P1', type: 'supply', x: -4, y: 0 }, { id: 'KP1', type: 'keypad-4x4', x: 0, y: 10 }, { id: 'R1', type: 'pull-up', x: 5, y: 6 }, { id: 'D1', type: 'led', x: 5, y: 4 }],
    wires: [{ id: 'g', points: [[0, 10], [-4, 1]] }, { id: 'c', points: [[5, 10], [5, 6]] }, { id: 'a', points: [[5, 6], [5, 4]] }, { id: 'k', points: [[6, 4], [-4, 1]] }] }, null, 2) });
  const r = await ok('simulate_drawing', { project: 'c', file: 'src/keys.circ.json', cycles: [{ KP1_2: 1 }, { KP1_2: 0, KP1_5: 1 }] });
  const ins = (on) => 'KP1_1 KP1_2 KP1_3 KP1_A KP1_4 KP1_5 KP1_6 KP1_B KP1_7 KP1_8 KP1_9 KP1_C KP1_star KP1_0 KP1_hash KP1_D'.split(' ').map((k) => `${k}=${k === on ? 1 : 0}`).join(' ');
  assert.deepEqual(r.text.split('\n').slice(1), ['start: t = 0 ns; LEDs D1=1', `step 0: inputs ${ins('KP1_2')}; t = 0 ns; LEDs D1=0`, `step 1: inputs ${ins('KP1_5')}; t = 0 ns; LEDs D1=1`]);
  const info = await ok('circuit_parts', { type: 'keypad-4x4' });
  assert.match(info.text, /^keypad-4x4: Keypad 4×4 \(matrix\); pins 1 R1 pass, 2 R2 pass, 3 R3 pass, 4 R4 pass, 5 C1 pass, 6 C2 pass, 7 C3 pass, 8 C4 pass\nA membrane keypad, 16 keys/);
});

test('#5451 simulate_drawing: an encoder turned by its id (+1, -2), its quadrature on two probes, its switch by its port; circuit_parts', async () => {
  // (CLK and DT on the probes A and B; SW pulled up, on the probe S)
  await ok('write_file', { project: 'c', path: 'src/enc.circ.json', text: JSON.stringify({ format: 'silinx-circuit', version: 1, name: 'enc', lang: 'vhdl',
    parts: [{ id: 'P1', type: 'supply', x: -4, y: 0 }, { id: 'ENC1', type: 'rotary-encoder', x: 0, y: 10 }, { id: 'R1', type: 'pull-up', x: 2, y: 6 },
      { id: 'PA', type: 'probe', x: 0, y: 4, label: 'A' }, { id: 'PB', type: 'probe', x: 1, y: 4, label: 'B' }, { id: 'PS', type: 'probe', x: 2, y: 4, label: 'S' }],
    wires: [{ id: 'g', points: [[4, 10], [-4, 1]] }, { id: 'a', points: [[0, 10], [0, 4]] }, { id: 'b', points: [[1, 10], [1, 4]] }, { id: 's', points: [[2, 10], [2, 6]] }, { id: 't', points: [[2, 6], [2, 4]] }] }, null, 2) });
  const r = await ok('simulate_drawing', { project: 'c', file: 'src/enc.circ.json', cycles: [{ ENC1: 1 }, { ENC1: -2, ENC1_SW: 1 }] });
  const got = r.text.split('\n').slice(1);
  assert.equal(got[0], 'start: t = 0 ns; LEDs none; probes A=1 B=1 S=1');
  assert.equal(got[1], 'step 0: inputs ENC1_A=0 ENC1_B=0 ENC1_SW=0; t = 4000000 ns; LEDs none; probes A=1 B=1 S=1; ENC1 at detent 1');
  assert.equal(got[2], 'step 1: inputs ENC1_A=0 ENC1_B=0 ENC1_SW=1; t = 12000000 ns; LEDs none; probes A=1 B=1 S=0; ENC1 at detent -1');
  await fails('simulate_drawing', { project: 'c', file: 'src/enc.circ.json', cycles: [{ ENC1: 'x' }] }, 'step 0: ENC1 = "x": a turn, its detents (positive clockwise, negative anticlockwise)');
  const info = await ok('circuit_parts', { type: 'rotary-encoder' });
  assert.match(info.text, /^rotary-encoder: Rotary encoder \(KY-040\); pins 1 CLK weak, 2 DT weak, 3 SW pass, 4 \+ pass, 5 GND pass\nA rotary encoder module \(KY-040\)/);
});

test('#5454 simulate_drawing: a buzzer on a switch, its tone said (on: its own); circuit_parts its pins and what it is', async () => {
  await ok('write_file', { project: 'c', path: 'src/buzz.circ.json', text: JSON.stringify({ format: 'silinx-circuit', version: 1, name: 'buzz', lang: 'vhdl',
    parts: [{ id: 'P1', type: 'supply', x: -4, y: -10 }, { id: 'BZ1', type: 'buzzer', x: 0, y: 0 }, { id: 'S1', type: 'logic-switch', x: 0, y: 4 }],
    wires: [{ id: 'ws', points: [[0, 4], [0, 0]] }, { id: 'wg', points: [[3, 0], [-4, -9]] }] }, null, 2) });
  const r = await ok('simulate_drawing', { project: 'c', file: 'src/buzz.circ.json', cycles: [{ S1: 1 }, { S1: 0 }] });
  assert.deepEqual(r.text.split('\n').slice(1), ['start: t = 0 ns; LEDs none; BZ1 silent', 'step 0: inputs S1=1; t = 0 ns; LEDs none; BZ1 2300 Hz', 'step 1: inputs S1=0; t = 0 ns; LEDs none; BZ1 silent']);
  const info = await ok('circuit_parts', { type: 'buzzer' });
  assert.match(info.text, /^buzzer: Buzzer \(active, 5 V\); pins 1 \+ in, 2 − gnd\nAn active buzzer/);
});

test('#5456 simulate_drawing: an HC-SR04 triggered from a switch, its distance by its id, after_us letting its echo come; circuit_parts its pins and what it is', async () => {
  await ok('write_file', { project: 'c', path: 'src/son.circ.json', text: JSON.stringify({ format: 'silinx-circuit', version: 1, name: 'son', lang: 'vhdl',
    parts: [{ id: 'P1', type: 'supply', x: -10, y: -14 }, { id: 'US1', type: 'hc-sr04', x: 0, y: 0, cm: 50 }, { id: 'S1', type: 'logic-switch', x: 1, y: 6 }, { id: 'D1', type: 'led', x: 2, y: 4 }],
    wires: [{ id: 'wt', points: [[1, 6], [1, 0]] }, { id: 'we', points: [[2, 0], [2, 4]] }, { id: 'wk', points: [[3, 4], [3, 3], [-10, 3], [-10, -13]] },
      { id: 'wv', points: [[0, 0], [-12, 0], [-12, -14], [-10, -14]] }, { id: 'wg', points: [[3, 0], [4, 0], [4, 2], [-11, 2], [-11, -13], [-10, -13]] }] }, null, 2) });
  const r = await ok('simulate_drawing', { project: 'c', file: 'src/son.circ.json', cycles: [{ S1: 1 }, { after_us: 12, S1: 0 }, { after_us: 500 }, { after_us: 3000, US1: 120 }] });
  assert.deepEqual(r.text.split('\n').slice(1), ['start: t = 0 ns; LEDs D1=0; US1 50 cm', 'step 0: inputs S1=1; t = 0 ns; LEDs D1=0; US1 50 cm',
    'step 1: inputs S1=0; t = 12000 ns; LEDs D1=0; US1 50 cm, measuring', 'step 2: inputs S1=0; t = 512000 ns; LEDs D1=1; US1 50 cm, measuring',
    'step 3: inputs S1=0; t = 3512000 ns; LEDs D1=0; US1 120 cm, its last echo 2915.4 µs']);
  await fails('simulate_drawing', { project: 'c', file: 'src/son.circ.json', cycles: [{ US1: 500 }] }, 'step 0: US1 = 500: distance (cm) from 2 to 400');
  await fails('simulate_drawing', { project: 'c', file: 'src/son.circ.json', cycles: [{ after_us: -1 }] }, 'step 0: after_us = -1: the time let pass before its inputs, 0 to 1000000 µs');
  await ok('edit_circuit', { project: 'c', path: 'src/son.circ.json', operations: [{ op: 'set', id: 'US1', cm: 75 }] });
  assert.equal(JSON.parse(read('src/son.circ.json')).parts.find((p) => p.id === 'US1').cm, 75, 'edit_circuit\'s cm (#5463)');
  const info = await ok('circuit_parts', { type: 'hc-sr04' });
  assert.match(info.text, /^hc-sr04: Ultrasonic range sensor \(HC-SR04\); pins 1 VCC vcc, 2 Trig in, 3 Echo out, 4 GND gnd\nAn ultrasonic range sensor/);
});

test('#5463 simulate_drawing: a PIR, someone moving by its id, after_us letting its hold time pass; edit_circuit its hold time and jumper; circuit_parts', async () => {
  await ok('write_file', { project: 'c', path: 'src/pir.circ.json', text: JSON.stringify({ format: 'silinx-circuit', version: 1, name: 'pir', lang: 'vhdl',
    parts: [{ id: 'P1', type: 'supply', x: -10, y: -14 }, { id: 'PIR1', type: 'hc-sr501', x: 0, y: 0 }, { id: 'D1', type: 'led', x: 1, y: 4 }],
    wires: [{ id: 'o', points: [[1, 0], [1, 4]] }, { id: 'k', points: [[2, 4], [3, 4], [3, 3], [-10, 3], [-10, -13]] },
      { id: 'v', points: [[0, 0], [-12, 0], [-12, -14], [-10, -14]] }, { id: 'g', points: [[2, 0], [4, 0], [4, 2], [-11, 2], [-11, -13], [-10, -13]] }] }, null, 2) });
  const r = await ok('simulate_drawing', { project: 'c', file: 'src/pir.circ.json', cycles: [{ PIR1: 1 }, { after_us: 1e6, PIR1: 0 }, { after_us: 1e6 }, { after_us: 1e6 }, { after_us: 1e6 }] });
  assert.deepEqual(r.text.split('\n').slice(1), ['start: t = 0 ns; LEDs D1=0; PIR1 OUT 0', 'step 0: inputs PIR1=1; t = 0 ns; LEDs D1=1; PIR1 OUT 1',
    'step 1: inputs PIR1=0; t = 1000000000 ns; LEDs D1=1; PIR1 OUT 1', 'step 2: inputs PIR1=0; t = 2000000000 ns; LEDs D1=1; PIR1 OUT 1',
    'step 3: inputs PIR1=0; t = 3000000000 ns; LEDs D1=1; PIR1 OUT 1', 'step 4: inputs PIR1=0; t = 4000000000 ns; LEDs D1=0; PIR1 OUT 0, blind']);
  await ok('edit_circuit', { project: 'c', path: 'src/pir.circ.json', operations: [{ op: 'set', id: 'PIR1', hold: 10, retrigger: false }] });
  assert.deepEqual((({ hold, retrigger }) => ({ hold, retrigger }))(JSON.parse(read('src/pir.circ.json')).parts.find((p) => p.id === 'PIR1')), { hold: 10, retrigger: false });
  await fails('edit_circuit', { project: 'c', path: 'src/pir.circ.json', operations: [{ op: 'set', id: 'PIR1', hold: 1 }] }, 'operation 0 (set): hold: a time from 3 to 300 s (nothing written)');
  const info = await ok('circuit_parts', { type: 'hc-sr501' });
  assert.match(info.text, /^hc-sr501: Motion sensor \(PIR, HC-SR501\); pins 1 VCC vcc, 2 OUT out, 3 GND gnd\nA motion sensor \(PIR\)/);
});

test('#5470 simulate_drawing: a DHT11 read by a button\'s start after its power-on second, its temperature by DHT1.temp; edit_circuit its humidity; circuit_parts', async () => {
  await ok('write_file', { project: 'c', path: 'src/dht.circ.json', text: JSON.stringify({ format: 'silinx-circuit', version: 1, name: 'dht', lang: 'vhdl',
    parts: [{ id: 'P1', type: 'supply', x: -10, y: -14 }, { id: 'DHT1', type: 'dht11', x: 0, y: 0 }, { id: 'R1', type: 'pull-up', x: 1, y: 3 }, { id: 'B1', type: 'button', x: 1, y: 5 }, { id: 'D1', type: 'led', x: 6, y: 3 }],
    wires: [{ id: 'd', points: [[1, 0], [1, 3]] }, { id: 'b', points: [[1, 3], [1, 5]] }, { id: 'a', points: [[1, 3], [6, 3]] }, { id: 'k', points: [[7, 3], [-10, -13]] }, { id: 'bg', points: [[4, 5], [-10, -13]] },
      { id: 'v', points: [[0, 0], [-12, 0], [-12, -14], [-10, -14]] }, { id: 'g', points: [[3, 0], [-10, -13]] }] }, null, 2) });
  const r = await ok('simulate_drawing', { project: 'c', file: 'src/dht.circ.json', cycles: [{ 'DHT1.temp': 31 }, { after_us: 1e6, B1: 1 }, { after_us: 20000, B1: 0 }, { after_us: 10000 }] });
  assert.deepEqual(r.text.split('\n').slice(1), ['start: t = 0 ns; LEDs D1=1; DHT1 25 °C, 50 %, 0 read(s) answered',
    'step 0: inputs B1=0; t = 0 ns; LEDs D1=1; DHT1 31 °C, 50 %, 0 read(s) answered', 'step 1: inputs B1=1; t = 1000000000 ns; LEDs D1=0; DHT1 31 °C, 50 %, 0 read(s) answered',
    'step 2: inputs B1=0; t = 1020000000 ns; LEDs D1=1; DHT1 31 °C, 50 %, 1 read(s) answered', 'step 3: inputs B1=0; t = 1030000000 ns; LEDs D1=1; DHT1 31 °C, 50 %, 1 read(s) answered']);
  await fails('simulate_drawing', { project: 'c', file: 'src/dht.circ.json', cycles: [{ 'DHT1.hum': 95 }] }, 'step 0: DHT1.hum = 95: humidity (%) from 20 to 90');
  await ok('edit_circuit', { project: 'c', path: 'src/dht.circ.json', operations: [{ op: 'set', id: 'DHT1', temp: 30, hum: 65 }] });
  assert.deepEqual((({ temp, hum }) => ({ temp, hum }))(JSON.parse(read('src/dht.circ.json')).parts.find((p) => p.id === 'DHT1')), { temp: 30, hum: 65 });
  const info = await ok('circuit_parts', { type: 'dht22' });
  assert.match(info.text, /^dht22: Temperature and humidity sensor \(DHT22\); pins 1 VCC vcc, 2 DATA oc, 3 NC nc, 4 GND gnd\nA temperature and humidity sensor on one wire \(AM2302\)/);
});

test('#5476 simulate_drawing: a stepper motor stepped by its switches, after_us between its steps; its steps and angle; circuit_parts', async () => {
  await ok('write_file', { project: 'c', path: 'src/st.circ.json', text: JSON.stringify({ format: 'silinx-circuit', version: 1, name: 'st', lang: 'vhdl',
    parts: [{ id: 'P1', type: 'supply', x: -10, y: -14 }, { id: 'M1', type: 'stepper-28byj48', x: 0, y: 0 }, ...[0, 1, 2, 3].map((k) => ({ id: `S${k + 1}`, type: 'logic-switch', x: k, y: 4 }))],
    wires: [...[0, 1, 2, 3].map((k) => ({ id: `w${k}`, points: [[k, 4], [k, 0]] })), { id: 'g', points: [[5, 0], [-10, -13]] }, { id: 'v', points: [[6, 0], [-10, -14]] }] }, null, 2) });
  const r = await ok('simulate_drawing', { project: 'c', file: 'src/st.circ.json', cycles: [{ S1: 1 }, { after_us: 2000, S2: 1 }, { after_us: 2000, S1: 0 }, { after_us: 500, S3: 1 }, { after_us: 2000, S1: 1, S2: 0, S3: 0 }] });
  assert.deepEqual(r.text.split('\n').slice(1), ['start: t = 0 ns; LEDs none; M1 at 0 half steps (0°)', 'step 0: inputs S1=1 S2=0 S3=0 S4=0; t = 0 ns; LEDs none; M1 at 0 half steps (0°)',
    'step 1: inputs S1=1 S2=1 S3=0 S4=0; t = 2000000 ns; LEDs none; M1 at 1 half steps (0.1°)', 'step 2: inputs S1=0 S2=1 S3=0 S4=0; t = 4000000 ns; LEDs none; M1 at 2 half steps (0.2°)',
    'step 3: inputs S1=0 S2=1 S3=1 S4=0; t = 4500000 ns; LEDs none; M1 at 2 half steps (0.2°)', 'WARNING: M1: steps 0.5 ms apart: a 28BYJ-48 follows one every 1 ms at most, it stalls',
    'step 4: inputs S1=1 S2=0 S3=0 S4=0; t = 6500000 ns; LEDs none; M1 at 0 half steps (0°)']);
  const info = await ok('circuit_parts', { type: 'stepper-28byj48' });
  assert.match(info.text, /^stepper-28byj48: Stepper motor \(28BYJ-48, ULN2003 board\); pins 1 IN1 in, 2 IN2 in, 3 IN3 in, 4 IN4 in, 5 GND gnd, 6 VCC vcc\nA geared stepper motor/);
});

test('#5477 simulate_drawing: an SD card powered up and sent CMD0 by switches, step by step: off, then idle (its R1 on its MISO\'s LED); circuit_parts', async () => {
  await ok('write_file', { project: 'c', path: 'src/sd.circ.json', text: JSON.stringify({ format: 'silinx-circuit', version: 1, name: 'sd', lang: 'vhdl',
    parts: [{ id: 'P1', type: 'supply', x: -10, y: -14 }, { id: 'SD1', type: 'sd-card', x: 0, y: 0 }, { id: 'MOSI', type: 'logic-switch', x: 3, y: 4, on: true }, { id: 'SCK', type: 'logic-switch', x: 4, y: 6 },
      { id: 'CS', type: 'logic-switch', x: 5, y: 8, on: true }, { id: 'D1', type: 'led', x: -3, y: 3 }],
    wires: [{ id: 'm', points: [[3, 4], [3, 0]] }, { id: 'k', points: [[4, 6], [4, 0]] }, { id: 'c', points: [[5, 8], [5, 0]] }, { id: 'o', points: [[2, 0], [2, 2], [-3, 2], [-3, 3]] },
      { id: 'dk', points: [[-2, 3], [-10, -13]] }, { id: 'g', points: [[0, 0], [-11, 0], [-11, -13], [-10, -13]] }, { id: 'v', points: [[1, 0], [1, -1], [-12, -1], [-12, -14], [-10, -14]] }] }, null, 2) });
  // (80 clocks with CS high, CS low, CMD0's 6 bytes and 2 bytes of FF, MSB first, MOSI set before each rise)
  const steps = [];
  for (let i = 0; i < 80; i++) steps.push({ SCK: 1 }, { SCK: 0 });
  steps.push({ CS: 0 });
  for (const b of [0x40, 0, 0, 0, 0, 0x95, 0xff, 0xff]) for (let k = 7; k >= 0; k--) steps.push({ MOSI: (b >> k) & 1, SCK: 1 }, { SCK: 0 });
  const r = await ok('simulate_drawing', { project: 'c', file: 'src/sd.circ.json', cycles: steps });
  const lines = r.text.split('\n');
  assert.equal(lines[1], 'start: t = 0 ns; LEDs D1=0; SD1 off');
  assert.match(lines.find((l) => /^step 160: /.test(l)), /; SD1 off$/, 'its 80 clocks: still off');
  // (R1 0x01 on MISO through the last byte, read at each rise: its 7 zeros then its 1; idle)
  assert.deepEqual(r.data.steps.slice(-16).filter((x, k) => k % 2 === 0).map((x) => x.leds.D1), [0, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(r.data.steps.length, steps.length);
  const info = await ok('circuit_parts', { type: 'sd-card' });
  assert.match(info.text, /^sd-card: SD card module \(SPI, microSD\); pins 1 GND gnd, 2 VCC vcc, 3 MISO out, 4 MOSI in, 5 SCK in, 6 CS in\nA microSD card module/);
});
