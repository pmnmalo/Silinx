// The Zynq-7000's processing system set up by Silinx's own ps7_init (#4686, core/zynq-ps7.js): the register writes made
// from the boards' descriptions (core/boards-vivado.js `ps`) checked, write by write, against the boards' ps7_init of
// Vivado as independent references: the Zybo Z7's (U-Boot's board/xilinx/zynq/zynq-zybo-z7/ps7_init_gpl.c, from
// Digilent's Zybo Z7-20 preset, Vivado 2018.2) and the PYNQ-Z1's (a Vivado 2018.1 design of the Arty Z7's twin: its
// 50 MHz PS_CLK, UART0 on MIO 14 / 15), their addresses, masks and values (register facts only, no text or code of theirs:
// both GPL-2.0-or-later, in THIRD-PARTY-NOTICES.md); the writes Silinx leaves out of them (the DDR,
// the other peripherals) and its own AMBA clocks (the UART's and the GPIO's only) said; the refusals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ps7Init, ps7Listing, divisors, uartPinsOk, PLL_CFG, SLCR_UNLOCK_KEY, SLCR_LOCK_KEY } from '../core/zynq-ps7.js';
import { VIVADO_BOARDS } from '../core/boards-vivado.js';

const board = (id) => VIVADO_BOARDS.find((b) => b.id === id);
// a write as [address, mask, value] (a poll: its mask as its value)
const triple = (o) => [o.addr, o.mask, o.value];

// the Zybo Z7's ps7_init of Vivado (U-Boot's), the writes Silinx makes too, in its order: [address, mask, value]
const ZYBO_REF = {
  mio: [[0xF80007C0, 0x3FFF, 0x12E0], [0xF80007C4, 0x3FFF, 0x12E1], [0xF800071C, 0x3FFF, 0x600], [0xF80007C8, 0x3FFF, 0x200], [0xF80007CC, 0x3FFF, 0x200]],
  arm: [[0xF8000110, 0x003FFFF0, 0x000FA220], [0xF8000100, 0x0007F000, 0x00028000], [0xF8000100, 0x10, 0x10], [0xF8000100, 1, 1], [0xF8000100, 1, 0],
    [0xF800010C, 1, 1], [0xF8000100, 0x10, 0], [0xF8000120, 0x1F003F30, 0x1F000200]],
  io: [[0xF8000118, 0x003FFFF0, 0x001452C0], [0xF8000108, 0x0007F000, 0x0001E000], [0xF8000108, 0x10, 0x10], [0xF8000108, 1, 1], [0xF8000108, 1, 0],
    [0xF800010C, 4, 4], [0xF8000108, 0x10, 0]],
  clocks: [[0xF8000154, 0x3F33, 0xA02], [0xF8000170, 0x03F03F30, 0x00400500], [0xF80001C4, 1, 1]],
  post: [[0xF8000008, 0xFFFFFFFF, 0xDF0D], [0xF8000900, 0xF, 0xF], [0xF8000240, 0xFFFFFFFF, 0], [0xF8000004, 0xFFFFFFFF, 0x767B]],
};
// the PYNQ-Z1's (the Arty Z7's twin): its UART0's MIO, its ARM PLL (FDIV 26, 1300 MHz), its IO PLL (FDIV 32, 1600 MHz), its
// UART's clock (/16) and FCLK0 (100 MHz: /4 /4)
const PYNQ_REF = {
  mio: [[0xF8000738, 0x3FFF, 0x16E1], [0xF800073C, 0x3FFF, 0x16E0]],
  armCfg: [0xF8000110, 0x003FFFF0, 0x001772C0], armFdiv: [0xF8000100, 0x0007F000, 0x0001A000], armClk: [0xF8000120, 0x1F003F30, 0x1F000200],
  ioCfg: [0xF8000118, 0x003FFFF0, 0x0012C220], ioFdiv: [0xF8000108, 0x0007F000, 0x00020000],
  clocks: [[0xF8000154, 0x3F33, 0x1001], [0xF8000170, 0x03F03F30, 0x00400400], [0xF80001C4, 1, 1]],
};

