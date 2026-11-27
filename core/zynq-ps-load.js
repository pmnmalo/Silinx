// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A Zynq board's PS program loaded over JTAG and started (#4687, part 3): its ELF (core/zynq-ps-compile.js psElf) into the
// on-chip memory through the ARM DAP's AHB-AP, after Silinx's ps7_init (core/zynq-ps7.js: the clocks, the MIO), CPU 0
// halted and started at the program's entry through the APB-AP's debug registers (core/arm-dap.js).
//
// Programming a board is where a mistake costs most, so the writes are bounded twice: the plan (psLoadPlan) is checked
// whole before the first JTAG transaction (planRefusal: every ps7_init write a register of the SLCR, every segment in
// the OCM's low 192 KB, 4-aligned, the entry there), and every write the DAP makes goes through the plan's guard
// (writeGuard), which refuses an address outside those, and outside CPU 0's debug registers on the APB-AP. Nothing is
// written before the plan passes. Isomorphic module (browser + Node).
import { ps7Init } from './zynq-ps7.js';
import { OCM } from './zynq-ps-compile.js';
import { ArmDap, CortexA9, AHB_AP, APB_AP, CPU0_DEBUG, DBG } from './arm-dap.js';

/** The SLCR's registers: [start, end) (UG585, appendix B). */
export const SLCR_WINDOW = [0xf8000000, 0xf8001000];
const hex = (n) => `0x${(n >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
const DEBUG_REGS = new Set(Object.values(DBG).map((r) => CPU0_DEBUG + r));

/** A segment's bytes as little-endian words (its last one padded with zeros). */
export function wordsOf(bytes) {
  const n = Math.ceil(bytes.length / 4), w = new Uint32Array(n);
  for (let i = 0; i < bytes.length; i++) w[i >> 2] |= bytes[i] << ((i & 3) * 8);
  return w;
}

/**
 * The plan of a load: { init (ps7_init's writes, its board's PS), blocks ([{ addr, words }]: the ELF's segments), entry,
 * clocks } or { error }. `elf`: psElf's result; `ps`: the board's PS (core/zynq-ps.js psOfBoard).
 */
export function psLoadPlan({ elf, ps }) {
  if (!elf || elf.error) return { error: elf?.error || 'no program to load' };
  const p7 = ps7Init(ps);
  if (p7.error) return { error: `its PS cannot be set up: ${p7.error}` };
  const blocks = elf.segments.filter((s) => s.bytes.length).map((s) => ({ addr: s.addr, words: wordsOf(s.bytes) }));
  const plan = { init: p7.init, blocks, entry: elf.entry, clocks: p7.clocks };
  const why = planRefusal(plan);
  return why ? { error: why } : plan;
}

/** Why the plan must not run (an address outside its bounds), or null. Checked before any write. */
export function planRefusal({ init = [], blocks = [], entry }) {
  for (const o of init) {
    if (!['write', 'mask', 'poll'].includes(o.op)) return `ps7_init: an operation ${o.op} not known`;
    if (o.addr < SLCR_WINDOW[0] || o.addr >= SLCR_WINDOW[1] || o.addr & 3) return `ps7_init: ${hex(o.addr)} (${o.reg}) is not a register of the SLCR`;
  }
  for (const b of blocks) {
    const end = b.addr + b.words.length * 4;
    if (b.addr & 3) return `a segment at ${hex(b.addr)}: not 4-aligned`;
    if (b.addr < OCM.start || end > OCM.end) return `a segment at ${hex(b.addr)}–${hex(end - 1)}: outside the on-chip memory's ${hex(OCM.start)}–${hex(OCM.end - 1)}`;
  }
  if (!(entry >= OCM.start && entry < OCM.end)) return `its entry ${hex(entry)}: outside the on-chip memory`;
  return null;
}

/** The plan's guard of every write (core/arm-dap.js's): on the AHB-AP, a register ps7_init writes or words in the OCM's
 *  low part; on the APB-AP, CPU 0's debug registers; anything else refused, throwing. */
export function writeGuard({ init = [] }) {
  const regs = new Set(init.map((o) => o.addr >>> 0));
  return (ap, addr, words = 1) => {
    const a = addr >>> 0, end = a + words * 4;
    if (ap === AHB_AP && ((words === 1 && regs.has(a)) || (a >= OCM.start && end <= OCM.end))) return;
    if (ap === APB_AP && words === 1 && DEBUG_REGS.has(a)) return;
    throw new Error(`ARM DAP: a write to ${hex(a)}${words > 1 ? ` (${words} words)` : ''} on the ${ap === AHB_AP ? 'AHB' : ap === APB_AP ? 'APB' : `AP ${ap}`}-AP refused: outside the PS program's bounds`);
  };
}

// one of ps7_init's operations through the AHB-AP: a write, a read-modify-write, a poll of its mask's bits
async function runOp(dap, o, { tries }) {
  if (o.op === 'write') return dap.write(AHB_AP, [[o.addr, o.value]]);
  if (o.op === 'mask') { const v = await dap.read(AHB_AP, o.addr); return dap.write(AHB_AP, [[o.addr, ((v & ~o.mask) | (o.value & o.mask)) >>> 0]]); }
  for (let i = 0; i < tries; i++) if (((await dap.read(AHB_AP, o.addr)) & o.mask) === o.mask) return;
  throw new Error(`ps7_init: ${o.reg} (${hex(o.addr)}) never set its bits ${hex(o.mask)} (a PLL not locked?)`);
}

/**
 * The plan run on a board's JTAG chain (`chain`: core/adept.js Chain, initialised, its DAP in it): the DAP powered up,
 * CPU 0 halted with its MMU and caches off, ps7_init, the segments written and read back, CPU 0 started at the entry.
 * Refused, before any write, when planRefusal says why. log(line): its steps. { words, entry }.
 */
export async function loadPs(chain, plan, { log = () => {}, verify = true, pollTries = 100, idle } = {}) {
  const why = planRefusal(plan);
  if (why) throw new Error(`the PS program is not loaded: ${why}`);
  const dap = new ArmDap(chain, { guard: writeGuard(plan), ...(idle ? { idle } : {}) });
  const cpu = new CortexA9(dap);
  await dap.powerUp();
  await cpu.halt();
  await cpu.plainMemory();
  log('CPU 0 halted, its MMU and caches off.');
  for (const o of plan.init) await runOp(dap, o, { tries: pollTries });
  log(`ps7_init: ${plan.init.length} register operations of the SLCR (the MIO, the PLLs, the clocks).`);
  let words = 0;
  for (const b of plan.blocks) {
    await dap.writeBlock(AHB_AP, b.addr, b.words);
    if (verify) {
      const got = await dap.readBlock(AHB_AP, b.addr, b.words.length);
      const bad = got.findIndex((w, i) => w !== b.words[i]);
      if (bad >= 0) throw new Error(`the on-chip memory at ${hex(b.addr + bad * 4)} reads ${hex(got[bad])}, not ${hex(b.words[bad])}: the program not loaded`);
    }
    words += b.words.length;
  }
  log(`The program: ${words * 4} bytes written to the on-chip memory${verify ? ' and read back' : ''}.`);
  await cpu.startAt(plan.entry);
  log(`CPU 0 started at ${hex(plan.entry)}.`);
  return { words, entry: plan.entry };
}
