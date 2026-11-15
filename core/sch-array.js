// Silinx - an arrayed instance (#3755), as ISE's schematic makes one: a module's instance named with a range, reg(3:0)
// (or reg[3:0]), is that many copies of its module, reg_3 … reg_0. Each pin of width w connected to a net of N × w bits
// (N copies) takes its slice of the net for each copy, the copy of index i the bits of its place from the net's low end
// (reg(3:0)'s D on D(3:0): reg_i's D is D(i)); a pin connected to a net of w bits is shared by every copy (a clock, an
// enable). The generated VHDL and Verilog write the copies one by one (core/schdoc-hdl-more.js). An output shared by
// the copies drives its net N times: an error. Isomorphic (no DOM).

const RANGE = /^([A-Za-z][A-Za-z0-9_]*)\s*[([]\s*(\d+)\s*:\s*(\d+)\s*[)\]]$/;
const MAX_COPIES = 1024;

/** An instance name with a range: { base, msb, lsb, n, indices (msb first) }, else null. */
export function arrayName(name) {
  const m = RANGE.exec(String(name ?? '').trim());
  if (!m) return null;
  const msb = +m[2], lsb = +m[3], n = Math.abs(msb - lsb) + 1;
  if (n > MAX_COPIES) return null;
  const step = msb >= lsb ? -1 : 1;
  return { base: m[1], msb, lsb, n, indices: Array.from({ length: n }, (_, k) => msb + k * step) };
}

/** The array of an instance (a module's, named with a range of 2 copies or more), else null. */
export function arrayOf(sym) {
  if (sym?.type !== 'module') return null;
  const a = arrayName(sym.name);
  return a && a.n > 1 ? a : null;
}

/** The name of copy `i` of an array: reg_3. */
export const copyName = (a, i) => `${a.base}_${i}`;

/** The pins of an instance marked shared by its copies (#3966, its Properties' Shared pins, params.shared: ['C', 'CE']):
 *  their names, lower case (matched whatever their case). */
export const sharedPins = sym => new Set((Array.isArray(sym?.params?.shared) ? sym.params.shared : []).map(n => String(n).toLowerCase()));

/** An instance's Shared pins for a list of pin names (#3966, the MCP's shared): { names } in its pins' order and case
 *  ([] none), or { error } naming a pin it does not have. */
export function sharedList(pins, names) {
  const want = new Set((names || []).map(n => String(n).trim().toLowerCase())), have = new Set(pins.map(p => p.name.toLowerCase()));
  const bad = (names || []).filter(n => !have.has(String(n).trim().toLowerCase()));
  if (bad.length) return { error: `Shared pins: no pin ${bad.join(', ')} (its pins: ${pins.map(p => p.name).join(', ')})` };
  return { names: pins.filter(p => want.has(p.name.toLowerCase())).map(p => p.name) };
}

/**
 * The widths of a net's arrayed pins (netlist(), each endpoint { kind, dir, width, arr, shared }): a pin is sliced when
 * the net's other widths (its I/O markers', labels', other pins') have its N × w bits, or, with none, when an arrayed
 * output is on it; its width then N × w (set on the endpoint, with sliced: true). A pin marked shared (#3966) is never
 * sliced: on a net of another width it is an error (misfit: true, its width left out of the net's). Returns the
 * endpoints in error: the shared arrayed outputs (each copy driving the net), the misfit shared pins.
 */
export function sliceArrayed(eps, otherWidths) {
  const arr = eps.filter(e => e.kind === 'pin' && e.arr > 1);
  if (!arr.length) return [];
  const others = [...otherWidths, ...eps.filter(e => !arr.includes(e) && e.kind === 'pin').map(e => e.width)].filter(w => typeof w === 'number');
  const anyOut = arr.some(e => e.dir === 'out' && !e.shared);
  for (const e of arr) {
    const wide = (e.width || 1) * e.arr;
    if (!e.shared && (others.length ? others.includes(wide) : anyOut)) { e.width = wide; e.sliced = true; }
  }
  // (a pin marked shared: the net's other widths, its slices' too, its own; an output marked shared an error alone)
  const all = [...otherWidths, ...eps.filter(e => e.kind === 'pin').map(e => e.width)].filter(w => typeof w === 'number');
  for (const e of arr.filter(x => x.shared)) {
    const rest = [...all]; rest.splice(rest.indexOf(e.width), 1);
    if (e.dir === 'out' || rest.some(w => w !== e.width)) e.misfit = true;
  }
  return arr.filter(e => (e.dir === 'out' && !e.sliced) || e.misfit);
}

