// A project's KiCad parts (#4280, #4278, docs/CIRCUITS.md): the KiCad symbol libraries of its parts/ folder (a
// .kicad_sym, a .kicad_symdir folder; their footprints in .pretty folders) are its circuits' parts, kept as KiCad
// wrote them: nothing converted is stored. Each symbol is a part, its type its library's path and its name
// (parts/gates.kicad_sym#74HC00), read again (core/kicad-sym.js, core/kicad-mod.js) whenever a circuit is. KiCad's parts
// have no logic: a symbol behaves as a part of Silinx's library when
//   - its property Silinx.Model names it (written in the file: KiCad keeps a property it does not know), or
//   - its part number is one of the library's (SN74LS00N, 74HC00, CD4011BE: the 7400, the 4011);
// and its pins are that part's, pin by pin (their numbers and directions); it is then that part, its pins in the
// library part's places, under its own name (its Value), datasheet and source. Silinx.Family ('ttl' / 'cmos') makes
// its inputs read as that family's. Any other symbol is drawn only: its pins in its footprint's places on the 0.1 inch
// grid (a .kicad_mod of the project, else its footprint's name: DIP-14_W7.62mm, PinHeader_1x04_P2.54mm), not
// simulated, its pins driving nothing. A symbol with no through-hole footprint is no part: it does not plug into a
// breadboard. Silinx.Footprint gives a symbol a footprint its file has not (a breakout's). Silinx.Source, Silinx.Author
// and Silinx.Licence say where it comes from. Isomorphic module.
import { PARTS, setProjectParts } from './circuit-parts.js';
import { dip } from './circuit-ics.js';
import { readKicadSymLib, readKicadSymDir, pinText, footprintFilters } from './kicad-sym.js';
import { readKicadFootprint, gridPins, packageOfFootprint } from './kicad-mod.js';

const LIB_RE = /^parts\/[^/]+\.kicad_sym$/i, DIR_FILE_RE = /^(parts\/[^/]+\.kicad_symdir)\/[^/]+\.kicad_sym$/i, FP_RE = /^parts\/([^/]+)\.pretty\/([^/]+)\.kicad_mod$/i;
/** Whether a project's file is one of its KiCad parts' files (a library, a symbol of a folder, a footprint). */
export const isKicadPartFile = (path) => LIB_RE.test(path) || DIR_FILE_RE.test(path) || FP_RE.test(path);
/** A project part's type: its library's path and its symbol's name. */
export const kicadPartType = (lib, symbol) => `${lib}#${symbol}`;

// ------------------------------------------------------------------ a part number
const SERIES74 = /^(?:SN|DM|MC|HD|MM|CD|IN|N)?(?:74|54)(?:ALVC|AHCT|ALS|AHC|ABT|ACT|HCT|HCU|LVC|AC|AS|HC|LS|LV|F|S|H|L|C)?(\d{2,4})(?:[A-Z][A-Z0-9-]*)?$/;
const SERIES4000 = /^(?:CD|HEF|MC1|MC|TC|NTE)?(4\d{3})(?:[A-Z][A-Z0-9-]*)?$/;
/** The library part a part number is (SN74LS00N, 74HC00, CD4011BE → '7400', '4011'), or null. */
export function partOfNumber(number) {
  const s = String(number ?? '').trim().toUpperCase().replace(/^[^:]*:/, '');
  const m = SERIES74.exec(s), c = !m && SERIES4000.exec(s);
  const type = m ? `74${m[1]}` : c ? c[1] : null;
  return type && PARTS[type]?.kind === 'ic' ? type : null;
}

// ------------------------------------------------------------------ the pins
const VCC_NAMES = /^(?:VCC|VDD|V\+|VS|VCC\d|VDD\d|\+?5V|\+?3V3|\+?3\.3V|VIN)$/i, GND_NAMES = /^(?:GND|VSS|V-|0V|AGND|DGND|GND\d|VEE)$/i;
/** A KiCad pin's direction in Silinx: in, out, oc, vcc, gnd, nc, or null (one Silinx has no logic for). */
export function pinDirection(p) {
  const name = pinText(p.name).text;
  switch (p.type) {
    case 'input': return 'in';
    case 'output': return 'out';
    case 'open_collector': return 'oc';
    case 'no_connect': return 'nc';
    case 'power_in': return VCC_NAMES.test(name) ? 'vcc' : GND_NAMES.test(name) ? 'gnd' : null;
    default: return null;
  }
}
// (a passive or unspecified pin says nothing of its direction: it fits any; a no-connect pin fits an unused one)
// (a 3-state output fits an output of the library, as the 74595's, #4285)
const fits = (kicad, silinx) => kicad.type === 'passive' || kicad.type === 'unspecified' || kicad.type === 'free' || pinDirection(kicad) === silinx
  || (kicad.type === 'tri_state' && silinx === 'out');

/** A symbol's pins, each once (its normal body's; every unit's): [{ number, name, type, … }]. */
export function symbolPins(s) {
  const seen = new Map();
  for (const p of s.pins) if (p.body !== 2 && !seen.has(p.number)) seen.set(p.number, p);
  return [...seen.values()];
}

