// Silinx - the System Emulator's ESP32 DevKitC (#5495): Espressif's ESP32-DevKitC V4 drawn as it is (#5636), seen from
// above, its antenna on the left: its black PCB, its ESP32-WROOM-32 module (its shield, its antenna's trace), its
// micro-USB socket, its EN and BOOT buttons, its USB-UART chip and regulator, its red power LED, and its two headers,
// J3 along the top edge and J2 along the bottom, 1 inch apart, each pin's silkscreen name beside it (VP, VN, TX, RX, 23…)
// and its level shown (lit high, dark low, hollow floating). It has no LED of its program's. Its headers are where the
// circuit's part has its pins (core/circuit-boards.js: BOARD_ART, its J2 and J3), and its drawing (esp32Art) is the
// circuit editor's too.
import { boardFrame, svgText, ic } from './emulator-pcb.js';
import { ledLook } from './emulator-paint.js';
import { BOARD_ART, BOARD_PARTS } from '/core/circuit-boards.js';

const C = { pcb: '#1c1c1e', edge: '#050505', metal: '#c3c7cb', metalEdge: '#8a8f94', black: '#0d0d0d', silk: '#f2f2f2', gold: '#c9a54a', module: '#23272e' };
// each pin's silkscreen name, the board's own (a GPIO's number; the flash's D0…D3, CMD, CLK; VP, VN, TX, RX)
const SILK = { GPIO36: 'VP', GPIO39: 'VN', GPIO1: 'TX', GPIO3: 'RX', SD0: 'D0', SD1: 'D1', SD2: 'D2', SD3: 'D3' };
const silkOf = name => SILK[name] ?? name.replace(/^GPIO/, '');

/** The board's drawing: { art (an SVG's body), W, H, at(pin) its place, on its power LED's place }. */
export function esp32Art() {
  const a = BOARD_ART['esp32-devkitc'], part = BOARD_PARTS.find(p => p.type === 'esp32-devkitc');
  const W = a.w, H = a.h, xy = (dx, dy) => ({ x: a.pin1[0] + dx * a.pitch, y: a.pin1[1] + dy * a.pitch });
  const at = (name) => { const q = part.pins.find(p => p.name === name); return xy(q.dx, q.dy); };
  // the headers: a black strip each, its pins' square pads; each name turned along the board, toward its middle
  const strips = [0, -10].map(dy => { const s = xy(0, dy); return `<rect x="${s.x - 11}" y="${s.y - 11}" width="${19 * a.pitch - 2}" height="22" rx="2" fill="${C.black}"/>`; }).join('');
  const pads = part.pins.map(q => { const { x, y } = xy(q.dx, q.dy); return `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" fill="${C.metalEdge}"/>`; }).join('');
  const labels = part.pins.map(q => {
    const { x, y } = xy(q.dx, q.dy), top = q.dy < 0;
    return svgText(x + 3, top ? y + 16 : y - 16, silkOf(q.name), { size: 8, fill: C.silk, anchor: top ? 'end' : 'start', rotate: true });
  }).join('');
  // the module: its antenna's end on the PCB's edge (its trace, a meander), its shield with its marking
  const ant = Array.from({ length: 6 }, (_, i) => `${i ? 'L' : 'M'}${12 + i * 7} ${i % 2 ? 196 : 68}L${12 + i * 7} ${i % 2 ? 68 : 196}`).join('');
  const module = `<rect x="2" y="47" width="241" height="170" rx="3" fill="${C.module}"/><path d="${ant}" fill="none" stroke="${C.gold}" stroke-width="3"/>`
    + `<rect x="62" y="54" width="175" height="156" rx="4" fill="${C.metal}" stroke="${C.metalEdge}" stroke-width="2"/>`
    + svgText(150, 120, 'ESP32-WROOM-32', { size: 15, fill: '#3a3d40' }) + svgText(150, 142, 'ESPRESSIF', { size: 10, fill: '#3a3d40', weight: 'normal' });
  const on = { x: 404, y: 150 };
  const art = `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="6" fill="${C.pcb}" stroke="${C.edge}" stroke-width="2"/>`
    + module + strips + pads
    // its micro-USB socket on the right edge, its EN and BOOT buttons by it, its USB-UART chip and its regulator
    + `<rect x="456" y="100" width="58" height="64" rx="3" fill="${C.metal}" stroke="${C.metalEdge}"/>`
    + [[418, 58, 'EN'], [418, 184, 'BOOT']].map(([x, y, t]) => `<rect x="${x}" y="${y}" width="34" height="26" rx="2" fill="${C.metal}"/><circle cx="${x + 17}" cy="${y + 13}" r="7" fill="#2a2a2a"/>`
      + svgText(x + 17, y < 100 ? y + 38 : y - 5, t, { size: 8, fill: C.silk })).join('')
    + ic(318, 106, 48, 48, ['CP2102'], 7) + ic(268, 58, 40, 30, ['LDO'], 7)
    + svgText(330, 202, 'ESP32-DevKitC V4', { size: 11, fill: C.silk })
    + svgText(on.x, on.y + 22, 'ON', { size: 8, fill: C.silk })
    + labels;
  return { art, W, H, at, on };
}

/** The board drawn: { wrap, paint(shown) } (shown: core/system-emu.js boardStates' { pins } of the board). */
export function esp32Layout({ h, board, title }) {
  const { art, W, H, at, on } = esp32Art();
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote: `${board.mcu}, MicroPython (behavioural)` });
  const dots = new Map();
  for (const p of board.pins) {
    const { x, y } = at(p);
    const dot = h('div', { class: 'sys-pin', 'data-pin': p, title: p });
    dots.set(p, dot);
    put(dot, x, y - 6);
  }
  const power = h('div', { class: 'emu-led on sys-esp-power', title: 'Power' });
  put(power, on.x, on.y - 8);
  Object.assign(power.style, ledLook(1, 'red'));
  let shownKey = '';
  return {
    wrap,
    paint(s) {
      const key = s ? JSON.stringify(s) : '';
      if (key === shownKey) return;
      shownKey = key;
      for (const [p, dot] of dots) { const v = s?.pins?.[p]; dot.classList.toggle('high', v === 1); dot.classList.toggle('low', v === 0); }
    },
  };
}
