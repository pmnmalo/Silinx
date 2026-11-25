// silinx-pic24 - the PIC24F core (#5480): its registers, its data bus with the SFRs' hooks, the instruction cycle,
// REPEAT, the traps and the resets. The instructions are in exec-*.js (decode.js maps the opcodes to them), the
// interrupt controller in interrupts.js. The reference is Microchip's "16-bit MCU and DSC Programmer's Reference
// Manual" (DS70000157) for the instructions, and the PIC24FJ1024GA610/GB610 family's data sheet (DS30010074) for
// the device.
//
// Its shape is avr8js's: new CPU(program), cpu.step() runs one instruction (or enters an exception), cpu.cycles
// counts the instruction cycles (Fcy = Fosc / 2), cpu.readHooks[addr] / cpu.writeHooks[addr] are a peripheral's
// SFRs (#5481), cpu.addClockEvent(fn, cycles) its timing.
//
//   readHooks[addr](addr) -> value        a word SFR read (addr even); undefined: the stored value
//   writeHooks[addr](value, old, addr, mask) -> true when the hook took the write (else it is stored)

import {
  FLASH_END, FLASH_WORDS, ERASED, DATA_BYTES, SFR_END, RAM_START, SFR, DEVID, DEVID_ADDR,
  C, Z, RA, IPL_MASK, IPL_SHIFT, IPL3, PSV, NSTDIS, GIE, DISI_BIT, SWTRAP, TRAP, TRAPS,
} from './device.js';
import { OPS } from './decode.js';
import { nextException, enterException, setIrqFlag } from './interrupts.js';

const SRW = SFR.SR >> 1, RCW = SFR.RCOUNT >> 1, CORW = SFR.CORCON >> 1, DISW = SFR.DISICNT >> 1;
const INTREGS_LO = SFR.INTCON1, INTREGS_HI = SFR.INTTREG;
const hex = (v, n = 4) => v.toString(16).toUpperCase().padStart(n, '0');

export class CPU {
  /** program: the program memory's words (24 bits each), index = program address / 2, from 0; erased past it. */
  constructor(program = [], { log = null } = {}) {
    this.prog = new Uint32Array(FLASH_WORDS).fill(ERASED);
    for (let i = 0; i < Math.min(program.length, FLASH_WORDS); i++) this.prog[i] = program[i] & 0xffffff;
    // the configuration space (0x800000 and above): its words by address
    this.configSpace = new Map([[DEVID_ADDR, DEVID]]);
    this.mem = new Uint16Array(DATA_BYTES >> 1);
    this.readHooks = Object.create(null);
    this.writeHooks = Object.create(null);
    // the external memory of the EDS pages 2 and above (the EPMP, #5481): (address24, byte) -> value, and its writes
    this.edsRead = null;
    this.edsWrite = null;
    this.onReset = null;   // (cause) after a device reset (RCON's bits are mcu.js's)
    // the power-saving hooks (the watchdog's, wdt.js): CLRWDT, PWRSAV's mode, the wake-up from it
    this.onClrwdt = null;
    this.onPwrsav = null;
    this.onWake = null;
    this.latches = new Map();   // the table writes' latches (TBLWT, programmed by the NVM controller, #5481)
    this.shadow = null;         // PUSH.S's
    this.cycles = 0;
    this.clockEvents = [];
    this.log = log ?? [];
    this.said = new Set();
    this.reset();
  }

  /** A device reset (a power-on's, or the RESET instruction's): the registers to their reset values, PC = 0. */
  reset(cause = 'power-on') {
    this.mem.fill(0);
    this.mem[15] = RAM_START;              // W15, the stack pointer (table 4-4)
    this.mem[CORW] = PSV;
    this.mem[SFR.INTCON2 >> 1] = GIE;
    for (let i = 0; i < 30; i++) this.mem[(SFR.IPC0 >> 1) + i] = 0x4444;   // (every interrupt at priority 4)
    this.pc = 0;
    this.winit = 1 << 15;                  // the W registers written since the reset (W15 is)
    this.splimSet = false;                 // (SPLIM is undefined until written: no stack limit until then)
    this.dmask = 0;                        // the W registers the last instruction's destination wrote (RAW stalls)
    this.prevMask = 0;
    this.trapReq = 0;                      // the traps requested, by TRAP index
    this.intDirty = true;
    this.irq = null;
    this.sleeping = null;                  // 'sleep', 'idle' (PWRSAV)
    this.repFirst = false;
    this.divIter = 0;
    this.resetCause = cause;
    this.onReset?.(cause);
  }

