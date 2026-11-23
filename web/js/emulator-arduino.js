// Silinx - the System Emulator's Arduino Uno and Nano (#5212): Silinx's own drawing, as the FPGA boards' (web/js/
// emulator-pcb.js): the board, its microcontroller, its USB connector, its headers with each pin's level (lit high,
// dark low, hollow floating: a pin no program drives and nothing links), its LED L (D13) and its power LED. The pins'
// names are data (the board's, core/system-doc.js MCU_BOARDS). Its headers are where the circuit's part has its pins
// (core/circuit-boards.js: BOARD_ART, the part's pins), and its drawing (arduinoArt) is the circuit editor's too (#5366).
import { boardFrame, svgText, ic } from './emulator-pcb.js';
import { ledLook } from './emulator-paint.js';
import { BOARD_ART, BOARD_PARTS } from '/core/circuit-boards.js';

const C = { pcb: '#00748a', edge: '#004f5e', metal: '#b9bec2', metalEdge: '#7d8286', black: '#151515', dark: '#202020', silk: '#eaf6f8' };
// an Uno's headers, [first, last, row] on the grid (its power header's first pin not connected)
const UNO_HEADERS = [[0, 9, 0], [11, 18, 0], [4, 11, 19], [13, 18, 19]];

/** The board's drawing: { art (an SVG's body), W, H, at(pin) its place, l and on its LEDs' places }. */
export function arduinoArt(board) {
  const nano = board.id === 'arduino-nano';
  const a = BOARD_ART[board.id], part = BOARD_PARTS.find(p => p.type === board.id);
  const W = a.w, H = a.h, xy = (dx, dy) => ({ x: a.pin1[0] + dx * a.pitch, y: a.pin1[1] + dy * a.pitch });
  const at = (name) => { const q = part.pins.find(p => p.name === name); return xy(q.dx, q.dy); };
  const top = (q) => q.dy === Math.min(...part.pins.map(p => p.dy));
  // each pin's name beside it, toward the board's middle (an Uno's turned along its header)
  const labels = part.pins.map(q => {
    const { x, y } = xy(q.dx, q.dy);
    if (nano) return svgText(x, top(q) ? y + 20 : y - 12, q.name, { size: 8, fill: C.silk });
    return svgText(x + 3, top(q) ? y + 14 : y - 14, q.name, { size: 8, fill: C.silk, anchor: top(q) ? 'end' : 'start', rotate: true });
  }).join('');
  const pins = nano
    ? part.pins.map(q => { const { x, y } = xy(q.dx, q.dy); return `<circle cx="${x}" cy="${y}" r="7" fill="${C.metal}"/><circle cx="${x}" cy="${y}" r="3" fill="${C.black}"/>`; }).join('')
    : UNO_HEADERS.map(([x0, x1, dy]) => { const s = xy(x0, dy); return `<rect x="${s.x - 9}" y="${s.y - 9}" width="${(x1 - x0 + 1) * a.pitch}" height="18" rx="2" fill="${C.black}"/>`
      + Array.from({ length: x1 - x0 + 1 }, (_, i) => `<rect x="${s.x + i * a.pitch - 3}" y="${s.y - 3}" width="6" height="6" fill="${C.metalEdge}"/>`).join(''); }).join('');
  const mhz = `${board.clockHz / 1e6} MHz`;
  const l = nano ? { x: 340, y: 56 } : { x: at('D13').x, y: 62 }, on = nano ? { x: 340, y: 118 } : { x: 405, y: 100 };
  const art = `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="${nano ? 6 : 12}" fill="${C.pcb}" stroke="${C.edge}" stroke-width="2"/>`
    + pins
    + (nano
      // a Nano: its mini-USB by D12 and D13, its microcontroller in the middle, its reset button
      ? `<rect x="${W - 44}" y="62" width="44" height="50" rx="3" fill="${C.metal}" stroke="${C.metalEdge}"/>`
        + `<rect x="110" y="72" width="26" height="30" rx="2" fill="${C.metal}"/><circle cx="123" cy="87" r="7" fill="${C.dark}"/>`
        + ic(170, 62, 56, 52, [board.mcu, mhz], 6) + svgText(123, 128, 'NANO', { size: 14, fill: C.silk })
      // an Uno: its USB-B socket and its power jack on the left edge, its reset button, its USB chip, its microcontroller (a
      // DIP-28) over the power and analog headers, its ICSP header on the right edge
      : `<rect x="0" y="68" width="70" height="85" rx="3" fill="${C.metal}" stroke="${C.metalEdge}"/><rect x="0" y="234" width="80" height="63" rx="4" fill="${C.dark}"/>`
        + `<rect x="30" y="14" width="22" height="22" rx="2" fill="${C.metal}"/><circle cx="41" cy="25" r="6" fill="${C.dark}"/>`
        + ic(120, 90, 34, 34, ['16U2'], 6) + ic(200, 250, 250, 46, [board.mcu, mhz])
        + `<rect x="444" y="160" width="30" height="44" rx="2" fill="${C.black}"/>` + svgText(459, 216, 'ICSP', { size: 7, fill: C.silk })
        + svgText(320, 160, 'UNO', { size: 30, fill: C.silk }) + svgText(320, 184, 'ARDUINO', { size: 13, fill: C.silk })
        + svgText(xy(7.5, 19).x, 302, 'POWER', { size: 8, fill: C.silk }) + svgText(xy(15.5, 19).x, 302, 'ANALOG IN', { size: 8, fill: C.silk }))
    + svgText(l.x - 14, l.y + 4, 'L', { size: 9, fill: C.silk }) + svgText(on.x - 18, on.y + 4, 'ON', { size: 9, fill: C.silk })
    + labels;
  return { art, W, H, at, l, on };
}

/** The board drawn: { wrap, paint(shown) } (shown: core/system-emu.js boardStates' { pins, led } of the board). */
export function arduinoLayout({ h, board, title }) {
  const { art, W, H, at, l, on } = arduinoArt(board);
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote: `${board.mcu} at ${board.clockHz / 1e6} MHz` });
  const dots = new Map();
  for (const p of board.pins) {
    const { x, y } = at(p);
    const dot = h('div', { class: 'sys-pin', 'data-pin': p, title: p });
    dots.set(p, dot);
    put(dot, x, y - 6);
  }
  const led = h('div', { class: 'emu-led sys-led-l', title: 'LED L (D13)' });
  put(led, l.x, l.y - 8);
  const power = h('div', { class: 'emu-led on', title: 'Power' });
  put(power, on.x, on.y - 8);
  Object.assign(power.style, ledLook(1));
  let shownKey = '';
  return {
    wrap,
    paint(s) {
      const key = s ? JSON.stringify(s) : '';
      if (key === shownKey) return;
      shownKey = key;
      for (const [p, dot] of dots) { const v = s?.pins?.[p]; dot.classList.toggle('high', v === 1); dot.classList.toggle('low', v === 0); }
      Object.assign(led.style, ledLook(s?.led ?? 0));
    },
  };
}
