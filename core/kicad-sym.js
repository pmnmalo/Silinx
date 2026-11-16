// KiCad's symbol libraries (#4279, #4278): a `.kicad_sym` file (KiCad 6 and later,
// https://dev-docs.kicad.org/en/file-formats/sexpr-symbol-lib/) or a `.kicad_symdir` folder (KiCad 10's official
// libraries: one symbol per file), read into their symbols: each one's properties (Value, Datasheet, Description,
// ki_keywords, ki_fp_filters, any other), its units and body styles, its pins (number, name, electrical type, graphic
// style, place) and its graphics, a derived symbol (`extends`) resolved from its parent. A symbol's own sub-symbols are
// named NAME_U_B: unit U (0: common to every unit), body style B (0: both, 1: normal, 2: De Morgan). Symbols only: no
// logic (KiCad's parts have none; their SPICE fields, Sim.*, are properties as any other). The circuit editor's parts
// are made from them by phase 2. Isomorphic module.
import { parseSexpr, head, all, one, num, flag } from './sexpr.js';

/** The latest file version this reader was written against (KiCad 10's). */
export const KICAD_SYM_VERSION = 20251024;
/** A pin's electrical types, as KiCad writes them. */
export const PIN_TYPES = ['input', 'output', 'bidirectional', 'tri_state', 'passive', 'free', 'unspecified', 'power_in', 'power_out',
  'open_collector', 'open_emitter', 'no_connect'];
/** A pin's graphic styles. */
export const PIN_STYLES = ['line', 'inverted', 'clock', 'inverted_clock', 'input_low', 'clock_low', 'output_low', 'edge_clock_high', 'non_logic'];
const MAX_EXTENDS = 16;   // (a chain of derived symbols longer than this is a loop)

const at = (l) => { const a = one(l, 'at'); return { x: num(a?.[1]), y: num(a?.[2]), rot: num(a?.[3]) }; };
const xy = (l) => ({ x: num(l?.[1]), y: num(l?.[2]) });
const pts = (l) => all(one(l, 'pts'), 'xy').map(xy);

/** A pin's name as text: KiCad's '~' is no name; '~{RST}' is RST overlined (active low: `low`). */
export function pinText(name) {
  const s = String(name ?? '');
  if (s === '~') return { text: '', low: false };
  const m = /^~\{(.*)\}$/.exec(s);
  return m ? { text: m[1], low: true } : { text: s, low: false };
}

function readPin(l, unit, body, warnings, symbol) {
  const [, type, style] = l;
  const name = one(l, 'name'), number = one(l, 'number');
  if (!PIN_TYPES.includes(type)) warnings.push(`${symbol}: pin ${number?.[1] ?? '?'} has an unknown electrical type '${type}', read as unspecified`);
  const p = at(l);
  return { number: String(number?.[1] ?? ''), name: String(name?.[1] ?? ''), type: PIN_TYPES.includes(type) ? type : 'unspecified',
    style: PIN_STYLES.includes(style) ? style : 'line', unit, body, x: p.x, y: p.y, rot: p.rot, length: num(one(l, 'length')?.[1]), hidden: flag(l, 'hide'),
    alternates: all(l, 'alternate').map((a) => ({ name: String(a[1] ?? ''), type: a[2], style: a[3] })) };
}

function readGraphic(l, unit, body) {
  const kind = head(l), fill = one(one(l, 'fill'), 'type')?.[1] ?? 'none', g = { kind, unit, body, fill };
  switch (kind) {
    case 'rectangle': return { ...g, start: xy(one(l, 'start')), end: xy(one(l, 'end')) };
    case 'circle': return { ...g, center: xy(one(l, 'center')), radius: num(one(l, 'radius')?.[1]) };
    case 'arc': return { ...g, start: xy(one(l, 'start')), mid: xy(one(l, 'mid')), end: xy(one(l, 'end')) };
    case 'polyline': case 'bezier': return { ...g, pts: pts(l) };
    case 'text': { const p = at(l); return { ...g, text: String(l[1] ?? ''), x: p.x, y: p.y, rot: p.rot }; }
    default: return null;
  }
}

/** One top-level `(symbol …)` of a library, its `extends` not resolved yet. */
function readSymbol(l, warnings) {
  const name = String(l[1] ?? '');
  if (!name) throw new Error('a symbol with no name');
  const properties = {};
  for (const p of all(l, 'property')) properties[String(p[1] ?? '')] = String(p[2] ?? '');
  const pinNames = one(l, 'pin_names'), pinNumbers = one(l, 'pin_numbers');
  const power = one(l, 'power');
  const s = { name, extends: one(l, 'extends')?.[1] ?? null, properties,
    power: power ? (power[1] === 'local' ? 'local' : 'global') : null,
    demorgan: one(l, 'body_styles')?.[1] === 'demorgan', unitNames: {}, pins: [], graphics: [],
    hidePinNames: flag(pinNames, 'hide'), hidePinNumbers: flag(pinNumbers, 'hide'), excludeFromSim: one(l, 'exclude_from_sim')?.[1] === 'yes' };
  for (const sub of all(l, 'symbol')) {
    const m = /_(\d+)_(\d+)$/.exec(String(sub[1] ?? ''));
    if (!m) { warnings.push(`${name}: a unit named '${sub[1]}' not named ${name}_U_B (U its unit, B its body style), left out`); continue; }
    const unit = Number(m[1]), body = Number(m[2]);
    if (body === 2) s.demorgan = true;
    const un = one(sub, 'unit_name');
    if (un) s.unitNames[unit] = String(un[1] ?? '');
    for (const x of sub.slice(2)) {
      if (head(x) === 'pin') s.pins.push(readPin(x, unit, body, warnings, name));
      else if (Array.isArray(x)) { const g = readGraphic(x, unit, body); if (g) s.graphics.push(g); }
    }
  }
  return s;
}