  /** Out of Sleep or Idle (an interrupt, the watchdog). */
  wake() {
    if (!this.sleeping) return;
    const mode = this.sleeping;
    this.sleeping = null;
    this.onWake?.(mode);
  }

  say(kind, text, once = null) {
    if (once != null) { if (this.said.has(once)) return; this.said.add(once); }
    this.log.push({ kind, cycle: this.cycles, pc: this.pc, text });
  }

  // a reset caused by the program (an illegal opcode, an uninitialized W register as a pointer: RCON.IOPUWR)
  deviceReset(cause) {
    this.say('warning', `PC 0x${hex(this.pc, 6)}: ${cause}: the device resets`);
    this.reset(cause);
  }

  illegal(op) { this.deviceReset(`illegal instruction 0x${hex(op, 6)}`); this.npc = 0; }

  trap(n, why) {
    if (why) this.say('warning', `PC 0x${hex(this.pc, 6)}: ${why}: ${TRAPS[n].name} trap`);
    this.trapReq |= 1 << n;
    this.intDirty = true;
  }

  /** IRQ n's flag set (a peripheral's interrupt request), or cleared. */
  raise(n, on = true) { setIrqFlag(this, n, on); }

  // ---- the registers
  get sr() { return this.mem[SRW]; }
  set sr(v) { this.mem[SRW] = v & 0x01ff; this.intDirty = true; }
  flags(mask, value) { this.mem[SRW] = (this.mem[SRW] & ~mask) | value; }
  get ipl() { return ((this.mem[SRW] & IPL_MASK) >> IPL_SHIFT) | (this.mem[CORW] & IPL3 ? 8 : 0); }
  set ipl(p) {
    this.mem[SRW] = (this.mem[SRW] & ~IPL_MASK) | ((p & 7) << IPL_SHIFT);
    this.mem[CORW] = (this.mem[CORW] & ~IPL3) | (p > 7 ? IPL3 : 0);
    this.intDirty = true;
  }
  get rcount() { return this.mem[RCW]; }

  W(n) { return this.mem[n]; }
  /** Wn written as an instruction's destination (a word). */
  setW(n, v) {
    this.mem[n] = n === 15 ? v & 0xfffe : v & 0xffff;
    this.winit |= 1 << n;
    this.dmask |= 1 << n;
  }
  /** Wn's low byte written (its high byte kept: a byte operation's register direct destination, DS70000157 4.4). */
  setWB(n, v) {
    this.mem[n] = (this.mem[n] & 0xff00) | (v & 0xff);
    if (n === 15) this.mem[15] &= 0xfffe;
    this.winit |= 1 << n;
    this.dmask |= 1 << n;
  }

  // Wn as an address pointer: an uninitialized one resets the device; a RAW dependency on the instruction before
  // stalls one cycle (DS70000157 4.3.1: its destination wrote Wn, the source uses it indirectly)
  ptr(n, source) {
    if (!((this.winit >> n) & 1)) { this.npc = 0; this.uwr = n; return this.mem[n]; }
    if (source && (this.prevMask >> n) & 1) this.stall = 1;
    return this.mem[n];
  }
  // a pointer's pre/post modification (marked as a destination's write when it is the destination's)
  mod(n, v, dest) {
    this.mem[n] = n === 15 ? v & 0xfffe : v & 0xffff;
    if (dest) this.dmask |= 1 << n;
  }
  // an EA from W15 (DS30010074 4.2.6): above SPLIM (once set), or below the RAM, a stack error
  stackCheck(ea) {
    if ((this.splimSet && ea > this.mem[SFR.SPLIM >> 1]) || ea < RAM_START)
      this.trap(TRAP.STKERR, `the stack pointer at 0x${hex(ea)} (SPLIM 0x${hex(this.mem[SFR.SPLIM >> 1])})`);
  }

