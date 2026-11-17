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
import { setSymbolProperties } from '../core/kicad-edit.js';
import { readPcmPackage } from '../core/kicad-pcm.js';
import zlib from 'node:zlib';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'core', 'kicad-catalogue-data.js');
// SparkFun's libraries at a tag (CC-BY-4.0, their README): its raw files are served with CORS, a browser imports them too
const SPARKFUN = { repo: 'sparkfun/SparkFun-KiCad-Libraries', tag: 'v10.0.0', licence: 'CC-BY-4.0', author: 'SparkFun Electronics' };
const raw = (p) => `https://raw.githubusercontent.com/${SPARKFUN.repo}/${SPARKFUN.tag}/${p}`;
const sha = (t) => createHash('sha256').update(t).digest('hex');
// KiCad's own basic parts at 9.0.0 (#4385): a symbol of its libraries and the footprint Silinx picks for it (through-hole,
// on a breadboard's 0.1 inch grid, a lead bending 0.1 mm: core/kicad-mod.js), written as its Silinx.Footprint when it is
// imported (null: its own). Their drawings are not kept: KiCad's libraries are CC-BY-SA-4.0, and a collection of their
// parts, even changed, is ShareAlike (https://www.kicad.org/libraries/license/); only their pads' places, facts.
const KICAD = 'https://gitlab.com/kicad/libraries';
// Arduino's boards that plug into a breadboard (#4394): the KiCad PCM's KiCad Library for Arduino Modules at a tag
// (CC-BY-SA-4.0, as KiCad's: none of its drawings kept, only its pads' places); its raw files served with CORS
const ARDUINO = { repo: 'Alarm-Siren/arduino-kicad-library', tag: 'v4.2.0', licence: 'CC-BY-SA-4.0', author: 'Nicholas Parks Young' };
const ardRaw = (p) => `https://raw.githubusercontent.com/${ARDUINO.repo}/${ARDUINO.tag}/${p}`;
const TO92 = 'Package_TO_SOT_THT:TO-92_Inline_Wide';
const PICKS = {
  'Device.kicad_sym': { LED: 'LED_THT:LED_D5.0mm', R: 'Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal', C: 'Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm',
    C_Polarized: 'Capacitor_THT:CP_Radial_D5.0mm_P2.50mm', D: 'Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal', R_Potentiometer: 'Potentiometer_THT:Potentiometer_Bourns_3386P_Vertical' },
  'Transistor_BJT.kicad_sym': { '2N3904': TO92, '2N3906': TO92, BC547: TO92, BC557: TO92 },
  'Regulator_Linear.kicad_sym': { L7805: 'Package_TO_SOT_THT:TO-220-3_Vertical', LM7805_TO220: null },
  'Switch.kicad_sym': { SW_DIP_x04: 'Button_Switch_THT:SW_DIP_SPSTx04_Slide_9.78x12.34mm_W7.62mm_P2.54mm' },
  'Display_Character.kicad_sym': { 'LTS-6960HR': null, 'KCSA02-105': null },
};

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
const packageOf = (d) => (d.dip ? `DIP-${d.dip}` : 'grid');

