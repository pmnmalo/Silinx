// KiCad's footprints (#4279, #4278): a `.kicad_mod` file (one footprint; a `.pretty` folder is a library of them,
// https://dev-docs.kicad.org/en/file-formats/sexpr-footprint/; KiCad 5's `(module …)` too), read into its pads, so that a
// through-hole part's pins get their places on a breadboard's 0.1 inch grid; and a footprint's name (KiCad's library
// convention: DIP-14_W7.62mm, PinHeader_1x04_P2.54mm_Vertical, SOIC-14_3.9x8.7mm_P1.27mm) read as a package, for a
// symbol whose footprint file is not at hand. Its drawing (#4315): its F.Fab layer's shapes (F.SilkS's when it has no
// F.Fab), the part's body seen from above, as a breadboard shows it. Its 3D models are only named. Isomorphic module.
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
    models: all(fp, 'model').map((m) => String(m[1] ?? '')), drawing: footprintDrawing(fp) };
}

// ------------------------------------------------------------------ its drawing (#4315)
const DRAWING_LAYERS = ['F.Fab', 'F.SilkS'];
const MAX_SHAPES = 2000, MAX_POINTS = 4000;
const xy = (a) => [num(a?.[1]), num(a?.[2])];
// (KiCad 5's arc: its centre, its start and its angle in degrees, clockwise on the page: as KiCad 6's start, mid, end)
function oldArc(c, p, deg) {
  const at = (t) => { const r = (deg * t * Math.PI) / 180, dx = p[0] - c[0], dy = p[1] - c[1]; return [c[0] + dx * Math.cos(r) - dy * Math.sin(r), c[1] + dx * Math.sin(r) + dy * Math.cos(r)]; };
  return [p, at(0.5), at(1)];
}

/**
 * A footprint's drawing (fp: its parsed (footprint …) list): { layer, shapes: [{ k: 'line' | 'arc' | 'poly' | 'circle',
 * pts (mm, KiCad's axes: x right, y down; a line's 2, an arc's start, mid and end, a polygon's corners, a rectangle's 4),
 * c and r (a circle's), fill (true: filled), w (its stroke's width, mm) }] } of its F.Fab layer, else its F.SilkS one;
 * null when neither has a shape. Its texts are left out.
 */
export function footprintDrawing(fp) {
  for (const layer of DRAWING_LAYERS) {
    const shapes = [];
    let points = 0;
    for (const e of fp) {
      if (shapes.length >= MAX_SHAPES || points > MAX_POINTS) break;
      const k = head(e);
      if (!k?.startsWith('fp_') || k === 'fp_text' || String(one(e, 'layer')?.[1] ?? '') !== layer) continue;
      const w = num(one(one(e, 'stroke'), 'width')?.[1], num(one(e, 'width')?.[1], 0.1));
      const fill = ['solid', 'yes'].includes(String(one(e, 'fill')?.[1] ?? ''));
      let sh = null;
      if (k === 'fp_line') sh = { k: 'line', pts: [xy(one(e, 'start')), xy(one(e, 'end'))] };
      else if (k === 'fp_rect') { const [a, b] = [xy(one(e, 'start')), xy(one(e, 'end'))]; sh = { k: 'poly', pts: [a, [b[0], a[1]], b, [a[0], b[1]]] }; }
      else if (k === 'fp_poly') sh = { k: 'poly', pts: (one(e, 'pts') || []).filter((q) => head(q) === 'xy').map(xy) };
      else if (k === 'fp_circle') { const c = xy(one(e, 'center')), p = xy(one(e, 'end')); sh = { k: 'circle', c, r: Math.hypot(p[0] - c[0], p[1] - c[1]) }; }
      else if (k === 'fp_arc') sh = one(e, 'mid') ? { k: 'arc', pts: [xy(one(e, 'start')), xy(one(e, 'mid')), xy(one(e, 'end'))] } : { k: 'arc', pts: oldArc(xy(one(e, 'start')), xy(one(e, 'end')), num(one(e, 'angle')?.[1])) };
      if (!sh || (sh.pts && sh.pts.length < 2) || (sh.k === 'circle' && !(sh.r > 0))) continue;
      points += sh.pts?.length ?? 1;
      shapes.push({ ...sh, fill, w });
    }
    if (shapes.length) return { layer, shapes };
  }
  return null;
}

/** A drawing's shape as an SVG path's d (pt: a point [x, y] → its place on the page; s: a length's scale). */
export function shapePath(sh, pt, s) {
  const f = (v) => Math.round(v * 100) / 100;
  const P = (q) => { const [x, y] = pt(q); return `${f(x)} ${f(y)}`; };
  if (sh.k === 'circle') {
    const [cx, cy] = pt(sh.c), r = f(sh.r * s);
    return `M${f(cx - r)} ${f(cy)}a${r} ${r} 0 1 0 ${f(2 * r)} 0a${r} ${r} 0 1 0 ${f(-2 * r)} 0Z`;
  }
  if (sh.k === 'arc') {
    const [a, m, b] = sh.pts.map(pt);
    // (its circle through the 3 points; the sweep: the mid point's side of the chord)
    const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
    if (Math.abs(d) < 1e-9) return `M${P(sh.pts[0])}L${P(sh.pts[2])}`;
    const sq = (q) => q[0] * q[0] + q[1] * q[1];
    const ux = (sq(a) * (m[1] - b[1]) + sq(m) * (b[1] - a[1]) + sq(b) * (a[1] - m[1])) / d, uy = (sq(a) * (b[0] - m[0]) + sq(m) * (a[0] - b[0]) + sq(b) * (m[0] - a[0])) / d;
    const r = f(Math.hypot(a[0] - ux, a[1] - uy));
    // (a → m → b clockwise on the page, y down: SVG's sweep 1; the centre on the mid point's side of the chord: over 180°)
    const side = (q) => (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
    const sweep = side(m) < 0 ? 1 : 0, large = Math.sign(side(m)) === Math.sign(side([ux, uy])) ? 1 : 0;
    return `M${f(a[0])} ${f(a[1])}A${r} ${r} 0 ${large} ${sweep} ${f(b[0])} ${f(b[1])}`;
  }
  return `M${sh.pts.map(P).join('L')}${sh.k === 'poly' ? 'Z' : ''}`;
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
