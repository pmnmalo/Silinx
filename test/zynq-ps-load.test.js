// A Zynq board's PS program loaded over JTAG and started (#4687, part 3; core/arm-dap.js, core/zynq-ps-load.js), on a
// simulated Zybo Z7 chain (test/fixtures/zynq-dap-sim.js: the ARM DAP's JTAG-DP, its AHB-AP with the OCM and the SLCR,
// its APB-AP with CPU 0's debug registers, beside the PL's TAP): the DAP powered up, its words and blocks (across the
// 1 KB wrap), a WAIT retried, a FAULT said; the plan's bounds refused before any write, every write the DAP makes
// inside them (the OCM's low 192 KB, ps7_init's registers of the SLCR, CPU 0's debug registers); CPU 0 halted before
// the first, its MMU and caches off, ps7_init's values, the program read back, CPU 0 started at its entry in the
// Supervisor mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Adept, Djtg, Chain } from '../core/adept.js';
import { ArmDap, CortexA9, AHB_AP, APB_AP, CPU0_DEBUG, DBG, OP } from '../core/arm-dap.js';
import { psLoadPlan, planRefusal, writeGuard, loadPs, wordsOf, SLCR_WINDOW } from '../core/zynq-ps-load.js';
import { psElf } from '../core/zynq-ps-compile.js';
import { psOfBoard } from '../core/zynq-ps.js';
import { ps7Init } from '../core/zynq-ps7.js';
import { simZynqBoard } from './fixtures/zynq-dap-sim.js';
import { SimAdeptBoard } from './fixtures/adept-sim.js';
import { writeElf32 } from './fixtures/arm-gcc-stub/elf.mjs';

async function chainOf(opts) {
  const sim = simZynqBoard(opts);
  const chain = new Chain(new Djtg(await new Adept(sim.board).open(), 0));
  await chain.init();
  return { ...sim, chain };
}
const ZYBO = psOfBoard('zybo-z7');
const program = (n = 3000, addr = 0, entry = addr) => writeElf32([{ addr, bytes: Uint8Array.from({ length: n }, (_, i) => (i * 7) & 0xff) }, { addr: addr + n + 4, bytes: new Uint8Array(0), memsz: 0x4000 }], { entry });
const planOf = (elf = program()) => psLoadPlan({ elf: psElf(elf), ps: ZYBO });
const DEBUG = new Set(Object.values(DBG).map((r) => CPU0_DEBUG + r));

test('#4687 the DAP: on the chain beside the PL, powered up; words and a block across the 1 KB wrap written and read', async () => {
  const { chain, dap: sim } = await chainOf();
  assert.deepEqual(chain.devices.map((d) => d.name), ['xc7z020', 'arm_dap']);
  const dap = new ArmDap(chain);
  await dap.powerUp();
  await dap.write(AHB_AP, [[0x100, 0x11223344], [0x104, 0xdeadbeef]]);
  assert.deepEqual([await dap.read(AHB_AP, 0x100), await dap.read(AHB_AP, 0x104)], [0x11223344, 0xdeadbeef]);
  const words = Uint32Array.from({ length: 600 }, (_, i) => (i * 0x01010101) >>> 0);
  await dap.writeBlock(AHB_AP, 0x3f0, words);
  assert.deepEqual([...sim.ocm.subarray(0x3f0 / 4, 0x3f0 / 4 + 600)], [...words]);
  assert.deepEqual([...await dap.readBlock(AHB_AP, 0x3f0, 600)], [...words]);
  // (its writes at the addresses written, one each: the TAR set again at each 1 KB)
  assert.deepEqual(sim.writes.filter((w) => w.addr >= 0x3f0).map((w) => w.addr), Array.from(words, (_, i) => 0x3f0 + i * 4));
});

test('#4687 the DAP: a WAIT retried with more idle clocks; one that does not end, said; no DAP on a Basys 2\'s chain', async () => {
  const w = await chainOf({ waits: 3 });
  const dap = new ArmDap(w.chain);
  await dap.write(AHB_AP, [[0x200, 0xcafe]]);
  assert.equal(w.dap.ocm[0x200 / 4], 0xcafe);
  const stuck = await chainOf({ waits: 1000 });
  await assert.rejects(new ArmDap(stuck.chain, { retries: 2 }).write(AHB_AP, [[0x200, 1]]), { message: 'ARM DAP: the DAP still answers WAIT after 3 attempts' });
  const basys = new Chain(new Djtg(await new Adept(new SimAdeptBoard()).open(), 0));
  await basys.init();
  assert.throws(() => new ArmDap(basys), { message: 'ARM DAP: no ARM DAP on the JTAG chain (a Zynq-7000\'s board?)' });
});

