// A circuit's moves that keep its connections (#4059), a breadboard turned (#4065), refused onto other parts' leads
// (#5162), copy and paste (#4066):
// core/circuit-edit.js, the editor's and the MCP server's edit_circuit's. The connections checked against the circuit's
// nets before the edit (core/circuit-net.js), an independent reckoning of what joins what.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { partHoles, partPins, WIRE_COLORS } from '../core/circuit-parts.js';
import { circuitNets } from '../core/circuit-net.js';
import { checkCircuit } from '../core/circuit-check.js';
import { movePart, rotatePart, copyParts, pasteParts, addPart, addWire, pointOf, setWireProps, setPartProps, setProps, wireColorOf } from '../core/circuit-edit.js';
import { addStyledWire } from '../core/circuit-route.js';
import { newCircuit } from '../core/circuit.js';
import { netSupply } from '../core/circuit-net.js';
import { halfAdder, icBench } from './circuit-helpers.mjs';

// what joins what: each net's pins, sorted
const joins = (m) => circuitNets(m).nets.map((n) => n.pins.map((q) => `${q.part}.${q.n}`).sort().join(' ')).filter(Boolean).sort();
const part = (m, id) => m.parts.find((p) => p.id === id);

test('a breadboard moved carries the parts on it, and the wires follow: the connections the same, the check clean', () => {
  const m = halfAdder();
  const r = movePart(m, 'BB1', [3, 5]);
  assert.equal(r.error, undefined);
  // (the ICs and the LEDs are on it; the switches and the supply beside it stay)
  for (const [id, x, y] of [['BB1', 3, 5], ['U1', 7, 12], ['U2', 16, 12], ['D1', 27, 7], ['D2', 29, 7], ['S1', -6, 9], ['P1', -4, -4]]) assert.deepEqual([part(r.model, id).x, part(r.model, id).y], [x, y], id);
  assert.deepEqual(joins(r.model), joins(m));
  assert.deepEqual(checkCircuit(r.model), checkCircuit(m));
  // a wire with both ends on it moved whole, its bends too; one from a switch beside it: its end on the board only
  assert.deepEqual(r.model.wires.find((w) => w.id === 'ws').points, [[9, 14], [9, 17], [27, 17], [27, 9]]);
  assert.deepEqual(r.model.wires.find((w) => w.id === 'wb1').points, [[-6, 10], [-5, 10], [-5, 11], [8, 16]]);
});

test('Keep connections off: the wires to the parts beside a moved breadboard stay where they were', () => {
  const m = halfAdder();
  const r = movePart(m, 'BB1', [3, 5], { keep: false });
  assert.deepEqual(r.model.wires.find((w) => w.id === 'wb1').points, m.wires.find((w) => w.id === 'wb1').points);
  // (the wires on the board go with it all the same)
  assert.deepEqual(r.model.wires.find((w) => w.id === 'wv1').points, [[7, 8], [7, 1]]);
  assert.notDeepEqual(joins(r.model), joins(m));
});

test('an IC moved or turned beside nothing: its wires follow its pins, the connections the same; not kept, they stay', () => {
  const m = icBench('7400');
  for (const r of [movePart(m, 'U1', [7, 3]), rotatePart(m, 'U1'), rotatePart(m, 'U1', 2)]) {
    assert.equal(r.error, undefined);
    assert.deepEqual(joins(r.model), joins(m));
  }
  const r = movePart(m, 'U1', [7, 3], { keep: false });
  assert.deepEqual(r.model.wires, m.wires);
});

