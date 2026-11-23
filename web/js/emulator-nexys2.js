// Silinx - Board Emulator: the Digilent Nexys2 drawn as the real board (#2480; out of emulator.js, #405). Our own
// drawing, after the board's photos and its reference manual: each part where it is, as it is turned, in proportion
// (the board 860 x 720), with its silkscreen names (the parts' FPGA pins in brackets, as on the board).
// Its drawing (nexys2Art) and its parts' places (nexys2Places) are the circuit editor's Nexys2 too (#5366): its Pmods'
// pins where the circuit's part has them (core/circuit-boards.js BOARD_ART, PMOD_W).
import { holes4, boardFrame, svgText as text, ic, POWER_V_CSS, putPlaces } from './emulator-pcb.js';
import { BOARD_ART, PMOD_W } from '/core/circuit-boards.js';

const { w: W, h: H, pitch: PITCH, pin1: [JA1_X, PIN_Y] } = BOARD_ART.nexys2;
const PMOD_X = (k) => JA1_X - 13.5 + k * PMOD_W * PITCH;
const pinsOf = (board, res) => board.resources.find((r) => r.name === res)?.pins ?? [];
// a Pmod (2 x 6 right-angle header) on the top edge, its blue power jumper on its right, its name under it
const pmod12Top = (x, name) => `<rect x="${x}" y="0" width="104" height="42" rx="2" fill="#141414"/>`
  + Array.from({ length: 12 }, (_, i) => `<rect x="${x + 10 + (i % 6) * PITCH}" y="${PIN_Y - 3.5 + Math.floor(i / 6) * PITCH}" width="7" height="7" fill="#c9a94a"/>`).join('')
  + `<rect x="${x + 110}" y="20" width="12" height="22" rx="2" fill="#2a6fd1"/>` + text(x + 52, 86, name, { size: 11 });
// a D-sub on the left edge, its face out of the board: the metal shell, the black body, the screw locks
const dsubLeft = (y, hgt, name, sub) => `<rect x="0" y="${y}" width="16" height="${hgt}" rx="2" fill="#b9bec6" stroke="#6b7079"/>`
  + `<rect x="16" y="${y + 12}" width="58" height="${hgt - 24}" rx="2" fill="#151515"/>`
  + [y + 8, y + hgt - 8].map((cy) => `<rect x="12" y="${cy - 7}" width="40" height="14" rx="2" fill="#c3c7cd" stroke="#6b7079"/><circle cx="44" cy="${cy}" r="3.5" fill="#6b7079"/>`).join('')
  + text(84, y + hgt / 2, name, { anchor: 'start' }) + text(84, y + hgt / 2 + 11, sub, { size: 7, anchor: 'start', weight: 'normal' });

// where the parts are (their centres)
const POWER = [198, 36];
const SW_X = (i) => 74 + i * 45, SW_Y = 650;             // SW7 (left) .. SW0, upright, ON (HIGH) up, on the bottom edge
const LED_Y = 584;                                       // LD7 .. LD0, each over its switch
const BTN_X = (i) => 486 + i * 64, BTN_Y = 660;          // BTN3 (left) .. BTN0, on the bottom edge
const DIG_X = (i) => 486 + i * 64, DIG_Y = 580;          // AN3 (left) .. AN0, over the buttons