test('#4687 CPU 0: halted (its locks opened, halting debug on), r0 set and read, started at an address in the Supervisor mode', async () => {
  const { chain, dap: sim } = await chainOf();
  const dap = new ArmDap(chain), cpu = new CortexA9(dap);
  await dap.powerUp();
  await cpu.halt();
  assert.equal(sim.cpu.halted, true);
  await cpu.setR0(0x12345678);
  assert.equal(await cpu.getR0(), 0x12345678);
  await cpu.plainMemory();
  assert.equal(sim.cpu.sctlr, 0x00c51878 & ~0x1005);
  await cpu.startAt(0x40);
  assert.deepEqual(sim.cpu.started, { pc: 0x40, cpsr: 0x1d3, sctlr: 0x00c50878 });
  assert.deepEqual(sim.cpu.ops.slice(-9), [OP.SCTLR_FROM_R0, OP.ICIALLU, OP.BPIALL, OP.ISB, OP.R0_FROM_DTRRX, OP.CPSR_FROM_R0, OP.ISB, OP.R0_FROM_DTRRX, OP.PC_FROM_R0]);
});

test('#4687 the plan: ps7_init\'s writes, the ELF\'s segments as words, its entry; refused out of its bounds', () => {
  const plan = planOf();
  assert.equal(plan.error, undefined);
  assert.deepEqual(plan.init, ps7Init(ZYBO).init);
  assert.deepEqual([plan.blocks.length, plan.blocks[0].addr, plan.blocks[0].words.length, plan.entry], [1, 0, 750, 0]);
  assert.deepEqual([...wordsOf(new Uint8Array([1, 2, 3, 4, 5]))], [0x04030201, 5]);
  const p = (over) => planRefusal({ ...plan, ...over });
  assert.equal(p({}), null);
  assert.equal(p({ blocks: [{ addr: 0x2fffc, words: new Uint32Array(2) }] }), 'a segment at 0x0002FFFC–0x00030003: outside the on-chip memory\'s 0x00000000–0x0002FFFF');
  assert.equal(p({ blocks: [{ addr: 0xfffff000, words: new Uint32Array(1) }] }), 'a segment at 0xFFFFF000–0xFFFFF003: outside the on-chip memory\'s 0x00000000–0x0002FFFF');
  assert.equal(p({ blocks: [{ addr: 0x102, words: new Uint32Array(1) }] }), 'a segment at 0x00000102: not 4-aligned');
  assert.equal(p({ entry: 0x00100000 }), 'its entry 0x00100000: outside the on-chip memory');
  assert.equal(p({ init: [{ op: 'write', addr: 0xf8006000, reg: 'DDRC', value: 1 }] }), 'ps7_init: 0xF8006000 (DDRC) is not a register of the SLCR');
  assert.equal(p({ init: [{ op: 'erase', addr: SLCR_WINDOW[0], reg: 'X' }] }), 'ps7_init: an operation erase not known');
  assert.deepEqual(psLoadPlan({ elf: psElf(program(16, 0x30000)), ps: ZYBO }), { error: 'its ELF: a segment at 0x00030000–0x0003000F, outside the on-chip memory\'s 0x00000000–0x0002FFFF (its linker script)' });
  assert.deepEqual(psLoadPlan({ elf: psElf(program()), ps: { ...ZYBO, armFdiv: 99 } }), { error: 'its PS cannot be set up: the ARM PLL\'s FDIV 99: no PLL settings known for it (FDIV 26, 30, 32, 40)' });
  assert.deepEqual(psLoadPlan({ elf: null, ps: ZYBO }), { error: 'no program to load' });
});

