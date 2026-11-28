// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A Zynq PS's program simulated (#4689, part 5a of #4688): its bare-metal C run by Silinx's C interpreter
// (core/c-interp.js, program: true), behavioural and said so: no ARM instruction emulated, each step of the interpreter
// one clock of the Cortex-A9 (1.5 ns at 666.7 MHz), the PS as set up by Silinx's ps7_init (its clocks, its MIO). The
// program's memory-mapped registers are this model's (UG585's appendix B):
//   - its UART (UART0 or UART1, the board's): CR, MR, BRGR, BDIV kept; a byte written to its FIFO while TX is on sent at
//     the baud its BRGR and BDIV make from the UART's clock (8N1: 10 bits), each byte's start time and its end; SR says
//     TXFULL while 64 bytes wait, TXEMPTY once all are sent, RXEMPTY always (nothing received);
//   - GPIO bank 0 (MIO 0-31): DATA_0, MASK_DATA_0_LSW / MSW, DIRM_0, OEN_0; an output pin's changes (DIRM and OEN set),
//     each with its time; DATA_0_RO the pins as driven;
//   - M_AXI_GP0's window, 0x40000000 to 0x7FFFFFFF: the PL's registers, each read and write given to `pl` (pl.read(off,
//     t), pl.write(off, value, t): the PL's simulation, part 5c) or, with none, kept (a read the last value written);
//   - any other address: the run stops there, said (its address, that the PS's model has no register there).
// Isomorphic ES module, no DOM.
//
//   const r = runPs(source, { ps: nodePs(n), file: 'zybo/ps/main.c', untilNs: 1e6 });
//   r -> { ok, error, output, uart: { baud, bytes: [{ byte, t, end }] }, gpio: [{ mio, value, t }],
//          pl: [{ op, off, value, t }], steps, time }   (times in ps)
import { simulateC, Stop } from './c-interp.js';
import { ps7Init } from './zynq-ps7.js';
import { UART_BASE } from './zynq-ps.js';

export const GP0_BASE = 0x40000000, GP0_END = 0x80000000;
const GPIO_BASE = 0xE000A000, FIFO_DEPTH = 64;
const hex = (a) => `0x${a.toString(16).toUpperCase().padStart(8, '0')}`;

/** The PS's registers as the program sees them, at the times its steps make (cyclePs: one step, in ps); the hooks of
 *  simulateC's mmio (read, write). */
