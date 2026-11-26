// A CircuitPython node's files copied to a real Pico's CIRCUITPY drive (#5697, server/circuitpy-copy.js), never a real
// drive: where each operating system mounts it (a listing of the test's), a drive told by its boot_out.txt, the files
// written whole at their places (a folder made), a name out of the node's folder refused, the hint said when none.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { driveCandidates, isCircuitpyDrive, circuitpyDrives, copyToDrive, copyHint } from '../server/circuitpy-copy.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-circuitpy-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('#5697 where a CIRCUITPY drive is mounted: macOS\'s /Volumes, Linux\'s media folders, Windows\' drives', () => {
  const ls = d => ({ '/Volumes': ['Macintosh HD', 'CIRCUITPY', 'CIRCUITPY 1'], '/media/ana': ['CIRCUITPY'], '/run/media/ana': [] }[d] ?? (() => { throw new Error('no folder'); })());
  assert.deepEqual(driveCandidates({ platform: 'darwin', ls }), ['/Volumes/CIRCUITPY', '/Volumes/CIRCUITPY 1']);
  assert.deepEqual(driveCandidates({ platform: 'linux', user: 'ana', ls }), ['/media/ana/CIRCUITPY']);
  const win = driveCandidates({ platform: 'win32' });
  assert.deepEqual([win[0], win.at(-1), win.length], ['D:\\', 'Z:\\', 23]);
});

test('#5697 a drive told by its boot_out.txt; the files written at their places; a name out of the folder refused', () => {
  const d = path.join(tmp, 'CIRCUITPY');
  fs.mkdirSync(d);
  assert.equal(isCircuitpyDrive(d), false);
  fs.writeFileSync(path.join(d, 'boot_out.txt'), 'Adafruit CircuitPython 10.3.2 on 2026-11-11; Raspberry Pi Pico with rp2040\r\n');
  assert.equal(isCircuitpyDrive(d), true);
  process.env.SILINX_CIRCUITPY = d;
  try { assert.deepEqual(circuitpyDrives(), [d]); } finally { delete process.env.SILINX_CIRCUITPY; }
  assert.deepEqual(copyToDrive(d, { program: { data: 'print(1)\n' }, files: [{ name: 'lib/a.py', data: 'A = 1\n' }, { name: 'data.bin', data: new Uint8Array([1, 2]) }] }), ['code.py', 'lib/a.py', 'data.bin']);
  assert.deepEqual([fs.readFileSync(path.join(d, 'code.py'), 'utf8'), fs.readFileSync(path.join(d, 'lib/a.py'), 'utf8'), [...fs.readFileSync(path.join(d, 'data.bin'))]], ['print(1)\n', 'A = 1\n', [1, 2]]);
  assert.deepEqual(fs.readdirSync(d).sort(), ['boot_out.txt', 'code.py', 'data.bin', 'lib'], 'no temporary file left');
  assert.throws(() => copyToDrive(d, { program: { data: '' }, files: [{ name: '../x.py', data: '' }] }), { message: '\'../x.py\' is not a file of the node\'s folder' });
  assert.equal(copyHint('pico/main.py'), 'copy pico/main.py as code.py to the Pico\'s CIRCUITPY drive (the Pico running CircuitPython, connected by USB)');
});
