// A symbol's pins moved or changed (core/schdoc-repin.js): the wires on a pin that stays following it. A pin turned
// with its symbol (Rotate / Mirror, #5156) moves both ways: the wire still square and on it; a gate's inputs changed in
// Properties (OR4 to OR2, #5153): the wires of the pins kept follow them, those of the pins that go dropped. The
// document's geometry (symbolPins) and its netlist are the reference.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  followPins, generateHdl, instanceParams, netlist, newSymbol, normalizeDoc, otherPins, repinSymbol, rotSize, snap, symbolDef, symbolPins, updateModuleSymbols
} from '../core/schdoc.js';
import { wireClashes, wireGrid } from '../core/schpath.js';

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

// #5278: a module's symbol with pins on its four sides, a wire from each straight out to an I/O marker (drawn outwards,
// or as its direction draws it); Update Symbol moving the pins across their wires' runs
const P = (name, dir = 'in') => ({ name, dir, width: 1 });
const OUT = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];   // (wireGrid's sides: E, W, S, N)
const pickMods = (ports, pins, more = {}) => ({ pick: { name: 'pick', lang: 'vhdl', ports, symbol: { ...newSymbol({ name: 'pick', ports }), width: 100, pins, ...more } } });
function pickSheet(m, { outwards, len = 60 }) {
  const s = { id: 'U', type: 'module', x: 230, y: 160, rot: 0, mirror: false, name: 'inst_1', params: { module: 'pick', generics: {}, ...instanceParams(m.pick) } };
  const wires = [], ports = [];
  for (const p of symbolPins(s, m)) {
    const [dx, dy] = OUT[p.side], b = { x: p.x + len * dx, y: p.y + len * dy };
    wires.push({ id: `W_${p.name}`, points: [{ x: p.x, y: p.y }, b] });
    ports.push({ id: `M_${p.name}`, name: p.name, dir: p.dir, width: 1, x: b.x, y: b.y, ...(outwards ? { side: p.side } : {}) });
  }
  return normalizeDoc({ version: 4, name: 'top', lang: 'vhdl', symbols: [s], wires, ports, labels: [] }, { modules: m });
}
// each wire's ends: left in the direction of the pin or marker there (wireGrid's sides)
function directions(doc, modules) {
  const side = wireGrid(doc, { modules }).side, bad = [];
  for (const w of doc.wires) {
    for (const [q, r] of [[w.points[0], w.points[1]], [w.points.at(-1), w.points.at(-2)]]) {
      const d = side.get(`${q.x},${q.y}`);
      if (d != null && (Math.sign(r.x - q.x) !== DIRS[d][0] || Math.sign(r.y - q.y) !== DIRS[d][1])) bad.push(`${w.id} at ${q.x},${q.y}`);
    }
  }
  return bad;
}

test('#5278 Update Symbol: the issue\'s case: s moved along the bottom by en, its wire jogging near it, clear of its marker', () => {
  const m1 = pickMods([P('a'), P('b'), P('s'), P('y', 'out')], [{ name: 'a', side: 'W' }, { name: 'b', side: 'W' }, { name: 'y', side: 'E' }, { name: 's', side: 'S' }]);
  const m2 = pickMods([P('a'), P('b'), P('s'), P('en'), P('y', 'out')], [{ name: 'a', side: 'W' }, { name: 'b', side: 'W' }, { name: 'y', side: 'E' }, { name: 's', side: 'S' }, { name: 'en', side: 'S' }]);
  for (const outwards of [true, false]) {
    const doc = pickSheet(m1, { outwards });
    assert.deepEqual(xy(doc.wires.find((w) => w.id === 'W_s').points), [[300, 240], [300, 300]]);
    // (a marker drawn as its direction draws it, its body to the left: s's wire reaching it from above already)
    const askew = directions(doc, m1);
    assert.deepEqual(askew, outwards ? [] : ['W_s at 300,300']);
    assert.deepEqual(updateModuleSymbols(doc, m2), { updated: ['inst_1'], removed: [], turned: [] });
    const w = doc.wires.find((x) => x.id === 'W_s');
    // (the marker as its direction draws it: the corner at its end would be on its body, the jog half way instead, the
    // wire reaching it as it did; drawn downwards: the corner at its end, on its body's edge, as before)
    assert.deepEqual(xy(w.points), outwards ? [[290, 240], [290, 300], [300, 300]] : [[290, 240], [290, 270], [300, 270], [300, 300]]);
    assert.deepEqual(wireClashes(doc, { modules: m2 }), [], 'no wire over a pin or a body');
    assert.deepEqual(directions(doc, m2), outwards ? ['W_s at 300,300'] : askew);
    assert.deepEqual(netlist(doc, { modules: m2 }).diagnostics.map((d) => d.message), ['input pin en of inst_1 (pick) is not connected']);
    const nl = netlist(doc, { modules: m2 });
    assert.deepEqual(['a', 'b', 's', 'y'].map((n) => nl.pinNet.get(`U/${n}`).name), ['a', 'b', 's', 'y']);
  }
});

