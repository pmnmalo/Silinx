// The circuit editor's drawing of a board (#5215, core/circuit-boards.js), as the emulators draw it (#5366): the Board
// Emulator's Basys2 and Nexys2 (web/js/emulator-basys2.js, emulator-nexys2.js: their drawing, their LEDs, switches,
// buttons, digits and power switch where they put them), the System Emulator's Arduino Uno and Nano
// (emulator-arduino.js) and ESP32 DevKitC (emulator-esp32.js, #5495), at the circuit's scale (a pitch of the drawing a pitch of the grid), its pin 1 at the part's
// place: its headers' and Pmods' pins where the circuit's are. Its id under it. Drawn under the wires, with the
// breadboards (web/js/circuit-draw.js); all SVG, so that Print and the image export have it. Its parts' look:
// web/css/circuit-editor.css.
import { sv } from './dom.js';
import { BOARD_ART } from '/core/circuit-boards.js';
import { mcuBoard } from '/core/system-doc.js';
import { BOARDS } from '/core/boards.js';
import { svgEl } from './emulator-pcb.js';
import { arduinoArt } from './emulator-arduino.js';
import { esp32Art } from './emulator-esp32.js';
import { basys2Art, basys2Places } from './emulator-basys2.js';
import { nexys2Art, nexys2Places } from './emulator-nexys2.js';
import { makeDigit } from './emulator.js';

const P = 20;
const FPGA = { basys2: [basys2Art, basys2Places], nexys2: [nexys2Art, nexys2Places] };

/** The body of a board part, appended to g (its pins are circuit-draw.js's). */
export function drawBoard(g, p, d) {
  const a = BOARD_ART[d.board], k = P / a.pitch;
  const ox = p.x * P - a.pin1[0] * k, oy = p.y * P - a.pin1[1] * k, w = a.w * k, ht = a.h * k;
  // (its body: what selects it; its outline over the drawing, lit when selected)
  g.append(sv('rect', { x: ox, y: oy, width: w, height: ht, rx: 4, class: 'circ-board-body' }));
  const art = sv('g', { class: 'circ-board-art', transform: `translate(${ox} ${oy}) scale(${k})`, 'data-no-i18n': 'true' });
  const fpga = FPGA[d.board];
  if (fpga) {
    const board = BOARDS.find((b) => b.id === d.board);
    art.append(svgEl(a.w, a.h, fpga[0](board)));
    for (const q of fpga[1](board)) placed(art, q);
  } else {
    // (an Arduino's LED L and power LED; an ESP32's power LED, #5495)
    const { art: body, l, on } = d.board === 'esp32-devkitc' ? esp32Art() : arduinoArt(mcuBoard(d.board));
    art.append(svgEl(a.w, a.h, body), ...(l ? [sv('circle', { cx: l.x, cy: l.y, r: 6, class: 'circ-bd-led' })] : []), sv('circle', { cx: on.x, cy: on.y, r: 6, class: 'circ-bd-led circ-bd-on' }));
  }
  g.append(art, sv('rect', { x: ox, y: oy, width: w, height: ht, rx: 4, class: 'circ-board-outline' }),
    sv('text', { x: ox, y: oy + ht + 14, class: 'circ-label', 'data-no-i18n': 'true' }, p.label || p.id));
}

// one of an FPGA board's parts where the Board Emulator puts it (x its middle, y its top; emulator-pcb.js putPlaces),
// drawn as it shows it off: an LED dark, a switch down, a button up, a digit dark, the power switch on
function placed(art, q) {
  const { x, y } = q;
  if (q.kind === 'silk') art.append(sv('text', { x, y: y + 7, 'text-anchor': 'middle', class: 'circ-bd-silk' }, q.text));
  else if (q.kind === 'led') art.append(sv('rect', { x: x - q.w / 2, y, width: q.w, height: q.h, rx: 2, class: 'circ-bd-led' }));
  else if (q.kind === 'sw') {
    art.append(sv('rect', { x: x - q.w / 2, y, width: q.w, height: q.h, rx: 2, class: 'circ-bd-sw' }),
      sv('rect', { x: x - q.w * 0.35, y: y + q.h * 0.54, width: q.w * 0.7, height: q.h * 0.39, rx: 1, class: 'circ-bd-sw-knob' }));
  } else if (q.kind === 'btn') {
    art.append(sv('rect', { x: x - q.w / 2, y, width: q.w, height: q.h, rx: 3, class: `circ-bd-btn circ-bd-btn-${q.look}` }),
      sv('circle', { cx: x, cy: y + q.h / 2, r: q.w * 0.26, class: `circ-bd-cap circ-bd-cap-${q.look}` }));
  } else if (q.kind === 'digit') {
    const s = makeDigit().el;
    s.setAttribute('x', x - 18); s.setAttribute('y', y);
    art.append(s);
  } else if (q.kind === 'power') art.append(sv('rect', { x: x - 8, y, width: 16, height: 36, rx: 2, class: 'circ-bd-sw' }), sv('rect', { x: x - 7, y: y + 2, width: 14, height: 15, rx: 1, class: 'circ-bd-pow-knob' }));
}
