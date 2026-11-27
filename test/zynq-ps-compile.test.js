// A Zynq board's PS program compiled (#4687, part 1; core/zynq-ps-compile.js): its sources (a System node's ps/, a Board
// project's ps/ at its root; a user's startup or linker script in place of Silinx's), the refusals, the compiler's
// command, its messages by the project's file (the OCM overflowed said as such), its ELF checked in the on-chip memory.
// Silinx's startup code and the starter program assembled and compiled for the Cortex-A9 by the host's clang where it
// targets ARM, with no warning; linked by arm-none-eabi-gcc where it is installed (each skipped, said why, elsewhere).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { OCM, STACK, PS_STARTUP, PS_LINKER_SCRIPT, psProgram, psBuildDir, psCommand, psFileOf, psMessages, psElf } from '../core/zynq-ps-compile.js';
import { psOfBoard, psStarter } from '../core/zynq-ps.js';
import { writeElf32 } from './fixtures/arm-gcc-stub/elf.mjs';

const zybo = { id: 'zybo', kind: 'fpga', board: 'zybo-z7', variant: '20' };
const board = { id: 'top', kind: 'fpga', board: 'arty-z7', implicit: true };
const B = new Uint8Array([0xfe, 0xff, 0xff, 0xea]);

test('#4687 the program\'s sources: a System node\'s ps/, a Board project\'s ps/; its startup and linker script Silinx\'s or the user\'s', () => {
  const files = ['zybo/ps/main.c', 'zybo/ps/uart.h', 'zybo/ps/lib/fifo.c', 'zybo/ps/boot.s', 'zybo/top.vhd', 'zybo/ps.c', 'other/ps/x.c', 'ps/main.c'];
  assert.deepEqual(psProgram(zybo, files), { dir: 'zybo/ps', sources: ['zybo/ps/boot.s', 'zybo/ps/lib/fifo.c', 'zybo/ps/main.c', 'zybo/ps/uart.h'],
    units: ['zybo/ps/boot.s', 'zybo/ps/lib/fifo.c', 'zybo/ps/main.c'], startup: null, script: null, elf: 'out/zybo.elf' });
  assert.deepEqual(psProgram(board, files), { dir: 'ps', sources: ['ps/main.c'], units: ['ps/main.c'], startup: null, script: null, elf: 'out/ps.elf' });
  const own = psProgram(zybo, ['zybo/ps/main.c', 'zybo/ps/Startup.S', 'zybo/ps/mine.ld']);
  assert.deepEqual([own.startup, own.script], ['zybo/ps/Startup.S', 'zybo/ps/mine.ld']);
  assert.deepEqual([psBuildDir(zybo), psBuildDir(board)], ['build/nodes/zybo/ps', 'build/ps']);
});

test('#4687 the refusals: a board with no PS, no C in ps/, two linker scripts', () => {
  assert.deepEqual(psProgram({ id: 'b3', kind: 'fpga', board: 'basys3' }, ['b3/ps/main.c']), { error: 'b3: its board basys3 has no processing system (a Zynq board\'s: the Zybo Z7, the Arty Z7)' });
  assert.deepEqual(psProgram({ ...board, board: null }, ['ps/main.c']), { error: 'the project: its board (none) has no processing system (a Zynq board\'s: the Zybo Z7, the Arty Z7)' });
  assert.deepEqual(psProgram(zybo, ['zybo/ps/boot.S', 'zybo/ps/a.h']), { error: 'zybo: no C in its zybo/ps/ (its PS program: a .c, New Source\'s PS Program)' });
  assert.deepEqual(psProgram(board, []), { error: 'the project: no C in its ps/ (its PS program: a .c, New Source\'s PS Program)' });
  assert.deepEqual(psProgram(zybo, ['zybo/ps/main.c', 'zybo/ps/a.ld', 'zybo/ps/b.ld']), { error: 'zybo: two linker scripts in its zybo/ps/ (zybo/ps/a.ld, zybo/ps/b.ld): one, or none for Silinx\'s' });
});

