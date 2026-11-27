// A simulated Zynq-7000 JTAG chain for the tests of core/arm-dap.js and core/zynq-ps-load.js (#4687): TDI, the ARM DAP,
// the PL's TAP, TDO, as the Zybo Z7's, behind the simulated Adept board's JTAG (test/fixtures/adept-sim.js's TAP
// controllers). The DAP as ADIv5's JTAG-DP has it (IDCODE, DPACC, APACC, ABORT; a scan's ACK and read data those of the
// transaction before; WAIT when told to, the request then dropped), its DP (CTRL/STAT's power-up acknowledges, SELECT,
// RDBUFF), its AP 0 (the AHB-AP: the OCM's low 192 KB, the SLCR's registers, PLL_STATUS's locks) and AP 1 (the APB-AP:
// CPU 0's debug registers, locked until DBGLAR's key; halting, DBGITR's instructions on r0, the CPSR, the PC and SCTLR,
// restarting). Every write is logged ({ ap, addr, value }), so a test can say what was written where.
import { SimAdeptBoard } from './adept-sim.js';

const DAP_IDCODE = 0x4ba00477, PL_IDCODE = 0x23727093;   // (an xc7z020 of version 2)
const OCM_WORDS = 0x30000 / 4, CPU0 = 0x80090000;
const bitsToBig = (bits) => bits.reduce((v, b, i) => v | (BigInt(b) << BigInt(i)), 0n);

class Pl {
  constructor() { Object.assign(this, { irLen: 6, idInstr: 0x09, name: 'pl' }); this.reset(); }
  reset() { this.ir = this.idInstr; }
  captureIr() { return 0x01; }
  update() {}
  captureDr() { return this.ir === this.idInstr ? [PL_IDCODE, 32] : [0, 1]; }
  shiftedIn() {}
  clock() {}
}

