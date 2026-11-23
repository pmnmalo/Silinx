// Usability (#5206, phase 5): the Board Emulator on the examples a person runs on it, each from its own project (the
// example's, its UCF) on the Basys2, with the Silinx toolchain's compiled engine; what the board shows checked against
// the design's simulation for the same inputs (lib/board-ref.js: core's event-driven simulator on the behavioural
// RTL, the inputs set at the cycles the emulator had them, read from its time): the stopwatch's buttons (start, two
// laps, stop, the laps recalled, cleared: each held down by a Shift+click while paused, let go the same way, so that
// the board's time of each is exact) and its display and LEDs; the vga's picture on the VGA monitor and its timing, the
// square moved by BTN0 (SW0 on: four pixels a frame); the uart's Serial terminal (a line typed, its echo; BTN0's
// message) and its display and LEDs. The console's lines exactly at every step. In both interfaces
// (SILINX_UI_INTERFACE=ise) and in Portuguese (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { Session, RUN } from './lib/session.js';
import { emuActions, displayText } from './lib/emu-actions.js';
import { boardReference, displayOf, serialOf, serialFrames, vgaFrameOf, vgaSummary } from './lib/board-ref.js';
import { consoleCount } from './lib/project-actions.js';
import { sameLines, diskFiles } from './lib/hier-kit.js';
import { tr } from './lib/hdl-actions.js';
import { serialText } from '../../core/uart.js';

const FILE = 'test/usability/emulator.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
// (the emulator's note on its compiled engine and the display, after its first line)
const COMPILED = "Board Emulator: the design is compiled (its netlist, by Yosys) and runs at up to the board's clock rate; registers without an initial value start at 0, as on the FPGA; the event-driven engine shows X values and the design's messages. Each display digit keeps the last pattern it showed between its refreshes, as your eye does on the real board.";
/** The lines of the Check Syntax the emulator runs first: its files parsed, its top elaborated. */
const checked = (files, top, signals, processes) => ['Started : "Check Syntax".', ...files.map((f) => `Parsing VHDL file "src/${f}.vhd" into library work`),
  `Elaborating top module <${top}>: ${signals} signals, ${processes} processes.`, 'Process "Check Syntax" completed successfully'];
const same = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };

/** The board as a person reads it, a session's document: the board's time, the buttons held and the switches on, the
 *  LEDs, the display, the Serial terminal. */
const emuKit = {
  actions: (page) => {
    const a = emuActions(page);
    a.getDoc = async () => ({ cycle: await a.cycle(), held: await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .emu :is(.emu-btn, .emu-sw).on')].map((b) => b.closest('[data-part]')?.dataset.part)),
      leds: await a.leds(), display: displayText(await a.digits()), terminal: await page.eval(() => document.querySelector('.doc:not([hidden]) .emu .emu-serial-out')?.textContent ?? null) });
    return a;
  },
  invariants: () => ({}), hdlErrors: () => [], detached: () => [], dangling: () => [],
};

/** The project made from `example`, opened in the run's language, the emulator started: its session, the console's
 *  lines checker, the design's files (the project's on disk). */
async function start(page, example, name, opening) {
  await makeProject(env, { name, template: example });
  await page.setViewport(1440, 1000);
  await page.openProject(name);
  if (RUN.lang !== 'en') await page.eval(async (l) => { (await import('/js/i18n.js')).setLanguage(l); }, RUN.lang);
  const s = new Session(page, env, { file: FILE, title: `emulator: ${example}`, hdl: false, kit: emuKit });
  // (the console once the project's opening is done: its Check Syntax)
  let n = await consoleCount(page);
  for (let k = 0, m = -1; k < 60 && n !== m; k++) { await new Promise((r) => setTimeout(r, 300)); m = n; n = await consoleCount(page); }
  const lines = async (want) => { try { await sameLines(page, n, want); } catch (e) { await s.fail(s.steps.at(-1)?.name ?? '(the start)', { console: [e.message] }); } n = await consoleCount(page); };
  s.steps.push({ name: 'Tools ▸ Board Emulator', args: {} });
  await s.a.open();
  // (its lines: the one that opens it, then its notes, once they all came)
  await new Promise((r) => setTimeout(r, 1500));
  await lines(opening);
  s.docs.push(await s.settled());
  // (every step after: no line said in the console)
  const step = s.step.bind(s);
  s.step = (name, args, run, o = {}) => step(name, args, run, { ...o, expect: async (d, b) => { await o.expect?.(d, b); await sameLines(page, n, []); } });
  const files = Object.entries(await diskFiles(env, name)).map(([path, text]) => ({ path, text }));
  return { s, lines, files };
}

