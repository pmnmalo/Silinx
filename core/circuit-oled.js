// A graphic OLED 0.96" 128×64 with an SSD1306 controller on I²C (#5336, part of #3902; docs/CIRCUITS.md): the circuit's
// part (its 4 pins as the common module's: GND, VCC, SCL, SDA, its SDA open drain, the bus's pull-ups the circuit's) and
// its controller as the datasheet says it (Solomon Systech SSD1306): its address 0x3C (core/circuit-i2c.js), a control
// byte after it (Co, bit 7: one byte then another control byte; D/C#, bit 6: data, else commands), the commands (display
// on/off, the charge pump, the addressing modes: horizontal, vertical, page; the column and page addresses, the page
// mode's page and column nibbles, the segment remap, the COM scan direction, contrast, normal / inverse, entire display
// on, the start line; the others' parameters taken), its GDDRAM 8 pages of 128 bytes (bit 0 a page's top row). Its
// display lights while it is on and its charge pump is (as the real module's: Adafruit's and u8g2's init turn both on);
// its RAM's columns and rows as the module shows them (A1 and C8, as those libraries set them: column 0 at the left,
// row 0 at the top). Isomorphic module.

const PIN_NAMES = ['GND', 'VCC', 'SCL', 'SDA'];
const DIR = { GND: 'gnd', VCC: 'vcc', SCL: 'in', SDA: 'oc' };
export const OLED_SSD1306 = {
  type: 'oled-ssd1306', title: 'Graphic OLED 128×64 (SSD1306, I²C)', kind: 'oled', prefix: 'OLED', address: 0x3c, cols: 128, rows: 64,
  // (its SDA read too: an open-drain line, its ACK driven, the master's bits read)
  pins: PIN_NAMES.map((name, i) => ({ n: i + 1, name, dir: DIR[name], dx: i, dy: 0, ...(name === 'SDA' ? { io: true } : {}) })), size: { x0: -3.5, y0: 0, x1: 6.5, y1: 11 },
};

// the commands' parameters (their counts; those not listed have none)
const PARAMS = { 0x20: 1, 0x21: 2, 0x22: 2, 0x81: 1, 0x8d: 1, 0xa8: 1, 0xd3: 1, 0xd5: 1, 0xd9: 1, 0xda: 1, 0xdb: 1, 0x26: 6, 0x27: 6, 0x29: 5, 0x2a: 5, 0xa3: 2 };

/** A controller at power-on: start() an I²C transfer to it begun, write(b) each byte of it; state(): { on, lit, pages,
 *  rows } (on: shown, its display on and its charge pump; lit: the pixels lit on screen; pages: each page's bits set in
 *  its RAM; rows: the screen's 64 rows of 128 '0' / '1', none while it is dark). */
export function createSsd1306() {
  let ram, on, pump, mode, c0, c1, p0, p1, col, page, contrast, inverse, entire, remap, comDec, start, ctl, pending;
  function reset() {
    ram = new Uint8Array(1024); on = false; pump = false; mode = 2; c0 = 0; c1 = 127; p0 = 0; p1 = 7; col = 0; page = 0;
    contrast = 0x7f; inverse = false; entire = false; remap = false; comDec = false; start = 0; ctl = null; pending = null;
  }
  reset();
  function command(b) {
    if (pending) {
      pending.args.push(b);
      if (pending.args.length < PARAMS[pending.op]) return;
      const [a, z] = pending.args, op = pending.op;
      pending = null;
      if (op === 0x20) mode = a & 3;
      else if (op === 0x21) { c0 = a & 127; c1 = z & 127; col = c0; }
      else if (op === 0x22) { p0 = a & 7; p1 = z & 7; page = p0; }
      else if (op === 0x81) contrast = a;
      else if (op === 0x8d) pump = !!(a & 0x04);
      return;
    }
    if (PARAMS[b]) { pending = { op: b, args: [] }; return; }
    if (b === 0xae || b === 0xaf) on = b === 0xaf;
    else if (b === 0xa4 || b === 0xa5) entire = b === 0xa5;
    else if (b === 0xa6 || b === 0xa7) inverse = b === 0xa7;
    else if (b === 0xa0 || b === 0xa1) remap = b === 0xa1;
    else if (b === 0xc0 || b === 0xc8) comDec = b === 0xc8;
    else if (b >= 0x40 && b <= 0x7f) start = b & 63;
    else if (b >= 0xb0 && b <= 0xb7) page = b & 7;
    else if (b <= 0x0f) col = (col & 0x70) | b;
    else if (b <= 0x1f) col = (col & 0x0f) | ((b & 0x07) << 4);
  }
  function data(b) {
    ram[page * 128 + col] = b;
    if (mode === 0) { if (++col > c1) { col = c0; if (++page > p1) page = p0; } }
    else if (mode === 1) { if (++page > p1) { page = p0; if (++col > c1) col = c0; } }
    else col = (col + 1) & 127;
  }
  return {
    reset,
    /** A transfer to it begun (its address acknowledged): a control byte first. */
    start() { ctl = null; },
    write(b) {
      if (!ctl) { ctl = { co: !!(b & 0x80), dc: !!(b & 0x40) }; return; }
      (ctl.dc ? data : command)(b);
      if (ctl.co) ctl = null;
    },
    state() {
      const pages = Array.from({ length: 8 }, (_, p) => { let n = 0; for (let c = 0; c < 128; c++) for (let v = ram[p * 128 + c]; v; v >>= 1) n += v & 1; return n; });
      const shown = on && pump;
      if (!shown) return { on: false, lit: 0, pages, rows: [] };
      const rows = [];
      let lit = 0;
      for (let y = 0; y < 64; y++) {
        const r = ((comDec ? y : 63 - y) + start) % 64;
        let s = '';
        for (let x = 0; x < 128; x++) {
          const c = remap ? x : 127 - x;
          const bit = entire ? 1 : (ram[(r >> 3) * 128 + c] >> (r & 7)) & 1;
          const v = bit ^ (inverse ? 1 : 0);
          lit += v;
          s += v ? '1' : '0';
        }
        rows.push(s);
      }
      return { on: true, lit, pages, rows, contrast };
    },
  };
}
