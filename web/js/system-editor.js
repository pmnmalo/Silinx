// Silinx - the System editor (#4700, docs/CODESIGN.md): a co-design project's System document (<name>.sys.json), its
// nodes and the links between their interfaces, on a canvas in the schematic editor's style (SVG, no framework).
//
//   import { mountSystemEditor } from './system-editor.js';
//   const ed = mountSystemEditor(container, { model, onChange(model), onProblems(diags), onCheck(diags), onMessage(text, isError),
//     check(model) -> diags, modules() -> [name], portsOf(module) -> [{ name, dir }], firmwares() -> [path], readOnly, banner });
//   ed.getModel(); ed.setModel(m); ed.undo(); ed.redo(); ed.canUndo(); ed.canRedo(); ed.fit(); ed.check(); ed.select({ kind, id });
//   ed.deleteSelection(); ed.canDelete(); ed.destroy();
//
// Tools: select and move, a node placed (an FPGA, an Arduino Uno or Nano, a serial terminal: a click on the canvas), a
// link (a click on an interface's row, then on another's). Every edit is core/system-edit.js's, as the MCP server's
// edit_system; one refused says why in the console. The side panel (system-side.js) edits the selection and the System;
// its drawing is system-draw.js. No hint line: the counts in its status line; its problems (`onProblems`, after every
// change: the System's check, core/system-check.js; `onCheck`, Check's) and its messages go to the console (#2718).
import { h } from './ui.js';
import { sv } from './dom.js';
import { viewGestures } from './view-gestures.js';
import { mountSideFold } from './side-fold.js';
import { toolIcon, toolWide, zoomTools } from './editor-icons.js';
import { panelToggle, PROPS_KEY } from './narrow.js';
import { pressTool } from './editor-tools.js';
import { statusLine } from './status-line.js';
import { onLayoutToggled } from './layout-fit.js';
import { normalizeSystem, newSystem } from '/core/system-doc.js';
import { addNode, changeNode, removeNode, removeLink, removeInterface, addLink } from '/core/system-edit.js';
import { mountSystemDraw, NODE_W, nodeHeight } from './system-draw.js';
import { mountSystemSide } from './system-side.js';

const GRID = 20;
const snap = v => Math.round(v / GRID) * GRID;
// the tools that place a node: its kind and board
const PLACE = { fpga: { kind: 'fpga' }, uno: { kind: 'mcu', board: 'arduino-uno' }, nano: { kind: 'mcu', board: 'arduino-nano' }, terminal: { kind: 'terminal' } };

