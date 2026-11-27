// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// The Zynq-7000's processing system configured from Silinx (#4686, roadmap #4679 phase b): Silinx's own ps7_init, the
// register writes that set the PS up from its board's description (core/boards-vivado.js `ps`), with no Vivado block
// design and no DDR (a program runs in the on-chip memory, OCM): the MIO pins of its UART and of its PS LEDs and buttons,
// the ARM and IO PLLs, the CPU's, the UART's and the PL's clock FCLK0, the AMBA peripherals' clocks; then, once the PL
// is configured, its post-configuration: the PS-PL level shifters on, the PL's resets released.
//
// The registers are the SLCR's (UG585, the Zynq-7000 Technical Reference Manual, appendix B: slcr): unlocked by
// SLCR_UNLOCK, locked again by SLCR_LOCK. A PLL is programmed as UG585 says (its CFG, its FDIV, bypassed, reset, its
// lock polled, the bypass released). Its CFG fields (PLL_CP, PLL_RES, LOCK_CNT) are UG585's table of the FDIV, of which
// Silinx keeps the rows it has checked against Vivado's own output (PLL_CFG below); another FDIV is refused, not guessed.
// Checked against the boards' ps7_init of Vivado (the Zybo Z7's in U-Boot, the PYNQ-Z1's, the Arty Z7's twin, at
// 50 MHz) as references, not copied: test/zynq-ps7.test.js.
//
// The result is data, the writes in order (`{ op: 'write' | 'mask' | 'poll', addr, mask, value }`), which the JTAG loader
// runs through the ARM DAP (#4687) and a listing shows. Isomorphic module (browser + Node).

const SLCR = 0xF8000000;
const R = {
  SLCR_LOCK: 0x004, SLCR_UNLOCK: 0x008,
  ARM_PLL_CTRL: 0x100, IO_PLL_CTRL: 0x108, PLL_STATUS: 0x10C, ARM_PLL_CFG: 0x110, IO_PLL_CFG: 0x118,
  ARM_CLK_CTRL: 0x120, APER_CLK_CTRL: 0x12C, UART_CLK_CTRL: 0x154, FPGA0_CLK_CTRL: 0x170, CLK_621_TRUE: 0x1C4,
  FPGA_RST_CTRL: 0x240, MIO_PIN_00: 0x700, LVL_SHFTR_EN: 0x900,
};
export const SLCR_UNLOCK_KEY = 0xDF0D, SLCR_LOCK_KEY = 0x767B;
// PLL_CFG of an FDIV (UG585's "PLL Frequency Control Settings"): [PLL_CP, PLL_RES, LOCK_CNT], the rows checked against
// Vivado's output (FDIV 26: the PYNQ-Z1's ARM PLL; 30, 32, 40: the Zybo Z7's IO, DDR and ARM PLLs)
export const PLL_CFG = { 26: [2, 12, 375], 30: [2, 12, 325], 32: [2, 2, 300], 40: [2, 2, 250] };
// a PLL's output range (UG585: 780 to 1600 MHz)
const PLL_MIN_HZ = 780e6, PLL_MAX_HZ = 1600e6;
// an MIO pin's I/O standard (MIO_PIN_xx's IO_Type) and the UART's L3_SEL (UG585's MIO table: UART1's TX and RX on
// pins 4k and 4k+1 from pin 8, as the Zybo Z7's 48 and 49; UART0's RX and TX on 4k+2 and 4k+3 from pin 10, as the
// Arty Z7's 14 and 15)
const IO_TYPE = { LVCMOS18: 1, LVCMOS25: 2, LVCMOS33: 3, HSTL: 4 };
const L3_UART = 7;
// the AMBA peripherals' clocks (APER_CLK_CTRL): the UARTs', the GPIO's
const APER = { uart0: 1 << 20, uart1: 1 << 21, gpio: 1 << 22 };

