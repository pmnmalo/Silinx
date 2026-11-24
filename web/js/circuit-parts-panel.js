// The circuit editor's Parts panel (#4062), on the left of the canvas as the schematic editor's Symbols: a search, the
// parts by category (each folded or open, remembered while it is open), each part a row with its drawing (the editor's
// own, circuit-draw.js, scaled down; an IC's, the schematic editor's symbol of what it is: a gate IC's gate, an MSI's
// block, as its Symbols panel draws them) and its name; a click on a part, then on the drawing, places it (Esc: done).
// Foldable to a strip (side-fold.js) and, on a narrow screen, over the canvas behind the toolbar's ☰ Parts.
import { h } from './ui.js';
import { sv } from './dom.js';
import { mountSideFold } from './side-fold.js';
import { PARTS, PART_ORDER, partDef, projectParts, kicadPartFunction } from '/core/circuit-parts.js';
import { searchCatalogue, catalogueTitle, catalogueDrawing, catalogueFunction, CATALOGUE_LIBRARIES } from '/core/kicad-catalogue.js';
import { functionPt, foldText } from '/core/part-function.js';
import { t as tr, getLanguage, onLanguageChange } from './i18n.js';
import { drawCircuit, drawnPartSvg } from './circuit-draw.js';
import { defaultParams, symbolDef } from '/core/schdoc.js';
import { symbolPreview } from './sch-palette.js';
import { getSymbolStandard } from './symbol-standard.js';
import { fitQualifier, iecQualifier, ieeeGate } from '/core/symbol-standard.js';
import { qualifierOf } from '/core/circuit-inside-blocks.js';
import { attachSymbolTip, hideSymbolTip, TIP_W, TIP_H } from './symbol-tip.js';
import { systemsOn } from '/core/build-channel.js';

const GROUPS = [['Breadboards', ['breadboard-half', 'breadboard-full']], ['Power', ['supply', 'pull-up', 'pull-down']],
  // (the boards, #5215: an Arduino, an FPGA board, with their real pins)
  ['Boards', PART_ORDER.filter((t) => PARTS[t].kind === 'board')],
  ['Inputs', ['logic-switch', 'button', 'spdt', 'dip-4', 'dip-8', 'keypad-4x4', 'rotary-encoder', 'clock', 'lm75', 'hc-sr04', 'hc-sr501']], ['Outputs', ['led', 'seg7-cc', 'seg7-ca', 'led-bar-10', 'buzzer', 'servo-sg90', 'lcd-1602', 'oled-ssd1306', 'probe']],
  ['Gates (74LS)', PART_ORDER.filter((t) => PARTS[t].gates && PARTS[t].family === 'ttl')], ['Gates (4000)', PART_ORDER.filter((t) => PARTS[t].gates && PARTS[t].family === 'cmos')],
  // (an IC written once in VHDL whose function is a decoder's, a multiplexer's…: an MSI IC, #4397)
  ['MSI (74LS, 4000)', PART_ORDER.filter((t) => PARTS[t].model || PARTS[t].msi)], ['Sequential (74LS, 4000)', PART_ORDER.filter((t) => (PARTS[t].seq || PARTS[t].core) && !PARTS[t].msi)]];
