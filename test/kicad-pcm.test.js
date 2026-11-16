// KiCad's libraries to browse (#4285, core/kicad-pcm.js): the PCM's repository and packages list read into its library
// packages (each one's newest stable version), searched; SHA-256 against node:crypto's; a package's zip read (its symbol
// libraries, folders and footprints only), and what it refuses: a path out of it, a zip over its limits, none of KiCad's
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import { pcmPackagesOf, pcmLibraries, searchLibraries, sha256Hex, checkSha256, readPcmPackage, OFFICIAL_LIBRARIES, PCM_REPOSITORY, PACKAGE_LIMITS } from '../core/kicad-pcm.js';
import { createZip } from '../core/zip.js';

const CODEC = { deflate: (d) => zlib.deflateRawSync(d), inflate: (d, limit) => zlib.inflateRawSync(d, { maxOutputLength: Math.max(1, limit) }) };
const LIST = readFileSync(new URL('./fixtures/kicad/pcm/packages-v1.json', import.meta.url), 'utf8');
const SYM = '(kicad_symbol_lib (version 20231120) (symbol "A" (property "Value" "TEST-A")))';

test('pcmPackagesOf: a repository\'s packages list; what is not one', () => {
  const r = { name: 'KiCad official repository', packages: { url: 'https://gitlab.com/kicad/addons/repository/-/raw/main/packages-v1.json', sha256: 'AB'.repeat(32) } };
  assert.deepEqual(pcmPackagesOf(JSON.stringify(r)), { name: 'KiCad official repository', url: r.packages.url, sha256: 'ab'.repeat(32) });
  assert.equal(pcmPackagesOf({ packages: { url: 'https://x.org/p.json', sha256: 'nope' } }).sha256, null);
  for (const bad of [{}, { packages: {} }, { packages: { url: 'http://x.org/p.json' } }]) assert.throws(() => pcmPackagesOf(bad), /^Error: not a KiCad PCM repository: no packages' URL$/);
  assert.throws(() => pcmPackagesOf('{'), SyntaxError);
  assert.equal(PCM_REPOSITORY, 'https://repository.kicad.org/repository.json');
});

test('pcmLibraries: the library packages, each one\'s newest stable version; the others left out', () => {
  const libs = pcmLibraries(LIST.replace('SHA_OF_THE_ZIP', 'cd'.repeat(32)));
  assert.deepEqual(libs.map((l) => l.identifier), ['org.example.alpha', 'org.example.logic-parts'], 'by name; no plugin, bad identifier, testing only, HTTP');
  assert.deepEqual(libs[1], { identifier: 'org.example.logic-parts', name: 'Example logic parts', description: 'A test package: a 74LS00 and a module', licence: 'CC-BY-4.0', author: 'Test Author',
    version: '1.2.0', url: 'https://github.com/example/logic-parts/releases/download/v1.2.0/logic-parts.zip', sha256: 'cd'.repeat(32), size: 4000, installSize: 9000, kind: 'package' });
  assert.deepEqual([libs[0].author, libs[0].installSize], ['', null]);
  assert.deepEqual(pcmLibraries(LIST).map((l) => l.version), ['0.3', '1.1.0'], 'a stable version with no SHA-256 left out: the one before it');
  assert.throws(() => pcmLibraries({}), /^Error: not a KiCad PCM packages' list: no packages$/);
  assert.deepEqual(OFFICIAL_LIBRARIES.map((l) => [l.identifier, l.kind, l.licence, l.url]), [
    ['org.kicad.libraries.symbols.74xx', 'file', 'CC-BY-SA-4.0', 'https://gitlab.com/kicad/libraries/kicad-symbols/-/raw/9.0.0/74xx.kicad_sym'],
    ['org.kicad.libraries.symbols.4xxx', 'file', 'CC-BY-SA-4.0', 'https://gitlab.com/kicad/libraries/kicad-symbols/-/raw/9.0.0/4xxx.kicad_sym']]);
});

test('searchLibraries: every word in a library\'s name, identifier, description or author', () => {
  const all = [...OFFICIAL_LIBRARIES, ...pcmLibraries(LIST)];
  assert.deepEqual(searchLibraries(all, '').length, all.length);
  assert.deepEqual(searchLibraries(all, '74').map((l) => l.identifier), ['org.kicad.libraries.symbols.74xx', 'org.example.logic-parts']);
  assert.deepEqual(searchLibraries(all, 'TEST author').map((l) => l.identifier), ['org.example.logic-parts']);
  assert.deepEqual(searchLibraries(all, 'cmos 4000').map((l) => l.identifier), ['org.kicad.libraries.symbols.4xxx']);
  assert.deepEqual(searchLibraries(all, 'nothing-like-it'), []);
});

test('sha256Hex against node:crypto; checkSha256\'s refusal', async () => {
  for (const s of ['', 'abc', 'x'.repeat(100000)]) assert.equal(await sha256Hex(new TextEncoder().encode(s)), createHash('sha256').update(s).digest('hex'));
  const b = new TextEncoder().encode('abc');
  await checkSha256(b, createHash('sha256').update('abc').digest('hex').toUpperCase());
  await assert.rejects(checkSha256(b, '00'.repeat(32), 'the package'), { message: `the package's SHA-256 is ${createHash('sha256').update('abc').digest('hex')}, not the ${'00'.repeat(32)} it should be: not read` });
});

test('readPcmPackage: its metadata, symbol libraries, a .kicad_symdir and footprints; nothing else of it read', async () => {
  const zip = await createZip([{ path: 'metadata.json', data: JSON.stringify({ identifier: 'org.example.logic-parts' }) }, { path: 'symbols/Logic.kicad_sym', data: SYM },
    { path: 'symbols/More.kicad_symdir/B.kicad_sym', data: SYM.replace(/"A"/, '"B"') }, { path: 'symbols/More.kicad_symdir/C.kicad_sym', data: SYM.replace(/"A"/, '"C"') },
    { path: 'footprints/Mods.pretty/M1.kicad_mod', data: '(footprint "M1")' }, { path: '3dmodels/Mods.3dshapes/M1.step', data: 'x'.repeat(1000) },
    { path: 'resources/icon.png', data: new Uint8Array(10) }, { path: 'symbols/notes.txt', data: 'x' }, { path: 'symbols/sub/deep.kicad_sym', data: SYM }], CODEC);
  const p = await readPcmPackage(zip, CODEC);
  assert.deepEqual(p.metadata, { identifier: 'org.example.logic-parts' });
  assert.deepEqual(p.symbols, [{ name: 'Logic.kicad_sym', text: SYM }]);
  assert.deepEqual(p.symdirs.map((d) => [d.name, d.files.map((f) => f.name)]), [['More.kicad_symdir', ['B.kicad_sym', 'C.kicad_sym']]]);
  assert.deepEqual(p.footprints, [{ library: 'Mods', name: 'M1.kicad_mod', text: '(footprint "M1")' }]);
  // the 3D model is never inflated: a limit below its size does not stop it
  assert.equal((await readPcmPackage(zip, CODEC, { maxEntry: 200 })).symbols.length, 1);
  assert.deepEqual(PACKAGE_LIMITS, { maxFiles: 50000, maxEntry: 32 << 20, maxTotal: 256 << 20 });
});

test('readPcmPackage refuses: a path out of it, a zip over its limits, no symbols nor footprints, a bad metadata.json', async () => {
  const z = (files) => createZip(files.map(([path, data]) => ({ path, data })), CODEC);
  // (a backslash too: core/zip.js's writer makes it a slash, so it is not built here)
  for (const p of ['../evil.kicad_sym', 'symbols/../../x', '/abs/x', 'C:/x'])
    await assert.rejects(readPcmPackage(await z([[p, 'x'], ['symbols/A.kicad_sym', SYM]]), CODEC), { message: `a path out of the package: ${p}` });
  await assert.rejects(readPcmPackage(await z([['resources/icon.png', 'x'], ['3dmodels/a.step', 'x']]), CODEC), { message: 'the package has no symbols nor footprints' });
  await assert.rejects(readPcmPackage(await z([['metadata.json', '{'], ['symbols/A.kicad_sym', SYM]]), CODEC), { message: 'its metadata.json is not JSON' });
  await assert.rejects(readPcmPackage(await z([['symbols/A.kicad_sym', 'x'.repeat(5000)]]), CODEC, { maxEntry: 1000 }), /zip entry too large \(symbols\/A\.kicad_sym: 5000 bytes, at most 1000\)/);
  await assert.rejects(readPcmPackage(await z([['symbols/A.kicad_sym', SYM], ['symbols/B.kicad_sym', SYM]]), CODEC, { maxFiles: 1 }), /zip has too many entries \(2, at most 1\)/);
  await assert.rejects(readPcmPackage(new Uint8Array(100), CODEC), /not a zip file/);
});