  // ---- the data bus: byte addresses; a word at an odd address, or the EDS's page 0, an address error
  rd(ea, B) {
    ea &= 0xffff;
    if (!B && ea & 1) { this.trap(TRAP.ADDRERR, `a word read at the odd address 0x${hex(ea)}`); return 0; }
    if (ea & 0x8000) return this.rdEds(ea, B);
    const v = ea <= SFR_END ? this.rdSfr(ea & 0xfffe) : this.mem[ea >> 1];
    return B ? (ea & 1 ? v >> 8 : v & 0xff) : v;
  }

  rdSfr(a) {
    const h = this.readHooks[a];
    if (h) { const r = h(a); if (r !== undefined) this.mem[a >> 1] = r & 0xffff; }
    else if (a === SFR.PCL) return this.pc & 0xffff;
    else if (a === SFR.PCH) return (this.pc >> 16) & 0x7f;
    return this.mem[a >> 1];
  }

  // the EDS window, 0x8000-0xFFFF (DS30010074 4.2.5, 4.3.3): DSRPAG's page 1 the RAM above 0x7FFF, 2-0x1FF the
  // EPMP's, 0x200-0x3FF the program memory's lower (or upper, DSRPAG[8]) words (PSV)
  rdEds(ea, B) {
    const page = this.mem[SFR.DSRPAG >> 1];
    if (page === 0) { this.trap(TRAP.ADDRERR, `a read at 0x${hex(ea)} in the EDS window with DSRPAG 0`); return 0; }
    if (page & 0x200) {
      this.psvHit = 1;
      const a = ((page & 0xff) << 15) | (ea & 0x7fff), word = this.progWord(a & ~1);
      const v = page & 0x100 ? (word >> 16) & 0xff : word & 0xffff;
      return B ? (a & 1 ? v >> 8 : v & 0xff) : v;
    }
    this.edsHit = 1;
    const a = (page << 15) | (ea & 0x7fff);
    if (a < DATA_BYTES) { const v = this.mem[a >> 1]; return B ? (a & 1 ? v >> 8 : v & 0xff) : v; }
    return this.edsRead ? this.edsRead(a, B) & (B ? 0xff : 0xffff) : 0;
  }

  wr(ea, v, B) {
    ea &= 0xffff;
    if (!B && ea & 1) { this.trap(TRAP.ADDRERR, `a word write at the odd address 0x${hex(ea)}`); return; }
    if (ea & 0x8000) { this.wrEds(ea, v, B); return; }
    const mask = B ? (ea & 1 ? 0xff00 : 0x00ff) : 0xffff, val = B ? (ea & 1 ? (v & 0xff) << 8 : v & 0xff) : v & 0xffff;
    if (ea <= SFR_END) { this.wrSfr(ea & 0xfffe, val, mask); return; }
    const w = ea >> 1;
    this.mem[w] = (this.mem[w] & ~mask) | val;
  }

  wrEds(ea, v, B) {
    const page = this.mem[SFR.DSWPAG >> 1];
    if (page === 0) { this.trap(TRAP.ADDRERR, `a write at 0x${hex(ea)} in the EDS window with DSWPAG 0`); return; }
    const a = (page << 15) | (ea & 0x7fff);
    if (a < DATA_BYTES) {
      const mask = B ? (a & 1 ? 0xff00 : 0x00ff) : 0xffff, val = B ? (a & 1 ? (v & 0xff) << 8 : v & 0xff) : v & 0xffff;
      this.mem[a >> 1] = (this.mem[a >> 1] & ~mask) | val;
    } else this.edsWrite?.(a, B ? v & 0xff : v & 0xffff, B);
  }

  wrSfr(a, val, mask) {
    const w = a >> 1, old = this.mem[w], nv = (old & ~mask) | val;
    if (a < 0x20) this.dmask |= 1 << w;
    const h = this.writeHooks[a];
    if (h && h(nv, old, a, mask)) return;
    if (a < 0x56) { this.wrCore(a, nv, old); return; }
    if (a >= INTREGS_LO && a <= INTREGS_HI) this.wrInt(a, nv);
    else this.mem[w] = nv;
  }

