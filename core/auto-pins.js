// The top-level port bits of a design that have no pin location (LOC) in its constraints, by their
// UCF names (as XST names them): the server (server/ise.js generateBuild) and the browser edition's
// Silinx toolchain (web/js/open-flow-browser.js) check them before an implementation.
import { compile, elaborate } from './compile.js';
import { parseUcf, bitName } from '../packages/silinx-fpga/src/parts.js';
import { clocksOf, latchGates } from './schematic.js';
import { primitiveSources } from './unisim.js';

/**
 * Create build/ for a project. Returns { buildDir, top, device, files, sources, hasUcf, warnings }.
 */
const bitsOf = n => { let k = 1; while ((1n << BigInt(k)) <= n) k++; return k; };
/** The bits of a port's type as XST makes them (#3820): an integer with a range only its range's (integer range 127
 *  downto -128: 8, signed; 0 to 8: 4), a plain integer 32; any other type its width. */
export function portWidth(t) {
  if (t?.kind !== 'int' || t.rlo === undefined) return t?.w ?? 1;
  return t.rlo < 0 ? Math.max(bitsOf(BigInt(-t.rlo - 1)), bitsOf(BigInt(t.rhi))) + 1 : bitsOf(BigInt(t.rhi));
}
// a port's bus bits, lsb and msb, as XST names them (an integer's: <w-1> down to <0>, its range's bits only), or null (a scalar)
function busBits(t) {
  if (t.kind === 'int') return { lo: 0, hi: portWidth(t) - 1 };
  return t.w > 1 || (t.kind === 'logic' && !t.scalar) ? { lo: Math.min(t.left, t.right), hi: Math.max(t.left, t.right) } : null;
}

/** Top-level port bits ({ net, dir }) that have no LOC in the given UCF text. */
export async function unconstrainedPorts(sources, top, ucfText) {
  let design;
  // with Silinx's UNISIM models when the design instantiates primitives (LD*, BUFG ...)
  try { design = elaborate(compile([...primitiveSources(sources), ...sources]), top); } catch { return []; }
  if (!design?.top) return [];
  let asg = {};
  // (given the top's ports, a name such as x[1] is a bus bit only when x is a bus: #63, #84)
  const ucfPorts = design.top.ports.map(p => { const t = p.sig.t, b = busBits(t), int = t.kind === 'int'; return { name: p.name, msb: b ? (int ? b.hi : t.left) : null, lsb: b ? (int ? 0 : t.right) : null }; });
  try { asg = parseUcf(ucfText || '', { ports: ucfPorts }).assignments || {}; } catch { /* unparsable: treat as empty */ }
  const has = net => Object.entries(asg).some(([k, a]) => a.loc && k.toLowerCase() === net.toLowerCase());
  // ports used as clocks anywhere in the hierarchy must go to global-clock (GCLK) pins
  const clocks = new Set();
  const visit = inst => { for (const pr of inst.procs || []) for (const c of clocksOf(pr).clocks) clocks.add(c); (inst.children || []).forEach(visit); };
  visit(design.top);
  // latch gates too: XST puts them on a global buffer, so they need a GCLK pin as well
  for (const g of latchGates(design)) clocks.add(g);
  const out = [];
  for (const p of design.top.ports) {
    const t = p.sig.t;
    // a 1-bit vector (std_logic_vector(0 downto 0), [0:0]) is a bus in the UCF: x<0>; an escaped
    // name (\opcode[0] ) is XST's: _opcode[0]_ (bitName)
    const b = busBits(t);
    if (!b) { const n = bitName(p.name); if (!has(n)) out.push({ net: n, dir: p.dir, clock: p.dir === 'in' && clocks.has(p.sig) }); continue; }
    for (let i = b.lo; i <= b.hi; i++) { const n = bitName(p.name, i); if (!has(n)) out.push({ net: n, dir: p.dir }); }
  }
  return out;
}
