// Silinx's parts in KiCad's formats (#4282, #4278): the library's ICs written as a KiCad symbol library (.kicad_sym,
// https://dev-docs.kicad.org/en/file-formats/sexpr-symbol-lib/), each one's behaviour in its properties (Silinx.Model,
// Silinx.Family) so that Silinx reads it back as that IC (core/circuit-kicad.js); and a project's KiCad parts (its
// parts/ folder, already KiCad's files) with those ICs as a KiCad Plugin and Content Manager package (a zip:
// metadata.json, symbols/, footprints/; https://dev-docs.kicad.org/en/addons/). A gate IC has a unit per gate and a
// unit of its supply pins, an MSI or sequential IC one unit; its pins on a 2.54 mm grid, inputs on the left, outputs on
// the right, the supply above and below; its footprint KiCad's DIP-n_W7.62mm. Written at KiCad 9's file version, which
// KiCad 9 and 10 read. Its generator is Silinx's own (the format's rule: never kicad_symbol_editor). Isomorphic module.
import { PARTS, PART_ORDER } from './circuit-parts.js';
import { quote } from './kicad-edit.js';
import { createZip } from './zip.js';
import { VERSION } from './version.js';

export const EXPORT_VERSION = 20241209;
const G = 2.54, BAR = '̅';
/** The library's ICs, the ones exported: their types in the library's order. */
export const EXPORTED_ICS = PART_ORDER.filter((t) => PARTS[t].kind === 'ic');

const mm = (v) => String(Math.round(v * 100) / 100);
const effects = (hide) => `(effects (font (size 1.27 1.27))${hide ? ' (hide yes)' : ''})`;
const prop = (k, v, hide = true, y = 0) => `(property ${quote(k)} ${quote(v)} (at 0 ${mm(y)} 0) ${effects(hide)})`;
const TYPE = { in: 'input', out: 'output', oc: 'open_collector', vcc: 'power_in', gnd: 'power_in', nc: 'no_connect' };
/** A Silinx pin's name as KiCad writes it: an active low one (its overbar) ~{NAME}. */
export const kicadPinName = (name) => (String(name).includes(BAR) ? `~{${String(name).replaceAll(BAR, '')}}` : String(name));
const pinOf = (p, x, y, rot, types = TYPE) => `(pin ${types[p.dir]} line (at ${mm(x)} ${mm(y)} ${rot}) (length ${mm(G)}) (name ${quote(kicadPinName(p.name))} ${effects()}) (number ${quote(String(p.n))} ${effects()}))`;
const box = (w, h) => `(rectangle (start ${mm(-w)} ${mm(h)}) (end ${mm(w)} ${mm(-h)}) (stroke (width 0.254) (type default)) (fill (type background)))`;

// a unit of pins: inputs on the left, outputs on the right, each column centred, a box between
function unit(name, k, ins, outs, types = TYPE) {
  const rows = Math.max(ins.length, outs.length, 1), h = (rows * G) / 2 + G / 2, w = 2 * G;
  const col = (list, x, rot) => list.map((p, i) => pinOf(p, x, ((list.length - 1) / 2 - i) * G, rot, types));
  return `(symbol ${quote(`${name}_${k}_1`)} ${box(w, h)} ${[...col(ins, -w - G, 0), ...col(outs, w + G, 180)].join(' ')})`;
}
// the supply's unit (a gate IC's last; an MSI's pins on its one): VCC above, GND below
const supplyPins = (pins, h, types = TYPE) => [...pins.filter((p) => p.dir === 'vcc').map((p) => pinOf(p, 0, h + G, 270, types)), ...pins.filter((p) => p.dir === 'gnd').map((p) => pinOf(p, 0, -h - G, 90, types))];

