// Silinx - Board Emulator: the modules on a board's Pmods (#5641), drawn beside the board as the drawings' rule asks
// (docs/UI-GUIDELINES.md, "A board drawn"): what the board lacks and the design needs (the examples' 4-digit display,
// their LEDs, switches and buttons past the board's own) on the Pmods its constraints put them on, as the board's data
// makes them (core/emulate-headers.js withHeaderModules: pmod_led, pmod_sw, pmod_btn, seg / dp / an). On a breadboard
// under the board, each module named with its Pmods, its parts the emulator's; shown or hidden as a module (#2522). The
// Zybo Z7's and the Arty Z7's (emulator-zybo-z7.js, emulator-arty-z7.js); a VGA on the Pmods is the emulator's monitor.
import { ledNumbers } from '/core/emulate.js';
import { svgText as text } from './emulator-pcb.js';

const ROOM = 186, BREADBOARD = '#ebe6d6', INK = '#55503f';
const resOf = (board, name) => board.resources.find((r) => r.name === name && r.extra?.module);
const onOf = (b) => (b.on || b.r.extra.on || []).join(', ');
// each module's width and its parts' pitch
const DIG = 56, LED = 34, SW = 46, BTN = 52, PAD = 22, GAP = 26;

/** Where the modules go under a board W wide, its PCB H high: { room (0: none), blocks: [{ kind, r, x, w }] }. */
export function pmodBlocks(board, W, H) {
  const an = resOf(board, 'an'), seg = resOf(board, 'seg');
  const list = [
    // (the display on its segments', decimal point's and anodes' Pmods)
    an && seg ? { kind: 'display', r: an, n: an.pins.length, pitch: DIG, on: [...new Set([seg, resOf(board, 'dp'), an].filter(Boolean).flatMap((r) => r.extra.on || []))] } : null,
    ...[['led', 'pmod_led', LED], ['sw', 'pmod_sw', SW], ['btn', 'pmod_btn', BTN]].map(([kind, name, pitch]) => {
      const r = resOf(board, name);
      return r ? { kind, r, n: r.pins.length, pitch } : null;
    }),
  ].filter(Boolean);
  let x = 20;
  const blocks = list.map((b) => { const w = 2 * PAD + b.n * b.pitch, out = { ...b, x, w }; x += w + GAP; return out; });
  return { room: blocks.length ? ROOM : 0, blocks, W, y0: H + 10 };
}

/** The modules' art (the breadboard and each module's name), for the board's <svg>. */
export function pmodArt({ room, blocks, W, y0 }) {
  if (!room) return '';
  const name = { display: '4-DIGIT DISPLAY', led: 'LEDS', sw: 'SWITCHES', btn: 'BUTTONS' };
  return `<g data-module="io"><rect x="8" y="${y0}" width="${W - 16}" height="${room - 18}" rx="6" fill="${BREADBOARD}" stroke="#b7ae94" stroke-width="2"/>
    ${blocks.map((b) => pmodBlockArt(b, y0, name[b.kind])).join('')}</g>`;
}
// a module: its outline, its name and the Pmods it is on
const pmodBlockArt = (b, y0, title) => `<rect x="${b.x}" y="${y0 + 10}" width="${b.w}" height="${ROOM - 38}" rx="4" fill="none" stroke="#b7ae94" stroke-dasharray="4 3"/>`
  + text(b.x + 8, y0 + 26, `${title} (${onOf(b)})`, { size: 8, anchor: 'start', fill: INK })
  + (b.kind === 'display' ? `<rect x="${b.x + PAD - 8}" y="${y0 + 40}" width="${b.n * DIG + 16}" height="74" rx="3" fill="#0b0b0b" stroke="#2a2a2a"/>` : '');

/** The modules' parts put under the board: the display's digits, the LEDs, switches and buttons (the board's
 *  emulator widgets), named LD4… / SW4… / BTN4… from the port's lowest bit on them, the design's ports under them. */
export function putPmods({ room, blocks, y0 }, { board, h, put, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, silk, swCls, btnCls }) {
  if (!room) return;
  const at = (w, part) => { w.dataset.part = part; w.dataset.module = 'io'; return w; };
  const label = (t, x, y) => { const w = put(h('span', { class: `emu-silk ${silk} emu-pmod-silk` }, t), x, y); w.dataset.module = 'io'; };
  const port = (res, k, x, y) => { const w = put(h('span', { class: `emu-port emu-pmod-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y); w.dataset.module = 'io'; };
  const leds = ledNumbers(board);
  for (const b of blocks) {
    const first = b.r.extra.first ?? 0;
    // (the highest on the left, as on the boards)
    for (let i = 0; i < b.n; i++) {
      const k = b.n - 1 - i, x = b.x + PAD + b.pitch * (i + 0.5), n = first + k, res = b.r.name;
      if (b.kind === 'display') { at(put(mkDigit(k), x, y0 + 46), `an${k}`); label(`AN${k}`, x, y0 + 120); port('an', k, x, y0 + 131); }
      else if (b.kind === 'led') { at(put(mkLed(leds[res] + k, 'emu-led emu-pmod-led'), x, y0 + 72), `ld${n}`); label(`LD${n}`, x, y0 + 98); port(res, k, x, y0 + 109); }
      else if (b.kind === 'sw') { at(put(mkSwitch(k, swCls, res), x, y0 + 48), `sw${n}`); label(`SW${n}`, x, y0 + 120); port(res, k, x, y0 + 131); }
      else { at(put(mkButton(k, btnCls, res), x, y0 + 62), `btn${n}`); label(`BTN${n}`, x, y0 + 104); port(res, k, x, y0 + 115); }
    }
  }
}
// the modules' parts' look: the bigger LEDs of a breadboard, the names dark on it
export const PMOD_CSS = `
.emu-pmod-led { width: 14px; height: 18px; border-radius: 7px 7px 2px 2px; }
.emu-silk.emu-pmod-silk { color: #3a3628; }
.emu-port.emu-pmod-port { color: #8a5a00; }
.emu-port.emu-pmod-port.nc { color: #6a78a8; }
`;
