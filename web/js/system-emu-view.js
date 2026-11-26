// The System Emulator (#5212, docs/SYSTEMS.md, Emulation): a System's boards side by side, interactive, run
// together in real time by the co-simulation scheduler in its Web Worker (web/js/system-remote.js, `emulate`: core/
// system-emu.js). An FPGA node's board is the Board Emulator's drawing and parts (web/js/emulator-board.js
// mountBoardParts: its switches and buttons set the node's pins, its LEDs and digits painted from what the worker says
// they showed); an Arduino's is Silinx's own (web/js/emulator-arduino.js), an Explorer 16/32's too (web/js/emulator-explorer.js, #5484); a serial terminal per terminal node in the
// side panel; a circuit node's circuit as the Circuit editor draws it (#5322: its LEDs lit from the run, a click on a
// switch or a DIP switch's lever turning it, a button held down while pressed). its toolbar the Board Emulator's controls a System has (#5613: Run / Pause, Step, Power cycle, its rate against real time;
// its ⋮ menu what it does while hidden); its status line the time, the rate against real time and each FPGA node's model; the
// nodes' and the decoders' messages in the console (`onMessage`), never in the view (docs/UI-GUIDELINES.md).
//
//   const v = mountSystemEmulator(host, { system, prepare(system) -> { run, inputs } | { error }, onMessage(text, level), models() });
//   v.run(); v.pause(); v.step(); v.restart(); v.rate(f); v.press(node, res, idx, on); v.state(); v.held(); v.destroy();
// While it is not seen (another browser tab, another document tab) it is held, as the Board Emulator (#5276:
// web/js/when-hidden.js, its When hidden setting), and on in real time when seen again, the time held not caught up.
import { h } from './ui.js';
import { mountBoardParts } from './emulator-board.js';
import { injectStyle } from './emulator.js';
import { ledLook } from './emulator-paint.js';
import { arduinoLayout } from './emulator-arduino.js';
import { explorerLayout } from './emulator-explorer.js';
import { statusLine } from './status-line.js';
import { mountSideFold } from './side-fold.js';
import { panelToggle, PROPS_KEY } from './narrow.js';
import { emulationBoards, pinOf } from '/core/system-emu.js';
import { pressHolds } from '/core/emulate-press.js';
import { runTimeText, termCaption } from '/core/system-run.js';
import { nextFrame, watchSeen, hiddenPref, setHiddenPref } from './when-hidden.js';
import { menuChoice, toolbarMenu } from './toolbar-menu.js';
import { sv } from './dom.js';
import { drawCircuit } from './circuit-draw.js';
import { encoderTurn } from '/core/circuit-encoder.js';
import { partDef, nudged, sensePin } from '/core/circuit-parts.js';
import { realBoardControl } from './system-serial-ui.js';

const MAX_STEP = 50e9;     // the most one run goes ahead (ps): 50 ms
const STEP_PS = 100e6;     // Step in a System of several FPGA nodes or none: one step of its scheduler (ps), 100 µs
// its rates against real time (#5613)
const RATES = [[1, 'Real time'], [0.1, '1/10 of real time'], [0.01, '1/100 of real time'], [0.001, '1/1000 of real time']];
const BEHIND = 200e9;      // behind real time by more (ps): the backlog dropped