/** Its drawing (an SVG's body, 860 x 720): the PCB, its connectors, chips and silkscreen. */
export function nexys2Art(board) {
  const pin = (res, k = 0) => pinsOf(board, res)[k] ?? '';
  return `
    <defs><linearGradient id="nx2pcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26493a"/><stop offset="1" stop-color="#1d3b2e"/></linearGradient></defs>
    <rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="8" fill="url(#nx2pcb) #26493a" stroke="#0f2219" stroke-width="3"/>
    ${holes4(W, H)}
    <rect x="112" y="0" width="54" height="66" rx="3" fill="#1a1a1a" stroke="#000"/><circle cx="139" cy="18" r="10" fill="#333"/><circle cx="139" cy="18" r="3" fill="#888"/>
    ${text(139, 80, '5V', { size: 8 })}${text(POWER[0], 82, 'POWER', { size: 7 })}${text(POWER[0], 91, 'SWITCH', { size: 7 })}
    ${text(150, 128, 'BAT', { size: 7, weight: 'normal' })}<rect x="140" y="104" width="22" height="12" fill="#141414"/>
    <rect x="232" y="100" width="12" height="22" rx="2" fill="#2a6fd1"/>${text(250, 106, 'WALL', { size: 6, anchor: 'start', weight: 'normal' })}${text(250, 114, 'BAT', { size: 6, anchor: 'start', weight: 'normal' })}${text(250, 122, 'USB', { size: 6, anchor: 'start', weight: 'normal' })}
    ${text(238, 136, 'POWER SELECT', { size: 6, weight: 'normal' })}
    ${pmod12Top(PMOD_X(0), 'JA')}${pmod12Top(PMOD_X(1), 'JB')}${pmod12Top(PMOD_X(2), 'JC')}${pmod12Top(PMOD_X(3), 'JD')}
    <rect x="818" y="${POWER[1] + 52}" width="30" height="30" rx="2" fill="#c9ccd1" stroke="#7b8088"/><circle cx="833" cy="${POWER[1] + 67}" r="8" fill="#1a1a1a"/>${text(833, POWER[1] + 96, 'RESET', { size: 7 })}
    ${dsubLeft(118, 118, 'VGA', '')}${dsubLeft(256, 100, 'RS-232', `RX (${pin('rs232_rx')}) TX (${pin('rs232_tx')})`)}
    <rect x="0" y="378" width="40" height="30" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="386" width="24" height="14" rx="2" fill="#55595f"/>${text(48, 397, 'USB', { anchor: 'start' })}
    <rect x="0" y="420" width="62" height="70" rx="3" fill="#c3c7cd" stroke="#6b7079"/><rect x="0" y="432" width="36" height="46" fill="#9da2a9"/><rect x="40" y="426" width="14" height="58" fill="#d9dce1"/>
    ${text(70, 446, 'PS2', { anchor: 'start' })}${text(70, 458, `PS2C (${pin('ps2_clk')})`, { size: 7, anchor: 'start', weight: 'normal' })}${text(70, 468, `PS2D (${pin('ps2_data')})`, { size: 7, anchor: 'start', weight: 'normal' })}
    <rect x="16" y="508" width="12" height="22" rx="2" fill="#2a6fd1"/>
    <rect x="796" y="172" width="64" height="490" rx="3" fill="#141414"/><rect x="808" y="180" width="34" height="474" fill="#0b0b0b"/>
    ${Array.from({ length: 68 }, (_, i) => `<rect x="${i % 2 ? 827 : 811}" y="${183 + i * 6.8}" width="12" height="3" fill="#c9a94a"/>`).join('')}
    ${text(786, 420, 'J1', { size: 9, anchor: 'end' })}${text(786, 432, 'FX2', { size: 9, anchor: 'end' })}
    <rect x="752" y="676" width="12" height="24" rx="2" fill="#2a6fd1"/>${text(758, 670, 'JP8', { size: 7, weight: 'normal' })}
    ${ic(470, 150, 92, 68, ['RAM', 'MT45W8MW16'], 8)}${ic(560, 330, 62, 48, ['FLASH'], 8)}${ic(196, 360, 60, 56, ['USB2', 'CTRL'], 7)}${ic(300, 168, 46, 40, ['XCF04S'], 7)}
    <rect x="384" y="268" width="104" height="104" rx="3" fill="#121212" stroke="#333"/>${text(436, 314, 'SPARTAN-3E', { size: 10, fill: '#ddd' })}${text(436, 330, (board.device?.part || 'XC3S500E').toUpperCase(), { size: 8, weight: 'normal', fill: '#bbb' })}
    <rect x="264" y="256" width="48" height="64" rx="2" fill="#1a1a1a"/>${Array.from({ length: 8 }, (_, i) => `<circle cx="${i < 4 ? 274 : 302}" cy="${266 + (i % 4) * 14}" r="3" fill="#c9a94a"/>`).join('')}${text(288, 334, `IC7 (${pin('clk1')})`, { size: 7, weight: 'normal' })}
    <rect x="640" y="250" width="30" height="24" rx="2" fill="#d8dbe0" stroke="#7b8088"/>${text(655, 288, `50MHz (${pin('clk')})`, { size: 7, weight: 'normal' })}
    <rect x="320" y="368" width="54" height="22" rx="3" fill="#d8dbe0" stroke="#7b8088"/>${text(347, 402, 'X1', { size: 7, weight: 'normal' })}
    <rect x="132" y="444" width="146" height="34" rx="4" fill="none" stroke="#fff" stroke-width="2"/>${text(205, 471, 'NEXYS 2', { size: 24, weight: '900', family: 'Arial Black, Arial' })}
    ${text(48, 640, 'HIGH', { size: 7, rotate: true })}${text(48, 684, 'LOW', { size: 7, rotate: true })}
    <rect x="${DIG_X(0) - 34}" y="${DIG_Y - 36}" width="${DIG_X(3) - DIG_X(0) + 68}" height="72" rx="3" fill="#0b0b0b" stroke="#2a2a2a"/>${text(DIG_X(0) - 34, DIG_Y - 42, 'DISP1', { size: 7, anchor: 'start', weight: 'normal' })}`;
}

