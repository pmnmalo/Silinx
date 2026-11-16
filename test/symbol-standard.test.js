// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
// The standard the logic primitives are drawn in (#4113, core/symbol-standard.js): the standards and their default,
// the IEC qualifiers and negations, an IEC box's geometry; drawn in IEC 60617-12, the schematic's gates, inverters and
// buffers (web/js/sch-svg.js) and the RTL schematic's (web/js/schematic-view.js) keep every pin where the distinctive
// shapes have it, a lead still ending at each, the box where the shape's body was; the type under the box, the
// qualifier inside it, upright whichever way the symbol is turned; and the circuit editor's Show inside the same
// qualifiers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './ui/core-hooks.js';
import * as S from '../core/symbol-standard.js';
import { SYMBOLS, symbolDef, symbolPins, symbolBox } from '../core/schdoc.js';

const { symbolSvg, symbolDrawingSvg, bodySvg, r1 } = await import('../web/js/sch-svg.js');
const { gateShape } = await import('../web/js/schematic-view.js');
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const all = (svg, re) => [...svg.matchAll(re)].map((m) => attrs(m[0]));

test('#4113 the standards: IEEE Std 91-1984 the default, IEC 60617-12 the other; anything else the default', () => {
  assert.deepEqual(S.SYMBOL_STANDARDS.map(([id]) => id), ['ieee', 'iec']);
  assert.deepEqual(S.SYMBOL_STANDARD_IDS, ['ieee', 'iec']);
  assert.equal(S.DEFAULT_SYMBOL_STANDARD, 'ieee');
  assert.deepEqual(S.SYMBOL_STANDARDS.map(([, l]) => l), ['IEEE Std 91-1984 (distinctive shapes)', 'IEC 60617-12 (rectangular)']);
  for (const v of ['ieee', 'iec']) assert.equal(S.symbolStandardOf(v), v);
  for (const v of [undefined, null, '', 'IEC', 'ansi', 3]) assert.equal(S.symbolStandardOf(v), 'ieee', String(v));
  assert.ok(Object.isFrozen(S.SYMBOL_STANDARDS) && Object.isFrozen(S.SYMBOL_STANDARDS[0]));
});

test('#4113 the IEC qualifiers: & AND, ≥1 OR, =1 XOR, 1 an inverter or a buffer; the inverting ones', () => {
  const Q = { and: '&', nand: '&', or: '≥1', nor: '≥1', xor: '=1', xnor: '=1', not: '1', inv: '1', buf: '1', AND: '&' };
  for (const [fn, q] of Object.entries(Q)) assert.equal(S.iecQualifier(fn), q, fn);
  for (const fn of ['mux', 'add', '', undefined]) assert.equal(S.iecQualifier(fn), null, String(fn));
  assert.deepEqual(['and', 'nand', 'or', 'nor', 'xor', 'xnor', 'not', 'inv', 'buf', 'mux'].filter(S.invertsOutput), ['nand', 'nor', 'xnor', 'not', 'inv']);
});

test('#4113 an IEC box: its rectangle the body, its qualifier in the middle, the bubble on the right side\'s middle', () => {
  assert.deepEqual(S.iecGate('and', { x: 20, y: 0, w: 40, h: 40 }),
    { rect: { x: 20, y: 0, w: 40, h: 40 }, text: { x: 40, y: 23, label: '&' }, bubble: null, outX: 60 });
  assert.deepEqual(S.iecGate('nor', { x: 20, y: 40, w: 40, h: 30 }),
    { rect: { x: 20, y: 40, w: 40, h: 30 }, text: { x: 40, y: 58, label: '≥1' }, bubble: { cx: 63, cy: 55, r: 3 }, outX: 66 });
  assert.deepEqual(S.iecGate('not', { x: 0, y: 0, w: 16, h: 12, r: 2 }).bubble, { cx: 18, cy: 6, r: 2 });
  // (another function: its name the label, no bubble)
  assert.deepEqual(S.iecGate('mux', { x: 0, y: 0, w: 10, h: 10 }).text.label, 'mux');
});

// every gate, inverter and buffer of the schematic's library, one bit and a pin per bit
const TYPES = Object.keys(SYMBOLS).filter((t) => SYMBOLS[t].gate || t === 'inv' || t === 'buf');
const variants = (type) => [{}, { width: 2, bits: true }].map((params) => ({ id: 'S1', type, x: 0, y: 0, rot: 0, mirror: false, name: '', params }));

