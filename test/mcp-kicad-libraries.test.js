// The MCP server's KiCad libraries (#4285, server/mcp-kicad.js): part_libraries lists KiCad's own and the PCM's library
// packages (searched), and what one holds; import_part with a library imports it into the project's parts/, its origin
// written in its symbols; its refusals. No network: the server's fetch is the test's.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { scratchEnv } from './server-helpers.js';
import { createZip } from '../core/zip.js';

let tmp;
before(async () => { tmp = fs.realpathSync(await scratchEnv('silinx-mcp-kicad-libs-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { handle } = await import('../server/mcp.js');
const K = await import('../server/kicad-libraries.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, text) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${text}`); return r; };

const sha = (b) => createHash('sha256').update(b).digest('hex');
const LIB = fs.readFileSync(new URL('./fixtures/kicad/project/parts/ttl.kicad_sym', import.meta.url), 'utf8');
const MOD = fs.readFileSync(new URL('./fixtures/kicad/project/parts/imported.pretty/Module_1x04.kicad_mod', import.meta.url), 'utf8');
const ZIP = await createZip([{ path: 'symbols/ttl.kicad_sym', data: LIB }, { path: 'footprints/imported.pretty/Module_1x04.kicad_mod', data: MOD }], { deflate: (d) => zlib.deflateRawSync(d) });
const LIST_URL = 'https://gitlab.com/kicad/addons/repository/-/raw/main/packages-v1.json';
const LIST = fs.readFileSync(new URL('./fixtures/kicad/pcm/packages-v1.json', import.meta.url), 'utf8').replace('SHA_OF_THE_ZIP', sha(ZIP));
const WEB = { 'https://repository.kicad.org/repository.json': JSON.stringify({ packages: { url: LIST_URL, sha256: sha(LIST) } }), [LIST_URL]: LIST,
  'https://github.com/example/logic-parts/releases/download/v1.2.0/logic-parts.zip': ZIP };
before(() => K.setKicadFetch(async (u) => { if (!(u in WEB)) throw new TypeError('fetch failed'); return new Response(WEB[u]); }));
after(() => K.setKicadFetch(null));

test('part_libraries: the libraries, a search, what one holds; import_part with a library; its refusals', async () => {
  const all = await ok('part_libraries', {});
  assert.deepEqual(all.text.split('\n'), [
    'org.kicad.libraries.symbols.74xx: KiCad 74xx symbols 9.0.0 (CC-BY-SA-4.0, KiCad Libraries team; 1.2 MB) — KiCad\'s own 74 series logic symbols (TTL and CMOS): its 74LS, 74HC, 74HCT…',
    'org.kicad.libraries.symbols.4xxx: KiCad 4xxx symbols 9.0.0 (CC-BY-SA-4.0, KiCad Libraries team; 0.35 MB) — KiCad\'s own 4000 series CMOS logic symbols',
    'org.example.alpha: Alpha footprints 0.3 (CC0-1.0; 0.00 MB) — Only footprints',
    'org.example.logic-parts: Example logic parts 1.2.0 (CC-BY-4.0, Test Author; 0.00 MB) — A test package: a 74LS00 and a module']);
  assert.deepEqual([all.data.fetched, all.data.note, all.data.untrusted.content], [true, null, 'the libraries\' names and descriptions']);
  assert.deepEqual((await ok('part_libraries', { query: 'cmos 4000' })).data.libraries.map((l) => l.identifier), ['org.kicad.libraries.symbols.4xxx']);
  assert.equal((await ok('part_libraries', { query: 'zzz' })).text, 'No library matches \'zzz\'.');
  const one = await ok('part_libraries', { library: 'org.example.logic-parts' });
  assert.deepEqual(one.text.split('\n'), ['org.example.logic-parts: Example logic parts 1.2.0 (CC-BY-4.0; 0.00 MB, fetched), 1 symbol library, 1 footprint(s)',
    'ttl.kicad_sym: 7 part(s), 4 as ICs of the library (74LS00 as 7400, 74HC00 as 7400, MYNAND as 7400, CD4011 as 4011), 3 drawn only; 3 symbol(s) no part']);
  assert.match((await ok('part_libraries', { library: 'org.example.logic-parts' })).text, /, kept\), 1 symbol library/);
  await fails('part_libraries', { library: 'org.example.none' }, 'no library \'org.example.none\' (part_libraries lists them)');

  await ok('new_project', { name: 'L' });
  const r = await ok('import_part', { project: 'L', library: 'org.example.logic-parts', libraries: ['ttl.kicad_sym'] });
  assert.deepEqual(r.text.split('\n'), ['parts/ttl.kicad_sym written: 7 part(s), 4 of them as ICs of the library (7400, 4011), 3 drawn only; 3 symbol(s) no part',
    '1 footprint(s) written: parts/imported.pretty']);
  assert.deepEqual(r.data.written, ['parts/ttl.kicad_sym', 'parts/imported.pretty/Module_1x04.kicad_mod']);
  const text = fs.readFileSync(path.join(tmp, 'ws', 'L', 'parts', 'ttl.kicad_sym'), 'utf8');
  assert.match(text, /"Silinx\.Source" "org\.example\.logic-parts 1\.2\.0 \(KiCad PCM\)"/);
  assert.match(text, /"Silinx\.Author" "Test Author"/);
  assert.equal((await ok('circuit_parts', { project: 'L', type: 'parts/ttl.kicad_sym#74HC00' })).text.split('\n')[2],
    'KiCad symbol 74HC00 of parts/ttl.kicad_sym; datasheet https://example.org/74hc00.pdf; from org.example.logic-parts 1.2.0 (KiCad PCM), by Test Author, licence CC-BY-4.0');
  await fails('import_part', { project: 'L', library: 'org.example.logic-parts' }, 'parts/ttl.kicad_sym: the project has it already (replace: true replaces it)');
  assert.equal((await ok('import_part', { project: 'L', library: 'org.example.logic-parts', replace: true, licence: 'CC-BY-4.0 (as its README)' })).data.written.length, 2);
  assert.match(fs.readFileSync(path.join(tmp, 'ws', 'L', 'parts', 'ttl.kicad_sym'), 'utf8'), /"Silinx\.Licence" "CC-BY-4\.0 \(as its README\)"/);
  await fails('import_part', { project: 'L', library: 'org.example.logic-parts', libraries: ['nope.kicad_sym'] }, 'libraries: no library \'nope.kicad_sym\' in the package (its libraries: ttl.kicad_sym)');
  await fails('import_part', { project: 'L' }, 'file or library: one of them');
  await fails('import_part', { project: 'L', file: 'a.kicad_sym', library: 'x.y' }, 'file or library: one of them');
  await fails('import_part', { project: 'L', library: 'org.example.logic-parts', symbols: {} }, 'symbols, name: a file\'s only, not a library\'s');
  await fails('import_part', { project: 'L', file: 'a.kicad_sym', libraries: ['x'] }, 'libraries: a package\'s or a library\'s only, not a file\'s');
});

test('import_part with a package\'s .zip and a .kicad_symdir folder of the exchange folder', async () => {
  const ex = path.join(tmp, 'exchange');
  process.env.SILINX_MCP_FOLDER = ex;
  fs.mkdirSync(path.join(ex, 'Logic.kicad_symdir'), { recursive: true });
  const meta = JSON.stringify({ identifier: 'org.example.zipped', author: { name: 'Zip Author' }, license: 'CC0-1.0', versions: [{ version: '3.1' }] });
  fs.writeFileSync(path.join(ex, 'pkg.zip'), await createZip([{ path: 'metadata.json', data: meta }, { path: 'symbols/ttl.kicad_sym', data: LIB }], { deflate: (d) => zlib.deflateRawSync(d) }));
  const one = (name, value) => `(kicad_symbol_lib (version 20251024) (symbol "${name}" (property "Value" "${value}") (property "Footprint" "PinHeader_1x02_P2.54mm_Vertical") (symbol "${name}_1_1" (pin input line (name "A") (number "1")) (pin output line (name "Y") (number "2")))))`;
  fs.writeFileSync(path.join(ex, 'Logic.kicad_symdir', 'BUF.kicad_sym'), one('BUF', 'TEST-BUF'));
  fs.writeFileSync(path.join(ex, 'Logic.kicad_symdir', 'notes.txt'), 'x');
  await ok('new_project', { name: 'Z' });
  const z = await ok('import_part', { project: 'Z', file: 'pkg.zip' });
  // (no footprint in it: the module whose footprint is a .kicad_mod is no part)
  assert.equal(z.text.split('\n')[0], 'parts/ttl.kicad_sym written: 6 part(s), 4 of them as ICs of the library (7400, 4011), 2 drawn only; 4 symbol(s) no part');
  const t = fs.readFileSync(path.join(tmp, 'ws', 'Z', 'parts', 'ttl.kicad_sym'), 'utf8');
  assert.deepEqual([/"Silinx\.Source" "org\.example\.zipped 3\.1"/.test(t), /"Silinx\.Author" "Zip Author"/.test(t), /"Silinx\.Licence" "CC0-1\.0"/.test(t)], [true, true, true]);
  const d = await ok('import_part', { project: 'Z', file: 'Logic.kicad_symdir', licence: 'CC-BY-4.0' });
  assert.deepEqual(d.text.split('\n'), ['parts/Logic.kicad_symdir written: 1 part(s), 0 of them as ICs of the library (none), 1 drawn only; 0 symbol(s) no part']);
  assert.deepEqual(d.data.written, ['parts/Logic.kicad_symdir/BUF.kicad_sym']);
  assert.equal((await ok('circuit_parts', { project: 'Z', type: 'parts/Logic.kicad_symdir#BUF' })).text.split('\n')[1], 'Drawn only: not simulated, its pins drive nothing.');
  await fails('import_part', { project: 'Z', file: 'Logic.kicad_symdir', symbols: {} }, 'symbols, name: a file\'s only, not a package\'s nor a folder\'s');
  fs.writeFileSync(path.join(ex, 'bad.zip'), 'not a zip');
  await fails('import_part', { project: 'Z', file: 'bad.zip' }, 'not a zip file');
  await fails('import_part', { project: 'Z', file: 'none.zip' }, 'file: no file \'none.zip\' in the exchange folder');
});
