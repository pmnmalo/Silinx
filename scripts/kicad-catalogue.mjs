#!/usr/bin/env node
// The catalogue of KiCad parts (#4305, core/kicad-catalogue.js): made from the libraries it points at, as a project
// would read them (core/circuit-kicad.js kicadPartsOf), and written to core/kicad-catalogue-data.js. No library's
// content is kept: for each part, its symbol's name and part number, the library file it is in (its URL and SHA-256 at
// a pinned version), what it is in Silinx (as which IC of the library, or drawn only, on which package), the symbols
// it extends and the footprint files it names (their URLs and SHA-256), and each of those footprints' drawing, as a
// part drawn only is drawn (#4346: its shapes in grid steps, rounded, its pads' places; the catalogue's previews before
// a part is imported; CC-BY-4.0 SparkFun's, THIRD-PARTY-NOTICES.md). Only the parts a breadboard takes: as ICs, or
// drawn only on a DIP or a 2.54 mm pin header. Run it again to follow a new version of a library (its pins below).
//
//   node scripts/kicad-catalogue.mjs            (the network: gitlab.com, raw.githubusercontent.com, api.github.com)
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { OFFICIAL_LIBRARIES } from '../core/kicad-pcm.js';
import { kicadPartsOf, lookOf } from '../core/circuit-kicad.js';
import { readKicadFootprint, gridPins } from '../core/kicad-mod.js';
import { readKicadSymbols } from '../core/kicad-sym.js';
import { readPcmPackage } from '../core/kicad-pcm.js';
import zlib from 'node:zlib';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'core', 'kicad-catalogue-data.js');
// SparkFun's libraries at a tag (CC-BY-4.0, their README): its raw files are served with CORS, a browser imports them too
const SPARKFUN = { repo: 'sparkfun/SparkFun-KiCad-Libraries', tag: 'v10.0.0', licence: 'CC-BY-4.0', author: 'SparkFun Electronics' };
const raw = (p) => `https://raw.githubusercontent.com/${SPARKFUN.repo}/${SPARKFUN.tag}/${p}`;
const sha = (t) => createHash('sha256').update(t).digest('hex');

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'silinx-kicad-catalogue' } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

// the symbols a symbol extends, its parent first
function parents(symbols, name) {
  const by = new Map(symbols.map((s) => [s.name, s])), out = [];
  for (let s = by.get(name); s?.extends; s = by.get(s.extends)) out.unshift(s.extends);
  return out;
}
// a part's package as its places say it: a DIP, or pins on the 0.1 inch grid (a header, a module's rows)
const packageOf = (d) => (d.behaves || d.dip ? `DIP-${d.dip}` : 'grid');

