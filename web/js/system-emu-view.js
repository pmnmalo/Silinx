// The System Emulator (#5212, docs/CODESIGN.md, Emulation): a co-design System's boards side by side, interactive, run
// together in real time by the co-simulation scheduler in its Web Worker (web/js/system-remote.js, `emulate`: core/
// system-emu.js). An FPGA node's board is the Board Emulator's drawing and parts (web/js/emulator-board.js
// mountBoardParts: its switches and buttons set the node's pins, its LEDs and digits painted from what the worker says
// they showed); an Arduino's is Silinx's own (web/js/emulator-arduino.js); a serial terminal per terminal node in the
// side panel; a circuit node's circuit as the Circuit editor draws it (#5322: its LEDs lit from the run, a click on a
// switch or a DIP switch's lever turning it, a button held down while pressed). Run / Pause and Restart in its toolbar; its status line the time and the rate against real time; the
// nodes' and the decoders' messages in the console (`onMessage`), never in the view (docs/UI-GUIDELINES.md).
//
//   const v = mountSystemEmulator(host, { system, prepare(system) -> { run, inputs } | { error }, onMessage(text, level) });
//   v.run(); v.pause(); v.restart(); v.press(node, res, idx, on); v.state(); v.held(); v.destroy();
// While it is not seen (another browser tab, another document tab) it is held, as the Board Emulator (#5276:
// web/js/when-hidden.js, its When hidden setting), and on in real time when seen again, the time held not caught up.
import { h } from './ui.js';
import { mountBoardParts } from './emulator-board.js';
import { injectStyle } from './emulator.js';
import { ledLook } from './emulator-paint.js';
import { arduinoLayout } from './emulator-arduino.js';
import { statusLine } from './status-line.js';
import { mountSideFold } from './side-fold.js';
import { panelToggle, PROPS_KEY } from './narrow.js';
import { emulationBoards, pinOf } from '/core/system-emu.js';
import { pressHolds } from '/core/emulate-press.js';
import { runTimeText } from '/core/system-run.js';
import { nextFrame, watchSeen } from './when-hidden.js';
import { sv } from './dom.js';
import { drawCircuit } from './circuit-draw.js';

const MAX_STEP = 50e9;     // the most one run goes ahead (ps): 50 ms
const BEHIND = 200e9;      // behind real time by more (ps): the backlog dropped

