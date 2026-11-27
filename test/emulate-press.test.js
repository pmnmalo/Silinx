// A push button of the Board Emulator held down as long as a real press (#3109, core/emulate-press.js): pressEnd's
// board time at every speed, pressHolds' releases held back, let go and flushed; and the clock example on the
// compiled engine, run as the emulator runs it slower than real time: a short click is taken by its 20 ms debouncer
// once held, missed when let go at once (the old emulator); at most a second of the user's time at the rate the board
// runs (#5849): the event-driven engine's button let go within a second, not after 5,000,000 cycles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESS_MS, HOLD_MAX_MS, pressEnd, pressHolds } from '../core/emulate-press.js';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { example, exampleUcf } from './examples-lib.mjs';
import { designOf } from './compiled-diff.js';
import { parseUcf } from '../packages/silinx-fpga/src/ucf.js';
import { resolveBoard } from '../server/devices.js';
import { boardWiring, emulatorClocks } from '../core/emulate.js';
import { netlistOf } from '../core/compiled-sim.js';
import { CompiledBoard } from '../core/emulate-compiled.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

const P = 20000;   // 50 MHz (ps)

test('pressEnd: 100 ms of the board\'s time at real speed and Max speed, of the user\'s at a set speed, at least one cycle', () => {
  assert.equal(PRESS_MS, 100);
  assert.equal(pressEnd({ from: 0, speed: 'real', period: P }), 100e9);          // 5,000,000 cycles at 50 MHz
  assert.equal(pressEnd({ from: 7e9, speed: 'max', period: P }), 107e9);
  assert.equal(pressEnd({ from: 0, speed: 1000, period: P }), 100 * P);          // 1 kHz: 100 cycles
  assert.equal(pressEnd({ from: 0, speed: 1e5, period: P }), 10000 * P);
  assert.equal(pressEnd({ from: 3 * P, speed: 10, period: P }), 4 * P);          // 10 Hz: one cycle
  assert.equal(pressEnd({ from: 0, speed: 1, period: P }), P);                   // 1 Hz: one cycle, not a tenth
  assert.equal(pressEnd({ from: 0, speed: 'real', period: 83333 }), 1200005 * 83333);   // 12 MHz (iCEBreaker): 1,200,005 cycles
});

test('#5849 pressEnd: at most a second of the user\'s time at the rate the board runs, the board\'s 100 ms when it runs faster, unknown rate as before', () => {
  assert.equal(HOLD_MAX_MS, 1000);
  // the event-driven engine at Max speed, 70,000 cycles a second: 70,000 cycles, not 5,000,000
  assert.equal(pressEnd({ from: 0, speed: 'max', period: P, rate: 70000 }), 70000 * P);
  assert.equal(pressEnd({ from: 5 * P, speed: 'real', period: P, rate: 160000 }), 160005 * P);
  // the compiled engine at half of real time (#3109's case): 25,000,000 cycles a second, the board's 100 ms kept
  assert.equal(pressEnd({ from: 0, speed: 'real', period: P, rate: 25e6 }), 100e9);
  // faster than real time (Max speed): the board's 100 ms
  assert.equal(pressEnd({ from: 0, speed: 'max', period: P, rate: 200e6 }), 100e9);
  // a set speed the engine keeps up with: its 100 ms; one it cannot: a second of what it runs
  assert.equal(pressEnd({ from: 0, speed: 1e4, period: P, rate: 1e4 }), 1000 * P);
  assert.equal(pressEnd({ from: 0, speed: 1e5, period: P, rate: 3000 }), 3000 * P);
  // the rate not known (0, none): as before; a crawl: one cycle at least
  assert.equal(pressEnd({ from: 0, speed: 'max', period: P, rate: 0 }), 100e9);
  assert.equal(pressEnd({ from: 0, speed: 'max', period: P }), 100e9);
  assert.equal(pressEnd({ from: 0, speed: 'max', period: P, rate: 0.2 }), P);
});