test('#4687 the command: the Cortex-A9\'s options, Silinx\'s linker script and startup, or the user\'s', () => {
  const prog = psProgram(zybo, ['zybo/ps/main.c', 'zybo/ps/lib/fifo.c']);
  const flags = ['-mcpu=cortex-a9', '-marm', '-mfloat-abi=soft', '-O2', '-g', '-Wall', '-ffreestanding', '-nostartfiles', '--specs=nosys.specs'];
  assert.deepEqual(psCommand({ gcc: '/opt/arm/bin/arm-none-eabi-gcc', prog, units: ['src/lib/fifo.c', 'src/main.c'] }), ['/opt/arm/bin/arm-none-eabi-gcc',
    [...flags, '-T', 'silinx/ps.ld', 'silinx/startup.S', 'src/lib/fifo.c', 'src/main.c', '-o', 'out/zybo.elf', '-Wl,-Map=out/zybo.map']]);
  const own = psProgram(board, ['ps/main.c', 'ps/crt0.S', 'ps/ld/my.ld']);
  assert.deepEqual(psCommand({ gcc: 'gcc', prog: own, units: ['src/crt0.S', 'src/main.c'] })[1].slice(flags.length), ['-T', 'src/ld/my.ld', 'src/crt0.S', 'src/main.c', '-o', 'out/ps.elf', '-Wl,-Map=out/ps.map']);
});

test('#4687 the messages: gcc\'s by the project\'s file, Silinx\'s startup named as such; the OCM overflowed; once each', () => {
  const prog = psProgram(zybo, ['zybo/ps/main.c']);
  const dir = '/w/p/build/nodes/zybo/ps';
  const text = ['src/main.c: In function \'main\':', 'src/main.c:12:3: warning: unused variable \'x\' [-Wunused-variable]', `${dir}/src/main.c:14:9: error: expected ';' before '}' token`,
    'silinx/startup.S:20: Error: bad instruction', 'src/main.c:12:3: warning: unused variable \'x\' [-Wunused-variable]',
    '/opt/arm/bin/../arm-none-eabi/bin/ld: region `OCM\' overflowed by 1200 bytes', 'collect2: error: ld returned 1 exit status'].join('\n');
  const m = psMessages(text, (p) => psFileOf(p, dir, prog));
  assert.deepEqual(m, {
    errors: ['ERROR: Silinx\'s startup.S:20: bad instruction', 'ERROR: zybo/ps/main.c:14:9: expected \';\' before \'}\' token', 'ERROR: collect2: error: ld returned 1 exit status',
      `ERROR: the program does not fit in the on-chip memory's 192 KB (its stack's ${STACK / 1024} KB included): 1200 bytes too many`],
    warnings: ['WARNING: zybo/ps/main.c:12:3: unused variable \'x\' [-Wunused-variable]'],
  });
  assert.deepEqual(psMessages(''), { errors: [], warnings: [] });
  assert.equal(psFileOf('/elsewhere/x.c', dir, prog), null);
});

test('#4687 the ELF checked: in the OCM\'s low 192 KB, its entry there; outside it, not an ARM executable, nothing to load', () => {
  const e = psElf(writeElf32([{ addr: 0, bytes: B, memsz: 0x100 }]));
  assert.deepEqual([e.entry, e.size, e.memsz], [0, 4, 0x100]);
  assert.deepEqual(OCM, { start: 0, end: 0x30000 });
  assert.equal(psElf(writeElf32([{ addr: 0x2fffc, bytes: B }], { entry: 0x2fffc })).entry, 0x2fffc);
  assert.deepEqual(psElf(writeElf32([{ addr: 0x2fffc, bytes: B, memsz: 8 }])), { error: 'its ELF: a segment at 0x0002FFFC–0x00030003, outside the on-chip memory\'s 0x00000000–0x0002FFFF (its linker script)' });
  assert.deepEqual(psElf(writeElf32([{ addr: 0x00100000, bytes: B }])), { error: 'its ELF: a segment at 0x00100000–0x00100003, outside the on-chip memory\'s 0x00000000–0x0002FFFF (its linker script)' });
  assert.deepEqual(psElf(writeElf32([{ addr: 0, bytes: B }], { entry: 0xffff0000 })), { error: 'its ELF: its entry point 0xFFFF0000 is outside the on-chip memory' });
  assert.deepEqual(psElf(writeElf32([], { machine: 62 })), { error: 'its ELF: not an ARM program (its machine 62)' });
  assert.deepEqual(psElf(writeElf32([])), { error: 'its ELF: nothing to load' });
});