/**
 * A library's text read: { version, generator, symbols, warnings } (its symbols as written, `extends` not resolved:
 * resolveSymbols). Throws on a text that is not a KiCad 6+ symbol library.
 */
export function readKicadSymbols(text, limits) {
  const s = String(text ?? '');
  if (/^\s*EESchema-LIBRARY\b/.test(s)) throw new Error('a KiCad 5 symbol library (.lib): open it in KiCad 6 or later and save it as a .kicad_sym');
  const top = parseSexpr(s, limits);
  if (top.length !== 1 || head(top[0]) !== 'kicad_symbol_lib') throw new Error('not a KiCad symbol library: it does not start with (kicad_symbol_lib');
  const lib = top[0], warnings = [];
  const version = num(one(lib, 'version')?.[1], NaN);
  if (!Number.isInteger(version)) throw new Error('a KiCad symbol library with no (version …)');
  if (version > KICAD_SYM_VERSION) warnings.push(`the library's version ${version} is newer than ${KICAD_SYM_VERSION}, the latest this reader knows: some of its contents may be left out`);
  const symbols = all(lib, 'symbol').map((x) => readSymbol(x, warnings));
  return { version, generator: String(one(lib, 'generator')?.[1] ?? ''), symbols, warnings };
}

/** The highest unit of a symbol's pins and graphics (1 when it has only common ones). */
const unitCount = (s) => Math.max(1, ...s.pins.map((p) => p.unit), ...s.graphics.map((g) => g.unit));

/**
 * The symbols with their `extends` resolved: a derived symbol gets its parent's pins, graphics, units, body styles and
 * flags, its parent's properties overridden by its own; and each symbol its `units` count. Throws on a parent missing,
 * a loop or two symbols of the same name.
 */
export function resolveSymbols(symbols) {
  const byName = new Map();
  for (const s of symbols) {
    if (byName.has(s.name)) throw new Error(`two symbols named '${s.name}'`);
    byName.set(s.name, s);
  }
  const root = (s) => {
    let r = s;
    for (let k = 0; r.extends; k++) {
      if (k >= MAX_EXTENDS) throw new Error(`'${s.name}' extends a loop of symbols`);
      const p = byName.get(r.extends);
      if (!p) throw new Error(`'${r.name}' extends '${r.extends}', which is not in the library`);
      r = p;
    }
    return r;
  };
  const props = (s) => (s.extends ? { ...props(byName.get(s.extends)), ...s.properties } : { ...s.properties });
  return symbols.map((s) => {
    const r = root(s);
    const out = s === r ? { ...s, properties: { ...s.properties } }
      : { ...s, properties: props(s), power: r.power, demorgan: r.demorgan, unitNames: r.unitNames, pins: r.pins, graphics: r.graphics,
        hidePinNames: r.hidePinNames, hidePinNumbers: r.hidePinNumbers };
    return { ...out, units: unitCount(out) };
  });
}

/** A `.kicad_sym` file read, its symbols resolved: { version, generator, symbols, warnings }. */
export function readKicadSymLib(text, limits) {
  const lib = readKicadSymbols(text, limits);
  return { ...lib, symbols: resolveSymbols(lib.symbols) };
}

/**
 * A `.kicad_symdir` folder read: `files` its files ([{ name, text }]: its `.kicad_sym` ones, each one symbol or more; a
 * derived symbol's parent may be in another of them), its symbols resolved together. { version (the highest), symbols,
 * warnings (each one after its file's name) }. Files that are not `.kicad_sym` are left out.
 */
export function readKicadSymDir(files, limits) {
  const symbols = [], warnings = [];
  let version = 0;
  for (const f of files || []) {
    if (!/\.kicad_sym$/i.test(f.name)) continue;
    let lib;
    try { lib = readKicadSymbols(f.text, limits); } catch (e) { throw new Error(`${f.name}: ${e.message}`); }
    version = Math.max(version, lib.version);
    symbols.push(...lib.symbols);
    warnings.push(...lib.warnings.map((w) => `${f.name}: ${w}`));
  }
  return { version, symbols: resolveSymbols(symbols), warnings };
}

/** A symbol's pins of `unit` (and the common ones, unit 0) and of `body` (and both, 0): its normal body by default. */
export const unitPins = (s, unit, body = 1) => s.pins.filter((p) => (p.unit === unit || p.unit === 0) && (p.body === body || p.body === 0));

/** A symbol's footprint filters (ki_fp_filters: globs separated by spaces). */
export const footprintFilters = (s) => String(s.properties.ki_fp_filters ?? '').split(/\s+/).filter(Boolean);
