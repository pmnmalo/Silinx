// Usability (#5206, phase 6): a tablet's screen in portrait (820 × 1180, touch: narrower than 1024 px, web/js/narrow.js),
// the sessions of phases 3 and 5 by a finger: the traffic example's state diagram opened by a double tap on its Design
// row (the ISE style's drawer, behind the header's ☰, giving way to it; the Silinx interface's side panel folded and
// shown again by its Layout button), its states dragged by one finger (their transitions follow), the view panned by
// two fingers and zoomed by a pinch (the diagram as it was), a state tapped and renamed in Properties (behind the
// toolbar's ☰ Properties, over the canvas), Check tapped (its warnings exactly), the main toolbar's Undo tapped back to
// the start and Redo to the end; the stopwatch on the Board Emulator by taps (Engine ▸ Compiled, its ☰ Properties, the
// board's buttons: started, stopped, cleared; the display read). After every step the diagram's Check and its HDL in
// VHDL and Verilog (lib/draw-kit.js), the console's lines exactly. In both interfaces (SILINX_UI_INTERFACE=ise) and in
// Portuguese (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { Session, RUN } from './lib/session.js';
import { drawKit } from './lib/draw-kit.js';
import { fsmActions } from './lib/fsm-actions.js';
import { touchActions, viewOfTransform } from './lib/touch-actions.js';
import { emuActions, displayText } from './lib/emu-actions.js';
import { consoleCount } from './lib/project-actions.js';
import { sameLines } from './lib/hier-kit.js';
import { tr } from './lib/hdl-actions.js';

