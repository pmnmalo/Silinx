// Silinx - a module's symbol (<module>.sym.json, #3755) kept in step with its module's interface (#5872): the symbol
// records the hash of the ports it was last put in step with (their names, directions and widths, in order); when the
// module's ports are not those any more (a drawing replaced on disk, its HDL made again: core/drawing-sync.js
// checkDrawings), its pins are put in step (core/symbol-layout.js reconcile: the new ports on their default side, the
// gone ones dropped) and said; a symbol of before (no hash) is stamped quietly. The schematics' instances of a module
// whose HDL was made again that are out of date (core/schdoc-modsym.js symbolDiff) are flagged: Update Symbol (or the
// MCP's update_symbols) updates them, their wires kept. A store P as core/drawing-sync.js's. Isomorphic ES module.
import { hashText } from './hdl-cache.js';
import { isSymbolFile, reconcile, readSymbol, symbolText } from './symbol-layout.js';
import { symbolDiff } from './schdoc-modsym.js';

const lc = s => String(s).toLowerCase();

/** A module's interface hash: its ports' names, directions and widths, in their order. */
export const interfaceHash = ports => hashText(JSON.stringify((ports || []).map(q => [q.name, q.dir || 'in', q.width ?? 1])));

/**
 * The project's symbols put in step with their modules' interfaces, and the schematics' instances of the modules
 * `changed` (their names: those whose HDL was made again) flagged when out of date. modules: the project's modules
 * (core/drawing-sync.js projectModules). { written: [symbol files], messages, stale: [{ path (a schematic), module,
 * instances: [ids] }] }.
 */
export async function checkSymbols(P, name, modules, { changed = [] } = {}) {
  const out = { written: [], messages: [], stale: [] };
  const byName = new Map(Object.values(modules || {}).map(m => [lc(m.name), m]));
  const tree = await P.fileTree(name);
  for (const f of tree.filter(isSymbolFile)) {
    let text;
    try { text = await P.readFile(name, f); } catch { continue; }
    const { symbol } = readSymbol(text);
    const m = symbol && byName.get(lc(symbol.module || f.replace(/^.*\//, '').replace(/\.sym\.json$/i, '')));
    if (!m) continue;
    const h = await interfaceHash(m.ports);
    if (symbol.interface === h) continue;
    const r = reconcile(symbol, m.ports);
    const next = symbolText({ ...symbol, module: m.name, pins: r.pins, interface: h });
    if (next === text) continue;
    await P.writeFile(name, f, next);
    out.written.push(f);
    const what = [r.added.length ? `added ${r.added.join(', ')}` : '', r.removed.length ? `removed ${r.removed.join(', ')}` : ''].filter(Boolean).join('; ');
    // (a symbol of before #5872, its pins its module's: stamped, nothing said)
    if (what || symbol.interface) out.messages.push(`${f} updated: the ports of ${m.name} changed${what ? ` (${what})` : ''}`);
  }
  const want = new Set(changed.map(lc));
  if (!want.size) return out;
  for (const f of tree.filter(p => /\.sch\.json$/i.test(p))) {
    let doc;
    try { doc = JSON.parse(await P.readFile(name, f)); } catch { continue; }
    const per = new Map();
    for (const s of Array.isArray(doc?.symbols) ? doc.symbols : []) {
      if (s?.type !== 'module' || !want.has(lc(s.params?.module)) || !symbolDiff(s, modules)) continue;
      const k = byName.get(lc(s.params.module))?.name || s.params.module;
      per.set(k, [...(per.get(k) || []), s.id]);
    }
    for (const [module, ids] of per) {
      out.stale.push({ path: f, module, instances: ids });
      out.messages.push(`WARNING: ${f}: ${ids.length} instance(s) of ${module} out of date (${ids.join(', ')}): Update Symbol (its right-click menu) or update_symbols updates them, their wires kept.`);
    }
  }
  return out;
}
