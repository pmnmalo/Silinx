// A Zynq node's PS–PL registers in a System's run (#4689, part 5c of #4688): core/system-ps-pl.js's wires between the PS
// node and the module, as the PL's top wires them (plTopWiring): each written register's bits and a strobe's <name>_wr
// to the module's inputs, each ro register's bits back; the module's clk FCLK0's (50 MHz on the Zybo Z7, not its board's
// 125 MHz); the module's port that does not meet its register said. systemPlan with the node's map read (psMaps), and
// without it as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { psPlPlan, sigPins } from '../core/system-ps-pl.js';
import { systemPlan } from '../core/system-build.js';
import { readSystem } from '../core/system-doc.js';
import { readRegmap } from '../core/regmap.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EX = path.join(ROOT, 'examples/regs-zynq');
const SYS = readSystem(fs.readFileSync(path.join(EX, 'regs_zynq.sys.json'), 'utf8')).system;
const MAP = readRegmap(fs.readFileSync(path.join(EX, 'zybo/cnt_regs.regs.json'), 'utf8')).regmap;
const PORTS = [['clk', 'in', 1], ['enable', 'in', 1], ['period', 'in', 32], ['clear', 'in', 1], ['clear_wr', 'in', 1], ['count', 'out', 16], ['led', 'out', 4]]
  .map(([name, dir, width]) => ({ name, dir, width }));

test('#4689 the PS–PL registers\' wires: the written ones\' bits and the strobe to the module, the ro one\'s back; its clk FCLK0', () => {
  assert.deepEqual([sigPins('enable', 1), sigPins('p', 3)], [['enable'], ['p[0]', 'p[1]', 'p[2]']]);
  const r = psPlPlan(SYS.nodes[0], MAP, PORTS, 'zybo_ps');
  assert.deepEqual(r.errors, []);
  // (enable 1, period 32, count 16, clear 1 and its strobe 1)
  assert.equal(r.wires.length, 51);
  const by = (p) => r.wires.find((w) => w.from.endsWith(`.${p}`) || w.to.endsWith(`.${p}`));
  assert.deepEqual(by('enable'), { name: 'zybo_regs_enable', link: 'zybo.regs', kind: 'wire', from: 'zybo_ps.enable', to: 'zybo.enable' });
  assert.deepEqual(by('period[31]'), { name: 'zybo_regs_period_31', link: 'zybo.regs', kind: 'wire', from: 'zybo_ps.period[31]', to: 'zybo.period[31]' });
  assert.deepEqual(by('clear_wr'), { name: 'zybo_regs_clear_wr', link: 'zybo.regs', kind: 'wire', from: 'zybo_ps.clear_wr', to: 'zybo.clear_wr' });
  assert.deepEqual(by('count[15]'), { name: 'zybo_regs_count_15', link: 'zybo.regs', kind: 'wire', from: 'zybo.count[15]', to: 'zybo_ps.count[15]' });
  assert.deepEqual(r.reads, sigPins('count', 16));
  assert.deepEqual([r.fclk, r.fclkHz], ['clk', 50e6]);
  // (a port missing: said, as the build says it)
  const bad = psPlPlan(SYS.nodes[0], MAP, PORTS.filter((p) => p.name !== 'clear_wr'), 'zybo_ps');
  assert.deepEqual(bad.errors, ['zybo: the module counter has no port clear_wr for the register map cnt_regs\'s clear\'s strobe']);
});

test('#4689 systemPlan with the node\'s map read: its registers\' wires, its PS\'s pl, the module\'s clk at FCLK0\'s 20 ns; without it, as before', () => {
  const ports = { counter: PORTS };
  const p = systemPlan(SYS, { ports, psMaps: { zybo: MAP } });
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.fpga[0].clock, { port: 'clk', period: 20000, hz: 50e6 });
  assert.deepEqual(p.ps, [{ id: 'zybo_ps', node: 'zybo', program: 'zybo/ps/main.c', pl: { regs: MAP.registers, fclkHz: 50e6 } }]);
  assert.equal(p.wires.filter((w) => w.link === 'zybo.regs').length, 51);
  // (the module's count bits watched: read by their wires)
  assert.ok(sigPins('count', 16).every((b) => p.fpga[0].pins.includes(b)));
  const before = systemPlan(SYS, { ports });
  assert.deepEqual([before.errors, before.fpga[0].clock.period, before.ps[0].pl, before.wires.filter((w) => w.link === 'zybo.regs')], [[], 8000, undefined, []]);
  // (no PS program: no PS node, no registers' wires)
  const none = systemPlan({ ...SYS, nodes: [{ ...SYS.nodes[0], ps: undefined }, SYS.nodes[1]] }, { ports, psMaps: { zybo: MAP } });
  assert.deepEqual([none.ps, none.wires.filter((w) => w.link === 'zybo.regs')], [[], []]);
});
