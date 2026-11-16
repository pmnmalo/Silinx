// KiCad's libraries fetched by the local server (#4285, server/kicad-libraries.js), with no network (a fetch of the
// test's own): the allowed hosts and their redirects only, the sizes limited; the PCM's index fetched, its SHA-256
// checked, kept, fetched again after a day or when asked, the one kept used offline; a package fetched once, its
// SHA-256 checked, kept; what it holds; imported into a project's parts/ (core/kicad-import.js importKicadPackage)
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { createZip } from '../core/zip.js';

let tmp;
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-kicad-libs-')); process.env.SILINX_CONFIG_DIR = tmp; });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const K = await import('../server/kicad-libraries.js');
const { importKicadPackage } = await import('../core/kicad-import.js');
const { setProjectParts } = await import('../core/circuit-parts.js');

const CODEC = { deflate: (d) => zlib.deflateRawSync(d) };
const sha = (b) => createHash('sha256').update(b).digest('hex');
const LIB = fs.readFileSync(new URL('./fixtures/kicad/project/parts/ttl.kicad_sym', import.meta.url), 'utf8');
const MOD = fs.readFileSync(new URL('./fixtures/kicad/project/parts/imported.pretty/Module_1x04.kicad_mod', import.meta.url), 'utf8');
const ZIP = await createZip([{ path: 'metadata.json', data: '{"identifier":"org.example.logic-parts"}' }, { path: 'symbols/ttl.kicad_sym', data: LIB },
  { path: 'footprints/imported.pretty/Module_1x04.kicad_mod', data: MOD }, { path: 'footprints/imported.pretty/Unused.kicad_mod', data: '(footprint "Unused")' },
  { path: '3dmodels/x.3dshapes/x.step', data: 'x' }], CODEC);
const ZIP_URL = 'https://github.com/example/logic-parts/releases/download/v1.2.0/logic-parts.zip';
const LIST_URL = 'https://gitlab.com/kicad/addons/repository/-/raw/main/packages-v1.json';
const LIST = fs.readFileSync(new URL('./fixtures/kicad/pcm/packages-v1.json', import.meta.url), 'utf8').replace('SHA_OF_THE_ZIP', sha(ZIP));