/** The library IC `type` as a KiCad symbol: its `(symbol …)` text, named after its chip (SN74LS00). */
export function icSymbol(type) {
  const d = PARTS[type];
  if (d?.kind !== 'ic') throw new Error(`'${type}' is not an IC of the library`);
  const name = d.chip, pin = new Map(d.pins.map((p) => [p.n, p]));
  // (its rows apart: a 24-pin DIP 0.6 inch wide, the 74154's, #4397)
  const w = partFootprintName(type).replace(/^.*_W([\d.]+)mm$/, '$1');
  const props = [prop('Reference', 'U', false, 1.27), prop('Value', d.chip, false, -1.27), prop('Footprint', `Package_DIP:DIP-${d.dip}_W${w}mm`), prop('Datasheet', ''),
    prop('Description', d.title), prop('ki_keywords', `${d.family === 'ttl' ? 'TTL 74LS' : 'CMOS 4000'} ${type}`), prop('ki_fp_filters', `DIP*W${w}mm*`),
    prop('Silinx.Model', type), prop('Silinx.Family', d.family), prop('Silinx.Source', `Silinx ${VERSION} library`)];
  let units;
  if (d.gates) {
    // (a three-state buffer's enables, #4397: on its unit's inputs' side, each shared enable on the first unit it serves)
    const seen = new Set();
    units = d.gates.map((g, i) => unit(name, i + 1, [...g.ins, ...(g.en || []).map(([n]) => n).filter((n) => !seen.has(n) && seen.add(n))].map((n) => pin.get(n)), [pin.get(g.out)]));
    units.push(`(symbol ${quote(`${name}_${d.gates.length + 1}_1`)} ${box(2 * G, 2 * G)} ${supplyPins(d.pins, 2 * G).join(' ')})`);
  } else {
    const ins = d.pins.filter((p) => p.dir === 'in'), outs = d.pins.filter((p) => p.dir === 'out' || p.dir === 'oc');
    const h = (Math.max(ins.length, outs.length, 1) * G) / 2 + G / 2;
    units = [unit(name, 1, ins, outs).replace(/\)$/, ` ${supplyPins(d.pins, h).join(' ')})`)];
  }
  return `(symbol ${quote(name)} (pin_names (offset 1.016)) (exclude_from_sim no) (in_bom yes) (on_board yes)\n\t\t${props.join('\n\t\t')}\n\t\t${units.join('\n\t\t')}\n\t)`;
}

/** A KiCad symbol library of the library's ICs `types` (all of them by default): its text. */
export function icLibrary(types = EXPORTED_ICS) {
  const bad = types.find((t) => PARTS[t]?.kind !== 'ic');
  if (bad != null) throw new Error(`'${bad}' is not an IC of the library (its ICs: ${EXPORTED_ICS.join(', ')})`);
  if (!types.length) throw new Error('no IC chosen');
  return libraryText([...new Set(types)].map(icSymbol));
}
const libraryText = (symbols) => `(kicad_symbol_lib\n\t(version ${EXPORT_VERSION})\n\t(generator "silinx")\n\t(generator_version ${quote(VERSION)})\n\t${symbols.join('\n\t')}\n)\n`;

const ID_RE = /^[a-zA-Z0-9-]{1,50}(\.[a-zA-Z0-9-]{1,50})+$/;
/**
 * A KiCad PCM package of a project's KiCad parts (`files`: { path: text } of its parts/ folder: its .kicad_sym, its
 * .kicad_symdir folders, its .pretty footprints) and, `ics` given, of the library's ICs (symbols/Silinx.kicad_sym), or,
 * `parts` given, of those parts of the library (#4290: symbols/Silinx.kicad_sym and footprints/Silinx.pretty/): the
 * zip's bytes. `meta`: { identifier (reverse DNS), name, description (at most 150 characters), author, licence (an SPDX
 * identifier), version }. Throws on a field the PCM's schema refuses, or nothing to put in it.
 */
export async function partsPackage(files, meta, codec, { ics = null, parts = null } = {}) {
  const m = meta || {};
  if (!ID_RE.test(m.identifier || '')) throw new Error(`identifier: '${m.identifier ?? ''}' is not a reverse domain name of 2 to 50 letters, digits and - each (org.example.parts)`);
  for (const k of ['name', 'author', 'licence', 'version']) if (!String(m[k] ?? '').trim()) throw new Error(`${k}: missing`);
  if (String(m.description ?? '').length > 150) throw new Error('description: at most 150 characters');
  if (!/^\d{1,4}(\.\d{1,4}){0,3}$/.test(m.version)) throw new Error(`version: '${m.version}' is not a version (1, 1.0, 1.2.3)`);
  const entries = [];
  for (const [p, text] of Object.entries(files || {}).sort(([a], [b]) => a.localeCompare(b))) {
    const s = /^parts\/([^/]+\.kicad_sym|[^/]+\.kicad_symdir\/[^/]+\.kicad_sym)$/.exec(p), f = /^parts\/([^/]+\.pretty\/[^/]+\.kicad_mod)$/.exec(p);
    if (s) entries.push({ path: `symbols/${s[1]}`, data: text }); else if (f) entries.push({ path: `footprints/${f[1]}`, data: text });
  }
  // (the library's parts, #4290: their symbols and the footprints of those that are no DIP)
  if (parts) {
    const lib = partsLibrary(parts);
    entries.push({ path: 'symbols/Silinx.kicad_sym', data: lib.symbols }, ...lib.footprints.map((f) => ({ path: `footprints/${FOOTPRINT_LIB}.pretty/${f.name}`, data: f.text })));
  } else if (ics) entries.push({ path: 'symbols/Silinx.kicad_sym', data: icLibrary(ics) });
  if (!entries.length) throw new Error('nothing to package: the project has no KiCad parts (parts/), and no part of the library was chosen');
  const metadata = { $schema: 'https://go.kicad.org/pcm/schemas/v1', name: String(m.name), description: String(m.description || m.name),
    description_full: String(m.descriptionFull || m.description || m.name), identifier: m.identifier, type: 'library', author: { name: String(m.author) }, license: String(m.licence),
    versions: [{ version: m.version, status: 'stable', kicad_version: '7.0' }] };
  return createZip([{ path: 'metadata.json', data: `${JSON.stringify(metadata, null, 2)}\n` }, ...entries], codec);
}

