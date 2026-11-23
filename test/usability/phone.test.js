// Usability (#5206, phase 6): a phone's screen (390 × 844, touch: #5121, web/js/phone.js), the sessions of phases 1, 3
// and 5 as a person has them there, by a finger: the uart example's module opened by a double tap on its Design row
// (the Document pane, read only: a tap and a key change nothing), its bench simulated (the Silinx interface's Simulate
// task, the ISE style's Simulation view and More tools ▸ Simulate) and its waves by touch (a tap places the cursor, a
// pinch zooms, two fingers scroll the time: the values at the cursor the reference simulator's, lib/wave-kit.js), its
// board emulated (its switches and buttons' strip, BTN0 tapped: its message; a line typed in the Serial terminal: its
// echo; the terminal, LEDs and display the design's simulation's, lib/board-ref.js); the lock example's drawings read
// (the state diagram, the ASM chart, the Petri net, the schematic: each opened by a double tap, panned by two fingers,
// zoomed by a pinch, a finger dragged on it changing nothing). The panes switched by the bar at the bottom; the
// console's lines exactly at every step. In both interfaces (SILINX_UI_INTERFACE=ise) and in Portuguese
// (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { Session, RUN } from './lib/session.js';
import { touchActions, viewOfTransform } from './lib/touch-actions.js';
import { waveKit, waveReference } from './lib/wave-kit.js';
import { emuActions, displayText } from './lib/emu-actions.js';
import { boardReference, displayOf, serialOf, serialFrames } from './lib/board-ref.js';
import { consoleCount } from './lib/project-actions.js';
import { sameLines, diskFiles } from './lib/hier-kit.js';
import { tr } from './lib/hdl-actions.js';
import { serialText } from '../../core/uart.js';