  // the CPU's registers (DS30010074 table 4-4): their widths, their read-only bits
  wrCore(a, v, old) {
    const w = a >> 1;
    if (a < 0x20) { this.mem[w] = w === 15 ? v & 0xfffe : v; this.winit |= 1 << w; return; }
    switch (a) {
      case SFR.SPLIM: this.mem[w] = v & 0xfffe; this.splimSet = true; break;
      case SFR.DSRPAG: this.mem[w] = v & 0x3ff; break;
      case SFR.DSWPAG: this.mem[w] = v & 0x1ff; break;
      case SFR.RCOUNT: this.mem[w] = v & 0x3fff; break;
      case SFR.DISICNT: this.mem[w] = v & 0x3fff; break;
      case SFR.TBLPAG: this.mem[w] = v & 0xff; break;
      case SFR.SR: {
        // RA is read-only, the IPL too while nesting is disabled (NSTDIS)
        const keep = RA | (this.mem[SFR.INTCON1 >> 1] & NSTDIS ? IPL_MASK : 0);
        this.mem[w] = ((v & 0x01ff) & ~keep) | (old & keep);
        this.intDirty = true;
        break;
      }
      case SFR.CORCON: this.mem[w] = (v & PSV) | (old & v & IPL3); this.intDirty = true; break;
      default: break;   // (PCL, PCH and the unimplemented: read-only)
    }
  }

  // the interrupt controller's registers: INTCON2's DISI is read-only, its SWTRAP a software trap; INTCON4's SGHT
  // a hardware one; INTTREG read-only
  wrInt(a, v) {
    const w = a >> 1;
    this.intDirty = true;
    if (a === SFR.INTTREG) return;
    if (a === SFR.INTCON2) {
      this.mem[w] = (v & ~DISI_BIT & 0xe11f) | (this.mem[w] & DISI_BIT);
      if (v & SWTRAP) this.trap(TRAP.SOFT);
      return;
    }
    if (a === SFR.INTCON4) { this.mem[w] = v & 3; if (v & 1) this.trap(TRAP.HARD); return; }
    this.mem[w] = v;
  }

  // ---- the program memory
  /** The program word at an (even) program address: the flash, the configuration space, else 0. */
  progWord(addr) {
    if (addr <= FLASH_END) return this.prog[addr >> 1];
    return this.configSpace.get(addr & 0xfffffe) ?? 0;
  }

  fetch(pc) {
    if (pc <= FLASH_END) return this.prog[pc >> 1];
    this.trap(TRAP.ADDRERR, `an instruction fetched at 0x${hex(pc, 6)}, outside the program memory`);
    return 0;
  }

  // ---- the stack (PUSH: [W15++], POP: [--W15])
  push(v) {
    const sp = this.mem[15];
    this.stackCheck(sp);
    this.wr(sp, v, 0);
    this.mem[15] = (sp + 2) & 0xfffe;
    this.dmask |= 1 << 15;
  }
  pop() {
    const sp = (this.mem[15] - 2) & 0xfffe;
    this.stackCheck(sp);
    this.mem[15] = sp;
    this.dmask |= 1 << 15;
    return this.rd(sp, 0);
  }

  // ---- time
  addClockEvent(fn, cycles) {
    const at = this.cycles + Math.max(0, Math.round(cycles));
    let i = this.clockEvents.length;
    while (i && this.clockEvents[i - 1].at > at) i--;
    this.clockEvents.splice(i, 0, { at, fn });
    return fn;
  }
  clearClockEvent(fn) {
    const i = this.clockEvents.findIndex((e) => e.fn === fn);
    if (i < 0) return false;
    this.clockEvents.splice(i, 1);
    return true;
  }
  tick() {
    const q = this.clockEvents;
    while (q.length && q[0].at <= this.cycles) q.shift().fn();
  }

