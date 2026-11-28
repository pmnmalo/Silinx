// A Zynq node's PS clocks of its own (#5896, core/zynq-ps-clocks.js): its CPU's clock and FCLK0 per node (`psClocks`,
// Hz; a Board project's silinx.json the same), Silinx's ps7_init made from them. Checked against Vivado's ps7_init as
// independent references (U-Boot's board/xilinx/zynq/*/ps7_init_gpl.c, register facts only): the ZedBoard's, the
// MicroZed's, the ZC702's and the ZC706's FPGA0..3_CLK_CTRL, all from an IO PLL of 1000 MHz as the Zybo Z7's: each
// frequency they make made by Silinx too, the same divisors' product (Vivado's pair is its version's choice: these older
// designs N x 1, the Zybo Z7's 2018 preset 5 x 4, Silinx's rule, kept exactly); refused, with the nearest frequencies, what
// the PLLs cannot make; kept by the System document, edited (merged, removed), checked and described; a Board project's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { psClocksError, withPsClocks, nodePs, PS_CPU_MAX_HZ } from '../core/zynq-ps-clocks.js';
import { psOfBoard, psProblems, psSummary } from '../core/zynq-ps.js';
import { ps7Init } from '../core/zynq-ps7.js';
import { normalizeSystem, readSystem, writeSystem } from '../core/system-doc.js';
import { changeNode } from '../core/system-edit.js';
import { analyzeSystem } from '../core/system-check.js';
import { projectSystem } from '../core/project-system.js';
import { psLoadPlan } from '../core/zynq-ps-load.js';

const ZYBO = psOfBoard('zybo-z7');
const zybo = { id: 'zybo', kind: 'fpga', module: 'leds', board: 'zybo-z7', variant: '20', ps: 'zybo/ps/main.c', interfaces: [], x: 0, y: 0 };
const fpga0 = (ps) => ps7Init(ps).init.find((o) => o.reg === 'FPGA0_CLK_CTRL').value;
const armClk = (ps) => ps7Init(ps).init.find((o) => o.reg === 'ARM_CLK_CTRL').value;
const divs = (v) => [(v >> 8) & 0x3f, (v >> 20) & 0x3f];

// Vivado's FPGAn_CLK_CTRL values of the reference boards (IO PLL 1000 MHz): ZedBoard 0x00100A00, 0x00100700, 0x00101400;
// MicroZed 0x00100A00, 0x00101E00; ZC702 / ZC706 0x00101400; the old Zybo 0x00100500
const VIVADO = [0x00100A00, 0x00100700, 0x00101400, 0x00101E00, 0x00100500];

test('#5896 FCLK0 per node against Vivado\'s ps7_init: the references\' frequencies made, the same divisors\' product; the Zybo Z7\'s own exactly', () => {
  for (const ref of VIVADO) {
    const [d0, d1] = divs(ref), hz = 1e9 / (d0 * d1);
    const ps = withPsClocks(ZYBO, { fclk0: Math.round(hz) });
    assert.equal(psClocksError({ fclk0: Math.round(hz) }, ZYBO), null, `0x${ref.toString(16)}`);
    const [m0, m1] = divs(fpga0(ps));
    assert.equal(m0 * m1, d0 * d1, `0x${ref.toString(16)}: ${m0} x ${m1}`);
    assert.ok(Math.abs(ps7Init(ps).clocks.fclk0 - hz) < 1, `0x${ref.toString(16)}`);
  }
  // (the Zybo Z7's preset, Vivado 2018.2: 50 MHz as 5 x 4, as the board's own)
  assert.equal(fpga0(withPsClocks(ZYBO, { fclk0: 50e6 })), 0x00400500);
  assert.equal(fpga0(withPsClocks(ZYBO, { fclk0: 100e6 })), 0x00200500);
  // (the CPU: the ARM PLL's 1333.333 MHz / 3, ARM_CLK_CTRL's divisor; the board's / 2 Vivado's 0x1F000200)
  assert.equal(armClk(ZYBO), 0x1F000200);
  assert.equal(armClk(withPsClocks(ZYBO, { cpu: 444444444 })), 0x1F000300);
  assert.ok(Math.abs(ps7Init(withPsClocks(ZYBO, { cpu: 444444444 })).clocks.cpu - 4e9 / 9) < 1);
});

