// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A Zynq node's PS–PL register map (#4688, part 2b): `psMap`, an AXI4-Lite register map (core/regmap.js, bus 'axi') of the
// node's folder, whose registers its module and its PS's program share. With one, the node's PL is built from Silinx's
// top (core/zynq-pl-top.js: the PS7, its M_AXI_GP0 bridged to the map's slave, the module) in place of its module alone
// (server/system-implement.js); its PS's program includes the map's header (the editor's Header, ps/<name>.h). Its place,
// its checks and its description here. Isomorphic module (browser + Node).
import { relInNode, relPathError } from './system-layout.js';
import { isRegmapFile, readRegmap } from './regmap.js';
import { psOfBoard } from './zynq-ps.js';

/** The top Silinx builds for a node with a map: its module's, `<module>_zynq`. */
export const psTopName = (module) => `${module}_zynq`;

/** Why `path` cannot be node `id`'s PS–PL map (a .regs.json of its folder; a Board project's, `id` null, the project's), or null. */
export function psMapError(path, id) {
  const s = String(path ?? ''), rel = id ? relInNode(s, id) : (relPathError(s) ? null : s);
  if (rel == null) return `its PS–PL register map ${s} is not in ${id ? `${id}/` : 'the project'}`;
  if (!isRegmapFile(s)) return `its PS–PL register map ${s} is not a register map (.regs.json)`;
  return null;
}

/** The PS–PL map problems of FPGA node `n` (its `psMap`), each a sentence: its board with no PS, its place, a map the
 *  project has not (`files`), a map not on AXI4-Lite (`texts`: the project's texts by path, when read). */
export function psMapProblems(n, files = null, texts = null) {
  if (!n?.psMap) return [];
  const out = [];
  if (!psOfBoard(n.board, n.variant)) out.push(`${n.id}: the board ${n.board ?? '(none)'} has no processing system (its PS–PL register map ${n.psMap})`);
  const where = psMapError(n.psMap, n.implicit ? null : n.id);
  if (where) out.push(`${n.id}: ${where}`);
  else if (files && !files.includes(n.psMap)) out.push(`${n.id}: no register map ${n.psMap} in the project`);
  else if (texts?.[n.psMap] != null) {
    const r = readRegmap(texts[n.psMap]);
    if (r.error) out.push(`${n.id}: ${n.psMap}: ${r.error}`);
    else if (r.regmap.bus !== 'axi') out.push(`${n.id}: its PS–PL register map ${n.psMap} is on ${r.regmap.bus.toUpperCase()}, not AXI4-Lite`);
  }
  return out;
}

/** Node `n`'s PS–PL map in a few words (describeSystem's), or null. */
export const psMapSummary = (n) => (n?.psMap ? `its PL built as ${psTopName(n.module ?? 'top')}: the PS7, its M_AXI_GP0 on the registers of ${n.psMap}, and ${n.module ?? 'its module'}` : null);
