// Silinx - the System Emulator's Explorer 16/32 (#5484): Silinx's own drawing of the board, as the Arduino's
// (web/js/emulator-arduino.js), after the real DM240001-2 (#5579: its photo, top view, its silkscreen read on it; its parts
// where they are, its green solder mask), its colours the stylesheet's: its 16x2 LCD showing its rows at the top left beside the ICSP jack, the
// slide potentiometer R6 under it, the PIM socket with the PIC24FJ1024GB610 in the middle, its LEDs D3 to D10 (lit as the
// PIC24 drives RA0 to RA7; D10 at the left, D3 at the right) above its buttons S3, S6, S5 and S4 (held down while pressed)
// along the bottom edge, S7 (Power) at its left, MCLR by the USB connectors, its temperature
// sensor (°C), the USB connectors and the power jack on the left edge, the mikroBUS sockets A and B with their Pmod
// headers at the top right, the PICtail Plus headers and edge connector on the right. Its parts' names are data
// (core/system-emu-explorer.js, silinx-pic24's EXPLORER_1632); what they do is the worker's.
import { boardFrame, svgText, ic } from './emulator-pcb.js';
import { ledLook } from './emulator-paint.js';

// the board's colours: the stylesheet's (web/css/system-editor.css, .sys-emu's --exp-*: the board's own, the same in every
// theme), none written here (#5575, test/hex-colours.test.js)
const C = Object.fromEntries(['pcb', 'edge', 'trace', 'metal', 'metal-edge', 'black', 'gold', 'silk', 'lcd', 'lcd-frame', 'pim', 'slider'].map((k) => [k.replace(/-(\w)/g, (_, c) => c.toUpperCase()), `var(--exp-${k})`]));
// (the photo's board, 1420 x 1020 pixels, at 0.5: its parts' places measured on it)
const W = 708, H = 510;
const LCD = { x: 88, y: 28, w: 294, h: 112 }, GLASS = { x: 96, y: 55, w: 278, h: 78 }, PIM = { x: 214, y: 232, w: 170, h: 165 };
const POT = { x: 144, y: 154, w: 198, h: 36 };
const LED_Y = 442, LED_X0 = 252, LED_DX = 17;   // (D10 at LED_X0, D3 the last)
const ledX = (k) => LED_X0 + (7 - k) * LED_DX;   // (D3 + k's)
const BTN_Y = 487, BTN_XS = [238, 298, 357, 415];
const TEMP = { x: 440, y: 432 };
const MIKRO = [{ x: 394, name: 'A' }, { x: 522, name: 'B' }];
// (each part put by its centre's x and its top's y: emulator-pcb.js boardFrame's put)

