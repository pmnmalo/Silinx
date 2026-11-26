// Silinx - Board Emulator: the Digilent Zybo Z7 drawn as the real board (#4684). Our own drawing, after the board's
// photos and its reference manual (Rev. B): each part where it is, as it is turned, in proportion (the board 900 x 614),
// with its silkscreen names (the parts' FPGA pins in brackets, as on the board). Its programmable logic's parts are the
// emulator's; the processing system's (the MIO LED LD4, the MIO buttons BTN4 and BTN5, PS-SRST, the MIO Pmod JF) are
// drawn, not wired (#4679's phase b).
import { ledNumbers } from '/core/emulate.js';
import { holes4, boardFrame, svgText as text, ic, POWER_V_CSS } from './emulator-pcb.js';
import { pmodBlocks, pmodArt, putPmods, PMOD_CSS } from './emulator-pmods.js';

const W = 900, H = 614;
const pinsOf = (board, res) => board.resources.find((r) => r.name === res)?.pins ?? [];
const has = (board, res) => board.resources.some((r) => r.name === res);
// a Pmod (2 x 6 right-angle header) on the bottom edge, its pins on the board over it, its name at its left
const pmodBottom = (xc, name, shown = true) => (!shown ? '' : `<rect x="${xc - 44}" y="${H - 62}" width="88" height="62" rx="2" fill="#141414"/>`
  + Array.from({ length: 12 }, (_, i) => `<rect x="${xc - 39 + (i % 6) * 14}" y="${H - 92 + Math.floor(i / 6) * 13}" width="8" height="8" fill="#c9a94a"/>`).join('')
  + text(xc - 50, H - 80, name, { size: 10, anchor: 'end' }));
// a Pmod upright on the left or right edge
const pmodSide = (right, yc, name) => {
  const x = right ? W - 44 : 0, px = right ? [W - 70, W - 57] : [52, 65];
  return `<rect x="${x}" y="${yc - 50}" width="44" height="100" rx="2" fill="#141414"/>`
    + Array.from({ length: 12 }, (_, i) => `<rect x="${px[i % 2]}" y="${yc - 42 + Math.floor(i / 2) * 15}" width="8" height="8" fill="#c9a94a"/>`).join('')
    + text(right ? W - 78 : 78, yc - 46, name, { size: 10, anchor: right ? 'end' : 'start' });
};
// an audio jack on the right edge, its colour the board's
const jack = (yc, fill, name) => `<rect x="${W - 70}" y="${yc - 24}" width="70" height="48" rx="4" fill="${fill}" stroke="#000"/>`
  + `<circle cx="${W - 70}" cy="${yc}" r="9" fill="#222"/>${text(W - 80, yc + 4, name, { size: 9, anchor: 'end' })}`;
// a tact button of the processing system's (drawn, not wired): a red one (PS-SRST, PROG) or a black one (BTN4, BTN5)
const tact = (x, y, red) => `<rect x="${x - 15}" y="${y - 15}" width="30" height="30" rx="2" fill="#c9ccd1" stroke="#7b8088"/><circle cx="${x}" cy="${y}" r="8" fill="${red ? '#c8302a' : '#1a1a1a'}"/>`;
// an RGB LED's package (white) and its name under it, its three LEDs the emulator's
const rgbAt = (x, y, name) => `<rect x="${x - 15}" y="${y - 15}" width="30" height="30" rx="3" fill="#f1f1ee" stroke="#9a9a96"/>${text(x, y + 28, name, { size: 7 })}`;

// where the parts are (their centres)
const POWER = [28, 99];
const SW_X = (i) => 169 + i * 47.7, SW_Y = 462;          // SW3 (left) .. SW0, upright, over the bottom edge's Pmods
const LED_Y = 398;                                       // LD3 .. LD0, each over its switch
const BTN_X = (i) => 533 + i * 71.7, BTN_Y = 465;        // BTN3 (left) .. BTN0
const RGB = [[574, 404, 'LD6'], [626, 404, 'LD5']];       // LD6 (the Z7-10's only one), LD5 (the Z7-20's: not a resource here)

/** Digilent Zybo Z7: dark green PCB. The top edge: the external power jack, Ethernet, HDMI TX, the Pcam connector (the
 *  microSD slot under the board), HDMI RX; the left edge: the power switch (ON up) and the power select jumper, the PROG /
 *  UART micro-USB, the MIO Pmod JF, the USB host port; the right edge: the JTAG header, the audio jacks (HPH OUT, MIC IN,
 *  LINE IN) and the XADC Pmod JA; along the bottom edge the Pmods JE, JD, JC and JB. The Zynq under its heat sink in the
 *  middle (the Z7-20's: the fan connector over it), the DDR3L under it; the MIO LED LD4 and the MIO buttons BTN5 and
 *  BTN4 on the left, LD3..LD0 over SW3..SW0; the boot mode jumper JP5, PGOOD, DONE, the red PS-SRST and PROG buttons,
 *  the RGB LEDs LD6 and LD5 and BTN3..BTN0 on the right. */