test('#4687 Silinx\'s startup and linker script: the vectors first at 0, the stack at the top of the OCM\'s 192 KB', () => {
  assert.match(PS_LINKER_SCRIPT, /OCM \(rwx\) : ORIGIN = 0x00000000, LENGTH = 0x00030000/);
  assert.match(PS_LINKER_SCRIPT, /\.text : \{ KEEP\(\*\(\.vectors\)\) /);
  assert.match(PS_LINKER_SCRIPT, /\. = \. \+ 0x00004000; __stack_top = \.;/);
  assert.match(PS_STARTUP, /\.section \.vectors, "ax"\n {2}\.global _start\n_start:\n {2}b _reset/);
  assert.match(PS_STARTUP, /ldr sp, =__stack_top[\s\S]*strlo r2, \[r0\], #4[\s\S]*bl main/);
});

// the host's clang, when it targets ARM (macOS's does)
const clangArm = (() => {
  const r = spawnSync('clang', ['--print-targets'], { encoding: 'utf8' });
  return r.status === 0 && /\barm\b/.test(r.stdout) ? null : 'no clang targeting ARM on this computer';
})();

test('#4687 Silinx\'s startup assembled and the starter compiled for the Cortex-A9 by clang: no warning', { skip: clangArm || false }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ps-clang-'));
  try {
    fs.writeFileSync(path.join(dir, 'startup.S'), PS_STARTUP);
    fs.writeFileSync(path.join(dir, 'main.c'), psStarter(psOfBoard('zybo-z7'), 'Digilent Zybo Z7'));
    const cc = (f) => execFileSync('clang', ['-target', 'armv7a-none-eabi', '-mcpu=cortex-a9', '-marm', '-mfloat-abi=soft', '-O2', '-Wall', '-Wextra', '-ffreestanding', '-c', f, '-o', `${f}.o`], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(cc('startup.S'), '');
    const r = spawnSync('clang', ['-target', 'armv7a-none-eabi', '-mcpu=cortex-a9', '-marm', '-mfloat-abi=soft', '-O2', '-Wall', '-Wextra', '-ffreestanding', '-c', 'main.c', '-o', 'main.o'], { cwd: dir, encoding: 'utf8' });
    assert.deepEqual([r.status, r.stderr], [0, '']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

const gcc = spawnSync('arm-none-eabi-gcc', ['--version']).status === 0 ? null : 'no arm-none-eabi-gcc on this computer';

test('#4687 the starter linked by arm-none-eabi-gcc with Silinx\'s startup and linker script: no warning, its ELF in the OCM', { skip: gcc || false }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ps-gcc-'));
  try {
    fs.mkdirSync(path.join(dir, 'silinx')); fs.mkdirSync(path.join(dir, 'src')); fs.mkdirSync(path.join(dir, 'out'));
    fs.writeFileSync(path.join(dir, 'silinx/startup.S'), PS_STARTUP);
    fs.writeFileSync(path.join(dir, 'silinx/ps.ld'), PS_LINKER_SCRIPT);
    fs.writeFileSync(path.join(dir, 'src/main.c'), psStarter(psOfBoard('zybo-z7'), 'Digilent Zybo Z7'));
    const [cmd, args] = psCommand({ gcc: 'arm-none-eabi-gcc', prog: psProgram(zybo, ['zybo/ps/main.c']), units: ['src/main.c'] });
    const r = spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' });
    assert.deepEqual([r.status, psMessages(`${r.stdout}\n${r.stderr}`)], [0, { errors: [], warnings: [] }]);
    const e = psElf(fs.readFileSync(path.join(dir, 'out/zybo.elf')));
    assert.equal(e.error, undefined);
    assert.equal(e.entry, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