/** The board's drawing: its SVG's body. */
function explorerArt() {
  // a rectangle: its colours by their names (C's), its corners' radius a number (#1443: nothing but numbers and C's)
  const rect = (x, y, w, hh, fill, rx = 0, edge = null) => `<rect x="${+x}" y="${+y}" width="${+w}" height="${+hh}" rx="${+rx}" fill="${C[fill]}"${edge ? ` stroke="${C[edge]}"` : ''}/>`;
  // a 2-row header of n pins down from (x, y), 0.1 inch apart
  const header = (x, y, n, cols = 2) => rect(x, y, cols * 12, n * 12, 'black', 1) + Array.from({ length: n * cols }, (_, i) => rect(x + 4 + (i % cols) * 12, y + 4 + Math.floor(i / cols) * 12, 4, 4, 'gold')).join('');
  // a mikroBUS socket: its two 8-pin rows, its Pmod header above, its outline and name
  const mikro = ({ x, name }) => `<rect x="${x}" y="8" width="120" height="130" rx="4" fill="none" stroke="${C.silk}"/>`
    + rect(x + 8, 10, 104, 10, 'black') + rect(x + 6, 40, 12, 96, 'black') + rect(x + 102, 40, 12, 96, 'black')
    + svgText(x + 60, 120, name, { size: 16, fill: C.silk }) + svgText(x + 60, 132, 'mikroBUS', { size: 7, fill: C.silk }) + svgText(x + 60, 32, 'Pmod', { size: 7, fill: C.silk });
  const fingers = (y0, n) => Array.from({ length: n }, (_, i) => rect(W - 30, y0 + i * 7, 30, 4, 'gold')).join('');
  return `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="6" fill="${C.pcb}" stroke="${C.edge}" stroke-width="2"/>`
    // (a few of its traces)
    + [60, 200, 330, 420].map((y) => `<path d="M70 ${y} H ${W - 60}" stroke="${C.trace}" stroke-width="3" fill="none"/>`).join('')
    // the ICSP jack (RJ11) and the LCD's module, its glass where its rows are shown
    + rect(0, 37, 82, 65, 'black', 2) + rect(152, 1, 70, 9, 'black')
    + rect(12, 10, 75, 13, 'black') + svgText(18, 34, 'PICkit', { size: 7, fill: C.silk, anchor: 'start' })
    + rect(LCD.x, LCD.y, LCD.w, LCD.h, 'lcdFrame', 3) + rect(GLASS.x, GLASS.y, GLASS.w, GLASS.h, 'lcd', 2)
    // the slide potentiometer R6
    + rect(POT.x, POT.y, POT.w, POT.h, 'metal', 3, 'metalEdge') + rect(POT.x + 20, POT.y + 14, POT.w - 40, 8, 'slider', 2)
    + svgText(POT.x + 4, POT.y + POT.h + 10, 'R6', { size: 8, fill: C.silk, anchor: 'start' })
    // the USB connectors (micro, C, A, micro) and the power jack on the left edge
    + rect(0, 127, 26, 29, 'metal', 3, 'metalEdge') + rect(0, 202, 42, 33, 'metal', 6, 'metalEdge')
    + rect(0, 259, 60, 57, 'metal', 2, 'metalEdge') + rect(0, 352, 26, 36, 'metal', 3, 'metalEdge')
    + rect(0, 400, 66, 54, 'black', 4) + svgText(48, 246, 'USB', { size: 8, fill: C.silk, anchor: 'start' })
    // the PIM socket and the PIM (MA240023) on it, its device
    + rect(PIM.x, PIM.y, PIM.w, PIM.h, 'black', 2) + rect(PIM.x + 16, PIM.y + 12, PIM.w - 32, PIM.h - 24, 'pim', 3)
    + ic(PIM.x + 50, PIM.y + 52, PIM.w - 100, PIM.h - 104, ['PIC24FJ', '1024GB610'], 7)
    // the mikroBUS sockets, the board's name, the PICtail Plus headers and edge connector, the crystal
    + MIKRO.map(mikro).join('')
    + svgText(588, 164, 'EXPLORER 16/32', { size: 17, fill: C.silk })
    + header(486, 177, 24) + header(576, 177, 24)
    + rect(484, 476, 80, 18, 'black', 1) + svgText(524, 506, 'JTAG', { size: 8, fill: C.silk })
    + fingers(187, 9) + fingers(260, 9) + fingers(332, 21) + svgText(W - 40, 330, 'PICtail Plus', { size: 8, fill: C.silk, rotate: true })
    + rect(401, 290, 25, 57, 'metal', 8, 'metalEdge')
    // the LEDs' and the buttons' names, the temperature sensor's, the reset button MCLR and the power button S7
    + Array.from({ length: 8 }, (_, k) => svgText(ledX(k), LED_Y + 21, `D${k + 3}`, { size: 7, fill: C.silk })).join('')
    + ['S3', 'S6', 'S5', 'S4'].map((s, k) => svgText(BTN_XS[k] + 22, BTN_Y + 20, s, { size: 9, fill: C.silk, anchor: 'start' })).join('')
    + rect(97, 182, 28, 28, 'black', 3) + svgText(111, 178, 'MCLR', { size: 7, fill: C.silk })
    + rect(30, BTN_Y - 14, 28, 28, 'black', 3) + svgText(44, BTN_Y + 22, 'S7 Power', { size: 7, fill: C.silk })
    + svgText(306, 422, 'Temp Sensor TC1047A', { size: 7, fill: C.silk });
}

