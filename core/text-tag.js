// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A file's revision as a writer saw it (#5915): a tag of its text, sent with a write as its precondition (If-Match), so
// that a file changed meanwhile by another writer (the System editor and the MCP's edit_system, two tabs, two processes)
// is not written over silently: the stores refuse it (412) and say so, as silinx.json's writes do (#4726). A tag of the
// text's content (FNV-1a, 64 bits as two 32-bit halves), the same in the browser and in Node: a precondition, never a
// security check. Isomorphic, no imports.

/** The tag of a text (a file's content as read or written): "t-" and 16 hexadecimal digits; none (null) for no text. */
export function textTag(text) {
  if (typeof text !== 'string') return null;
  let a = 0x811c9dc5, b = 0x050c5d1f;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ (c + i), 0x01000193) >>> 0;
  }
  return `t-${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

/** Why `path` may not be written: its text now (`current`, null: none) is not the one the writer read (`ifMatch`, its
 *  tag), else null (no precondition, or the same). One message for the local server, the browser edition and the MCP. */
export function changedMeanwhile(path, current, ifMatch) {
  if (!ifMatch || textTag(current) === ifMatch) return null;
  return `'${path}' was changed meanwhile (by another window, tab or tool): not written over; reopen it to see that change, or save again to keep yours`;
}