test('#5849 the event-driven engine at Max speed: BTN0 clicked and let go is back at 0 within a second of the user\'s time, the design seeing it', () => {
  const SRC = `library ieee; use ieee.std_logic_1164.all;
entity b is port (clk : in std_logic; btn : in std_logic_vector(3 downto 0); led : out std_logic_vector(3 downto 0)); end b;
architecture rtl of b is begin
  process (clk) begin if rising_edge(clk) then led <= btn; end if; end process;
end rtl;`;
  const d = elaborate(compile([{ path: 'b.vhd', lang: 'vhdl', text: SRC }]), 'b');
  const port = (n) => d.top.ports.find((p) => p.name === n).sig;
  // the emulator's frames: 60 a second, the engine at 60,000 cycles a second (1,000 a frame)
  const RATE = 60000, FRAME = RATE / 60;
  const run = (old) => {
    const sim = new Simulator(d), holds = pressHolds();
    sim.addClock(port('clk'), { period: P });
    let btn = '0000';
    const set = (on) => { btn = on ? '0001' : '0000'; sim.force(port('btn'), V.fromInt(on ? 1 : 0, 4)); };
    const frame = () => { sim.run(sim.now + FRAME * P); holds.tick(sim.now); };
    set(false); frame();
    // a click of a frame (16 ms), let go
    holds.press('btn0', { now: sim.now });
    set(true); frame();
    assert.equal(V.toBin(port('led').val), '0001', 'the press seen');
    holds.release('btn0', { until: (from) => pressEnd({ from, speed: 'max', period: P, rate: old ? 0 : RATE }), now: sim.now, go: () => set(false) });
    let frames = 0;
    while (btn !== '0000' && frames < 600) { frame(); frames++; }   // (up to 10 s of the user's time)
    frame();
    return { frames, btn, led: V.toBin(port('led').val) };
  };
  // let go after a second of the user's time (60 frames, the press's own frame counted), the design's LED0 off
  assert.deepEqual(run(false), { frames: 59, btn: '0000', led: '0000' });
  // the old hold: 5,000,000 cycles, more than 80 s at this rate: still down after 10 s
  assert.deepEqual(run(true), { frames: 600, btn: '0001', led: '0001' });
});

test('pressHolds: a release held back until the board\'s time is at it, at once when it is, or goes back (a power cycle); a new press drops it; flush lets all go', () => {
  const holds = pressHolds(), gone = [];
  const go = (k) => () => gone.push(k);
  // already long enough: at once
  holds.release('a', { until: 100, now: 100, go: go('a') });
  assert.deepEqual([gone, holds.size], [['a'], 0]);
  // held back, then let go by the tick that reaches it (not before)
  holds.release('b', { until: 500, now: 120, go: go('b') });
  holds.release('c', { until: 300, now: 120, go: go('c') });
  holds.tick(299);
  assert.deepEqual([gone, holds.size], [['a'], 2]);
  holds.tick(300);
  assert.deepEqual([gone, holds.size], [['a', 'c'], 1]);
  // pressed again before: the release held back dropped (the button stays pressed)
  holds.press('b');
  holds.tick(1000);
  assert.deepEqual([gone, holds.size], [['a', 'c'], 0]);
  // a second release of the same button replaces the first
  holds.release('d', { until: 400, now: 0, go: go('d1') });
  holds.release('d', { until: 900, now: 0, go: go('d2') });
  holds.tick(500);
  assert.deepEqual(gone, ['a', 'c']);
  // paused, reset, powered off: every one let go, once
  holds.release('e', { until: 1e9, now: 0, go: go('e') });
  holds.flush();
  holds.flush();
  holds.tick(2e9);
  assert.deepEqual([gone, holds.size], [['a', 'c', 'd2', 'e'], 0]);
  // a power cycle: the board's time from 0 again, the release let go
  holds.release('h', { until: 5000, now: 3000, go: go('h') });
  holds.tick(3000);
  assert.equal(holds.size, 1);
  holds.tick(0);
  assert.deepEqual([gone.at(-1), holds.size], ['h', 0]);
  // a release that presses again (a go that calls back in) does not upset the tick
  holds.release('f', { until: 10, now: 0, go: () => { gone.push('f'); holds.release('g', { until: 20, now: 10, go: go('g') }); } });
  holds.tick(10);
  holds.tick(20);
  assert.deepEqual(gone.slice(-2), ['f', 'g']);
});

test('#3727 pressHolds: a press made while the worker\'s run is in flight counted from that run\'s end, not from the page\'s older time', () => {
  const holds = pressHolds(), gone = [];
  const end = (from) => from + 100 * P;   // 1 kHz: 100 cycles
  // the page at 1000 cycles, a run of 250 in flight (a slow page): the click reaches the design at 1250 cycles; the
  // old count (from 1000) let it go as the run came back, at 1250: a press of no cycle for the design
  holds.press('btn', { now: 1000 * P, busy: true });
  holds.release('btn', { until: end, now: 1000 * P, go: () => gone.push('btn') });
  holds.tick(1000 * P, { settled: false });   // (a refresh while the run is in flight: nothing known yet)
  assert.deepEqual([gone, holds.size], [[], 1]);
  holds.tick(1250 * P);                       // the run is over: the press starts here
  assert.deepEqual([gone, holds.size], [[], 1]);
  holds.tick(1349 * P);
  assert.deepEqual(gone, []);
  holds.tick(1350 * P);                       // 100 cycles of the design's time
  assert.deepEqual([gone, holds.size], [['btn'], 0]);
  // let go after the run came back: counted from its end all the same
  holds.press('b2', { now: 2000 * P, busy: true });
  holds.tick(2250 * P);
  holds.release('b2', { until: end, now: 2300 * P, go: () => gone.push('b2') });
  holds.tick(2349 * P);
  assert.equal(holds.size, 1);
  holds.tick(2350 * P);
  assert.deepEqual(gone, ['btn', 'b2']);
  // no run in flight: from the page's time, as before; long enough already: at once
  holds.press('b3', { now: 3000 * P });
  holds.release('b3', { until: end, now: 3100 * P, go: () => gone.push('b3') });
  assert.deepEqual([gone.at(-1), holds.size], ['b3', 0]);
  // paused while one waits for its run: flush lets it go
  holds.press('b4', { now: 4000 * P, busy: true });
  holds.release('b4', { until: end, now: 4000 * P, go: () => gone.push('b4') });
  holds.flush();
  assert.deepEqual([gone.at(-1), holds.size], ['b4', 0]);
});

