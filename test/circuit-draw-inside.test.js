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

const P = 20;
const all = (e) => (e instanceof El ? [e, ...e.children.flatMap(all)] : []);
// an IC's inside drawn as the editor does (its pins unturned, in grid units; their box in pixels): its elements
function inside(d, std) {
  const pins = d.pins.map((q) => ({ n: q.n, name: q.name ?? String(q.n), x: q.dx, y: q.dy }));
  const xs = pins.map((q) => q.x * P), ys = pins.map((q) => q.y * P);
  const g = new El('g');
  icInside(g, d, pins, { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }, std);
  return all(g).slice(1);
}

test('#4299 Show inside: no lead of any IC filled, in both standards', () => {
  let leads = 0;
  for (const d of [...ICS, ...MSI, ...SEQ]) {
    for (const std of ['ieee', 'iec']) {
      const els = inside(d, std), what = `${d.type} ${std}`;
      const ls = els.filter((e) => e.attrs.class === 'circ-gate-line');
      // (a gate IC: three leads a 2-input gate, its inputs' and its output's; another IC: none, its pins named)
      assert.equal(ls.length, (d.gates || []).reduce((n, x) => n + x.ins.length + 1, 0), what);
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
