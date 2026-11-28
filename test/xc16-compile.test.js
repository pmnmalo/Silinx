// A PIC24 node's program compiled by XC16 (#5482, core/xc16-compile.js): its device's options (XC16's guide's: -mcpu,
// -omf=elf, the linker script, the heap; the free licence's -O1), the node's sources and units, the .hex it makes, the
// commands and the image's script, XC16's messages (gcc's, the assembler's, the linker's) as the console's lines, and a
// source's path in its build folder as the project's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { XC16_DEVICES, XC16_OPT, XC16_HEAP, XC16_IMAGE, isPic24, nodeProgram, pic24FileOf, pic24Sources, xc16Commands, xc16Messages, xc16Script } from '../core/xc16-compile.js';
import { mcuBoard } from '../core/system-doc.js';

const PIC = { id: 'pic', kind: 'mcu', board: 'explorer-1632', lang: 'c', firmware: 'pic/lcd_uart.hex' };
const FILES = ['uart_fpga_pic24.sys.json', 'pic/lcd_uart.asm', 'pic/lcd_uart.hex', 'pic/main.c', 'pic/lcd.h', 'pic/lib/delay.s', 'pic/lib/start.S',
  'pic/notes.txt', 'pic/build/x.c', 'pic2/other.c', 'fpga/uart.vhd'];

test('#5482 the device: the Explorer 16/32\'s PIC24FJ1024GB610, its family\'s linker script; -O1 the free licence\'s; a heap; the image', () => {
  assert.deepEqual(XC16_DEVICES, { 'explorer-1632': { mcpu: '24FJ1024GB610', family: 'PIC24F', gld: 'p24FJ1024GB610.gld' } });
  assert.equal(`PIC${XC16_DEVICES['explorer-1632'].mcpu}`, mcuBoard('explorer-1632').mcu, 'the board\'s microcontroller');
  assert.deepEqual([XC16_OPT, XC16_HEAP, XC16_IMAGE], ['-O1', 512, 'silinx/xc16:2.10']);
  assert.equal(isPic24(PIC), true);
  assert.equal(isPic24({ ...PIC, board: 'arduino-uno' }), false);
});

test('#5482 the node\'s sources: its folder\'s C, headers and assembly (.s, .S), sorted; MPASM\'s .asm, another node\'s and a build folder\'s not', () => {
  assert.deepEqual(pic24Sources(FILES, 'pic'), ['pic/lcd.h', 'pic/lib/delay.s', 'pic/lib/start.S', 'pic/main.c']);
  const p = nodeProgram(PIC, FILES);
  assert.deepEqual(p, { device: XC16_DEVICES['explorer-1632'], sources: ['pic/lcd.h', 'pic/lib/delay.s', 'pic/lib/start.S', 'pic/main.c'],
    units: ['pic/lib/delay.s', 'pic/lib/start.S', 'pic/main.c'], hex: 'pic/lcd_uart.hex' });
  assert.equal(nodeProgram({ ...PIC, firmware: null }, FILES).hex, 'pic/pic.hex', 'no firmware: <id>/<id>.hex');
  assert.equal(nodeProgram({ ...PIC, firmware: 'pic/x.elf' }, FILES).hex, 'pic/pic.hex', 'an .elf given: its .hex <id>/<id>.hex');
  assert.deepEqual(nodeProgram(PIC, ['pic/lcd_uart.asm', 'pic/lcd.h']), { error: 'pic: no C or assembly in its folder pic/ (a .c or a .s: write one)' });
  assert.deepEqual(nodeProgram({ ...PIC, board: 'arduino-uno' }, FILES), { error: 'pic: XC16 has no device for its board arduino-uno' });
});

test('#5482 the commands: xc16-gcc to the ELF (the device, ELF, -O1, -Wall, its units, its linker script, the heap, a map), xc16-bin2hex', () => {
  const device = XC16_DEVICES['explorer-1632'];
  assert.deepEqual(xc16Commands({ id: 'pic', device, units: ['src/main.c', 'src/lib/delay.s'], bin: '/x/v2.10/bin', root: '/x/v2.10' }), [
    ['/x/v2.10/bin/xc16-gcc', ['-mcpu=24FJ1024GB610', '-omf=elf', '-O1', '-Wall', '-o', 'out/pic.elf', 'src/main.c', 'src/lib/delay.s',
      '-T', '/x/v2.10/support/PIC24F/gld/p24FJ1024GB610.gld', '-Wl,--heap=512,-Map=out/pic.map']],
    ['/x/v2.10/bin/xc16-bin2hex', ['out/pic.elf', '-a', '-omf=elf']],
  ]);
});

