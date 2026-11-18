// The circuit editor's Show inside (web/js/circuit-draw-inside.js, #4224): an IC's leads, from its pins to its gates'
// inputs and from their tips to their output pins, are lines, never filled (#4299: SVG's default black fill closed each
// bent lead into a black triangle). Every IC of the parts list (the gate ICs, the MSI and sequential ones) drawn on a
// small stand-in for the DOM, in both standards (IEEE, IEC): each lead's polyline unfilled, and the editor's style of
// the leads unfilled too (the print and the exported image copy the computed style). The only filled shapes inside are
// the gates' bodies and bubbles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './ui/core-hooks.js';

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  append(...c) { this.children.push(...c); }
}
globalThis.Node ??= El;
globalThis.document ??= { createElementNS: (_, tag) => new El(tag), createElement: (tag) => new El(tag), createTextNode: (t) => t };
const { icInside } = await import('../web/js/circuit-draw-inside.js');
const { ICS } = await import('../core/circuit-ics.js');
const { MSI } = await import('../core/circuit-msi.js');
const { SEQ } = await import('../core/circuit-seq.js');
const { blocksLayout } = await import('../core/circuit-inside-blocks.js');

const P = 20;
const all = (e) => (e instanceof El ? [e, ...e.children.flatMap(all)] : []);
// an IC's inside drawn as the editor does (its pins unturned, in grid units; their box in pixels): its elements
function inside(d, std, opts) {
  const pins = d.pins.map((q) => ({ n: q.n, name: q.name ?? String(q.n), x: q.dx, y: q.dy }));
  const xs = pins.map((q) => q.x * P), ys = pins.map((q) => q.y * P);
  const g = new El('g');
  icInside(g, d, pins, { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }, std, opts);
  return all(g).slice(1);
}

const NAMED = ['74125', '74126', '74240', '74241', '74244', '74365', '74366', '74367', '74368', '74540', '74541', '74242', '74243', '74245'];

test('#4299 Show inside: no lead of any IC filled, in both standards', () => {
  let leads = 0;
  for (const d of [...ICS, ...MSI, ...SEQ]) {
    for (const std of ['ieee', 'iec']) {
      const els = inside(d, std), what = `${d.type} ${std}`;
      const ls = els.filter((e) => e.attrs.class === 'circ-gate-line');
      // (a gate IC: three leads a 2-input gate, its inputs' and its output's; another IC: none, its pins named)
      // (the three-state buffers: their pins named, #4397; an AND-OR-INVERT: a lead more a
      // term, from its AND to its NOR, #4498)
      if (NAMED.includes(d.type)) assert.deepEqual(els.filter((e) => e.attrs.class === 'circ-pin-name').map((e) => e.children.join('')).sort(), d.pins.filter((q) => q.name !== 'NC').map((q) => q.name).sort(), what);
      // (an IC with no gates, #4508: a lead each of its pins in its functions' boxes, its signals' and the supply's under a box)
      assert.equal(ls.length, NAMED.includes(d.type) ? 0 : d.gates ? d.gates.reduce((n, x) => n + x.ins.length + (x.terms?.length ?? 0) + 1, 0) : blocksLayout(d, d.pins.map((q) => ({ n: q.n, x: q.dx * P, y: q.dy * P }))).wires.length, what);
      if (!d.gates) assert.ok(els.some((e) => e.attrs.class === 'circ-block'), `${what}: its boxes`);
      for (const l of ls) {
        assert.equal(l.tag, 'polyline', what);
        assert.equal(l.attrs.fill, 'none', `${what} pin ${l.attrs['data-pin']}`);
      }
      leads += ls.length;
      // the open shapes inside (lines, paths but the gates' bodies) none filled either
      for (const e of els.filter((x) => ['polyline', 'path', 'line'].includes(x.tag) && x.attrs.class !== 'circ-gate')) {
        assert.ok(e.attrs.fill === 'none' || /\bcirc-gate-back\b/.test(e.attrs.class), `${what} ${e.tag}.${e.attrs.class}`);
      }
    }
  }
  assert.ok(leads > 100, `${leads} leads drawn`);
});

test('#4299 the circuit editor\'s style of the leads: unfilled', () => {
  const css = fs.readFileSync(new URL('../web/css/circuit-editor.css', import.meta.url), 'utf8');
  const rule = css.match(/\.circuit-editor \.circ-gate-line \{([^}]*)\}/);
  assert.ok(rule, 'the leads\' rule');
  assert.match(rule[1], /(^|;)\s*fill:\s*none\s*;/);
  // (and the XOR's second back, an open curve, #4220)
  assert.match(css, /\.circuit-editor \.circ-gate-back \{ fill: none; \}/);
});