// ------------------------------------------------------------------ the library's other parts (#4290)
// Silinx's whole library in KiCad's format: besides its ICs, every part that has pins (a breadboard has none: it is the
// board, no symbol), named Silinx_<type>, its behaviour named by Silinx.Model. A part laid out as a DIP (a DIP switch, a
// display, an LED bar) has KiCad's DIP footprint; any other one a footprint of Silinx's (Silinx.pretty/Silinx_<type>),
// its pads in its pins' places on the 0.1 inch grid, so that Silinx reads its pins back where they are. Generated from
// the parts' descriptions whenever it is exported, never kept as a file: it is always the running version's library.

/** The library's parts written as KiCad symbols: its ICs and its other parts with pins, in the library's order. */
export const EXPORTED_PARTS = PART_ORDER.filter((t) => PARTS[t].pins.length);
/** The footprint library of the parts that are no DIP (Silinx.pretty). */
export const FOOTPRINT_LIB = 'Silinx';
/** A part's symbol's name: an IC's its chip's (SN74LS00), another part's Silinx_<type>. */
export const symbolName = (type) => (PARTS[type].kind === 'ic' ? PARTS[type].chip : `Silinx_${type}`);
// (a DIP's rows apart, in grid steps: its last pin's)
const dipRows = (d) => -Math.min(...d.pins.map((p) => p.dy));
/** A part's footprint's name: an IC's or a DIP's KiCad's own (Package_DIP:DIP-10_W15.24mm), another one's Silinx's. */
export function partFootprintName(type) {
  const d = PARTS[type];
  // (an IC's DIP-24 0.6 inch wide, the 74154's, #4397)
  return d.dip ? `Package_DIP:DIP-${d.dip}_W${mm(dipRows(d) * G)}mm` : `${FOOTPRINT_LIB}:Silinx_${type}`;
}
// its pins' electrical types (a lamp's pins are a diode's, passive; a supply's its sources) and its references
const OTHER_TYPE = { pass: 'passive', weak: 'passive', in: 'passive', probe: 'input', out: 'output', vcc: 'power_out', gnd: 'power_out' };
const REFERENCE = { button: 'SW', spdt: 'SW', 'logic-switch': 'SW', 'dip-4': 'SW', 'dip-8': 'SW', clock: 'X', 'pull-up': 'R', 'pull-down': 'R', led: 'D',
  'seg7-cc': 'U', 'seg7-ca': 'U', 'led-bar-10': 'BAR', probe: 'TP', supply: 'PS' };

/** A library part that is no IC as a KiCad symbol: its `(symbol …)` text, named Silinx_<type>. */
export function partSymbol(type) {
  const d = PARTS[type];
  if (!d?.pins?.length) throw new Error(`'${type}' is not a part of the library with pins`);
  if (d.kind === 'ic') return icSymbol(type);
  const name = symbolName(type), fp = partFootprintName(type);
  const props = [prop('Reference', REFERENCE[type] ?? 'X', false, 1.27), prop('Value', name, false, -1.27), prop('Footprint', fp), prop('Datasheet', ''),
    prop('Description', d.title), prop('ki_keywords', `Silinx ${type}`), prop('ki_fp_filters', d.dip ? `DIP*W${mm(dipRows(d) * G)}mm*` : `Silinx_${type}*`),
    prop('Silinx.Model', type), prop('Silinx.Source', `Silinx ${VERSION} library`)];
  // (a DIP's pins as its package's: 1 to n/2 down the left, n to n/2 + 1 down the right; else its outputs on the right,
  // its supply above and below, the others on the left)
  const body = d.pins.filter((p) => p.dir !== 'vcc' && p.dir !== 'gnd');
  const right = d.dip ? body.filter((p) => p.n > d.dip / 2).reverse() : body.filter((p) => p.dir === 'out' || p.dir === 'weak');
  const left = body.filter((p) => !right.includes(p));
  const h = (Math.max(left.length, right.length, 1) * G) / 2 + G / 2;
  const u = unit(name, 1, left, right, OTHER_TYPE).replace(/\)$/, `${d.pins.length > body.length ? ` ${supplyPins(d.pins, h, OTHER_TYPE).join(' ')}` : ''})`);
  return `(symbol ${quote(name)} (pin_names (offset 1.016)) (exclude_from_sim no) (in_bom yes) (on_board yes)\n\t\t${props.join('\n\t\t')}\n\t\t${u}\n\t)`;
}

