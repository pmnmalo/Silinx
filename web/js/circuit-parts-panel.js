// The circuit editor's Parts panel (#4062), on the left of the canvas as the schematic editor's Symbols: a search, the
// parts by category (each folded or open, remembered while it is open), each part a row with its drawing (the editor's
// own, circuit-draw.js, scaled down; an IC's, the schematic editor's symbol of what it is: a gate IC's gate, an MSI's
// block, as its Symbols panel draws them) and its name; a click on a part, then on the drawing, places it (Esc: done).
// Foldable to a strip (side-fold.js) and, on a narrow screen, over the canvas behind the toolbar's ☰ Parts.
import { h } from './ui.js';
import { sv } from './dom.js';
import { mountSideFold } from './side-fold.js';
import { PARTS, PART_ORDER, partPins, partHoles } from '/core/circuit-parts.js';
import { drawCircuit, P } from './circuit-draw.js';
import { defaultParams, symbolDef } from '/core/schdoc.js';
import { bodySvg, r1 } from './sch-svg.js';

const GROUPS = [['Breadboards', ['breadboard-half', 'breadboard-full']], ['Power', ['supply', 'pull-up', 'pull-down']],
  ['Inputs', ['logic-switch', 'button', 'spdt', 'dip-4', 'dip-8', 'clock']], ['Outputs', ['led', 'seg7-cc', 'seg7-ca', 'led-bar-10', 'probe']],
  ['Gates (74LS)', PART_ORDER.filter((t) => PARTS[t].gates && PARTS[t].family === 'ttl')], ['Gates (4000)', PART_ORDER.filter((t) => PARTS[t].gates && PARTS[t].family === 'cmos')],
  ['MSI (74LS)', PART_ORDER.filter((t) => PARTS[t].model)], ['Sequential (74LS, 4000)', PART_ORDER.filter((t) => PARTS[t].seq)]];
const W = 54, H = 34;
// the schematic's symbol of an MSI or sequential IC (core/schdoc.js SYMBOLS)
const BLOCK = { 7447: 'decoder', 7448: 'decoder', 4511: 'decoder', 74138: 'decoder', 74139: 'decoder', 74151: 'mux8', 74153: 'mux4', 74157: 'mux2',
  7483: 'add', 74283: 'add', 7485: 'compare', 7474: 'fdcp', 7476: 'fjkcp', 74112: 'fjkcp', 7490: 'counter', 7493: 'counter', 74161: 'counter',
  74163: 'counter', 74191: 'counter', 74193: 'counter', 4017: 'counter', 74164: 'register', 74165: 'register', 74194: 'register', 74595: 'register' };
/** The schematic symbol of an IC: its gate's (and2…, nand4, inv), or its block's; null for another part. */
export function symbolOfPart(type) {
  const d = PARTS[type];
  if (d?.gates) {
    const { fn, ins } = d.gates[0];
    if (fn === 'not' || fn === 'buf') return fn === 'not' ? 'inv' : 'buf';
    return `${fn}${Math.min(ins.length, fn === 'and' || fn === 'or' ? 5 : 4)}`;
  }
  return BLOCK[type] || null;
}
// the schematic's symbol, as its Symbols panel draws it
function symbolPreview(type) {
  const sym = { id: 'pv', type, x: 0, y: 0, rot: 0, mirror: false, name: '', params: defaultParams(type) };
  const def = symbolDef(sym, {});
  const sc = Math.min(1, (W - 8) / def.w, (H - 8) / def.h), ox = (W - def.w * sc) / 2, oy = (H - def.h * sc) / 2;
  const s = sv('svg', { class: 'circ-pv circ-pv-sym', viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  s.innerHTML = `<g transform="translate(${r1(ox)},${r1(oy)}) scale(${r1(sc * 100) / 100})">${bodySvg(sym, def)}</g>`;
  for (const x of s.querySelectorAll('text, title')) x.remove();
  return s;
}

// a part's drawing, small (its texts and tips left out: the row's name says it)
const previews = new Map();
function preview(type) {
  if (previews.has(type)) return previews.get(type).cloneNode(true);
  if (symbolOfPart(type)) { previews.set(type, symbolPreview(symbolOfPart(type))); return previews.get(type).cloneNode(true); }
  const p = { id: 'X', type, x: 0, y: 0 };
  const xs = [], ys = [];
  for (const q of [...partPins(p), ...partHoles(p)]) { xs.push(q.x); ys.push(q.y); }
  // (the part's body reaches about 2.6 steps beyond its pins: a switch's, the supply's)
  const l = (Math.min(...xs) - 2.7) * P, r = (Math.max(...xs) + 1) * P, t = (Math.min(...ys) - 2.7) * P, b = (Math.max(...ys) + 1) * P;
  const k = Math.min((W - 6) / (r - l), (H - 6) / (b - t));
  const g = drawCircuit({ parts: [p], wires: [] });
  for (const x of g.querySelectorAll('text, title')) x.remove();
  g.setAttribute('transform', `translate(${(W - (r - l) * k) / 2 - l * k},${(H - (b - t) * k) / 2 - t * k}) scale(${k})`);
  const s = sv('svg', { class: 'circ-pv', viewBox: `0 0 ${W} ${H}`, width: W, height: H }, g);
  previews.set(type, s);
  return s.cloneNode(true);
}

/** { side, renderParts } of mountCircuitEditor (tool(): its current tool; setTool(t)). */
export function mountCircuitParts({ root, tool, setTool }) {
  const search = h('input', { type: 'search', class: 'circ-search', placeholder: 'Search parts…', spellcheck: 'false' });
  const list = h('div', { class: 'circ-lib' });
  const side = h('aside', { class: 'circ-parts-side' }, h('div', { class: 'asm-cap' }, 'Parts'), h('div', { class: 'circ-lefttools' }, search), list);
  mountSideFold({ root, side, key: 'silinx.circuit.parts.folded', titles: { fold: 'Collapse the Parts panel', unfold: 'Expand the Parts panel' }, cls: 'parts-folded', toward: 'left' });
  const folded = new Set();
  search.addEventListener('input', () => renderParts());

  function renderParts() {
    const q = search.value.trim().toLowerCase();
    const rows = [];
    for (const [title, types] of GROUPS) {
      const its = types.filter((t) => !q || `${t} ${PARTS[t].title} ${PARTS[t].chip || ''}`.toLowerCase().includes(q));
      if (!its.length) continue;
      const open = !folded.has(title) || q;
      rows.push(h('div', { class: `circ-lib-title${open ? ' open' : ''}`, onclick: () => { if (folded.has(title)) folded.delete(title); else folded.add(title); renderParts(); } },
        h('span', {}, title), h('span', { class: 'circ-lib-n', 'data-no-i18n': 'true' }, ` (${its.length})`)));
      if (!open) continue;
      for (const t of its) {
        rows.push(h('button', { type: 'button', class: `circ-lib-part${tool() === `place:${t}` ? ' active' : ''}`, 'data-part': t, 'data-group': title,
          title: `${PARTS[t].title}: click it, then the drawing (Esc: done)`, onclick: () => setTool(tool() === `place:${t}` ? 'select' : `place:${t}`) },
        preview(t), h('span', { class: 'nm' }, PARTS[t].chip ? `${t} ${PARTS[t].title}` : PARTS[t].title)));
      }
    }
    list.replaceChildren(...rows);
  }
  return { side, renderParts };
}
