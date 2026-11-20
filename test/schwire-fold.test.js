// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
//
// #4920: a schematic's wires drawn twice over (core/schwire-fold.js, by normalizeDoc after every edit): two wires meeting
// end to end, the one's end segment lying on the other's (a segment dragged onto the wire it continues), trimmed to meet
// at the far end of the overlap; a wire turning back on itself; at a junction dot (the shorter one's doubled part
// removed, the longer one split where it then meets it); the net names on the doubled part kept on the wire; the
// connections and the generated HDL (VHDL and Verilog) the same, no warnings. What stays: a wire left unconnected on a
// stretch of its own, a doubled part with a pin or another wire's end on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDoc, netlist, generateHdl, normalizeDoc } from '../core/schdoc.js';
import { connectivity, moveSegment } from '../core/schroute.js';
import { trimFoldBacks } from '../core/schwire-fold.js';

const P = (x, y) => ({ x, y });
const str = pts => pts.map(p => `${p.x},${p.y}`).join(' ');
const wires = doc => Object.fromEntries(doc.wires.map(w => [w.id, str(w.points)]));
const port = (id, name, dir, x, y, width = 1) => ({ id, name, dir, width, x, y });
const clone = o => JSON.parse(JSON.stringify(o));

// the grid points every wire covers, counted (an independent check: a point covered twice by straight runs is doubled)
function doubled(doc) {
  const seen = new Map(), out = [];
  for (const w of doc.wires) {
    const mine = new Set();
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i], b = w.points[i + 1], n = Math.abs(b.x - a.x + b.y - a.y) / 10;
      for (let k = 1; k < n; k++) {   // (the segment's inner points: where no wire may run twice)
        const q = `${a.x + Math.sign(b.x - a.x) * 10 * k},${a.y + Math.sign(b.y - a.y) * 10 * k}`;
        if (mine.has(q) || seen.has(q)) out.push(q);
        mine.add(q);
      }
    }
    for (const q of mine) seen.set(q, w.id);
  }
  return out;
}
// the drawing's warnings and errors
const diags = doc => netlist(doc).diagnostics.map(d => d.message);
// the same connections and HDL as `before`, in both languages, no warnings
function sameDesign(before, after, what) {
  assert.deepEqual(connectivity(after), connectivity(before), `${what}: the same connections`);
  for (const lang of ['vhdl', 'verilog']) {
    assert.equal(generateHdl({ ...after, lang }, { lang }).code, generateHdl({ ...before, lang }, { lang }).code, `${what}: the same ${lang} HDL`);
  }
  assert.deepEqual(diags(after), [], `${what}: no warnings`);
}

// Pedro's drawing: the marker in1 to an inverter, W1 from in1 to (340, 180), W3 from there down and right to the
// inverter's input; the inverter's output to the marker y
function pedro() {
  const doc = newDoc('stub', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'inv', x: 500, y: 330, rot: 0, mirror: false, name: 'U1', params: { width: 1 } });
  doc.ports.push(port('P1', 'in1', 'in', 210, 120), port('P2', 'y', 'out', 620, 340));
  doc.wires.push({ id: 'W1', points: [P(210, 120), P(280, 120), P(280, 180), P(340, 180)] },
    { id: 'W3', points: [P(340, 180), P(340, 340), P(500, 340)] }, { id: 'W4', points: [P(580, 340), P(620, 340)] });
  return normalizeDoc(doc);
}

test('#4920 a segment dragged onto the wire it continues: the doubled stub trimmed, the two wires meet where it turned back', () => {
  const doc = pedro();
  assert.deepEqual(diags(doc), [], 'the drawing: no warnings');
  // W3's vertical segment dragged 60 to the left (its start held by W1's end): moveSegment joins it back to (340, 180)
  const w3 = doc.wires.find(w => w.id === 'W3');
  const moved = moveSegment(w3.points, 0, -60, { keepA: true, keepB: true });
  assert.equal(str(moved), '340,180 280,180 280,340 500,340', 'the drag doubles (280, 180)-(340, 180)');
  const raw = clone(doc);
  raw.wires.find(w => w.id === 'W3').points = moved;
  assert.deepEqual(doubled(raw).sort(), ['290,180', '300,180', '310,180', '320,180', '330,180'], 'drawn twice before the clean-up');
  const after = normalizeDoc(raw);
  assert.deepEqual(wires(after), { W1: '210,120 280,120 280,180', W3: '280,180 280,340 500,340', W4: '580,340 620,340' });
  assert.deepEqual(doubled(after), []);
  sameDesign(doc, after, 'trimmed');
  assert.deepEqual(netlist(after).junctions, [], 'no junction dot: the two wires only meet');
  // normalized again: nothing more to do
  assert.equal(trimFoldBacks(clone(after)), 0);
});