export function mountSystemEmulator(host, opts) {
  injectStyle();
  let ready = null, boards = [], views = new Map(), shown = {}, report = null, running = false, busy = false, destroyed = false;
  let wall0 = 0, sim0 = 0, rate = null, rateAt = { wall: 0, sim: 0 }, saidLog = 0;
  const say = (text, level = 'info') => opts.onMessage?.(text, level);
  // (a button let go held down until the design saw a real press, as the Board Emulator's, #3109; the boards' time)
  const holds = pressHolds(), clock = { now: 0, busy: false };
  const btn = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn ${cls}`, title, onclick }, label);
  const runBtn = btn('▶ Run', 'Run the System in real time until Pause', () => (running ? pause() : run()), 'sysemu-run');
  const resetBtn = btn('Restart', 'Restart the System from time 0 (its modules compiled again)', () => restart(), 'sysemu-restart');
  const root = h('div', { class: 'asm-editor sys-emu' });
  const boardsEl = h('div', { class: 'sys-emu-boards' });
  const terms = h('div', { class: 'sys-terms' });
  const side = h('aside', { class: 'asm-side' }, h('div', { class: 'asm-cap' }, 'Terminals'), terms);
  const info = statusLine();
  root.append(h('div', { class: 'asm-toolbar' }, h('div', { class: 'asm-group' }, runBtn, resetBtn), h('div', { class: 'asm-spacer' }),
    h('div', { class: 'asm-group' }, panelToggle(root, btn('☰ Terminals', 'Show / hide the terminals panel'), { key: PROPS_KEY }))),
  h('div', { class: 'asm-body' }, h('div', { class: 'asm-main sys-emu-main' }, boardsEl), side), info.el);
  host.replaceChildren(root);
  mountSideFold({ root, side, key: 'silinx.sysemu.side.folded', titles: { fold: 'Collapse the terminals panel', unfold: 'Expand the terminals panel' } });
  // (next: the next frame's cancel; none while held)
  let next = null;
  const seen = watchSeen(root, () => {
    if (seen.held()) { next?.(); next = null; return; }
    if (running && report) { wall0 = performance.now(); sim0 = report.now; rateAt = { wall: wall0, sim: sim0 }; }
    schedule();
  });
  function schedule() { if (!next && running && !destroyed && !seen.held()) next = nextFrame(() => { next = null; frame(); }); }

  // an FPGA node's board: the Board Emulator's parts, its inputs the node's pins
  function fpgaView(b) {
    const bitFor = (res, k = 0) => b.wiring.bits.find(x => x.res.name === res && x.idx === k) || null;
    const resOf = name => b.board.resources.find(r => r.name === name) || null;
    const tip = (res, k = 0) => { const x = bitFor(res, k); return x ? `${res.toUpperCase()}${k}: ${x.bit} (${x.loc})` : `${res.toUpperCase()}${k}: not connected`; };
    const period = ready.inputs.plan.fpga.find(f => f.id === b.id)?.clock.period ?? 20000;
    const main = h('div', { class: 'sys-emu-board', 'data-node': b.id });
    const { leds, digits } = mountBoardParts({
      board: { ...b.board.board, resources: b.board.resources }, title: b.id, main, wiring: b.wiring, period, bitFor, resOf, tip, resLabel: {},
      setInputBit: (x, level) => ready?.set(b.id, pinOf(x), level !== !!x.res.extra?.activeLow ? 1 : 0),
      // (what the System Emulator does not have: the LCD, the rotary encoder, the power switch, a manual clock)
      holds, sim: clock, compiled: () => false, running: () => running,
      refresh() {}, after() {}, runCycles() {}, speed: () => 'real', hasLcd: false, lcdView: () => null, setLcdView() {}, knobEnd: () => 0,
      setKnobEnd() {}, inVal: new Map(), manual: [], powered: () => true, setPower() {},
    });
    return { el: main, paint(s) {
      leds.forEach((l, k) => Object.assign(l.style, ledLook(s?.leds[k] ?? 0, l.dataset.colour === 'red')));
      digits.forEach((d, k) => d && d.set(s?.digits[k] ?? null));
    } };
  }
  // a circuit node: its circuit drawn, its lamps and inputs painted from what the worker says (#5322)
  function circuitView(b) {
    const svg = sv('svg', { class: 'sys-emu-circ', 'data-no-i18n': 'true' });
    const el = h('div', { class: 'sys-emu-board circuit-editor sys-emu-circuit', 'data-node': b.id }, h('div', { class: 'sys-emu-cap', 'data-no-i18n': 'true' }, b.id), svg);
    let cur = null, said = null;
    const set = (pin, on) => ready?.set(b.id, pin, on ? 1 : 0);
    svg.addEventListener('pointerdown', e => {
      const i = e.target.closest?.('[data-input]'), g = e.target.closest?.('[data-kind="part"]');
      if (!i || !g || !ready) return;
      const id = g.dataset.id, now = cur?.inputs?.[id];
      // (a temperature sensor's − and +, #5342: a degree less or more)
      if (i.dataset.input === 'temp-up' || i.dataset.input === 'temp-down') { const t = cur?.sensors?.[id]?.temp ?? 25; ready?.set(b.id, id, t + (i.dataset.input === 'temp-up' ? 1 : -1)); }
      else if (i.dataset.input === 'button') { set(id, true); window.addEventListener('pointerup', () => set(id, false), { once: true }); }
      else if (i.dataset.input === 'dip') { const k = Number(i.dataset.lever); set(`${id}:${k + 1}`, !(Array.isArray(now) && now[k])); }
      else set(id, !now);
      e.preventDefault();
    });
    return { el, paint(s) {
      const key = JSON.stringify([s?.leds, s?.inputs, s?.lcds, s?.oleds, s?.sensors, s?.servos]);
      if (key === said) return;
      said = key; cur = s;
      svg.replaceChildren(drawCircuit(b.model, { leds: s?.leds ?? null, lcds: s?.lcds ?? null, oleds: s?.oleds ?? null, sensors: s?.sensors ?? null, servos: s?.servos ?? null, inputs: s?.inputs ?? null }));
      // (its size the drawing's, at most 720 pixels wide)
      const r = svg.firstChild.getBBox?.();
      if (r && r.width) { svg.setAttribute('viewBox', `${r.x - 10} ${r.y - 10} ${r.width + 20} ${r.height + 20}`); svg.style.width = `${Math.min(720, r.width + 20)}px`; }
    } };
  }
  function layout() {
    views = new Map(boards.map(b => {
      if (b.kind === 'fpga') return [b.id, fpgaView(b)];
      if (b.kind === 'circuit') return [b.id, circuitView(b)];
      const a = arduinoLayout({ h, board: b.board, title: b.id });
      return [b.id, { el: h('div', { class: 'sys-emu-board', 'data-node': b.id }, a.wrap), paint: a.paint }];
    }));
    boardsEl.replaceChildren(...[...views.values()].map(v => v.el));
    terms.replaceChildren(...ready.terminals.map(id => {
      const u = opts.system().nodes.find(n => n.id === id)?.interfaces[0];
      const out = h('pre', { class: 'sys-term-out', 'data-term': id });
      const input = h('input', { type: 'text', class: 'asm-input sys-term-in', placeholder: 'Type a line, Enter sends it', spellcheck: 'false' });
      input.addEventListener('keydown', e => { if (e.key !== 'Enter') return; ready.send(id, [...new TextEncoder().encode(`${input.value}\n`)]); input.value = ''; });
      return h('section', { class: 'sys-term' }, h('div', { class: 'sys-term-cap' }, `${id} · ${u?.baud ?? 9600} ${u?.frame ?? '8N1'}`), out, input);
    }));
    paint();
  }
  function paint() {
    for (const [id, v] of views) v.paint(shown[id]);
    for (const [id, text] of Object.entries(report?.terminals || {})) { const el = terms.querySelector(`[data-term="${CSS.escape(id)}"]`); if (el && el.textContent !== text) { el.textContent = text; el.scrollTop = el.scrollHeight; } }
    info.set([report && `t = ${runTimeText(report.now)}`, rate != null && running && { text: `${Math.round(rate * 100)}% of real time`, cls: 'sysemu-rate' }]);
    const said = [...(report?.errors || []).map(e => ['ERROR', e, 'error']), ...(report?.warnings || []).map(w => ['WARNING', w, 'warn'])];
    for (const [tag, text, level] of said.slice(saidLog)) say(`${tag}: Emulate System: ${text}`, level);
    saidLog = said.length;
  }

  // the System made ready (again after Restart): compiled, its worker started with its boards
  async function prepare() {
    if (ready) return ready;
    info.set(['Compiling…']);
    const r = await opts.prepare(opts.system());
    if (destroyed) return null;
    if (r.error) { say(`ERROR: Emulate System: ${r.error}`, 'error'); info.set([]); return null; }
    ready = r; boards = emulationBoards(opts.system(), r.inputs); saidLog = 0; clock.now = 0;
    say(`Emulate System: ${r.nodes.join(', ')} ready, ${boards.length} board(s).`);
    const st = await r.run(0);
    report = st.report; shown = st.boards || {};
    layout();
    return r;
  }
  // a frame: the run ahead to real time (at most MAX_STEP a run, one at a time), what the boards showed painted
  async function frame() {
    if (!running || busy || destroyed || seen.held()) return;
    const target = sim0 + (performance.now() - wall0) * 1e9;
    if (target - report.now > BEHIND) { sim0 = report.now; wall0 = performance.now(); }   // (too slow: the backlog dropped)
    busy = true; clock.busy = true;
    let st;
    try { st = await ready.run(Math.min(Math.max(target, report.now), report.now + MAX_STEP)); } catch (e) { say(`ERROR: Emulate System: ${e.message}`, 'error'); busy = false; pause(); return; }
    busy = false; clock.busy = false;
    if (destroyed || !running) return;
    report = st.report; shown = st.boards || shown; clock.now = report.now;
    holds.tick(clock.now, { settled: true });
    const wall = performance.now();
    if (wall - rateAt.wall > 500) { rate = (report.now - rateAt.sim) / 1e9 / (wall - rateAt.wall); rateAt = { wall, sim: report.now }; }
    paint();
    if (st.finished) { pause(); return; }
    schedule();
  }
  async function run() {
    if (running || !(await prepare())) return;
    running = true; runBtn.textContent = '⏸ Pause';
    wall0 = performance.now(); sim0 = report.now; rateAt = { wall: wall0, sim: sim0 }; rate = null;
    schedule();
  }
  function pause() {
    if (!running) return;
    running = false; runBtn.textContent = '▶ Run';
    next?.(); next = null;
    if (report) say(`Emulate System: paused at ${runTimeText(report.now)}.`);
    paint();
  }
  async function restart() {
    pause(); holds.flush(); ready?.close(); ready = null; report = null; shown = {}; boardsEl.replaceChildren(); terms.replaceChildren();
    await prepare();
  }
  prepare();

  return {
    run, pause, restart,
    /** A board's switch or button set as its click does (res, idx: its resource and index; on: pressed or on). */
    press(node, res, idx, on) {
      const b = boards.find(x => x.id === node && x.kind === 'fpga'), x = b?.wiring.bits.find(y => y.res.name === res && y.idx === idx);
      if (!x) throw new Error(`no ${res}${idx} on ${node}'s board`);
      ready.set(node, pinOf(x), on ? 1 : 0);
    },
    state: () => (report ? { now: report.now, running, boards: shown, terminals: report.terminals, warnings: report.warnings, errors: report.errors } : null),
    /** Held while not seen (#5276). */
    held: () => running && seen.held(),
    destroy() { destroyed = true; running = false; next?.(); seen.destroy(); ready?.close(); host.replaceChildren(); },
  };
}
