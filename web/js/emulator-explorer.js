// Silinx - the System Emulator's Explorer 16/32 (#5484): Silinx's own drawing of the board, as the Arduino's
// (web/js/emulator-arduino.js), its colours the stylesheet's: its PIM with the PIC24FJ1024GB610, its 16x2 LCD showing its rows, its LEDs D3 to D10
// (lit as the PIC24 drives RA0 to RA7), its buttons S3 to S6 (held down while pressed), its potentiometer R6 (a slider)
// and its temperature sensor (°C), its connectors (the USB ports, two mikroBUS sockets, the PICtail edge). Its parts'
// names are data (core/system-emu-explorer.js, silinx-pic24's EXPLORER_1632); what they do is the worker's.
import { boardFrame, svgText, ic } from './emulator-pcb.js';
import { ledLook } from './emulator-paint.js';

// the board's colours: the stylesheet's (web/css/system-editor.css, .sys-emu's --exp-*: the board's own, the same in every
// theme), none written here (#5575, test/hex-colours.test.js)
const C = Object.fromEntries(['pcb', 'edge', 'metal', 'metal-edge', 'black', 'gold', 'silk', 'lcd', 'pim'].map((k) => [k.replace(/-(\w)/g, (_, c) => c.toUpperCase()), `var(--exp-${k})`]));
const W = 640, H = 420;
// the parts' places on the board
const LCD = { x: 30, y: 28, w: 300, h: 92 }, PIM = { x: 440, y: 28, w: 150, h: 150 };
const LED_Y = 170, LED_X0 = 50, LED_DX = 38;
const BTN_Y = 250, BTN_X0 = 60, BTN_DX = 70;
const POT = { x: 400, y: 318 }, TEMP = { x: 530, y: 318 };
// (each part put by its centre's x and its top's y: emulator-pcb.js boardFrame's put)

/** The board's drawing: its SVG's body. */
function explorerArt() {
  const fingers = Array.from({ length: 30 }, (_, i) => `<rect x="${150 + i * 11}" y="${H - 16}" width="7" height="16" fill="${C.gold}"/>`).join('');
  const socket = (x, y, name) => `<rect x="${x}" y="${y}" width="90" height="60" rx="3" fill="none" stroke="${C.silk}" stroke-dasharray="4 3"/>`
    + `<rect x="${x + 4}" y="${y + 4}" width="82" height="9" fill="${C.black}"/><rect x="${x + 4}" y="${y + 47}" width="82" height="9" fill="${C.black}"/>`
    + svgText(x + 45, y + 35, name, { size: 9, fill: C.silk });
  return `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10" fill="${C.pcb}" stroke="${C.edge}" stroke-width="2"/>`
    // the LCD's module, its glass where its rows are shown
    + `<rect x="${LCD.x}" y="${LCD.y}" width="${LCD.w}" height="${LCD.h}" rx="4" fill="${C.black}"/>`
    + `<rect x="${LCD.x + 14}" y="${LCD.y + 18}" width="${LCD.w - 28}" height="${LCD.h - 36}" rx="2" fill="${C.lcd}"/>`
    // the PIM (MA240023): the device on its plug-in module
    + `<rect x="${PIM.x}" y="${PIM.y}" width="${PIM.w}" height="${PIM.h}" rx="4" fill="${C.pim}" stroke="${C.metalEdge}"/>`
    + ic(PIM.x + 25, PIM.y + 25, PIM.w - 50, PIM.h - 50, ['PIC24FJ', '1024GB610'], 9)
    + svgText(PIM.x + PIM.w / 2, PIM.y + PIM.h + 14, 'PIM', { size: 9, fill: C.silk })
    // the USB ports (the MCP2221A's USB-UART, the PIC24's USB, the PICkit On Board), the mikroBUS sockets, the PICtail
    + `<rect x="0" y="296" width="34" height="44" rx="3" fill="${C.metal}" stroke="${C.metalEdge}"/>` + svgText(42, 322, 'USB', { size: 8, fill: C.silk, anchor: 'start' })
    + `<rect x="${W - 34}" y="200" width="34" height="44" rx="3" fill="${C.metal}" stroke="${C.metalEdge}"/>` + svgText(W - 40, 226, 'USB', { size: 8, fill: C.silk, anchor: 'end' })
    + socket(350, 206, 'mikroBUS A') + socket(456, 206, 'mikroBUS B')
    + fingers + svgText(320, H - 22, 'PICtail Plus', { size: 9, fill: C.silk })
    + Array.from({ length: 8 }, (_, k) => svgText(LED_X0 + k * LED_DX, LED_Y + 24, `D${k + 3}`, { size: 9, fill: C.silk })).join('')
    + ['S3', 'S6', 'S5', 'S4'].map((s, k) => svgText(BTN_X0 + k * BTN_DX, BTN_Y + 40, s, { size: 9, fill: C.silk })).join('')
    + svgText(POT.x, POT.y + 36, 'R6', { size: 9, fill: C.silk }) + svgText(TEMP.x, TEMP.y + 36, 'TC1047A', { size: 9, fill: C.silk })
    + svgText(20, H - 40, 'EXPLORER 16/32', { size: 14, fill: C.silk, anchor: 'start' });
}

/** The board drawn: { wrap, paint(shown) } (emu: core/system-emu-explorer.js explorerBoard's, shown: its explorerState's);
 *  set(part, value): a button pressed (1) or let go (0), R6 (0 to 1) or the TC1047A (°C) set. */
export function explorerLayout({ h, emu, title, set }) {
  const board = emu.board, buttonPins = Object.fromEntries(emu.inputs.filter((i) => i.kind === 'button').map((i) => [i.pin, i.nodePin]));
  const { put, wrap } = boardFrame({ h, W, H, art: explorerArt(), board, title, clockNote: `${board.mcu}, its 8 MHz crystal` });
  // the LCD's rows
  const rows = [0, 1].map((r) => h('div', { class: 'sys-exp-lcd-row', 'data-row': String(r), 'data-no-i18n': 'true' }, ''));
  put(h('div', { class: 'sys-exp-lcd', title: 'LCD 16x2 (the PMP: PMD0-7 RE0-RE7, RS RB15, E RD4)' }, ...rows), LCD.x + LCD.w / 2, LCD.y + 22);
  // the LEDs, D3 to D10
  const leds = new Map();
  Object.entries(emu.leds).forEach(([d, pin], k) => {
    const el = h('div', { class: 'emu-led sys-exp-led', 'data-part': d, title: `LED ${d} (${pin})` });
    leds.set(d, el);
    put(el, LED_X0 + k * LED_DX, LED_Y - 8);
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
    put(el, BTN_X0 + k * BTN_DX, BTN_Y - 16);
  });
  // the potentiometer (its share of its travel) and the temperature sensor (°C)
  const pot = h('input', { type: 'range', class: 'sys-exp-pot', min: '0', max: '100', value: '50', title: 'Potentiometer R6 (AN5): 0 to 3.3 V' });
  pot.addEventListener('input', () => set('R6', Number(pot.value) / 100));
  put(pot, POT.x, POT.y);
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