test('#5278 Update Symbol: pins moved across their wires on every side: each wire leaves its pin and reaches its marker in their directions, over no body; the same HDL', () => {
  const ports = [P('w1'), P('w2'), P('n1'), P('n2'), P('s1'), P('s2'), P('e1', 'out'), P('e2', 'out')];
  const pins = ports.map((q) => ({ name: q.name, side: q.name[0].toUpperCase() }));
  const m1 = pickMods(ports, pins), m2 = pickMods(ports, pins, { spacing: 40, width: 140, height: 120 });
  const doc = pickSheet(m1, { outwards: true, len: 120 });
  const was = JSON.parse(JSON.stringify(doc));
  const hdl = Object.fromEntries(['vhdl', 'verilog'].map((lang) => [lang, generateHdl(doc, { lang, modules: m1 }).code]));
  assert.deepEqual(netlist(doc, { modules: m1 }).diagnostics, [], 'no warnings');
  assert.deepEqual(wireClashes(doc, { modules: m1 }), []);
  assert.deepEqual(updateModuleSymbols(doc, m2), { updated: ['inst_1'], removed: [], turned: [] });
  const at = Object.fromEntries(symbolPins(doc.symbols[0], m2).map((p) => [p.name, `${p.x},${p.y}`]));
  // every pin moved across its wire's run (the wire would go slanted), and its wire on it
  for (const q of ports) {
    const w0 = was.wires.find((w) => w.id === `W_${q.name}`).points[0], w = doc.wires.find((x) => x.id === `W_${q.name}`);
    assert.ok('WE'.includes(q.name[0].toUpperCase()) ? w0.y !== +at[q.name].split(',')[1] : w0.x !== +at[q.name].split(',')[0], `${q.name} moved across`);
    assert.equal(`${w.points[0].x},${w.points[0].y}`, at[q.name]);
    assert.ok(square(w), `${q.name}'s wire square`);
  }
  // (each jogging half way between its pin and its marker)
  assert.deepEqual(Object.fromEntries(doc.wires.map((w) => [w.id, xy(w.points).join(' ')])), {
    W_w1: '230,220 180,220 180,200 110,200', W_w2: '230,260 170,260 170,220 110,220', W_n1: '300,160 300,100 290,100 290,40',
    W_n2: '340,160 340,100 310,100 310,40', W_s1: '300,320 300,350 290,350 290,390', W_s2: '340,320 340,350 310,350 310,390',
    W_e1: '410,220 440,220 440,200 490,200', W_e2: '410,260 450,260 450,220 490,220' });
  assert.deepEqual(wireClashes(doc, { modules: m2 }), [], 'no wire over a pin or a body');
  assert.deepEqual(directions(doc, m2), []);
  assert.deepEqual(netlist(doc, { modules: m2 }).diagnostics, [], 'no warnings');
  for (const lang of ['vhdl', 'verilog']) {
    const g = generateHdl(doc, { lang, modules: m2 });
    assert.equal(g.code, hdl[lang], `the same ${lang}`);
    assert.deepEqual(g.diagnostics, [], `no warnings (${lang})`);
  }
});

test('#5278 followPins: a symbol turned (the arith test design\'s adder): its wires routed again clear of what they ran over, every pin on its net; a net name the follow left off its wire joins no other', () => {
  const doc = normalizeDoc(JSON.parse(fs.readFileSync(new URL('../test-designs/arith/src/arith.sch.json', import.meta.url), 'utf8')));
  const nets = (d) => { const nl = netlist(d); return d.symbols.flatMap((s) => symbolPins(s).map((p) => `${s.name}.${p.name}:${nl.pinNet.get(`${s.id}/${p.name}`)?.name}`)); };
  const nets0 = nets(doc), known = new Set(wireClashes(doc).map((c) => `${c.wire} ${c.kind}@${c.x},${c.y}`));
  const s = doc.symbols.find((x) => x.name === 'XLXI_1');
  const before = symbolPins(s), others = otherPins(doc, s);
  // (Rotate's way: around its centre, on the grid)
  const def = symbolDef(s), a = rotSize(s, def), cx = s.x + a.w / 2, cy = s.y + a.h / 2;
  s.rot = (s.rot + 90) % 360;
  const b = rotSize(s, def);
  s.x = snap(cx - b.w / 2); s.y = snap(cy - b.h / 2);
  const moves = new Map(symbolPins(s).map((p) => [before.find((q) => q.name === p.name), p]).filter(([q, p]) => q.x !== p.x || q.y !== p.y)
    .map(([q, p]) => [`${q.x},${q.y}`, { from: { x: q.x, y: q.y }, to: { x: p.x, y: p.y }, p }]));
  assert.equal(moves.size, 5);
  followPins(doc, moves, others);
  assert.ok(doc.wires.every(square));
  assert.deepEqual(wireClashes(doc).filter((c) => !known.has(`${c.wire} ${c.kind}@${c.x},${c.y}`)), [], 'nothing new run over');
  assert.deepEqual(nets(doc), nets0, 'every pin on its net');
});