test('#4113 the schematic in IEC: the same pins, a lead to each, a box where the shape\'s body was, its bubbles', () => {
  assert.ok(TYPES.length > 40, `${TYPES.length} types`);
  for (const type of TYPES) {
    for (const sym of variants(type)) {
      const def = symbolDef(sym, {}), what = `${type}${sym.params.bits ? ' a pin per bit' : ''}`;
      if (sym.params.bits && !(def.rows > 1)) continue;
      const ieee = bodySvg(sym, def, 'ieee'), iec = bodySvg(sym, def, 'iec');
      // the leads: the same, but those of an OR's / XOR's curved back, which end at the box's side (x 20)
      const leads = (svg) => all(svg, /<line class="pin[^"]*"[^>]*>/g);
      const li = leads(ieee), le = leads(iec);
      assert.equal(le.length, li.length, what);
      li.forEach((l, i) => {
        assert.deepEqual([le[i].x1, le[i].y1, le[i].y2], [l.x1, l.y1, l.y2], `${what}: lead ${i}`);
        if (+l.x1 === 0 && !/^x?n?or|^xn?or/.test(def.gate || '')) assert.equal(le[i].x2, l.x2, `${what}: lead ${i}`);
      });
      // a lead ends at each pin
      for (const p of def.pins) assert.ok(le.some((l) => (+l.x1 === r1(p.x) && +l.y1 === r1(p.y)) || (+l.x2 === r1(p.x) && +l.y2 === r1(p.y))), `${what}: ${p.name}`);
      // an input's lead ends at the box's left side (or at its bubble)
      for (const l of le.filter((x) => +x.x1 === 0)) assert.ok(+l.x2 === 20 || +l.x2 === 12, `${what}: an input lead to ${l.x2}`);
      // the boxes: one a row, the body's width, and no path of a distinctive shape
      const rows = def.rows || 1, pitch = def.gh || def.body.h / rows;
      const rects = all(iec, /<rect class="gate"[^>]*>/g);
      assert.deepEqual(rects.map((b) => [+b.x, +b.y, +b.width, +b.height]),
        [...Array(rows).keys()].map((r) => [def.body.x, r1(r * pitch), def.body.w, r1(pitch)]), what);
      assert.doesNotMatch(iec, /<path class="gate"/, what);
      // the bubbles: the same circles (an output's; an inverted input's, at the box's side: x 16, where the AND's is)
      const at = (svg) => all(svg, /<circle[^>]*>/g).map((c) => ({ ...c, cx: c.class === 'gate bubble' ? '16' : c.cx }));
      assert.deepEqual(all(iec, /<circle[^>]*>/g), at(ieee), what);
      // the pins and the box: the document's, the same whichever standard
      assert.deepEqual(symbolPins(sym, {}, def).map((p) => [p.x, p.y]), def.pins.map((p) => [p.x, p.y]), what);
    }
  }
});

