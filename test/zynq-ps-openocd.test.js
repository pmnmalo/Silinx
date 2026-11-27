// A Zynq board's PS program's OpenOCD script (#4687, part 3b; core/zynq-ps-openocd.js), from the same checked plan as
// Silinx's own engine (core/zynq-ps-load.js): the board's Digilent FT2232H, OpenOCD's zynq_7000.cfg, CPU 0 halted, its MMU
// and caches off, ps7_init, the segments loaded and verified, the CPSR, the resume at the entry; refused out of its
// bounds with nothing written. The script's writes checked against the engine's: its lines run by a small interpreter
// (mww, mmw, the poll, load_image) on one simulated chip, the engine on another, the same SLCR and OCM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { psOpenocdScript, blockBytes, openocdMessages, OPENOCD_KHZ } from '../core/zynq-ps-openocd.js';
import { psLoadPlan, loadPs } from '../core/zynq-ps-load.js';
import { psElf } from '../core/zynq-ps-compile.js';
import { psOfBoard } from '../core/zynq-ps.js';
import { Adept, Djtg, Chain } from '../core/adept.js';
import { simZynqBoard, SimZynqDap } from './fixtures/zynq-dap-sim.js';
import { writeElf32 } from './fixtures/arm-gcc-stub/elf.mjs';

const elf = (n = 3000, addr = 0, entry = addr) => psElf(writeElf32([{ addr, bytes: Uint8Array.from({ length: n }, (_, i) => (i * 13) & 0xff) }], { entry }));
const plan = (e = elf()) => psLoadPlan({ elf: e, ps: psOfBoard('zybo-z7') });

test('#4687 the script: the Digilent cable, zynq_7000.cfg, CPU 0 halted with its MMU and caches off, ps7_init, the program loaded and verified, resumed at the entry', () => {
  const p = plan(elf(3000, 0, 0x20));
  const { tcl, files } = psOpenocdScript(p);
  const lines = tcl.split('\n');
  assert.deepEqual(lines.slice(2, 17), ['adapter driver ftdi', 'ftdi vid_pid 0x0403 0x6010', 'ftdi channel 0', 'ftdi layout_init 0x00e8 0x60eb', 'reset_config none',
    'transport select jtag', `adapter speed ${OPENOCD_KHZ}`, 'source [find target/zynq_7000.cfg]', 'init', 'targets zynq.cpu0', 'halt',
    '# CPU 0\'s MMU and caches off (SCTLR\'s M, C, I), its instruction cache and branch predictor invalidated',
    'arm mcr 15 0 1 0 0 [expr {[arm mrc 15 0 1 0 0] & ~0x1005}]', 'arm mcr 15 0 7 5 0 0', 'arm mcr 15 0 7 5 6 0']);
  assert.deepEqual(lines.slice(-7), ['load_image ps-0.bin 0x00000000 bin', 'verify_image ps-0.bin 0x00000000 bin',
    '# the Supervisor mode, ARM state, interrupts off; CPU 0 started at the entry', 'reg cpsr 0x1d3', 'resume 0x00000020', 'shutdown', '']);
  // (its writes: ps7_init's, in order; the first the SLCR unlocked, the last locked again; its polls the PLLs' locks)
  const ops = lines.filter((l) => /^(mww|mmw|silinx_poll) /.test(l));
  assert.equal(ops.length, p.init.length);
  assert.deepEqual([ops[0], ops.at(-1)], ['mww 0xF8000008 0x0000DF0D', 'mww 0xF8000004 0x0000767B']);
  assert.deepEqual(ops.filter((l) => l.startsWith('silinx_poll')), ['silinx_poll 0xF800010C 0x00000001 PLL_STATUS', 'silinx_poll 0xF800010C 0x00000004 PLL_STATUS']);
  assert.ok(ops.every((l) => /^\S+ 0xF8000[0-9A-F]{3} /.test(l)), 'every write a register of the SLCR');
  assert.deepEqual(files.map((f) => [f.name, f.bytes.length]), [['ps-0.bin', 3000]]);
  assert.deepEqual([...blockBytes(new Uint32Array([0x04030201, 0xdeadbeef]))], [1, 2, 3, 4, 0xef, 0xbe, 0xad, 0xde]);
});

test('#4687 the script refused out of its bounds, before anything is written: its entry, a segment, ps7_init\'s register', () => {
  const p = plan();
  assert.deepEqual(psOpenocdScript({ ...p, entry: 0xffff0000 }), { error: 'the PS program is not loaded: its entry 0xFFFF0000: outside the on-chip memory' });
  assert.deepEqual(psOpenocdScript({ ...p, blocks: [{ addr: 0x2fff0, words: new Uint32Array(8) }] }), { error: 'the PS program is not loaded: a segment at 0x0002FFF0–0x0003000F: outside the on-chip memory\'s 0x00000000–0x0002FFFF' });
  assert.deepEqual(psOpenocdScript({ ...p, init: [...p.init, { op: 'write', addr: 0xf8f00000, reg: 'SCU', value: 0 }] }), { error: 'the PS program is not loaded: ps7_init: 0xF8F00000 (SCU) is not a register of the SLCR' });
});

// the script's memory commands run on a simulated chip: mww, mmw (addr set clear), the poll, load_image of its files
function runScript(tcl, files, dap) {
  const file = Object.fromEntries(files.map((f) => [f.name, f.bytes]));
  for (const l of tcl.split('\n')) {
    const [cmd, ...a] = l.split(' ');
    const n = (s) => Number(s) >>> 0;
    if (cmd === 'mww') dap.ahbWrite(n(a[0]), n(a[1]));
    if (cmd === 'mmw') dap.ahbWrite(n(a[0]), ((dap.ahbRead(n(a[0])) & ~n(a[2])) | n(a[1])) >>> 0);
    if (cmd === 'silinx_poll') assert.equal(dap.ahbRead(n(a[0])) & n(a[1]), n(a[1]));
    if (cmd === 'load_image') { const b = file[a[0]]; for (let i = 0; i < b.length; i += 4) dap.ahbWrite(n(a[1]) + i, (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0); }
  }
}

test('#4687 the script\'s writes the engine\'s: the same SLCR and OCM on two simulated chips', async () => {
  const p = plan();
  const { tcl, files } = psOpenocdScript(p);
  const byScript = new SimZynqDap();
  runScript(tcl, files, byScript);
  const sim = simZynqBoard();
  const chain = new Chain(new Djtg(await new Adept(sim.board).open(), 0));
  await chain.init();
  await loadPs(chain, p);
  assert.deepEqual([...byScript.slcr.entries()].sort(), [...sim.dap.slcr.entries()].sort());
  assert.deepEqual([...byScript.ocm], [...sim.dap.ocm]);
});

test('#4687 OpenOCD\'s messages: its errors and warnings, once each; its other lines none', () => {
  const text = ['Open On-Chip Debugger 0.12.0', 'Info : clock speed 6000 kHz', 'Warn : Transport "jtag" was already selected',
    'Error: unable to open ftdi device with description \'*\', serial \'*\' at bus location \'*\'', 'Error: unable to open ftdi device with description \'*\', serial \'*\' at bus location \'*\''].join('\n');
  assert.deepEqual(openocdMessages(text), { errors: ['ERROR: OpenOCD: unable to open ftdi device with description \'*\', serial \'*\' at bus location \'*\''],
    warnings: ['WARNING: OpenOCD: Transport "jtag" was already selected'] });
  assert.deepEqual(openocdMessages(''), { errors: [], warnings: [] });
});
