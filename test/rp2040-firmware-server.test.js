// The RP2040 node's firmware on the local server (#5494, server/rp2040-firmware.js), never the real download: a fake
// fetch and files of the test's own, pinned by their SHA-256. Downloaded once into the folder and served from it after; a
// bootrom's TypeScript words written as their bytes; a download whose SHA-256 is not the pinned one refused, nothing kept;
// an HTTP error and a network failure said; a file that is none refused; the page's route (/vendor/rp2040/<file>).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let dir, rp2040Path;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const UF2 = new TextEncoder().encode('a uf2 of the test');
const TS = '// words\nexport const bootromB1 = new Uint32Array([\n  0x20041f00, 0x000000ef,\n]);\n';
const FILES = [
  { file: 'mp.uf2', url: 'https://example.test/mp.uf2', sha256: sha(UF2), what: 'the test\'s uf2' },
  { file: 'boot.bin', url: 'https://example.test/bootrom.ts', sha256: sha(TS), what: 'the test\'s bootrom', words: true },
];
const fakeFetch = (served, calls) => async (url) => { calls.push(url); const b = served[url]; if (b === 'down') throw new Error('getaddrinfo ENOTFOUND'); return b == null ? { ok: false, status: 404 } : { ok: true, arrayBuffer: async () => (typeof b === 'string' ? new TextEncoder().encode(b) : b).buffer }; };

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-rp2040-fw-'));
  process.env.SILINX_RP2040_CACHE = dir;
  ({ rp2040Path } = await import('../server/rp2040-firmware.js'));
});
after(() => { delete process.env.SILINX_RP2040_CACHE; fs.rmSync(dir, { recursive: true, force: true }); });

test('#5494 downloaded once, checked by its SHA-256, kept; the bootrom\'s words as bytes', async () => {
  const calls = [], fetch = fakeFetch({ 'https://example.test/mp.uf2': UF2, 'https://example.test/bootrom.ts': TS }, calls);
  const p = await rp2040Path('mp.uf2', { files: FILES, fetch });
  assert.equal(p, path.join(dir, 'mp.uf2'));
  assert.deepEqual([...fs.readFileSync(p)], [...UF2]);
  assert.equal(await rp2040Path('mp.uf2', { files: FILES, fetch }), p);
  assert.deepEqual(calls, ['https://example.test/mp.uf2'], 'downloaded once');
  const b = await rp2040Path('boot.bin', { files: FILES, fetch });
  assert.deepEqual([...fs.readFileSync(b)], [0x00, 0x1f, 0x04, 0x20, 0xef, 0, 0, 0]);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['boot.bin', 'mp.uf2']);
});

test('#5494 refused: another SHA-256 (nothing kept), an HTTP error, no network, a file that is none', async () => {
  const bad = [{ ...FILES[0], file: 'bad.uf2' }];
  await assert.rejects(rp2040Path('bad.uf2', { files: bad, fetch: fakeFetch({ 'https://example.test/mp.uf2': 'tampered' }, []) }),
    { message: `the test's uf2 downloaded from https://example.test/mp.uf2 is not the one Silinx expects (its SHA-256 ${sha(new TextEncoder().encode('tampered'))}, not ${sha(UF2)}): not used` });
  assert.ok(!fs.existsSync(path.join(dir, 'bad.uf2')));
  await assert.rejects(rp2040Path('bad.uf2', { files: bad, fetch: fakeFetch({}, []) }), { message: 'the test\'s uf2 could not be downloaded from https://example.test/mp.uf2 (HTTP 404): the RP2040 node needs it once' });
  await assert.rejects(rp2040Path('bad.uf2', { files: bad, fetch: fakeFetch({ 'https://example.test/mp.uf2': 'down' }, []) }), { message: 'the test\'s uf2 could not be downloaded from https://example.test/mp.uf2 (getaddrinfo ENOTFOUND): the RP2040 node needs it once' });
  await assert.rejects(rp2040Path('../etc/passwd'), { message: 'no RP2040 firmware file \'../etc/passwd\' (micropython-rpi-pico-v1.24.1.uf2, rp2040-bootrom-b1.bin)' });
});