  /** One instruction (or one iteration of a REPEAT's, or an exception's entry, or a cycle asleep): its cycles. */
  step() {
    const c0 = this.cycles;
    if (this.intDirty || this.trapReq) this.irq = nextException(this);
    if (this.irq) {
      if (this.sleeping) this.wake();
      enterException(this, this.irq);
      this.irq = null;
      this.tick();
      return this.cycles - c0;
    }
    if (this.sleeping) {
      // asleep (or idle) until an interrupt: to the next clock event, which may raise one
      const next = this.clockEvents.length ? this.clockEvents[0].at : this.cycles + 1;
      this.cycles = Math.max(this.cycles + 1, next);
      this.tick();
      return this.cycles - c0;
    }
    const pc = this.pc, op = this.fetch(pc);
    const repeating = (this.mem[SRW] & RA) !== 0;
    this.npc = (pc + 2) & 0x7ffffe;
    this.cyc = 1;
    this.stall = 0;
    this.psvHit = 0;
    this.edsHit = 0;
    this.psvCost = 2;
    this.uwr = -1;
    this.prevMask = this.dmask;
    this.dmask = 0;
    OPS[op >>> 16](this, op);
    if (this.uwr >= 0) { this.deviceReset(`W${this.uwr} used as an address pointer before it was written`); return this.cycles - c0; }
    if (repeating && this.pc === pc && (this.mem[SRW] & RA)) {
      // the REPEAT's target (DS70000157 REPEAT): again while RCOUNT > 0, RCOUNT - 1 each time
      if (this.mem[RCW] > 0) { this.mem[RCW]--; this.npc = pc; }
      else this.mem[SRW] &= ~RA;
    }
    // PSV's (and the EDS's) reads take more cycles: outside a REPEAT always, inside one its first and last iterations
    // (DS30010074 4.3.3)
    let extra = this.stall;
    if (this.psvHit && (!repeating || this.repFirst || !(this.mem[SRW] & RA))) extra += this.psvCost;
    else if (this.edsHit && (!repeating || this.repFirst)) extra += 1;
    if (repeating) this.repFirst = false;
    this.pc = this.npc;
    const n = this.cyc + extra;
    this.cycles += n;
    if (this.mem[DISW] && this.mem[SFR.INTCON2 >> 1] & DISI_BIT) {
      this.mem[DISW] = Math.max(0, this.mem[DISW] - n);
      if (!this.mem[DISW]) { this.mem[SFR.INTCON2 >> 1] &= ~DISI_BIT; this.intDirty = true; }
    }
    this.tick();
    return this.cycles - c0;
  }

  /** Runs `cycles` instruction cycles (the last instruction may end past them): the cycles run. */
  run(cycles) {
    const c0 = this.cycles, end = c0 + cycles;
    while (this.cycles < end) this.step();
    return this.cycles - c0;
  }

  /** The state, to restore later (determinism for grading): the memories and the registers, not the hooks nor the
   *  clock events (the peripherals' own). */
  save() {
    return {
      mem: this.mem.slice(), prog: this.prog.slice(), latches: [...this.latches], pc: this.pc, cycles: this.cycles,
      winit: this.winit, splimSet: this.splimSet, dmask: this.dmask, trapReq: this.trapReq, sleeping: this.sleeping,
      repFirst: this.repFirst, divIter: this.divIter, shadow: this.shadow && { w: [...this.shadow.w], sr: this.shadow.sr },
    };
  }
  restore(s) {
    this.mem.set(s.mem);
    this.prog.set(s.prog);
    this.latches = new Map(s.latches);
    Object.assign(this, { pc: s.pc, cycles: s.cycles, winit: s.winit, splimSet: s.splimSet, dmask: s.dmask, trapReq: s.trapReq,
      sleeping: s.sleeping, repFirst: s.repFirst, divIter: s.divIter, shadow: s.shadow && { w: [...s.shadow.w], sr: s.shadow.sr } });
    this.intDirty = true;
    this.irq = null;
  }

  // the Z flag of the instructions with a carry in (ADDC, SUBB, CPB, SUBBR: DS70000157 4.10): cleared, never set
  stickyZ(res) { return res === 0 && this.mem[SRW] & Z ? Z : 0; }
  carry() { return this.mem[SRW] & C; }
}

