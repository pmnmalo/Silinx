// Silinx - the System Emulator's Arduino Uno and Nano (#5212): Silinx's own drawing, as the FPGA boards' (web/js/
// emulator-pcb.js): the board, its microcontroller, its USB connector, its headers with each pin's level (lit high,
// dark low, hollow floating: a pin no program drives and nothing links), its LED L (D13) and its power LED. The pins'
// names are data (the board's, core/system-doc.js MCU_BOARDS).
import { boardFrame, svgText, ic } from './emulator-pcb.js';
import { ledLook } from './emulator-paint.js';

const PITCH = 24;

/** The board drawn: { wrap, paint(shown) } (shown: core/system-emu.js boardStates' { pins, led } of the board). */
export function arduinoLayout({ h, board, title }) {
  const nano = board.id === 'arduino-nano';
  const digital = board.pins.filter(p => /^D/.test(p)), analog = board.pins.filter(p => /^A/.test(p));
  const W = nano ? 440 : 470, H = nano ? 170 : 320;
  const top = 34, bottom = H - 34;
  // the digital header along the top, D0 at the right (as on the Uno); the analog one along the bottom
  const at = (p) => (/^D/.test(p) ? { x: W - 40 - digital.indexOf(p) * PITCH, y: top } : { x: W - 40 - (analog.length - 1 - analog.indexOf(p)) * PITCH, y: bottom });
  const header = (pins, y) => `<rect x="${Math.min(...pins.map(p => at(p).x)) - 12}" y="${y - 11}" width="${pins.length * PITCH}" height="22" rx="2" fill="#151515"/>`;
  const labels = board.pins.map(p => { const { x, y } = at(p); return svgText(x, y + (y === top ? 26 : -18), p, { size: 9 }); }).join('');
  const art = `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="12" fill="#00748a" stroke="#004f5e" stroke-width="2"/>`
    + header(digital, top) + header(analog, bottom)
    + `<rect x="-6" y="${nano ? 60 : 70}" width="${nano ? 40 : 70}" height="${nano ? 46 : 58}" rx="3" fill="#b9bec2" stroke="#7d8286"/>`
    + (nano ? '' : `<rect x="-4" y="${H - 110}" width="56" height="52" rx="4" fill="#202020"/>`)
    + ic(nano ? 190 : 230, nano ? 66 : 150, nano ? 60 : 160, nano ? 40 : 46, [board.mcu, `${board.clockHz / 1e6} MHz`])
    + svgText(nano ? 110 : 140, nano ? 100 : 120, board.name.toUpperCase(), { size: 16, fill: '#eaf6f8' })
    + svgText(W - 40 - 13 * PITCH - 30, top + 40, 'L', { size: 10 }) + svgText(nano ? 140 : 120, nano ? 140 : 240, 'ON', { size: 10 })
    + labels;
  const { put, wrap } = boardFrame({ h, W, H, art, board, title, clockNote: `${board.mcu} at ${board.clockHz / 1e6} MHz` });
  const dots = new Map();
  for (const p of board.pins) {
    const { x, y } = at(p);
    const dot = h('div', { class: 'sys-pin', 'data-pin': p, title: p });
    dots.set(p, dot);
    put(dot, x - 6, y - 6);
  }
  const led = h('div', { class: 'emu-led sys-led-l', title: 'LED L (D13)' });
  put(led, W - 40 - 13 * PITCH - 36, top + 46);
  const power = h('div', { class: 'emu-led on', title: 'Power' });
  put(power, nano ? 130 : 110, nano ? 148 : 248);
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
