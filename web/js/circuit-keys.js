// The circuit editor's keys (#3897, web/js/circuit-editor.js; moved out of its mount as they were, #4945): Undo (Ctrl+Z),
// Redo (Ctrl+Y, Ctrl+Shift+Z), Delete, Copy and Cut (Ctrl+C, Ctrl+X: a part), Paste (Ctrl+V), Esc (Try it stopped, a
// wire being drawn ended there, else the Select tool), R (turned), + and − (zoom), F (fit); a field's own keys left alone,
// a read-only editor's edits ignored.

/** The keys on `root`: sel(), sim(), tool(), draft() the editor's current values; the rest its functions. */
export function mountCircuitKeys({ root, readOnly, sel, sim, tool, draft, clip, undo, redo, deleteSelection, stopSim, endWire, setTool, rotateSelection, zoomBtn, fit }) {
  root.addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (readOnly && (mod ? /^[zyxv]$/.test(k) : /^(Delete|Backspace|r)$/i.test(e.key))) return;
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); undo(); }
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); e.stopPropagation(); redo(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    else if (mod && (k === 'c' || k === 'x')) { if (sel()?.kind === 'part') { e.preventDefault(); clip.copy(k === 'x'); } }
    else if (mod && k === 'v' && !readOnly) clip.pasteKey();
    else if (e.key === 'Escape') { if (sim()) stopSim(); else if (tool() === 'wire' && draft()?.length >= 2) endWire(); else setTool('select'); }
    else if (!mod && k === 'r') rotateSelection();
    else if (!mod && (k === '+' || k === '=')) zoomBtn(1.25);
    else if (!mod && k === '-') zoomBtn(0.8);
    else if (!mod && k === 'f') fit();
  });
}