// the stopwatch: its timing generics and the board's cycles divided by 1000 in the reference (a hundredth 500 cycles,
// a press 1000 stable, a digit 50: the board's 500 000, 1 000 000, 50 000)
const SW_SCALE = 1000, SW_GEN = { CS: 500, STABLE: 1000, REFRESH: 50 }, HUNDREDTH = 500000;
// (a time a hundredth apart from the reference's only when the press that made it came within 5 of the reference's
// cycles of a hundredth's end: its cycles, divided, rounded, and the design's few cycles of delay, not divided)
const NEAR = 5 * SW_SCALE;
const num = (t) => Number(t.replace(/[^\d]/g, '') || 0);

uiTest('usability: emulator: the stopwatch: started, two laps, stopped, the laps recalled, cleared; its display and LEDs the design\'s simulation\'s', E, async (page) => {
  const { s, lines, files } = await start(page, 'stopwatch', 'UsabEmuSw',
    [...checked(['debounce', 'to_decimal', 'sevenseg', 'stopwatch'], 'stopwatch', 52, 23), "Board Emulator: 'stopwatch' (RTL, compiled) on Digilent Basys2 — 26 port bit(s) on board resources.", COMPILED]);
  const a = s.a, events = [], reads = [], when = {};
  // a button held down at the pause's cycle (Shift+click), the board run on 3 000 000 cycles (60 ms: the press
  // debounced), what it shows read, the button let go (`running`: the time runs, its LEDs alone read; `time`: the
  // press whose time the display shows)
  const press = async (k, what, { running = false, time = what } = {}) => {
    await s.step('Shift+click', { button: `BTN${k}`, what }, async () => { await a.latch(k); events.push({ cycle: when[what] = await a.cycle(), port: 'btn', bit: k, value: 1 }); });
    await s.step('run', { cycles: 3e6 }, () => a.runFor(3e6));
    reads.push({ cycle: await a.cycle(), what, running, time, leds: await a.leds(), digits: await a.digits() });
    await s.step('Shift+click', { button: `BTN${k}`, let: 'go' }, async () => { await a.latch(k); events.push({ cycle: await a.cycle(), port: 'btn', bit: k, value: 0 }); });
    await s.step('run', { cycles: 3e6 }, () => a.runFor(3e6));
  };
  await s.step('⏸ Pause', {}, () => a.pause());
  reads.push({ cycle: await a.cycle(), what: 'the start', leds: await a.leds(), digits: await a.digits() });
  await press(0, 'start', { running: true });
  await s.step('run', { cycles: 22e6 }, () => a.runFor(22e6));
  await press(1, 'lap 1', { running: true });
  await s.step('run', { cycles: 12e6 }, () => a.runFor(12e6));
  await press(1, 'lap 2', { running: true });
  await s.step('run', { cycles: 7e6 }, () => a.runFor(7e6));
  await press(0, 'stop');
  await press(3, 'lap 1 recalled', { time: 'lap 1' });
  await press(3, 'lap 2 recalled', { time: 'lap 2' });
  await press(3, 'the time again', { time: 'stop' });
  await press(2, 'cleared', { time: null });
  await lines([]);

  // the reference: the same presses at the same cycles (divided), the display and the LEDs read at the same cycles
  // (a read before a press of its cycle)
  const ref = boardReference(files, 'stopwatch', { generics: SW_GEN, watch: ['an', 'seg', 'dp'] });
  const at = (c) => Math.round(c / SW_SCALE);
  const todo = [...events.map((e) => ({ ...e, kind: 'set' })), ...reads.map((r) => ({ ...r, kind: 'read' }))].sort((x, y) => at(x.cycle) - at(y.cycle) || (x.kind === 'read' ? -1 : 1));
  const near = (what) => { const c = when[what]; if (c == null) return false; const d = (c - when.start) % HUNDREDTH; return d < NEAR || d > HUNDREDTH - NEAR; };
  for (const x of todo) {
    ref.run(at(x.cycle));
    if (x.kind === 'set') { ref.set(x.port, x.bit, x.value); continue; }
    const want = { leds: ref.value('led'), display: displayText(displayOf(ref, { refresh: SW_GEN.REFRESH })) };
    const got = { leds: x.leds, display: displayText(x.digits) };
    // (while it runs, the display changes in the window the emulator shows: its LEDs alone)
    if (x.running) { delete want.display; delete got.display; }
    if (got.leds === want.leds && got.display !== want.display && Math.abs(num(got.display) - num(want.display)) === 1 && near(x.time)) continue;
    try { same(got, want, x.what); } catch (e) { await s.fail(`the reference: ${x.what}`, { 'the board': [e.message, `at cycle ${x.cycle}`] }); }
  }
  // (the times as a person reads them: 0.00 at the start and cleared, the time again the stopped one, the laps before it)
  const shown = Object.fromEntries(reads.map((r) => [r.what, displayText(r.digits)]));
  same([shown['the start'], shown.cleared, shown['the time again'] === shown.stop, num(shown['lap 1 recalled']) < num(shown['lap 2 recalled']), num(shown['lap 2 recalled']) < num(shown.stop)],
    [' 0.00', ' 0.00', true, true, true], 'the times');
}, { timeout: 300000 });