// the network: each URL's answer; the URLs asked
let web, asked;
const res = (body, { status = 200, headers = {} } = {}) => new Response(body, { status, headers });
beforeEach(() => {
  asked = [];
  web = {
    'https://repository.kicad.org/repository.json': () => res(JSON.stringify({ name: 'KiCad official repository', packages: { url: LIST_URL, sha256: sha(LIST) } })),
    [LIST_URL]: () => res(LIST),
    // (GitHub's release file: a redirect to its storage)
    [ZIP_URL]: () => res(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/x/logic-parts.zip' } }),
    'https://release-assets.githubusercontent.com/x/logic-parts.zip': () => res(ZIP),
  };
  K.setKicadFetch(async (u, opts) => { asked.push(u); assert.equal(opts.redirect, 'manual'); const f = web[u]; if (!f) throw new TypeError('fetch failed'); return f(); });
});
after(() => K.setKicadFetch(null));

// (a URL with a user and a password, its @ apart: no private data in the sources, test/private-data.test.js)
const CRED = `https://user:pw${'@'}gitlab.com/x`;

test('refusedUrl and fetchAllowed: HTTPS, the allowed hosts, no user nor port; each redirect checked; the size limited', async () => {
  assert.equal(K.refusedUrl('https://gitlab.com/x'), null);
  assert.deepEqual(['http://gitlab.com/x', 'https://evil.example/x', CRED, 'https://gitlab.com:8443/x', 'nope', 'file:///etc/passwd', 'https://gitlab.com.evil.example/x'].map(K.refusedUrl), [
    'not an HTTPS URL: http://gitlab.com/x', `not a host KiCad's libraries are fetched from (${K.ALLOWED_HOSTS.join(', ')}): evil.example`, `a URL with a user or a port: ${CRED}`,
    'a URL with a user or a port: https://gitlab.com:8443/x', 'not a URL: nope', 'not an HTTPS URL: file:///etc/passwd', `not a host KiCad's libraries are fetched from (${K.ALLOWED_HOSTS.join(', ')}): gitlab.com.evil.example`]);
  web['https://github.com/a'] = () => res(null, { status: 301, headers: { location: 'https://evil.example/b' } });
  await assert.rejects(K.fetchAllowed('https://github.com/a'), { message: `not a host KiCad's libraries are fetched from (${K.ALLOWED_HOSTS.join(', ')}): evil.example` });
  assert.deepEqual(asked, ['https://github.com/a'], 'the other host never asked');
  web['https://github.com/loop'] = () => res(null, { status: 302, headers: { location: '/loop' } });
  await assert.rejects(K.fetchAllowed('https://github.com/loop'), { message: 'too many redirects: https://github.com/loop' });
  web['https://github.com/big'] = () => res('x'.repeat(2000));
  await assert.rejects(K.fetchAllowed('https://github.com/big', { maxBytes: 1000 }), { message: 'https://github.com/big: more than the 1000 bytes fetched' });
  web['https://github.com/said'] = () => res('x', { headers: { 'content-length': '5000' } });
  await assert.rejects(K.fetchAllowed('https://github.com/said', { maxBytes: 1000 }), { message: 'https://github.com/said: 5000 bytes, more than the 1000 fetched' });
  web['https://github.com/404'] = () => res('no', { status: 404 });
  await assert.rejects(K.fetchAllowed('https://github.com/404'), { message: 'https://github.com/404: HTTP 404' });
  assert.deepEqual([...await K.fetchAllowed(ZIP_URL)].length, ZIP.length, 'a redirect to an allowed host followed');
});

test('kicadLibraries: fetched, its SHA-256 checked, kept; fetched again when asked; the one kept used offline', async () => {
  const a = await K.kicadLibraries();
  assert.equal(a.fetched, true);
  assert.equal(a.note, null);
  assert.deepEqual(a.libraries.map((l) => l.identifier), ['org.kicad.libraries.symbols.74xx', 'org.kicad.libraries.symbols.4xxx', 'org.example.alpha', 'org.example.logic-parts']);
  asked = [];
  const b = await K.kicadLibraries();
  assert.deepEqual([b.fetched, asked], [false, []], 'kept: under a day old');
  // offline: asked again, the network fails: the one kept, said
  web = {};
  const c = await K.kicadLibraries({ refresh: true });
  assert.equal(c.fetched, false);
  assert.match(c.note, /^the index kept on \d{4}-\d\d-\d\d \(fetch failed\)$/);
  assert.equal(c.libraries.length, 4);
  // a list whose SHA-256 is not the repository's: refused, the one kept used
  web['https://repository.kicad.org/repository.json'] = () => res(JSON.stringify({ packages: { url: LIST_URL, sha256: '00'.repeat(32) } }));
  web[LIST_URL] = () => res(LIST);
  assert.match((await K.kicadLibraries({ refresh: true })).note, /\(the PCM's packages list's SHA-256 is [0-9a-f]{64}, not the 0{64} it should be: not read\)$/);
  // none kept, none fetched
  fs.rmSync(path.join(tmp, 'kicad'), { recursive: true, force: true });
  web = {};
  await assert.rejects(K.kicadLibraries(), { message: 'the KiCad PCM\'s index could not be fetched: fetch failed' });
});

test('openKicadLibrary: a package fetched once, its SHA-256 checked, kept; what it holds; KiCad\'s own by their pinned SHA-256', async () => {
  const o = await K.openKicadLibrary('org.example.logic-parts');
  assert.equal(o.cached, false);
  assert.deepEqual([o.pkg.symbols.map((s) => s.name), o.pkg.footprints.map((f) => f.name)], [['ttl.kicad_sym'], ['Module_1x04.kicad_mod', 'Unused.kicad_mod']]);
  asked = [];
  assert.equal((await K.openKicadLibrary('org.example.logic-parts')).cached, true);
  assert.deepEqual(asked, [], 'kept: not fetched again');
  const c = await K.kicadContents(o.pkg);
  assert.deepEqual(c, [{ name: 'ttl.kicad_sym', parts: 7, ics: [{ symbol: '74LS00', as: '7400' }, { symbol: '74HC00', as: '7400' }, { symbol: 'MYNAND', as: '7400' }, { symbol: 'CD4011', as: '4011' }], drawn: 3, skipped: 3 }]);
  assert.deepEqual(K.kicadOrigin(o.library), { source: 'org.example.logic-parts 1.2.0 (KiCad PCM)', author: 'Test Author', licence: 'CC-BY-4.0' });
  await assert.rejects(K.openKicadLibrary('org.example.none'), { message: 'no library \'org.example.none\' (part_libraries lists them)' });
  // KiCad's own: its file's SHA-256 is pinned; another file refused
  web['https://gitlab.com/kicad/libraries/kicad-symbols/-/raw/9.0.0/4xxx.kicad_sym'] = () => res(LIB);
  await assert.rejects(K.openKicadLibrary('org.kicad.libraries.symbols.4xxx'), { message: `KiCad 4xxx symbols 9.0.0's SHA-256 is ${sha(LIB)}, not the 60cbb92571dd4a4b75b5a691817c309219dd88f42e070af556ba9ec973335888 it should be: not read` });
  // a package whose zip is not the index's: refused, not kept
  fs.rmSync(path.join(tmp, 'kicad', `${sha(ZIP)}.zip`));
  web['https://release-assets.githubusercontent.com/x/logic-parts.zip'] = () => res(new Uint8Array([1, 2, 3]));
  await assert.rejects(K.openKicadLibrary('org.example.logic-parts'), /^Error: Example logic parts 1\.2\.0's SHA-256 is [0-9a-f]{64}, not the [0-9a-f]{64} it should be: not read$/);
  assert.equal(fs.existsSync(path.join(tmp, 'kicad', `${sha(ZIP)}.zip`)), false);
});

test('importKicadPackage: its libraries and the footprints they name written in parts/, their origin; a file there refused', async () => {
  web['https://release-assets.githubusercontent.com/x/logic-parts.zip'] = () => res(ZIP);
  const { library, pkg } = await K.openKicadLibrary('org.example.logic-parts');
  const files = {};
  const P = { fileTree: async () => Object.keys(files), readFile: async (_n, p) => files[p], writeFile: async (_n, p, t) => { files[p] = t; } };
  const r = await importKicadPackage(P, 'p', pkg, { origin: K.kicadOrigin(library) });
  assert.deepEqual(r.written, ['parts/ttl.kicad_sym', 'parts/imported.pretty/Module_1x04.kicad_mod'], 'the footprint its symbols name only');
  assert.deepEqual(r.lines, ['parts/ttl.kicad_sym written: 7 part(s), 4 of them as ICs of the library (7400, 4011), 3 drawn only; 3 symbol(s) no part',
    '1 footprint(s) written: parts/imported.pretty']);
  assert.match(files['parts/ttl.kicad_sym'], /\(property "Silinx\.Source" "org\.example\.logic-parts 1\.2\.0 \(KiCad PCM\)"/);
  assert.equal(files['parts/ttl.kicad_sym'].split('\n').filter((l) => l.includes('"Silinx.Licence" "CC-BY-4.0"')).length, 10);
  await assert.rejects(importKicadPackage(P, 'p', pkg, {}), { message: 'parts/ttl.kicad_sym: the project has it already (replace: true replaces it)' });
  await assert.rejects(importKicadPackage(P, 'p', pkg, { libraries: ['x.kicad_sym'] }), { message: 'libraries: no library \'x.kicad_sym\' in the package (its libraries: ttl.kicad_sym)' });
  await assert.rejects(importKicadPackage(P, 'p', pkg, { libraries: [] }), { message: 'libraries: none chosen' });
  assert.equal((await importKicadPackage(P, 'p', pkg, { replace: true })).written.length, 2);
  setProjectParts([]);
});