export function psModel(ps, { pl = null } = {}) {
  const clocks = ps7Init(ps).clocks;
  const cyclePs = 1e12 / clocks.cpu, uartBase = UART_BASE[ps.uart.id];
  // (the UART's registers at their reset values: CR 0x128, BRGR 0x28B, BDIV 15)
  const u = { cr: 0x128, mr: 0, brgr: 0x28b, bdiv: 15, bytes: [] };
  const g = { out: 0, dirm: 0, oen: 0, driven: 0 };
  const m = { cyclePs, uart: u, gpio: [], pl: [], plRegs: new Map(), error: null };
  const now = (steps) => Math.round(steps * cyclePs);
  m.baud = () => clocks.uart / (u.brgr * (u.bdiv + 1));
  const waiting = (t) => u.bytes.filter((b) => b.t > t).length;
  const drive = (t) => {
    const en = (g.dirm & g.oen) >>> 0, v = (g.out & en) >>> 0;
    for (let i = 0; i < 32; i++) {
      const bit = 2 ** i, was = Math.floor(g.driven / bit) % 2, is = Math.floor(v / bit) % 2;
      if (Math.floor(en / bit) % 2 && was !== is) m.gpio.push({ mio: i, value: is, t });
    }
    g.driven = v;
  };
  const stop = (addr, what, steps) => {
    m.error = { message: `the program ${what} ${hex(addr)}, where the PS's model has no register (its UART${ps.uart.id}, GPIO bank 0 and M_AXI_GP0's window ${hex(GP0_BASE)} to ${hex(GP0_END - 1)} are simulated)`, t: now(steps) };
    throw new Stop(m.error.message);
  };
  m.read = (addr, bytes, steps) => {
    const t = now(steps);
    if (addr >= GP0_BASE && addr < GP0_END) {
      const off = addr - GP0_BASE, value = pl ? BigInt(pl.read(off, t)) : (m.plRegs.get(off) ?? 0n);
      m.pl.push({ op: 'read', off, value, t });
      return value;
    }
    if (addr >= uartBase && addr < uartBase + 0x48) {
      switch (addr - uartBase) {
        case 0x00: return BigInt(u.cr);
        case 0x04: return BigInt(u.mr);
        case 0x18: return BigInt(u.brgr);
        case 0x34: return BigInt(u.bdiv);
        case 0x2C: { const busy = u.bytes.some((b) => b.end > t); return BigInt((waiting(t) >= FIFO_DEPTH ? 1 << 4 : 0) | (busy ? 0 : 1 << 3) | (1 << 1)); }
        default: return 0n;
      }
    }
    switch (addr) {
      case GPIO_BASE + 0x40: return BigInt(g.out);
      case GPIO_BASE + 0x60: return BigInt(g.driven);
      case GPIO_BASE + 0x204: return BigInt(g.dirm);
      case GPIO_BASE + 0x208: return BigInt(g.oen);
      default: return stop(addr, 'reads', steps);
    }
  };
  m.write = (addr, bytes, value, steps) => {
    const t = now(steps), v = Number(BigInt.asUintN(32, value));
    if (addr >= GP0_BASE && addr < GP0_END) {
      const off = addr - GP0_BASE;
      if (pl) pl.write(off, BigInt(v), t); else m.plRegs.set(off, BigInt(v));
      m.pl.push({ op: 'write', off, value: BigInt(v), t });
      return;
    }
    if (addr >= uartBase && addr < uartBase + 0x48) {
      switch (addr - uartBase) {
        case 0x00: u.cr = v & 0x1ff; return;
        case 0x04: u.mr = v & 0x3ff; return;
        case 0x18: u.brgr = v & 0xffff; return;
        case 0x34: u.bdiv = v & 0xff; return;
        case 0x30: {
          // (sent once the bytes before it are, while TX is on: CR's TXEN set, TXDIS clear; lost on a full FIFO)
          if (!(u.cr & 0x10) || (u.cr & 0x20) || waiting(t) >= FIFO_DEPTH) return;
          const start = Math.max(t, u.bytes.at(-1)?.end ?? 0), end = start + Math.round(10 * 1e12 / m.baud());
          u.bytes.push({ byte: v & 0xff, t: start, end });
          return;
        }
        default: return;
      }
    }
    // (GPIO bank 0: MASK_DATA_0_LSW / MSW write the bits their mask leaves clear)
    const half = (old) => ((old & (v >>> 16)) | (v & 0xffff & ~(v >>> 16))) & 0xffff;
    switch (addr) {
      case GPIO_BASE + 0x40: g.out = v; break;
      case GPIO_BASE + 0x00: g.out = ((g.out & 0xffff0000) | half(g.out & 0xffff)) >>> 0; break;
      case GPIO_BASE + 0x04: g.out = ((half(g.out >>> 16) << 16) | (g.out & 0xffff)) >>> 0; break;
      case GPIO_BASE + 0x204: g.dirm = v; break;
      case GPIO_BASE + 0x208: g.oen = v; break;
      default: return stop(addr, 'writes', steps);
    }
    drive(t);
  };
  return m;
}

/** The program `source` run on PS `ps` (a board's, nodePs(n)) up to `untilNs` of its time, or until it returns or stops. */
export function runPs(source, { ps, file = 'main.c', untilNs = 1e6, pl = null, maxSteps = 50_000_000 } = {}) {
  const m = psModel(ps, { pl });
  const until = untilNs * 1000;
  const clock = { every: 1000, fn: (steps) => { if (steps * m.cyclePs >= until) throw new Stop('its time'); } };
  const r = simulateC(source, { file, program: true, mmio: m, clock, maxSteps });
  const error = m.error ? { line: null, col: null, message: m.error.message } : r.error ?? (r.ok ? null : r.diagnostics.find((d) => d.severity === 'error') ?? null);
  return { ok: r.ok && !m.error, error, diagnostics: r.diagnostics, output: r.output, uart: { baud: m.baud(), bytes: m.uart.bytes }, gpio: m.gpio, pl: m.pl,
    steps: r.steps, time: Math.round(r.steps * m.cyclePs) };
}