export function mountSystemEmulator(host, opts) {
  injectStyle();
  let ready = null, boards = [], views = new Map(), shown = {}, report = null, running = false, busy = false, destroyed = false;
  const reals = new Map();   // (each terminal's Real Board, #5449)
  let wall0 = 0, sim0 = 0, rate = null, rateAt = { wall: 0, sim: 0 }, saidLog = 0, factor = 1;   // (factor: the run's rate against real time, #5613)
  const say = (text, level = 'info') => opts.onMessage?.(text, level);
  // (a button let go held down until the design saw a real press, as the Board Emulator's, #3109; the boards' time)
  const holds = pressHolds(), clock = { now: 0, busy: false };
  const btn = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn ${cls}`, title, onclick }, label);
  // (its toolbar, the Board Emulator's controls that a System has, #5613: Run / Pause, Step, Power cycle, its rate against
  // real time; its menu: what it does while hidden; each FPGA node's model in its status line)
  const runBtn = btn('▶ Run', 'Run the System at its rate until Pause', () => (running ? pause() : run()), 'sysemu-run');
  const stepBtn = btn('⏭ Step', 'Advance one clock cycle of its FPGA node (a System of several: one step of its scheduler, 100 µs)', () => step(), 'sysemu-step');
  const resetBtn = btn('⟲ Power cycle', 'Power-cycle the boards: restart the System from time 0 (its modules compiled again)', () => restart(), 'sysemu-restart');
  const speedSel = h('select', { class: 'sysemu-speed', title: 'The emulation\'s rate against real time', onchange: e => setFactor(Number(e.target.value)) },
    ...RATES.map(([v, l]) => h('option', { value: String(v), selected: v === 1 }, l)));
  const more = toolbarMenu(menuChoice('When hidden', [{ value: 'pause', label: 'Pause' }, { value: 'run', label: 'Keep running' }], {
    value: hiddenPref(), title: 'What the emulator and every Try it do while not seen (another browser tab, a minimised window, another document tab): pause, and go on where they were when shown again, or keep running',
    onChange: v => setHiddenPref(v) }), { title: 'When hidden', btnClass: 'asm-btn' });
  // an FPGA node's model, as its status line names it (#5612: its Emulation Properties'; the RTL by default)
  const modelName = id => opts.models?.()?.[id] ?? 'Behavioral (RTL)';
  const root = h('div', { class: 'asm-editor sys-emu' });
  const boardsEl = h('div', { class: 'sys-emu-boards' });
  const terms = h('div', { class: 'sys-terms' });
  const side = h('aside', { class: 'asm-side' }, h('div', { class: 'asm-cap' }, 'Terminals'), terms);
  const info = statusLine();
  root.append(h('div', { class: 'asm-toolbar' }, h('div', { class: 'asm-group' }, runBtn, stepBtn, resetBtn), h('div', { class: 'asm-group' }, 'Rate:', speedSel),
    h('div', { class: 'asm-spacer' }), h('div', { class: 'asm-group' }, panelToggle(root, btn('☰ Terminals', 'Show / hide the terminals panel'), { key: PROPS_KEY }), more.el)),
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
      // (its speed for a press's length, #5619: real time, else its rate's cycles a second, as the Board Emulator's set speeds)
      refresh() {}, after() {}, runCycles() {}, speed: () => (factor === 1 ? 'real' : factor * 1e12 / period), hasLcd: false, lcdView: () => null, setLcdView() {}, knobEnd: () => 0,
      setKnobEnd() {}, inVal: new Map(), manual: [], powered: () => true, setPower() {},
    });
    return { el: main, paint(s) {
      leds.forEach((l, k) => Object.assign(l.style, ledLook(s?.leds[k] ?? 0, l.dataset.colour)));
      digits.forEach((d, k) => d && d.set(s?.digits[k] ?? null));
    } };
  }
  // a circuit node: its circuit drawn, its lamps and inputs painted from what the worker says (#5322)
  function circuitView(b) {
    const svg = sv('svg', { class: 'sys-emu-circ', 'data-no-i18n': 'true' });
    const el = h('div', { class: 'sys-emu-board circuit-editor sys-emu-circuit', 'data-node': b.id }, h('div', { class: 'sys-emu-cap', 'data-no-i18n': 'true' }, b.id), svg);
    let cur = null, said = null;
    const detents = {};   // (each rotary encoder's turns, its knob's angle, #5451)
    const set = (pin, on) => ready?.set(b.id, pin, on ? 1 : 0);
    svg.addEventListener('pointerdown', e => {
      const i = e.target.closest?.('[data-input]'), g = e.target.closest?.('[data-kind="part"]');
      if (!i || !g || !ready) return;
      const id = g.dataset.id, now = cur?.inputs?.[id];
      // (a temperature sensor's − and +, #5342: a degree less or more)
      if (i.dataset.input === 'temp-up' || i.dataset.input === 'temp-down') { const t = cur?.sensors?.[id]?.temp ?? 25; ready?.set(b.id, id, t + (i.dataset.input === 'temp-up' ? 1 : -1)); }
      // (what a part senses, its − and +: an ultrasonic sensor's distance, #5456, a DHT's temperature and humidity, #5470)
      else if (i.dataset.input === 'sense-up' || i.dataset.input === 'sense-down') {
        const p = b.model.parts.find((q) => q.id === id), x = partDef(p.type).sense[Number(i.dataset.lever) || 0];
        const v = cur?.sonars?.[id]?.[x.prop] ?? cur?.dhts?.[id]?.[x.prop] ?? p[x.prop] ?? x.default;
        ready?.set(b.id, sensePin(p, x), nudged(x, v, i.dataset.input === 'sense-up' ? 1 : -1));
      }
      else if (i.dataset.input === 'button') { set(id, true); window.addEventListener('pointerup', () => set(id, false), { once: true }); }
      // (a keypad's key, #5364: held while the mouse is down, its pin `KP1:<n>`)
      else if (i.dataset.input === 'key' || i.dataset.input === 'push') { const k = `${id}:${Number(i.dataset.lever) + 1}`; set(k, true); window.addEventListener('pointerup', () => set(k, false), { once: true }); }
      // (a rotary encoder's ↺ and ↻, #5451: its quadrature on A and B, `ENC1:1` and `ENC1:2`, a quarter every 5 ms)
      else if (i.dataset.input === 'enc-cw' || i.dataset.input === 'enc-ccw') {
        const dir = i.dataset.input === 'enc-cw' ? 1 : -1;
        encoderTurn(dir).forEach(([a, q], k) => setTimeout(() => { set(`${id}:1`, a); set(`${id}:2`, q); }, k * 5));
        detents[id] = (detents[id] ?? 0) + dir; said = null;
      }
      else if (i.dataset.input === 'dip') { const k = Number(i.dataset.lever); set(`${id}:${k + 1}`, !(Array.isArray(now) && now[k])); }
      else set(id, !now);
      e.preventDefault();
    });
    return { el, paint(s) {
      const key = JSON.stringify([s?.leds, s?.inputs, s?.lcds, s?.oleds, s?.sensors, s?.servos, s?.buzzers, s?.steppers, s?.sds, s?.sonars, s?.pirs, s?.dhts, detents]);
      if (key === said) return;
      said = key; cur = s;
      svg.replaceChildren(drawCircuit(b.model, { leds: s?.leds ?? null, lcds: s?.lcds ?? null, oleds: s?.oleds ?? null, sensors: s?.sensors ?? null, servos: s?.servos ?? null, buzzers: s?.buzzers ?? null, steppers: s?.steppers ?? null, sds: s?.sds ?? null, sonars: s?.sonars ?? null, pirs: s?.pirs ?? null, dhts: s?.dhts ?? null, inputs: s?.inputs ?? null, encoders: detents }));
      // (its size the drawing's, at most 720 pixels wide)
      const r = svg.firstChild.getBBox?.();
      if (r && r.width) { svg.setAttribute('viewBox', `${r.x - 10} ${r.y - 10} ${r.width + 20} ${r.height + 20}`); svg.style.width = `${Math.min(720, r.width + 20)}px`; }
    } };
  }
  function layout() {
    views = new Map(boards.map(b => {
      if (b.kind === 'fpga') return [b.id, fpgaView(b)];
      if (b.kind === 'circuit') return [b.id, circuitView(b)];
      // (an Explorer 16/32's buttons, potentiometer and temperature sensor set through the worker, #5484)
      const a = b.arch === 'pic24' ? explorerLayout({ h, emu: b, title: b.id, set: (part, v) => ready?.set(b.id, part, v), holds, clock }) : arduinoLayout({ h, board: b.board, title: b.id });
      return [b.id, { el: h('div', { class: 'sys-emu-board', 'data-node': b.id }, a.wrap), paint: a.paint }];
    }));
    boardsEl.replaceChildren(...[...views.values()].map(v => v.el));
    terms.replaceChildren(...ready.terminals.map(id => {
      const u = opts.system().nodes.find(n => n.id === id)?.interfaces[0];
      const out = h('pre', { class: 'sys-term-out', 'data-term': id });
      const input = h('input', { type: 'text', class: 'asm-input sys-term-in', placeholder: 'Type a line, Enter sends it', spellcheck: 'false' });
      // (joined to a real board, #5449: its port's text, the line typed sent to the board)
      const rb = realBoardControl({ id, system: opts.system, out, say });
      reals.set(id, rb);
      input.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const bytes = [...new TextEncoder().encode(`${input.value}\n`)];
        if (rb.connected()) rb.send(bytes); else ready.send(id, bytes);
        input.value = '';
      });
      return h('section', { class: 'sys-term' }, h('div', { class: 'sys-term-cap' }, h('span', {}, termCaption(id, u)), rb.el), out, input);
    }));
    paint();
  }
  function paint() {
    for (const [id, v] of views) v.paint(shown[id]);
    for (const [id, text] of Object.entries(report?.terminals || {})) { if (reals.get(id)?.connected()) continue; const el = terms.querySelector(`[data-term="${CSS.escape(id)}"]`); if (el && el.textContent !== text) { el.textContent = text; el.scrollTop = el.scrollHeight; } }
    info.set([report && `t = ${runTimeText(report.now)}`, rate != null && running && { text: `${Math.round(rate * 100)}% of real time`, cls: 'sysemu-rate' },
      ...boards.filter(b => b.kind === 'fpga').map(b => ({ text: `${b.id}: ${modelName(b.id)}`, cls: 'sysemu-model' }))]);
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
    ready = r; boards = emulationBoards(r.system ?? opts.system(), r.inputs); saidLog = 0; clock.now = 0;   // (its nodes' pins read, #5581)
    say(`Emulate System: ${r.nodes.join(', ')} ready, ${boards.length} board(s).`);
    const st = await r.run(0);
    report = st.report; shown = st.boards || {};
    layout();
    return r;
  }
  // a frame: the run ahead to real time (at most MAX_STEP a run, one at a time), what the boards showed painted
  async function frame() {
    if (!running || busy || destroyed || seen.held()) return;
    const target = sim0 + (performance.now() - wall0) * 1e9 * factor;
    if (target - report.now > BEHIND) { sim0 = report.now; wall0 = performance.now(); }   // (too slow: the backlog dropped)
    busy = true; clock.busy = true;
    const was = ready;
    let st;
    try { st = await was.run(Math.min(Math.max(target, report.now), report.now + MAX_STEP)); } catch (e) { if (ready !== was) return; say(`ERROR: Emulate System: ${e.message}`, 'error'); busy = false; pause(); return; }
    if (ready !== was) return;   // (power-cycled meanwhile: the old run's answer dropped)
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
  // its rate against real time changed: from now on
  function setFactor(f) {
    factor = f > 0 ? f : 1;
    if (running && report) { wall0 = performance.now(); sim0 = report.now; rateAt = { wall: wall0, sim: sim0 }; rate = null; }
  }
  // Step: one clock cycle of its one FPGA node, else one step of the scheduler (Pedro's, #5613); paused first
  async function step() {
    pause();
    if (busy || !(await prepare())) return;
    const fpga = ready.inputs.plan.fpga;
    const dt = fpga.length === 1 ? fpga[0].clock.period : STEP_PS;
    busy = true;
    let st;
    try { st = await ready.run(report.now + dt); } catch (e) { say(`ERROR: Emulate System: ${e.message}`, 'error'); return; } finally { busy = false; }
    report = st.report; shown = st.boards || shown; clock.now = report.now;
    holds.tick(clock.now, { settled: true });
    paint();
  }
  function closeReals() { for (const rb of reals.values()) rb.close(); reals.clear(); }
  // (Power cycle: running again if it was, as the Board Emulator's)
  async function restart() {
    const was = running;
    // (a run in flight on the old worker never answers: not busy with it any more)
    pause(); holds.flush(); ready?.close(); ready = null; report = null; shown = {}; busy = false; clock.busy = false; boardsEl.replaceChildren(); terms.replaceChildren(); closeReals();
    if (await prepare() && was && !destroyed) run();
  }
  // (running once ready, as the Board Emulator: a button let go is held until the design saw a real press, and paused it
  // stayed pressed, #5619)
  prepare().then(r => { if (r && !destroyed && !running) run(); });

  return {
    run, pause, step, restart, rate: f => { speedSel.value = String(f); setFactor(f); },
    /** A board's switch or button set as its click does (res, idx: its resource and index; on: pressed or on). */
    press(node, res, idx, on) {
      const b = boards.find(x => x.id === node && x.kind === 'fpga'), x = b?.wiring.bits.find(y => y.res.name === res && y.idx === idx);
      if (!x) throw new Error(`no ${res}${idx} on ${node}'s board`);
      ready.set(node, pinOf(x), on ? 1 : 0);
    },
    state: () => (report ? { now: report.now, running, boards: shown, terminals: report.terminals, warnings: report.warnings, errors: report.errors } : null),
    /** Held while not seen (#5276). */
    held: () => running && seen.held(),
    destroy() { destroyed = true; running = false; next?.(); seen.destroy(); ready?.close(); closeReals(); host.replaceChildren(); },
  };
}
