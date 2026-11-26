// Silinx - Board Emulator: the Digilent Arty Z7 drawn as the real board (#4684). Our own drawing, after the board's
// photos and its reference manual (Rev. B): each part where it is, as it is turned, in proportion (the board 900 x 675),
// with its silkscreen names (white on black, as on the board; the parts' FPGA pins under them). Its programmable logic's
// parts are the emulator's; the processing system's (SRST, the microSD slot under the board) are drawn, not wired
// (#4679's phase b).
import { ledNumbers } from '/core/emulate.js';
import { holes4, boardFrame, svgText as text, ic, POWER_V_CSS } from './emulator-pcb.js';
import { pmodBlocks, pmodArt, putPmods } from './emulator-pmods.js';

const W = 900, H = 675;
const pinsOf = (board, res) => board.resources.find((r) => r.name === res)?.pins ?? [];
const has = (board, res) => board.resources.some((r) => r.name === res);
// a name of the silkscreen: white on a black box, as the board's
const tag = (x, y, t, size = 9) => `<rect x="${x - t.length * size * 0.36 - 5}" y="${y - size - 2}" width="${t.length * size * 0.72 + 10}" height="${size + 7}" fill="#141414"/>`
  + text(x, y + 1, t, { size, fill: '#fff' });
// a Pmod (2 x 6 right-angle header) on the top edge, its pins on the board under it
const pmodTop = (xc, name) => `<rect x="${xc - 66}" y="0" width="132" height="82" rx="2" fill="#141414"/>`
  + Array.from({ length: 12 }, (_, i) => `<rect x="${xc - 50 + (i % 6) * 18}" y="${88 + Math.floor(i / 6) * 14}" width="8" height="8" fill="#c9a94a"/>`).join('')
  + text(xc - 76, 36, name, { size: 10, anchor: 'end', fill: '#111' });
// a shield header: a row of n sockets (two rows: 2 x n)
const header = (x, y, n, rows = 1) => `<rect x="${x}" y="${y}" width="${n * 15 + 6}" height="${rows * 15 + 6}" rx="1" fill="#141414"/>`
  + Array.from({ length: n * rows }, (_, i) => `<rect x="${x + 6 + (i % n) * 15}" y="${y + 6 + Math.floor(i / n) * 15}" width="5" height="5" fill="#555"/>`).join('');
// a red tact button of the board's own (PROG, SRST: drawn, not wired)
const tact = (x, y) => `<rect x="${x - 17}" y="${y - 17}" width="34" height="34" rx="2" fill="#d5d7da" stroke="#8a8e94"/><circle cx="${x}" cy="${y}" r="9" fill="#c8302a"/>`;
// an RGB LED's package (white) and its name over it, its three LEDs the emulator's
const rgbAt = (x, y, name) => `<rect x="${x - 15}" y="${y - 15}" width="30" height="30" rx="3" fill="#f6f6f2" stroke="#9a9a96"/>${tag(x, y - 26, name, 8)}`;

// where the parts are (their centres)
const POWER = [128, 512];
const SW_X = (i) => 419 + i * 55, SW_Y = 600;            // SW1 (left), SW0: upright
const RGB = [['led5_rgb', 'LD5', 419], ['led4_rgb', 'LD4', 469]], RGB_Y = 504;
const COL_X = (i) => 568 + i * 74.7;                     // LD3 / BTN3 (left) .. LD0 / BTN0, each LED over its button
const LED_Y = 580, BTN_Y = 622;

/** Digilent Arty Z7: white PCB, its names white on black. The top edge: the USB host port (left corner), HDMI OUT,
 *  HDMI IN, the Pmods JA and JB, the red PROG button (right corner); the left edge: the PROG / UART micro-USB, Ethernet,
 *  AUDIO OUT, the 7-15 V power jack, the red SRST button and the power select jumper JP5 (USB / REG) in the corner; the
 *  boot mode jumper JP4 (SD / QSPI / JTAG) and the board's name; the Zynq in the middle, the DDR3 right of it; the shield
 *  headers over and under them, the SPI header on the right; the RGB LEDs LD5 and LD4 over the switches SW1 and SW0,
 *  LD3..LD0 over BTN3..BTN0 along the bottom edge. */
