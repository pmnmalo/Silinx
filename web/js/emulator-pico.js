// Silinx - the Raspberry Pi Pico and Pico W drawn (#5898): the boards as they are (docs/UI-GUIDELINES.md, #5636), seen
// from above and turned on their side, the micro-USB socket on the left: the green PCB (51 x 21 mm), its 40 castellated
// pads along its long edges (pins 1–20 along the bottom, 21–40 back along the top, each with its name beside it), the
// micro-USB socket, the BOOTSEL button and the LED by it, the RP2040 in the middle, its flash, its crystal, its regulator,
// the three SWD pads at the right end and the silkscreen; a Pico W's wireless module (its shield can) and its antenna at
// the right end instead of the SWD pads, which move to the middle. Its pins are where the circuit's part has them
// (core/circuit-boards.js: BOARD_ART, the part's pins), and this drawing is the circuit editor's (web/js/circuit-draw-board.js).
import { svgText, ic } from './emulator-pcb.js';
import { BOARD_ART, BOARD_PARTS } from '/core/circuit-boards.js';

// the board's own colours: its green solder mask, its gold pads, its silver parts, its white silkscreen
const C = { pcb: '#1e7a3e', edge: '#0f4d24', pad: '#d4b25a', hole: '#0f3d1f', metal: '#c7ccd0', metalEdge: '#868c91', silk: '#f4f6f2', button: '#f2f2ee', led: '#7bd88f', can: '#3a3d40' };

/** The board's drawing (`id` pico or pico-w): { art (an SVG's body), W, H, at(pin) its place, l its LED's place }. */
export function picoArt(id = 'pico') {
  const a = BOARD_ART[id], part = BOARD_PARTS.find(p => p.type === id), w = id === 'pico-w';
  const W = a.w, H = a.h, xy = (dx, dy) => ({ x: a.pin1[0] + dx * a.pitch, y: a.pin1[1] + dy * a.pitch });
  const at = (name) => { const q = part.pins.find(p => p.name === name); return xy(q.dx, q.dy); };
  // the castellated pads: a half hole on the edge, its gold pad around it; each pin's name toward the board's middle
  const pads = part.pins.map(q => {
    const { x, y } = xy(q.dx, q.dy), top = q.dy < 0;
    return `<rect x="${x - 8}" y="${top ? 1 : y - 13}" width="16" height="${top ? y + 12 : H - y + 12}" rx="3" fill="${C.pad}"/>`
      + `<circle cx="${x}" cy="${top ? 1 : H - 1}" r="5" fill="${C.hole}"/>`;
  }).join('');
  const labels = part.pins.map(q => {
    const { x, y } = xy(q.dx, q.dy), top = q.dy < 0;
    return svgText(x + 3, top ? y + 22 : y - 22, q.name, { size: 7, fill: C.silk, anchor: top ? 'end' : 'start', rotate: true });
  }).join('');
  // the micro-USB socket on the left edge, the BOOTSEL button and the LED by it
  const usb = `<rect x="0" y="72" width="44" height="54" rx="3" fill="${C.metal}" stroke="${C.metalEdge}" stroke-width="2"/><rect x="8" y="88" width="10" height="22" rx="2" fill="${C.metalEdge}"/>`;
  const l = { x: w ? 340 : 70, y: w ? 70 : 52 };
  const bootsel = `<rect x="66" y="112" width="40" height="40" rx="4" fill="${C.metal}"/><circle cx="86" cy="132" r="13" fill="${C.button}" stroke="${C.metalEdge}"/>`
    + svgText(86, 106, 'BOOTSEL', { size: 7, fill: C.silk });
  const led = `<rect x="${l.x - 7}" y="${l.y - 5}" width="14" height="10" rx="2" fill="${C.led}" opacity="0.5"/>` + svgText(l.x, l.y + 18, 'LED', { size: 7, fill: C.silk });
  // the RP2040, its flash, its crystal and its regulator
  const chips = ic(w ? 176 : 198, 66, 66, 66, ['RP2-B2'], 9) + ic(w ? 124 : 132, 48, 36, 28, ['W25Q16'], 6)
    + `<rect x="${w ? 126 : 134}" y="124" width="28" height="16" rx="3" fill="${C.metal}" stroke="${C.metalEdge}"/>` + ic(300, 120, 26, 22, ['RT'], 6);
  // a Pico's SWD pads at its right end; a Pico W's wireless module and antenna there, its SWD pads by the RP2040
  const swd = (x0, y0) => [0, 1, 2].map(i => `<circle cx="${x0}" cy="${y0 + i * 22}" r="7" fill="${C.pad}"/><circle cx="${x0}" cy="${y0 + i * 22}" r="3" fill="${C.hole}"/>`).join('');
  const end = w
    ? `<rect x="362" y="44" width="94" height="110" rx="4" fill="${C.metal}" stroke="${C.metalEdge}" stroke-width="2"/>` + svgText(409, 104, 'CYW43439', { size: 9, fill: C.can })
      + `<path d="M464 50v98M472 58v82" fill="none" stroke="${C.pad}" stroke-width="4"/>` + swd(272, 70)
    : swd(452, 77) + svgText(428, 99, 'DEBUG', { size: 7, fill: C.silk, rotate: true });
  const art = `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="8" fill="${C.pcb}" stroke="${C.edge}" stroke-width="2"/>`
    + pads + usb + bootsel + led + chips + end
    + svgText(w ? 230 : 330, 158, w ? 'Raspberry Pi Pico W' : 'Raspberry Pi Pico', { size: 10, fill: C.silk })
    + labels;
  return { art, W, H, at, l };
}
