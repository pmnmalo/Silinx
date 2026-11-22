// A symbol's pins moved or changed (core/schdoc-repin.js): the wires on a pin that stays following it. A pin turned
// with its symbol (Rotate / Mirror, #5156) moves both ways: the wire still square and on it; a gate's inputs changed in
// Properties (OR4 to OR2, #5153): the wires of the pins kept follow them, those of the pins that go dropped. The
// document's geometry (symbolPins) and its netlist are the reference.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { followPins, netlist, normalizeDoc, repinSymbol, symbolPins } from '../core/schdoc.js';

const xy = (pts) => pts.map((p) => [p.x, p.y]);
const square = (w) => w.points.every((p, i) => !i || p.x === w.points[i - 1].x || p.y === w.points[i - 1].y);
const gates = () => normalizeDoc(JSON.parse(fs.readFileSync(new URL('../examples/gates/src/gates.sch.json', import.meta.url), 'utf8')));

test('#5156 followPins: a pin moved both ways keeps its wire square and on it, reaching it as it did', () => {
  const doc = { symbols: [], ports: [], labels: [{ id: 'L1', x: 100, y: 0, net: 'n' }], wires: [
    { id: 'W1', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },                       // (along x into the pin)
    { id: 'W2', points: [{ x: 300, y: 200 }, { x: 300, y: 100 }] }] };              // (along y into the pin)
  const mv = (a, b) => [`${a.x},${a.y}`, { from: a, to: b, p: { name: 'I' } }];
  followPins(doc, new Map([mv({ x: 100, y: 0 }, { x: 140, y: -40 }), mv({ x: 300, y: 100 }, { x: 260, y: 60 })]), new Set());
  assert.deepEqual(xy(doc.wires[0].points), [[0, 0], [0, -40], [140, -40]]);
  assert.deepEqual(xy(doc.wires[1].points), [[300, 200], [260, 200], [260, 60]]);
  assert.ok(doc.wires.every(square));
  // (its net name with it)
  assert.deepEqual([doc.labels[0].x, doc.labels[0].y], [140, -40]);
  // one way only, as before: a corner only where the run would go slanted
  const d = { symbols: [], ports: [], labels: [], wires: [{ id: 'W1', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }] };
  followPins(d, new Map([mv({ x: 100, y: 0 }, { x: 120, y: 0 })]), new Set());
  assert.deepEqual(xy(d.wires[0].points), [[0, 0], [120, 0]]);
  followPins(d, new Map([mv({ x: 120, y: 0 }, { x: 120, y: 30 })]), new Set());
  assert.deepEqual(xy(d.wires[0].points), [[0, 0], [0, 30], [120, 30]]);
});

test('#5153 repinSymbol: OR4 made OR2 (the gates example\'s or_sum): its output\'s wire on its pin, its nets kept', () => {
  const doc = gates();
  const s = doc.symbols.find((x) => x.name === 'or_sum');
  const nl0 = netlist(doc);
  const net0 = (pin) => nl0.nets.find((n) => n === nl0.pinNet.get(`${s.id}/${pin}`))?.name;
  const names0 = { I0: net0('I0'), I1: net0('I1'), O: net0('O') };
  const r = repinSymbol(doc, s, (x) => { x.type = 'or2'; });
  assert.deepEqual(r.removed, ['I2', 'I3']);
  const d = normalizeDoc(doc), t = d.symbols.find((x) => x.name === 'or_sum');
  const pins = Object.fromEntries(symbolPins(t).map((p) => [p.name, `${p.x},${p.y}`]));
  // W32 (prime_sop) on the output, which moved up; W30 and W31 (I2, I3) gone
  const w32 = d.wires.find((w) => w.id === 'W32');
  assert.equal(`${w32.points[0].x},${w32.points[0].y}`, pins.O);
  assert.ok(square(w32));
  assert.deepEqual(['W30', 'W31'].filter((id) => d.wires.some((w) => w.id === id)), []);
  const nl = netlist(d);
  const net = (pin) => nl.nets.find((n) => n === nl.pinNet.get(`${t.id}/${pin}`))?.name;
  assert.deepEqual({ I0: net('I0'), I1: net('I1'), O: net('O') }, names0);
  assert.equal(names0.O, 'prime_sop');
  const join = d.symbols.find((x) => x.name === 'join_led');
  assert.equal(nl.pinNet.get(`${t.id}/O`), nl.pinNet.get(`${join.id}/I1`));
});
