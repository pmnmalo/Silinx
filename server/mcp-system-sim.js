// Simulate System on the MCP server (#4701, #2674, docs/CODESIGN.md): `simulate` of a co-design project, or of a System
// document (server/mcp-hdl.js), runs the System as Simulate System does (core/system-run.js): each FPGA node's module elaborated and compiled (Yosys, the compiled engine), each
// microcontroller's firmware read, the terminals' text typed at the start, run for a time; each wire's decoded bytes, the
// terminals' text, the warnings, and the System's waves written as a VCD (build/<name>.vcd).
import * as P from './projects.js';
import { toolError, projectText, elaborateView } from './mcp-util.js';
import { readSystem, isSystemFile } from '../core/system-doc.js';
import { prepareSystem, systemReport, runTimeText } from '../core/system-run.js';
import { systemVcd } from '../core/system-waves.js';
import { ucfPort } from '../core/board-constraints.js';

// the System's FPGA nodes' modules elaborated: their ports ({ module: [{ name, dir, width }] }) and designs
async function modulesOf(name, sys) {
  const ports = {}, designs = {};
  for (const m of new Set(sys.nodes.filter(n => n.kind === 'fpga' && n.module).map(n => String(n.module)))) {
    const v = await elaborateView(name, { top: m }).catch(e => ({ error: e.message }));
    if (!v.design) continue;
    designs[m] = v.design;
    ports[m] = v.design.top.ports.map(ucfPort).map(p => ({ name: p.name, dir: p.dir, width: p.width }));
  }
  return { ports, designs };
}

/**
 * Simulate System (the MCP server's `simulate` of a System document, #4701): the System of `file` in the project `name`
 * run for `ms`, the terminals' text `type` ({ terminal: text }) typed at the start; the tool's result.
 */
export async function simulateSystem(name, file, { ms = 100, type = {} } = {}) {
  if (!isSystemFile(file)) throw toolError(`'${file}' is not a System document (.sys.json)`);
  if (!(ms > 0) || ms > 10000) throw toolError('time_ns: a System runs from 0 to 1e10 ns (10 s)');
  const r = readSystem(await projectText(name, file, `no System '${file}' in the project '${name}'`));
  if (r.error) throw toolError(`${file}: ${r.error}`);
  const sys = r.system;
  const { ports, designs } = await modulesOf(name, sys);
  const { netlistOf } = await import('../core/compiled-sim.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/node.js');
  const ready = await prepareSystem(sys, {
    ports,
    netlist: m => { if (!designs[m]) throw new Error(`no module '${m}' that elaborates in the project`); return netlistOf(designs[m], { run: yosysNode }); },
    firmware: async p => (/\.elf$/i.test(p) ? P.readFileBytes(name, p) : P.readFile(name, p)),   // (the page's reads, #5198)
  });
  if (ready.error) throw toolError(`${file}: ${ready.error}`);
  for (const [id, text] of Object.entries(type || {})) {
    const t = ready.terminals.get(id);
    if (!t) throw toolError(`type: no terminal '${id}' in the System`);
    t.send([...new TextEncoder().encode(String(text))]);
  }
  ready.sim.run(ms * 1e9);
  const rep = systemReport(ready);
  const vcd = `build/${sys.name}.vcd`;
  await P.writeFile(name, vcd, systemVcd(ready.sim, { name: sys.name }));
  const bytes = t => t.bytes.map(b => ({ t: b.t, byte: b.byte, ...(b.error ? { error: b.error } : {}) }));
  return { text: [...rep.lines, `The waves: ${vcd}.`].join('\n'), isError: false,
    data: { project: name, file, time: runTimeText(rep.now), traffic: rep.traffic.map(t => ({ wire: t.wire, link: t.link, from: t.from, to: t.to, bytes: bytes(t) })), terminals: rep.terminals, warnings: rep.warnings, errors: rep.errors, vcd },
    untrusted: 'the System\'s names and the bytes its nodes sent' };
}
