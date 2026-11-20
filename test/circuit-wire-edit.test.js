// A circuit wire's ends and shape edited (#4930, #4931, core/circuit-wire-edit.js): an end moved to another hole or pin
// reconnects it there (checked against the circuit's nets, core/circuit-net.js, an independent reckoning), its bends set,
// moved, added on a segment, removed; its colour, id and the other wires kept; the refusals and their messages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circuitNets } from '../core/circuit-net.js';
import { checkCircuit } from '../core/circuit-check.js';
import { pointOf } from '../core/circuit-edit.js';
import { moveWireEnd, setWireBends, wireHandles, dragWireHandle, removeWireBend, endOf } from '../core/circuit-wire-edit.js';
import { halfAdder } from './circuit-helpers.mjs';

const wire = (m, id) => m.wires.find((w) => w.id === id);
// the net of a part's pin: its pins, sorted
const netOf = (m, pin) => { const n = circuitNets(m); const i = n.pinNet.get(pin); return n.nets[i].pins.map((q) => `${q.part}.${q.n}`).sort(); };

test('a wire\'s end moved to another hole or pin: it joins what is there, leaves what it left; its bends, colour and id kept', () => {
  const m = halfAdder();
  // wc: the AND's 1Y (U2 pin 3, [15, 10]) to c's anode (D2.A, [26, 3]); its end moved to s's anode (D1.A)
  assert.ok(netOf(m, 'U2.3').includes('D2.1'));
  const r = moveWireEnd(m, 'wc', 'end', 'D1.A');
  assert.equal(r.error, undefined);
  assert.deepEqual(wire(r.model, 'wc'), { ...wire(m, 'wc'), points: [[15, 10], pointOf(m, 'D1.A')] });
  assert.ok(netOf(r.model, 'U2.3').includes('D1.1'), 'joined to D1\'s anode');
  assert.ok(!netOf(r.model, 'U2.3').includes('D2.1'), 'no longer to D2\'s');
  assert.deepEqual(r.model.wires.filter((w) => w.id !== 'wc'), m.wires.filter((w) => w.id !== 'wc'), 'the other wires as they were');
  // (its start by 0, to a hole; a bent wire's bends stay)
  const s = moveWireEnd(m, 'WB1', 0, 'BB1.a1').model;
  assert.deepEqual(wire(s, 'wb1').points, [[0, 0], [-5, 10], [-5, 11], [5, 11]]);
  assert.deepEqual([endOf('start'), endOf('end'), endOf(0), endOf(1), endOf('middle')], [0, 1, 0, 1, null]);
  // the check after a reconnection: the two gates' outputs on one net now, its only message
  assert.deepEqual(checkCircuit(r.model).map((d) => `${d.severity}: ${d.message}`), ['error: Short circuit: U1 1Y and U2 1Y drive one net (a short whenever they differ)']);
});

test('a wire\'s end moved: the refusals (no wire, no such end or place, both ends on one point)', () => {
  const m = halfAdder();
  assert.deepEqual(moveWireEnd(m, 'w99', 'end', [0, 0]), { error: 'no wire w99 in the circuit' });
  assert.deepEqual(moveWireEnd(m, 'wc', 'middle', [0, 0]), { error: 'end: start or end' });
  assert.deepEqual(moveWireEnd(m, 'wc', 'end', 'BB1.k3'), { error: '\'BB1.k3\': BB1 has no hole k3 (a1 to j30, its rails tp, tn, bn, bp 1 to 30)' });
  assert.deepEqual(moveWireEnd(m, 'wc', 'end', [15, 10]), { error: 'a wire joins two different places' });
});

test('a wire\'s bends set, its handles, one dragged (an end, a bend, a segment\'s middle a new bend), one removed', () => {
  const m = halfAdder();
  // ws: [6, 9] → [6, 12] → [24, 12] → [24, 4]
  assert.deepEqual(wireHandles(wire(m, 'ws')), [
    { kind: 'end', index: 0, at: [6, 9] }, { kind: 'end', index: 1, at: [24, 4] },
    { kind: 'bend', index: 0, at: [6, 12] }, { kind: 'bend', index: 1, at: [24, 12] },
    { kind: 'mid', index: 0, at: [6, 10.5] }, { kind: 'mid', index: 1, at: [15, 12] }, { kind: 'mid', index: 2, at: [24, 8] }]);
  const pts = (r) => (assert.equal(r.error, undefined), wire(r.model, 'ws').points);
  assert.deepEqual(pts(setWireBends(m, 'ws', [[6, 13], [24, 13]])), [[6, 9], [6, 13], [24, 13], [24, 4]], 'stretched down');
  assert.deepEqual(pts(setWireBends(m, 'ws', [])), [[6, 9], [24, 4]], 'straight');
  assert.deepEqual(pts(dragWireHandle(m, 'ws', { kind: 'bend', index: 1 }, [20, 12])), [[6, 9], [6, 12], [20, 12], [24, 4]]);
  assert.deepEqual(pts(dragWireHandle(m, 'ws', { kind: 'mid', index: 1 }, [15, 13])), [[6, 9], [6, 12], [15, 13], [24, 12], [24, 4]]);
  assert.deepEqual(pts(dragWireHandle(m, 'ws', { kind: 'end', index: 1 }, [25, 4])), [[6, 9], [6, 12], [24, 12], [25, 4]]);
  // (a bend dragged onto its neighbour: merged)
  assert.deepEqual(pts(dragWireHandle(m, 'ws', { kind: 'bend', index: 1 }, [6, 12])), [[6, 9], [6, 12], [24, 4]]);
  assert.deepEqual(pts(removeWireBend(m, 'ws', 0)), [[6, 9], [24, 12], [24, 4]]);
  assert.equal(wire(removeWireBend(m, 'ws', 0).model, 'ws').color, wire(m, 'ws').color);
  // the nets the same: its ends kept
  assert.deepEqual(circuitNets(setWireBends(m, 'ws', []).model).nets.map((n) => n.pins.length), circuitNets(m).nets.map((n) => n.pins.length));
  // the refusals
  assert.deepEqual(setWireBends(m, 'ws', [[1]]), { error: 'via: the bends, a list of grid points [[x, y], …]' });
  assert.deepEqual(setWireBends(m, 'ws', 'x'), { error: 'via: the bends, a list of grid points [[x, y], …]' });
  assert.deepEqual(dragWireHandle(m, 'ws', { kind: 'bend', index: 2 }, [0, 0]), { error: 'ws has no bend 2' });
  assert.deepEqual(dragWireHandle(m, 'ws', { kind: 'mid', index: 3 }, [0, 0]), { error: 'ws has no segment 3' });
  assert.deepEqual(dragWireHandle(m, 'ws', { kind: 'mid', index: 0 }, [0.5, 0]), { error: 'to: a grid point [x, y]' });
  assert.deepEqual(dragWireHandle(m, 'ws', { kind: 'spot', index: 0 }, [0, 0]), { error: 'kind: end, bend or mid' });
  assert.deepEqual(removeWireBend(m, 'wc', 0), { error: 'wc has no bend 0' });
  assert.deepEqual(removeWireBend(m, 'nope', 0), { error: 'no wire nope in the circuit' });
});
