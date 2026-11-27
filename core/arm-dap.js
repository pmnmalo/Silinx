// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The ARM Debug Access Port of a Zynq-7000 over JTAG (#4687, part 3): its JTAG-DP, its MEM-APs and the Cortex-A9's debug
// registers, for loading a PS program into the on-chip memory and starting it (core/zynq-ps-load.js). The DAP is a
// device of the board's JTAG chain (core/adept.js Chain: its kind 'dap', IR of 4 bits), the PL's TAP in BYPASS beside it;
// its transactions go in batches (core/adept.js JtagSeq), few USB commands each.
//
// As ARM's Debug Interface v5 (ARM IHI 0031) has it:
//   - the IR: DPACC 0xA, APACC 0xB, ABORT 0x8; a DPACC / APACC scan is 35 bits, in: RnW, A[3:2], DATA[31:0]; out: ACK
//     (OK/FAULT 0b010, WAIT 0b001) and the data the previous read returned; a read's result comes with the next scan;
//   - the DP's registers: CTRL/STAT 0x4 (its debug and system power-up requests and acknowledges, its sticky errors),
//     SELECT 0x8 (the AP and its bank), RDBUFF 0xC;
//   - a MEM-AP's: CSW 0x00 (32-bit accesses, the address incremented), TAR 0x04, DRW 0x0C; the incremented address wraps
//     within 1 KB, so a block is written 1 KB at a time.
// The Zynq's (UG585, "Debug Access Port"): AP 0 the AHB-AP (the PS's memory and registers as the debugger's master sees
// them), AP 1 the APB-AP (the CoreSight components: CPU 0's debug registers at 0x80090000). The Cortex-A9's (its TRM and
// the ARMv7-A ARM, C11): DBGDSCR 0x088 (HALTED, RESTARTED, ITRen, HDBGen, InstrCompl_l), DBGDRCR 0x090 (halt, restart,
// clear sticky exceptions), DBGITR 0x084 (an instruction run in debug state), DBGDTRRX 0x080, DBGLAR 0xFB0, DBGOSLAR
// 0x300, DBGPRSR 0x314. Isomorphic module (browser + Node).
import { JtagSeq } from './adept.js';

const IR = { ABORT: 0x8, DPACC: 0xa, APACC: 0xb, IDCODE: 0xe, BYPASS: 0xf };
const ACK = { WAIT: 0b001, OK: 0b010 };
const DP = { CTRL_STAT: 0x4, SELECT: 0x8, RDBUFF: 0xc };
const MEM_AP = { CSW: 0x00, TAR: 0x04, DRW: 0x0c };
/** The Zynq's APs: the AHB-AP (the PS's memory) and the APB-AP (the CPUs' debug registers), their CSW. */
export const AHB_AP = 0, APB_AP = 1;
const CSW = { [AHB_AP]: 0xa2000012, [APB_AP]: 0x80000012 };   // (32-bit, the address incremented; DbgSwEnable, the AHB's HPROT and master type)
const PWRUP_REQ = (1 << 30) | (1 << 28), PWRUP_ACK = (1 << 31) | (1 << 29);
const STICKY = 0x32;   // (STICKYORUN, STICKYCMP, STICKYERR: written 1 to clear)
/** CPU 0's debug registers on the APB-AP. */
export const CPU0_DEBUG = 0x80090000;
export const DBG = { DTRRX: 0x080, ITR: 0x084, DSCR: 0x088, DTRTX: 0x08c, DRCR: 0x090, OSLAR: 0x300, PRSR: 0x314, LAR: 0xfb0 };
const DSCR = { HALTED: 1 << 0, RESTARTED: 1 << 1, ITREN: 1 << 13, HDBGEN: 1 << 14, INSTR_COMPL: 1 << 24 };
const DRCR = { HALT: 1 << 0, RESTART: 1 << 1, CLEAR_STICKY: 1 << 2 };
const LAR_KEY = 0xc5acce55;
/** The instructions run through DBGITR (ARM encodings): r0 from DBGDTRRX, the CPSR from r0, the PC from r0, SCTLR read and
 *  written through r0, the instruction cache and the branch predictor invalidated, an ISB. */
export const OP = {
  R0_FROM_DTRRX: 0xee100e15, CPSR_FROM_R0: 0xe12ff000, PC_FROM_R0: 0xe1a0f000, SCTLR_TO_R0: 0xee110f10,
  SCTLR_FROM_R0: 0xee010f10, ICIALLU: 0xee070f15, BPIALL: 0xee070fd5, ISB: 0xee070f95, R0_TO_DTRTX: 0xee000e15,
};
const fail = (msg) => { throw new Error(`ARM DAP: ${msg}`); };
const hex = (n) => `0x${(n >>> 0).toString(16).padStart(8, '0')}`;

