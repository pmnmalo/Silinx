// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The System editor's Wiring view (#5216, web/js/system-editor.js, docs/SYSTEMS.md): each link drawn pin by pin, a band
// each, its two nodes facing each other (link.a's on the left), a row per wire (core/system-check.js analyzeSystem's
// wires: its signal, the pin at each end, an FPGA's package pin and what its board says the pin is, the levels), its
// arrow towards the input; a wire whose levels the check warned of (a 5 V output on a 3.3 V input) drawn hot, its
// warning its tip. Read only: a click on a wire selects its link (the side panel's); the links are edited in the System view.
import { sv } from './dom.js';
import { t } from './i18n.js';

/** The bands' geometry: a node's box's width, the gap between the boxes, a wire row's height, a band's head. */
const WIRE_BOX = 210, WIRE_GAP = 220, WIRE_ROW = 26, WIRE_HEAD = 34;
const KIND = { uart: 'UART', gpio: 'GPIO', spi: 'SPI', i2c: 'I²C' };
const volts = e => (e.volts != null ? `${e.volts} V` : '');
// an end's label at its node: its pin, an FPGA's package pin after it
const pinText = e => (e.loc ? `${e.pin} · ${e.loc}` : e.pin);
// an end's tip: what the pin is on its board, its I/O standard
const pinTip = e => [e.place, e.std].filter(Boolean).join(' · ');

/** The wiring drawn into `world` (cleared first): `M` the System, `wires` its check's, `sel` the selection; its counts. */
export function drawWiring(world, { M, wires, sel }) {
  // (the arrows' heads: a plain wire's, a hot one's)
  const head = (id, cls) => sv('marker', { id, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' },
    sv('path', { d: 'M0,0 L8,4 L0,8 z', class: cls }));
  world.replaceChildren(sv('defs', {}, head('sys-wire-arrow', 'sys-wire-head'), head('sys-wire-arrow-hot', 'sys-wire-head hot')));
  const xL = 0, xR = WIRE_BOX + WIRE_GAP;
  let y = 0, shown = 0;
  for (const l of M.links) {
    const ws = wires.filter(w => w.link === l.id);
    if (!ws.length) continue;
    const a = l.a.split('.')[0], b = l.b.split('.')[0];
    const na = M.nodes.find(n => n.id === a), nb = M.nodes.find(n => n.id === b);
    const isSel = sel?.kind === 'link' && sel.id === l.id;
    const h = WIRE_HEAD + ws.length * WIRE_ROW + 8;
    const g = sv('g', { class: `sys-wiring ${l.kind}${isSel ? ' sel' : ''}`, 'data-kind': 'link', 'data-id': l.id });
    g.append(sv('text', { x: xL, y: y + 12, class: 'sys-wiring-name' }, `${l.id} · ${KIND[l.kind] || l.kind}`));
    for (const [n, x, id] of [[na, xL, a], [nb, xR, b]]) {
      g.append(sv('rect', { x, y: y + 18, width: WIRE_BOX, height: h - 18, rx: 6, class: `sys-box sys-wiring-box ${n?.kind || ''}` }),
        sv('text', { x: x + 10, y: y + 32, class: 'sys-id' }, id));
    }
    ws.forEach((w, i) => {
      const yy = y + WIRE_HEAD + i * WIRE_ROW + WIRE_ROW / 2 + 4;
      // (each end at its node's box: the wire's driver may be either)
      const [left, right] = w.from.node === a ? [w.from, w.to] : [w.to, w.from];
      const toRight = w.from.node === a;
      const hot = w.warnings.length > 0;
      const row = sv('g', { class: `sys-wire-row${hot ? ' hot' : ''}`, 'data-signal': w.signal });
      if (hot) row.append(sv('title', {}, w.warnings.join('\n')));
      const end = (e, x, anchor) => {
        const tip = pinTip(e);
        const txt = sv('text', { x, y: yy + 4, 'text-anchor': anchor, class: 'sys-wire-pin' }, pinText(e));
        if (tip) txt.append(sv('title', {}, tip));
        return txt;
      };
      row.append(end(left, xL + WIRE_BOX - 12, 'end'), sv('text', { x: xL + 10, y: yy + 4, class: 'sys-wire-volts' }, volts(left)),
        end(right, xR + 12, 'start'), sv('text', { x: xR + WIRE_BOX - 10, y: yy + 4, 'text-anchor': 'end', class: 'sys-wire-volts' }, volts(right)),
        sv('line', { x1: xL + WIRE_BOX, y1: yy, x2: xR, y2: yy, class: 'sys-wire-line', [toRight ? 'marker-end' : 'marker-start']: `url(#sys-wire-arrow${hot ? '-hot' : ''})` }),
        sv('circle', { cx: xL + WIRE_BOX, cy: yy, r: 3.5, class: 'sys-wire-dot' }), sv('circle', { cx: xR, cy: yy, r: 3.5, class: 'sys-wire-dot' }),
        sv('text', { x: xL + WIRE_BOX + WIRE_GAP / 2, y: yy - 5, 'text-anchor': 'middle', class: 'sys-wire-signal' }, w.signal));
      g.append(row);
    });
    world.append(g);
    y += h + 30;
    shown++;
  }
  if (!shown) world.append(sv('text', { x: 0, y: 20, class: 'sys-none' }, t('No wires: no link joins two resolved interfaces')));
  return { wires: wires.length, links: shown };
}