test('#5896 refused with the nearest frequencies the PLLs make: FCLK0 7 MHz, the CPU at 500 or 700 MHz; not a frequency, an unknown field', () => {
  assert.equal(PS_CPU_MAX_HZ, 667e6);
  assert.equal(psClocksError({ fclk0: 7e6 }, ZYBO), 'FCLK0 at 7 MHz: its IO PLL\'s 1000 MHz divided by two divisors of 1 to 63: the nearest it makes, 6.993 MHz or 7.092 MHz');
  assert.equal(psClocksError({ cpu: 500e6 }, ZYBO), 'the CPU at 500 MHz: its ARM PLL\'s 1333.333 MHz divided by 1 to 63, at most 667 MHz: the nearest it makes, 444.444 MHz or 666.667 MHz');
  assert.equal(psClocksError({ cpu: 700e6 }, ZYBO), 'the CPU at 700 MHz: its ARM PLL\'s 1333.333 MHz divided by 1 to 63, at most 667 MHz: the nearest it makes, 666.667 MHz');
  assert.equal(psClocksError({ cpu: 'fast' }, ZYBO), 'its PS\'s cpu clock is a frequency in Hz, not \'fast\'');
  assert.equal(psClocksError({ ddr: 1 }, ZYBO), 'its PS clocks have no \'ddr\' (cpu, fclk0)');
  assert.equal(psClocksError({ cpu: 650e6 }, null), 'its board has no processing system');
  // (the Arty Z7's: its 50 MHz PS_CLK, ARM PLL 1300 MHz, IO PLL 1600 MHz)
  assert.equal(psClocksError({ cpu: 650e6, fclk0: 200e6 }, psOfBoard('arty-z7')), null);
  assert.equal(fpga0(withPsClocks(psOfBoard('arty-z7'), { fclk0: 200e6 })), 0x00200400);
});

test('#5896 a node\'s PS clocks: kept by the document, edited (merged, one removed, all), refused; checked and described; nodePs', () => {
  const s = normalizeSystem({ format: 'silinx-system', version: 2, name: 's', nodes: [zybo], links: [] });
  const a = changeNode(s, 'zybo', { psClocks: { fclk0: 100e6 } });
  assert.deepEqual(a.system.nodes[0].psClocks, { fclk0: 100e6 });
  const b = changeNode(a.system, 'zybo', { psClocks: { cpu: 444444444 } });
  assert.deepEqual(b.system.nodes[0].psClocks, { fclk0: 100e6, cpu: 444444444 });
  assert.deepEqual(readSystem(writeSystem(b.system)).system.nodes[0].psClocks, { cpu: 444444444, fclk0: 100e6 });
  assert.deepEqual(changeNode(b.system, 'zybo', { psClocks: { cpu: null } }).system.nodes[0].psClocks, { fclk0: 100e6 });
  assert.equal('psClocks' in changeNode(b.system, 'zybo', { psClocks: null }).system.nodes[0], false);
  assert.deepEqual(changeNode(s, 'zybo', { psClocks: { fclk0: 7e6 } }), { error: 'zybo: FCLK0 at 7 MHz: its IO PLL\'s 1000 MHz divided by two divisors of 1 to 63: the nearest it makes, 6.993 MHz or 7.092 MHz' });
  const b3 = normalizeSystem({ ...s, nodes: [{ ...zybo, board: 'basys3', variant: undefined, ps: undefined }] });
  assert.deepEqual(changeNode(b3, 'zybo', { psClocks: { fclk0: 100e6 } }), { error: 'zybo: its board has no processing system' });
  // (described: the CPU and FCLK0 the node's; nodePs)
  const n = b.system.nodes[0];
  assert.equal(psSummary(n), 'its PS\'s program zybo/ps/main.c: the Cortex-A9 at 444.4 MHz, UART1 on MIO 48 (TX) and 49 (RX), FCLK0 100 MHz');
  assert.deepEqual([nodePs(n).cpuDiv, nodePs(n).fclk0Hz, nodePs(zybo)], [3, 100e6, ZYBO]);
  // (written by hand out of reach: the check says it, nodePs the board's)
  const bad = { ...zybo, psClocks: { cpu: 500e6 } };
  assert.deepEqual(psProblems(bad), ['zybo: the CPU at 500 MHz: its ARM PLL\'s 1333.333 MHz divided by 1 to 63, at most 667 MHz: the nearest it makes, 444.444 MHz or 666.667 MHz']);
  assert.equal(nodePs(bad), ZYBO);
  const d = analyzeSystem(normalizeSystem({ ...s, nodes: [bad] }), {}).diags.filter((x) => x.severity === 'error').map((x) => x.message);
  assert.ok(d.includes('zybo: the CPU at 500 MHz: its ARM PLL\'s 1333.333 MHz divided by 1 to 63, at most 667 MHz: the nearest it makes, 444.444 MHz or 666.667 MHz'), d.join('\n'));
});

test('#5896 a Board project\'s PS clocks (its silinx.json\'s), its implicit node\'s; the load\'s plan made from a node\'s own clocks', () => {
  const pj = { name: 'p', board: 'zybo-z7', device: { family: 'zynq', part: 'xc7z020', package: 'clg400', speed: '-1' }, top: 'top', constraints: 'top.xdc', ps: 'ps/main.c', psClocks: { fclk0: 100e6 } };
  const [n] = projectSystem(pj).model.nodes;
  assert.deepEqual(n.psClocks, { fclk0: 100e6 });
  const plan = psLoadPlan({ elf: { entry: 0, segments: [{ addr: 0, bytes: new Uint8Array(4), memsz: 4 }], size: 4, memsz: 4 }, ps: nodePs(n) });
  assert.equal(plan.init.find((o) => o.reg === 'FPGA0_CLK_CTRL').value, 0x00200500);
});