export function mountSystemEditor(container, opts = {}) {
  let M = normalizeSystem(opts.model || newSystem('system'));
  let sel = null;                        // { kind: 'node' | 'iface' | 'link', id } (an interface's id: node.name)
  let tool = 'select';                   // select | fpga | uno | nano | terminal | link
  let linkFrom = null;                   // the first end of a link being drawn ('node.iface')
  let view = { tx: 40, ty: 40, k: 1 }, drag = null, fitted = false, destroyed = false, said = null;
  const readOnly = !!opts.readOnly;
  const hist = [JSON.stringify(M)];
  let hi = 0;

  container.innerHTML = '';
  const root = h('div', { class: 'asm-editor system-editor', tabindex: '0' });
  container.append(root);
  const btn = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn ${cls}`, title, onclick }, label);
  const sep = () => h('span', { class: 'asm-sep' });
  const status = (msg, err = false) => { if (msg) opts.onMessage?.(msg, err); };

  // ---------------------------------------------------------------- toolbar
  const tools = {
    select: toolIcon('select', 'select', 'Select and move (drag the background to pan, wheel to zoom)', () => setTool('select'), 'sys-tool'),
    fpga: btn('FPGA', 'Click the canvas to add an FPGA node: a module of the project on a board', () => setTool('fpga'), 'sys-tool asm-wide'),
    uno: btn('Arduino Uno', 'Click the canvas to add an Arduino Uno', () => setTool('uno'), 'sys-tool asm-wide'),
    nano: btn('Arduino Nano', 'Click the canvas to add an Arduino Nano', () => setTool('nano'), 'sys-tool asm-wide'),
    terminal: btn('Terminal', 'Click the canvas to add a serial terminal', () => setTool('terminal'), 'sys-tool asm-wide'),
    link: toolWide('arc', 'Link', 'Click an interface, then an interface of another node of its kind', () => setTool('link'), 'sys-tool'),
  };
  const delBtn = toolIcon('delete', 'del', 'Delete the selection (Del)', () => deleteSelection(), 'asm-danger');
  const checkBtn = toolWide('check', 'Check', 'Check the System for errors and warnings', () => opts.onCheck?.(check()), 'sys-check');
  const zoomLbl = h('span', { class: 'asm-zoom', title: 'Zoom level' }, '100%');
  const info = statusLine();
  const toolbar = h('div', { class: 'asm-toolbar sys-toolbar' },
    h('div', { class: 'asm-group' }, ...Object.values(tools)), sep(),
    h('div', { class: 'asm-group' }, delBtn), sep(),
    h('div', { class: 'asm-group' }, ...zoomTools(f => zoomBtn(f), () => fit()), zoomLbl), sep(),
    h('div', { class: 'asm-group' }, checkBtn),
    h('div', { class: 'asm-spacer' }),
    h('div', { class: 'asm-group' }, panelToggle(root, btn('☰ Properties', 'Show / hide the properties panel'), { key: PROPS_KEY })));

  // ---------------------------------------------------------------- canvas, side panel
  const world = sv('g', { class: 'sys-world' });
  const svg = sv('svg', { class: 'asm-canvas sys-canvas' }, world);
  const canvasWrap = h('div', { class: 'asm-canvas-wrap' }, svg);
  const selSection = h('section', { class: 'asm-section sys-selection' });
  const sysBody = h('div', { class: 'sys-body' });
  const side = h('aside', { class: 'asm-side' }, h('div', { class: 'asm-cap' }, 'Properties'), selSection, h('section', { class: 'asm-section sys-system' }, h('h3', {}, 'System'), sysBody));
  mountSideFold({ root, side, key: 'silinx.system.props.folded' });
  root.append(toolbar, h('div', { class: 'asm-body' }, h('div', { class: 'asm-main' }, canvasWrap), side), info.el);
  if (readOnly) { for (const b of [...Object.values(tools).slice(1), delBtn]) b.hidden = true; root.classList.add('asm-readonly'); if (opts.banner) toolbar.append(opts.banner); }

  // ---------------------------------------------------------------- edits, history
  const exists = s => (s.kind === 'node' ? M.nodes.some(n => n.id === s.id) : s.kind === 'link' ? M.links.some(l => l.id === s.id)
    : M.nodes.some(n => n.interfaces.some(f => `${n.id}.${f.name}` === s.id)));
  function commit() {
    if (readOnly) { M = normalizeSystem(JSON.parse(hist[hi])); render(); return; }
    M = normalizeSystem(M);
    const s = JSON.stringify(M);
    if (s !== hist[hi]) { hist.length = hi + 1; hist.push(s); if (hist.length > 200) hist.shift(); hi = hist.length - 1; opts.onChange?.(normalizeSystem(M)); }
    if (sel && !exists(sel)) sel = null;
    render();
  }
  /** An edit's result taken ({ system }) and committed, or its error said in the console; whether it was taken. */
  function apply(r) {
    if (r.error) { status(r.error, true); render(); return false; }
    M = r.system;
    commit();
    return true;
  }
  const restore = i => { hi = i; M = normalizeSystem(JSON.parse(hist[hi])); if (sel && !exists(sel)) sel = null; opts.onChange?.(normalizeSystem(M)); render(); };
  const undo = () => { if (hi > 0) restore(hi - 1); };
  const redo = () => { if (hi < hist.length - 1) restore(hi + 1); };
  function setTool(t) { tool = t; linkFrom = null; drag = null; pressTool(tools, t, svg, 'sys-adding'); render(); }
  function deleteSelection() {
    if (!sel || readOnly) return;
    const i = sel.id.indexOf('.');
    const r = sel.kind === 'node' ? removeNode(M, sel.id) : sel.kind === 'link' ? removeLink(M, sel.id) : removeInterface(M, sel.id.slice(0, i), sel.id.slice(i + 1));
    if (apply(r)) sel = null;
    render();
  }
  function placeNode(at) {
    const r = addNode(M, { ...PLACE[tool], module: tool === 'fpga' ? (opts.modules?.() || [])[0] ?? null : null, x: snap(at.x - NODE_W / 2), y: snap(at.y - 20) });
    if (apply(r)) { sel = { kind: 'node', id: r.id }; setTool('select'); }
  }
  // the System's problems: its check after every change, said when they changed; Check's in the console's lines too
  function check() { const d = opts.check?.(M) || []; say(d); return d; }
  function say(diags) { const k = JSON.stringify(diags.map(d => [d.severity, d.message])); if (k !== said) { said = k; opts.onProblems?.(diags); } }

  // ---------------------------------------------------------------- drawing and side panel
  const { applyView, render: draw, toWorld } = mountSystemDraw({
    M: () => M, sel: () => sel, linkFrom: () => linkFrom, drag: () => drag, view: () => view, svg, world, zoomLbl, info, delBtn,
    destroyed: () => destroyed, renderSide: (...a) => renderSide(...a),
  });
  const { renderSide } = mountSystemSide({ opts, M: () => M, sel: () => sel, setSel: v => { sel = v; render(); }, apply, selSection, sysBody, btn });
  function render() {
    draw();
    if (readOnly) for (const x of side.querySelectorAll('input, select, button:not(.asm-fold)')) x.disabled = true;
    check();
  }

  // ---------------------------------------------------------------- mouse and keys
  const hit = e => { const g = e.target.closest?.('[data-kind]'); return g ? { kind: g.dataset.kind, id: g.dataset.id } : null; };
  viewGestures(svg, {
    cancel: () => { const d = drag; drag = null; if (d?.kind === 'move') { const n = M.nodes.find(x => x.id === d.id); if (n) Object.assign(n, { x: d.x, y: d.y }); } render(); },
    pan: (dx, dy) => { fitted = true; view.tx += dx; view.ty += dy; applyView(); },
    zoom: zoomAt, keyEl: root,
  });
  svg.addEventListener('pointerdown', e => {
    root.focus({ preventScroll: true });
    fitted = true;
    const w = toWorld(e.clientX, e.clientY), t = hit(e);
    if (PLACE[tool]) { if (!t) placeNode(w); return; }
    if (tool === 'link') {
      if (t?.kind === 'iface') {
        if (!linkFrom) { linkFrom = t.id; drag = { kind: 'linkdraw', ...w }; render(); }
        else { const a = linkFrom; linkFrom = null; drag = null; if (a !== t.id) { const r = addLink(M, { a, b: t.id }); if (apply(r)) sel = { kind: 'link', id: r.id }; } render(); }
      } else { linkFrom = null; drag = null; render(); }
      return;
    }
    if (t) {
      const nid = t.kind === 'iface' ? t.id.slice(0, t.id.indexOf('.')) : t.kind === 'node' ? t.id : null;
      sel = t;
      const n = nid && M.nodes.find(x => x.id === nid);
      if (n && !readOnly) drag = { kind: 'move', id: n.id, x: n.x, y: n.y, dx: w.x - n.x, dy: w.y - n.y, moved: false };
    } else {
      sel = null;
      drag = { kind: 'pan', x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    }
    render();
    try { svg.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    const w = toWorld(e.clientX, e.clientY);
    if (drag.kind === 'pan') { view.tx = drag.tx + e.clientX - drag.x; view.ty = drag.ty + e.clientY - drag.y; applyView(); }
    else if (drag.kind === 'move') { const n = M.nodes.find(x => x.id === drag.id); if (n) { n.x = snap(w.x - drag.dx); n.y = snap(w.y - drag.dy); drag.moved = true; draw(); } }
    else if (drag.kind === 'linkdraw') { drag.x = w.x; drag.y = w.y; draw(); }
  });
  svg.addEventListener('pointerup', () => {
    if (drag?.kind === 'move' && drag.moved) {
      const d = drag, n = M.nodes.find(x => x.id === d.id), to = { x: n.x, y: n.y };
      Object.assign(n, { x: d.x, y: d.y });   // (the move an edit: changeNode's, as the MCP server's)
      drag = null; apply(changeNode(M, d.id, to)); return;
    }
    if (drag?.kind !== 'linkdraw') drag = null;
  });
  function zoomAt(f, cx, cy) {
    fitted = true;
    const r = svg.getBoundingClientRect(), mx = cx - r.left, my = cy - r.top;
    const k = Math.max(0.25, Math.min(4, view.k * f));
    view.tx = mx - (mx - view.tx) * k / view.k; view.ty = my - (my - view.ty) * k / view.k; view.k = k;
    applyView();
  }
  function zoomBtn(f) { const r = svg.getBoundingClientRect(); zoomAt(f, r.left + r.width / 2, r.top + r.height / 2); }
  root.addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z' && !e.shiftKey && !readOnly) { e.preventDefault(); e.stopPropagation(); undo(); }
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey)) && !readOnly) { e.preventDefault(); e.stopPropagation(); redo(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    else if (e.key === 'Escape') setTool('select');
    else if (!mod && (k === '+' || k === '=')) zoomBtn(1.25);
    else if (!mod && k === '-') zoomBtn(0.8);
    else if (!mod && k === 'f') fit();
  });
  function fit() {
    const r = svg.getBoundingClientRect();
    if (r.width >= 10 && r.height >= 10) fitted = true;
    if (!M.nodes.length || !r.width) { view = { tx: 40, ty: 40, k: 1 }; applyView(); return; }
    const x0 = Math.min(...M.nodes.map(n => n.x)) - 60, x1 = Math.max(...M.nodes.map(n => n.x + NODE_W)) + 60;
    const y0 = Math.min(...M.nodes.map(n => n.y)) - 40, y1 = Math.max(...M.nodes.map(n => n.y + nodeHeight(n))) + 40;
    const k = Math.max(0.3, Math.min(1.4, Math.min(r.width / (x1 - x0), r.height / (y1 - y0))));
    view = { k, tx: (r.width - (x1 - x0) * k) / 2 - x0 * k, ty: (r.height - (y1 - y0) * k) / 2 - y0 * k };
    applyView();
  }
  // (fitted once, when the canvas first has a size: it may open behind another document; then the view is the user's)
  const initialFit = () => { if (!fitted && !destroyed) fit(); };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(initialFit) : null;
  ro?.observe(svg);
  const offLayout = onLayoutToggled(svg, () => fit());
  setTool('select');
  requestAnimationFrame(initialFit);
  return {
    getModel: () => normalizeSystem(M),
    setModel(m) { M = normalizeSystem(m); hist.length = 0; hist.push(JSON.stringify(M)); hi = 0; sel = null; render(); },
    undo, redo, canUndo: () => hi > 0, canRedo: () => hi < hist.length - 1,
    deleteSelection, canDelete: () => !readOnly && !!sel,
    check, fit, refresh: () => render(),
    select(ref) { if (exists(ref)) { sel = { kind: ref.kind, id: ref.id }; render(); } },
    destroy() { destroyed = true; ro?.disconnect(); offLayout(); container.innerHTML = ''; },
  };
}