test('#4686 the Zybo Z7\'s PS: its MIO, its ARM and IO PLLs, its CPU\'s, UART\'s and FCLK0\'s clocks, its post-configuration as Vivado\'s ps7_init writes them', () => {
  const r = ps7Init(board('zybo-z7').ps);
  assert.equal(r.error, undefined);
  const w = r.init.map(triple);
  // unlocked first, locked last; between, Vivado's writes in its order, then the AMBA clocks Silinx's own
  assert.deepEqual([w[0], w.at(-1)], [[0xF8000008, 0xFFFFFFFF, SLCR_UNLOCK_KEY], [0xF8000004, 0xFFFFFFFF, SLCR_LOCK_KEY]]);
  assert.deepEqual(w.slice(1, -2), [...ZYBO_REF.mio, ...ZYBO_REF.arm, ...ZYBO_REF.io, ...ZYBO_REF.clocks]);
  // (the AMBA clocks: UART1's and the GPIO's, where Vivado's turn the board's other peripherals' on too, 0x01EC044D)
  assert.deepEqual(w.at(-2), [0xF800012C, 0x01FFCCCD, (1 << 21) | (1 << 22)]);
  assert.deepEqual(r.post.map(triple), ZYBO_REF.post);
  assert.deepEqual(Object.fromEntries(Object.entries(r.clocks).map(([k, v]) => [k, Math.round(v / 1e3) / 1e3])), { armPll: 1333.333, ioPll: 1000, cpu: 666.667, uart: 100, fclk0: 50 });
  // a poll's value its mask (the bit set: the PLL locked)
  assert.ok(r.init.filter((o) => o.op === 'poll').every((o) => o.value === o.mask && o.reg === 'PLL_STATUS'));
});

test('#4686 the Arty Z7\'s PS: UART0 on MIO 14 / 15 at 3.3 V, the CPU at 650 MHz from a 50 MHz PS_CLK, as the PYNQ-Z1\'s ps7_init', () => {
  const r = ps7Init(board('arty-z7').ps);
  assert.equal(r.error, undefined);
  const w = r.init.map(triple), has = (x) => w.some((y) => y.join() === x.join());
  assert.deepEqual(w.slice(1, 3), PYNQ_REF.mio);
  for (const x of [PYNQ_REF.armCfg, PYNQ_REF.armFdiv, PYNQ_REF.armClk, PYNQ_REF.ioCfg, PYNQ_REF.ioFdiv, ...PYNQ_REF.clocks]) assert.ok(has(x), x.map((n) => n.toString(16)).join(' '));
  assert.deepEqual(w.at(-2), [0xF800012C, 0x01FFCCCD, (1 << 20) | (1 << 22)]);   // (UART0's and the GPIO's)
  assert.deepEqual(r.clocks, { armPll: 1300e6, ioPll: 1600e6, cpu: 650e6, uart: 100e6, fclk0: 100e6 });
  // (no PS LED or button: no other MIO pin written)
  assert.deepEqual(r.init.filter((o) => o.reg.startsWith('MIO_PIN_')).map((o) => o.reg), ['MIO_PIN_14', 'MIO_PIN_15']);
});

test('#4686 every Zynq board has its PS described, its ps7_init made; the boards of other families none', () => {
  assert.deepEqual(VIVADO_BOARDS.filter((b) => b.ps).map((b) => b.id), ['zybo-z7', 'arty-z7']);
  assert.ok(VIVADO_BOARDS.every((b) => !!b.ps === (b.device.family === 'zynq')));
  for (const b of VIVADO_BOARDS.filter((x) => x.ps)) assert.equal(ps7Init(b.ps).error, undefined, b.id);
});