const fpEffects = '(effects (font (size 1 1) (thickness 0.15)))';
/**
 * A library part's footprint of Silinx's (one that is no IC nor DIP): { name (its file's: Silinx_<type>.kicad_mod), text }, its pads on
 * the 2.54 mm grid where its pins are (pad 1 at the origin), its body on F.Fab; null for an IC or a DIP (KiCad's own).
 */
export function partFootprint(type) {
  const d = PARTS[type];
  if (!d?.pins?.length || d.kind === 'ic' || d.dip) return null;
  const name = `Silinx_${type}`;
  // (Silinx's grid turned to KiCad's footprint, as Silinx turns it back, core/circuit-kicad.js: its x KiCad's y, its y KiCad's −x)
  const pads = d.pins.map((p) => ({ n: p.n, x: -p.dy * G || 0, y: p.dx * G || 0 }));
  const xs = pads.map((p) => p.x), ys = pads.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs) - G / 2, Math.max(...xs) + G / 2, Math.min(...ys) - G / 2, Math.max(...ys) + G / 2];
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const shape = (layer, w, grow = 0) => (type === 'led'
    ? `(fp_circle (center ${mm(cx)} ${mm(cy)}) (end ${mm(cx + 2.5 + grow)} ${mm(cy)}) (stroke (width ${w}) (type solid)) (fill none) (layer ${quote(layer)}))`
    : `(fp_rect (start ${mm(x0 - grow)} ${mm(y0 - grow)}) (end ${mm(x1 + grow)} ${mm(y1 + grow)}) (stroke (width ${w}) (type solid)) (fill none) (layer ${quote(layer)}))`);
  const lines = [`(footprint ${quote(name)}`, `(version ${FOOTPRINT_VERSION})`, '(generator "silinx")', `(generator_version ${quote(VERSION)})`, '(layer "F.Cu")',
    `(descr ${quote(`${d.title}: Silinx's library part, its pins on a breadboard's 2.54 mm grid`)})`, `(tags ${quote(`Silinx ${type}`)})`,
    `(property "Reference" "REF**" (at ${mm(cx)} ${mm(y0 - 1.5)} 0) (layer "F.SilkS") ${fpEffects})`,
    `(property "Value" ${quote(name)} (at ${mm(cx)} ${mm(y1 + 1.5)} 0) (layer "F.Fab") ${fpEffects})`,
    '(attr through_hole)', shape('F.Fab', 0.1), shape('F.CrtYd', 0.05, 0.5),
    ...pads.map((p) => `(pad ${quote(String(p.n))} thru_hole ${p.n === 1 ? 'rect' : 'circle'} (at ${mm(p.x)} ${mm(p.y)}) (size 1.6 1.6) (drill 0.8) (layers "*.Cu" "*.Mask"))`)];
  return { name: `${name}.kicad_mod`, text: `${lines[0]}\n\t${lines.slice(1).join('\n\t')}\n)\n` };
}
/** The footprints' file version (KiCad 9's), which KiCad 9 and 10 read. */
export const FOOTPRINT_VERSION = 20241229;

/**
 * Silinx's library in KiCad's format: `types` its parts (all of them with pins by default, EXPORTED_PARTS): { symbols
 * (the .kicad_sym's text), footprints: [{ name, text }] (Silinx.pretty's files: the parts that are no IC nor DIP) }.
 * Throws on a type that is no part of the library with pins, or none.
 */
export function partsLibrary(types = EXPORTED_PARTS) {
  const bad = types.find((t) => !PARTS[t]?.pins?.length);
  if (bad != null) throw new Error(`'${bad}' is not a part of the library with pins (circuit_parts: a breadboard has none)`);
  if (!types.length) throw new Error('no part chosen');
  const list = [...new Set(types)];
  return { symbols: libraryText(list.map(partSymbol)), footprints: list.map(partFootprint).filter(Boolean) };
}