async function main() {
  const libraries = {}, parts = [];
  // (only: the symbols kept, by name; set: the Silinx.Footprint written when one is imported; its library's SHA-256 the
  // file's as fetched, `original`)
  const add = (id, lib, text, footprints = {}, { only = null, set = {}, original = text } = {}) => {
    libraries[id] = { ...lib, sha256: sha(original) };
    const rel = `parts/${lib.file}`;
    const r = kicadPartsOf({ [rel]: text, ...Object.fromEntries(Object.entries(footprints).map(([k, f]) => [k, f.text])) });
    const syms = readKicadSymbols(text).symbols;
    for (const d of r.defs.filter((x) => !only || only.includes(x.kicad.symbol))) {
      const fp = d.kicad.footprint && Object.entries(footprints).find(([k]) => k.endsWith(`/${d.kicad.footprint.replace(/^(?:PCM_)?([^:]*):(.*)$/, '$1.pretty/$2')}.kicad_mod`));
      parts.push({ id: `${id}/${d.kicad.symbol}`, library: id, symbol: d.kicad.symbol, value: d.kicad.value, as: d.behaves, package: packageOf(d), pins: d.pins.length,
        ...(parents(syms, d.kicad.symbol).length ? { needs: parents(syms, d.kicad.symbol) } : {}),
        // (an IC's place is the library's; an LED's, a switch's, a button's its footprint's, #4349)
        ...(fp && d.kind !== 'ic' ? { footprint: { name: d.kicad.footprint.replace(/^PCM_/, ''), url: footprints[fp[0]].url, sha256: sha(footprints[fp[0]].text), ...(set[d.kicad.symbol] ? { set: true } : {}) } } : {}) });
    }
  };
  for (const l of OFFICIAL_LIBRARIES) {
    const text = await get(l.url);
    if (sha(text) !== l.sha256) throw new Error(`${l.url}: not the SHA-256 pinned in core/kicad-pcm.js`);
    add(l.library.replace(/\.kicad_sym$/, '').toLowerCase().replace(/^/, 'kicad-'), { name: l.name, version: l.version, licence: l.licence, author: l.author, url: l.url, file: l.library }, text);
  }
  const kicadFootprints = {};
  for (const [file, picks] of Object.entries(PICKS)) {
    const url = `${KICAD}/kicad-symbols/-/raw/9.0.0/${file}`, original = await get(url);
    const set = Object.fromEntries(Object.entries(picks).filter(([, f]) => f).map(([s, f]) => [s, { 'Silinx.Footprint': f }]));
    const syms = readKicadSymbols(original).symbols;
    const footprints = {};
    for (const s of Object.keys(picks)) {
      const name = picks[s] ?? syms.find((x) => x.name === s)?.properties.Footprint;
      const [lib, fp] = name.split(':'), rel = `${lib}.pretty/${fp}.kicad_mod`;
      footprints[`parts/${rel}`] ??= { text: await get(`${KICAD}/kicad-footprints/-/raw/9.0.0/${rel}`), url: `${KICAD}/kicad-footprints/-/raw/9.0.0/${rel}` };
    }
    Object.assign(kicadFootprints, footprints);
    const base = file.replace(/\.kicad_sym$/, '');
    add(`kicad-${base.toLowerCase().replace(/_/g, '-')}`, { name: `KiCad ${base} symbols`, version: '9.0.0', licence: 'CC-BY-SA-4.0', author: 'KiCad Libraries team', url, file },
      setSymbolProperties(original, set), footprints, { only: Object.keys(picks), set, original });
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
  const ardFootprints = {};
  const ardNames = JSON.parse(await get(`https://api.github.com/repos/${ARDUINO.repo}/contents/footprints/arduino-library.pretty?ref=${ARDUINO.tag}`)).map((f) => f.name).filter((n) => /\.kicad_mod$/.test(n));
  for (const n of ardNames) ardFootprints[`parts/arduino-library.pretty/${n}`] = { text: await get(ardRaw(`footprints/arduino-library.pretty/${n}`)), url: ardRaw(`footprints/arduino-library.pretty/${n}`) };
  add('arduino-modules', { name: 'Arduino modules', version: ARDUINO.tag.slice(1), licence: ARDUINO.licence, author: ARDUINO.author, url: ardRaw('symbols/arduino-library.kicad_sym'), file: 'arduino-library.kicad_sym' },
    await get(ardRaw('symbols/arduino-library.kicad_sym')), ardFootprints);
  // each footprint's drawing (#4346): [k (c circle, l line, a arc, p polygon), fill (0/1), stroke width, then a circle's
  // centre and radius or the other shapes' points, flat], in grid steps rounded to 0.01; its pads [number, dx, dy] turned
  // as core/circuit-kicad.js turns a part's pins (KiCad's rows down, Silinx's along the board)
  const r2 = (v) => Math.round(v * 100) / 100 || 0;
  const looks = {};
  for (const p of parts) {
    if (!p.footprint || looks[p.footprint.name]) continue;
    // (SparkFun's drawn, CC-BY-4.0; KiCad's and Arduino modules': their pads only, CC-BY-SA)
    const sparkfun = p.footprint.url.startsWith(raw(''));
    const text = sparkfun ? rawFootprints[`parts/${p.footprint.url.split('/footprints/')[1]}`].text : Object.values({ ...kicadFootprints, ...ardFootprints }).find((f) => f.url === p.footprint.url).text;
    const fp = readKicadFootprint(text);
    const look = sparkfun ? lookOf(fp) : null;
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
    '// Electronics, CC-BY-4.0, https://creativecommons.org/licenses/by/4.0/): their F.Fab shapes, in grid steps, rounded;',
    '// KiCad\'s and the Arduino modules\' footprints\' pads\' places only (#4385, #4394: CC-BY-SA)',
    'export const CATALOGUE_LOOKS = {', ...Object.entries(looks).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`), '};', ''];
  fs.writeFileSync(OUT, L.join('\n'));
  console.log(`${path.relative(ROOT, OUT)}: ${parts.length} parts of ${Object.keys(libs).length} libraries (${parts.filter((p) => p.as).length} as library parts)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
