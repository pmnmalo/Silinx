// SSim's drawn stimuli (#405: out of mountISim; #336, core/stimuli.js): Edit Stimuli on, a click on a cycle of an
// input changes it there and up to its next change (0 → 1 → Z → X; a bus: a value typed in), on an output its expected
// value (- → 0 → 1), a bit of a bus expanded as a 1-bit port (#919: the bus's value follows from its bits); the
// simulation restarts and runs the stimuli at once, the expected outputs checked (the mismatches red); their timing
// and a bus's value in dialogs. mountStimuli(ctx) is called by mountISim where this code was.
import * as V from '/core/values.js';
import { newStimuli, normalizeStimuli, combinationCycles, cyclePs, editInput, editExpected, editInputBit, editExpectedBit, checkExpected, fillExpected, stimulusPlan, parseCellValue } from '/core/stimuli.js';
import { h } from './dom.js';
import { fmtTime, ROW_H, RULER_H } from './isim.js';
import { field } from './isim-dialogs.js';

/** { toggleStim, timingDialog, fillStim, stimClick, drawStim, runStim } of an SSim window. */
export function mountStimuli(ctx) {
  const { st, sim, design, stimOpt, stimInst, topSig, stimPortOf, stimBar, btns, layout, invalidate, rowAtY, tOf, xOf, selectRow, setFont,
    flat, width, colors, api, echo, enqueue, runTo, logLine, openDialog } = ctx;

  function toggleStim(on = !st.stim.on) {
    st.stim.on = on;
    stimBar.hidden = !on;
    btns.stim?.classList.toggle('on', on);
    layout();
    if (on && !st.stim.m) timingDialog();
    else invalidate(false);
  }
  // a line of the waves that has stimuli: { p, i } (i: a bus's bit as a cell's bits count it, from the left; null: the
  // whole port), or null
  const stimLine = (it) => {
    const p = it && it.row.kind === 'sig' ? stimPortOf.get(it.row.sig) : null;
    if (!p) return null;
    if (!it.bit) return { p, i: null };
    const i = p.width - 1 - it.bit.pos;
    return i >= 0 && i < p.width ? { p, i } : null;
  };
  // the bits of a port's mismatch that are wrong (a bit row's mismatch: its bit is one of them)
  const badBits = (b) => [...b.expected].map((e, i) => (e !== '-' && e !== b.got[i] ? i : -1)).filter(i => i >= 0);
  const portBits = (port, t) => { const sig = topSig.get(port); return sig ? V.toBin(sim.valueAt(sig, t)) : ''; };
  function stimChanged(rerun) {
    stimOpt.onChange?.(JSON.parse(JSON.stringify(st.stim.m)));
    if (rerun) runStim(); else { checkStim(); invalidate(false); }
  }
  async function runStim() {
    const m = st.stim.m;
    if (!m) return;
    const end = stimulusPlan(m).endPs;
    // the view where the user clicked (#1616): the restart puts it at 0, the run used to follow it to the end
    const { t0, scale, fit, cursor } = st;
    api().restart(true);
    Object.assign(st, { t0, scale, fit, cursor });
    echo(`run ${fmtTime(end)}`);
    await enqueue(`run ${fmtTime(end)}`, () => runTo(end, 'Run', { keepView: true }));
    checkStim(true);
  }
  function checkStim(log) {
    const m = st.stim.m;
    if (!m) return;
    st.stim.bad = sim.now >= stimulusPlan(m).endPs - 1 ? checkExpected(m, portBits) : [];
    const nExp = Object.values(m.expected).reduce((n, l) => n + l.filter(b => /[01]/.test(b)).length, 0);
    const timing = m.clock ? `clock ${m.clock}, period ${m.periodNs} ns` : `combinational, step ${m.stepNs} ns`;
    const res = !nExp ? 'no expected outputs' : st.stim.bad.length ? `${st.stim.bad.length} mismatch(es)` : 'expected outputs OK';
    const stEl = stimBar.querySelector('.isim-stim-st');
    if (stEl) { stEl.textContent = `${m.cycles} cycles (${timing}): ${res}`; stEl.classList.toggle('bad', st.stim.bad.length > 0); }
    if (log && nExp) {
      if (!st.stim.bad.length) logLine(`Stimuli: ${m.cycles} cycles, the expected outputs match`, 'info', { app: true });
      else {
        logLine(`Stimuli: ${st.stim.bad.length} mismatch(es) of the expected outputs`, 'warning', { app: true });
        for (const b of st.stim.bad.slice(0, 10)) logLine(`  ${b.port} at cycle ${b.k} (${fmtTime(b.k * cyclePs(m))}): expected ${b.expected}, got ${b.got}`, 'warning', { app: true });
      }
    }
  }
  function fillStim() {
    if (!st.stim.m) return;
    fillExpected(st.stim.m, portBits);
    logLine('Stimuli: the expected outputs filled in from the simulation', 'info', { app: true });
    stimChanged(false);
  }
  // a click on the waves in Edit Stimuli: true when it was on a cell of a port (edited)
  function stimClick(x, y) {
    const m = st.stim.m;
    const i = rowAtY(y), line = m ? stimLine(flat()[i]) : null, p = line?.p;
    if (!p || p.name === m.clock) return false;
    const k = Math.floor(tOf(x) / cyclePs(m));
    if (k < 0 || k >= m.cycles) return false;
    selectRow(i, {});
    const isIn = p.dir === 'in';
    if (line.i != null) {
      if (isIn ? editInputBit(m, p.name, line.i, k) : editExpectedBit(m, p.name, line.i, k)) stimChanged(isIn);
    } else if (p.width === 1) {
      if (isIn ? editInput(m, p.name, k) : editExpected(m, p.name, k)) stimChanged(isIn);
    } else cellDialog(p, k, isIn);
    return true;
  }
  function drawStim(ctx, first, last) {
    const m = st.stim.m, P = cyclePs(m);
    const k0 = Math.max(0, Math.floor(st.t0 / P)), k1 = Math.min(m.cycles - 1, Math.ceil(tOf(width()) / P));
    const bad = new Set(st.stim.bad.flatMap(b => [`${b.port}:${b.k}`, ...badBits(b).map(j => `${b.port}:${b.k}:${j}`)]));
    setFont(ctx, 9); ctx.textBaseline = 'top';
    for (let i = first; i <= last; i++) {
      const line = stimLine(flat()[i]), p = line?.p;
      if (!p) continue;
      const key = (k) => (line.i == null ? `${p.name}:${k}` : `${p.name}:${k}:${line.i}`);
      const y = RULER_H + i * ROW_H - st.scrollY;
      if (st.stim.on && p.name !== m.clock) {
        // the cycles of the grid
        ctx.strokeStyle = colors().grid; ctx.setLineDash([2, 2]); ctx.beginPath();
        for (let k = k0; k <= k1 + 1; k++) { const x = Math.round(xOf(k * P)) + 0.5; ctx.moveTo(x, y + 1); ctx.lineTo(x, y + ROW_H - 1); }
        ctx.stroke(); ctx.setLineDash([]);
      }
      const exp = m.expected[p.name];
      if (!exp) continue;
      for (let k = k0; k <= k1; k++) {
        const e = line.i == null ? exp[k] : exp[k][line.i];
        if (!/[01]/.test(e)) continue;
        const xa = xOf(k * P), xb = xOf((k + 1) * P), wrong = bad.has(key(k));
        if (wrong) { ctx.fillStyle = 'rgba(230,40,40,0.35)'; ctx.fillRect(xa, y + 1, xb - xa, ROW_H - 2); }
        ctx.fillStyle = wrong ? '#ff6b6b' : '#5fbf6a';
        ctx.fillRect(xa + 1, y + ROW_H - 3, Math.max(1, xb - xa - 2), 2);
        if (st.stim.on && xb - xa > 8 + 6 * e.length) ctx.fillText(e, xa + 3, y + 1);
      }
    }
    ctx.textBaseline = 'middle';
  }
  function timingDialog() {
    const m = st.stim.m;
    const clocks = stimOpt.ports.filter(p => p.dir === 'in' && p.width === 1);
    const guess = m ? m.clock : (clocks.find(p => /^(clk|clock)/i.test(p.name))?.name || null);
    const clock = h('select', { name: 'clock' }, h('option', { value: '' }, 'None (combinational)'), ...clocks.map(p => h('option', { value: p.name, 'data-no-i18n': '' }, p.name)));
    clock.value = guess || '';
    const err = h('div', { class: 'dlg-err' });
    const body = h('div', {},
      h('div', { class: 'hint' }, `The inputs of ${stimInst === design.top ? design.top.name : `${stimInst.module || stimInst.name} (${stimInst.path})`} as a grid of cycles: with a clock, the inputs change at its falling edge and the outputs are checked before the next one; without one, they change at every cycle, one for each combination of the inputs.`),
      h('div', { class: 'form-grid isim-dlg-grid' }, h('label', {}, 'Clock:'), clock,
        ...field('Clock Period (ns):', 'period', { value: String(m?.periodNs ?? 20) }), ...field('Time Step (ns):', 'step', { value: String(m?.stepNs ?? 10) }),
        ...field('Cycles:', 'cycles', { value: String(m?.cycles ?? 16) })),
      err);
    const q = (n) => body.querySelector(`[name="${n}"]`);
    // no clock (#1478): the period, the step and the cycles hidden; the step kept, one cycle per combination of the
    // inputs (the saved ones when they were already combinational)
    const combCycles = m && !m.clock ? m.cycles : combinationCycles(stimOpt.ports);
    const sync = () => {
      const clk = !!q('clock').value;
      for (const n of ['period', 'step', 'cycles']) q(n).hidden = q(n).previousElementSibling.hidden = !clk;
      q('step').disabled = clk;
    };
    clock.onchange = sync; sync();
    let o = null;
    const ok = () => {
      const num = (n, lo) => { const v = Number(q(n).value); if (!Number.isInteger(v) || v < lo) throw new Error(`${n === 'cycles' ? 'Cycles' : n === 'period' ? 'Clock Period' : 'Time Step'}: a whole number of at least ${lo}`); return v; };
      try {
        o = q('clock').value ? { clock: q('clock').value, periodNs: num('period', 2), stepNs: num('step', 1), cycles: num('cycles', 1) }
          : { clock: null, periodNs: m?.periodNs ?? 20, stepNs: m?.stepNs ?? 10, cycles: combCycles };
        return true;
      } catch (e) { err.textContent = e.message; return false; }
    };
    // (applied in the click, as the dialog closes)
    const apply = () => { st.stim.m = st.stim.m ? normalizeStimuli({ ...st.stim.m, ...o }, stimOpt.ports) : newStimuli(stimOpt.ports, o); stimChanged(true); return true; };
    // cancelled, Esc, its ✕: no stimuli made, none shown (closed by another dialog: left as it is)
    const cancel = () => { if (!st.stim.m) toggleStim(false); return 'cancelled'; };
    openDialog({
      title: 'Stimulus Timing', width: 460, body, className: 'isim-stim-dlg',
      buttons: [{ label: 'OK', primary: true, value: apply, validate: ok, attrs: { 'data-a': 'ok' } }, { label: 'Cancel', value: cancel, attrs: { 'data-a': 'cancel' } }],
      onOpen: () => { (q('clock').value ? q('cycles') : q('clock')).dataset.autofocus = ''; },
    }).then(v => { if (v === null) cancel(); });
  }
  // the value of a bus from cycle k: an input's (bits 0 1 Z X, h… / d…) or an output's expected one (or -)
  function cellDialog(p, k, isIn) {
    const m = st.stim.m, list = isIn ? m.inputs[p.name] : m.expected[p.name];
    const err = h('div', { class: 'dlg-err' });
    const body = h('div', {},
      h('div', { class: 'form-grid isim-dlg-grid' },
        ...field('Signal Name:', 'sig', { value: p.name, readonly: true, 'data-no-i18n': '' }), ...field('From Cycle:', 'k', { value: String(k), readonly: true }),
        ...field('Value:', 'value', { value: list[k] })),
      h('div', { class: 'dlg-note' }, isIn ? 'Bits, most significant first (0 1 Z X), h… hexadecimal or d… decimal; it holds up to the next change.' : 'Bits, most significant first (0 1, - not checked), h… hexadecimal or d… decimal; - alone: not checked.'),
      h('div', { class: 'dlg-note' }, 'Expand the bus to change one of its bits: a click on its wave, as on a 1-bit signal.'),
      err);
    const inp = body.querySelector('[name=value]');
    let bits = null;
    const ok = () => { try { bits = parseCellValue(inp.value, p.width, { expected: !isIn }); return true; } catch (e) { err.textContent = e.message; return false; } };
    // (applied in the click, as the dialog closes)
    const apply = () => { if (isIn ? editInput(m, p.name, k, bits) : editExpected(m, p.name, k, bits)) stimChanged(isIn); return true; };
    openDialog({
      title: isIn ? 'Input Value' : 'Expected Value', width: 420, body, className: 'isim-stim-dlg',
      buttons: [{ label: 'OK', primary: true, value: apply, validate: ok, attrs: { 'data-a': 'ok' } }, { label: 'Cancel', value: null, attrs: { 'data-a': 'cancel' } }],
      onOpen: () => { inp.dataset.autofocus = ''; inp.select(); },
    });
  }

  return { toggleStim, timingDialog, fillStim, stimClick, drawStim, runStim };
}