test('#5482 the image\'s script: XC16 found ($XC16_BIN, the PATH, /opt/microchip/xc16), its commands, a source\'s name quoted; it runs in bash', { skip: process.platform === 'win32' && 'bash' }, () => {
  const device = XC16_DEVICES['explorer-1632'];
  const s = xc16Script({ id: 'pic', device, units: ["src/it's.c", 'src/main.c'] });
  assert.ok(s.startsWith('#!/bin/bash\n'));
  assert.ok(s.includes('ls -d /opt/microchip/xc16/*/bin/xc16-gcc'));
  assert.ok(s.endsWith(`"$XC16_BIN/xc16-gcc" -mcpu=24FJ1024GB610 -omf=elf -O1 -Wall -o out/pic.elf 'src/it'\\''s.c' src/main.c -T "$XC16_ROOT/support/PIC24F/gld/p24FJ1024GB610.gld" -Wl,--heap=512,-Map=out/pic.map || exit $?\n"$XC16_BIN/xc16-bin2hex" out/pic.elf -a -omf=elf\n`), s);
  // (run by bash with an XC16 that echoes its arguments, one a line: the quoted name one argument)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-xc16-sh-'));
  try {
    fs.mkdirSync(path.join(dir, 'bin'));
    for (const t of ['xc16-gcc', 'xc16-bin2hex']) fs.writeFileSync(path.join(dir, 'bin', t), `#!/bin/sh\nfor a in "$@"; do echo "${t} $a"; done\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'build.sh'), s);
    const out = execFileSync('bash', ['build.sh'], { cwd: dir, env: { ...process.env, XC16_BIN: path.join(dir, 'bin') }, encoding: 'utf8' }).split('\n');
    assert.ok(out.includes("xc16-gcc src/it's.c"), out.join('\n'));
    assert.ok(out.includes(`xc16-gcc ${dir}/support/PIC24F/gld/p24FJ1024GB610.gld`));
    assert.ok(out.includes('xc16-bin2hex -omf=elf'));
    assert.ok(fs.existsSync(path.join(dir, 'out')));
    // (no XC16 in the image: said, exit 127)
    let code = 0, err = '';
    try { execFileSync('bash', ['build.sh'], { cwd: dir, env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8', stdio: 'pipe' }); } catch (e) { code = e.status; err = e.stderr; }
    if (!fs.existsSync('/opt/microchip/xc16')) assert.deepEqual([code, err], [127, 'ERROR: no xc16-gcc in this image\n']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('#5482 XC16\'s messages: gcc\'s by file, line and column, the assembler\'s by file and line, the linker\'s, once each; its context and notes not', () => {
  const fileOf = p => pic24FileOf(p, '/w/build/nodes/pic/firmware', 'pic');
  const text = [
    "src/main.c: In function 'main':",
    "src/main.c:5:3: error: 'TRISQ' undeclared (first use in this function)",
    'src/main.c:5:3: note: each undeclared identifier is reported only once for each function it appears in',
    "src/main.c:9:1: warning: control reaches end of non-void function",
    'src/lib/delay.s:12: Error: Invalid mnemonic: \'movv\'',
    '/work/src/lib/delay.s:14: Warning: a warning of the assembler',
    'src/main.c:5:3: error: \'TRISQ\' undeclared (first use in this function)',
    '/opt/microchip/xc16/v2.10/bin/bin/elf-ld: Link Error: Could not allocate section .nbss, size = 9000 bytes, attributes = bss near',
    'build/main.o(.text+0x4): In function `main\':',
    "src/main.c:7: undefined reference to `delay_ms'",
    'Link Warning: a warning of the linker',
    'make: *** [out/pic.elf] Error 255',
  ].join('\n');
  assert.deepEqual(xc16Messages(text, fileOf), {
    errors: ['ERROR: pic/lib/delay.s:12: Invalid mnemonic: \'movv\'', 'ERROR: Could not allocate section .nbss, size = 9000 bytes, attributes = bss near',
      "ERROR: pic/main.c:5:3: 'TRISQ' undeclared (first use in this function)", "ERROR: undefined reference to `delay_ms'"],
    warnings: ['WARNING: pic/lib/delay.s:14: a warning of the assembler', 'WARNING: a warning of the linker', 'WARNING: pic/main.c:9:1: control reaches end of non-void function'],
  });
  assert.deepEqual(xc16Messages('', fileOf), { errors: [], warnings: [] });
});

test('#5482 a source\'s path as the project\'s: src/ relative to the build folder, under /work/ (the image\'s) or the folder\'s own; else null', () => {
  const dir = '/w/build/nodes/pic/firmware';
  assert.equal(pic24FileOf('src/main.c', dir, 'pic'), 'pic/main.c');
  assert.equal(pic24FileOf('./src/lib/a.s', dir, 'pic'), 'pic/lib/a.s');
  assert.equal(pic24FileOf('/work/src/main.c', dir, 'pic'), 'pic/main.c');
  assert.equal(pic24FileOf(`${dir}/src/main.c`, dir, 'pic'), 'pic/main.c');
  assert.equal(pic24FileOf('C:\\w\\build\\nodes\\pic\\firmware\\src\\main.c', 'C:\\w\\build\\nodes\\pic\\firmware', 'pic'), 'pic/main.c');
  assert.equal(pic24FileOf('/opt/microchip/xc16/v2.10/support/PIC24F/h/p24FJ1024GB610.h', dir, 'pic'), null);
});
