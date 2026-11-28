// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A Zynq node's PS clocks of its own (#5896): its CPU's clock and FCLK0, the PL's clock from the PS, set per node
// (`psClocks: { cpu, fclk0 }`, Hz; a Board project's silinx.json the same) instead of its board's (core/boards-vivado.js
// `ps`), Silinx's ps7_init (core/zynq-ps7.js) made from them. The PLLs stay the board's (their FDIVs are the rows of
// UG585's table Silinx has checked against Vivado): the CPU's clock is the ARM PLL divided by 1 to 63, at most the
// -1 speed grade's 667 MHz (DS187); FCLK0 the IO PLL divided by two divisors of 1 to 63 each. A frequency they cannot make
// is refused with the nearest ones they can; one within 100 ppm of one they make is that one (142.857 MHz: the IO PLL's
// 1000 MHz / 7). Isomorphic module (browser + Node).
import { psOfBoard } from './zynq-ps.js';
import { divisors } from './zynq-ps7.js';

/** The CPU's highest clock: the Zynq-7000's -1 speed grade's (DS187), the boards' parts'. */
export const PS_CPU_MAX_HZ = 667e6;
const PPM = 100e-6;
const mhz = (hz) => `${Math.round(hz / 1e3) / 1e3} MHz`;
const armPll = (ps) => ps.clkHz * ps.armFdiv;
const ioPll = (ps) => ps.clkHz * ps.ioFdiv;

// the divisor that makes `hz` from `pll` within PPM, among `ok`, or null
const divisorFor = (pll, hz, ok) => {
  const n = Math.round(pll / hz);
  return n >= 1 && Math.abs(pll / n - hz) <= hz * PPM && ok(n) ? n : null;
};
// the frequencies a PLL makes, divided by the divisors `ok` allows (1..max), highest first
const made = (pll, ok, max) => Array.from({ length: max }, (_, i) => i + 1).filter(ok).map((n) => pll / n);
// the one below and the one above `hz` among `list`, as text
const nearest = (list, hz) => {
  const below = list.filter((f) => f < hz).sort((a, b) => b - a)[0], above = list.filter((f) => f > hz).sort((a, b) => a - b)[0];
  return [below, above].filter((f) => f != null).map(mhz).join(' or ');
};
const cpuOk = (ps) => (n) => n <= 63 && armPll(ps) / n <= PS_CPU_MAX_HZ + 1;
const fclkOk = (n) => divisors(n) != null;

/** Why `psClocks` ({ cpu, fclk0 }, Hz, each optional) cannot be made by board PS `ps`, or null. */
export function psClocksError(psClocks, ps) {
  if (psClocks == null) return null;
  if (typeof psClocks !== 'object' || Array.isArray(psClocks)) return 'its PS clocks are { cpu, fclk0 } (Hz)';
  for (const k of Object.keys(psClocks)) if (!['cpu', 'fclk0'].includes(k)) return `its PS clocks have no '${k}' (cpu, fclk0)`;
  if (!ps) return 'its board has no processing system';
  const { cpu, fclk0 } = psClocks;
  for (const [k, v] of [['cpu', cpu], ['fclk0', fclk0]]) if (v != null && !(Number.isFinite(v) && v > 0)) return `its PS's ${k} clock is a frequency in Hz, not '${v}'`;
  if (cpu != null && divisorFor(armPll(ps), cpu, cpuOk(ps)) == null) {
    return `the CPU at ${mhz(cpu)}: its ARM PLL's ${mhz(armPll(ps))} divided by 1 to 63, at most ${mhz(PS_CPU_MAX_HZ)}: the nearest it makes, ${nearest(made(armPll(ps), cpuOk(ps), 63), cpu)}`;
  }
  if (fclk0 != null && divisorFor(ioPll(ps), fclk0, fclkOk) == null) {
    return `FCLK0 at ${mhz(fclk0)}: its IO PLL's ${mhz(ioPll(ps))} divided by two divisors of 1 to 63: the nearest it makes, ${nearest(made(ioPll(ps), fclkOk, 63 * 63), fclk0)}`;
  }
  return null;
}

/** Board PS `ps` with `psClocks` (psClocksError's null) in it: its CPU's divisor, FCLK0's frequency as the PLLs make it. */
export function withPsClocks(ps, psClocks) {
  if (!ps || !psClocks) return ps;
  const out = { ...ps };
  if (psClocks.cpu != null) out.cpuDiv = divisorFor(armPll(ps), psClocks.cpu, cpuOk(ps));
  if (psClocks.fclk0 != null) out.fclk0Hz = ioPll(ps) / divisorFor(ioPll(ps), psClocks.fclk0, fclkOk);
  return out;
}

/** FPGA node `n`'s PS: its board's, with the node's own clocks (`psClocks`) when they can be made; null with no PS. */
export function nodePs(n) {
  const ps = psOfBoard(n?.board, n?.variant);
  return ps && n?.psClocks && !psClocksError(n.psClocks, ps) ? withPsClocks(ps, n.psClocks) : ps;
}
