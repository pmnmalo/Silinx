// Silinx - the digital circuit editor (#3897, docs/CIRCUITS.md: documents <name>.circ.json; SVG, no framework).
//
//   import { mountCircuitEditor } from './circuit-editor.js';
//   const ed = mountCircuitEditor(container, { model, onChange(model), onProblems(diags), onCheck(diags),
//     onMessage(text, isError), readOnly, banner });
//   ed.getModel(); ed.setModel(m); ed.undo(); ed.redo(); ed.canUndo(); ed.canRedo(); ed.fit(); ed.print(); ed.select(ref);
//   ed.simulating(); ed.toggleSim(); ed.destroy();
//
// Breadboards, ICs, switches, buttons, LEDs and the supply on a 0.1 inch grid, wired point to point; a part from the
// Parts panel (on the left, #4062) placed by a click, moved by a drag, turned (R), deleted (Del); a wire drawn point by point,
// ended on a pin or a hole. Try it runs it live (core/circuit-sim.js): a click flips a logic switch, a press holds a
// button; each pin shows its level, the LEDs light. Its edits: core/circuit-edit.js (the MCP server's edit_circuit's);
// its problems after every change (`onProblems`) and on Check (`onCheck`), its messages (`onMessage`) in the console.
import { h, twoFingerView } from './ui.js';
import { sv } from './dom.js';
import { mountSideFold } from './side-fold.js';
import { normalizeCircuit, newCircuit, circuitCounts } from '/core/circuit.js';
import { partPins, partHoles } from '/core/circuit-parts.js';
import { addPart, movePart, rotatePart, deleteItem, addWire } from '/core/circuit-edit.js';
import { mountCircuitOptions } from './circuit-options.js';
import { mountCircuitClip } from './circuit-clip.js';
import { checkCircuit } from '/core/circuit-check.js';
import { createCircuitSim, runMessages } from '/core/circuit-sim.js';
import { clone } from '/core/util.js';
import { drawCircuit, P } from './circuit-draw.js';
import { mountCircuitToolbar } from './circuit-toolbar.js';
import { mountCircuitSide } from './circuit-side.js';
import { mountCircuitParts } from './circuit-parts-panel.js';
import { printDiagram, svgSnapshot } from './print.js';
import { onLayoutToggled } from './layout-fit.js';