test('a breadboard turned (#4065): its holes, the parts on it and their wires with it, the connections the same', () => {
  const m = halfAdder();
  const r = rotatePart(m, 'BB1');
  assert.equal(r.error, undefined);
  assert.equal(part(r.model, 'BB1').rot, 1);
  assert.equal(part(r.model, 'U1').rot, 1);
  // its hole f5 (dx 4, dy 7 from a1) turned a quarter clockwise about a1: (-7, 4)
  assert.deepEqual(pointOf(r.model, 'BB1.f5'), [-7, 4]);
  assert.deepEqual(pointOf(r.model, 'U1.1'), [-7, 4]);
  assert.deepEqual(joins(r.model), joins(m));
  // four quarters: as it was
  assert.deepEqual(rotatePart(m, 'BB1', 4).model, m);
  assert.deepEqual(rotatePart(rotatePart(m, 'BB1').model, 'BB1', 3).model, m);
  // a breadboard added turned
  const t = addPart(m, { type: 'breadboard-half', at: [40, 0], rot: 2 });
  assert.equal(t.error, undefined);
  assert.deepEqual(partHoles(part(t.model, t.id)).find((h) => h.name === 'j30'), { name: 'j30', strip: '30f', x: 11, y: -11 });
});

test('a breadboard turned or moved onto the leads of the parts beside it (#5162): refused, saying which; an IC on another\'s leads too', () => {
  const m = JSON.parse(readFileSync(new URL('../examples/breadboard/src/breadboard.circ.json', import.meta.url), 'utf8'));
  // (turned about a1: its hole h11 under the button's pin 2; moved 3, 5 then turned: its rails under the clock's, the
  // switch's, the pull-down's leads)
  assert.deepEqual(rotatePart(m, 'BB1'), { error: 'BB1 cannot be turned: it would land on the leads of B1, joining them' });
  assert.deepEqual(rotatePart(movePart(m, 'BB1', [3, 5]).model, 'BB1'), { error: 'BB1 cannot be turned: it would land on the leads of CK1, B1, R1, S1, joining them' });
  assert.deepEqual(movePart(m, 'BB1', [-20, 0]), { error: 'BB1 cannot be moved there: it would land on the leads of P1, B1, joining them' });
  // (the leads' strips not joined by any: an independent reckoning, the nets of a turn made anyway)
  const turned = { ...m, parts: m.parts.map((p) => (p.id === 'BB1' ? { ...p, rot: 1 } : p)) };
  assert.ok(circuitNets(turned).nets.some((n) => n.pins.some((q) => q.part === 'B1') && n.holes.length), 'the button joined to a strip');
  // moved where nothing is beside it: turned, its parts with it, the connections the same
  const away = movePart(m, 'BB1', [0, 20]).model, r = rotatePart(away, 'BB1');
  assert.equal(r.error, undefined);
  assert.deepEqual(joins(r.model), joins(m));
  // an IC moved so that its pins land on another IC's (U2's, columns 20 to 26)
  assert.deepEqual(movePart(m, 'U1', [20, 7]), { error: 'U1 cannot be moved there: it would land on the leads of U2, joining them' });
  assert.deepEqual(movePart(m, 'U1', [2, 7]).error, undefined);
  // (a lead left where it was is no new contact: a move by nothing, a turn about pin 1 by four quarters)
  assert.deepEqual(movePart(m, 'U1', [1, 7]).model, m);
  assert.deepEqual(rotatePart(m, 'BB1', 4).model, m);
});