const hex = (n) => `0x${(n >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
const reg = (name) => SLCR + R[name];
const write = (name, value) => ({ op: 'write', addr: reg(name), mask: 0xFFFFFFFF, value: value >>> 0, reg: name });
const mask = (name, m, value, addr = reg(name)) => ({ op: 'mask', addr, mask: m >>> 0, value: (value & m) >>> 0, reg: name });
const poll = (name, m) => ({ op: 'poll', addr: reg(name), mask: m >>> 0, value: m >>> 0, reg: name });
const mioReg = (pin) => SLCR + R.MIO_PIN_00 + 4 * pin;

/** Whether `pins` [rx, tx] are UART `id`'s on the MIO (UG585's MIO table). */
export function uartPinsOk(id, [rx, tx]) {
  if (!Number.isInteger(rx) || !Number.isInteger(tx) || rx > 53 || tx > 53) return false;
  return id === 1 ? tx >= 8 && tx % 4 === 0 && rx === tx + 1 : rx >= 10 && rx % 4 === 2 && tx === rx + 1;
}

/** Two divisors of n (1..63 each), the first the larger: n = d0 × d1, d1 the largest at most √n (as Vivado's), or null. */
export function divisors(n) {
  if (!Number.isInteger(n) || n < 1) return null;
  for (let d1 = Math.floor(Math.sqrt(n)); d1 >= 1; d1--) if (n % d1 === 0 && n / d1 <= 63) return [n / d1, d1];
  return null;
}

/**
 * The PS's configuration from a board's `ps` description: { init, post, clocks } (init: the writes before the program,
 * post: after the PL is configured; clocks: the frequencies they make, Hz), or { error }.
 * ps: { clkHz (PS_CLK), armFdiv, cpuDiv (the CPU's 6x4x clock: the ARM PLL / cpuDiv), ioFdiv, uart: { id, rx, tx,
 *   io, refHz }, fclk0Hz, gpio?: [{ name, mio, dir: 'in' | 'out', io }] } (a 33.333 MHz PS_CLK given as 100e6 / 3)
 */
export function ps7Init(ps) {
  const err = (e) => ({ error: e });
  if (!ps || !(ps.clkHz > 0)) return err('no processing system described for this board');
  const pll = (name, fdiv) => {
    if (!PLL_CFG[fdiv]) return `the ${name} PLL's FDIV ${fdiv}: no PLL settings known for it (FDIV ${Object.keys(PLL_CFG).join(', ')})`;
    const hz = ps.clkHz * fdiv;
    return hz < PLL_MIN_HZ || hz > PLL_MAX_HZ ? `the ${name} PLL at ${Math.round(hz / 1e6)} MHz: outside 780 to 1600 MHz` : null;
  };
  const bad = pll('ARM', ps.armFdiv) || pll('IO', ps.ioFdiv);
  if (bad) return err(bad);
  const arm = ps.clkHz * ps.armFdiv, io = ps.clkHz * ps.ioFdiv;
  if (!Number.isInteger(ps.cpuDiv) || ps.cpuDiv < 1 || ps.cpuDiv > 63) return err(`the CPU's divisor ${ps.cpuDiv}: from 1 to 63`);
  const u = ps.uart || {};
  if (![0, 1].includes(u.id)) return err('the UART: UART0 or UART1');
  if (!uartPinsOk(u.id, [u.rx, u.tx])) return err(`UART${u.id} on MIO ${u.rx} and ${u.tx}: not a pair of its pins`);
  // (a ratio of a PS_CLK of a third: whole within a rounding)
  const whole = (x) => (Math.abs(x - Math.round(x)) < 1e-6 ? Math.round(x) : x);
  const uartDiv = whole(io / u.refHz);
  if (!Number.isInteger(uartDiv) || uartDiv < 1 || uartDiv > 63) return err(`the UART's clock ${u.refHz} Hz: the IO PLL divided by 1 to 63`);
  const fclk = divisors(whole(io / ps.fclk0Hz));
  if (!fclk) return err(`FCLK0 at ${ps.fclk0Hz} Hz: not the IO PLL divided by two divisors of 1 to 63`);
  for (const [what, io] of [[`UART${u.id}`, u.io], ...(ps.gpio || []).map((g) => [g.name, g.io])]) if (!IO_TYPE[io]) return err(`${what}'s I/O standard ${io}: LVCMOS18, LVCMOS25, LVCMOS33 or HSTL`);

  // an MIO pin's MIO_PIN_xx: TRI_ENABLE (an input), its signal's selects, IO_Type, PULLUP (the UART's)
  const mio = (pin, { tri, l3 = 0, io, pullup }) => mask(`MIO_PIN_${String(pin).padStart(2, '0')}`, 0x3FFF,
    (tri ? 1 : 0) | (l3 << 5) | (IO_TYPE[io] << 9) | (pullup ? 1 << 12 : 0), mioReg(pin));
  // a PLL programmed (UG585: its CFG and FDIV, bypassed, reset and released, its lock polled, the bypass released)
  const [cp, res, lock] = [0, 1, 2];
  const pllOps = (x, fdiv, bit) => [
    mask(`${x}_PLL_CFG`, 0x003FFFF0, (PLL_CFG[fdiv][lock] << 12) | (PLL_CFG[fdiv][cp] << 8) | (PLL_CFG[fdiv][res] << 4)),
    mask(`${x}_PLL_CTRL`, 0x0007F000, fdiv << 12),
    mask(`${x}_PLL_CTRL`, 0x10, 0x10), mask(`${x}_PLL_CTRL`, 0x1, 0x1), mask(`${x}_PLL_CTRL`, 0x1, 0x0),
    poll('PLL_STATUS', 1 << bit),
    mask(`${x}_PLL_CTRL`, 0x10, 0x0),
  ];
  const init = [
    write('SLCR_UNLOCK', SLCR_UNLOCK_KEY),
    // the MIO: the UART's TX and RX (an input: its driver off), in the pins' order; the PS's LEDs and buttons (GPIO,
    // their direction the GPIO's own)
    ...[[u.tx, false], [u.rx, true]].sort((a, b) => a[0] - b[0]).map(([pin, tri]) => mio(pin, { tri, l3: L3_UART, io: u.io, pullup: true })),
    ...(ps.gpio || []).map((g) => mio(g.mio, { tri: false, io: g.io })),
    // the PLLs: the ARM's (the CPU), the IO's (the UART, FCLK0)
    ...pllOps('ARM', ps.armFdiv, 0),
    mask('ARM_CLK_CTRL', 0x1F003F30, (0x1F << 24) | (ps.cpuDiv << 8)),   // (the CPU's clocks on, its divisor, from the ARM PLL)
    ...pllOps('IO', ps.ioFdiv, 2),
    // the clocks: the UART's (from the IO PLL), FCLK0, the CPU's 6:2:1 ratio, the UART's and the GPIO's AMBA clocks
    mask('UART_CLK_CTRL', 0x3F33, (uartDiv << 8) | (u.id === 1 ? 0x2 : 0x1)),
    mask('FPGA0_CLK_CTRL', 0x03F03F30, (fclk[1] << 20) | (fclk[0] << 8)),
    mask('CLK_621_TRUE', 0x1, 0x1),
    mask('APER_CLK_CTRL', 0x01FFCCCD, (u.id === 1 ? APER.uart1 : APER.uart0) | APER.gpio),
    write('SLCR_LOCK', SLCR_LOCK_KEY),
  ];
  const post = [
    write('SLCR_UNLOCK', SLCR_UNLOCK_KEY),
    mask('LVL_SHFTR_EN', 0xF, 0xF),        // (the PS-PL level shifters on)
    mask('FPGA_RST_CTRL', 0xFFFFFFFF, 0),   // (the PL's resets released)
    write('SLCR_LOCK', SLCR_LOCK_KEY),
  ];
  return { init, post, clocks: { armPll: arm, ioPll: io, cpu: arm / ps.cpuDiv, uart: u.refHz, fclk0: io / fclk[0] / fclk[1] } };
}

/** The writes as text, a line each (a report's, a console's): `mask 0xF8000110 0x003FFFF0 0x000FA220  ARM_PLL_CFG`. */
export function ps7Listing(ops) {
  return ops.map((o) => `${o.op.padEnd(5)} ${hex(o.addr)} ${hex(o.mask)} ${o.op === 'poll' ? '          ' : hex(o.value)}  ${o.reg}`).join('\n');
}