export function zyboZ7Layout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  // (the modules on its Pmods, under it, #5641)
  const mods = pmodBlocks(board, W, H);
  const z20 = !/xc7z010/i.test(board.device?.part || '');
  const art = `
    <defs><linearGradient id="zypcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16574a"/><stop offset="1" stop-color="#0f4438"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="8" fill="url(#zypcb) #16574a" stroke="#0a2d25" stroke-width="3"/>
    ${holes4(W, H)}
    <rect x="104" y="0" width="50" height="80" rx="3" fill="#141414"/><circle cx="129" cy="58" r="12" fill="#3a3a3a"/>${text(166, 30, '5V ONLY', { size: 7, anchor: 'start', weight: 'normal' })}
    <rect x="166" y="0" width="108" height="136" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="180" y="0" width="80" height="40" fill="#9aa0a7"/>${text(220, 150, 'ETH', { size: 8 })}
    <rect x="316" y="0" width="106" height="52" rx="3" fill="#c3c7cd" stroke="#6b7079"/><path d="M326,6 h86 l-8,22 h-70 z" fill="#1a1a1a"/>${text(436, 30, 'HDMI TX', { size: 8, rotate: true })}
    <rect x="470" y="36" width="140" height="18" rx="2" fill="#1a1a1a"/><rect x="476" y="40" width="128" height="6" fill="#d8d8d0"/>${text(540, 18, 'SD MICRO', { size: 8 })}
    <rect x="702" y="0" width="106" height="52" rx="3" fill="#c3c7cd" stroke="#6b7079"/><path d="M712,6 h86 l-8,22 h-70 z" fill="#1a1a1a"/>${text(820, 30, 'HDMI RX', { size: 8, rotate: true })}
    ${text(POWER[0], 46, 'ON', { size: 7 })}${text(POWER[0], 160, 'OFF', { size: 7 })}
    <rect x="58" y="128" width="16" height="30" rx="2" fill="#2a6fd1"/>${text(84, 136, 'WALL', { size: 7, anchor: 'start', weight: 'normal' })}${text(84, 154, 'USB', { size: 7, anchor: 'start', weight: 'normal' })}
    <rect x="0" y="206" width="40" height="26" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="213" width="22" height="12" rx="2" fill="#55595f"/>${text(28, 262, 'PROG', { size: 8 })}${text(28, 274, 'UART', { size: 8 })}
    <rect x="60" y="248" width="10" height="7" fill="#d18a1a"/><rect x="86" y="248" width="10" height="7" fill="#d18a1a"/>${text(65, 268, 'TX', { size: 7 })}${text(91, 268, 'RX', { size: 7 })}
    ${pmodSide(false, 339, 'JF')}${text(78, 400, 'MIO', { size: 8, anchor: 'start', weight: 'normal' })}
    <rect x="140" y="292" width="10" height="7" fill="#d18a1a"/>${text(145, 284, 'LD4', { size: 7 })}${text(145, 312, 'MIO7', { size: 7, weight: 'normal' })}
    ${tact(207, 313, false)}${tact(278, 313, false)}${text(207, 342, 'BTN5', { size: 7 })}${text(278, 342, 'BTN4', { size: 7 })}${text(207, 352, 'MIO51', { size: 6, weight: 'normal' })}${text(278, 352, 'MIO50', { size: 6, weight: 'normal' })}
    <rect x="0" y="446" width="76" height="64" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="460" width="56" height="36" fill="#55595f"/>${text(92, 478, 'USB OTG', { size: 7, rotate: true })}
    <rect x="66" y="566" width="22" height="16" rx="2" fill="#141414"/>${text(100, 574, 'HOST', { size: 7, anchor: 'start', weight: 'normal' })}
    ${pmodBottom(179, 'JE')}${pmodBottom(344, 'JD')}${pmodBottom(514, 'JC')}${pmodBottom(685, 'JB', z20)}
    ${z20 ? `<rect x="366" y="247" width="120" height="120" rx="3" fill="#1d1d1d"/>${Array.from({ length: 9 }, (_, i) => `<rect x="${372 + i * 13}" y="251" width="6" height="112" fill="#2e2e2e"/>`).join('')}
      <rect x="416" y="124" width="32" height="26" rx="2" fill="#f1f1ee"/>${text(432, 164, 'FAN', { size: 7 })}`
    : ic(380, 261, 92, 92, ['ZYNQ', (board.device?.part || 'XC7Z010').toUpperCase()], 9)}
    ${ic(401, 400, 76, 100, ['DDR3L'], 8)}
    ${text(584, 124, 'ZYBO Z7', { size: 26, weight: '900', family: 'Arial Black, Arial' })}
    <rect x="534" y="170" width="12" height="22" fill="#141414"/><rect x="565" y="170" width="12" height="22" fill="#141414"/>${text(540, 206, 'JP4', { size: 6, weight: 'normal' })}${text(571, 206, 'JP3', { size: 6, weight: 'normal' })}
    <rect x="638" y="170" width="18" height="22" rx="2" fill="#2a6fd1"/>${text(647, 206, 'SD QSPI JTAG', { size: 6, weight: 'normal' })}${text(647, 162, 'JP5', { size: 7 })}
    <rect x="594" y="226" width="10" height="7" fill="#3ec43e"/>${text(599, 246, 'PGOOD', { size: 7 })}
    <rect x="657" y="226" width="10" height="7" fill="#d18a1a"/>${text(662, 246, 'DONE', { size: 7 })}
    ${tact(609, 301, true)}${tact(681, 301, true)}${text(609, 330, 'PS-SRST', { size: 7 })}${text(681, 330, 'PROG', { size: 7 })}${text(609, 282, 'BTN7', { size: 7 })}${text(681, 282, 'BTN6', { size: 7 })}
    ${RGB.map(([x, y, name]) => rgbAt(x, y, name)).join('')}
    <rect x="700" y="162" width="130" height="28" fill="#f4f4f4"/>
    ${Array.from({ length: 6 }, (_, i) => `<rect x="${W - 22}" y="${104 + i * 11}" width="7" height="7" fill="#c9a94a"/>`).join('')}${text(W - 30, 100, 'J13', { size: 7, anchor: 'end' })}${text(W - 30, 128, 'JTAG', { size: 7, anchor: 'end', weight: 'normal' })}
    ${jack(231, '#1a1a1a', 'HPH OUT')}${jack(301, '#e06a7a', 'MIC IN')}${jack(370, '#3d7fd6', 'LINE IN')}
    ${pmodSide(true, 490, 'JA')}${text(W - 78, 414, 'XADC', { size: 9, anchor: 'end' })}
    ${Array.from({ length: 4 }, (_, i) => `<rect x="${BTN_X(i) - 20}" y="${BTN_Y - 20}" width="40" height="40" rx="2" fill="#c9ccd1" stroke="#7b8088"/>`).join('')}`;
  const { pcb, put, wrap } = boardFrame({ h, W, H: H + mods.room, art: art + pmodArt(mods), board, title, clockNote });
  // (#2522: given back when the modules are hidden; under the board, the board staying where it is)
  if (mods.room) { pcb.dataset.moduleRoom = mods.room; pcb.classList.add('emu-room-below'); }
  const part = (w, name) => { w.dataset.part = name; return w; };
  const silkText = (t, x, y) => put(h('span', { class: 'emu-silk zy-silk' }, t), x, y);
  const port = (res, k, x, y) => put(h('span', { class: `emu-port${bitFor(res, k) ? '' : ' nc'}` }, portLabel(res, k)), x, y);
  // the power switch on the left edge (ON up), the power good LED (PGOOD) its LED
  const power = part(put(mkPower(), POWER[0], POWER[1] - 18), 'power');
  power.firstChild.classList.add('emu-power-v', 'zy-power');
  // LD3..LD0 over SW3..SW0, their FPGA pins in brackets
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = SW_X(i);
    silkText(`LD${k}(${pinsOf(board, 'led')[k] ?? ''})`, x, LED_Y - 22);
    part(put(mkLed(k, 'emu-led b2-led'), x, LED_Y - 5), `led${k}`);
    port('led', k, x, LED_Y + 8);
    part(put(mkSwitch(k, 'emu-sw bs2-sw zy-sw'), x, SW_Y - 31), `sw${k}`);
    silkText(`SW${k}(${pinsOf(board, 'sw')[k] ?? ''})`, x, SW_Y + 34);
  }
  for (let i = 0; i < 4; i++) port('sw', 3 - i, SW_X(i), SW_Y + 45);
  // BTN3..BTN0, each named with its pin
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = BTN_X(i);
    part(put(mkButton(k, 'emu-btn nx2-btn'), x, BTN_Y - 17), `btn${k}`);
    silkText(`BTN${k}(${pinsOf(board, 'btn')[k] ?? ''})`, x, BTN_Y + 22);
    port('btn', k, x, BTN_Y + 33);
  }
  // the RGB LED LD6 (red, green, blue: numbered after LD0..LD3), in its package
  if (has(board, 'led6_rgb')) {
    const n = ledNumbers(board).led6_rgb, [x, y] = RGB[0];
    ['red', 'green', 'blue'].forEach((c, i) => {
      const l = mkLed(n + i, 'emu-led zy-rgb');
      l.dataset.colour = c;
      part(put(l, x - 8 + i * 8, y - 3), `led6_${c}`);
    });
  }
  putPmods(mods, { board, h, put, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, silk: 'zy-silk', swCls: 'emu-sw bs2-sw zy-sw', btnCls: 'emu-btn nx2-btn' });
  return wrap;
}
// its parts' look: the upright power switch (PGOOD its LED), the RGB LED's three small LEDs; the switches are the
// Basys2's (emulator-basys2.js), the buttons the Nexys2's (emulator-nexys2.js)
zyboZ7Layout.css = `${POWER_V_CSS}${PMOD_CSS}
.zy-power .emu-power-led { left: 574px; top: 145px; width: 10px; height: 7px; border-radius: 0; }
.zy-silk { font-size: 8px; }
.zy-sw { width: 34px; height: 62px; }
.zy-sw::after { height: 24px; }
.zy-sw.on::after { bottom: 31px; }
.emu-led.zy-rgb { width: 6px; height: 6px; border-width: 0; }
`;
