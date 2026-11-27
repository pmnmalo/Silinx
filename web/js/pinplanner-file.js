// I/O Pin Planning's constraints file followed (#5788): its views and the file one model. Opened, the file's text
// editor's text is read (its edits not saved yet too, not the disk's); saved by that editor in the page
// (`silinx:doc-saved`, web/js/app.js flushDoc: the page's own writes are not told by project-watch.js), the model is
// read again from it; changed outside the page (the MCP server, another program, a live share's owner), the planner's
// document is reloaded as a text editor's (web/js/project-watch.js: its `fileOf` and `fileText`, a conflict asked).
import { app, setDirty } from './app.js';

/**
 * ctx: { doc (the planner's document), file() (its constraints file), text() (the text it would save), reload(text) (the
 * model read again from a text) }. Returns { openText() (the file's text editor's text, null with none open), doc (the
 * document's fileOf and fileText, for project-watch.js), destroy() }.
 */
export function followPinFile({ doc, file, text, reload }) {
  const editorOf = () => (file() ? app.findDoc(`file:${file()}`)?.editor : null);
  const onSaved = (e) => {
    const d = e.detail?.doc;
    if (!d || d === doc || doc.closed || !file() || d.id !== `file:${file()}` || !d.editor) return;
    reload(d.editor.getValue());
    setDirty(doc, false);
  };
  addEventListener('silinx:doc-saved', onSaved);
  return {
    openText: () => editorOf()?.getValue() ?? null,
    doc: { fileOf: file, fileText: { getValue: text, setValue: reload, markClean: () => {} } },
    destroy: () => removeEventListener('silinx:doc-saved', onSaved),
  };
}