/** Its parts' places, in the order the layout puts them (as emulator-basys2.js basys2Places). */
export function nexys2Places(board) {
  const out = [], at = (kind, x, y, more = {}) => out.push({ kind, x, y, ...more });
  // the power switch, upright on the top edge beside the 5 V jack (ON up), the POWER LED beside it
  at('power', POWER[0], POWER[1] - 18, { cls: ['emu-power-v', 'nx2-power'] });
  // LD7..LD0 over SW7..SW0 (left part of the bottom edge), their FPGA pins in brackets
  for (let i = 0; i < 8; i++) {
    const k = 7 - i, x = SW_X(i);
    at('silk', x, LED_Y - 22, { text: `LD${k}` });
    at('led', x, LED_Y - 8, { k, cls: 'emu-led b2-led', w: 16, h: 10 });
    at('silk', x, LED_Y + 3, { text: `(${pinsOf(board, 'led')[k] ?? ''})` });
    at('port', x, LED_Y + 14, { res: 'led', k });
    at('sw', x, SW_Y - 28, { k, cls: 'emu-sw nx2-sw', w: 30, h: 54 });
    at('silk', x, SW_Y + 30, { text: `SW${k} (${pinsOf(board, 'sw')[k] ?? ''})` });
    at('port', x, SW_Y + 41, { res: 'sw', k });
  }
  // the 4-digit display (AN3..AN0) and, under it, BTN3..BTN0
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = DIG_X(i);
    at('digit', x, DIG_Y - 27, { k });
    at('port', x, DIG_Y + 37, { res: 'an', k });
  }
  for (let i = 0; i < 4; i++) {
    const k = 3 - i, x = BTN_X(i);
    at('silk', x, BTN_Y - 34, { text: `BTN${k}` });
    at('btn', x, BTN_Y - 18, { k, cls: 'emu-btn nx2-btn', w: 34, h: 34, look: 'grey' });
    at('silk', x, BTN_Y + 20, { text: `(${pinsOf(board, 'btn')[k] ?? ''})` });
    at('port', x, BTN_Y + 31, { res: 'btn', k });
  }
  return out;
}

/** Digilent Nexys2: dark green PCB. The top edge: the 5 V jack and the upright POWER SWITCH beside it (left), the
 *  Pmods JA..JD (2 x 6, each with its blue power jumper), the RESET button in the top-right corner; the left edge: the
 *  VGA and RS-232 connectors, the mini-USB, the PS/2 connector; the right edge: the Hirose FX2 connector (J1); the FPGA
 *  in the middle with the RAM and the flash above it, the 50 MHz oscillator and the clock socket; LD7..LD0 over the slide
 *  switches SW7..SW0 along the bottom edge (left), the 4-digit display DISP1 over BTN3..BTN0 (right). */
export function nexys2Layout({ board, title, h, mkDigit, mkLed, mkSwitch, mkButton, portLabel, bitFor, clockNote, mkPower }) {
  const { put, wrap } = boardFrame({ h, W, H, art: nexys2Art(board), board, title, clockNote });
  putPlaces(nexys2Places(board), { h, put, silk: 'emu-silk nx2-silk', mkDigit, mkLed, mkSwitch, mkButton, mkPower, portLabel, bitFor });
  return wrap;
}
// its parts' look: the upright power switch (the POWER LED beside it), the slide switches, the square tact buttons
nexys2Layout.css = `${POWER_V_CSS}
.nx2-power .emu-power-led { left: 24px; top: 14px; }
.nx2-silk { font-size: 8px; }
.nx2-sw { width: 30px; height: 54px; border-radius: 2px; background: #111; border: 1px solid #000; position: relative; cursor: pointer; }
.nx2-sw::after { content: ''; position: absolute; left: 5px; right: 5px; height: 21px; bottom: 4px; background: #4a4a4a; border: 1px solid #000; border-radius: 1px; transition: bottom .08s; }
.nx2-sw.on::after { bottom: 27px; background: #6a6a6a; }
.nx2-btn { width: 34px; height: 34px; border-radius: 3px; background: #c9ccd1; border: 1px solid #7b8088; position: relative; }
.nx2-btn::after { content: ''; position: absolute; left: 8px; top: 8px; width: 18px; height: 18px; border-radius: 50%; background: radial-gradient(#4a4a4a, #151515); }
.nx2-btn.on { background: #c9ccd1; border-color: #7b8088; }
.nx2-btn.on::after { background: radial-gradient(#d33, #700); }
`;
