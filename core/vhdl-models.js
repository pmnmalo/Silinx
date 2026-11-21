// Silinx - the VHDL models' entities read, one copy (#4772): the routed design's readers make nextpnr's cells the models'
// again (core/gowin-routed.js: Gowin's, core/xc7-routed.js: the UNISIM ones), from each model's generics and ports as its
// VHDL declares them. Only what those models' text holds: an entity's `generic (…)` and `port (…)` clauses, a port of a
// type with no range or of `(N downto 0)`, comments of `--`.
//
// Isomorphic ES module (browser + Node), no DOM.

// the text inside the parentheses that open at `i` (its '(')
function inParens(s, i) {
  for (let d = 0, j = i; j < s.length; j++) {
    if (s[j] === '(') d++;
    else if (s[j] === ')' && --d === 0) return s.slice(i + 1, j);
  }
  return '';
}
// a clause's declarations (split at the semicolons outside parentheses)
const declarations = (clause) => clause.replace(/--[^\n]*/g, '').split(';').map((d) => d.trim()).filter(Boolean);

/** The models of a VHDL text: entity name (as written) -> { generics: Set (upper case), ports: Map(port -> its width,
 *  0 a scalar), defaults: Set (the inputs with a default) }. */
export function vhdlModels(vhdl) {
  const models = new Map();
  for (const m of vhdl.matchAll(/^entity\s+(\w+)\s+is\b([\s\S]*?)^end\s+\1\s*;/gim)) {
    const body = m[2], g = /\bgeneric\s*\(/i.exec(body), p = /\bport\s*\(/i.exec(body);
    const generics = new Set(), ports = new Map(), defaults = new Set();
    for (const d of declarations(g ? inParens(body, g.index + g[0].length - 1) : '')) {
      for (const n of d.split(':')[0].split(',')) generics.add(n.trim().toUpperCase());
    }
    for (const d of declarations(p ? inParens(body, p.index + p[0].length - 1) : '')) {
      const x = /^([\w\s,]+?)\s*:\s*(?:in|out|inout)\s+\w+(?:\s*\(\s*(\d+)\s+downto\s+0\s*\))?/i.exec(d);
      if (!x) continue;
      for (const n of x[1].split(',')) {
        ports.set(n.trim(), x[2] !== undefined ? Number(x[2]) + 1 : 0);
        if (/:=/.test(d)) defaults.add(n.trim());
      }
    }
    models.set(m[1], { generics, ports, defaults });
  }
  return models;
}