const W = 54, H = 34, MAX = 1.2;
const r2 = (v) => Math.round(v * 100) / 100;
// the schematic's symbol of an MSI or sequential IC (core/schdoc.js SYMBOLS)
const BLOCK = { 7447: 'decoder', 7448: 'decoder', 4511: 'decoder', 74138: 'decoder', 74139: 'decoder', 74151: 'mux8', 74153: 'mux4', 74157: 'mux2',
  7483: 'add', 74283: 'add', 7485: 'compare', 7474: 'fdcp', 7476: 'fjkcp', 74112: 'fjkcp', 7490: 'counter', 7493: 'counter', 74161: 'counter',
  74163: 'counter', 74191: 'counter', 74193: 'counter', 4017: 'counter', 74164: 'fdce', 74165: 'fdce', 74194: 'fdce', 74595: 'fdce',
  // (#4397's group C, #4498: the J-K and D flip-flops, the D registers)
  7473: 'fjkcp', 7478: 'fjkcp', 74107: 'fjkcp', 74109: 'fjkcp', 74113: 'fjkcp', 74114: 'fjkcp', 4027: 'fjkcp', 4013: 'fdcp',
  74173: 'fdce', 74174: 'fdce', 74175: 'fdce', 74273: 'fdce', 74374: 'fdce', 74377: 'fdce', 74378: 'fdce',
  74379: 'fdce', 74574: 'fdce',
  // (group D's counters, #4440)
  ...Object.fromEntries([74160, 74162, 74168, 74169, 74190, 74192, 74196, 74197, 74290, 74390, 74393, 7492, 74590, 4020, 4040, 4022, 4029, 4510, 4518, 4520].map((t) => [t, 'counter'])),
  // (group E's shift registers, #4397)
  ...Object.fromEntries([7491, 7495, 74166, 74195, 74295, 74594, 74596, 4021].map((t) => [t, 'fdce'])),
  // (group F's decoders and encoders, #4397)
  ...Object.fromEntries([7442, 74145, 74137, 74237, 74238, 74154, 74155, 74156, 7446, 7449].map((t) => [t, 'decoder'])), 74147: 'encoder', 74148: 'encoder',
  // (group F's multiplexers, ALU, carry generator, parity and comparator, #4397: the 74280's parity an XOR)
  74158: 'mux2', 74257: 'mux2', 74258: 'mux2', 74253: 'mux4', 74352: 'mux4', 74353: 'mux4', 74251: 'mux8', 74298: 'fdce', 74181: 'add', 74182: 'add',
  74280: 'xor4', 74688: 'compare',
  // (group F's register files and shift register, #4397; its addressable latches the panel's latch, as the 7475's)
  74670: 'fdce', 74170: 'fdce', 74395: 'fdce',
  // (group F's decoders read from their datasheets, #4397)
  4028: 'decoder', 74246: 'decoder', 74247: 'decoder', 74248: 'decoder', 4543: 'decoder', 74348: 'encoder' };
/** The schematic symbol of an IC: its gate's (and2…, nand4, inv), or its block's; null for another part. */
function symbolOfPart(type) {
  const d = partDef(type);
  if (d?.gates) {
    const { fn, ins } = d.gates[0];
    if (fn === 'not' || fn === 'buf') return fn === 'not' ? 'inv' : 'buf';
    if (fn === 'aoi') return null;   // (an AND-OR-INVERT, #4397: no symbol of the schematic's, its own: aoiPreview)
    return `${fn}${Math.min(ins.length, fn === 'and' || fn === 'or' ? 5 : 4)}`;
  }
  return BLOCK[d?.behaves ?? type] || null;   // (a project's KiCad part, #4281: the IC's it behaves as)
}
// the schematic's symbol, as its Symbols panel draws it (its texts and tips left out; in IEC, its qualifier kept: a
// gate's, or the MSI IC's, q, #4524)
function symbolPreviewOf(type, q, w = W, hh = H) {
  const sym = { id: 'pv', type, x: 0, y: 0, rot: 0, mirror: false, name: '', params: defaultParams(type) };
  const s = symbolPreview(sym, symbolDef(sym, {}), { W: w, H: hh, cls: 'circ-pv circ-pv-sym', qualifier: q, zoom: w > W ? 2 : 1 });
  for (const x of s.querySelectorAll('text:not(.pv-q), title')) x.remove();
  return s;
}
// a latch (#4505): no symbol of the schematic's, its own (latchPreview)
const isLatch = (d) => d?.kind === 'ic' && !d.gates && /latch/i.test(d.title);
/** An IC's tip's facts (#4524): { fn (its gates' function), qualifier (an MSI IC's IEC general qualifier: CTR, MUX…, by
 *  its title or, a project's KiCad part, the IC's it behaves as) }. */