test('copy and paste (#4066): a breadboard with the parts on it and the wires between them, new ids, moved by', () => {
  const m = halfAdder();
  const clip = copyParts(m, 'BB1');
  assert.deepEqual(clip.parts.map((p) => p.id), ['BB1', 'U1', 'U2', 'D1', 'D2']);
  // (the wires from the switches and the supply beside it left out)
  assert.deepEqual(clip.wires.map((w) => w.id), ['wv1', 'wg1', 'wv2', 'wg2', 'wgg', 'wa2', 'wb2', 'ws', 'wc', 'wk1', 'wk2']);
  const r = pasteParts(m, clip, [0, 30]);
  assert.deepEqual(r.ids, ['BB2', 'U3', 'U4', 'D3', 'D4']);
  assert.equal(r.model.parts.length, m.parts.length + 5);
  assert.equal(r.model.wires.length, m.wires.length + 11);
  assert.deepEqual([part(r.model, 'U3').x, part(r.model, 'U3').y, part(r.model, 'D3').label], [4, 37, undefined], 'its label taken: left out');
  // (no label twice; the copy's ICs unpowered, its supply beside the original's breadboard not copied)
  assert.deepEqual(checkCircuit(r.model).filter((d) => d.severity === 'error').map((d) => d.ref.id), ['U3', 'U4']);
  assert.deepEqual(r.model.wires.at(-1), { id: 'w13', points: [[27, 31], [27, 27]], color: 'blue' });
  // the copy's ICs on its breadboard as the original's: U3 pin 1 in BB2's f5
  assert.deepEqual(pointOf(r.model, 'U3.1'), pointOf(r.model, 'BB2.f5'));
  // one part: itself; the default move 2 steps right and down
  const one = pasteParts(m, copyParts(m, 'S1'));
  assert.deepEqual(one.ids, ['S3']);
  assert.deepEqual(part(one.model, 'S3'), { id: 'S3', type: 'logic-switch', x: -4, y: 11, on: false });
  assert.deepEqual(partPins(part(one.model, 'S3')).length, 1);
  // its errors
  assert.deepEqual(copyParts(m, 'U9'), { error: 'no part U9 in the circuit' });
  assert.deepEqual(pasteParts(m, { parts: [] }), { error: 'nothing to paste' });
  assert.deepEqual(pasteParts(m, clip, [1]), { error: 'by: a move [dx, dy] in grid steps' });
  assert.deepEqual(pasteParts(m, { parts: [{ type: 'resistor', x: 0, y: 0 }] }), { error: 'no part \'resistor\' in the library' });
});

test('a wire\'s colour set (#4121), as its Properties\' Colour: the wire alone changed, the connections the same; setProps a part\'s or a wire\'s; the refusals', () => {
  const m = halfAdder();
  const r = setWireProps(m, 'WS', { color: 'green' });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.model.wires.find((w) => w.id === 'ws'), { ...m.wires.find((w) => w.id === 'ws'), color: 'green' });
  assert.deepEqual(r.model.wires.filter((w) => w.id !== 'ws'), m.wires.filter((w) => w.id !== 'ws'));
  assert.deepEqual(r.model.parts, m.parts);
  assert.deepEqual(joins(r.model), joins(m));
  assert.notEqual(m.wires.find((w) => w.id === 'ws').color, 'green', 'the model given unchanged');
  for (const c of WIRE_COLORS) assert.equal(setWireProps(m, 'ws', { color: c }).model.wires.find((w) => w.id === 'ws').color, c);
  assert.deepEqual(setWireProps(m, 'ws', { color: 'pink' }), { error: `color: one of ${WIRE_COLORS.join(', ')}` });
  assert.deepEqual(setWireProps(m, 'ws', { on: true }), { error: 'wire ws has no property \'on\' (color)' });
  assert.deepEqual(setWireProps(m, 'w99', { color: 'red' }), { error: 'no wire w99 in the circuit' });
  assert.deepEqual(setWireProps(m, 'U1', { color: 'red' }), { error: 'no wire U1 in the circuit' });
  // setProps: a part's as setPartProps', a wire's as setWireProps', neither refused
  assert.deepEqual(setProps(m, 'D1', { color: 'green' }), setPartProps(m, 'D1', { color: 'green' }));
  assert.deepEqual(setProps(m, 'ws', { color: 'green' }), r);
  assert.deepEqual(setProps(m, 'X9', { color: 'red' }), { error: 'no part or wire X9 in the circuit' });
});

