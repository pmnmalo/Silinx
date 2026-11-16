// KiCad's footprints (#4279, #4278): a `.kicad_mod` file (one footprint; a `.pretty` folder is a library of them,
// https://dev-docs.kicad.org/en/file-formats/sexpr-footprint/; KiCad 5's `(module …)` too), read into its pads, so that a
// through-hole part's pins get their places on a breadboard's 0.1 inch grid; and a footprint's name (KiCad's library
// convention: DIP-14_W7.62mm, PinHeader_1x04_P2.54mm_Vertical, SOIC-14_3.9x8.7mm_P1.27mm) read as a package, for a
// symbol whose footprint file is not at hand. Its 3D models are only named (Silinx draws its parts its own way).
// Isomorphic module.
import { parseSexpr, head, all, one, num } from './sexpr.js';

export const GRID_MM = 2.54;
const TOLERANCE_MM = 0.01;   // (a pad this close to a grid point is on it: KiCad's coordinates are rounded to 1 µm)
export const PAD_TYPES = ['thru_hole', 'smd', 'connect', 'np_thru_hole'];

/** A `.kicad_mod` file read: { name, version, attr ('through_hole' | 'smd' | ''), description, tags, pads, models }. */
export function readKicadFootprint(text, limits) {
  const top = parseSexpr(text, limits);
  const fp = top[0];
  if (top.length !== 1 || (head(fp) !== 'footprint' && head(fp) !== 'module')) throw new Error('not a KiCad footprint: it does not start with (footprint');
  const pads = all(fp, 'pad').map((p) => {
    const a = one(p, 'at'), size = one(p, 'size'), drill = one(p, 'drill');
    return { number: String(p[1] ?? ''), type: PAD_TYPES.includes(p[2]) ? p[2] : 'smd', shape: String(p[3] ?? ''),
      x: num(a?.[1]), y: num(a?.[2]), rot: num(a?.[3]), size: [num(size?.[1]), num(size?.[2])],
      drill: drill ? num(drill.find((x, k) => k > 0 && x !== 'oval')) : 0, layers: (one(p, 'layers') || []).slice(1).map(String) };
  });
  const attr = one(fp, 'attr');
  return { name: String(fp[1] ?? ''), version: num(one(fp, 'version')?.[1], 0), attr: attr ? String(attr[1] ?? '') : '',
    description: String(one(fp, 'descr')?.[1] ?? ''), tags: String(one(fp, 'tags')?.[1] ?? ''), pads,
    models: all(fp, 'model').map((m) => String(m[1] ?? '')) };
}

/**
 * A footprint's through-hole pads on the 0.1 inch grid: { pins: [{ number, dx, dy }] (steps from pad 1, as KiCad's axes:
 * x right, y down), offGrid: [the numbers of the pads off it], smd: [the numbers of its surface-mount pads] }. A pad
 * with no number (a mounting hole) is left out; pins is empty when it has no pad 1 through the board.
 */
export function gridPins(footprint) {
  const tht = footprint.pads.filter((p) => p.number && p.type === 'thru_hole');
  const smd = footprint.pads.filter((p) => p.number && (p.type === 'smd' || p.type === 'connect')).map((p) => p.number);
  const first = tht.find((p) => p.number === '1') ?? null;
  if (!first) return { pins: [], offGrid: tht.map((p) => p.number), smd };
  const pins = [], offGrid = [];
  for (const p of tht) {
    const dx = (p.x - first.x) / GRID_MM, dy = (p.y - first.y) / GRID_MM;
    const rx = Math.round(dx), ry = Math.round(dy);
    if (Math.abs(dx - rx) * GRID_MM > TOLERANCE_MM || Math.abs(dy - ry) * GRID_MM > TOLERANCE_MM) offGrid.push(p.number);
    else pins.push({ number: p.number, dx: rx, dy: ry });
  }
  return { pins, offGrid, smd };
}

const DIP = /^(?:DIP|PDIP|CERDIP)-(\d+)_W(\d+(?:\.\d+)?)mm/i;
const HEADER = /^(PinHeader|PinSocket)_(\d+)x(\d+)_P(\d+(?:\.\d+)?)mm/i;
const SMD = /^(SOIC|SO|SSOP|TSSOP|MSOP|SOT|SOD|QFN|DFN|QFP|LQFP|TQFP|BGA|PLCC|VSSOP|TSOT|SC-70|WSON|LGA)\b/i;

/**
 * A footprint's name (with its library's, 'Package_DIP:DIP-14_W7.62mm', or without) read as a package: { kind: 'dip',
 * pins, rows (its two rows' distance in grid steps) } | { kind: 'header', rows, cols, pitch (mm) } | { kind: 'smd' }, or
 * null for a name of no convention known.
 */
export function packageOfFootprint(name) {
  const s = String(name ?? '').replace(/^[^:]*:/, '');
  let m = DIP.exec(s);
  if (m) return { kind: 'dip', pins: Number(m[1]), rows: Math.round(Number(m[2]) / GRID_MM) };
  m = HEADER.exec(s);
  if (m) return { kind: 'header', rows: Number(m[2]), cols: Number(m[3]), pitch: Number(m[4]) };
  return SMD.test(s) ? { kind: 'smd' } : null;
}

/** Whether a footprint's name matches one of a symbol's filters (ki_fp_filters' globs: * any text, ? one character). */
export function matchesFootprintFilters(name, filters) {
  const s = String(name ?? '').replace(/^[^:]*:/, '');
  return (filters || []).some((f) => {
    const re = new RegExp(`^${String(f).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
    return re.test(s);
  });
}
