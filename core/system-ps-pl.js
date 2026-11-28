// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A Zynq node's PS–PL registers in a System's run (#4689, part 5c of #4688): the node's register map (its psMap,
// core/zynq-ps-map.js) between its PS (core/system-sim-zynq.js, `<id>_ps`) and its PL's module, transaction by
// transaction, as the PL's top wires them (core/zynq-pl-top.js plTopWiring): the PS node holds the map's AXI4-Lite slave's
// registers, each written register's bits a wire to the module's input of its name (a strobe's <name>_wr too), each ro
// register's bits a wire from the module's output back to the PS node. The module's clk is FCLK_CLK0, as the top gives it.
// The plan's part (core/system-build.js systemPlan). Isomorphic ES module, no DOM.
//
//   const r = psPlPlan(n, map, ports, psId)
//   r -> { wires: [{ name, link, kind, from, to }], reads: [module's output pins], fclkHz, regs, errors }
import { plTopWiring } from './zynq-pl-top.js';
import { ps7Init } from './zynq-ps7.js';
import { nodePs } from './zynq-ps-clocks.js';

/** A register's signal's pins (the slave's port, or a module's): its name alone at 1 bit, name[i] each bit else. */
export const sigPins = (name, width) => (width === 1 ? [name] : Array.from({ length: width }, (_, i) => `${name}[${i}]`));

/** The wires of FPGA node `n`'s map `map` (its module's ports `ports`) between its PS node `psId` and its module. */
export function psPlPlan(n, map, ports, psId) {
  const w = plTopWiring({ name: n.module, ports }, map, n.pins ?? {});
  const errors = w.errors.map((e) => `${n.id}: ${e}`);
  const wires = [], reads = [];
  const widthOf = (sig) => (map.registers.find((r) => r.name === sig)?.width ?? 1);
  for (const [sig, port] of w.slave) {
    const reg = map.registers.find((r) => r.name === sig), out = reg?.access === 'ro';
    const ps = sigPins(sig, widthOf(sig)), pl = sigPins(port, widthOf(sig));
    ps.forEach((p, i) => {
      const [from, to] = out ? [`${n.id}.${pl[i]}`, `${psId}.${p}`] : [`${psId}.${p}`, `${n.id}.${pl[i]}`];
      wires.push({ name: `${n.id}_regs_${p.replace(/\[(\d+)\]$/, '_$1')}`, link: `${n.id}.regs`, kind: 'wire', from, to });
      if (out) reads.push(pl[i]);
    });
  }
  const fclkHz = w.fclk ? ps7Init(nodePs(n)).clocks.fclk0 : null;
  return { wires, reads, fclk: w.fclk, fclkHz, regs: map.registers, errors };
}