/** The error of an arrayed pin sliceArrayed returned: a shared output, or a pin marked shared on a net of another
 *  width (inst its instance's name, net the net's { name, width }). */
export function arrayedError(e, inst, net) {
  if (e.dir === 'out' && e.shared) return `${inst}: output ${e.pin} is marked shared, but each of its ${e.arr} copies would drive the net '${net.name}': untick it in Shared pins and connect it to a ${e.arr * e.width}-bit bus`;
  if (e.dir === 'out') return `${inst}: output ${e.pin} of its ${e.arr} copies drives the ${net.width}-bit net '${net.name}': connect it to a ${e.arr * e.width}-bit bus`;
  return `${inst}: pin ${e.pin} is shared by its ${e.arr} copies, but its net '${net.name}' is ${net.width} bits wide: connect it to a ${e.width}-bit net, or untick it in Shared pins`;
}

/** The HDL slice of copy number k (0: the low end) of a pin `w` bits wide on a net whose signal is `name`, its bits
 *  from `off` (its low index). */
export function sliceOf(name, off, k, w, vhdl) {
  const lo = off + k * w, hi = lo + w - 1;
  return vhdl ? (w === 1 ? `${name}(${lo})` : `${name}(${hi} downto ${lo})`) : (w === 1 ? `${name}[${lo}]` : `${name}[${hi}:${lo}]`);
}

/** An instance's width (#3950): its number of copies, 1 when it is not named with a range. */
export const arrayWidth = name => arrayName(name)?.n ?? 1;

/**
 * An instance's name for a width (#3950, its Properties' Width): { name } (reg(7:0) for 8, reg for 1, its base kept;
 * the name as it is when its width is already that), or { error } (not an integer from 1 to 1024).
 */
export function withArrayWidth(name, width) {
  const n = Number(width), cur = String(name ?? '').trim();
  if (!Number.isInteger(n) || n < 1 || n > MAX_COPIES) return { error: `Width ${String(width).trim() || '(empty)'}: a whole number from 1 to ${MAX_COPIES}` };
  if (n === arrayWidth(cur)) return { name: cur };
  const base = arrayName(cur)?.base ?? cur;
  return { name: n === 1 ? base : `${base}(${n - 1}:0)` };
}

/**
 * The symbol of an arrayed instance as drawn (#3950): each pin sliced over its copies a bus of N × w bits, its name
 * with its range, D(7:0), when its side of the box has room; a pin on a net of its own width (nl, the netlist), shared
 * by the copies, as it is, and one marked shared (#3966) whatever its net; a pin not connected yet a bus. Its title with the number of copies, REG1bit ×8. The def
 * itself when it is not an array (its pins' places never change: only their widths and names as drawn).
 */
export function arrayedDef(sym, def, nl) {
  const a = arrayOf(sym);
  if (!a || !def?.pins) return def;
  const marked = sharedPins(sym);
  const shared = p => {
    if (marked.has(p.name.toLowerCase())) return true;   // (marked shared, #3966: a single pin whatever its net)
    const net = nl?.pinNet?.get(`${sym.id}/${p.name}`);
    const connected = !!net && ((net.endpoints?.length || 0) > 1 || net.labels?.length > 0);   // (its own net alone: open)
    return connected && !net.endpoints.some(e => e.sym === sym.id && e.pin === p.name && e.sliced);
  };
  const pins = def.pins.map(p => (shared(p) ? p : { ...p, width: (p.width || 1) * a.n, sliced: true }));
  // (a name with its range only when the names of every row, left and right, still fit the body: 6.2 px a letter, 3.2
  // a narrow one, a bracket, a colon; the top and bottom ones when the names of that side fit its width)
  const label = p => (p.sliced ? `${p.name}(${p.width - 1}:0)` : p.name);
  const len = p => [...label(p)].reduce((n, c) => n + (/[()[\]:.,;|!il1]/.test(c) ? 3.2 : 6.2), 0) + (p.clock ? 8 : 0);
  const row = y => pins.filter(p => (p.side === 'W' || p.side === 'E') && p.y === y).reduce((n, p) => n + len(p) + 4, 0);
  const across = side => pins.filter(p => p.side === side).reduce((n, p) => n + len(p) + 4, 0);
  const fits = pins.every(p => row(p.y) <= def.body.w) && across('N') <= def.body.w && across('S') <= def.body.w;
  return { ...def, pins: pins.map(p => (p.sliced && fits ? { ...p, label: label(p) } : p)), title: `${def.title} ×${a.n}`, copies: a.n };
}
