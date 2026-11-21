// Silinx HDL generators' shared primitives (#4768, #5076): the texts every generator writes the same way, one copy of
// each, so that their output stays the same everywhere: a width's type and range, a port list, an entity's and a
// module's header. Their layouts differ per generator (indents, aligned columns, the end of an entity), so the emitters
// take options for them; the defaults are the commonest. The generators move to them one family at a time, with the
// same bytes as before. Isomorphic (no DOM, no Node APIs).

/** The VHDL type of a port or signal of `w` bits: std_logic for 1, else std_logic_vector(w-1 downto 0). */
export const vhdlType = (w) => (w === 1 ? 'std_logic' : `std_logic_vector(${w - 1} downto 0)`);

/** The Verilog range of a declaration of `w` bits, with its space after it: '[w-1:0] ', none for 1 bit (or less). */
export const vlogRange = (w) => (w > 1 ? `[${w - 1}:0] ` : '');

// a list's lines, its separator after each but the last
const separated = (lines, sep) => lines.map((l, k) => (k < lines.length - 1 ? l + sep : l));
const longest = (xs) => Math.max(0, ...xs.map((x) => x.length));

/**
 * One VHDL port: `name : mode type`, and ` := init` when it has one. A port is { name, dir, type } (their texts), init
 * optional. nameWidth / dirWidth: the name's and the mode's columns
 * (padded with spaces to them: 'in ' for an aligned table of ins and outs).
 */
export function vhdlPort(p, { nameWidth = 0, dirWidth = 0 } = {}) {
  return `${p.name.padEnd(nameWidth)} : ${p.dir.padEnd(dirWidth)} ${p.type}${p.init ? ` := ${p.init}` : ''}`;
}

/**
 * A VHDL port list's lines: each port at `indent`, ';' after every one but the last. align: the names padded to the
 * longest; dirWidth: the modes' column (vhdlPort's).
 */
export function vhdlPortLines(ports, { indent = '    ', align = false, dirWidth = 0 } = {}) {
  const nameWidth = align ? longest(ports.map((p) => p.name)) : 0;
  return separated(ports.map((p) => indent + vhdlPort(p, { nameWidth, dirWidth })), ';');
}

/**
 * A VHDL entity: `entity name is`, its generic clause (when it has generics), its port clause (when `ports` is given,
 * even empty) and its end. indent: the clauses' (their lines one more indent, `inner`, by default twice it). A generic
 * is { name, type = 'integer', value } (` := value` when it has one: not undefined nor null); alignGenerics pads their names;
 * genericClause: the generic clause's lines as written, instead (a one-line clause). end: 'entity' (`end entity
 * name;`), 'name' (`end name;`), 'bare' (`end entity;`). The port options are vhdlPortLines'.
 */
export function vhdlEntity(name, { generics = [], ports = null, indent = '  ', inner = indent + indent, align = false, dirWidth = 0,
  alignGenerics = false, genericClause = [], end = 'entity' } = {}) {
  const L = [`entity ${name} is`, ...genericClause];
  if (generics.length) {
    const gw = alignGenerics ? longest(generics.map((g) => g.name)) : 0;
    L.push(`${indent}generic (`, ...separated(generics.map((g) => `${inner}${g.name.padEnd(gw)} : ${g.type ?? 'integer'}${g.value != null ? ` := ${g.value}` : ''}`), ';'), `${indent});`);
  }
  if (ports) L.push(`${indent}port (`, ...vhdlPortLines(ports, { indent: inner, align, dirWidth }), `${indent});`);
  L.push(end === 'name' ? `end ${name};` : end === 'bare' ? 'end entity;' : `end entity ${name};`);
  return L;
}

// a Verilog port's range text: its own, else its width's
const rangeOf = (p) => p.range ?? vlogRange(p.width);
const VLOG_DIR = { in: 'input', out: 'output', inout: 'inout' };

/**
 * One Verilog port declaration: `direction [kind ]range name`. A port is { name, dir } (dir: in / out / inout, or
 * the keyword), with kind (wire, reg, 'reg ', 'wire signed'…: none without it) and range (its text with its space;
 * else vlogRange of its `width`), each optional. dirWidth: the direction's column ('input ' beside
 * 'output'), rangeWidth the range's (aligned names); kind: the kind of a port that says none.
 */
export function vlogPort(p, { dirWidth = 0, rangeWidth = 0, kind = '' } = {}) {
  const k = p.kind ?? kind, range = rangeOf(p);
  return `${(VLOG_DIR[p.dir] ?? p.dir).padEnd(dirWidth)} ${k ? `${k} ` : ''}${range.padEnd(rangeWidth)}${p.name}`;
}

/**
 * A Verilog port list's lines: each declaration at `indent`, ',' after every one but the last. align: the ranges
 * padded to the longest (the names in a column); dirWidth, kind: vlogPort's.
 */
export function vlogPortLines(ports, { indent = '  ', align = false, dirWidth = 0, kind = '' } = {}) {
  const rangeWidth = align ? longest(ports.map(rangeOf)) : 0;
  return separated(ports.map((p) => indent + vlogPort(p, { dirWidth, rangeWidth, kind })), ',');
}

/**
 * A Verilog module's header, ANSI style: `module name (`, the ports' lines, `);` (`module name #(`, its parameters,
 * `) (` with parameters). A parameter is { name, value, type } (type optional: `parameter integer N = 8`);
 * alignParams pads their names, paramIndent indents them. inline: the whole header on one line, `module name (a, b);`
 * (`module name;` with no port), its parameters' clause `paramClause` as written (`#(parameter N = 1) `, its space
 * after it) before the ports. The port options are vlogPortLines'.
 */
export function vlogModule(name, { params = [], ports = [], indent = '  ', paramIndent = indent, alignParams = false, align = false,
  dirWidth = 0, kind = '', inline = false, paramClause = '' } = {}) {
  if (inline) {
    if (!ports.length && !paramClause) return [`module ${name};`];
    return [`module ${name} ${paramClause}(${ports.map((p) => vlogPort(p, { dirWidth, kind })).join(', ')});`];
  }
  const L = [];
  if (params.length) {
    const pw = alignParams ? longest(params.map((g) => g.name)) : 0;
    L.push(`module ${name} #(`, ...separated(params.map((g) => `${paramIndent}parameter ${g.type ? `${g.type} ` : ''}${g.name.padEnd(pw)} = ${g.value}`), ','), ') (');
  } else L.push(`module ${name} (`);
  L.push(...vlogPortLines(ports, { indent, align, dirWidth, kind }), ');');
  return L;
}

/** Ports of a width, { name, dir: in / out, w } (the C generators'), as the VHDL emitters take them: of type vhdlType(w). */
export const vhdlWidthPorts = (ports) => ports.map((p) => ({ name: p.name, dir: p.dir, type: vhdlType(p.w) }));

/** Ports of a width, as vhdlWidthPorts', as the Verilog emitters take them: an input or else an output, of range vlogRange(w). */
export const vlogWidthPorts = (ports) => ports.map((p) => ({ name: p.name, dir: p.dir === 'in' ? 'in' : 'out', width: p.w }));
