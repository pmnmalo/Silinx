// I/O Pin Planning's Text view (#5642): the constraints file in the text editor (web/js/editor.js), what Edit Constraints
// (Text) opened before; the table's changes written into it as the format writes them (`generate`), its own edits read
// back into the table (`read`) as it is typed (the Board Resources panel follows it, #5788), and for good (undoable)
// when the view is left, the table is changed from it or the file is saved; its problems shown as the constraints
// file's editor shows them (Check Constraints' diagnostics, as it is typed). And its Check (checkPins): Check
// Constraints of the file.
import { createEditor } from './editor.js';
import { filesState } from './state-files.js';

/** I/O Pin Planning's Check (#5642): Check Constraints of its file (`file()`), saved first when there is none yet (`save`:
 *  the table's written; none, read only); `target`: a System's FPGA node's top, board and device. */
export async function checkPins({ file, save, target }) {
  if (save && !(file() && filesState.fileTree.includes(file()))) await save();
  const { checkUcfFile } = await import('./implement.js');
  return checkUcfFile(file(), target ? { target } : {});
}

// host: where the editor goes; file(): the constraints file's path; text: its text (null: none yet); generate(): the
// table's text; read(text, { live }): the table made from a text (live: as it is typed, not an undoable step); edited(): a
// change of the user's in it; diagnostics(text): its problems
export function mountPinText({ host, file, text, readOnly, generate, read, edited, diagnostics }) {
  let ed = null, current = text;
  let stale = false;   // (the table changed since the text was made: made again when shown or saved)
  let own = false;   // (the text edited, not read into the table yet)
  let lintTimer = null, liveTimer = null;
  const lint = () => { clearTimeout(lintTimer); lintTimer = setTimeout(async () => { if (ed) ed.setDiagnostics(await diagnostics(ed.getValue())); }, 400); };
  // (the text shown made again from the table when it changed: the editor's own history keeps it, an Undo there)
  // (what is typed read into the table a moment later, #5788: the Board Resources panel and the status line follow it)
  const live = () => { clearTimeout(liveTimer); liveTimer = setTimeout(() => { if (own) read(current, { live: true }); }, 250); };
  const fresh = () => { if (current == null || stale) { current = generate(); stale = false; } return current; };
  function show() {
    const t = fresh();
    if (!ed) {
      ed = createEditor(host, {
        text: t, lang: /\.ucf$/i.test(file() || '') ? 'ucf' : 'text', path: file() || '', readOnly,
        onChange: ({ user } = {}) => { if (!user) return; own = true; current = ed.getValue(); edited(); lint(); live(); },
      });
      ed.markClean();
    } else if (ed.getValue() !== t) ed.setValue(t);
    lint();
    setTimeout(() => ed?.refresh(), 0);
  }
  /** The text's edits read into the table (left, or the table about to change from it). */
  function sync() {
    clearTimeout(liveTimer);
    if (!own) return;
    own = false;
    read(current);
  }
  /** The file's text `t` shown (read from the file, or written there by another editor or program): the text's own edits
   *  given up, the editor made clean. */
  function load(t) {
    clearTimeout(liveTimer);
    own = false; current = t; stale = false;
    if (ed && ed.getValue() !== t) ed.setValue(t);
    ed?.markClean();
  }
  return {
    show, sync, load,
    /** The text as it would be saved, read into nothing (the text's own, or the table's). */
    text: fresh,
    /** The table changed: the text made again from it when it is shown or saved. */
    tableChanged: () => { stale = true; },
    /** The text to save (the text's own, or the table's), and what was saved: the text read into the table. */
    toSave: () => { sync(); return fresh(); },
    // (typed in meanwhile, while the save ran: kept, not set back to what was saved, #5788; saved next)
    saved: t => { if (own) stale = false; else load(t); },
    /** Shown or hidden in `root`: its editor's status line (the line and the column) the one shown, the table's (`line`) else. */
    shown(on, root, line) {
      if (on) { show(); if (!ed.status.isConnected) root.append(ed.status); }
      line.hidden = on;
      if (ed) ed.status.hidden = !on;
    },
    editor: () => ed,
    destroy: () => { clearTimeout(lintTimer); clearTimeout(liveTimer); ed?.destroy(); },
  };
}