/** The DAP of a board's JTAG chain (`chain`: core/adept.js Chain, initialised): batches of DP / AP transactions, the
 *  MEM-APs' reads and writes, CPU 0's debug. `idle`: the Run-Test/Idle clocks after an AP access. `guard(ap, addr,
 *  words)`: called before every write of an AP's memory, which it refuses by throwing (core/zynq-ps-load.js's bounds). */
export class ArmDap {
  constructor(chain, { idle = 8, retries = 3, guard = () => {} } = {}) {
    this.chain = chain;
    this.dev = chain.devices.find((d) => d.kind === 'dap') || fail('no ARM DAP on the JTAG chain (a Zynq-7000\'s board?)');
    Object.assign(this, { idle, retries, guard, select: null, csw: {} });
  }

  // one batch: txs [{ ap, rnw, a, data }] (ap: true an APACC, else a DPACC), then a read of RDBUFF for the last one's
  // status; the reads' values, in order. A WAIT: the batch again (idempotent: writes of values, reads), more idle each
  // time; a FAULT: its sticky error cleared, said.
  async run(txs) {
    for (let attempt = 0, idle = this.idle; ; attempt++, idle *= 4) {
      const seq = new JtagSeq(this.chain), caps = [];
      let ir = null;
      for (const t of [...txs, { ap: false, rnw: true, a: DP.RDBUFF }]) {
        const want = t.ap ? IR.APACC : IR.DPACC;
        if (ir !== want) { seq.ir(this.dev, want); ir = want; }
        const v = BigInt(t.rnw ? 1 : 0) | (BigInt((t.a >> 2) & 3) << 1n) | (BigInt((t.data ?? 0) >>> 0) << 3n);
        caps.push(seq.dr(this.dev, v, 35, true));
        if (t.ap) seq.rti(idle);
      }
      await seq.run();
      const acks = caps.slice(1).map((c) => c.num & 7);
      if (acks.every((a) => a === ACK.OK)) return txs.map((t, i) => (t.rnw ? Math.floor(caps[i + 1].num / 8) >>> 0 : null)).filter((v) => v !== null);
      if (acks.some((a) => a !== ACK.OK && a !== ACK.WAIT)) {
        const st = await this.dpRead(DP.CTRL_STAT).catch(() => null);
        await this.dpWrite(DP.CTRL_STAT, PWRUP_REQ | STICKY).catch(() => {});
        fail(`a transaction failed (FAULT${st == null ? '' : `, CTRL/STAT ${hex(st)}`})`);
      }
      if (attempt >= this.retries) fail(`the DAP still answers WAIT after ${this.retries + 1} attempts`);
    }
  }
  async dpRead(a) { return (await this.run([{ ap: false, rnw: true, a }]))[0]; }
  async dpWrite(a, data) { await this.run([{ ap: false, rnw: false, a, data }]); }

  /** The debug and system domains powered up (CTRL/STAT's requests, their acknowledges polled). */
  async powerUp({ tries = 20 } = {}) {
    await this.dpWrite(DP.CTRL_STAT, PWRUP_REQ | STICKY);
    for (let i = 0; i < tries; i++) if ((((await this.dpRead(DP.CTRL_STAT)) & PWRUP_ACK) >>> 0) === PWRUP_ACK >>> 0) return;
    fail('its debug and system power-up not acknowledged');
  }

