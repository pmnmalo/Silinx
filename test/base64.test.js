// Bytes as base64 and base64url, one copy (#4772: core/base64.js). Its results against Node's Buffer (an independent
// reference), on the sizes that matter (empty, each padding, past the 32 KiB chunk, past one call's arguments); the
// names the old modules exported, still theirs and the same; and no module writing a copy again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toBase64, fromBase64, toBase64url, fromBase64url } from '../core/base64.js';
import { b64url } from '../core/collab-crypto.js';
import { toB64, fromB64 } from '../core/collab-resume.js';
import { fromBase64 as githubFromBase64 } from '../core/github-api.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// bytes of every value, of lengths 0 to 5 (each padding), a chunk's edge, and 1 MiB (one String.fromCharCode of all
// of it throws: the chunks are needed)
const bytesOf = n => Uint8Array.from({ length: n }, (_, i) => (i * 7919 + (i >> 8)) & 255);
const SIZES = [0, 1, 2, 3, 4, 5, 255, 256, 0x7fff, 0x8000, 0x8001, 3 * 0x8000 + 2, 1 << 20];

test('toBase64 / fromBase64: Buffer\'s base64, padded, both ways, every size', () => {
  for (const n of SIZES) {
    const b = bytesOf(n), want = Buffer.from(b).toString('base64');
    assert.equal(toBase64(b), want, `${n} bytes`);
    assert.deepEqual(fromBase64(want), b, `${n} bytes`);
    assert.ok(fromBase64(want) instanceof Uint8Array);
  }
  assert.equal(toBase64(Uint8Array.of(0xfb, 0xff)), '+/8=');
  assert.deepEqual(fromBase64('+/8='), Uint8Array.of(0xfb, 0xff));
  assert.deepEqual(fromBase64(''), new Uint8Array(0));
  // (a Buffer is bytes too: the tests' callers give one)
  assert.equal(toBase64(Buffer.from('Silinx')), 'U2lsaW54');
});

test('toBase64url / fromBase64url: Buffer\'s base64url, no padding written, padded or not read', () => {
  for (const n of SIZES) {
    const b = bytesOf(n), want = Buffer.from(b).toString('base64url');
    assert.equal(toBase64url(b), want, `${n} bytes`);
    assert.doesNotMatch(toBase64url(b), /[+/=]/);
    assert.deepEqual(fromBase64url(want), b, `${n} bytes`);
    assert.deepEqual(fromBase64url(want + '='.repeat((4 - want.length % 4) % 4)), b, `${n} bytes, padded`);
  }
  assert.equal(toBase64url(Uint8Array.of(0xfb, 0xff)), '-_8');
  assert.deepEqual(fromBase64url('-_8'), Uint8Array.of(0xfb, 0xff));
});

test('fromBase64 / fromBase64url: a text that is not base64 is atob\'s error', () => {
  for (const bad of ['a', 'abcde', '@@@@', 'ab cd!']) assert.throws(() => fromBase64(bad), { name: 'InvalidCharacterError' }, bad);
  for (const bad of ['a', 'abcde', '@@@@']) assert.throws(() => fromBase64url(bad), { name: 'InvalidCharacterError' }, bad);
});

test('the old modules\' names: the same results as their copies had', () => {
  const b = bytesOf(100);
  // core/collab-crypto.js b64url (a key's text, a room's id): its copy took any iterable of bytes, one by one
  assert.equal(b64url(b), Buffer.from(b).toString('base64url'));
  assert.equal(b64url(new Uint8Array(32)), 'A'.repeat(43));
  // core/collab-resume.js toB64 / fromB64 (a document's state in sessionStorage)
  assert.equal(toB64(b), Buffer.from(b).toString('base64'));
  assert.deepEqual(fromB64(toB64(b)), b);
  // core/github-api.js fromBase64 (a blob's content from GitHub: base64 with line breaks; none: no bytes)
  const wrapped = Buffer.from(bytesOf(200)).toString('base64').replace(/.{60}/g, '$&\n');
  assert.deepEqual(githubFromBase64(wrapped), bytesOf(200));
  assert.deepEqual(githubFromBase64(null), new Uint8Array(0));
  assert.deepEqual(githubFromBase64(''), new Uint8Array(0));
});

test('no module writes a base64url conversion again (#4772)', () => {
  const COPY = /\.replace\(\/-\/g, '\+'\)\.replace\(\/_\/g, '\/'\)|\.replace\(\/\\\+\/g, '-'\)\.replace\(\/\\\/\/g, '_'\)/;
  // (web/js/asset-cache.js turns a Subresource Integrity's base64 text into its key's base64url: a text, not bytes)
  const LEFT = new Set(['web/js/asset-cache.js']);
  const found = [];
  for (const dir of ['core', 'web/js', 'server']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir), { recursive: true })) {
      const rel = `${dir}/${f}`.replace(/\\/g, '/');
      if (!/\.m?js$/.test(rel) || rel === 'core/base64.js' || LEFT.has(rel)) continue;
      if (COPY.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'))) found.push(rel);
    }
  }
  assert.deepEqual(found, []);
});
