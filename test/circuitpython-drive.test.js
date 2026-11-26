// A CircuitPython node's CIRCUITPY drive (#5697, core/circuitpython-drive.js): its files (the program as code.py, the
// node's others at their places, Silinx's own: settings.toml with no safe-mode wait after the node's own lines, boot.py
// setting the first run to silinx_wait.py after the node's own boot.py, boot_out.txt as the firmware writes it); its
// image the FAT drive at 1 MB in the flash; its console's escapes taken out, split or not; a run's traceback found.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driveFiles, driveImage, DRIVE_OFFSET, DRIVE_SIZE, ConsoleFilter, tracebackOf, WAIT_FILE } from '../core/circuitpython-drive.js';
import { runtimeFiles, RP2040_RUNTIMES, PINNED, RP2040_FILES } from '../core/rp2040-firmware.js';

const BOOT_OUT = 'Adafruit CircuitPython 10.3.2 on 2026-11-11; Raspberry Pi Pico with rp2040\r\nBoard ID:raspberry_pi_pico\r\nUID:0000000000000000\r\n';

test('#5697 the drive\'s files: the program as code.py, the node\'s others, Silinx\'s after the node\'s own', () => {
  const f = driveFiles({ program: { name: 'pico/main.py', data: 'print(1)\n' }, files: [{ name: 'lib/x.py', data: 'X = 1\n' }], bootOut: BOOT_OUT });
  const by = Object.fromEntries(f.map(x => [x.name, x.data]));
  assert.deepEqual(Object.keys(by).sort(), ['boot.py', 'boot_out.txt', 'code.py', 'lib/x.py', 'settings.toml', WAIT_FILE].sort());
  assert.equal(by['code.py'], 'print(1)\n');
  assert.equal(by['settings.toml'], 'CIRCUITPY_SAFE_MODE_DELAY = 0  # Silinx (the System simulation): no wait for the reset button\n');
  assert.equal(by['boot_out.txt'], `${BOOT_OUT}boot.py output:\r\n`);
  assert.match(by['boot.py'], /^import supervisor .*\nsupervisor\.set_next_code_file\("\/silinx_wait\.py"\)\n$/);
  assert.match(by[WAIT_FILE], /while not supervisor\.runtime\.serial_connected:\n {4}pass\nsupervisor\.set_next_code_file\(None\)\nsupervisor\.reload\(\)\n$/);
  // (the node's own settings.toml and boot.py first; its own delay kept; another code.py not over its program)
  const own = Object.fromEntries(driveFiles({ program: { data: 'P' }, files: [{ name: 'settings.toml', data: 'A = 1' }, { name: 'boot.py', data: 'print("b")' }, { name: 'code.py', data: 'other' }] }).map(x => [x.name, x.data]));
  assert.ok(own['settings.toml'].startsWith('A = 1\nCIRCUITPY_SAFE_MODE_DELAY = 0'));
  assert.ok(own['boot.py'].startsWith('print("b")\nimport supervisor'));
  assert.equal(own['code.py'], 'P');
  const delay = Object.fromEntries(driveFiles({ program: { data: '' }, files: [{ name: 'settings.toml', data: 'CIRCUITPY_SAFE_MODE_DELAY = 2\n' }] }).map(x => [x.name, x.data]));
  assert.equal(delay['settings.toml'], 'CIRCUITPY_SAFE_MODE_DELAY = 2\n');
});

test('#5697 the drive\'s image: 1 MB for 0x100000 in the flash, a FAT12 drive named CIRCUITPY', () => {
  assert.deepEqual([DRIVE_OFFSET, DRIVE_SIZE], [0x100000, 0x100000]);
  const img = driveImage({ program: { data: 'print(1)\n' }, bootOut: BOOT_OUT });
  assert.equal(img.length, DRIVE_SIZE);
  assert.deepEqual([String.fromCharCode(...img.subarray(43, 54)), String.fromCharCode(...img.subarray(54, 62)), img[510], img[511]], ['CIRCUITPY  ', 'FAT12   ', 0x55, 0xaa]);
});

test('#5697 the console: its status bar\'s escapes out, one split between two chunks too', () => {
  const f = new ConsoleFilter();
  assert.equal(f.push('\x1b]0;\xf0\x9f\x90\x8dcode.py | 10.3.2\x1b\\hello\r\n'), 'hello\r\n');
  assert.equal(f.push('a\x1b]0;tit'), 'a');
  assert.equal(f.push('le\x1b'), '');
  assert.equal(f.push('\\b\x1b[2K\x1b[0Gc\x1b]2;x\x07d'), 'bcd');
});

test('#5697 a run\'s traceback: from its first line to its error\'s; none without', () => {
  const out = 'code.py output:\r\nbefore\r\nTraceback (most recent call last):\r\n  File "code.py", line 2, in <module>\r\nZeroDivisionError: division by zero\r\n\r\n';
  assert.deepEqual(tracebackOf(out), ['Traceback (most recent call last):', '  File "code.py", line 2, in <module>', 'ZeroDivisionError: division by zero']);
  assert.equal(tracebackOf('code.py output:\r\nfine\r\n'), null);
});

test('#5697 the firmwares: MicroPython\'s the default, CircuitPython\'s pinned with its boot_out.txt; both followed by the Pins workflow', () => {
  assert.deepEqual(RP2040_RUNTIMES, ['micropython', 'circuitpython']);
  assert.equal(runtimeFiles().uf2.file, 'micropython-rpi-pico-v1.24.1.uf2');
  const cp = runtimeFiles('circuitpython');
  assert.deepEqual([cp.uf2.file, cp.uf2.bootOut, cp.bootrom.file], ['circuitpython-rpi-pico-v10.3.2.uf2', BOOT_OUT, 'rp2040-bootrom-b1.bin']);
  assert.throws(() => runtimeFiles('lua'), { message: 'no RP2040 firmware \'lua\' (micropython, circuitpython)' });
  assert.deepEqual(PINNED.map(p => [p.kind, p.tag ?? p.sha256]), [['tag', 'v1.24.1'], ['tag', '10.3.2'], ...RP2040_FILES.map(f => ['sha256', f.sha256])]);
});