  // the transactions that select the AP's bank 0 and set its CSW (when not set already)
  #ap(ap) {
    const txs = [];
    if (this.select !== ap) { txs.push({ ap: false, rnw: false, a: DP.SELECT, data: ap << 24 }); this.select = ap; }
    if (this.csw[ap] !== CSW[ap]) { txs.push({ ap: true, rnw: false, a: MEM_AP.CSW, data: CSW[ap] }); this.csw[ap] = CSW[ap]; }
    return txs;
  }
  /** A 32-bit word of the AP's address space read. */
  async read(ap, addr) {
    return (await this.run([...this.#ap(ap), { ap: true, rnw: false, a: MEM_AP.TAR, data: addr }, { ap: true, rnw: true, a: MEM_AP.DRW }]))[0];
  }
  /** 32-bit words written, [[addr, value], …], in one batch. */
  async write(ap, pairs) {
    for (const [addr] of pairs) this.guard(ap, addr, 1);
    const txs = this.#ap(ap);
    for (const [addr, v] of pairs) txs.push({ ap: true, rnw: false, a: MEM_AP.TAR, data: addr }, { ap: true, rnw: false, a: MEM_AP.DRW, data: v });
    await this.run(txs);
  }
  /** Consecutive words written from `addr` (4-aligned), 1 KB a batch (the incremented address's wrap). */
  async writeBlock(ap, addr, words, { progress = () => {} } = {}) {
    this.guard(ap, addr, words.length);
    for (let i = 0; i < words.length;) {
      const at = addr + i * 4, n = Math.min(words.length - i, (0x400 - (at & 0x3ff)) >> 2);
      const txs = [...this.#ap(ap), { ap: true, rnw: false, a: MEM_AP.TAR, data: at }];
      for (let k = 0; k < n; k++) txs.push({ ap: true, rnw: false, a: MEM_AP.DRW, data: words[i + k] });
      await this.run(txs);
      i += n;
      progress(i, words.length);
    }
  }
  /** Consecutive words read from `addr` (4-aligned), 1 KB a batch. */
  async readBlock(ap, addr, count) {
    const out = new Uint32Array(count);
    for (let i = 0; i < count;) {
      const at = addr + i * 4, n = Math.min(count - i, (0x400 - (at & 0x3ff)) >> 2);
      const got = await this.run([...this.#ap(ap), { ap: true, rnw: false, a: MEM_AP.TAR, data: at }, ...Array.from({ length: n }, () => ({ ap: true, rnw: true, a: MEM_AP.DRW }))]);
      out.set(got, i);
      i += n;
    }
    return out;
  }
}

/** CPU 0 of a Zynq's Cortex-A9 through the APB-AP's debug registers: halted, its instructions run in debug state, its
 *  registers set, restarted. */
export class CortexA9 {
  constructor(dap, base = CPU0_DEBUG) { Object.assign(this, { dap, base }); }
  reg(r) { return this.base + r; }
  async dscr() { return this.dap.read(APB_AP, this.reg(DBG.DSCR)); }
  // a DSCR bit waited for
  async until(bit, what, tries = 50) {
    for (let i = 0; i < tries; i++) if ((await this.dscr()) & bit) return;
    fail(`CPU 0 not ${what}`);
  }
  /** Its debug registers unlocked (the software lock, the OS lock), halting debug on, the CPU halted. */
  async halt() {
    await this.dap.write(APB_AP, [[this.reg(DBG.LAR), LAR_KEY], [this.reg(DBG.OSLAR), 0]]);
    await this.dap.read(APB_AP, this.reg(DBG.PRSR));   // (its sticky power-down status read: cleared)
    await this.dap.write(APB_AP, [[this.reg(DBG.DSCR), ((await this.dscr()) | DSCR.HDBGEN | DSCR.ITREN) >>> 0]]);
    await this.dap.write(APB_AP, [[this.reg(DBG.DRCR), DRCR.HALT]]);
    await this.until(DSCR.HALTED, 'halted');
  }
  /** An instruction run in debug state (DBGITR), its completion waited for. */
  async exec(op) {
    await this.dap.write(APB_AP, [[this.reg(DBG.ITR), op]]);
    await this.until(DSCR.INSTR_COMPL, 'done with its instruction');
  }
  /** r0 set (through DBGDTRRX). */
  async setR0(v) { await this.dap.write(APB_AP, [[this.reg(DBG.DTRRX), v]]); await this.exec(OP.R0_FROM_DTRRX); }
  /** r0 read (through DBGDTRTX). */
  async getR0() { await this.exec(OP.R0_TO_DTRTX); return this.dap.read(APB_AP, this.reg(DBG.DTRTX)); }
  /** The MMU and the caches off (SCTLR's M, C, I), the instruction cache and the branch predictor invalidated: the
   *  on-chip memory as the debugger wrote it. */
  async plainMemory() {
    await this.exec(OP.SCTLR_TO_R0);
    const sctlr = await this.getR0();
    await this.setR0((sctlr & ~((1 << 0) | (1 << 2) | (1 << 12))) >>> 0);
    for (const op of [OP.SCTLR_FROM_R0, OP.ICIALLU, OP.BPIALL, OP.ISB]) await this.exec(op);
  }
  /** Started at `pc`: the Supervisor mode, ARM state, interrupts off (CPSR 0x1D3), then restarted. */
  async startAt(pc) {
    await this.setR0(0x1d3); await this.exec(OP.CPSR_FROM_R0); await this.exec(OP.ISB);
    await this.setR0(pc); await this.exec(OP.PC_FROM_R0);
    await this.dap.write(APB_AP, [[this.reg(DBG.DSCR), ((await this.dscr()) & ~DSCR.ITREN) >>> 0]]);
    await this.dap.write(APB_AP, [[this.reg(DBG.DRCR), DRCR.RESTART | DRCR.CLEAR_STICKY]]);
    await this.until(DSCR.RESTARTED, 'restarted');
  }
}
