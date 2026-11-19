// The KiCad parts a project's link carries (#4573, core/link-parts.js, core/design-link.js encodeDesign): only those
// its drawings use (the symbol, those it extends, its footprint: Footprint, Silinx.Footprint, a PCM_ library's); a
// library in one file kept whole, a file of parts/ that is no part's kept, a library that does not read kept whole; a
// project whose imported libraries made its link too long has one, the parts it uses back byte for byte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { unusedPartFiles, usedPartTypes } from '../core/link-parts.js';
import { decodeDesign, encodeDesign, LINK_LIMITS } from '../core/design-link.js';
import { USED_TYPES, kicadPartsProject } from './link-parts-helpers.js';

const EX = path.join(import.meta.dirname, '..', 'examples', 'breadboard');
const exampleFiles = () => {
  const out = {};
  const walk = (d) => { for (const f of fs.readdirSync(path.join(EX, d), { withFileTypes: true })) { const rel = d ? `${d}/${f.name}` : f.name; if (f.isDirectory()) walk(rel); else out[rel] = fs.readFileSync(path.join(EX, rel), 'utf8'); } };
  walk('');
  return out;
};
const entries = (files) => Object.entries(files).map(([p, t]) => ({ path: p, data: new TextEncoder().encode(t) }));
const text = (d) => (typeof d === 'string' ? d : new TextDecoder().decode(d));

test('usedPartTypes: the types named outside parts/, by library', () => {
  const { files } = kicadPartsProject({ unused: 2 });
  assert.deepEqual([...usedPartTypes(files)].map(([lib, s]) => [lib, [...s].sort()]),
    [['parts/logic.kicad_symdir', ['TESTDERIVED2']], ['parts/gates.kicad_sym', ['TEST7400']], ['parts/extra.kicad_symdir', ['WITHFP', 'WITHPCM']]]);
  // (a name in parts/ itself uses nothing)
  assert.deepEqual([...usedPartTypes({ 'parts/x.md': USED_TYPES.join('\n') })], []);
});

test('unusedPartFiles: the symbols and footprints no drawing uses; a derived symbol keeps its parents, a symbol its footprint', () => {
  const { files, kept, left } = kicadPartsProject({ unused: 5 });
  assert.deepEqual(unusedPartFiles(files), left);
  assert.deepEqual(left, ['parts/extra.kicad_symdir/PAD0.kicad_sym', 'parts/extra.kicad_symdir/PAD1.kicad_sym', 'parts/extra.kicad_symdir/PAD2.kicad_sym',
    'parts/extra.kicad_symdir/PAD3.kicad_sym', 'parts/extra.kicad_symdir/PAD4.kicad_sym', 'parts/parts.pretty/LED_D5.0mm_test.kicad_mod']);
  for (const p of kept) assert.ok(!left.includes(p), p);
});

test('unusedPartFiles: no parts, none used, a library that does not read, a library not there', () => {
  assert.deepEqual(unusedPartFiles({ 'src/a.vhd': 'entity a is end;' }), []);
  // (no drawing names a part: every part file left out; parts/README.md, no part's, kept)
  const { files } = kicadPartsProject({ unused: 1 });
  delete files['src/kicad-parts.json'];
  const all = Object.keys(files).filter((p) => p !== 'parts/README.md').sort();
  assert.deepEqual(unusedPartFiles(files), all);
  // (a file of a used library that does not read: that library kept whole, and every footprint; the others trimmed)
  const broken = kicadPartsProject({ unused: 2 }).files;
  broken['parts/extra.kicad_symdir/PAD1.kicad_sym'] = '(not a library';
  broken['parts/other.kicad_symdir/UNUSED.kicad_sym'] = broken['parts/extra.kicad_symdir/PAD0.kicad_sym'];
  assert.deepEqual(unusedPartFiles(broken), ['parts/other.kicad_symdir/UNUSED.kicad_sym']);
  // (a type whose library is not in the project: nothing kept for it, nothing thrown)
  assert.deepEqual(unusedPartFiles({ 'src/c.json': '"parts/gone.kicad_symdir#X"', 'parts/a.kicad_sym': '(kicad_symbol_lib)' }), ['parts/a.kicad_sym']);
});

test('#4573 encodeDesign: a project whose libraries made its link too long has one; the parts it uses back byte for byte', async () => {
  const { files, kept, left } = kicadPartsProject();
  const project = { ...exampleFiles(), ...files };
  const e = await encodeDesign(entries(project));
  assert.ok(e.length <= LINK_LIMITS.maxEncoded);
  assert.deepEqual(e.parts, left);
  assert.equal(left.length, 61);
  const d = await decodeDesign(e.design);
  assert.deepEqual(d.warnings, []);
  const back = Object.fromEntries(d.entries.map((x) => [x.path, text(x.data)]));
  for (const p of [...kept, 'parts/README.md', 'src/kicad-parts.json']) assert.equal(back[p], project[p], p);
  for (const p of left) assert.equal(back[p], undefined, p);
  // (the same libraries, every symbol kept: still too large, the message as before)
  const used = { ...project, 'src/all.json': JSON.stringify(left.filter((p) => p.endsWith('.kicad_sym')).map((p) => `${p.replace(/\/[^/]+$/, '')}#${p.replace(/^.*\/|\.kicad_sym$/g, '')}`)) };
  await assert.rejects(encodeDesign(entries(used)), (err) => err.linkError && /^the design is too large for a link \(\d+ characters, at most 64000\): export it as a \.zip \(Export Project \(\.zip\)…, Silinx\) and link to that$/.test(err.message));
  // (an example with no KiCad parts: none left out)
  assert.deepEqual((await encodeDesign(entries(exampleFiles()))).parts, []);
});