test('#4920 the overlap shorter than the other wire\'s segment: the longer one starts where the shorter one turned', () => {
  const doc = pedro();
  const raw = clone(doc);
  // W1 runs on to (340, 180) as before; W3 doubles back only to (300, 180), then down
  raw.wires.find(w => w.id === 'W3').points = [P(340, 180), P(300, 180), P(300, 340), P(500, 340)];
  const after = normalizeDoc(raw);
  assert.deepEqual(wires(after), { W1: '210,120 280,120 280,180 300,180', W3: '300,180 300,340 500,340', W4: '580,340 620,340' });
  assert.deepEqual(doubled(after), []);
  sameDesign(doc, after, 'the shorter overlap');
});

test('#4920 a net name on the doubled part: kept on the wire, where the wires now meet', () => {
  const doc = pedro();
  doc.labels.push({ id: 'L1', x: 310, y: 180, net: 'n' });
  const warned = ["net of I/O marker 'in1' also named 'n' (marker name used)"];
  assert.deepEqual(diags(doc), warned);
  const raw = clone(doc);
  raw.wires.find(w => w.id === 'W3').points = [P(340, 180), P(280, 180), P(280, 340), P(500, 340)];
  const after = normalizeDoc(raw);
  assert.deepEqual(after.labels.map(l => [l.x, l.y, l.net]), [[280, 180, 'n']]);
  assert.deepEqual(diags(after), warned, 'the same warning: the name still on the net');
});

test('#4920 a wire turning back on itself: the spike removed; one with a pin at its tip stays', () => {
  const doc = newDoc('spike', 'verilog');
  doc.wires.push({ id: 'W1', points: [P(100, 100), P(200, 100), P(150, 100), P(150, 200)] });
  assert.equal(trimFoldBacks(doc), 1);
  assert.deepEqual(wires(doc), { W1: '100,100 150,100 150,200' });
  // a spike past both: the far side kept
  const d2 = newDoc('spike2', 'verilog');
  d2.wires.push({ id: 'W1', points: [P(100, 200), P(100, 100), P(200, 100), P(150, 100)] });
  trimFoldBacks(d2);
  assert.deepEqual(wires(d2), { W1: '100,200 100,100 150,100' }, 'the end segment folded back within the one before: out and back, the wire ends where it was');
  // an I/O marker at the tip: it is connected there, the spike stays
  const d3 = newDoc('spike3', 'verilog');
  d3.ports.push(port('P1', 'a', 'in', 200, 100));
  d3.wires.push({ id: 'W1', points: [P(100, 100), P(200, 100), P(150, 100), P(150, 200)] });
  assert.equal(trimFoldBacks(d3), 0);
  assert.deepEqual(wires(d3), { W1: '100,100 200,100 150,100 150,200' });
});

// a T at (200, 200): the marker a to the markers y (up) and z (down)
function tee() {
  const doc = newDoc('tee', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'inv', x: 400, y: 90, rot: 0, mirror: false, name: 'U1', params: { width: 1 } },
    { id: 'S2', type: 'inv', x: 400, y: 290, rot: 0, mirror: false, name: 'U2', params: { width: 1 } });
  doc.ports.push(port('P1', 'a', 'in', 100, 200), port('P2', 'y', 'out', 480, 100), port('P3', 'z', 'out', 480, 300));
  doc.wires.push({ id: 'W1', points: [P(100, 200), P(200, 200)] }, { id: 'W2', points: [P(200, 200), P(200, 100), P(400, 100)] },
    { id: 'W3', points: [P(200, 200), P(200, 300), P(400, 300)] });
  return normalizeDoc(doc);
}

