// The System's simulation view (#4701, docs/SYSTEMS.md): the System editor's bottom panel, Simulate System. Its System
// made ready (core/system-run.js: the FPGA nodes' modules compiled by Yosys, the firmware read: `prepare`, the page's),
// then run in its Web Worker (web/js/system-remote.js) in slices (Run, Pause, Run 100 ms, Restart), its time in the
// panel's bar; a
// serial terminal for each terminal node (its text received, a line typed sent with Enter), the link inspector (each
// wire's decoded bytes with their times) and the System's waves in the waveform viewer (`openWaves`). The nodes' and the
// decoders' warnings go to the console (`onMessage`), never into the panel (docs/UI-GUIDELINES.md).
//
//   const v = mountSystemSim(host, { system: () => model, prepare(model) -> run (startSystemRun's) | { error }, onMessage(text, level),
//     openWaves(design, now, name), ms() (its run's time, #5581), name() (Simulate System, Simulate Node <id>), status (a
//     document's status line, its time there) });
//   v.restart(); v.runFor(ps); v.pause(); v.state(); v.destroy();
import { h } from './ui.js';
import { t as tr } from './i18n.js';
import { bytesText, runTimeText, termCaption } from '/core/system-run.js';
import { usText, byteText } from '/core/system-decode.js';

const SLICE = 5e9;        // a slice of the run between two frames (ps): 5 ms
const SHOWN = 200;        // a wire's last bytes shown