test('a new circuit\'s bottom rails powered too (#4929): the top rails joined to the bottom ones, + to + red, − to − black; its check clean', () => {
  const m = newCircuit('n');
  assert.deepEqual(m.wires.map((w) => [w.id, w.color, w.points[0], w.points.at(-1)]), [
    ['w1', 'red', pointOf(m, 'P1.+'), pointOf(m, 'BB1.tp1')], ['w2', 'black', pointOf(m, 'P1.-'), pointOf(m, 'BB1.tn1')],
    ['w3', 'red', pointOf(m, 'BB1.tp30'), pointOf(m, 'BB1.bp30')], ['w4', 'black', pointOf(m, 'BB1.tn30'), pointOf(m, 'BB1.bn30')]]);
  // (the nets, an independent reckoning: the bottom + rail on the supply's +, the bottom − on its −)
  const nets = circuitNets(m).nets, of = (w) => netSupply(nets.find((n) => n.wires.includes(w)));
  assert.deepEqual([of('w3'), of('w4')], [{ vcc: true, gnd: false }, { vcc: false, gnd: true }]);
  assert.deepEqual(checkCircuit(m), []);
  // an LED from the bottom + rail to the bottom − rail: lit, as on the bench
  const led = addPart(m, { type: 'led', at: 'BB1.bp5', rot: 3 }).model;
  assert.deepEqual(pointOf(led, 'D1.K'), pointOf(led, 'BB1.bn5'));
  assert.deepEqual(checkCircuit(led), [], 'no part left unpowered');
});

test('a new wire\'s colour by default (#4932, #4933): red to VCC, VDD, the supply\'s + or a + rail; black to GND, VSS, − or a − rail; blue otherwise; a colour given kept', () => {
  let m = addPart(newCircuit('c'), { type: '7400', at: 'BB1.f10', id: 'U1' }).model;
  m = addPart(m, { type: '4071', at: 'BB1.f20', id: 'U2' }).model;
  const colour = (from, to, more = {}) => { const r = addWire(m, { from, to, ...more }); assert.equal(r.error, undefined); return r.model.wires.find((w) => w.id === r.id).color; };
  assert.equal(colour('U1.14', [40, 0]), 'red', 'a 74LS IC\'s VCC pin');
  assert.equal(colour('U1.7', [40, 0]), 'black', 'its GND pin');
  assert.equal(colour('U2.VDD', [40, 0]), 'red', 'a 4000 IC\'s VDD pin');
  assert.equal(colour('U2.VSS', [40, 0]), 'black', 'its VSS pin');
  assert.equal(colour('BB1.c10', [40, 0]), 'red', 'a hole of the strip of a VCC pin (the net)');
  assert.equal(colour('BB1.a1', 'BB1.bp1'), 'red', 'the bottom + rail');
  assert.equal(colour('BB1.a1', 'BB1.tn3'), 'black', 'the top − rail');
  assert.equal(colour('P1.+', [-10, -4]), 'red', 'the supply\'s +');
  assert.equal(colour('U1.1', 'BB1.a3'), 'blue', 'a signal');
  assert.equal(colour('BB1.tp4', 'BB1.tn4'), 'blue', 'both (a short): no default');
  assert.equal(colour('BB1.a1', 'BB1.bp1', { color: 'green' }), 'green', 'a colour given');
  // a rail by its name, no supply on the board
  const bare = addPart(newCircuit('b', 'vhdl', { breadboard: false }), { type: 'breadboard-half', at: [0, 0] }).model;
  assert.equal(addWire(bare, { from: 'BB1.a1', to: 'BB1.tp1' }).model.wires[0].color, 'red');
  assert.equal(addWire(bare, { from: 'BB1.a1', to: 'BB1.bn1' }).model.wires[0].color, 'black');
  assert.equal(addWire(bare, { from: 'BB1.a1', to: 'BB1.a5' }).model.wires[0].color, 'blue');
  // the same drawn Orthogonal (routed) or Curved, as the editor and edit_circuit add them; wireColorOf of a wire there
  for (const wireStyle of ['orthogonal', 'curved']) {
    const r = addStyledWire({ ...m, wireStyle }, { from: 'U1.7', to: 'BB1.bn12' });
    assert.equal(r.model.wires.find((w) => w.id === r.id).color, 'black', wireStyle);
    assert.equal(wireColorOf(r.model, r.id), 'black');
  }
  assert.equal(wireColorOf(m, 'w99'), 'blue', 'no such wire');
});