test('#4920 at a junction dot: a stub lying on a branch removed, that branch whole; a doubled wire that goes on: the branch split where it leaves', () => {
  const doc = tee();
  assert.deepEqual(diags(doc), []);
  // a stub from the dot down over W3, ending in nothing
  const raw = clone(doc);
  raw.wires.push({ id: 'W9', points: [P(200, 200), P(200, 250)] });
  const after = normalizeDoc(raw);
  assert.deepEqual(wires(after), wires(doc), 'the stub removed, W3 not split');
  sameDesign(doc, after, 'the stub at the dot');
  // a third inverter's wire from the dot, down over W3 to (200, 250), then right to its input
  const d2 = clone(doc);
  d2.symbols.push({ id: 'S3', type: 'inv', x: 400, y: 240, rot: 0, mirror: false, name: 'U3', params: { width: 1 } });
  d2.ports.push(port('P4', 'w', 'out', 480, 250));
  const ref = clone(d2);
  ref.wires.push({ id: 'W9', points: [P(200, 250), P(400, 250)] });   // (the reference: drawn without the doubled part, W3 split)
  ref.wires.splice(2, 1, { id: 'W3', points: [P(200, 200), P(200, 250)] }, { id: 'W10', points: [P(200, 250), P(200, 300), P(400, 300)] });
  d2.wires.push({ id: 'W9', points: [P(200, 200), P(200, 250), P(400, 250)] });
  const after2 = normalizeDoc(d2);
  assert.deepEqual(doubled(after2), []);
  assert.deepEqual(new Set(Object.values(wires(after2))), new Set(Object.values(wires(normalizeDoc(ref)))));
  sameDesign(normalizeDoc(ref), after2, 'the doubled wire at the dot');
  assert.deepEqual(netlist(after2).junctions.map(j => [j.x, j.y]).sort(), [[200, 200], [200, 250]]);
});

test('#4920 what stays: a wire left unconnected on a stretch of its own, a doubled part with another wire\'s end on it', () => {
  // a branch from the T going right to nothing: not drawn twice, kept (Check Syntax: no warning, its net has pins)
  const doc = tee();
  doc.wires.push({ id: 'W9', points: [P(200, 200), P(260, 200)] });
  const kept = normalizeDoc(doc);
  assert.deepEqual(wires(kept).W9, '200,200 260,200');
  assert.deepEqual(diags(kept), []);
  // a free wire on its own: kept, the warning as before
  const free = newDoc('free', 'vhdl');
  free.wires.push({ id: 'W1', points: [P(100, 100), P(200, 100), P(200, 200)] });
  const f = normalizeDoc(free);
  assert.deepEqual(wires(f), { W1: '100,100 200,100 200,200' });
  assert.deepEqual(diags(f), ['dangling wire not connected to any pin']);
  // two wires meeting end to end and doubled, another wire ending on the doubled part: left as it is
  const d = newDoc('held', 'vhdl');
  d.wires.push({ id: 'W1', points: [P(100, 100), P(200, 100)] }, { id: 'W2', points: [P(200, 100), P(140, 100), P(140, 200)] },
    { id: 'W3', points: [P(170, 100), P(170, 50)] });
  assert.equal(trimFoldBacks(d), 0);
});

test('#4920 a bus: the branch split at a dot stays a bus; a curved wire trimmed loses its own curve', () => {
  const doc = newDoc('bus', 'vhdl');
  doc.ports.push(port('P1', 'a', 'in', 100, 200, 4), port('P2', 'y', 'out', 400, 100, 4), port('P3', 'z', 'out', 400, 300, 4), port('P4', 'w', 'out', 400, 250, 4));
  doc.wires.push({ id: 'W1', points: [P(100, 200), P(200, 200)], bus: true }, { id: 'W2', points: [P(200, 200), P(200, 100), P(400, 100)], bus: true },
    { id: 'W3', points: [P(200, 200), P(200, 300), P(400, 300)], bus: true }, { id: 'W4', points: [P(200, 200), P(200, 250), P(400, 250)], bus: true });
  const n = normalizeDoc(doc);
  assert.ok(n.wires.every(w => w.bus), 'every piece a bus');
  assert.deepEqual(doubled(n), []);
  assert.equal(n.wires.length, 5);
  const c = newDoc('curve', 'vhdl');
  c.wires.push({ id: 'W1', points: [P(100, 100), P(200, 100)] }, { id: 'W2', points: [P(200, 100), P(150, 100), P(150, 200)], curve: [{ u: 0.5, v: 0.2 }] });
  const cn = normalizeDoc(c);
  assert.deepEqual(wires(cn), { W1: '100,100 150,100', W2: '150,100 150,200' });
  assert.equal(cn.wires.find(w => w.id === 'W2').curve, undefined);
});