test('#4437 pressHolds: a power cycle while the press waits for the run in flight lets it go at once, not after the next run', () => {
  const holds = pressHolds(), gone = [];
  const end = (from) => from + 100 * P;
  // clicked at 1000 cycles with a run in flight; the board powered off and on (its time from 0) before that run is in:
  // still busy, the button let go now, so that the design's first run after the reset does not see the old click
  holds.press('btn', { now: 1000 * P, busy: true });
  holds.release('btn', { until: end, now: 1000 * P, go: () => gone.push('btn') });
  holds.tick(0, { settled: false });
  assert.deepEqual([gone, holds.size], [['btn'], 0]);
  // its start known (settled) but not its end yet: the same
  holds.press('b2', { now: 2000 * P });
  holds.release('b2', { until: end, now: 2010 * P, go: () => gone.push('b2') });
  holds.tick(5 * P, { settled: false });
  assert.deepEqual([gone, holds.size], [['btn', 'b2'], 0]);
});

const ucfPort = (p) => { const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar); return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null }; };

test('the clock example on the compiled engine at half of real time: a 32 ms click of BTN2 / BTN3 sets the minutes / hours once held, missed when let go at once', { timeout: 300000 }, async () => {
  const ex = example('clock');
  const r = resolveBoard('basys2', { variant: '250' }), board = { id: 'basys2', name: r.board.name, device: r.device, resources: r.resources };
  const design = designOf(ex.design, ex.project.top);   // its own generics: a 20 ms debouncer (STABLE = 1,000,000)
  const { json, top } = await netlistOf(design, { run: yosysNode });
  const ucf = exampleUcf('clock', { board: 'basys2', variant: '250' }).text;
  const wiring = boardWiring({ ports: design.top.ports, assignments: parseUcf(ucf, { ports: design.top.ports.map(ucfPort) }).assignments, board });
  wiring.clocks = emulatorClocks(wiring, design.top.ports);
  const period = wiring.clocks[0].period;
  assert.equal(period, P);
  const cb = new CompiledBoard({ json, top, design, wiring, clock: 'clk', period, board });
  const btn = design.top.ports.find((p) => p.name === 'btn').sig;
  // the emulator's frames: 16 ms of the user's time, 8 ms of the board's (400,000 cycles: the engine at 25 MHz)
  const FRAME = 400000, holds = pressHolds();
  const frame = () => { cb.run(cb.now + FRAME * period); holds.tick(cb.now); };
  let pressed = 0n;
  const set = (bit, on) => { pressed = on ? pressed | (1n << BigInt(bit)) : pressed & ~(1n << BigInt(bit)); cb.force(btn, { v: pressed, x: 0n }); };
  // a click of 2 frames (32 ms of the user's time, 800,000 cycles: less than the debouncer's million)
  const click = (bit, { held }) => {
    const from = cb.now;
    set(bit, true);
    frame(); frame();
    if (held) holds.release(bit, { until: pressEnd({ from, speed: 'real', period }), now: cb.now, go: () => set(bit, false) });
    else set(bit, false);
    for (let k = 0; k < 20; k++) frame();   // 160 ms of the board's time on
  };
  const time = () => [cb.cs.get('hour'), cb.cs.get('min')];
  assert.deepEqual(time(), [0n, 0n]);
  // the old emulator: let go at once, the press not taken
  click(2, { held: false });
  click(3, { held: false });
  assert.deepEqual(time(), [0n, 0n]);
  // held as a real press: taken once each
  click(2, { held: true });
  assert.deepEqual([time(), pressed, holds.size], [[0n, 1n], 0n, 0]);
  click(3, { held: true });
  click(2, { held: true });
  assert.deepEqual([time(), pressed, holds.size], [[1n, 2n], 0n, 0]);
});