/** Why a symbol's pins are not the library part `type`'s (its first difference), or null when they are. */
export function pinoutDifference(s, type) {
  const d = PARTS[type], pins = symbolPins(s);
  const mine = new Map(pins.map((p) => [p.number, p]));
  for (const q of d.pins) {
    const p = mine.get(String(q.n));
    if (!p) { if (q.dir !== 'nc') return `its pin ${q.n} is missing (the ${type}'s ${q.name})`; continue; }
    if (!fits(p, q.dir)) return `its pin ${q.n} (${pinText(p.name).text || 'no name'}) is ${p.type}, the ${type}'s pin ${q.n} (${q.name}) ${q.dir}`;
  }
  const extra = pins.find((p) => !d.pins.some((q) => String(q.n) === p.number));
  return extra ? `its pin ${extra.number} is not one of the ${type}'s ${d.pins.length}` : null;
}

// ------------------------------------------------------------------ the places on the grid
// (KiCad's footprints are drawn with pin 1 at the top left, its rows down: turned a quarter turn, as Silinx's DIP
// lies, pin 1 at the lower left and the rows along the breadboard)
const turned = ({ dx, dy }) => ({ dx: dy, dy: -dx || 0 });

/** A footprint's name the symbol has: Silinx.Footprint's, else its Footprint property's (null: none). */
const footprintName = (s) => s.properties['Silinx.Footprint'] || s.properties.Footprint || null;

/**
 * The places of a drawn part's pins: { places: Map(number → { dx, dy }), dip? } or { error }. From its footprint's file
 * among `footprints` (Map of 'Lib:Name' and 'Name' → parsed .kicad_mod), else its footprint's name, else its footprint
 * filters (a DIP of 7.62 mm whose pins are as many as the symbol's).
 */
export function pinPlaces(s, footprints = new Map()) {
  const pins = symbolPins(s), name = footprintName(s);
  // (a library the PCM installed is named PCM_<its name> in KiCad's table, #4285)
  const fp = name && (footprints.get(name) ?? footprints.get(name.replace(/^PCM_/, '')) ?? footprints.get(name.replace(/^[^:]*:/, '')));
  if (fp) {
    const g = gridPins(fp);
    if (!g.pins.length) return { error: g.smd.length ? `its footprint ${fp.name} is surface-mount: it does not plug into a breadboard` : `its footprint ${fp.name} has no pad 1 through the board` };
    const at = new Map(g.pins.map((p) => [p.number, turned(p)]));
    const off = pins.find((p) => !at.has(p.number));
    if (off) return { error: g.offGrid.includes(off.number) ? `its pin ${off.number}'s pad is off the 0.1 inch grid` : `its pin ${off.number} has no pad in its footprint ${fp.name}` };
    return { places: at };
  }
  let pkg = name ? packageOfFootprint(name) : null;
  if (!pkg && !name) {
    // (no footprint named: a DIP filter, DIP*W7.62mm*, as many pins as its highest number, made even)
    const f = footprintFilters(s).find((x) => /^\*?DIP\*?/i.test(x) && /W7\.62mm/i.test(x));
    const n = Math.max(pins.length, ...pins.map((p) => Number(p.number)).filter(Number.isInteger));
    if (f && pins.every((p) => /^\d+$/.test(p.number))) pkg = { kind: 'dip', pins: n + (n % 2), rows: 3 };
  }
  if (!pkg) return { error: name ? `its footprint ${name} is not in the project's parts nor a DIP or a pin header` : 'it has no footprint: give it Silinx.Footprint (DIP-14_W7.62mm, PinHeader_1x04_P2.54mm)' };
  if (pkg.kind === 'smd') return { error: `its footprint ${name} is surface-mount: it does not plug into a breadboard` };
  if (pkg.kind === 'header' && pkg.pitch !== 2.54) return { error: `its footprint ${name}'s pins are ${pkg.pitch} mm apart, not a breadboard's 2.54` };
  const count = pkg.kind === 'dip' ? pkg.pins : pkg.rows * pkg.cols;
  const kicadAt = (k) => (pkg.kind === 'dip' ? null : pkg.rows === 1 ? { dx: 0, dy: k - 1 } : { dx: (k - 1) % pkg.rows, dy: Math.floor((k - 1) / pkg.rows) });
  const at = new Map();
  for (let k = 1; k <= count; k++) at.set(String(k), pkg.kind === 'dip' ? dip(count, pkg.rows)(k) : turned(kicadAt(k)));
  const off = pins.find((p) => !at.has(p.number));
  if (off) return { error: `its pin ${off.number} is not one of its footprint ${name ?? `DIP-${count}`}'s ${count}` };
  return { places: at, ...(pkg.kind === 'dip' ? { dip: count } : {}) };
}

// ------------------------------------------------------------------ a symbol made a part
/** What a project part says of its KiCad origin: its file, its symbol and properties, its source. */
function originOf(lib, s) {
  const p = s.properties, v = (k) => (p[k] ? String(p[k]) : undefined);
  return Object.fromEntries(Object.entries({ library: lib, symbol: s.name, value: v('Value') ?? s.name, description: v('Description'), datasheet: v('Datasheet'),
    keywords: v('ki_keywords'), footprint: v('Silinx.Footprint') ?? v('Footprint'), source: v('Silinx.Source'), author: v('Silinx.Author'), licence: v('Silinx.Licence') })
    .filter(([, x]) => x !== undefined && x !== '' && x !== '~'));
}