// the vga: a frame 840 000 cycles (a pixel every 2, 800 a line, 525 lines); the square's corner (304, 224) at the start,
// moved by BTN0 four pixels a frame (SW0 on) to the right edge at most (608)
const FRAME = 840000, VGA_WATCH = ['vga_hsync', 'vga_vsync', 'vga_red', 'vga_green', 'vga_blue'];

uiTest('usability: emulator: the vga: the VGA monitor\'s picture and timing the design\'s simulation\'s; SW0 on, BTN0 held: the square moved four pixels a frame', E, async (page) => {
  const { s, lines, files } = await start(page, 'vga', 'UsabEmuVga',
    // (its note on the display's digits it has not: #5292)
    [...checked(['vga_sync', 'vga'], 'vga', 31, 17), "Board Emulator: 'vga' (RTL, compiled) on Digilent Basys2 — 16 port bit(s) on board resources.", COMPILED]);
  const a = s.a;
  // the picture after three frames, against the reference's first (its frame and its timing over two)
  await s.step('run', { cycles: 3 * FRAME }, async () => { await a.pause(); await a.runFor(3 * FRAME); });
  const ref = boardReference(files, 'vga', { watch: [...VGA_WATCH, 'pixel', 'frame'] });
  const f0 = vgaFrameOf(ref, { frames: 2 });
  let pic = await a.vga();
  const [summary] = await tr(page, [vgaSummary(f0)]);
  try { same(pic.stat, summary, 'the monitor\'s line'); same(pic.rows.findIndex((r, y) => r !== f0.rows[y]), -1, 'the first row unlike the reference\'s'); } catch (e) { await s.fail('the picture', { 'the VGA monitor': [e.message] }); }
  // SW0 on, BTN0 held down (Shift+click) for ten frames, let go, two frames more
  const at = {};
  await s.step('click', { switch: 'SW0' }, async () => { await a.switch(0); at.sw = await a.cycle(); });
  await s.step('Shift+click', { button: 'BTN0' }, async () => { await a.latch(0); at.down = await a.cycle(); });
  await s.step('run', { cycles: 10 * FRAME }, () => a.runFor(10 * FRAME));
  await s.step('Shift+click', { button: 'BTN0', let: 'go' }, async () => { await a.latch(0); at.up = await a.cycle(); });
  await s.step('run', { cycles: 3 * FRAME }, () => a.runFor(3 * FRAME));
  // the frames the design moved the square in: its frame strobes (the reference's first, a frame apart) while the
  // button, two flip-flops behind the board's, was down
  let strobe = null;
  for (let c = 0; c < FRAME && strobe === null; c++) if (ref.at('pixel', c) === '1' && ref.at('frame', c) === '1') strobe = c;
  let k = 0;
  for (let f = strobe; f < at.up + 2; f += FRAME) if (f >= at.down + 2) k++;
  const sx = Math.min(640 - 32, 304 + 4 * k);
  if (k < 9) await s.fail('BTN0 held', { 'the frames': [`the button down for ${k} frames, ten expected`] });
  // the reference's picture with the square there (its corner held at it)
  const moved = boardReference(files, 'vga', { watch: VGA_WATCH });
  moved.force('sx', sx);
  const f1 = vgaFrameOf(moved);
  pic = await a.vga();
  try { same(pic.rows.findIndex((r, y) => r !== f1.rows[y]), -1, `the first row unlike the reference's with the square at x = ${sx} (${k} frames)`); } catch (e) { await s.fail('the picture moved', { 'the VGA monitor': [e.message] }); }
  await lines([]);
}, { timeout: 300000 });

