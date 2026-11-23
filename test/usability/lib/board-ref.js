// Usability tests (#5206, phase 5): the Board Emulator's reference, the design simulated by core's simulator (the
// event-driven one, the behavioural RTL: not the emulator's compiled netlist) for the inputs the emulator was given,
// each set at the clock cycle it was there (`scale`: the design's timing generics and the cycles divided alike, as the
// emulator's Timing ÷k would, so that seconds of the board's time simulate in seconds); what a person reads off the
// board from it: the LEDs, the 7-segment display's digits (each digit's segments while its anode is on), what the
// design sends on the serial port (its TX decoded, 8N1), a VGA frame (the colour bits of each pixel, found from the
// sync pulses as a monitor finds them) and the sync's timing.
import { compile, elaborate } from '../../../core/compile.js';
import { Simulator } from '../../../core/simulator.js';
import * as V from '../../../core/values.js';

const bits = (v) => (v ? V.toBin(v) : null);

/**
 * The design `top` of `files` ([{ path, text }]) on a board's clock of `period` ps (its port `clock`), its generics
 * `generics`; `watch`: the ports (or the signals, by their path below the top) whose waveforms are kept (read back by
 * `at`: the display's, the VGA's, the serial port's); its
 * other inputs at rest from the start, as the board's are: 0 (a switch off, a button let go), or `idle`'s level (a
 * serial port's RX high).
 * Returns { design, sim, cycle(), run(cycle), set(port, bit, value), value(port), signal(path), force(path, n), at(port, cycle) }.
 */
export function boardReference(files, top, { generics = {}, period = 20000, clock = 'clk', watch = [], idle = {} } = {}) {
  const lib = compile(files.map((f) => ({ path: f.path, text: f.text })));
  const design = elaborate(lib, top, { generics });
  const errors = [...lib.errors, ...design.diags].filter((d) => d.severity === 'error');
  if (errors.length) throw new Error(`the reference does not elaborate: ${errors.map((e) => e.message).join('; ')}`);
  const sim = new Simulator(design);
  const port = (name) => {
    const p = design.top.ports.find((x) => x.name === name);
    if (!p) throw new Error(`the reference has no port ${name}`);
    return p.sig;
  };
  const byPath = new Map();
  const walk = (inst, prefix) => {
    for (const x of inst.signals || []) byPath.set(prefix + x.name, x);
    for (const c of inst.children || []) walk(c, `${prefix}${c.name}.`);
  };
  walk(design.top, '');
  const signal = (p) => {
    const x = byPath.get(p);
    if (!x) throw new Error(`the reference has no signal ${p}`);
    return x;
  };
  const named = (n) => (design.top.ports.some((x) => x.name === n) ? port(n) : signal(n));
  // (the waveforms of the signals watched only: the others' would fill the memory in a million cycles)
  const kept = new Set(watch.map(named));
  for (const x of design.signals) if (!kept.has(x)) x.wave = null;
  sim.addClock(port(clock), { period });
  for (const p of design.top.ports) if (p.dir === 'in' && p.name !== clock) sim.force(p.sig, V.fromInt(idle[p.name] ? (1n << BigInt(p.sig.t.w)) - 1n : 0n, p.sig.t.w));
  return {
    design, sim,
    cycle: () => Math.round(sim.now / period),
    /** Run to the start of clock cycle `c` (its rising edge half a period later). */
    run(c) { if (c * period > sim.now) sim.run(c * period); },
    /** An input's bit set (a whole port: `bit` null). */
    set(name, bit, value) {
      const s = port(name), cur = s.val && !s.val.x ? s.val.v : 0n;
      const m = bit == null ? (1n << BigInt(s.t.w)) - 1n : 1n << BigInt(bit);
      sim.force(s, V.fromInt(value ? cur | m : cur & ~m, s.t.w));
    },
    /** A port's bits (most significant first), 'x' for an unknown one. */
    value: (name) => bits(port(name).val),
    signal,
    /** An internal signal (its path below the top: 'sx', 'db0.count') held at `n`. */
    force(p, n) { const s = signal(p); sim.force(s, V.fromInt(BigInt(n), s.t.w)); },
    /** A watched port's or signal's bits at the start of cycle `c`. */
    at: (name, c) => bits(sim.valueAt(named(name), c * period)),
  };
}

/**
 * The 7-segment display as a person reads it, from the display's waveforms (its ports watched) in the `rounds` refresh
 * rounds before now (the reference not run on: an input of this cycle is set after the read), sampled `samples`
 * times a digit (`refresh`: the design's cycles a digit): for each digit, right (an<0>) to left, its segments a..g
 * and its point lit ('1') or not ('0') while its anode was on (active low, as on the Basys2), or null when it was
 * never on. A digit shown two ways in the rounds: its last.
 */
export function displayOf(ref, { refresh, rounds = 1, samples = 4, an = 'an', seg = 'seg', dp = 'dp' } = {}) {
  const step = Math.max(1, Math.floor(refresh / samples)), digits = [null, null, null, null];
  const now = ref.cycle();
  for (let c = Math.max(0, now - 4 * refresh * rounds); c < now; c += step) {
    const a = ref.at(an, c), s = ref.at(seg, c), p = ref.at(dp, c);
    if (!a || /x/.test(a)) continue;
    const k = [...a].reverse().indexOf('0');
    if (k < 0 || a.split('0').length !== 2) continue;
    // (seg<0> is a: the segments a..g lit at '0')
    digits[k] = { seg: [...s].reverse().map((b) => (b === '0' ? '1' : b === '1' ? '0' : 'x')).join(''), dp: p === '0' ? '1' : p === '1' ? '0' : 'x' };
  }
  return digits;
}