test('#4687 the guard: every write of the DAP inside the plan\'s bounds; another refused before it is made', async () => {
  const plan = planOf(), g = writeGuard(plan);
  for (const ok of [[AHB_AP, 0, 750], [AHB_AP, 0x2fffc, 1], [AHB_AP, plan.init[0].addr, 1], [APB_AP, CPU0_DEBUG + DBG.ITR, 1]]) g(...ok);
  for (const [ap, a, n, what] of [[AHB_AP, 0x2fffc, 2, '0x0002FFFC (2 words) on the AHB-AP'], [AHB_AP, 0xf8000004 + 0x200, 1, '0xF8000204 on the AHB-AP'], [AHB_AP, 0xe0001000, 1, '0xE0001000 on the AHB-AP'],
    [APB_AP, 0x80092000, 1, '0x80092000 on the APB-AP'], [2, 0, 1, '0x00000000 on the AP 2-AP']]) {
    assert.throws(() => g(ap, a, n), { message: `ARM DAP: a write to ${what} refused: outside the PS program's bounds` });
  }
  const { chain, dap: sim } = await chainOf();
  const dap = new ArmDap(chain, { guard: g });
  await assert.rejects(dap.write(AHB_AP, [[0x100, 1], [0xe0001000, 2]]), /refused/);
  await assert.rejects(dap.writeBlock(AHB_AP, 0x2fff0, new Uint32Array(8)), /refused/);
  assert.deepEqual(sim.writes, [], 'nothing written: the batch refused whole');
});

test('#4687 the load: CPU 0 halted first, its MMU and caches off, ps7_init, the program written and read back, CPU 0 started at its entry; every write in bounds', async () => {
  const { chain, dap: sim } = await chainOf();
  const lines = [];
  const elf = program(3000, 0, 0x20);
  const plan = planOf(elf);
  assert.deepEqual(await loadPs(chain, plan, { log: (l) => lines.push(l) }), { words: 750, entry: 0x20 });
  assert.deepEqual(lines, ['CPU 0 halted, its MMU and caches off.', `ps7_init: ${plan.init.length} register operations of the SLCR (the MIO, the PLLs, the clocks).`,
    'The program: 3000 bytes written to the on-chip memory and read back.', 'CPU 0 started at 0x00000020.']);
  assert.deepEqual([...sim.ocm.subarray(0, 750)], [...plan.blocks[0].words]);
  assert.deepEqual(sim.cpu.started, { pc: 0x20, cpsr: 0x1d3, sctlr: 0x00c50878 });
  // (every write in its bounds: the OCM, ps7_init's registers, CPU 0's debug registers)
  const regs = new Set(plan.init.map((o) => o.addr));
  for (const w of sim.writes) assert.ok(w.ap === 0 ? w.addr < 0x30000 || regs.has(w.addr) : DEBUG.has(w.addr), `${w.ap}: 0x${w.addr.toString(16)}`);
  // (CPU 0 halted before the first write of the AHB-AP; ps7_init's last write the SLCR locked again)
  const halt = sim.writes.findIndex((w) => w.ap === 1 && w.addr === CPU0_DEBUG + DBG.DRCR && w.value === 1);
  assert.ok(halt >= 0 && halt < sim.writes.findIndex((w) => w.ap === 0));
  const slcr = sim.writes.filter((w) => w.ap === 0 && w.addr >= SLCR_WINDOW[0]);
  assert.deepEqual([slcr[0], slcr.at(-1)].map((w) => [w.addr, w.value]), [[0xf8000008, 0xdf0d], [0xf8000004, 0x767b]]);
  assert.equal(sim.slcr.get(0xf8000154) & 0x3f33, ps7Init(ZYBO).init.find((o) => o.reg === 'UART_CLK_CTRL').value);
});

test('#4687 the load refused before any JTAG write: a plan out of bounds; a PLL that does not lock and a word not written, said', async () => {
  const s = await chainOf();
  const bad = { ...planOf(), entry: 0xffff0000 };
  await assert.rejects(loadPs(s.chain, bad), { message: 'the PS program is not loaded: its entry 0xFFFF0000: outside the on-chip memory' });
  assert.deepEqual([s.dap.writes, s.dap.cpu.halted], [[], false]);
  const p = await chainOf({ pllLocks: false });
  await assert.rejects(loadPs(p.chain, planOf(), { pollTries: 5 }), { message: 'ps7_init: PLL_STATUS (0xF800010C) never set its bits 0x00000001 (a PLL not locked?)' });
  assert.equal(p.dap.writes.filter((w) => w.ap === 0 && w.addr < 0x30000).length, 0, 'the program not written');
  assert.equal(p.dap.cpu.started, null);
  const v = await chainOf({ stuck: 0x40 });
  await assert.rejects(loadPs(v.chain, planOf()), /^Error: the on-chip memory at 0x00000040 reads 0x00000000, not 0x[0-9A-F]{8}: the program not loaded$/);
  assert.equal(v.dap.cpu.started, null, 'not started');
});
