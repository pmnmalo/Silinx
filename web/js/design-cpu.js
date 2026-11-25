// The Design pane's row of a drawing in a System's CPU node (#5486, docs/SYSTEMS.md): a state diagram, an ASM chart, a
// Petri net or a truth table in a microcontroller node (its base language C, C++ or MicroPython) is its board's program,
// no module of the FPGA's design: its row is named after its module, its drawing's badge first (the base, Open), its
// node's language's last ([C], [C++], [Py]), its generated code (core/drawing-code.js, `<module>.c`, `.cpp` or `.py`
// next to it, #5487, linked by generatedFile), opened from it. Not made (errors) or not made again (errors since): the
// badge marked, its tip why.
import { designState } from './state-design.js';
import { filesState } from './state-files.js';
import { syncState } from './state-sync.js';
import { REACTIVE_KINDS, drawingKind } from '/core/reactive-from.js';
import { drawingC, nodeCodeOpts } from '/core/drawing-code.js';

/** Whether the file `p` is a drawing that runs on a CPU (its kind one of the synchronous reactive model's). */
export const isCpuDrawing = p => REACTIVE_KINDS.includes(drawingKind(p));

// the drawing's model, as the project read it, or null
function model(p) {
  try { return JSON.parse(designState.viewTexts?.[p] ?? ''); } catch { return null; }
}

/** The drawing's generated code (its generatedFile, when it is in the project folder), or null. */
export function cpuCode(p) {
  const f = model(p)?.generatedFile;
  return f && (filesState.fileTree || []).includes(f) ? f : null;
}

/** The drawing's module's name: its model's, else its file's. */
export const cpuModule = p => model(p)?.name || p.split('/').pop().replace(/\.\w+\.json$/i, '');

/**
 * A CPU node's drawing's badges: its drawing's (`badge`, the base: Open) and its node's language's (`lang`, C, C++ or
 * Py: its code, opened with openCode; marked when not made, or not made again since its errors). `node` the System
 * node (its GPIO interfaces its ports' pins), `noun` the drawing's name for its kind, `open`, `openCode`, `menu` the row's.
 */
export function cpuBadges(p, { lang, node, badge, noun, open, openCode, menu }) {
  const code = cpuCode(p);
  const stale = code ? syncState.outOfSync?.[code] : null;
  const why = () => { const r = drawingC(p, designState.viewTexts?.[p] ?? '', { lang: node?.lang || 'c', ...nodeCodeOpts(node) }); return r.errors.map(e => e.replace(`${p}: `, '')).join('; '); };
  return [{ text: badge, base: true, title: 'Open', open, context: menu },
    code && !stale ? { text: lang, title: `Generated from the ${noun}`, open: () => openCode(code), context: menu }
      : code ? { text: lang, warn: true, title: `Not updated: ${stale}`, open: () => openCode(code), context: menu }
        : { text: lang, warn: true, title: why() ? `Not made: it has errors: ${why()}` : 'Not made: its file is not in the project folder', open, context: menu }];
}
