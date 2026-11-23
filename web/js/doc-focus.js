// A document opened from the keyboard takes the keyboard (#5300): the command palette's file, the Design tree's row
// opened by Enter. Its text editor's text, else its drawing's canvas (the key target of a state diagram, an ASM chart,
// a schematic, a truth table…); the keyboard left where it is when the person has moved it elsewhere meanwhile.
// (A document opened by the mouse, or by the application, keeps the focus where it is.)
const TARGETS = '.asm-editor[tabindex], .sch-editor[tabindex], .tt-editor[tabindex]';

/** The document's keyboard: its text editor, else its drawing's canvas. */
function focusDoc(doc) {
  if (!doc || doc.closed || doc.el?.hidden) return false;
  if (doc.editor?.view && doc.editor.focus) { doc.editor.focus(); return true; }
  const el = doc.el?.querySelector(TARGETS);
  if (!el) return false;
  el.focus({ preventScroll: true });
  return true;
}

/** `open()` run (sync or async), the document it brought to the front (silinx:doc-activated) given the keyboard if the
 *  focus is still where it was (`from`, or in it; the page itself). Resolves with what `open()` returned. */
export async function openFocused(open, from = document.activeElement) {
  let doc = null;
  const seen = e => { if (!e.detail?.background) doc = e.detail?.doc || null; };
  addEventListener('silinx:doc-activated', seen);
  let r;
  try { r = await open(); } finally { removeEventListener('silinx:doc-activated', seen); }
  const at = document.activeElement;
  if (doc && (!at || at === document.body || at === from || from?.contains?.(at))) focusDoc(doc);
  return r;
}
