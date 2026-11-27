// Silinx - a drawing's HDL file as a cache of it, checked by hashes (#5872): the drawing (a schematic, an ASM chart, a
// state diagram, a truth table, a Petri net, a circuit) is the source; its HDL file stays a file of the project (for
// export, git, the other tools, teaching) and carries, as its last line, the hash of the drawing it was made from and
// the hash of its own text:
//   -- silinx-sync drawing:<16 hex> hdl:<16 hex> (generated from the drawing: edit it, not this file)
// (`//` in Verilog). The last line, not the first: the HDL's lines keep their numbers (the diagnostics', the
// simulator's) and its first lines' marks (`silinx-symbol`) their place. core/drawing-sync.js reads it: the drawing
// changed (its hash is not the line's) and the HDL as it was made: made again; the HDL changed (its text's hash is not
// the line's): changed outside Silinx, kept in a version and made again, the drawing winning; no line (a project made
// before): made again quietly, kept in a version only when its text is not the drawing's. Isomorphic ES module.

const LINE_RE = /^(?:--|\/\/) silinx-sync drawing:([0-9a-f]{16}) hdl:([0-9a-f]{16})\b[^\n]*\n?$/;

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
/** A text's hash: SHA-256's first 16 hex digits. */
export const hashText = async text => hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)))).slice(0, 16);

// a JSON value with its objects' keys in order (the same drawing, however its keys were written)
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])]));
}

/** A drawing's hash: its JSON's (its model or its text), canonical (keys in order, no spacing), its link to its HDL
 *  file (generatedFile) aside; null for a text that is not JSON. */
export async function drawingHash(model) {
  let m = model;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch { return null; } }
  if (!m || typeof m !== 'object') return null;
  const { generatedFile, ...rest } = m;   // eslint-disable-line no-unused-vars
  return hashText(JSON.stringify(canonical(rest)));
}

// a text ending with one line end
const ended = text => (String(text).endsWith('\n') ? String(text) : `${text}\n`);

/** An HDL file's text read: { body (its text without the line, ended with a line end), drawing, hdl (the line's
 *  hashes) }; null hashes for a text with no line (a file made before #5872, or written by hand). */
export function readStamp(text) {
  const t = String(text ?? '');
  const end = t.endsWith('\n') ? t.length - 1 : t.length;
  const start = t.lastIndexOf('\n', end - 1) + 1;
  const m = LINE_RE.exec(t.slice(start));
  return m ? { body: t.slice(0, start), drawing: m[1], hdl: m[2] } : { body: ended(t), drawing: null, hdl: null };
}

/** The HDL `body` made from a drawing whose hash is `drawing`, with its line: the file's text. */
export async function stampHdl(body, drawing, lang) {
  const b = readStamp(body).body;
  const c = lang === 'verilog' ? '//' : '--';
  return `${b}${c} silinx-sync drawing:${drawing} hdl:${await hashText(b)} (generated from the drawing: edit it, not this file)\n`;
}

/** What an HDL file's text says of its drawing (`model`): 'fresh' (made from it as it is, and not changed since),
 *  'drawing' (the drawing changed since), 'edited' (its text changed since it was made), 'unknown' (no line). */
export async function cacheState(text, model) {
  const s = readStamp(text);
  if (!s.drawing) return 'unknown';
  if (await hashText(s.body) !== s.hdl) return 'edited';
  return await drawingHash(model) === s.drawing ? 'fresh' : 'drawing';
}

/** Whether two HDL texts are the same but for their lines. */
export const sameBody = (a, b) => readStamp(a).body === readStamp(b).body;