test('#4498 Show inside, an AND-OR-INVERT: its terms\' ANDs turned to face up or down, its NOR facing its pin; IEEE shapes or IEC boxes; VCC and GND named', () => {
  for (const t of ['7451', '7454', '7455']) {
    const d = ICS.find((x) => x.type === t), terms = d.gates.reduce((n, g) => n + g.terms.length, 0);
    const ieee = inside(d, 'ieee'), iec = inside(d, 'iec');
    const shapes = ieee.filter((e) => e.attrs.class === 'circ-gate-ieee');
    assert.deepEqual(shapes.map((e) => e.attrs['data-fn']).sort(), [...Array(terms).fill('and'), ...Array(d.gates.length).fill('nor')].sort(), t);
    for (const e of shapes) assert.ok(e.attrs['data-fn'] === 'and' ? /^rotate\((-90|90) [\d.-]+ [\d.-]+\)$/.test(e.attrs.transform) : e.attrs.transform === undefined, `${t} ${e.attrs['data-fn']}: ${e.attrs.transform}`);
    assert.equal(ieee.filter((e) => e.attrs.class === 'circ-gate-bubble').length, d.gates.length, `${t}: the NORs' bubbles`);
    // (IEC: a box a gate, & or ≥1 upright in it; the NORs' bubbles)
    assert.deepEqual(iec.filter((e) => e.attrs.class === 'circ-gate-text').map((e) => e.children.join('')).sort(), [...Array(terms).fill('&'), ...Array(d.gates.length).fill('≥1')].sort(), t);
    assert.equal(iec.filter((e) => e.tag === 'rect' && e.attrs.class === 'circ-gate').length, terms + d.gates.length, t);
    for (const els of [ieee, iec]) assert.deepEqual(els.filter((e) => e.attrs.class === 'circ-pin-name').map((e) => e.children.join('')).sort(), ['GND', 'VCC'], t);
    // (a term's lead has no pin)
    assert.equal(ieee.filter((e) => e.attrs.class === 'circ-gate-line' && e.attrs['data-pin'] === undefined).length, terms, t);
  }
});

test('#4508 Show inside, an IC with no gates: the 7474\'s two flip-flops, their clocks\' ▷, their bubbles; IEEE\'s names, IEC\'s labels; a counter\'s IEC qualifier', () => {
  const d = SEQ.find((x) => x.type === '7474') ?? ICS.find((x) => x.type === '7474');
  for (const std of ['ieee', 'iec']) {
    const els = inside(d, std);
    const boxes = els.filter((e) => e.attrs.class === 'circ-block');
    assert.deepEqual(boxes.map((b) => [b.attrs['data-unit'], b.attrs['data-std']]), [['1', std], ['2', std]]);
    assert.equal(els.filter((e) => e.attrs.class === 'circ-block-clock').length, 2, std);
    const labels = (u) => boxes[u].children.filter((e) => e.attrs?.class === 'circ-block-pin').map((e) => e.children.join(''));
    assert.deepEqual(labels(0), std === 'ieee' ? ['CLR̅', 'D', 'CLK', 'PRE̅', 'Q', 'Q̅'] : ['R', '1D', 'C1', 'S']);
    // (the bubbles: CLR̅ and PRE̅ each unit; IEC: its Q̅ too)
    assert.equal(els.filter((e) => e.attrs.class === 'circ-gate-bubble').length, std === 'ieee' ? 4 : 6, std);
    assert.deepEqual(els.filter((e) => e.attrs.class === 'circ-pin-name').map((e) => e.children.join('')).sort(), ['GND', 'VCC'], std);
  }
  const ctr = MSI.find((x) => x.type === '74161') ?? SEQ.find((x) => x.type === '74161');
  assert.deepEqual(inside(ctr, 'iec').filter((e) => e.attrs.class === 'circ-block-qual').map((e) => e.children.join('')), ['CTR']);
  assert.deepEqual(inside(ctr, 'ieee').filter((e) => e.attrs.class === 'circ-block-qual'), []);
});

test('#4505 Show inside, the 4023: its three NANDs, 1C\'s line crossing 1Y\'s, a hop-over with Wire crossings\' hop-overs, else a plain crossing; no dot', () => {
  for (const t of ['4023', '4025', '4073', '4075']) {
    const d = ICS.find((x) => x.type === t);
    for (const std of ['ieee', 'iec']) {
      const plain = inside(d, std), hop = inside(d, std, { hops: true });
      assert.equal(plain.filter((e) => /\bcirc-gate-line\b/.test(e.attrs.class)).length, 12, `${t} ${std}`);
      assert.equal(plain.filter((e) => /circ-gate-hop/.test(e.attrs.class)).length, 0, `${t} ${std}`);
      // (one line hops, 1Y's, an arc over 1C's; its pin kept; unfilled)
      const h = hop.filter((e) => /circ-gate-hop/.test(e.attrs.class));
      assert.deepEqual(h.map((e) => [e.tag, e.attrs['data-pin'], e.attrs.fill, / A2\.5,2\.5 /.test(e.attrs.d)]), [['path', '9', 'none', true]], `${t} ${std}`);
      // (no dot: no circle but the gates' bubbles)
      assert.equal(hop.filter((e) => e.tag === 'circle').length, ['4023', '4025'].includes(t) ? 3 : 0, `${t} ${std}`);
      assert.deepEqual(hop.filter((e) => e.attrs.class === 'circ-pin-name').map((e) => e.children.join('')).sort(), ['VDD', 'VSS'], `${t} ${std}`);
    }
  }
});