const FILE = 'test/usability/tablet.test.js';
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = (page) => page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not ${b} ± ${tol}`);
const tasks = (page) => page.eval(() => document.documentElement.dataset.layout === 'tasks');

/** A project made from `example` opened on the tablet in the run's language; the console's lines checked from the
 *  end of its opening on (`lines(want)`: those said since the last check, exactly). */
async function tabletProject(page, example, name) {
  await makeProject(env, { name, template: example });
  await page.openProject(name);
  if (RUN.lang !== 'en') await page.eval(async (l) => { (await import('/js/i18n.js')).setLanguage(l); }, RUN.lang);
  let n = await consoleCount(page);
  for (let k = 0, m = -1; k < 40 && n !== m; k++) { await sleep(250); m = n; n = await consoleCount(page); }
  const lines = async (want) => { await sameLines(page, n, want); n = await consoleCount(page); };
  return { T: touchActions(page), lines };
}

// the state diagram's kit, its Undo and Redo the main toolbar's buttons tapped, its Check its own button tapped
const KIT = drawKit('fsm', (page, b) => {
  const T = touchActions(page);
  return {
    ...fsmActions(page, b),
    undo: () => T.tap('#toolbar .tb-btn[data-cmd=undo]'),
    redo: () => T.tap('#toolbar .tb-btn[data-cmd=redo]'),
    async check() {
      const n0 = await page.eval(() => document.getElementById('console-log').textContent.length);
      await T.tap(`${b.ed} .fsm-check`);
      await page.waitFor((n) => document.getElementById('console-log').textContent.length > n, [n0], { what: 'checked' });
      await sleep(300);
      return page.eval((n) => document.getElementById('console-log').textContent.slice(n), n0);
    },
  };
});
const state = (d, name) => d.states.find((x) => x.name === name);

uiTest('usability: tablet: the traffic\'s state diagram by touch: opened from the drawer, states dragged by a finger, panned and pinched, a state renamed in Properties behind its ☰, Check, Undo and Redo tapped', E, async (page) => {
  const { T, lines } = await tabletProject(page, 'traffic', 'UsabTabletFsm');
  const silinx = await tasks(page);
  // the left side: the ISE style's drawer, open as the project opened (its ☰ in the header), the Silinx interface's
  // panel docked beside the document, folded and shown by its Layout button
  const left = () => page.eval(() => [document.documentElement.dataset.drawer, document.documentElement.dataset.side ?? null]);
  if (silinx) {
    await T.tap('#task-view [data-act=side]');
    await page.waitFor(() => document.documentElement.dataset.side === 'folded', [], { what: 'the side panel folded' });
    await T.tap('#task-view [data-act=side]');
    await page.waitFor(() => document.documentElement.dataset.side !== 'folded', [], { what: 'the side panel shown' });
  } else {
    assert.equal((await left())[0], 'open', 'the drawer open on the project');
    await T.tap('#drawer-btn');
    await page.waitFor(() => document.documentElement.dataset.drawer === 'closed', [], { what: 'the drawer closed' });
    await T.tap('#drawer-btn');
    await page.waitFor(() => document.documentElement.dataset.drawer === 'open', [], { what: 'the drawer open' });
  }
  // the diagram opened by a double tap on its row: the drawer gives way to it
  await T.doubleTap('#hier .row .lbl', { text: 'u_fsm' });
  await page.waitFor(() => window.Silinx.active?.fsmEditor, [], { what: 'the state diagram' });
  if (!silinx) assert.equal((await left())[0], 'closed', 'the drawer gave way to the diagram');
  await sleep(300);
  const s = new Session(page, env, { file: FILE, title: 'tablet: traffic: the state diagram', kit: KIT });
  s.docs.push(await s.settled());
  const { a } = s;
  const ed = '.doc:not([hidden]) .fsm-editor';
  // one finger on a state's middle, dragged: the state moved (to the grid), its transitions with it
  const drag = async (id, dx, dy) => {
    const st = s.doc.states.find((x) => x.id === id);
    const [p, q] = await a.view([[st.x, st.y], [st.x + dx, st.y + dy]]);
    await T.drag(p, q, { steps: 10 });
  };
  await s.step('finger drag', { state: 'WALK', dx: 60, dy: 40 }, () => drag('s4', 60, 40), { expect: (d) => assert.deepEqual([state(d, 'WALK').x, state(d, 'WALK').y], [840, 400]) });
  await s.step('finger drag', { state: 'NIGHT', dx: -40, dy: 120 }, () => drag('s7', -40, 120), { expect: (d) => assert.deepEqual([state(d, 'NIGHT').x, state(d, 'NIGHT').y], [40, 240]) });
  // two fingers and a pinch on the canvas: the view panned and zoomed, the diagram as it was
  const view = async () => viewOfTransform(await page.eval((e) => document.querySelector(`${e} .fsm-vp`).getAttribute('transform'), ed));
  const empty = await page.eval((e) => { const r = document.querySelector(`${e} .fsm-canvas`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 60 }; }, ed);
  let v0;
  await s.step('two fingers', { dx: 40, dy: -30 }, async () => { v0 = await view(); await T.pan(empty, 40, -30); await frame(page); }, {
    changes: false, expect: async () => { const v1 = await view(); near(v1.tx - v0.tx, 40, 1.5, 'panned (x)'); near(v1.ty - v0.ty, -30, 1.5, 'panned (y)'); },
  });
  await s.step('pinch', { spread: 1.5 }, async () => { v0 = await view(); await T.pinch(empty, 40, 60); await frame(page); }, {
    changes: false, expect: async () => near((await view()).s / v0.s, 1.5, 0.05, 'the zoom'),
  });
  // CARS tapped: selected; Properties behind the toolbar's ☰ shown over the canvas by a tap, the state's name typed
  // there (its field tapped, the tablet's keyboard)
  const props = () => page.eval((e) => document.querySelector(e).classList.contains('side-open'), ed);
  assert.equal(await props(), false, 'Properties hidden at first');
  const [propsL] = await tr(page, ['☰ Properties']);
  await s.step('rename in Properties', { state: 'CARS', to: 'GO' }, async () => {
    const [c] = await a.view([[state(s.doc, 'CARS').x, state(s.doc, 'CARS').y]]);
    await T.tap(c);
    await page.waitFor((e) => document.querySelector(`${e} [data-state="s1"].sel`), [ed], { what: 'CARS selected' });
    await T.tap(`${ed} button.narrow-only`, { text: propsL });
    await page.waitFor((e) => document.querySelector(e).classList.contains('side-open') && document.querySelector(`${e} .fsm-sname`)?.getClientRects().length, [ed], { what: 'Properties shown, the state\'s name' });
    await T.tap(`${ed} .fsm-sname`);
    await page.key('End');
    for (const _ of 'CARS') await page.key('Backspace');
    await page.type('GO');
    await page.key('Enter');
  }, { expect: (d) => assert.equal(state(d, 'GO')?.id, 's1') });
  // ☰ again: Properties hidden, the canvas whole
  await T.tap(`${ed} button.narrow-only`, { text: propsL });
  await page.waitFor((e) => !document.querySelector(e).classList.contains('side-open'), [ed], { what: 'Properties hidden' });
  // Check tapped: no warnings; its lines (where the machine stays in a state)
  await s.warnings([]);
  const stays = (st, when) => `INFO: State ${st}: no transition is true when ${when}; the machine stays in ${st}`;
  await lines(['Started : "Check State Diagram" of traffic.fsm.json.', stays('GO', 'req=0, done=0, night=0 (and 2 other combination(s))'),
    ...['CARS_YELLOW', 'ALL_RED', 'WALK', 'WALK_END', 'ALL_RED_2'].map((st) => stays(st, 'done=0')), stays('NIGHT', 'night=1'), 'Process "Check State Diagram" completed successfully']);
  await s.undoRedo();
  await lines([]);
  assert.equal(await page.eval(() => document.documentElement.scrollWidth > innerWidth), false, 'no sideways scroll');
}, { tablet: 'portrait', timeout: 180000 });

// the stopwatch's opening lines: its Check Syntax, the event-driven engine by default on a tablet
const parsed = ['debounce', 'to_decimal', 'sevenseg', 'stopwatch'].map((f) => `Parsing VHDL file "src/${f}.vhd" into library work`);
const SW_CHECK = ['Started : "Check Syntax".', ...parsed, 'Elaborating top module <stopwatch>: 52 signals, 23 processes.', 'Process "Check Syntax" completed successfully'];
const SW_EVENT = [...SW_CHECK, "Board Emulator: 'stopwatch' (RTL, event-driven) on Digilent Basys2 — 26 port bit(s) on board resources.",
  "Board Emulator: the design is simulated from its HDL (behavioural RTL) at a reduced clock rate; registers without an initial value start at 0, as on the FPGA; each display digit keeps the last pattern it showed between its refreshes, as your eye does on the real board.",
  "Board Emulator: the event-driven engine by default on this device (a phone or tablet): choose Engine ▸ Compiled to run the design at the board's real speed."];
const SW_COMPILED = [...SW_CHECK, "Board Emulator: 'stopwatch' (RTL, compiled) on Digilent Basys2 — 26 port bit(s) on board resources.",
  "Board Emulator: the design is compiled (its netlist, by Yosys) and runs at up to the board's clock rate; registers without an initial value start at 0, as on the FPGA; the event-driven engine shows X values and the design's messages. Each display digit keeps the last pattern it showed between its refreshes, as your eye does on the real board."];
const hundredths = (t) => Number(t.replace(/[^\d]/g, '') || 0);

uiTest('usability: tablet: the stopwatch on the Board Emulator by taps: Engine ▸ Compiled, its ☰ Properties, started, stopped (the time kept), cleared', E, async (page) => {
  const { T, lines } = await tabletProject(page, 'stopwatch', 'UsabTabletSw');
  // Emulate: the Silinx interface's task, its side panel (shown with no board open, #5299) and Emulate on Board in it;
  // the ISE style's toolbar button
  if (await tasks(page)) {
    await T.tap(`${await page.eval(() => (document.getElementById('task-tabs')?.getClientRects().length ? '#task-tabs' : '#task-switch'))} .task-btn[data-task="emu"]`);
    await page.waitFor(() => document.documentElement.dataset.task === 'emu', [], { what: 'Emulate' });
    await T.tap('button.btn', { text: (await tr(page, ['Emulate on Board']))[0] });
  } else await T.tap('#toolbar .tb-btn[data-cmd=board]');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'the emulator', timeout: 120000 });
  await sleep(1500);
  await lines(SW_EVENT);
  const DOC = '.doc:not([hidden]) .emu';
  await T.tap(`${DOC} .emu-bar .tb-more-btn`);
  await T.tap(`${DOC} .emu-bar .tb-more-menu [data-value="compiled"]`);
  await page.waitFor(() => window.SilinxApp.findDoc('emulator')?.view?.outputs && window.SilinxApp.findDoc('emulator').view.engine === 'compiled', [], { what: 'the compiled engine', timeout: 120000 });
  await sleep(1500);
  await lines(SW_COMPILED);
  // ☰ Properties: the side panel over the board, and hidden again
  const side = () => page.eval((d) => document.querySelector(d).classList.contains('side-open'), DOC);
  const was = await side();
  await T.tap(`${DOC} .emu-props-btn`);
  assert.equal(await side(), !was, '☰ Properties');
  await T.tap(`${DOC} .emu-props-btn`);
  assert.equal(await side(), was, '☰ Properties again');
  const a = emuActions(page);
  const [runL, pauseL] = await tr(page, ['▶ Run', '⏸ Pause']);
  const shown = async () => displayText(await a.digits());
  const pause = async () => { await T.tap(`${DOC} .emu-bar .btn`, { text: pauseL }); await page.waitFor(() => !window.Silinx.active.view.sim.busy, [], { what: 'paused' }); await sleep(300); };
  const run = () => T.tap(`${DOC} .emu-bar .btn`, { text: runL });
  const tapButton = (k) => T.tap(`${DOC} [data-part="btn${k}"]`);
  // (each button tapped while the board runs, as on the real board; then paused to read it)
  const press = async (k, ms) => { await run(); await tapButton(k); await sleep(ms); await pause(); return shown(); };
  await pause();
  assert.equal(await shown(), ' 0.00', 'the start');
  // BTN0: the time runs
  const t1 = await press(0, 1500);
  assert.ok(hundredths(t1) > 0, `started: ${t1}`);
  // BTN0 again: stopped; the time kept while the board runs on
  const t2 = await press(0, 300);
  assert.ok(hundredths(t2) > hundredths(t1), `stopped at ${t2}, after ${t1}`);
  await run();
  await sleep(1000);
  await pause();
  assert.equal(await shown(), t2, 'the time kept while stopped');
  // BTN2: cleared
  assert.equal(await press(2, 800), ' 0.00', 'cleared');
  await lines([]);
}, { tablet: 'portrait', timeout: 180000 });

// (#5299: on a tablet in portrait the Silinx interface's Emulate page showed nothing to start the emulator, its side
// panel folded)
uiTest('usability: tablet: Emulate tapped: a way to start the emulator shown (#5299)', E, async (page) => {
  const { T, lines } = await tabletProject(page, 'stopwatch', 'UsabTabletEmuStart');
  await T.tap(`${await page.eval(() => (document.getElementById('task-tabs')?.getClientRects().length ? '#task-tabs' : '#task-switch'))} .task-btn[data-task="emu"]`);
  await page.waitFor(() => document.documentElement.dataset.task === 'emu', [], { what: 'Emulate' });
  // (its side panel shown, no board open yet; the board opened folds it, its room)
  assert.equal(await page.eval(() => document.documentElement.dataset.side), 'open');
  await T.tap('button.btn', { text: (await tr(page, ['Emulate on Board']))[0] });
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'the emulator', timeout: 120000 });
  await page.waitFor(() => document.documentElement.dataset.side === 'folded', [], { what: 'the side panel folded for the board' });
  await sleep(1500);
  await lines(SW_EVENT);
}, { tablet: 'portrait', timeout: 120000, skip: RUN.ui === 'ise' && 'the tasks are the Silinx interface\'s' });