/** The bytes a TX line sent (8N1 at `bitCycles` cycles a bit) between cycles `from` and `to` ([{ byte, error }]),
 *  its waveform `ref.at`'s: a start bit's falling edge, each bit read in its middle, the stop bit high. */
export function serialOf(ref, { port = 'tx', bitCycles, from = 0, to = ref.cycle() }) {
  const out = [];
  for (let c = from + 1; c < to; c++) {
    if (ref.at(port, c - 1) !== '1' || ref.at(port, c) !== '0') continue;
    if (c + 10 * bitCycles > to) break;
    let byte = 0;
    for (let i = 0; i < 8; i++) if (ref.at(port, c + Math.floor((i + 1.5) * bitCycles)) === '1') byte |= 1 << i;
    out.push({ byte, error: ref.at(port, c + Math.floor(9.5 * bitCycles)) !== '1' });
    c += Math.floor(9.5 * bitCycles);
  }
  return out;
}

/** The RX line's levels for `bytes` sent one after the other (8N1, `bitCycles` cycles a bit) from cycle `at`:
 *  [{ cycle, level }], the line idle (high) at the end. */
export function serialFrames(bytes, { at, bitCycles }) {
  const out = [];
  bytes.forEach((b, k) => {
    const t = at + k * 10 * bitCycles;
    const levels = [0, ...Array.from({ length: 8 }, (_, i) => (b >> i) & 1), 1];
    levels.forEach((level, i) => out.push({ cycle: t + i * bitCycles, level }));
  });
  return out;
}

/**
 * A VGA frame as a monitor finds it in the sync pulses (640x480 at 60 Hz: a pixel every `div` cycles, 800 a line,
 * 525 lines; HSYNC low from pixel 656, VSYNC low from line 490, both active low): the frame whose VSYNC falls first
 * after cycle `from`, run to; its rows, each run-length encoded ('7x3,255x637': the colour bits' value, red's least
 * significant first as the board's resistors take them, and how many pixels), and the timing measured: the line's
 * period and HSYNC's width (µs), the lines a frame (when `frames` 2: the next VSYNC run to). The watched ports:
 * vga_hsync, vga_vsync and the colours'.
 */
export function vgaFrameOf(ref, { from = 0, div = 2, period = 20000, frames = 1, colours = [['vga_red', 3], ['vga_green', 3], ['vga_blue', 2]] } = {}) {
  const line = 800 * div, frame = 525 * line;
  // (the first VSYNC's fall after `from`: the frame before it, lines 0..479, ended 10 lines before it)
  let vfall = null;
  for (let c = from; vfall === null; c += line) {
    ref.run(c + line);
    for (let k = c; k < c + line; k++) if (ref.at('vga_vsync', k) === '0' && ref.at('vga_vsync', k - 1) === '1') { vfall = k; break; }
    if (c - from > 2 * frame) throw new Error('no VSYNC in two frames');
  }
  if (vfall - 490 * line < 0) throw new Error('the frame before the first VSYNC is not whole');
  const word = (c) => {
    let v = 0, sh = 0;
    for (const [p, w] of colours) { const b = ref.at(p, c); v |= (b && !/x/.test(b) ? parseInt(b, 2) : 0) << sh; sh += w; }
    return v;
  };
  // (a colour's bits: red, green, blue, each least significant bit first, as the monitor's palette has them)
  const rows = [];
  for (let y = 0; y < 480; y++) {
    const runs = [];
    for (let x = 0; x < 640; x++) {
      const v = word(vfall - (490 - y) * line + x * div);
      if (runs.length && runs.at(-1)[0] === v) runs.at(-1)[1]++;
      else runs.push([v, 1]);
    }
    rows.push(runs.map(([v, n]) => `${v}x${n}`).join(','));
  }
  // the timing: HSYNC's falls in the line VSYNC fell in
  const hfalls = [];
  for (let k = vfall - line; k < vfall + 2 * line && hfalls.length < 2; k++) if (ref.at('vga_hsync', k) === '0' && ref.at('vga_hsync', k - 1) === '1') hfalls.push(k);
  let hwidth = 0;
  while (ref.at('vga_hsync', hfalls[0] + hwidth) === '0') hwidth++;
  const us = (cycles) => (cycles * period) / 1e6;
  const out = { vfall, rows, lineUs: us(hfalls[1] - hfalls[0]), hsyncUs: us(hwidth) };
  if (frames > 1) {
    ref.run(vfall + frame + line);
    let next = null;
    for (let k = vfall + frame - line; k < vfall + frame + line; k++) if (ref.at('vga_vsync', k) === '0' && ref.at('vga_vsync', k - 1) === '1') { next = k; break; }
    out.lines = next === null ? null : (next - vfall) / (hfalls[1] - hfalls[0]);
    out.frameHz = next === null ? null : 1e6 / us(next - vfall);
  }
  return out;
}

/** The monitor's line under the picture for a measured frame: '640×480 · 59.52 Hz · line 32.00 µs · 525 lines'. */
export const vgaSummary = (f) => `640×480 · ${f.frameHz.toFixed(2)} Hz · line ${f.lineUs.toFixed(2)} µs · ${Math.round(f.lines)} lines`;