test('#4113 the schematic in IEC: the qualifier inside each box, upright when turned; the type under it', () => {
  for (const [type, q] of [['and2', '&'], ['nor3', '≥1'], ['xnor2', '=1'], ['inv', '1'], ['buf', '1'], ['or4b2', '≥1']]) {
    for (const rot of [0, 90, 180, 270]) {
      const sym = { id: 'S1', type, x: 100, y: 200, rot, mirror: false, name: '', params: {} };
      const def = symbolDef(sym, {}), what = `${type} rot ${rot}`;
      const svg = symbolSvg(sym, def, '', { std: 'iec' });
      const t = svg.match(/<text class="stype iec"[^>]*>([^<]*)<\/text>/);
      assert.ok(t, what);
      assert.equal(t[1].replace('&amp;', '&'), q, what);
      // upright (no transform), at the body's centre
      assert.doesNotMatch(t[0], /transform/, what);
      const box = symbolBox(sym, {}, def), a = attrs(t[0]);
      assert.ok(+a.x > box.x && +a.x < box.x + box.w && +a.y > box.y && +a.y < box.y + box.h + 3, `${what}: ${a.x},${a.y} in the box`);
      // the type (AND2, INV…) not inside the box, under it
      assert.doesNotMatch(svg, /class="stype inside/, what);
      assert.match(svg, new RegExp(`<text class="stype"[^>]*>${type.toUpperCase()}</text>`), what);
      // in IEEE, as before: no qualifier
      assert.doesNotMatch(symbolSvg(sym, def, '', { std: 'ieee' }), /stype iec/, what);
    }
  }
  // a gate a pin per bit: a qualifier a row
  const sym = { id: 'S1', type: 'and2', x: 0, y: 0, rot: 0, mirror: false, name: '', params: { width: 3, bits: true } };
  assert.equal(symbolSvg(sym, symbolDef(sym, {}), '', { std: 'iec' }).match(/stype iec/g).length, 3);
  // the datasheet drawing too
  assert.match(symbolDrawingSvg(sym, symbolDef(sym, {}), { std: 'iec' }), /<rect class="gate"/);
  assert.doesNotMatch(symbolDrawingSvg(sym, symbolDef(sym, {}), { std: 'ieee' }), /<rect class="gate"/);
});

test('#4113 the RTL schematic in IEC: the same size and pins, a box, its qualifier and bubble', () => {
  const port = (id, side) => ({ id, side, w: 1 });
  for (const g of ['and', 'nand', 'or', 'nor', 'xor', 'xnor', 'not', 'buf']) {
    for (const k of g === 'not' || g === 'buf' ? [1] : [2, 3, 5]) {
      const ports = [...[...Array(k).keys()].map((i) => port(`i${i}`, 'W')), port('y', 'E')];
      const n = { id: 'g', kind: 'gate', gate: g, ports }, what = `${g} ${k}`;
      const a = gateShape(n, ports, 'ieee'), b = gateShape(n, ports, 'iec');
      assert.deepEqual([b.w, b.h, b.pins], [a.w, a.h, a.pins], what);
      assert.doesNotMatch(b.body, /<path class="gate"/, what);
      const rect = attrs(b.body.match(/<rect class="gate"[^>]*>/)[0]);
      assert.equal(+rect.height, b.h, what);
      assert.match(b.body, new RegExp(`<text class="glabel iec"[^>]*>${S.iecQualifier(g).replace('&', '&amp;')}</text>`), what);
      assert.equal(/<circle/.test(b.body), S.invertsOutput(g), what);
      // the input leads end at the box's left side; the output's starts at its right side (or its bubble's)
      const leads = all(b.body, /<line class="pin[^"]*"[^>]*>/g);
      for (const l of leads.filter((x) => +x.x1 === 0)) assert.equal(+l.x2, +rect.x, what);
      const out = leads.find((x) => +x.x2 === b.w);
      assert.equal(+out.x1, +rect.x + +rect.width + (S.invertsOutput(g) ? 6 : 0), what);
    }
  }
});

test('#4113 the circuit editor\'s Show inside: the qualifiers of core/symbol-standard.js, no table of its own', () => {
  const src = fs.readFileSync(new URL('../web/js/circuit-draw-inside.js', import.meta.url), 'utf8');
  assert.match(src, /import \{ iecQualifier, ieeeGate \} from '\/core\/symbol-standard\.js'/);
  assert.doesNotMatch(src, /'≥1'/);
  // (#4220: in the standard chosen, Settings ▸ Schematic Symbols', not always IEC)
  assert.match(src, /import \{ getSymbolStandard \} from '\.\/symbol-standard\.js'/);
});

test('#4220 an IEEE distinctive shape in a box: the AND\'s D, the OR\'s shield, the XOR\'s second back, the triangle; the bubble on the output', () => {
  const box = { x: 10, y: 20, w: 16, h: 12, r: 2 };
  // the AND: a straight back at x, a half ellipse (w/2 by h/2) from the middle of the top to the middle of the bottom
  assert.deepEqual(S.ieeeGate('and', box), { paths: ['M10,20 H18 A8,6 0 0 1 18,32 H10 Z'], bubble: null, outX: 26 });
  assert.deepEqual(S.ieeeGate('nand', box), { paths: ['M10,20 H18 A8,6 0 0 1 18,32 H10 Z'], bubble: { cx: 28, cy: 26, r: 2 }, outX: 30 });
  // the OR: two curves to its point at the right's middle, its back curved in (a quarter of its width)
  const or = S.ieeeGate('or', box);
  assert.deepEqual(or, { paths: ['M10,20 Q20.67,20 26,26 Q20.67,32 10,32 Q14,26 10,20 Z'], bubble: null, outX: 26 });
  assert.deepEqual(S.ieeeGate('NOR', box), { ...or, bubble: { cx: 28, cy: 26, r: 2 }, outX: 30 });
  // the XOR: the OR's body and a second back 3 behind it, open
  assert.deepEqual(S.ieeeGate('xor', box).paths, [...or.paths, 'M7,32 Q11,26 7,20']);
  assert.equal(S.ieeeGate('xnor', box).bubble.cx, 28);
  // the inverter and the buffer: a triangle, its point the output
  assert.deepEqual(S.ieeeGate('not', box), { paths: ['M10,20 L26,26 L10,32 Z'], bubble: { cx: 28, cy: 26, r: 2 }, outX: 30 });
  assert.deepEqual(S.ieeeGate('buf', box), { paths: ['M10,20 L26,26 L10,32 Z'], bubble: null, outX: 26 });
  // every gate function of the circuits' gate ICs drawn (core/circuit-ics.js)
  for (const fn of ['and', 'nand', 'or', 'nor', 'xor', 'not']) assert.ok(S.ieeeGate(fn, box).paths[0].startsWith('M10,20'), fn);
});