// (an HDL name made of a part number: 74HC00 → 74hc00; its entity is <circuit>_74hc00)
const hdlChip = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'part';

/**
 * A symbol of the library `lib` (its path) made a part: { def, note? } or { error } (a symbol that is no part, and why).
 * note: what the part's reading says (a part number matched whose pins are not the library part's: drawn only).
 */
function kicadPartDef(lib, s, footprints) {
  const origin = originOf(lib, s), type = kicadPartType(lib, s.name), title = origin.description || origin.value;
  const named = s.properties['Silinx.Model'];
  if (named && PARTS[named]?.kind !== 'ic') return { error: `its Silinx.Model '${named}' is not an IC of the library` };
  const model = named || partOfNumber(origin.value) || partOfNumber(s.name);
  let unlike = null;   // (a part number matched whose pins are not the library part's)
  if (model) {
    const why = pinoutDifference(s, model);
    if (!why) {
      const fam = s.properties['Silinx.Family'];
      if (fam && fam !== 'ttl' && fam !== 'cmos') return { error: `its Silinx.Family '${fam}' is neither ttl nor cmos` };
      const base = PARTS[model], other = fam && fam !== base.family;
      return { def: { ...base, type, kicad: origin, behaves: model, how: named ? 'Silinx.Model' : 'part number',
        // (another family's inputs: an entity of its own in the HDL, named after the part)
        ...(other ? { family: fam, chip: hdlChip(origin.value) } : {}) } };
    }
    if (named) return { error: `its Silinx.Model is ${model} but ${why}` };
    unlike = `its part number is the ${model}'s but ${why}`;
  }
  const at = pinPlaces(s, footprints);
  if (at.error) return { error: unlike ? `${unlike}, and ${at.error}` : at.error };
  const pins = symbolPins(s).map((p) => ({ n: Number.isInteger(Number(p.number)) ? Number(p.number) : p.number, name: pinText(p.name).text || p.number, dir: 'none',
    kicadType: p.type, ...at.places.get(p.number) })).sort((a, b) => String(a.n).localeCompare(String(b.n), 'en', { numeric: true }));
  return { def: { type, title, kind: 'drawn', pins, kicad: origin, behaves: null, ...(at.dip ? { dip: at.dip } : {}) }, ...(unlike ? { note: `${s.name}: ${unlike}: drawn only` } : {}) };
}

/**
 * A project's KiCad parts from its files (`files`: { path: text } of its parts/ folder; the others left out): { defs
 * (their descriptions, for setProjectParts), skipped: [{ type, reason }] (the symbols that are no part), notes (the
 * readers' warnings and the parts' notes), errors: [the files not read, and why] }. Power symbols (VCC, GND) are left
 * out: a circuit has its supply.
 */
export function kicadPartsOf(files = {}) {
  const libs = new Map(), footprints = new Map(), errors = [], notes = [], defs = [], skipped = [];
  for (const [path, text] of Object.entries(files)) {
    const fp = FP_RE.exec(path), inDir = DIR_FILE_RE.exec(path);
    if (fp) {
      try { const f = readKicadFootprint(text); footprints.set(`${fp[1]}:${fp[2]}`, f); if (!footprints.has(fp[2])) footprints.set(fp[2], f); } catch (e) { errors.push(`${path}: ${e.message}`); }
    } else if (inDir) (libs.get(inDir[1]) ?? libs.set(inDir[1], []).get(inDir[1])).push({ name: path.slice(inDir[1].length + 1), text });
    else if (LIB_RE.test(path)) libs.set(path, text);
  }
  for (const [lib, src] of [...libs].sort(([a], [b]) => a.localeCompare(b))) {
    let read;
    try { read = typeof src === 'string' ? readKicadSymLib(src) : readKicadSymDir(src); } catch (e) { errors.push(`${lib}: ${e.message}`); continue; }
    notes.push(...read.warnings.map((w) => `${lib}: ${w}`));
    for (const s of read.symbols) {
      if (s.power) continue;
      const r = kicadPartDef(lib, s, footprints);
      if (r.error) skipped.push({ type: kicadPartType(lib, s.name), reason: r.error });
      else { defs.push(r.def); if (r.note) notes.push(`${lib}: ${r.note}`); }
    }
  }
  return { defs, skipped, notes, errors };
}

/**
 * A project's KiCad parts read and set (setProjectParts), the project's files read through `P` (the server's
 * projects or the browser's store: fileTree, readFile): kicadPartsOf's result.
 */
export async function useProjectParts(P, name) {
  const files = {};
  for (const f of (await P.fileTree(name)).filter(isKicadPartFile)) { try { files[f] = await P.readFile(name, f); } catch { /* unreadable */ } }
  const r = kicadPartsOf(files);
  setProjectParts(r.defs);
  return r;
}
