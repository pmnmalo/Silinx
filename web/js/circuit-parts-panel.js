// The circuit editor's Parts panel (#4062), on the left of the canvas as the schematic editor's Symbols: a search, the
// parts by category (each folded or open, remembered while it is open), each part a row with its drawing (the editor's
// own, circuit-draw.js, scaled down; an IC's, the schematic editor's symbol of what it is: a gate IC's gate, an MSI's
// block, as its Symbols panel draws them) and its name; a click on a part, then on the drawing, places it (Esc: done).
// Foldable to a strip (side-fold.js) and, on a narrow screen, over the canvas behind the toolbar's ☰ Parts.
import { h } from './ui.js';
import { sv } from './dom.js';
import { mountSideFold } from './side-fold.js';
import { PARTS, PART_ORDER } from '/core/circuit-parts.js';
import { drawCircuit } from './circuit-draw.js';
import { defaultParams, symbolDef } from '/core/schdoc.js';
import { symbolPreview } from './sch-palette.js';

const GROUPS = [['Breadboards', ['breadboard-half', 'breadboard-full']], ['Power', ['supply', 'pull-up', 'pull-down']],
  ['Inputs', ['logic-switch', 'button', 'spdt', 'dip-4', 'dip-8', 'clock']], ['Outputs', ['led', 'seg7-cc', 'seg7-ca', 'led-bar-10', 'probe']],
  ['Gates (74LS)', PART_ORDER.filter((t) => PARTS[t].gates && PARTS[t].family === 'ttl')], ['Gates (4000)', PART_ORDER.filter((t) => PARTS[t].gates && PARTS[t].family === 'cmos')],
  ['MSI (74LS)', PART_ORDER.filter((t) => PARTS[t].model)], ['Sequential (74LS, 4000)', PART_ORDER.filter((t) => PARTS[t].seq)]];
const W = 54, H = 34, MAX = 1.2;
const r2 = (v) => Math.round(v * 100) / 100;
// the schematic's symbol of an MSI or sequential IC (core/schdoc.js SYMBOLS)
const BLOCK = { 7447: 'decoder', 7448: 'decoder', 4511: 'decoder', 74138: 'decoder', 74139: 'decoder', 74151: 'mux8', 74153: 'mux4', 74157: 'mux2',
  7483: 'add', 74283: 'add', 7485: 'compare', 7474: 'fdcp', 7476: 'fjkcp', 74112: 'fjkcp', 7490: 'counter', 7493: 'counter', 74161: 'counter',
  74163: 'counter', 74191: 'counter', 74193: 'counter', 4017: 'counter', 74164: 'register', 74165: 'register', 74194: 'register', 74595: 'register' };
/** The schematic symbol of an IC: its gate's (and2…, nand4, inv), or its block's; null for another part. */
function symbolOfPart(type) {
  const d = PARTS[type];
  if (d?.gates) {
    const { fn, ins } = d.gates[0];
    if (fn === 'not' || fn === 'buf') return fn === 'not' ? 'inv' : 'buf';
    return `${fn}${Math.min(ins.length, fn === 'and' || fn === 'or' ? 5 : 4)}`;
  }
  return BLOCK[type] || null;
}
// the schematic's symbol, as its Symbols panel draws it (its texts and tips left out)
function symbolPreviewOf(type) {
  const sym = { id: 'pv', type, x: 0, y: 0, rot: 0, mirror: false, name: '', params: defaultParams(type) };
  const s = symbolPreview(sym, symbolDef(sym, {}), { W, H, cls: 'circ-pv circ-pv-sym' });
  for (const x of s.querySelectorAll('text, title')) x.remove();
  return s;
}

// a part's drawing, small
const previews = new Map();
function preview(type) {
  if (previews.has(type)) return previews.get(type).cloneNode(true);
  if (symbolOfPart(type)) { previews.set(type, symbolPreviewOf(symbolOfPart(type))); return previews.get(type).cloneNode(true); }
  const g = drawCircuit({ parts: [{ id: 'X', type, x: 0, y: 0 }], wires: [] });
  // (its name and tips left out, the row's name says it; its marks kept: the supply's +5V and GND, a pull's arrow)
  for (const x of g.querySelectorAll('text.circ-label, title')) x.remove();
  // (fitted to its drawing's box, measured off the page once: its body as drawn, not its pins', #4124; a small part not
  // magnified past MAX)
  const m = sv('svg', { width: 0, height: 0, style: 'position:absolute;visibility:hidden' }, g);
  document.body.append(m);
  const b = g.getBBox();
  m.remove();
  const k = Math.min((W - 6) / (b.width || 1), (H - 6) / (b.height || 1), MAX);
  g.setAttribute('transform', `translate(${r2((W - b.width * k) / 2 - b.x * k)},${r2((H - b.height * k) / 2 - b.y * k)}) scale(${r2(k * 100) / 100})`);
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
