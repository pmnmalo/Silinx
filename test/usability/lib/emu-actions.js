// Usability tests (#5206, phase 5): the Board Emulator as a person uses it (Tools ▸ Board Emulator; ⏸ Pause and
// ▶ Run; a switch clicked; a button clicked, or Shift+clicked to keep it pressed and Shift+clicked again to let it go;
// a line typed in the Serial terminal and Enter; BTN0…) and what they read off it: the LEDs lit, the 7-segment
// display's segments, the Serial terminal's text, the VGA monitor's picture and the line under it, the board's time.
// The board's time of what the person did (the cycle an input changed) is read from the emulator itself (its
// simulator's time: what its status line writes), for the reference (lib/board-ref.js) to be given the same inputs.
import { tr } from './hdl-actions.js';

const DOC = '.doc:not([hidden]) .emu';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The digits a segment pattern ('abcdefg', '1' lit) shows: 0-9, A-F as the examples draw them, ' ' none. */
const GLYPHS = { '0000000': ' ', '1111110': '0', '0110000': '1', '1101101': '2', '1111001': '3', '0110011': '4', '1011011': '5', '1011111': '6',
  '1110000': '7', '1111111': '8', '1111011': '9', '1110111': 'A', '0011111': 'b', '1001110': 'C', '0111101': 'd', '1001111': 'E', '1000111': 'F' };
/** A display's digits ([an<0>… an<3>], displayOf's) as a person reads them, left to right, the points after their
 *  digit: ' 3.97' (a dark digit a space). */
export const displayText = (digits) => [...digits].reverse().map((d) => (d ? `${GLYPHS[d.seg] ?? '?'}${d.dp === '1' ? '.' : ''}` : ' ')).join('');

export function emuActions(page) {
  const view = (fn, ...a) => page.eval(fn, ...a);
  const a = {
    /** Tools ▸ Board Emulator: its document in front, the design running on the compiled engine; the console's lines
     *  it said (its first, then its notes) once they stop coming. */
    async open() {
      const [toolsL, emuL] = await tr(page, ['Tools', 'Board Emulator']);
      await page.menu(toolsL, emuL);
      await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'the emulator running', timeout: 120000 });
      if (await view(() => window.Silinx.active.view.engine) !== 'compiled') throw new Error('the emulator is not on its compiled engine');
    },
    /** The board's time: its clock cycles (its simulator's time over the clock's period). */
    cycle: () => view(() => { const v = window.Silinx.active.view; return Math.round(v.sim.now / (v.wiring.clocks[0]?.period || 20000)); }),
    /** Whether it runs (its toolbar's first button ⏸ Pause). */
    running: async () => (await view((d) => document.querySelector(`${d} .emu-bar .btn`).textContent, DOC)) === (await tr(page, ['⏸ Pause']))[0],
    /** ⏸ Pause: the run in flight over, the board's time still (the cycle it stopped at). */
    async pause() {
      const [pauseL] = await tr(page, ['⏸ Pause']);
      await page.click(`${DOC} .emu-bar .btn`, { text: pauseL });
      let c = -1;
      for (let k = 0; k < 100; k++) {
        await sleep(60);
        const n = await view(() => (window.Silinx.active.view.sim.busy ? -1 : window.Silinx.active.view.sim.now));
        if (n >= 0 && n === c) break;
        c = n;
      }
      await sleep(100);   // (its last picture drawn)
      return a.cycle();
    },
    /** ▶ Run. */
    async run() {
      const [runL] = await tr(page, ['▶ Run']);
      await page.click(`${DOC} .emu-bar .btn`, { text: runL });
    },
    /** Run until the board's time is `cycles` on from now, then ⏸ Pause: the cycle it stopped at. */
    async runFor(cycles) {
      const until = (await a.cycle()) + cycles;
      await a.run();
      await page.waitFor((u) => { const v = window.Silinx.active.view; return v.sim.now / (v.wiring.clocks[0]?.period || 20000) >= u; }, [until], { what: `the board's time at cycle ${until}`, timeout: 120000 });
      return a.pause();
    },
    /** A switch (SW`k`) clicked. */
    switch: (k) => page.click(`${DOC} [data-part="sw${k}"]`),
    /** A button (BTN`k`) clicked: pressed and let go (held down until the design saw a real press). */
    button: (k) => page.click(`${DOC} [data-part="btn${k}"]`),
    /** A button Shift+clicked: kept pressed, or let go when it was. */
    latch: (k) => page.click(`${DOC} [data-part="btn${k}"]`, { modifiers: 8 }),
    /** The LEDs lit: LD7..LD0, '1' lit. */
    leds: () => view((d) => [7, 6, 5, 4, 3, 2, 1, 0].map((k) => {
      const l = document.querySelector(`${d} [data-part="led${k}"]`);
      const e = l?.classList.contains('emu-led') ? l : l?.querySelector('.emu-led');
      return e && e.style.boxShadow && e.style.boxShadow !== 'none' ? '1' : '0';
    }).join(''), DOC),
    /** The display: each digit, an<0>… an<3>, its segments a..g and point lit ('1': more than half bright), null dark. */
    digits: () => view((d) => [0, 1, 2, 3].map((k) => {
      const s = document.querySelector(`${d} [data-part="an${k}"] svg`);
      if (!s) return null;
      const lit = (e) => (Number(e.getAttribute('opacity')) > 0.5 ? '1' : '0');
      const seg = [...s.querySelectorAll('path')].map(lit).join(''), dp = lit(s.querySelector('circle'));
      return seg === '0000000' && dp === '0' ? null : { seg, dp };
    }), DOC),
    /** A line typed in the Serial terminal and Enter. */
    async typeLine(text) {
      await page.click(`${DOC} .emu-serial-in`);
      await page.type(text);
      await page.key('Enter');
    },
    /** The Serial terminal's text. */
    terminal: () => view((d) => document.querySelector(`${d} .emu-serial-out`).textContent, DOC),
    /** The VGA monitor's picture: its rows run-length encoded as lib/board-ref.js vgaFrameOf's (the colour bits of
     *  each pixel, from its colour by the monitor's palette), and the line under it. */
    vga: () => view(async (d) => {
      const { vgaPalette } = await import('/core/vga.js');
      const pal = vgaPalette([3, 3, 2]), idx = new Map([...pal].map((c, i) => [c, i]));
      const cv = document.querySelector(`${d} .emu-vga canvas`);
      const px = new Uint32Array(cv.getContext('2d').getImageData(0, 0, 640, 480).data.buffer);
      const rows = [];
      for (let y = 0; y < 480; y++) {
        const runs = [];
        for (let x = 0; x < 640; x++) {
          const v = idx.get(px[y * 640 + x]) ?? -1;
          if (runs.length && runs.at(-1)[0] === v) runs.at(-1)[1]++;
          else runs.push([v, 1]);
        }
        rows.push(runs.map(([v, n]) => `${v}x${n}`).join(','));
      }
      return { rows, stat: document.querySelector(`${d} .emu-vga-stat`).textContent };
    }, DOC),
  };
  return a;
}