// (#5292: the emulator's note speaks of the display's digits for a design with no display wired)
uiTest('usability: emulator: the vga: its note says nothing of a display it has not (#5292)', E, async (page, _env, t) => {
  t.todo('#5292: the note\'s sentence on the display\'s digits, for a design whose UCF wires no display');
  const note = COMPILED.replace(/ Each display digit .*$/, '');
  await start(page, 'vga', 'UsabEmuVgaNote', [...checked(['vga_sync', 'vga'], 'vga', 31, 17), "Board Emulator: 'vga' (RTL, compiled) on Digilent Basys2 — 16 port bit(s) on board resources.", note]);
}, { timeout: 120000 });

// the uart: 9600 baud, a bit 5208 cycles (50 MHz / 9600)
const BIT = Math.floor(50e6 / 9600);

uiTest('usability: emulator: the uart: a line typed in the Serial terminal echoed, BTN0\'s message; the terminal, the display and the LEDs the design\'s simulation\'s', E, async (page) => {
  const { s, lines, files } = await start(page, 'uart', 'UsabEmuUart',
    [...checked(['uart_rx', 'uart_tx', 'debounce', 'sevenseg', 'uart'], 'uart', 38, 16), "Board Emulator: 'uart' (RTL, compiled) on Digilent Basys2 — 24 port bit(s) on board resources.", COMPILED,
      'Board Emulator: the serial terminal: TX: tx (pin A3) · RX: rx (pin J3).']);
  const a = s.a;
  const board = async () => ({ terminal: await a.terminal(), leds: await a.leds(), display: displayText(await a.digits()) });
  // a line typed and Enter: its characters and a CR sent; back as typed (the CR a line's end), the bytes counted
  await s.step('type', { line: 'Hi' }, async () => {
    await a.typeLine('Hi');
    await page.waitFor((d) => document.querySelector(`${d} .emu-serial-out`).textContent === 'Hi\n', ['.doc:not([hidden]) .emu'], { what: 'the echo', timeout: 60000 });
    await a.pause();
  });
  const typed = await board();
  // BTN0 clicked: the message, after the echo
  await s.step('run', {}, () => a.run());
  await s.step('click', { button: 'BTN0' }, async () => {
    await a.button(0);
    await page.waitFor((d) => document.querySelector(`${d} .emu-serial-out`).textContent.endsWith('Silinx!\n'), ['.doc:not([hidden]) .emu'], { what: 'the message', timeout: 60000 });
    await a.pause();
  });
  const sent = await board();
  await lines([]);
  // the reference: the same bytes on RX, then BTN0 held as long as its debounce takes (20 ms) and let go
  const ref = boardReference(files, 'uart', { watch: ['tx', 'an', 'seg', 'dp'], idle: { rx: 1 } });
  const bytes = [...'Hi\r'].map((c) => c.charCodeAt(0));
  for (const f of serialFrames(bytes, { at: 1000, bitCycles: BIT })) { ref.run(f.cycle); ref.set('rx', null, f.level); }
  let end = 1000 + (bytes.length + 2) * 10 * BIT;
  ref.run(end + 200000);
  const shown = () => ({ terminal: serialText(serialOf(ref, { bitCycles: BIT })).text, leds: ref.value('led'), display: displayText(displayOf(ref, { refresh: 50000 })) });
  try { same(typed, shown(), 'the line typed'); } catch (e) { await s.fail('the reference: the line typed', { 'the board': [e.message] }); }
  ref.set('btn', 0, 1);
  end = ref.cycle() + 1000010;
  ref.run(end);
  ref.set('btn', 0, 0);
  ref.run(end + 21 * 10 * BIT + 200000);
  try { same(sent, shown(), 'the message'); } catch (e) { await s.fail('the reference: the message', { 'the board': [e.message] }); }
}, { timeout: 300000 });