test('#4686 the PLLs\' settings: UG585\'s table, its rows checked against Vivado\'s (FDIV 26, 30, 32, 40); their CFG words', () => {
  // (the CFG word: LOCK_CNT bits 21:12, PLL_CP 11:8, PLL_RES 7:4)
  const cfg = (f) => (PLL_CFG[f][2] << 12) | (PLL_CFG[f][0] << 8) | (PLL_CFG[f][1] << 4);
  assert.deepEqual(Object.keys(PLL_CFG).map(Number).map((f) => [f, cfg(f).toString(16)]), [[26, '1772c0'], [30, '1452c0'], [32, '12c220'], [40, 'fa220']]);
});

test('#4686 divisors and the UARTs\' MIO pins', () => {
  assert.deepEqual([16, 20, 64, 61, 10, 1].map(divisors), [[4, 4], [5, 4], [8, 8], [61, 1], [5, 2], [1, 1]]);
  assert.deepEqual([127, 3970, 0, 2.5, -4].map(divisors), [null, null, null, null, null]);
  assert.ok(uartPinsOk(1, [49, 48]) && uartPinsOk(1, [9, 8]) && uartPinsOk(0, [14, 15]) && uartPinsOk(0, [10, 11]) && uartPinsOk(0, [46, 47]));
  assert.ok(!uartPinsOk(1, [48, 49]) && !uartPinsOk(0, [15, 14]) && !uartPinsOk(0, [12, 13]) && !uartPinsOk(1, [5, 4]) && !uartPinsOk(0, [54, 55]) && !uartPinsOk(1, [undefined, 8]));
});

test('#4686 a PS that cannot be set up is refused, with its reason', () => {
  const zybo = board('zybo-z7').ps, with_ = (o) => ({ ...zybo, ...o });
  const errors = [
    ps7Init(null), ps7Init({}),
    ps7Init(with_({ armFdiv: 41 })), ps7Init(with_({ clkHz: 50e6 })),
    ps7Init(with_({ cpuDiv: 0 })),
    ps7Init(with_({ uart: { ...zybo.uart, id: 2 } })), ps7Init(with_({ uart: { ...zybo.uart, tx: 49, rx: 48 } })),
    ps7Init(with_({ uart: { ...zybo.uart, refHz: 30e6 } })),
    ps7Init(with_({ fclk0Hz: 7e6 })),
    ps7Init(with_({ uart: { ...zybo.uart, io: 'LVTTL' } })), ps7Init(with_({ gpio: [{ name: 'LD4', mio: 7, dir: 'out', io: 'SSTL' }] })),
  ].map((r) => r.error);
  assert.deepEqual(errors, [
    'no processing system described for this board', 'no processing system described for this board',
    'the ARM PLL\'s FDIV 41: no PLL settings known for it (FDIV 26, 30, 32, 40)', 'the ARM PLL at 2000 MHz: outside 780 to 1600 MHz',
    'the CPU\'s divisor 0: from 1 to 63',
    'the UART: UART0 or UART1', 'UART1 on MIO 48 and 49: not a pair of its pins',
    'the UART\'s clock 30000000 Hz: the IO PLL divided by 1 to 63',
    'FCLK0 at 7000000 Hz: not the IO PLL divided by two divisors of 1 to 63',
    'UART1\'s I/O standard LVTTL: LVCMOS18, LVCMOS25, LVCMOS33 or HSTL', 'LD4\'s I/O standard SSTL: LVCMOS18, LVCMOS25, LVCMOS33 or HSTL',
  ]);
});

test('#4686 the writes\' listing: a line each, its address, mask and value in hexadecimal, its register named', () => {
  const r = ps7Init(board('zybo-z7').ps);
  const lines = ps7Listing(r.init).split('\n');
  assert.equal(lines.length, r.init.length);
  assert.equal(lines[0], 'write 0xF8000008 0xFFFFFFFF 0x0000DF0D  SLCR_UNLOCK');
  assert.ok(lines.includes('mask  0xF8000110 0x003FFFF0 0x000FA220  ARM_PLL_CFG'));
  assert.ok(lines.includes('poll  0xF800010C 0x00000001             PLL_STATUS'));
});
