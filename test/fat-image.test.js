// A FAT12 drive's image (#5697, core/fat-image.js): CircuitPython's CIRCUITPY drive made by Silinx. Read back by a reader
// of the test's own, written from the FAT specification (its boot sector, its FAT's 12-bit entries, its directories'
// short and long names), not from the writer: the files and folders as given, their names as given (8.3 in capitals,
// lower case by its case flags, long ones by their VFAT entries and checksum), their data whole across clusters, the
// volume's label, the same image for the same files; refused: files that do not fit, a name both a file and a folder,
// '..'. The real CircuitPython reads it too (test/system-sim-circuitpython.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fatImage } from '../core/fat-image.js';

// the image read: { label, type, files: { path: text } } (a folder's files as path/name)
function readFat(img) {
  const v = new DataView(img.buffer, img.byteOffset, img.byteLength);
  const bps = v.getUint16(11, true), spc = img[13], reserved = v.getUint16(14, true), fats = img[16];
  const rootEntries = v.getUint16(17, true), fatSize = v.getUint16(22, true), total = v.getUint16(19, true);
  const fatAt = reserved * bps, rootAt = (reserved + fats * fatSize) * bps, dataAt = rootAt + rootEntries * 32;
  const clusters = Math.floor((total * bps - dataAt) / (spc * bps));
  const next = c => { const o = fatAt + Math.floor(c * 3 / 2), w = img[o] | (img[o + 1] << 8); return c & 1 ? w >> 4 : w & 0xfff; };
  const chain = c => { const out = []; while (c >= 2 && c < 0xff8) { out.push(c); c = next(c); } return out; };
  const clusterBytes = c => img.subarray(dataAt + (c - 2) * spc * bps, dataAt + (c - 1) * spc * bps);
  const dirBytes = c => { const parts = chain(c).map(clusterBytes), out = new Uint8Array(parts.length * spc * bps); parts.forEach((p, i) => out.set(p, i * spc * bps)); return out; };
  const text = (b, a, n) => String.fromCharCode(...b.subarray(a, a + n));
  let label = null;
  const files = {};
  const walk = (bytes, prefix) => {
    let lfn = [];
    for (let o = 0; o + 32 <= bytes.length; o += 32) {
      const e = bytes.subarray(o, o + 32);
      if (e[0] === 0) break;
      if (e[0] === 0xe5) { lfn = []; continue; }
      if (e[11] === 0x0f) {
        const ev = new DataView(e.buffer, e.byteOffset, 32);
        const units = [1, 3, 5, 7, 9, 14, 16, 18, 20, 22, 24, 28, 30].map(k => ev.getUint16(k, true));
        lfn.unshift({ seq: e[0] & 0x1f, sum: e[13], units });
        continue;
      }
      const raw = text(e, 0, 11);
      if (e[11] & 0x08) { label = raw.trimEnd(); lfn = []; continue; }
      let base = raw.slice(0, 8).trimEnd(), ext = raw.slice(8).trimEnd();
      if (e[12] & 0x08) base = base.toLowerCase();
      if (e[12] & 0x10) ext = ext.toLowerCase();
      let name = ext ? `${base}.${ext}` : base;
      if (lfn.length) {
        let sum = 0;
        for (let i = 0; i < 11; i++) sum = (((sum & 1) << 7) + (sum >> 1) + e[i]) & 0xff;
        assert.ok(lfn.every((p, i) => p.sum === sum && p.seq === i + 1), `${name}: its long name's entries`);
        const units = lfn.flatMap(p => p.units), end = units.indexOf(0);
        name = String.fromCharCode(...units.slice(0, end < 0 ? units.length : end));
      }
      lfn = [];
      if (name === '.' || name === '..') continue;
      const ev = new DataView(e.buffer, e.byteOffset, 32), first = ev.getUint16(26, true), size = ev.getUint32(28, true);
      if (e[11] & 0x10) walk(dirBytes(first), `${prefix}${name}/`);
      else { const d = first ? dirBytes(first).subarray(0, size) : new Uint8Array(); files[`${prefix}${name}`] = new TextDecoder().decode(d); }
    }
  };
  walk(img.subarray(rootAt, rootAt + rootEntries * 32), '');
  return { label, type: text(img, 54, 8).trim(), clusters, signature: v.getUint16(510, true), files };
}

test('#5697 a FAT12 image: its files and folders read back, their names as given, their data whole', () => {
  const big = Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n');   // (several clusters)
  const files = [
    { name: 'code.py', data: 'print("hello")\n' },
    { name: 'README', data: 'no extension' },
    { name: 'BOOT_OUT.TXT', data: 'capitals' },
    { name: 'settings.toml', data: 'X = 1\n' },
    { name: 'lib/helper_with_a_long_name.py', data: big },
    { name: 'lib/sub/deep.py', data: 'Y = 2\n' },
    { name: 'Mixed.Py', data: 'mixed case: a long name' },
    { name: 'empty.txt', data: '' },
    { name: 'bytes.bin', data: new Uint8Array([0x41, 0x42]) },
  ];
  const img = fatImage(files, { size: 1 << 20, label: 'CIRCUITPY' });
  assert.equal(img.length, 1 << 20);
  const r = readFat(img);
  assert.deepEqual([r.label, r.type, r.signature, r.clusters < 4085], ['CIRCUITPY', 'FAT12', 0xaa55, true]);
  assert.deepEqual(r.files, Object.fromEntries(files.map(f => [f.name, typeof f.data === 'string' ? f.data : 'AB'])));
  // (the same files: the same image, its times fixed)
  assert.deepEqual(fatImage(files, { size: 1 << 20, label: 'CIRCUITPY' }), img);
});

test('#5697 two long names of the same start: their short aliases told apart (~1, ~2)', () => {
  const img = fatImage([{ name: 'long_module_one.py', data: '1' }, { name: 'long_module_two.py', data: '2' }], { size: 1 << 20 });
  const r = readFat(img);
  assert.deepEqual(r.files, { 'long_module_one.py': '1', 'long_module_two.py': '2' });
  const root = img.subarray((1 + img[22]) * 512, (1 + img[22]) * 512 + 512);
  const shorts = [];
  for (let o = 0; o < 512; o += 32) if (root[o] && root[o + 11] !== 0x0f && !(root[o + 11] & 0x08)) shorts.push(String.fromCharCode(...root.subarray(o, o + 11)));
  assert.deepEqual(shorts, ['LONG_M~1PY ', 'LONG_M~2PY ']);
});

test('#5697 refused: files that do not fit, a name both a file and a folder, a name that is none', () => {
  assert.throws(() => fatImage([{ name: 'big.bin', data: new Uint8Array(70 * 1024) }], { size: 64 * 1024 }), { message: 'the files do not fit on a drive of 65536 bytes' });
  assert.throws(() => fatImage([{ name: 'lib', data: 'x' }, { name: 'lib/a.py', data: 'y' }]), { message: 'lib is a file and a folder' });
  assert.throws(() => fatImage([{ name: 'lib/a.py', data: 'y' }, { name: 'lib', data: 'x' }]), { message: 'lib is a file and a folder' });
  assert.throws(() => fatImage([{ name: '../x.py', data: '' }]), { message: 'no file name \'../x.py\'' });
  assert.throws(() => fatImage([], { size: 512 }), { message: 'a FAT12 drive of 512 bytes cannot be made' });
});