export function mountSystemSim(host, opts) {
  let ready = null, report = null, preparing = null, target = 0, timer = null, destroyed = false, saidLog = 0, saidDecoded = new Set();
  const btn = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn ${cls}`, title, onclick }, label);
  const runBtn = btn('▶ Run', 'Run the System until Pause', () => (timer ? pause() : runFor(Infinity)), 'sys-run');
  // (its run's time the Simulation Properties', 100 ms by default, #5581; `name` what the run is called: Simulate System,
  // Simulate Node <id>)
  const ms = () => opts.ms?.() ?? 100, NAME = () => opts.name?.() ?? 'Simulate System';
  const stepBtn = btn(`Run ${ms()} ms`, `Run the System for ${ms()} ms`, () => runFor(ms() * 1e9), 'sys-run-for');
  const resetBtn = btn('Restart', 'Restart the System from time 0 (its modules compiled again)', () => restart(), 'sys-restart');
  const wavesBtn = btn('Waves', 'Show the System\'s waves in the waveform viewer', async () => { if (!ready) return; const w = await ready.waves(); opts.openWaves?.(w.design, w.now, opts.system().name); }, 'sys-waves');
  const timeEl = h('span', { class: 'sys-sim-time' }, '');
  // (its time: a document's status line, #5581's Simulate System, else its bar's)
  const setTime = t => { if (opts.status) opts.status.set(t ? [t] : []); else timeEl.textContent = t; };
  if (opts.status) timeEl.hidden = true;
  const terms = h('div', { class: 'sys-terms' });
  const wires = h('div', { class: 'sys-wires' });
  host.replaceChildren(h('div', { class: 'sys-sim-bar' }, runBtn, stepBtn, resetBtn, wavesBtn, timeEl), h('div', { class: 'sys-sim-body' }, terms, wires));
  const say = (text, level = 'info') => opts.onMessage?.(text, level);

  // the System made ready (once, again after Restart): its terminals' and wires' places
  async function prepare() {
    if (ready) return ready;
    preparing ??= (async () => {
      setTime('Compiling…');
      const r = await opts.prepare(opts.system());
      if (destroyed) return null;
      if (r.error) { say(`ERROR: ${NAME()}: ${r.error}`, 'error'); setTime(''); return null; }
      ready = r; saidLog = 0; saidDecoded = new Set();
      say(`${NAME()}: ${r.nodes.join(', ')} ready, ${r.wires.length} wire(s).`);
      report = (await r.run(0)).report;
      layout();
      return r;
    })().finally(() => { preparing = null; });
    return preparing;
  }
  function layout() {
    terms.replaceChildren(...ready.terminals.map((id) => {
      const u = opts.system().nodes.find(n => n.id === id)?.interfaces[0];
      const out = h('pre', { class: 'sys-term-out', 'data-term': id });
      const input = h('input', { type: 'text', class: 'asm-input sys-term-in', placeholder: 'Type a line, Enter sends it', spellcheck: 'false' });
      input.addEventListener('keydown', e => { if (e.key !== 'Enter') return; ready.send(id, [...new TextEncoder().encode(`${input.value}\n`)]); input.value = ''; if (!timer) runFor(ms() * 1e9); });
      return h('section', { class: 'sys-term' }, h('div', { class: 'sys-term-cap' }, termCaption(id, u)), out, input);
    }));
    refresh();
  }
  // the panel as the run is now: the time, the terminals' text, the wires' bytes; the new warnings to the console
  function refresh() {
    if (!ready || !report) return;
    const rep = report;
    setTime(`t = ${runTimeText(rep.now)}`);
    for (const [id, text] of Object.entries(rep.terminals)) { const el = terms.querySelector(`[data-term="${CSS.escape(id)}"]`); if (el && el.textContent !== text) { el.textContent = text; el.scrollTop = el.scrollHeight; } }
    wires.replaceChildren(...rep.traffic.map(t => h('section', { class: 'sys-wire', 'data-wire': t.wire },
      h('div', { class: 'sys-wire-cap' }, `${t.wire}: ${t.from} → ${t.to} · ${t.kind === 'uart' ? `${t.baud} ${t.frame} · ${t.bytes.length} B` : `${t.changes} ${tr('change(s)')}`}`),
      t.kind === 'uart' ? h('div', { class: 'sys-wire-text' }, bytesText(t.bytes.slice(-SHOWN))) : null,
      t.kind === 'uart' ? h('div', { class: 'sys-wire-bytes' }, ...t.bytes.slice(-SHOWN).map(b => h('span', { class: `sys-byte${b.error ? ' err' : ''}`, title: `${usText(b.t)}${b.error ? `: a ${b.error} error` : ''}` }, byteText(b.byte)))) : null)));
    // (the nodes' errors and warnings in the order said, then the decoders' once each)
    const said = [...rep.errors.map(e => ['ERROR', e, 'error']), ...rep.warnings.filter(w => !rep.traffic.some(t => t.decoded.includes(w))).map(w => ['WARNING', w, 'warn'])];
    for (const [tag, text, level] of said.slice(saidLog)) say(`${tag}: ${NAME()}: ${text}`, level);
    saidLog = said.length;
    for (const w of rep.traffic.flatMap(t => t.decoded)) if (!saidDecoded.has(w)) { saidDecoded.add(w); say(`WARNING: ${NAME()}: ${w}`, 'warn'); }
  }

  /** Run for `ps` from now (Infinity: until Pause), in slices. */
  async function runFor(ps) {
    if (timer || !(await prepare())) return;
    target = report.now + ps;
    runBtn.textContent = '⏸ Pause';
    const run = ready;
    timer = true;
    while (timer && !destroyed && ready === run) {
      let st;
      try { st = await run.run(Math.min(target, report.now + SLICE)); } catch (e) { say(`ERROR: ${NAME()}: ${e.message}`, 'error'); break; }
      if (ready !== run) return;
      report = st.report;
      refresh();
      if (st.finished || report.now >= target) break;
    }
    if (ready === run) stop();
  }
  // (a run stopped: each SPI and I²C link's transfers and a register map's accesses, the MCP's lines, #5288; a circuit
  // node's lamps, #5215)
  const busLines = rep => rep.lines.filter(l => l.startsWith('circuit ') || [...(rep.spi || []), ...(rep.i2c || []), ...(rep.regs || [])].some(x => l.startsWith(`${x.link} (`)));
  function stop() {
    timer = null; runBtn.textContent = '▶ Run';
    if (!report) return;
    for (const l of busLines(report)) say(`${NAME()}: ${l}`);
    say(`${NAME()}: paused at ${runTimeText(report.now)}.`);
  }
  function pause() { if (timer) timer = null; }
  async function restart() { pause(); ready?.close(); ready = null; report = null; terms.replaceChildren(); wires.replaceChildren(); setTime(''); runBtn.textContent = '▶ Run'; await prepare(); }

  return {
    runFor, pause, restart, refresh,
    state: () => (report ? { ...report, running: !!timer } : null),
    destroy() { destroyed = true; timer = null; ready?.close(); host.replaceChildren(); },
  };
}