const FILE = 'test/usability/phone.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = (page) => page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
const PHONE = [390, 844];
const tasks = (page) => page.eval(() => document.documentElement.dataset.layout === 'tasks');
const pane = (page) => page.eval(() => document.documentElement.dataset.pane);
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not ${b} ± ${tol}`);
const box = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** A project made from `example` opened on a phone in the run's language; the console's lines checked from the end of
 *  its opening on (`lines(want)`: the lines said since the last check, exactly). */
async function phoneProject(page, example, name) {
  await page.setViewport(...PHONE);
  await makeProject(env, { name, template: example });
  await page.openProject(name);
  if (RUN.lang !== 'en') await page.eval(async (l) => { (await import('/js/i18n.js')).setLanguage(l); }, RUN.lang);
  let n = await consoleCount(page);
  for (let k = 0, m = -1; k < 40 && n !== m; k++) { await sleep(250); m = n; n = await consoleCount(page); }
  const lines = async (want) => { await sameLines(page, n, want); n = await consoleCount(page); };
  return { T: touchActions(page), lines };
}

/** A Design row opened by a double tap (the Panels pane first): its document in front, the Document pane shown. */
async function openRow(page, T, label, id) {
  if (await pane(page) !== 'side') await T.pane('side');
  if (await tasks(page) && await page.eval(() => document.documentElement.dataset.task !== 'edit')) await T.tap('#task-tabs .task-btn[data-task="edit"]');
  await T.doubleTap('#hier .row .lbl', { text: label });
  await page.waitFor((d) => window.Silinx.active?.id === d && document.documentElement.dataset.pane === 'doc', [id], { what: `${id} in front, the Document pane` });
  await frame(page);
}

// the uart's sources parsed (Check Syntax's lines: the bench's last, `tb`)
const parsed = (tb) => [...['uart_rx', 'uart_tx', 'debounce', 'sevenseg', 'uart'].map((f) => `Parsing VHDL file "src/${f}.vhd" into library work`), ...(tb ? ['Parsing VHDL file "sim/tb_uart.vhd" into library work'] : [])];
// the bench simulated: its Check Syntax, the model built, SSim's first lines (the Silinx interface's Simulate: the
// bench tapped its top first)
const UART_SIM = (silinx) => [...(silinx ? ["Top-level simulation module set to 'tb_uart'."] : []), 'Started : "Behavioral Check Syntax".', ...parsed(true), 'Elaborating top module <tb_uart>: 41 signals, 19 processes.', 'Process "Check Syntax" completed successfully',
  'Started : "Simulate Behavioral Model".', "Building simulation model for top 'tb_uart'...", 'Simulation model ready: 41 signals, 19 processes. Launching SSim view.',
  'SSim (Silinx behavioural simulator)', 'Time resolution is 1 ps', 'Simulator is doing circuit initialization process.', 'Finished circuit initialization process.', 'SSim> run 1 us'];
// the emulator on a phone: Check Syntax, the event-driven engine by default, its serial terminal not on it; then
// Engine ▸ Compiled (the emulator opened again on it, its Check Syntax again)
const UART_CHECK = ['Started : "Check Syntax".', ...parsed(false), 'Elaborating top module <uart>: 38 signals, 16 processes.', 'Process "Check Syntax" completed successfully'];
const UART_EVENT = [...UART_CHECK, "Board Emulator: 'uart' (RTL, event-driven) on Digilent Basys2 — 24 port bit(s) on board resources.",
  "Board Emulator: the design is simulated from its HDL (behavioural RTL) at a reduced clock rate; registers without an initial value start at 0, as on the FPGA; each display digit keeps the last pattern it showed between its refreshes, as your eye does on the real board.",
  "Board Emulator: the event-driven engine by default on this device (a phone or tablet): choose Engine ▸ Compiled to run the design at the board's real speed.",
  'Board Emulator: the serial terminal needs the compiled engine (the event-driven one is too slow for a frame).'];
const UART_COMPILED = [...UART_CHECK, "Board Emulator: 'uart' (RTL, compiled) on Digilent Basys2 — 24 port bit(s) on board resources.",
  "Board Emulator: the design is compiled (its netlist, by Yosys) and runs at up to the board's clock rate; registers without an initial value start at 0, as on the FPGA; the event-driven engine shows X values and the design's messages. Each display digit keeps the last pattern it showed between its refreshes, as your eye does on the real board.",
  'Board Emulator: the serial terminal: TX: tx (pin A3) · RX: rx (pin J3).'];
const BIT = Math.floor(50e6 / 9600);

uiTest('usability: phone: the uart: its module read only, its bench simulated and its waves by touch, its board emulated by touch (BTN0\'s message, a line typed); the console\'s lines exact', E, async (page) => {
  const { T, lines } = await phoneProject(page, 'uart', 'UsabPhoneUart');
  const silinx = await tasks(page);
  // the module opened by a double tap: read only, its notice; a tap in its text and a key change nothing
  await openRow(page, T, 'uart', 'file:src/uart.vhd');
  const [notice] = await tr(page, ['Read-only on a phone']);
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) [data-phone-notice]')?.textContent), notice);
  const text = await page.eval(() => window.Silinx.active.editor.getValue());
  await T.tap('.doc:not([hidden]) .cm-content');
  await page.type('x');
  await page.key('Enter');
  assert.deepEqual(await page.eval(() => [window.Silinx.active.editor.getValue(), !!window.Silinx.active.dirty]), [text, false]);
  await lines([]);

  // its bench simulated: the Silinx interface's Simulate (its side panel, the bench tapped), the ISE style's Simulation
  // view, the bench's row, More tools ▸ Simulate Behavioral Model
  if (silinx) {
    await T.tap('#task-tabs .task-btn[data-task="sim"]');
    await page.waitFor(() => document.documentElement.dataset.pane === 'side' && document.querySelector('#task-sim-panel .task-sim-bench .row'), [], { what: 'Simulate\'s side panel' });
    await T.tap('#task-sim-panel .task-sim-bench .row .lbl', { text: 'tb_uart' });
  } else {
    await T.pane('side');
    await T.tap('input[name=view][value=sim]');
    await T.tap('#hier .row .lbl', { text: 'tb_uart' });
    await T.more((await tr(page, ['Simulate Behavioral Model']))[0]);
  }
  await page.waitFor(() => /^isim:/.test(window.Silinx.active?.id || '') && window.Silinx.active.view && !window.Silinx.active.view.state.running
    && document.documentElement.dataset.pane === 'doc', [], { what: 'the bench simulated, its waves the Document pane', timeout: 60000 });
  await sleep(300);
  await lines(UART_SIM(silinx));
  const files = Object.entries(await diskFiles(env, 'UsabPhoneUart')).map(([path, t]) => ({ path, text: t }));
  const ref = waveReference(files, 'tb_uart', await page.eval(() => window.Silinx.active.view.state.now ?? window.Silinx.active.view.sim?.now));
  const s = new Session(page, env, { file: FILE, title: 'phone: uart: the waves', hdl: false, kit: waveKit(ref) });
  await s.open();
  const waves = '.doc:not([hidden]) .isim-waves';
  const wv = await box(page, waves), c = { x: wv.x + wv.w / 2, y: wv.y + Math.min(wv.h - 10, 60) };
  // a tap: the cursor there (snapped to its row's nearest change)
  await s.step('tap the waves', { at: '1/4' }, () => T.tap({ x: wv.x + wv.w / 4, y: c.y }), {
    expect: (d, b) => near(d.cursor, b.t0 + (wv.w / 4) * b.scale, 30 * b.scale, 'the cursor where the finger tapped'),
  });
  // a pinch, the fingers spread twice as far: the time twice as close, the cursor where it was
  await s.step('pinch', { spread: 2 }, () => T.pinch(c, 30, 60), {
    expect: (d, b) => { near(b.scale / d.scale, 2, 0.05, 'the zoom'); assert.equal(d.cursor, b.cursor); },
  });
  // two fingers dragged 60 px to the left: the time scrolled on
  await s.step('two fingers', { dx: -60 }, () => T.pan(c, -60, 0, 40), {
    expect: (d, b) => { near(d.t0 - b.t0, 60 * b.scale, 2 * b.scale, 'the time scrolled'); near(d.scale, b.scale, 1e-9, 'the zoom kept'); },
  });
  await s.step('tap the waves', { at: '3/4' }, () => T.tap({ x: wv.x + wv.w * 3 / 4, y: c.y }), {
    expect: (d, b) => near(d.cursor, b.t0 + (wv.w * 3 / 4) * b.scale, 30 * b.scale, 'the cursor where the finger tapped'),
  });
  assert.equal(await page.eval(() => document.documentElement.scrollWidth > innerWidth), false, 'no sideways scroll');
  // (the bench's lines are the simulator's console's: the Console's own, none of the run's warnings)
  await T.pane('console');
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, document.getElementById('err-count').textContent]), ['', '']);

  // the board emulated: the Silinx interface's Emulate (its side panel: Emulate on Board), the ISE style's More tools ▸
  // Emulate Behavioral Model
  if (silinx) {
    await T.tap('#task-tabs .task-btn[data-task="emu"]');
    await page.waitFor(() => document.documentElement.dataset.pane === 'side', [], { what: 'Emulate\'s side panel' });
    await T.tap('button.btn', { text: (await tr(page, ['Emulate on Board']))[0] });
  } else await T.more((await tr(page, ['Emulate Behavioral Model']))[0]);
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs && document.documentElement.dataset.pane === 'doc', [], { what: 'the emulator running, the Document pane', timeout: 120000 });
  await sleep(1500);
  await lines(UART_EVENT);
  const DOC = '.doc:not([hidden]) .emu';
  // Engine ▸ Compiled, from the toolbar's ⋯ menu: the board's real speed, its serial terminal
  await T.tap(`${DOC} .emu-bar .tb-more-btn`);
  await T.tap(`${DOC} .emu-bar .tb-more-menu [data-value="compiled"]`);
  await page.waitFor(() => window.SilinxApp.findDoc('emulator')?.view?.outputs && window.SilinxApp.findDoc('emulator').view.engine === 'compiled', [], { what: 'the compiled engine', timeout: 120000 });
  await sleep(1500);
  await lines(UART_COMPILED);
  const a = emuActions(page);
  // (the strip of the switches and the buttons under the board: BTN0 last)
  assert.ok(await page.eval((d) => document.querySelector(`${d} .emu-touch`)?.getClientRects().length > 0, DOC), 'the strip under the board');
  const board = async () => ({ terminal: await a.terminal(), leds: await a.leds(), display: displayText(await a.digits()) });
  // a line typed in the Serial terminal (its field tapped, the phone's keyboard), Enter: back as typed
  await T.tap(`${DOC} .emu-serial-in`);
  await page.type('Hi');
  await page.key('Enter');
  await page.waitFor((d) => document.querySelector(`${d} .emu-serial-out`).textContent === 'Hi\n', [DOC], { what: 'the echo', timeout: 60000 });
  await sleep(500);
  const typed = await board();
  // BTN0 tapped on the strip: the message after the echo
  await T.tap(`${DOC} .emu-touch button:last-child`);
  await page.waitFor((d) => document.querySelector(`${d} .emu-serial-out`).textContent.endsWith('Silinx!\n'), [DOC], { what: 'BTN0\'s message', timeout: 60000 });
  await a.pause();
  const sent = await board();
  await lines([]);
  // the reference: the same bytes on RX, then BTN0 held as long as its debounce takes and let go
  const uref = boardReference(files, 'uart', { watch: ['tx', 'an', 'seg', 'dp'], idle: { rx: 1 } });
  const bytes = [...'Hi\r'].map((ch) => ch.charCodeAt(0));
  for (const f of serialFrames(bytes, { at: 1000, bitCycles: BIT })) { uref.run(f.cycle); uref.set('rx', null, f.level); }
  uref.run(1000 + (bytes.length + 2) * 10 * BIT + 200000);
  const shown = () => ({ terminal: serialText(serialOf(uref, { bitCycles: BIT })).text, leds: uref.value('led'), display: displayText(displayOf(uref, { refresh: 50000 })) });
  assert.deepEqual(typed, shown(), 'the line typed');
  uref.set('btn', 0, 1);
  const end = uref.cycle() + 1000010;
  uref.run(end);
  uref.set('btn', 0, 0);
  uref.run(end + 21 * 10 * BIT + 200000);
  assert.deepEqual(sent, shown(), 'BTN0\'s message');
  assert.equal(await page.eval(() => document.documentElement.scrollWidth > innerWidth), false, 'no sideways scroll');
}, { tablet: 'portrait', timeout: 240000 });

// the lock's drawings: each one's Design row, document, editor, viewport (its transform the view) and canvas
const DRAWINGS = [
  { label: 'u_control', id: 'sch:src/control.sch.json', ed: 'schEditor', vp: '.sch-editor .se-vp', svg: '.sch-editor .se-canvas svg' },
  { label: 'u_lock', id: 'fsm:src/lock.fsm.json', ed: 'fsmEditor', vp: '.fsm-editor .fsm-vp', svg: '.fsm-editor .fsm-canvas' },
  { label: 'u_timer', id: 'asm:src/timer.asm.json', ed: 'asmEditor', vp: '.asm-editor .asm-vp', svg: '.asm-editor .asm-canvas' },
  { label: 'u_alarm', id: 'pn:src/alarm.pn.json', ed: 'petriEditor', vp: '.petri-editor .pn-world', svg: '.petri-editor .pn-canvas' },
];

uiTest('usability: phone: the lock\'s drawings read by touch: each opened by a double tap, read only, panned by two fingers, zoomed by a pinch; a finger dragged on it changes nothing', E, async (page) => {
  const { T, lines } = await phoneProject(page, 'lock', 'UsabPhoneLock');
  const [notice] = await tr(page, ['Read-only on a phone']);
  for (const D of DRAWINGS) {
    await openRow(page, T, D.label, D.id);
    const vp = `.doc:not([hidden]) ${D.vp}`, svg = `.doc:not([hidden]) ${D.svg}`;
    // the drawing as a person sees it: its model (nothing changes it: read only), its view apart
    const kit = {
      actions: () => ({ open: async () => {}, getDoc: () => page.eval((e) => { const x = window.Silinx.active[e]; return { dirty: !!window.Silinx.active.dirty, model: JSON.stringify(x.getModel?.() ?? x.getDoc()) }; }, D.ed) }),
      invariants: (d) => (d.dirty ? { dirty: ['the drawing changed (read only on a phone)'] } : {}), hdlErrors: () => [], detached: () => [], dangling: () => [],
    };
    const s = new Session(page, env, { file: FILE, title: `phone: lock: ${D.id}`, hdl: false, kit });
    await s.open();
    assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) [data-phone-notice]')?.textContent), notice, D.id);
    const view = async () => viewOfTransform(await page.eval((x) => document.querySelector(x)?.getAttribute('transform'), vp));
    const c = center(await box(page, svg));
    let v0;
    const viewed = (run) => async () => { v0 = await view(); await run(); await frame(page); };
    // two fingers dragged by (50, 40): the view panned as much, the zoom kept
    await s.step('two fingers', { id: D.id, dx: 50, dy: 40 }, viewed(() => T.pan(c, 50, 40)), {
      changes: false, expect: async () => { const v1 = await view(); near(v1.tx - v0.tx, 50, 1.5, 'panned (x)'); near(v1.ty - v0.ty, 40, 1.5, 'panned (y)'); near(v1.s, v0.s, 1e-6, 'the zoom kept'); },
    });
    // a pinch, the fingers spread from 50 to 75 px: zoomed 1.5 times
    await s.step('pinch', { id: D.id, spread: 1.5 }, viewed(() => T.pinch(c, 50, 75)), {
      changes: false, expect: async () => near((await view()).s / v0.s, 1.5, 0.05, 'the zoom'),
    });
    // one finger dragged across it: nothing of the drawing moved, the zoom kept
    await s.step('one finger', { id: D.id }, viewed(() => T.drag(c, { x: c.x + 40, y: c.y + 30 })), {
      changes: false, expect: async () => near((await view()).s, v0.s, 1e-6, 'the zoom kept'),
    });
    await lines([]);
  }
  assert.deepEqual(await page.eval(() => window.Silinx.docs.filter((d) => d.dirty).map((d) => d.path)), []);
}, { tablet: 'portrait', timeout: 180000 });
