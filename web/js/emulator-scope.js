// The Board Emulator's oscilloscope (#5383, core/scope.js): a box of its side panel, two channels each a one-bit signal of
// the design (a port, a board's pin, an internal signal), its level at the board's I/O voltage (3.3 V), drawn as the
// circuit editor's oscilloscope (web/js/circuit-draw-scope.js): its time base, scale and trigger (its knobs, a click),
// its cursors (a click on its screen), its measurements. From the event-driven engine's waveforms (the compiled engine
// keeps none: said in its box). Refreshed ten times a second while it is seen; a channel's waveform recorded from when it
// is chosen.
import { h, sv } from './dom.js';
import { drawScope } from './circuit-draw-scope.js';
import { scopeSettings } from '/core/circuit-scope.js';
import { waveTrace, triggerTime, measure, turnKnob, DIVS } from '/core/scope.js';
import { intervalWhileSeen } from './when-hidden.js';

const P = 20, X = 6, Y = 18;   // (the scope drawn as a part at (X, Y): its case from (0, 8) to (264, 360) pixels)
const IO_VOLTS = 3.3;

/** The box (null: a design with no one-bit signal). ctx: { design, sim, side, compiled() }. */
export function mountEmuScope({ design, sim, side, compiled }) {
  const bits = design.signals.filter((s) => !Array.isArray(s.init) && s.t?.w === 1 && s.t?.kind !== 'str');
  if (!bits.length) return null;
  const settings = scopeSettings({ tdiv: 1e-6, vdiv: 1, level: 1.6 }), ch = [null, null];
  let cursors = [], frozen = null;
  const pick = (k) => {
    const s = h('select', { class: `emu-scope-ch${k + 1}` }, h('option', { value: '' }, `CH${k + 1}: none`), ...bits.map((b, i) => h('option', { value: String(i), 'data-no-i18n': '' }, b.path || b.name)));
    s.addEventListener('change', () => { ch[k] = s.value === '' ? null : bits[Number(s.value)]; if (!compiled()) record(ch[k]); frozen = null; draw(); });
    return s;
  };
  const svg = sv('svg', { class: 'emu-scope-svg', viewBox: '-4 4 272 360', width: '100%' });
  const note = h('div', { class: 'hint emu-scope-note' });
  const box = h('div', { class: 'emu-box emu-scope circuit-editor' }, h('h4', {}, 'Oscilloscope'), pick(0), pick(1), note, svg);
  side.querySelector('.emu-box')?.before(box);
  svg.addEventListener('pointerdown', (e) => {
    const i = e.target.closest?.('[data-input]');
    if (!i) return;
    if (i.dataset.input === 'scope-screen') {
      const r = i.getBoundingClientRect();
      cursors = [...(cursors.length >= 2 ? [] : cursors), Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * settings.tdiv * DIVS];
    } else if (turnKnob(settings, i.dataset.input)) cursors = [];
    frozen = null;
    draw();
  });
  // the screen now: each channel's trace from its waveform, from the trigger (core/circuit-scope.js's screen, its
  // traces the waveforms')
  // (the emulator records no waveform but its outputs' for each run: a channel's own recorded from when it is chosen, and
  // again after a power cycle; its oldest half let go past 200 000 changes)
  function record(s) {
    if (!s) return;
    if (!s.wave) s.wave = { t: [sim.now], v: [s.val] };
    else if (s.wave.t.length > 200000) { s.wave.t.splice(0, 100000); s.wave.v.splice(0, 100000); }
  }
  function screen() {
    ch.forEach(record);
    const now = sim.now * 1e-12, span = settings.tdiv * DIVS;
    const tr = ch.map((s) => (s ? waveTrace(s.wave, now - 20 * span, IO_VOLTS) : null));
    const src = tr[settings.source - 1];
    const trig = src ? triggerTime(src, settings, now, span * 0.9) : null;
    const waiting = trig == null && settings.mode !== 'auto';
    const t0 = trig != null && !waiting ? trig - span * 0.1 : now - span, t1 = t0 + span;
    return { t0, t1, trig: waiting ? null : trig, waiting, ch: tr.map((x) => (x && !waiting ? { ...x.window(t0, t1), on: true } : { t: [], v: [], on: !!x })),
      m: tr.map((x) => (x && !waiting && x.t.length ? measure(x, t0, t1) : null)) };
  }
  function draw() {
    if (!box.isConnected) { tick.stop(); return; }
    note.textContent = compiled() ? 'The oscilloscope needs the event-driven engine (Engine ▸ Event-driven (debugging)): the compiled one keeps no waveforms.' : '';
    const s = compiled() || !ch.some(Boolean) ? null : settings.mode === 'single' && frozen ? frozen : screen();
    if (s && settings.mode === 'single' && s.trig != null) frozen = s;
    const g = sv('g', { 'data-id': 'scope' });
    drawScope(g, { id: 'Scope', type: 'oscilloscope', x: X, y: Y, ...settings }, s ? { screen: s, settings, cursors } : null);
    svg.replaceChildren(g);
  }
  const tick = intervalWhileSeen(box, 100, draw);
  draw();
  return { draw };
}