async function main() {
  const libraries = {}, parts = [];
  const add = (id, lib, text, footprints = {}) => {
    libraries[id] = { ...lib, sha256: sha(text) };
    const rel = `parts/${lib.file}`;
    const r = kicadPartsOf({ [rel]: text, ...Object.fromEntries(Object.entries(footprints).map(([k, f]) => [k, f.text])) });
    const syms = readKicadSymbols(text).symbols;
    for (const d of r.defs) {
      const fp = d.kicad.footprint && Object.entries(footprints).find(([k]) => k.endsWith(`/${d.kicad.footprint.replace(/^(?:PCM_)?([^:]*):(.*)$/, '$1.pretty/$2')}.kicad_mod`));
      parts.push({ id: `${id}/${d.kicad.symbol}`, library: id, symbol: d.kicad.symbol, value: d.kicad.value, as: d.behaves, package: packageOf(d), pins: d.pins.length,
        ...(parents(syms, d.kicad.symbol).length ? { needs: parents(syms, d.kicad.symbol) } : {}),
        ...(fp && !d.behaves ? { footprint: { name: d.kicad.footprint.replace(/^PCM_/, ''), url: footprints[fp[0]].url, sha256: sha(footprints[fp[0]].text) } } : {}) });
    }
  };
  for (const l of OFFICIAL_LIBRARIES) {
    const text = await get(l.url);
    if (sha(text) !== l.sha256) throw new Error(`${l.url}: not the SHA-256 pinned in core/kicad-pcm.js`);
    add(l.library.replace(/\.kicad_sym$/, '').toLowerCase().replace(/^/, 'kicad-'), { name: l.name, version: l.version, licence: l.licence, author: l.author, url: l.url, file: l.library }, text);
  }
  const files = JSON.parse(await get(`https://api.github.com/repos/${SPARKFUN.repo}/contents/symbols?ref=${SPARKFUN.tag}`)).map((f) => f.name).filter((n) => /^SparkFun-[\w-]+\.kicad_sym$/.test(n));
  // its footprints from its release's zip (one download), each one's raw file at the tag the same text
  const zr = await fetch(`https://github.com/${SPARKFUN.repo}/releases/download/${SPARKFUN.tag}/SparkFun-KiCad-Libraries-${SPARKFUN.tag.slice(1)}-with-pcm.zip`);
  if (!zr.ok) throw new Error(`SparkFun's release zip: HTTP ${zr.status}`);
  const pkg = await readPcmPackage(new Uint8Array(await zr.arrayBuffer()), { inflate: (d, limit) => zlib.inflateRawSync(d, { maxOutputLength: Math.max(1, limit) }) });
  const allFootprints = Object.fromEntries(pkg.footprints.map((f) => [`parts/${f.library}.pretty/${f.name}`, { text: f.text, url: raw(`footprints/${f.library}.pretty/${f.name}`) }]));
  // (twice: the zip's footprints find the parts and the footprints they name; those footprints' raw files, what an
  // import fetches, are not byte for byte the zip's: the parts read again on them, their SHA-256 theirs)
  const texts = Object.fromEntries(await Promise.all(files.map(async (f) => [f, await get(raw(`symbols/${f}`))])));
  const sparkfun = (f, footprints) => add(f.replace(/\.kicad_sym$/, '').toLowerCase(), { name: `SparkFun ${f.replace(/^SparkFun-|\.kicad_sym$/g, '')}`, version: SPARKFUN.tag.replace(/^v/, ''),
    licence: SPARKFUN.licence, author: SPARKFUN.author, url: raw(`symbols/${f}`), file: f }, texts[f], footprints);
  const first = parts.length;
  for (const f of files) sparkfun(f, allFootprints);
  const named = [...new Set(parts.slice(first).filter((p) => p.footprint).map((p) => p.footprint.url))];
  parts.length = first;
  const rawFootprints = {};
  for (const url of named) rawFootprints[`parts/${url.split('/footprints/')[1]}`] = { text: await get(url), url };
  for (const f of files) sparkfun(f, rawFootprints);
  // each footprint's drawing (#4346): [k (c circle, l line, a arc, p polygon), fill (0/1), stroke width, then a circle's
  // centre and radius or the other shapes' points, flat], in grid steps rounded to 0.01; its pads [number, dx, dy] turned
  // as core/circuit-kicad.js turns a part's pins (KiCad's rows down, Silinx's along the board)
  const r2 = (v) => Math.round(v * 100) / 100 || 0;
  const looks = {};
  for (const p of parts) {
    if (!p.footprint || looks[p.footprint.name]) continue;
    const fp = readKicadFootprint(rawFootprints[`parts/${p.footprint.url.split('/footprints/')[1]}`].text), look = lookOf(fp);
    // (one with no drawing: its pads only, a box round them)
    looks[p.footprint.name] = { pins: gridPins(fp).pins.map((q) => [q.number, q.dy, -q.dx || 0]),
      shapes: (look?.shapes ?? []).map((sh) => [sh.k[0], sh.fill ? 1 : 0, Math.round(sh.w * 1000) / 1000, ...(sh.k === 'circle' ? [...sh.c, sh.r] : sh.pts.flat()).map(r2)]) };
  }
  const used = new Set(parts.map((p) => p.library));
  const libs = Object.fromEntries(Object.entries(libraries).filter(([k]) => used.has(k)));
  const L = ['// The catalogue of KiCad parts (#4305): written by scripts/kicad-catalogue.mjs, do not edit. Where each part is (its',
    '// library file\'s URL and SHA-256 at a pinned version), what it is in Silinx; none of a library\'s files, only its',
    '// footprints\' drawings for the previews (CATALOGUE_LOOKS).', '',
    'export const CATALOGUE_LIBRARIES = {', ...Object.entries(libs).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`), '};', '',
    'export const CATALOGUE = [', ...parts.map((p) => `  ${JSON.stringify(p)},`), '];', '',
    '// each footprint\'s drawing, by its name (#4346): derived from SparkFun KiCad Libraries v10.0.0\'s footprints (SparkFun',
    '// Electronics, CC-BY-4.0, https://creativecommons.org/licenses/by/4.0/): their F.Fab shapes, in grid steps, rounded',
    'export const CATALOGUE_LOOKS = {', ...Object.entries(looks).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`), '};', ''];
  fs.writeFileSync(OUT, L.join('\n'));
  console.log(`${path.relative(ROOT, OUT)}: ${parts.length} parts of ${Object.keys(libs).length} libraries (${parts.filter((p) => p.as).length} as ICs)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
