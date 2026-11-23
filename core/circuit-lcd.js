// A character LCD 16×2 with an HD44780 controller (#5330, part of #3902; docs/CIRCUITS.md): the circuit's part (its 16
// pins as the module's: VSS, VDD, V0, RS, RW, E, D0..D7, A, K, in a row) and its controller, as the datasheet says it
// (Hitachi HD44780U): a write on E's falling edge, RS 0 a command, 1 a character (or a custom character's row while
// the CGRAM is addressed); 8-bit mode at power-on, 4-bit after a function set with DL 0 (each byte two nibbles on
// D7..D4, the high one first); the display off at power-on (its program turns it on); its DDRAM 80 characters, two lines
// of 40 at 0x00 and 0x40 (one line of 80 when N is 0), 16 of each shown from the display's shift; the characters the
// A00 ROM's (its ASCII but ¥ for \ and the arrows for ~ and DEL; a custom character, 0 to 7, a box). Reads (RW 1) are
// not simulated: the busy flag is never set, as a program that waits enough sees it. Isomorphic module.

/** The module's pins, in a row (pin 1 VSS on the left, as on its header). */
const PIN_NAMES = ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'];
const DIR = { VSS: 'gnd', VDD: 'vcc', V0: 'nc', A: 'nc', K: 'nc' };
export const LCD_1602 = {
  type: 'lcd-1602', title: 'Character LCD 16×2 (HD44780)', kind: 'lcd', prefix: 'LCD', cols: 16, rows: 2, size: { x0: -1.5, y0: 0, x1: 30, y1: 14 },
  pins: PIN_NAMES.map((name, i) => ({ n: i + 1, name, dir: DIR[name] ?? 'in', dx: i, dy: 0 })),
};

// a character code as the A00 ROM draws it
export function lcdChar(code) {
  if (code < 0x10) return '▯';
  if (code === 0x5c) return '¥';
  if (code === 0x7e) return '→';
  if (code === 0x7f) return '←';
  if (code >= 0x20 && code < 0x7e) return String.fromCharCode(code);
  return '▒';
}

/** A controller at power-on: write(rs, bus) on each falling edge of E (bus: D7..D0 as a number, D3..D0 ignored in 4-bit
 *  mode); state(): { on, lines: [text…] (empty while the display is off), cursor: { row, col } | null, blink } (its
 *  custom characters kept, drawn as a box). */
export function createLcd({ cols = 16, rows = 2 } = {}) {
  let ddram, cgram, ac, cg, inCg, inc, autoShift, on, cursor, blink, shift, eight, twoLines, half;
  function reset() {
    ddram = new Uint8Array(128).fill(0x20); cgram = new Uint8Array(64); ac = 0; cg = 0; inCg = false;
    inc = true; autoShift = false; on = false; cursor = false; blink = false; shift = 0; eight = true; twoLines = false; half = null;
  }
  reset();
  // the DDRAM address after ac, one step forward or back (two lines: 0x00–0x27 then 0x40–0x67; one: 0x00–0x4F)
  const step = (a, up) => {
    if (!twoLines) return (a + (up ? 1 : 79)) % 80;
    if (up) return a === 0x27 ? 0x40 : a === 0x67 ? 0x00 : a + 1;
    return a === 0x00 ? 0x67 : a === 0x40 ? 0x27 : a - 1;
  };
  function command(b) {
    if (b & 0x80) { ac = b & 0x7f; inCg = false; return; }
    if (b & 0x40) { cg = b & 0x3f; inCg = true; return; }
    if (b & 0x20) { eight = !!(b & 0x10); twoLines = !!(b & 0x08); return; }
    if (b & 0x10) { const right = !!(b & 0x04); if (b & 0x08) shift += right ? -1 : 1; else ac = step(ac, right); return; }
    if (b & 0x08) { on = !!(b & 0x04); cursor = !!(b & 0x02); blink = !!(b & 0x01); return; }
    if (b & 0x04) { inc = !!(b & 0x02); autoShift = !!(b & 0x01); return; }
    if (b & 0x02) { ac = 0; shift = 0; inCg = false; return; }
    if (b & 0x01) { ddram.fill(0x20); ac = 0; shift = 0; inc = true; inCg = false; }
  }
  function data(b) {
    if (inCg) { cgram[cg] = b & 0x1f; cg = (cg + (inc ? 1 : 63)) % 64; return; }
    ddram[ac] = b;
    ac = step(ac, inc);
    if (autoShift) shift += inc ? 1 : -1;
  }
  return {
    reset,
    write(rs, bus) {
      if (!eight) {
        const nib = (bus >> 4) & 0x0f;
        if (half == null) { half = nib; return; }
        bus = (half << 4) | nib; half = null;
      }
      (rs ? data : command)(bus & 0xff);
    },
    state() {
      const lines = [], span = twoLines ? 40 : 80;
      for (let r = 0; r < rows; r++) {
        if (!on || (!twoLines && r > 0)) { lines.push(''); continue; }
        const base = r * 0x40;
        let s = '';
        for (let c = 0; c < cols; c++) s += lcdChar(ddram[base + ((((c + shift) % span) + span) % span)]);
        lines.push(s);
      }
      // (the cursor where the address counter is, while it is shown and on screen)
      let at = null;
      if (on && cursor && !inCg) {
        const row = twoLines && ac >= 0x40 ? 1 : 0, col = ((((ac - row * 0x40 - shift) % span) + span) % span);
        if (col < cols) at = { row, col };
      }
      return { on, lines, cursor: at, blink: on && blink };
    },
  };
}