/** The board drawn: { wrap, paint(shown) } (emu: core/system-emu-explorer.js explorerBoard's, shown: its explorerState's);
 *  set(part, value): a button pressed (1) or let go (0), R6 (0 to 1) or the TC1047A (°C) set. */
export function explorerLayout({ h, emu, title, set }) {
  const board = emu.board, buttonPins = Object.fromEntries(emu.inputs.filter((i) => i.kind === 'button').map((i) => [i.pin, i.nodePin]));
  const { put, wrap } = boardFrame({ h, W, H, art: explorerArt(), board, title, clockNote: `${board.mcu}, its 8 MHz crystal` });
  // the LCD's rows
  const rows = [0, 1].map((r) => h('div', { class: 'sys-exp-lcd-row', 'data-row': String(r), 'data-no-i18n': 'true' }, ''));
  put(h('div', { class: 'sys-exp-lcd', title: 'LCD 16x2 (the PMP: PMD0-7 RE0-RE7, RS RB15, E RD4)' }, ...rows), GLASS.x + GLASS.w / 2, GLASS.y + 14);
  // the LEDs, D3 to D10 (D10 at the left)
  const leds = new Map();
  Object.entries(emu.leds).forEach(([d, pin], k) => {
    const el = h('div', { class: 'emu-led sys-exp-led', 'data-part': d, title: `LED ${d} (${pin})` });
    leds.set(d, el);
    put(el, ledX(k), LED_Y - 8);
  });
  // the buttons, S3 S6 S5 S4 as on the board, each held down while pressed
  const buttons = new Map();
  ['S3', 'S6', 'S5', 'S4'].forEach((s, k) => {
    const pin = buttonPins[s];
    const el = h('div', { class: 'b2-btn sys-exp-btn', 'data-part': s, title: pin ? `Button ${s} (${pin})` : `Button ${s}: its pin is a link's` });
    if (!pin) el.classList.add('nc');
    el.addEventListener('pointerdown', (e) => {
      if (!pin) return;
      e.preventDefault();
      set(s, 1);
      window.addEventListener('pointerup', () => set(s, 0), { once: true });
    });
    buttons.set(s, el);
    put(el, BTN_XS[k], BTN_Y - 16);
  });
  // the potentiometer (its share of its travel) and the temperature sensor (°C)
  const pot = h('input', { type: 'range', class: 'sys-exp-pot', min: '0', max: '100', value: '50', title: 'Potentiometer R6 (AN5): 0 to 3.3 V' });
  pot.addEventListener('input', () => set('R6', Number(pot.value) / 100));
  put(pot, POT.x + POT.w / 2, POT.y + 10);
  const temp = h('input', { type: 'number', class: 'asm-input sys-exp-temp', min: '-40', max: '125', step: '1', value: '25', title: 'Temperature sensor TC1047A (AN4), °C' });
  temp.addEventListener('change', () => set('TC1047A', Number(temp.value)));
  put(temp, TEMP.x, TEMP.y);
  let shownKey = '';
  return {
    wrap,
    paint(s) {
      const key = s ? JSON.stringify(s) : '';
      if (key === shownKey) return;
      shownKey = key;
      for (const [d, el] of leds) Object.assign(el.style, ledLook(s?.leds?.[d] ?? 0, true));
      for (const [b, el] of buttons) el.classList.toggle('on', !!s?.held?.[b]);
      rows.forEach((el, r) => { const t = s?.lcd?.[r] ?? ''; if (el.textContent !== t) el.textContent = t; });
      if (s?.analog && document.activeElement !== pot) pot.value = String(Math.round(s.analog.R6 * 100));
      if (s?.analog && document.activeElement !== temp) temp.value = String(s.analog.TC1047A);
    },
  };
}
