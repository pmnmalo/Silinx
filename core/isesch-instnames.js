// An instance's name as ISE's schematic holds it (#3870): ISE's sch2hdl refuses a block named with a reserved word
// ("ERROR:DesignEntry:235 - block "reg(3:0)" is an illegal block name. It is a reserved word for verilog."), whatever
// the schematic's language, an arrayed instance's base too (reg(3:0)). Such an instance is written with _1 after its
// name (_2 … when another instance has that one), as the import names a keyword's copies (core/isesch-nets.js, #1808):
// a word of Verilog or of VHDL, in any letter case. Isomorphic (no DOM, no Node APIs).
import { reservedError } from './reserved.js';
import { arrayName } from './sch-array.js';

const lc = s => String(s ?? '').toLowerCase();
// an instance's name as its base and the range after it: reg(3:0) -> ['reg', '(3:0)']; and2 -> ['and2', '']
function split(name) {
  const t = String(name ?? '').trim(), a = arrayName(t);
  return a ? [a.base, t.slice(a.base.length)] : [t, ''];
}

/**
 * The names the export writes for `symbols`' instances: Map(symbol id -> ISE name), the name itself but when its base is
 * a reserved word; one warning (`warn`) for each instance renamed.
 */
export function iseInstanceNames(symbols, warn) {
  const out = new Map();
  const taken = new Set(symbols.map(s => lc(split(s.name)[0])));
  for (const s of symbols) {
    const [base, range] = split(s.name);
    const why = reservedError(base, { sv: false });
    if (!why) { out.set(s.id, s.name); continue; }
    let k = 1;
    while (taken.has(lc(`${base}_${k}`))) k++;
    taken.add(lc(`${base}_${k}`));
    const nm = `${base}_${k}${range}`;
    out.set(s.id, nm);
    warn(`instance '${s.name}' written as '${nm}': ${why}, which ISE's schematic refuses as a block's name`);
  }
  return out;
}