export function mountCircuitEditor(container, opts = {}) {
  let M = normalizeCircuit(opts.model || newCircuit('circuit'));
  let sel = null;                       // { kind: 'part' | 'wire', id }
  let tool = 'select';                  // select | wire | place:<type>
  let view = { tx: 60, ty: 120, k: 1 };
  let drag = null, draft = null, ghost = null, sim = null, fitted = false, destroyed = false;
  let ticks = [];                       // the clocks' timers while trying it (each ticking at its frequency, in real time)
  const readOnly = !!opts.readOnly;
  const hist = [JSON.stringify(M)];
  let hi = 0;

  container.innerHTML = '';
  const root = h('div', { class: 'asm-editor circuit-editor', tabindex: '0' });
  container.append(root);
  const btn = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn ${cls}`, title, onclick }, label);
  const sep = () => h('span', { class: 'asm-sep' });
  const status = (msg, err = false) => { if (msg) opts.onMessage?.(msg, err); };

  // the toolbar's options (Keep connections, Show inside) and its ⋮ menu (Curved wires, Hop-overs): circuit-options.js
  const { keepBox, insideBox, more, keep, inside, hops, sync } = mountCircuitOptions({ M: () => M, readOnly, applyEdit: (...a) => applyEdit(...a), render: () => render() });
  const { tools, delBtn, rotBtn, simBtn, zoomLbl, info, toolbar } = mountCircuitToolbar({ keepBox, insideBox, more,
    root, btn, sep, setTool, deleteSelection, rotateSelection, check: () => opts.onCheck?.(checkCircuit(M)),
    toggleSim, zoomBtn, fit: () => fit(),
  });
  // the Try it bar (#4067, as the schematic's): above the canvas while trying it, its Reset (from time 0) and Stop (Esc);
  // its time in the status line
  const simBar = h('div', { class: 'circ-simbar', hidden: true },
    h('span', { class: 'circ-sim-badge' }, 'Try it'),
    btn('Reset', 'Start the simulation again from time 0', () => { if (sim) startSim(); }, 'circ-reset'),
    h('span', { class: 'asm-spacer' }),
    btn('Stop', 'Stop trying it out and go back to editing the circuit (Esc)', () => stopSim(), 'circ-stop'));
  const world = sv('g', { class: 'circ-world' });
  const svg = sv('svg', { class: 'asm-canvas circ-canvas' }, world);
  const canvasWrap = h('div', { class: 'asm-canvas-wrap' }, svg);
  const selSection = h('section', { class: 'asm-section circ-selection' });
  const circBody = h('div', {});
  // the parts on the left (#4062: circuit-parts-panel.js), the selection's and the circuit's properties on the right
  const parts = mountCircuitParts({ root, tool: () => tool, setTool });
  const side = h('aside', { class: 'asm-side' }, h('div', { class: 'asm-cap' }, 'Properties'), selSection,
    h('section', { class: 'asm-section circ-circuit' }, h('h3', {}, 'Circuit'), circBody));
  mountSideFold({ root, side, key: 'silinx.circuit.props.folded' });
  root.append(toolbar, h('div', { class: 'asm-body' }, parts.side, h('div', { class: 'asm-main' }, simBar, canvasWrap), side), info.el);
  if (readOnly) {
    root.classList.add('asm-readonly');
    for (const g of [tools.select.parentElement, tools.select.parentElement.nextElementSibling, rotBtn.parentElement, rotBtn.parentElement.nextElementSibling]) g.hidden = true;
    keepBox.closest('label').hidden = true;   // (Show inside kept: how it is drawn)
    parts.side.hidden = true;
    toolbar.querySelector('.circ-parts-btn').style.display = 'none';
    for (const g of [toolbar.querySelector('.circ-check').parentElement]) g.hidden = true;
    if (opts.banner) toolbar.append(opts.banner);
  }

  const { renderSide } = mountCircuitSide({ M: () => M, setM: (m) => { M = m; }, sel: () => sel, commit, status, selSection, circBody, readOnly });

  // ---------------------------------------------------------------- edits, history
  function commit() {
    if (readOnly) { M = normalizeCircuit(JSON.parse(hist[hi])); render(); return; }
    M = normalizeCircuit(M);
    const s = JSON.stringify(M);
    if (s !== hist[hi]) { hist.length = hi + 1; hist.push(s); if (hist.length > 200) hist.shift(); hi = hist.length - 1; opts.onChange?.(clone(M)); problems(); }
    if (sim) startSim();
    render();
  }
  const problems = () => opts.onProblems?.(checkCircuit(M));
  const restore = (i) => { hi = i; M = normalizeCircuit(JSON.parse(hist[hi])); if (sel && !itemOf(sel.id)) sel = null; opts.onChange?.(clone(M)); problems(); if (sim) startSim(); render(); };
  const undo = () => { if (hi > 0) restore(hi - 1); };
  const redo = () => { if (hi < hist.length - 1) restore(hi + 1); };
  const itemOf = (id) => M.parts.find((p) => p.id === id) || M.wires.find((w) => w.id === id);
  const applyEdit = (r, select) => { if (r.error) { status(r.error, true); return false; } M = r.model; if (select) sel = select; commit(); return true; };

  function setTool(t) {
    tool = t; draft = null; ghost = null;
    for (const [k, b] of Object.entries(tools)) b.classList.toggle('active', k === t);
    svg.classList.toggle('circ-adding', t !== 'select');
    render();
  }
  function deleteSelection() { if (!sel || readOnly) return; const id = sel.id; sel = null; applyEdit(deleteItem(M, id)); }
  // (any part, a breadboard with the parts on it, #4065; its wires' ends with it while Keep connections, #4059)
  function rotateSelection() { if (sel?.kind === 'part' && !readOnly) applyEdit(rotatePart(M, sel.id, 1, { keep: keep() })); }
  const clip = mountCircuitClip({ M: () => M, sel: () => sel, setSel: (s) => { sel = s; }, readOnly, applyEdit });

  // ---------------------------------------------------------------- the live simulation
  function startSim() {
    const errs = checkCircuit(M).filter((d) => d.severity === 'error');
    if (errs.length) { status(`The circuit cannot be simulated: ${errs.map((d) => d.message).join('; ')}`, true); stopSim(); return; }
    stopTicks();
    sim = createCircuitSim(M);
    runSim();
    // (a clock source flips its level every half period, in real time; the simulated time moves on by as much)
    ticks = M.parts.filter((p) => p.type === 'clock').map((p) => setInterval(() => {
      if (!sim || destroyed) return;
      sim.advance(5e8 / (p.hz || 1));
      setInput(p.id, !sim.inputs()[p.id]);
    }, 500 / (p.hz || 1)));
  }
  function stopTicks() { for (const t of ticks) clearInterval(t); ticks = []; }
  // one of a part's inputs set while trying it, then run
  function setInput(id, v, index = 0) { sim.set(id, v, index); runSim(); }
  function runSim() {
    const r = sim.run();
    for (const line of runMessages(sim, r)) status(line.replace(/^(ERROR|WARNING): /, ''), true);
    render();
  }
  function stopSim() { stopTicks(); sim = null; render(); }
  function toggleSim() { if (sim) stopSim(); else startSim(); }

  // ---------------------------------------------------------------- drawing
  const toWorld = (cx, cy) => { const r = svg.getBoundingClientRect(); return { x: (cx - r.left - view.tx) / view.k, y: (cy - r.top - view.ty) / view.k }; };
  const toGrid = (w) => [Math.round(w.x / P), Math.round(w.y / P)];
  const applyView = () => { world.setAttribute('transform', `translate(${view.tx},${view.ty}) scale(${view.k})`); zoomLbl.textContent = `${Math.round(view.k * 100)}%`; };
  function render() {
    if (destroyed) return;
    applyView();
    world.replaceChildren(drawCircuit(M, { sel, draft, ghost, inside: inside(), hops: hops(), levels: sim ? (id, n) => sim.pin(id, n) : null, leds: sim?.leds(), inputs: sim?.inputs() }));
    sync();   // (Curved wires' ✓: an undo, a model set)
    for (const b of [delBtn]) b.disabled = !sel;
    rotBtn.disabled = sel?.kind !== 'part';
    simBtn.classList.toggle('active', !!sim);
    simBar.hidden = !sim;
    root.classList.toggle('circ-simulating', !!sim);
    side.classList.toggle('try-it-body', !!sim);   // (tried out: its Properties the Try it's body, a lighter green, #3924)
    info.set([circuitCounts(M), sim ? { text: `t = ${sim.time} ns`, cls: 'circ-time', noI18n: true } : null].filter(Boolean));
    renderSide();
    if (!readOnly) parts.renderParts();
  }
  // whether a grid point holds a pin or a hole (a wire ends there)
  const holds = ([x, y]) => M.parts.some((p) => partPins(p).some((q) => q.x === x && q.y === y) || partHoles(p).some((q) => q.x === x && q.y === y));
  function endWire() {
    const pts = draft;
    draft = null;
    if (pts?.length >= 2) applyEdit(addWire(M, { from: pts[0], to: pts[pts.length - 1], via: pts.slice(1, -1), color: 'blue' }), null);
    else render();
  }

  // ---------------------------------------------------------------- mouse and keys
  // (what is under the pointer: a part or a wire, and a switch's, a button's or a DIP lever's input there)
  const hit = (e) => { const g = e.target.closest?.('[data-kind]'), i = e.target.closest?.('[data-input]'); return g ? { kind: g.dataset.kind, id: g.dataset.id, input: i?.dataset.input, lever: Number(i?.dataset.lever ?? 0) } : null; };
  twoFingerView(svg, {
    cancel: () => { const d = drag; drag = null; if (d?.kind === 'move') { M = normalizeCircuit(JSON.parse(hist[hi])); render(); } },
    pan: (dx, dy) => { view.tx += dx; view.ty += dy; applyView(); },
    zoom: zoomAt,
  });
  svg.addEventListener('pointerdown', (e) => {
    root.focus({ preventScroll: true });
    fitted = true;
    const w = toWorld(e.clientX, e.clientY), g = toGrid(w), t = hit(e);
    if (sim && t?.input) {
      if (t.input === 'switch') setInput(t.id, !sim.inputs()[t.id]);
      else if (t.input === 'dip') setInput(t.id, !sim.inputs()[t.id][t.lever], t.lever);
      else { setInput(t.id, true); drag = { kind: 'press', id: t.id }; }
      return;
    }
    if (readOnly && tool !== 'select') setTool('select');
    if (tool.startsWith('place:')) { const type = tool.slice(6); const r = addPart(M, { type, at: g }); setTool('select'); applyEdit(r, r.id ? { kind: 'part', id: r.id } : null); return; }
    if (tool === 'wire') {
      if (!draft) { draft = [g]; render(); return; }
      const last = draft[draft.length - 1];
      if (last[0] !== g[0] || last[1] !== g[1]) draft.push(g);
      if (draft.length >= 2 && holds(g)) endWire(); else render();
      return;
    }
    if (t) {
      sel = { kind: t.kind, id: t.id };
      const p = M.parts.find((x) => x.id === t.id);
      if (p && !readOnly) drag = { kind: 'move', id: p.id, dx: g[0] - p.x, dy: g[1] - p.y, at: [p.x, p.y], base: M, moved: false };
    } else {
      sel = null;
      drag = { kind: 'pan', x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    }
    render();
    try { svg.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
  });
  svg.addEventListener('pointermove', (e) => {
    const g = toGrid(toWorld(e.clientX, e.clientY));
    if (tool.startsWith('place:')) { ghost = { id: '?', type: tool.slice(6), x: g[0], y: g[1] }; render(); return; }
    if (tool === 'wire' && draft) { render(); world.append(sv('polyline', { class: 'circ-wire circ-draft', points: [...draft, g].map(([x, y]) => `${x * P},${y * P}`).join(' ') })); return; }
    if (!drag) return;
    if (drag.kind === 'pan') { view.tx = drag.tx + e.clientX - drag.x; view.ty = drag.ty + e.clientY - drag.y; applyView(); }
    else if (drag.kind === 'move') {
      // (shown as it will be: a breadboard with the parts on it, the wires' ends with them while Keep connections, #4059)
      const nx = g[0] - drag.dx, ny = g[1] - drag.dy, p = M.parts.find((x) => x.id === drag.id);
      if (p && (p.x !== nx || p.y !== ny)) {
        const r = movePart(drag.base, drag.id, [nx, ny], { keep: keep() });
        if (!r.error) { M = r.model; drag.moved = nx !== drag.at[0] || ny !== drag.at[1]; render(); }
      }
    }
  });
  svg.addEventListener('pointerup', () => {
    const d = drag;
    drag = null;
    if (d?.kind === 'press' && sim) setInput(d.id, false);
    if (d?.kind === 'move') { if (d.moved) commit(); else { M = d.base; render(); } }
  });
  svg.addEventListener('dblclick', () => { if (tool === 'wire' && draft) endWire(); });
  function zoomAt(f, cx, cy) {
    fitted = true;
    const r = svg.getBoundingClientRect(), mx = cx - r.left, my = cy - r.top;
    const k = Math.max(0.2, Math.min(4, view.k * f));
    view.tx = mx - (mx - view.tx) * k / view.k; view.ty = my - (my - view.ty) * k / view.k; view.k = k;
    applyView();
  }
  function zoomBtn(f) { const r = svg.getBoundingClientRect(); zoomAt(f, r.left + r.width / 2, r.top + r.height / 2); }
  svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); }, { passive: false });
  root.addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (readOnly && (mod ? /^[zyxv]$/.test(k) : /^(Delete|Backspace|r)$/i.test(e.key))) return;
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); undo(); }
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); e.stopPropagation(); redo(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    else if (mod && (k === 'c' || k === 'x')) { if (sel?.kind === 'part') { e.preventDefault(); clip.copy(k === 'x'); } }
    else if (mod && k === 'v' && !readOnly) clip.pasteKey();
    else if (e.key === 'Escape') { if (sim) stopSim(); else if (tool === 'wire' && draft?.length >= 2) endWire(); else setTool('select'); }
    else if (!mod && k === 'r') rotateSelection();
    else if (!mod && (k === '+' || k === '=')) zoomBtn(1.25);
    else if (!mod && k === '-') zoomBtn(0.8);
    else if (!mod && k === 'f') fit();
  });

  function bounds() {
    const xs = [], ys = [];
    for (const p of M.parts) for (const q of [...partPins(p), ...partHoles(p)]) { xs.push(q.x); ys.push(q.y); }
    for (const w of M.wires) for (const [x, y] of w.points) { xs.push(x); ys.push(y); }
    return xs.length ? { l: (Math.min(...xs) - 4) * P, r: (Math.max(...xs) + 3) * P, t: (Math.min(...ys) - 3) * P, b: (Math.max(...ys) + 3) * P } : null;
  }
  function fit() {
    const r = svg.getBoundingClientRect(), b = bounds();
    if (r.width >= 10 && r.height >= 10) fitted = true;
    if (!b || !r.width) { view = { tx: 60, ty: 120, k: 1 }; applyView(); return; }
    const k = Math.max(0.2, Math.min(2, Math.min(r.width / (b.r - b.l), r.height / (b.b - b.t))));
    view = { k, tx: (r.width - (b.r - b.l) * k) / 2 - b.l * k, ty: (r.height - (b.b - b.t) * k) / 2 - b.t * k };
    applyView();
  }
  function print() {
    const saved = sel;
    sel = null; render();
    let snap;
    try { snap = svgSnapshot(svg, world, bounds() || { l: 0, t: 0, r: 100, b: 100 }, ['.circ-wire-hit']); } finally { sel = saved; render(); }
    printDiagram({ title: `Circuit ${M.name}`, snapshot: snap, filename: `${M.name}_circuit` });
  }
  const initialFit = () => { if (!fitted && !destroyed) fit(); };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(initialFit) : null;
  ro?.observe(svg);
  const offLayout = onLayoutToggled(svg, () => fit());
  setTool('select');
  problems();
  requestAnimationFrame(initialFit);
  return {
    getModel: () => clone(M),
    setModel(m) { M = normalizeCircuit(m); hist.length = 0; hist.push(JSON.stringify(M)); hi = 0; sel = null; if (sim) startSim(); render(); },
    undo, redo, canUndo: () => hi > 0, canRedo: () => hi < hist.length - 1,
    // (Cut, Copy and Paste, #4066: circuit-clip.js)
    copy: () => clip.copy(), cut: () => clip.copy(true), paste: () => clip.paste(),
    canCopy: () => sel?.kind === 'part', canPaste: () => !readOnly && clip.has(), canDelete: () => !readOnly && !!sel, deleteSelection: () => deleteSelection(),
    // its HDL file linked (generatedFile, #245): nothing else changes, Undo / Redo keep the link
    setLink(file) { M.generatedFile = file; hist.forEach((x, i) => { hist[i] = JSON.stringify(normalizeCircuit({ ...JSON.parse(x), generatedFile: file })); }); },
    fit, print, simulating: () => !!sim, toggleSim, sim: () => sim,
    select(ref) { if (!ref?.id || !itemOf(ref.id)) return; sel = { kind: ref.kind || 'part', id: ref.id }; render(); },
    destroy() { destroyed = true; stopTicks(); ro?.disconnect(); offLayout(); container.innerHTML = ''; },
  };
}
