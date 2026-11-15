// The circuit editor's Cut, Copy and Paste (#4066, core/circuit-edit.js copyParts and pasteParts, the MCP server's
// edit_circuit copy's): the selected part (a breadboard with the parts on it and the wires between them) on the app's
// clipboard (web/js/clipboard.js, kind 'circuit'), pasted 2 steps right and down, again further each time, new ids
// given; another circuit's copy pasted where it was there.
import { copyParts, pasteParts, deleteItem } from '/core/circuit-edit.js';
import { writeClip, readClip, hasClip, pasteFromKey } from './clipboard.js';

/** { copy(cut), paste(clip), pasteKey(), has() } of mountCircuitEditor (M(), sel(): its current values; setSel(s)). */
export function mountCircuitClip({ M, sel, setSel, readOnly, applyEdit }) {
  let pasteN = 0, pasteText = null;
  function copy(cut = false) {
    const s = sel();
    if (s?.kind !== 'part') return;
    const c = copyParts(M(), s.id);
    if (c.error) return;
    const data = { from: M().name, parts: c.parts, wires: c.wires };
    writeClip('circuit', data);
    pasteText = JSON.stringify(data); pasteN = 0;
    if (!cut || readOnly) return;
    // (cut: what was copied deleted, in one edit)
    let m = M();
    for (const x of [...c.wires, ...c.parts]) { const r = deleteItem(m, x.id); if (!r.error) m = r.model; }
    setSel(null);
    applyEdit({ model: m }, null);
  }
  async function paste(clip) {
    if (readOnly) return;
    clip ??= await readClip('circuit');
    if (!Array.isArray(clip?.parts) || !clip.parts.length) return;
    const t = JSON.stringify(clip);
    if (t !== pasteText) { pasteText = t; pasteN = clip.from === M().name ? 0 : -1; }
    const d = 2 * ++pasteN;
    const r = pasteParts(M(), clip, [d, d]);
    applyEdit(r, r.ids ? { kind: 'part', id: r.ids[0] } : null);
  }
  return { copy, paste, pasteKey: () => pasteFromKey('circuit', paste), has: () => hasClip('circuit') };
}