function partInfo(type) {
  const d = partDef(type);
  if (d?.gates) return { fn: d.gates[0].fn };
  const title = d?.behaves && partDef(d.behaves) ? partDef(d.behaves).title : d?.title;
  return { fn: null, qualifier: (BLOCK[d?.behaves ?? type] || isLatch(d)) && title ? qualifierOf(title) || null : null };
}

// a part's drawing, small (an IC's symbol in Settings ▸ Schematic Symbols' standard, kept for each standard: the editor
// draws the panel again when it changes, #4242)
const previews = new Map();
function preview(type) {
  const d = partDef(type);
  // (a project's KiCad part, #4281: by what it is, its file read again may change it)
  const id = d?.kicad ? `${type}:${d.behaves ?? d.kind}:${d.pins.length}` : type;
  const key = symbolOfPart(type) ? `${getSymbolStandard()}:${id}` : id;
  if (previews.has(key)) return previews.get(key).cloneNode(true);
  if (symbolOfPart(type)) { previews.set(key, symbolPreviewOf(symbolOfPart(type), partInfo(type).qualifier)); return previews.get(key).cloneNode(true); }
  // (a latch, #4505: no symbol of the schematic's, a level-enabled storage box)
  if (!symbolOfPart(type) && isLatch(d)) {
    const k = `${getSymbolStandard()}:latch`;
    if (!previews.has(k)) previews.set(k, latchPreview(getSymbolStandard() === 'iec' ? partInfo(type).qualifier : null));
    return previews.get(k).cloneNode(true);
  }
  if (d?.gates?.[0].fn === 'aoi') {
    const k = `${getSymbolStandard()}:aoi:${d.gates[0].terms.join(',')}`;
    if (!previews.has(k)) previews.set(k, aoiPreview(d.gates[0].terms));
    return previews.get(k).cloneNode(true);
  }
  return fitted(drawCircuit({ parts: [{ id: 'X', type, x: 0, y: 0 }], wires: [] }), key);
}
// an AND-OR-INVERT's symbol (#4498), as the schematic's gates in the Symbols panel: its terms' ANDs (their inputs `terms`)
// into a NOR, in Settings ▸ Schematic Symbols' standard (IEEE's shapes, IEC's boxes with their qualifiers, & and ≥1, as
// the other gates', #4524)
function aoiPreview(terms) {
  const iec = getSymbolStandard() === 'iec', k = terms.length, step = 30 / k, hh = Math.min(10, step - 1.5);
  const s = sv('svg', { class: 'circ-pv circ-pv-sym circ-pv-aoi', viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  const ln = (pts) => s.append(sv('polyline', { points: pts.map((q) => q.map(r2).join(',')).join(' '), class: 'pin' }));
  const gate = (fn, box) => {
    if (iec) {
      s.append(sv('rect', { x: box.x, y: r2(box.y), width: box.w, height: r2(box.h), class: 'gate', 'data-fn': fn }));
      const f = fitQualifier(iecQualifier(fn), box, { min: 4 });
      s.append(sv('text', { x: r2(f.x), y: r2(f.y), 'font-size': f.size, 'text-anchor': 'middle', class: 'pv-q', 'data-no-i18n': 'true' }, iecQualifier(fn)));
      return;
    }
    for (const d of ieeeGate(fn, box).paths) s.append(sv('path', { d, class: 'gate', 'data-fn': fn }));
  };
  const nor = { x: 28, y: 10, w: 10, h: 14 };
  terms.forEach((n, i) => {
    const cy = H / 2 + (i - (k - 1) / 2) * step, box = { x: 12, y: cy - hh / 2, w: 10, h: hh };
    for (let j = 0; j < Math.min(n, 4); j++) { const y = box.y + ((j + 1) * hh) / (Math.min(n, 4) + 1); ln([[6, y], [12, y]]); }
    gate('and', box);
    const sy = nor.y + ((i + 1) * nor.h) / (k + 1);
    ln([[22, cy], [25, cy], [25, sy], [nor.x, sy]]);
  });
  gate('nor', nor);
  s.append(sv('circle', { cx: 40, cy: H / 2, r: 2, class: 'gate' }));
  ln([[42, H / 2], [49, H / 2]]);
  return s;
}

// a latch's symbol (#4505), as the schematic's storage blocks in the Symbols panel: a box, its data and enable inputs on its
// left (the enable without a clock's ▷: level-sensitive), its outputs on its right (the same in both standards; in IEC,
// its general qualifier q in it, #4524)
function latchPreview(q = null) {
  const s = sv('svg', { class: 'circ-pv circ-pv-sym circ-pv-latch', viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  s.append(sv('rect', { x: 17, y: 4, width: 20, height: 26, class: 'box' }));
  if (q) { const f = fitQualifier(q, { x: 17, y: 4, w: 20, h: 26 }); s.append(sv('text', { x: r2(f.x), y: r2(f.y), 'font-size': f.size, 'text-anchor': 'middle', class: 'pv-q', 'data-no-i18n': 'true' }, q)); }
  for (const [x1, x2, y] of [[10, 17, 11], [10, 17, 23], [37, 44, 11], [37, 44, 23]]) s.append(sv('line', { x1, y1: y, x2, y2: y, class: 'pin' }));
  return s;
}

// a part's drawing fitted to a preview, kept by key
function fitted(g, key) {
  // (its name and tips left out, the row's name says it; its marks kept: the supply's +5V and GND, a pull's arrow; its
  // print left out, too small there: a DIP switch's numbers and ON, a module's, the servo's, #5367)
  for (const x of g.querySelectorAll('text.circ-label, text.circ-ic-text, text.circ-dip-num, text.circ-dip-on, text.circ-silk, text.circ-servo-text, text.circ-key-text, text.circ-keypad-pin, text.circ-enc-pin, .circ-enc-turn, text.circ-buzz-plus, text.circ-sonar-tx, text.circ-sonar-name, text.circ-sonar-pin, text.circ-pir-pin, .circ-sonar-btn, text.circ-sonar-cm, title')) x.remove();   // (a KiCad part's id and number too, #4281)
  // (fitted to its drawing's box, measured off the page once: its body as drawn, not its pins', #4124; a small part not
  // magnified past MAX)
  const m = sv('svg', { width: 0, height: 0, style: 'position:absolute;visibility:hidden' }, g);
  document.body.append(m);
  const b = g.getBBox();
  m.remove();
  const k = Math.min((W - 6) / (b.width || 1), (H - 6) / (b.height || 1), MAX);
  g.setAttribute('transform', `translate(${r2((W - b.width * k) / 2 - b.x * k)},${r2((H - b.height * k) / 2 - b.y * k)}) scale(${r2(k * 100) / 100})`);
  const s = sv('svg', { class: 'circ-pv', viewBox: `0 0 ${W} ${H}`, width: W, height: H }, g);
  previews.set(key, s);
  return s.cloneNode(true);
}

// a KiCad catalogue's part's preview (#4346): its IC's, or drawn as it will be once imported (its footprint's drawing
// kept in the catalogue, a DIP's body), else a box
function cataloguePreview(e) {
  if (e.as && partDef(e.as).kind === 'ic') return preview(e.as);
  const key = `catalogue:${e.id}`;
  if (previews.has(key)) return previews.get(key).cloneNode(true);
  const d = catalogueDrawing(e);
  return d ? fitted(drawnPartSvg(d), key) : sv('svg', { class: 'circ-pv', viewBox: `0 0 ${W} ${H}`, width: W, height: H }, sv('rect', { x: 8, y: 9, width: W - 16, height: H - 18, rx: 2, class: 'circ-pv-cat' }));
}

// a function in the interface's language (#4495): Silinx's title as the interface translates it, KiCad's function in
// Portuguese by its vocabulary or, with none, in English (its element says so: lang="en")
function functionText(f) {
  if (getLanguage() !== 'pt' || !f.text) return { text: f.text, en: false };
  if (f.silinx) return { text: tr(f.text), en: false };
  return f.pt ? { text: f.pt, en: false } : { text: f.text, en: true };
}
const functionTextOf = (f) => `${f.text} ${functionText(f).text}`;
// a part's number in bold, what it is after it (on a second line when the panel is narrow)
const numbered = (value, f) => {
  const x = functionText(f);
  return h('span', { class: 'nm fn2', 'data-no-i18n': 'true' }, h('b', {}, value), ...(x.text ? [' ', h('span', { class: 'fn', ...(x.en ? { lang: 'en' } : {}) }, x.text)] : []));
};
// a project's KiCad part's function (#4495), its Portuguese
const kicadFunction = (d) => { const f = kicadPartFunction(d); return { ...f, pt: f.silinx ? null : functionPt(f.text) }; };

// a row's name and tip: a library part's, or a project's KiCad part's (its part number and what it does, #4281)
function rowOf(t) {
  const d = partDef(t), k = d.kicad;
  if (!k) return { name: d.chip ? `${t} ${d.title}` : d.title, tip: `${d.title}: click it, then the drawing (Esc: done)`, noI18n: false };
  return { name: numbered(k.value, kicadFunction(d)), noI18n: true,
    // (an LED, a switch, a button of the library's, #4349: its title)
    tip: d.behaves ? `${k.value}, as the ${d.kind === 'ic' ? d.behaves : `${PARTS[d.behaves].title} of the library`}: click it, then the drawing (Esc: done)` : d.kind === 'model' ? `${k.value}, by its module ${d.module}: click it, then the drawing (Esc: done)`
      : `${k.value}, drawn only (not simulated): click it, then the drawing (Esc: done)` };
}

// a row given its tip's card (#4524)
// (an IC drawn as a schematic's symbol: drawn again larger, its qualifier then legible; another part's thumbnail enlarged)
const tipped = (row, type, info) => {
  attachSymbolTip(row, '.circuit-editor', info, type && symbolOfPart(type) ? () => symbolPreviewOf(symbolOfPart(type), partInfo(type).qualifier, TIP_W, TIP_H) : null);
  return row;
};

/** { side, renderParts } of mountCircuitEditor (tool(): its current tool; setTool(t); importKicad(): Import KiCad Part…,
 *  browseKicad(): Browse KiCad Libraries…, importCatalogue(id): a catalogue's part imported, its type; none in a
 *  read-only editor). */
export function mountCircuitParts({ root, tool, setTool, importKicad = null, browseKicad = null, importCatalogue = null }) {
  const search = h('input', { type: 'search', class: 'circ-search', placeholder: 'Search parts…', spellcheck: 'false' });
  const list = h('div', { class: 'circ-lib' });
  // (a project's KiCad parts, #4281: its parts/ folder's libraries)
  const imp = importKicad && h('button', { type: 'button', class: 'circ-import-kicad', title: 'Import a KiCad symbol library or footprint into the project\'s parts/ folder', onclick: () => importKicad() }, 'Import KiCad Part…');
  // (KiCad's libraries fetched by the local server, #4285: not in the browser's edition alone)
  const browse = browseKicad && h('button', { type: 'button', class: 'circ-browse-kicad', title: 'Browse KiCad\'s own symbol libraries and the KiCad PCM\'s library packages', onclick: () => browseKicad() }, 'Browse KiCad Libraries…');
  // (both KiCad's actions in the KiCad catalogue's section, under its heading, folded or not, #4534: the search alone above)
  const kicadTools = (imp || browse) && h('div', { class: 'circ-cat-tools' }, imp || null, browse || null);
  const side = h('aside', { class: 'circ-parts-side' }, h('div', { class: 'asm-cap' }, 'Parts'), h('div', { class: 'circ-lefttools' }, search), list);
  mountSideFold({ root, side, key: 'silinx.circuit.parts.folded', titles: { fold: 'Collapse the Parts panel', unfold: 'Expand the Parts panel' }, cls: 'parts-folded', toward: 'left' });
  const CAT = 'KiCad catalogue';
  const folded = new Set([CAT]);   // (the catalogue folded at first: its parts found by a search, or opened, #4305)
  search.addEventListener('input', () => renderParts());
  // (the functions in the interface's language, #4495)
  const off = onLanguageChange(() => { if (!root.isConnected) off(); else renderParts(); });

  function renderParts() {
    const q = foldText(search.value.trim());
    const rows = [];
    hideSymbolTip();
    const mine = projectParts().map((d) => d.type);
    for (const [title, types] of [...GROUPS, ...(mine.length ? [['KiCad parts (project)', mine]] : [])]) {
      // (the boards, #5215: the Systems', not in a release yet, #5202)
      const its = types.filter((t) => partDef(t).kind !== 'board' || systemsOn()).filter((t) => !q || foldText(`${t} ${partDef(t).title} ${tr(partDef(t).title)} ${partDef(t).chip || ''} ${partDef(t).kicad?.value || ''} ${partDef(t).kicad?.description || ''} ${partDef(t).kicad ? functionTextOf(kicadFunction(partDef(t))) : ''}`).includes(q));
      if (!its.length) continue;
      const open = !folded.has(title) || q;
      rows.push(h('div', { class: `circ-lib-title${open ? ' open' : ''}`, onclick: () => { if (folded.has(title)) folded.delete(title); else folded.add(title); renderParts(); } },
        h('span', {}, title), h('span', { class: 'circ-lib-n', 'data-no-i18n': 'true' }, ` (${its.length})`)));
      if (!open) continue;
      for (const t of its) {
        const r = rowOf(t);
        // (its tip a card: its drawing larger, what it does, how it is drawn, #4524)
        rows.push(tipped(h('button', { type: 'button', class: `circ-lib-part${tool() === `place:${t}` ? ' active' : ''}${partDef(t).kind === 'drawn' ? ' drawn' : ''}`, 'data-part': t, 'data-group': title,
          title: r.tip, onclick: () => setTool(tool() === `place:${t}` ? 'select' : `place:${t}`) },
        preview(t), typeof r.name === 'string' ? h('span', { class: 'nm', ...(r.noI18n ? { 'data-no-i18n': 'true' } : {}) }, r.name) : r.name), t, () => partInfo(t)));
      }
    }
    // the KiCad catalogue's parts (#4305): a click imports one into the project, then places it
    // (found by the function in the interface's language too: Silinx's titles as it translates them)
    const cat = importCatalogue ? searchCatalogue(q, undefined, { more: (e) => { const f = catalogueFunction(e); return f.silinx ? tr(f.text) : null; } }) : [];
    if (cat.length || kicadTools) {
      const open = !folded.has(CAT) || q;
      rows.push(h('div', { class: `circ-lib-title${open ? ' open' : ''}`, onclick: () => { if (folded.has(CAT)) folded.delete(CAT); else folded.add(CAT); renderParts(); } },
        h('span', {}, CAT), h('span', { class: 'circ-lib-n', 'data-no-i18n': 'true' }, ` (${cat.length})`)));
      if (kicadTools) rows.push(kicadTools);
      if (open) for (const e of cat) {
        rows.push(tipped(h('button', { type: 'button', class: `circ-lib-part circ-cat-part${e.as ? '' : ' drawn'}`, 'data-catalogue': e.id, 'data-group': CAT,
          title: `${catalogueTitle(e)} (${CATALOGUE_LIBRARIES[e.library].name}, ${CATALOGUE_LIBRARIES[e.library].licence}): click it to import it into the project`,
          onclick: async () => { const type = await importCatalogue(e.id); if (type && partDef(type)) setTool(`place:${type}`); renderParts(); } },
        cataloguePreview(e), numbered(e.value, catalogueFunction(e))), e.as && partDef(e.as)?.kind === 'ic' ? e.as : null, () => (e.as && partDef(e.as)?.kind === 'ic' ? partInfo(e.as) : {})));
      }
    }
    list.replaceChildren(...rows);
  }
  return { side, renderParts };
}