export class SimZynqDap {
  // waits: the WAITs answered before the next transaction is taken; pllLocks: PLL_STATUS's locks come
  // stuck: an OCM address whose word keeps its value (a write lost)
  constructor({ waits = 0, pllLocks = true, sctlr = 0x00c51878, stuck = null } = {}) {
    Object.assign(this, { irLen: 4, idInstr: 0xe, name: 'dap', waits, pllLocks, stuck });
    this.ocm = new Uint32Array(OCM_WORDS);
    this.slcr = new Map();
    this.writes = [];
    this.dp = { ctrl: 0, select: 0 };
    this.aps = [{ csw: 0, tar: 0 }, { csw: 0, tar: 0 }];
    this.out = 0n; this.lastRead = 0;
    this.cpu = { unlocked: false, halted: false, restarted: false, dscr: 0, r0: 0, cpsr: 0x1d3 | (1 << 5), pc: 0xffffff28, sctlr, dtrrx: 0, dtrtx: 0, ops: [], started: null };
    this.reset();
  }
  reset() { this.ir = this.idInstr; }
  captureIr() { return 0x01; }
  update() {}
  shiftedIn() {}
  clock() {}
  captureDr() {
    if (this.ir === this.idInstr) return [DAP_IDCODE, 32];
    if (this.ir === 0xa || this.ir === 0xb || this.ir === 0x8) return { bits: Array.from({ length: 35 }, (_, i) => Number((this.out >> BigInt(i)) & 1n)) };
    return [0, 1];
  }
  updateDr(bits) {
    if (this.ir !== 0xa && this.ir !== 0xb) return;
    const v = bitsToBig(bits.slice(0, 35));
    const rnw = Number(v & 1n), a = Number((v >> 1n) & 3n) << 2, data = Number((v >> 3n) & 0xffffffffn) >>> 0;
    if (this.waits > 0) { this.waits--; this.out = (BigInt(this.lastRead) << 3n) | 0b001n; return; }
    const r = this.ir === 0xa ? this.dpAccess(rnw, a, data) : this.apAccess(rnw, a, data);
    if (rnw) this.lastRead = r >>> 0;
    this.out = (BigInt(this.lastRead) << 3n) | 0b010n;
  }
  dpAccess(rnw, a, data) {
    if (a === 0x4) {
      if (!rnw) { this.dp.ctrl = data & ~0x32; return 0; }
      const c = this.dp.ctrl;
      return (c | ((c & (1 << 30)) ? 1 << 31 : 0) | ((c & (1 << 28)) ? 1 << 29 : 0)) >>> 0;
    }
    if (a === 0x8) { if (!rnw) this.dp.select = data; return this.dp.select; }
    if (a === 0xc) return this.lastRead;   // (RDBUFF: the last AP read's result again)
    return 0;
  }
  apAccess(rnw, a, data) {
    const apsel = this.dp.select >>> 24, ap = this.aps[apsel];
    if (!ap || ((this.dp.select >> 4) & 0xf) !== 0) throw new Error(`simulated DAP: AP ${apsel}, bank ${(this.dp.select >> 4) & 0xf}: not simulated`);
    if (a === 0x0) { if (!rnw) ap.csw = data; return ap.csw; }
    if (a === 0x4) { if (!rnw) ap.tar = data; return ap.tar; }
    if (a !== 0xc) return 0;
    const addr = ap.tar >>> 0;
    if (((ap.csw >> 4) & 3) === 1) ap.tar = ((ap.tar & ~0x3ff) | ((ap.tar + 4) & 0x3ff)) >>> 0;   // (the increment wraps in 1 KB)
    if (!rnw) { this.writes.push({ ap: apsel, addr, value: data }); return apsel === 0 ? this.ahbWrite(addr, data) : this.apbWrite(addr, data); }
    return apsel === 0 ? this.ahbRead(addr) : this.apbRead(addr);
  }
  ahbWrite(addr, v) {
    if (addr < 0x30000) { if (addr !== this.stuck) this.ocm[addr >> 2] = v; }
    else if (addr >= 0xf8000000 && addr < 0xf8001000) this.slcr.set(addr, v);
  }
  ahbRead(addr) {
    if (addr < 0x30000) return this.ocm[addr >> 2];
    if (addr === 0xf800010c) return this.pllLocks ? 0x3f : 0;   // (PLL_STATUS: every PLL locked and stable)
    return this.slcr.get(addr) ?? 0;
  }
  apbWrite(addr, v) {
    const c = this.cpu, r = addr - CPU0;
    if (r === 0xfb0) { c.unlocked = v === 0xc5acce55; return; }
    if (!c.unlocked) return;   // (the software lock: writes ignored)
    if (r === 0x088) c.dscr = v & ((1 << 13) | (1 << 14));
    if (r === 0x090) {
      if (v & 1) { c.halted = true; c.restarted = false; }
      if (v & 2) { c.halted = false; c.restarted = true; c.started = { pc: c.pc, cpsr: c.cpsr, sctlr: c.sctlr }; }
    }
    if (r === 0x080) c.dtrrx = v;
    if (r === 0x084 && c.halted && (c.dscr & (1 << 13))) this.exec(v);
  }
  apbRead(addr) {
    const c = this.cpu, r = addr - CPU0;
    if (r === 0x088) return (c.dscr | (c.halted ? 1 : 0) | (c.restarted ? 2 : 0) | (c.halted ? 1 << 24 : 0)) >>> 0;
    if (r === 0x08c) return c.dtrtx;
    return 0;
  }
  exec(op) {
    const c = this.cpu;
    c.ops.push(op);
    if (op === 0xee100e15) c.r0 = c.dtrrx;
    else if (op === 0xee000e15) c.dtrtx = c.r0;
    else if (op === 0xe12ff000) c.cpsr = c.r0;
    else if (op === 0xe1a0f000) c.pc = c.r0;
    else if (op === 0xee110f10) c.r0 = c.sctlr;
    else if (op === 0xee010f10) c.sctlr = c.r0;
  }
}

/** A Zybo Z7's chain on the simulated Adept board: { board, dap, pl }. */
export function simZynqBoard(opts = {}) {
  const board = new SimAdeptBoard({ prom: null, product: 'Zybo Z7' });
  const dap = new SimZynqDap(opts), pl = new Pl();
  board.chain = [dap, pl];
  board.irs = board.chain.map(() => 0);
  board.drs = board.chain.map(() => ({ bits: [0], off: 0, n: 1 }));
  return { board, dap, pl };
}
