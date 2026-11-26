// Silinx's MicroPython build for the ESP32 node's JSPI back end on the local server (#5658, server/micropython-jspi.js),
// never the real download: a fake fetch and files of the test's own, pinned by their SHA-256. Downloaded once into the
// folder and served from it after; a download whose SHA-256 is not the pinned one refused, nothing kept; an HTTP error and a
// network failure said; a file that is none refused. The files pinned: the release's, declared for check-pins; the back end
// chosen by what WebAssembly has (esp32Backend), or forced.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MICROPYTHON_JSPI_FILES, MICROPYTHON_JSPI_RELEASE, PINNED } from '../core/micropython-jspi.js';

let dir, micropythonJspiPath, esp32Backend;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const MJS = new TextEncoder().encode('export const x = 1;');
const FILES = [{ file: 'micropython.mjs', url: 'https://example.test/micropython.mjs', sha256: sha(MJS), what: 'the test\'s module' }];
const fakeFetch = (served, calls) => async (url) => { calls.push(url); const b = served[url]; if (b === 'down') throw new Error('getaddrinfo ENOTFOUND'); return b == null ? { ok: false, status: 404 } : { ok: true, arrayBuffer: async () => (typeof b === 'string' ? new TextEncoder().encode(b) : b).buffer }; };

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-mp-jspi-'));
  process.env.SILINX_MICROPYTHON_JSPI_CACHE = dir;
  ({ micropythonJspiPath } = await import('../server/micropython-jspi.js'));
  ({ esp32Backend } = await import('../core/system-sim-esp32.js'));
});
after(() => { delete process.env.SILINX_MICROPYTHON_JSPI_CACHE; fs.rmSync(dir, { recursive: true, force: true }); });

test('#5658 the build\'s files: the release\'s module and WebAssembly, each pinned by its SHA-256 and declared', () => {
  assert.equal(MICROPYTHON_JSPI_RELEASE, 'micropython-wasm-v1.29.0-1');
  assert.deepEqual(MICROPYTHON_JSPI_FILES.map(f => [f.file, f.url]), ['micropython.mjs', 'micropython.wasm'].map(f => [f, `https://github.com/pmnmalo/Silinx/releases/download/micropython-wasm-v1.29.0-1/${f}`]));
  for (const f of MICROPYTHON_JSPI_FILES) assert.match(f.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(PINNED.map(p => [p.kind, p.url, p.sha256]), MICROPYTHON_JSPI_FILES.map(f => ['sha256', f.url, f.sha256]));
});

test('#5658 downloaded once, checked by its SHA-256, kept', async () => {
  const calls = [], fetch = fakeFetch({ 'https://example.test/micropython.mjs': MJS }, calls);
  const p = await micropythonJspiPath('micropython.mjs', { files: FILES, fetch });
  assert.equal(p, path.join(dir, 'micropython.mjs'));
  assert.deepEqual([...fs.readFileSync(p)], [...MJS]);
  assert.equal(await micropythonJspiPath('micropython.mjs', { files: FILES, fetch }), p);
  assert.deepEqual(calls, ['https://example.test/micropython.mjs'], 'downloaded once');
});

test('#5658 refused: another SHA-256 (nothing kept), an HTTP error, no network, a file that is none', async () => {
  const bad = [{ ...FILES[0], file: 'bad.mjs' }];
  await assert.rejects(micropythonJspiPath('bad.mjs', { files: bad, fetch: fakeFetch({ 'https://example.test/micropython.mjs': 'tampered' }, []) }),
    { message: `the test's module downloaded from https://example.test/micropython.mjs is not the one Silinx expects (its SHA-256 ${sha(new TextEncoder().encode('tampered'))}, not ${sha(MJS)}): not used` });
  assert.ok(!fs.existsSync(path.join(dir, 'bad.mjs')));
  await assert.rejects(micropythonJspiPath('bad.mjs', { files: bad, fetch: fakeFetch({}, []) }), { message: 'the test\'s module could not be downloaded from https://example.test/micropython.mjs (HTTP 404): the ESP32 node\'s JSPI back end needs it once' });
  await assert.rejects(micropythonJspiPath('bad.mjs', { files: bad, fetch: fakeFetch({ 'https://example.test/micropython.mjs': 'down' }, []) }), { message: 'the test\'s module could not be downloaded from https://example.test/micropython.mjs (getaddrinfo ENOTFOUND): the ESP32 node\'s JSPI back end needs it once' });
  await assert.rejects(micropythonJspiPath('../etc/passwd'), { message: 'no file \'../etc/passwd\' in Silinx\'s MicroPython build (micropython.mjs, micropython.wasm)' });
});

test('#5658 the back end: JSPI where WebAssembly has Suspending and promising (the server\'s loader set), else the Worker; forced either way', () => {
  const jspi = { WebAssembly: { Suspending: function () {}, promising: () => {} } };
  assert.equal(esp32Backend(jspi), 'jspi');
  assert.equal(esp32Backend({ WebAssembly: { promising: () => {} } }), 'worker');
  assert.equal(esp32Backend({ WebAssembly: {} }), 'worker');
  assert.equal(esp32Backend(jspi, 'worker'), 'worker');
  assert.equal(esp32Backend({ WebAssembly: {} }, 'jspi'), 'jspi');
  assert.equal(esp32Backend(jspi, 'other'), 'jspi');
});