export function artyZ7Layout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  // (the modules on its Pmods, under it, #5641)
  const mods = pmodBlocks(board, W, H);
  const art = `
    <defs><linearGradient id="azpcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfbf8"/><stop offset="1" stop-color="#eeeeea"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="10" fill="url(#azpcb) #fbfbf8" stroke="#b9bab4" stroke-width="3"/>
    ${holes4(W, H)}
    <rect x="0" y="33" width="80" height="73" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="46" width="58" height="46" fill="#55595f"/>${tag(63, 134, 'USB HOST', 8)}
    <rect x="184" y="0" width="106" height="58" rx="3" fill="#c3c7cd" stroke="#6b7079"/><path d="M194,6 h86 l-8,22 h-70 z" fill="#1a1a1a"/>${tag(237, 111, 'HDMI OUT', 8)}
    <rect x="341" y="0" width="106" height="58" rx="3" fill="#c3c7cd" stroke="#6b7079"/><path d="M351,6 h86 l-8,22 h-70 z" fill="#1a1a1a"/>${tag(394, 111, 'HDMI IN', 8)}
    ${pmodTop(568, 'JA')}${pmodTop(751, 'JB')}
    ${tact(842, 70)}${tag(842, 112, 'PROG', 8)}
    <rect x="0" y="186" width="40" height="26" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="193" width="22" height="12" rx="2" fill="#55595f"/>${tag(40, 234, 'PROG', 8)}${tag(40, 248, 'UART', 8)}
    <rect x="124" y="222" width="10" height="7" fill="#d18a1a"/><rect x="144" y="222" width="10" height="7" fill="#d18a1a"/>${text(129, 216, 'TX', { size: 8, fill: '#111' })}${text(149, 216, 'RX', { size: 8, fill: '#111' })}
    <rect x="234" y="178" width="16" height="50" rx="2" fill="#2a6fd1"/>${text(228, 190, 'SD', { size: 8, anchor: 'end', fill: '#111', weight: 'normal' })}${text(228, 206, 'QSPI', { size: 8, anchor: 'end', fill: '#111', weight: 'normal' })}${text(228, 222, 'JTAG', { size: 8, anchor: 'end', fill: '#111', weight: 'normal' })}${text(242, 172, 'JP4', { size: 7, fill: '#111' })}
    ${text(356, 232, 'Arty Z7', { size: 44, weight: 'normal', fill: '#111' })}
    <rect x="0" y="260" width="138" height="124" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="282" width="104" height="80" fill="#9aa0a7"/>${tag(72, 405, 'ETHERNET', 8)}
    <rect x="0" y="434" width="113" height="50" rx="4" fill="#1a1a1a"/><circle cx="20" cy="459" r="9" fill="#333"/>${tag(165, 462, 'AUDIO OUT', 8)}
    <rect x="0" y="492" width="104" height="92" rx="4" fill="#141414"/><circle cx="40" cy="538" r="16" fill="#2e2e2e"/>${text(108, 606, '7-15V', { size: 8, anchor: 'start', fill: '#111' })}
    ${tact(71, 608)}${tag(71, 646, 'SRST', 8)}
    <rect x="178" y="616" width="34" height="16" rx="2" fill="#2a6fd1"/>${tag(195, 652, 'USB REG', 8)}
    <rect x="323" y="335" width="10" height="7" fill="#d18a1a"/>${text(328, 330, 'LD12', { size: 7, fill: '#111' })}${text(328, 356, 'DONE', { size: 7, fill: '#111' })}
    <rect x="290" y="410" width="20" height="12" rx="2" fill="#2a6fd1"/>${tag(300, 438, 'CK_RST', 7)}
    ${ic(394, 252, 116, 116, ['ZYNQ', (board.device?.part || 'XC7Z020').toUpperCase()], 10)}${ic(580, 264, 92, 92, ['DDR3'], 8)}
    ${header(444, 164, 26, 2)}${header(560, 497, 21, 2)}
    ${header(805, 330, 3, 2)}${tag(828, 384, 'SPI', 8)}${tag(842, 428, 'SD CARD', 8)}${text(842, 446, 'On Back', { size: 7, fill: '#111', weight: 'normal' })}
    ${RGB.map(([, name, x]) => rgbAt(x, RGB_Y, name)).join('')}
    ${Array.from({ length: 4 }, (_, i) => `<rect x="${COL_X(i) - 20}" y="${BTN_Y - 20}" width="40" height="40" rx="2" fill="#d5d7da" stroke="#8a8e94"/>`).join('')}`;
  const { pcb, put, wrap } = boardFrame({ h, W, H: H + mods.room, art: art + pmodArt(mods), board, title, clockNote });
  // (#2522: given back when the modules are hidden; under the board, the board staying where it is)
  if (mods.room) { pcb.dataset.moduleRoom = mods.room; pcb.classList.add('emu-room-below'); }
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk az-silk' }, t), x, y);
  const port = (res, k, x, y) => put(h('span', { class: `emu-port az-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y);
  // no power switch on the board (JP5 chooses USB or the jack): the emulator's by the jack, upright, LD13 its LED
  const power = part(put(mkPower(), POWER[0], POWER[1] - 18), 'power');
  power.firstChild.classList.add('emu-power-v', 'az-power');
  // the RGB LEDs LD5 and LD4 (red, green, blue: numbered after LD0..LD3) over SW1 and SW0
  const n = ledNumbers(board);
  for (const [res, name, x] of RGB) {
    if (!has(board, res)) continue;
    ['red', 'green', 'blue'].forEach((c, i) => {
      const l = mkLed(n[res] + i, 'emu-led az-rgb');
      l.dataset.colour = c;
      part(put(l, x - 8 + i * 8, RGB_Y - 3), `${name.toLowerCase()}_${c}`);
    });
  }
  for (let i = 0; i < 2; i++) {
    const k = 1 - i, x = SW_X(i);
    silkText(`SW${k}`, x, SW_Y - 62);
    part(put(mkSwitch(k, 'emu-sw bs2-sw az-sw'), x, SW_Y - 31), `sw${k}`);
    silkText(`(${pinsOf(board, 'sw')[k] ?? ''})`, x, SW_Y + 34);
    port('sw', k, x, SW_Y + 45);
  }
  // LD3..LD0 over BTN3..BTN0, each named with its pin
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = COL_X(i);
    silkText(`LD${k}(${pinsOf(board, 'led')[k] ?? ''})`, x, LED_Y - 20);
    part(put(mkLed(k, 'emu-led b2-led'), x, LED_Y - 5), `led${k}`);
    port('led', k, x, LED_Y + 8);
    part(put(mkButton(k, 'emu-btn nx2-btn'), x, BTN_Y - 17), `btn${k}`);
    silkText(`BTN${k}(${pinsOf(board, 'btn')[k] ?? ''})`, x, BTN_Y + 22);
    port('btn', k, x, BTN_Y + 33);
  }
  putPmods(mods, { board, h, put, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, silk: 'az-silk', swCls: 'emu-sw bs2-sw az-sw', btnCls: 'emu-btn nx2-btn' });
  return wrap;
}
// its parts' look: the names dark on the white board, the upright power switch (LD13 its LED), the RGB LEDs' three
// small LEDs; the switches are the Basys2's (emulator-basys2.js), the buttons the Nexys2's (emulator-nexys2.js)
artyZ7Layout.css = `${POWER_V_CSS}
.az-power .emu-power-led { left: 34px; top: 4px; width: 10px; height: 7px; border-radius: 0; }
.az-silk { color: #141414; font-size: 8px; }
.emu-port.az-port { color: #8a5a00; }
.emu-port.az-port.nc { color: #6a78a8; }
.az-sw { width: 34px; height: 62px; }
.az-sw::after { height: 24px; }
.az-sw.on::after { bottom: 31px; }
.emu-led.az-rgb { width: 6px; height: 6px; border-width: 0; }
`;
