// The schematic editor's selection operations (#405: out of mountSchEditor in sch-editor.js): the items selected,
// Delete, Select All, Rotate and Mirror, and Cut / Copy / Paste (#677, core/schclip.js: the selection with the wires
// joining it, pasted at the mouse or in a blank place in view (#1797) and untangled), Duplicate (#1556: its symbols and I/O markers only, beside it).
import { clipEmpty, copySchematic, pasteOffset, pasteSchematic } from '/core/schclip.js';
import { GRID, followPins, oppositeSide, portBox, portSide, rotSize, symbolBox, symbolDef, symbolPins, turnSide } from '/core/schdoc.js';
import { readClip, writeClip } from './clipboard.js';
import { untangleNew } from '/core/schpath.js';
import { deleteWireSegment } from '/core/schwire-seg.js';
import { KEYS, snap } from './sch-editor.js';

/** { copySel, deleteSel, duplicateSel, mirrorSel, mirrorVSel, paste, rotateSel, selectAll, selected } of mountSchEditor (destroyed(), doc(), live(), modules(), placing(), sel(), tool(): its current values). */
export function mountSchSelect(ctx) {
  const {
    container, changed, destroyed, doc, edit, keepConn = () => true, live, modules, placing, readOnly, refusedShort, render, renderOverlay,
    renderProps, segSel, sel, setTool, snapshot, svg, toSheet, tool, undoStack, setSel
  } = ctx;

  // ---------------- selection operations
  function selected(kind) { return [...sel()].filter(k => k.startsWith(kind + ':')).map(k => k.slice(kind.length + 1)); }
  // (the I/O markers selected: turned around their connection point, or to the opposite side, #296)
  const turnPorts = (ids, f) => { for (const id of ids) { const p = doc().ports.find(x => x.id === id); p.side = f(portSide(p)); if (p.side === portSide({ dir: p.dir })) delete p.side; } };
  // the symbols ids turned or flipped by f: with Keep connections, the wires, I/O markers and net names on their pins
  // following them, as a move's (#5156, followPins: Update Symbol's way), routed around what they now run over (#948)
  function turnSyms(ids, f) {
    const was = JSON.parse(snapshot());
    const syms = ids.map(id => doc().symbols.find(x => x.id === id)).filter(Boolean);
    const at = q => `${q.x},${q.y}`;
    const before = syms.map(s => symbolPins(s, modules()));
    syms.forEach(f);
    if (!keepConn()) return;
    const turned = new Set(syms), others = new Set(doc().symbols.filter(o => !turned.has(o)).flatMap(o => symbolPins(o, modules()).map(at)));
    const moves = new Map();
    syms.forEach((s, i) => {
      for (const p of symbolPins(s, modules())) {
        const from = before[i].find(q => q.name === p.name);
        if (from && at(from) !== at(p) && !moves.has(at(from))) moves.set(at(from), { from: { x: from.x, y: from.y }, to: { x: p.x, y: p.y }, p });
      }
    });
    const ends = new Set(doc().wires.filter(w => [w.points[0], w.points[w.points.length - 1]].some(q => moves.has(at(q)))).map(w => w.id));
    followPins(doc(), moves, others, { modules: modules() });
    try { untangleNew(was, doc(), { modules: modules(), prefer: [...ends] }); } catch (e) { console.error(e); }
  }
  function rotateSel() {
    if (tool() === 'place' && placing()) { placing().rot = (placing().rot + 90) % 360; renderOverlay(); return; }
    const ids = selected('sym'), pids = selected('port');
    if (!ids.length && !pids.length) return;
    edit(() => {
      turnPorts(pids, turnSide);
      turnSyms(ids, s => {
        const def = symbolDef(s, modules());
        const a = rotSize(s, def);
        const cx = s.x + a.w / 2, cy = s.y + a.h / 2;
        s.rot = (s.rot + 90) % 360;
        const b = rotSize(s, def);
        s.x = snap(cx - b.w / 2); s.y = snap(cy - b.h / 2);
      });
    });
  }
  function mirrorSel() {
    flipSel(0, oppositeSide);
  }
  // Mirror Vertical (#2209): the markers above and below change sides, the others keep theirs
  function mirrorVSel() {
    flipSel(180, side => (side === 'N' ? 'S' : side === 'S' ? 'N' : side));
  }
  // flipped as seen on the sheet, whatever the turn (#2209): a symbol is drawn flipped along its own x, then turned
  function flipSel(turn, portFlip) {
    const flip = s => { s.mirror = !s.mirror; s.rot = (turn + 360 - s.rot) % 360; };
    if (tool() === 'place' && placing()) { flip(placing()); renderOverlay(); return; }
    const ids = selected('sym'), pids = selected('port');
    if (!ids.length && !pids.length) return;
    edit(() => { turnPorts(pids, portFlip); turnSyms(ids, flip); });
  }
  function deleteSel() {
    if (!sel().size) return;
    const seg = segSel.current();
    if (seg) { edit(() => { deleteWireSegment(doc(), seg.id, seg.a, seg.b); sel().clear(); }); return; }
    edit(() => {
      for (const [kind, arr] of Object.entries(KEYS)) { const ids = new Set(selected(kind)); if (doc()[arr]) doc()[arr] = doc()[arr].filter(o => !ids.has(o.id)); }
      sel().clear();
    });
  }
  // Cut / Copy / Paste (#677, core/schclip.js): the selection with the wires joining it, through the app's
  // clipboard (web/js/clipboard.js), pasted at the mouse pointer on the sheet, or else in a blank place of the part
  // of the sheet in view (#1797, pasteOffset), selected, with fresh names
  let pointer = null;   // (the mouse over the sheet: its screen point; off it, null)
  svg?.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') pointer = { x: e.clientX, y: e.clientY }; });
  svg?.addEventListener('pointerleave', () => { pointer = null; });
  function visibleArea() {
    const r = svg?.getBoundingClientRect();
    if (!r || r.width < 20 || r.height < 20) return null;
    const a = toSheet(r.left, r.top), b = toSheet(r.right, r.bottom);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  }
  function copySel(cut = false) {
    if (!sel().size || live() || (cut && readOnly)) return;   // (a read-only one copied, never cut, #5733)
    const clip = copySchematic(doc(), { symbols: selected('sym'), wires: selected('wire'), ports: selected('port'), labels: selected('label'), graphics: selected('graphic') }, modules());
    writeClip('schematic', clip);
    if (cut) deleteSel();
  }
  /** Pastes the clipboard (or `clip`) at the mouse or in a blank place in view; `offset` ({ dx, dy }) given: there. */
  async function paste(clip, offset = null) {
    if (readOnly || live()) return;
    clip ??= await readClip('schematic');
    if (clipEmpty(clip) || destroyed()) return;
    const { dx, dy } = offset || pasteOffset(doc(), clip, { at: pointer && toSheet(pointer.x, pointer.y), area: visibleArea(), modules: modules() });
    if (tool() !== 'select') setTool('select');
    const before = snapshot();
    edit(() => {
      const { ids } = pasteSchematic(doc(), clip, { dx, dy });
      // (its wires routed clear of what was there, #948)
      try { untangleNew(JSON.parse(before), doc(), { modules: modules(), prefer: ids.wires }); } catch (e) { console.error(e); }
      setSel(new Set([...ids.symbols.map(id => `sym:${id}`), ...ids.wires.map(id => `wire:${id}`), ...ids.ports.map(id => `port:${id}`), ...ids.labels.map(id => `label:${id}`), ...ids.graphics.map(id => `graphic:${id}`)]));
    });
    if (refusedShort(before, 'Pasting')) { undoStack.pop(); changed(); }
    container.focus({ preventScroll: true });
  }
  // Duplicate (#1556, the right-click menu): the symbols and I/O markers selected copied without their wires, placed
  // right of them, with fresh names (as pasted); the copy selected
  function duplicateSel() {
    const ids = selected('sym'), pids = selected('port');
    if (readOnly || live() || (!ids.length && !pids.length)) return;
    const clip = { ...copySchematic(doc(), { symbols: ids, ports: pids }, modules()), wires: [], labels: [] };
    const boxes = [...doc().symbols.filter(s => ids.includes(s.id)).map(s => symbolBox(s, modules())), ...doc().ports.filter(p => pids.includes(p.id)).map(portBox)];
    const dx = snap(Math.max(...boxes.map(b => b.x + b.w)) - Math.min(...boxes.map(b => b.x))) + 2 * GRID;
    const before = snapshot();
    edit(() => {
      const r = pasteSchematic(doc(), clip, { dx, dy: 0 });
      setSel(new Set([...r.ids.symbols.map(id => `sym:${id}`), ...r.ids.ports.map(id => `port:${id}`)]));
    });
    if (refusedShort(before, 'Duplicating')) { undoStack.pop(); changed(); }
  }
  function selectAll() { setSel(new Set([...doc().symbols.map(s => `sym:${s.id}`), ...doc().wires.map(w => `wire:${w.id}`), ...doc().ports.map(p => `port:${p.id}`), ...doc().labels.map(l => `label:${l.id}`), ...(doc().graphics || []).map(g => `graphic:${g.id}`)])); render(); renderProps(); }

  return { copySel, deleteSel, duplicateSel, mirrorSel, mirrorVSel, paste, rotateSel, selectAll, selected };
}
