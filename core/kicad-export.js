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
const pinOf = (p, x, y, rot) => `(pin ${TYPE[p.dir]} line (at ${mm(x)} ${mm(y)} ${rot}) (length ${mm(G)}) (name ${quote(kicadPinName(p.name))} ${effects()}) (number ${quote(String(p.n))} ${effects()}))`;
const box = (w, h) => `(rectangle (start ${mm(-w)} ${mm(h)}) (end ${mm(w)} ${mm(-h)}) (stroke (width 0.254) (type default)) (fill (type background)))`;

// a unit of pins: inputs on the left, outputs on the right, each column centred, a box between
function unit(name, k, ins, outs) {
  const rows = Math.max(ins.length, outs.length, 1), h = (rows * G) / 2 + G / 2, w = 2 * G;
  const col = (list, x, rot) => list.map((p, i) => pinOf(p, x, ((list.length - 1) / 2 - i) * G, rot));
  return `(symbol ${quote(`${name}_${k}_1`)} ${box(w, h)} ${[...col(ins, -w - G, 0), ...col(outs, w + G, 180)].join(' ')})`;
}
// the supply's unit (a gate IC's last; an MSI's pins on its one): VCC above, GND below
const supplyPins = (pins, h) => [...pins.filter((p) => p.dir === 'vcc').map((p) => pinOf(p, 0, h + G, 270)), ...pins.filter((p) => p.dir === 'gnd').map((p) => pinOf(p, 0, -h - G, 90))];

/** The library IC `type` as a KiCad symbol: its `(symbol …)` text, named after its chip (SN74LS00). */
export function icSymbol(type) {
  const d = PARTS[type];
  if (d?.kind !== 'ic') throw new Error(`'${type}' is not an IC of the library`);
  const name = d.chip, pin = new Map(d.pins.map((p) => [p.n, p]));
  const props = [prop('Reference', 'U', false, 1.27), prop('Value', d.chip, false, -1.27), prop('Footprint', `Package_DIP:DIP-${d.dip}_W7.62mm`), prop('Datasheet', ''),
    prop('Description', d.title), prop('ki_keywords', `${d.family === 'ttl' ? 'TTL 74LS' : 'CMOS 4000'} ${type}`), prop('ki_fp_filters', 'DIP*W7.62mm*'),
    prop('Silinx.Model', type), prop('Silinx.Family', d.family), prop('Silinx.Source', `Silinx ${VERSION} library`)];
  let units;
  if (d.gates) {
    units = d.gates.map((g, i) => unit(name, i + 1, g.ins.map((n) => pin.get(n)), [pin.get(g.out)]));
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
  return `(kicad_symbol_lib\n\t(version ${EXPORT_VERSION})\n\t(generator "silinx")\n\t(generator_version ${quote(VERSION)})\n\t${[...new Set(types)].map(icSymbol).join('\n\t')}\n)\n`;
}

const ID_RE = /^[a-zA-Z0-9-]{1,50}(\.[a-zA-Z0-9-]{1,50})+$/;
/**
 * A KiCad PCM package of a project's KiCad parts (`files`: { path: text } of its parts/ folder: its .kicad_sym, its
 * .kicad_symdir folders, its .pretty footprints) and, `ics` given, of the library's ICs (symbols/Silinx.kicad_sym): the
 * zip's bytes. `meta`: { identifier (reverse DNS), name, description (at most 150 characters), author, licence (an SPDX
 * identifier), version }. Throws on a field the PCM's schema refuses, or nothing to put in it.
 */
export async function partsPackage(files, meta, codec, { ics = null } = {}) {
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
  if (ics) entries.push({ path: 'symbols/Silinx.kicad_sym', data: icLibrary(ics) });
  if (!entries.length) throw new Error('nothing to package: the project has no KiCad parts (parts/), and no IC of the library was chosen');
  const metadata = { $schema: 'https://go.kicad.org/pcm/schemas/v1', name: String(m.name), description: String(m.description || m.name),
    description_full: String(m.descriptionFull || m.description || m.name), identifier: m.identifier, type: 'library', author: { name: String(m.author) }, license: String(m.licence),
    versions: [{ version: m.version, status: 'stable', kicad_version: '7.0' }] };
  return createZip([{ path: 'metadata.json', data: `${JSON.stringify(metadata, null, 2)}\n` }, ...entries], codec);
}
