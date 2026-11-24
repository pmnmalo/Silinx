// Simulate System on the MCP server (#4701, #2674, docs/SYSTEMS.md): `simulate` of a System project, or of a System
// document (server/mcp-hdl.js), runs the System as Simulate System does (core/system-run.js): each FPGA node's module elaborated and compiled (Yosys, the compiled engine), each
// microcontroller's firmware read, the terminals' text typed at the start, run for a time; each wire's decoded bytes, the
// terminals' text, the warnings, and the System's waves written as a VCD (build/<name>.vcd).
import * as P from './projects.js';
import { toolError, projectText, elaborateView } from './mcp-util.js';
import { readSystem, isSystemFile } from '../core/system-doc.js';
import { systemsOn, SYSTEMS_OFF } from '../core/build-channel.js';
import { prepareSystem, systemReport, runTimeText, systemInputs, systemFromInputs } from '../core/system-run.js';
import { emulationBoards, withBoards, watchBoards, boardStates, setBoardInput, pinOf } from '../core/system-emu.js';
import { loadAvr8js } from '../core/system-sim-avr.js';
import { systemVcd } from '../core/system-waves.js';
import { ucfPort } from '../core/board-constraints.js';
import { isRegmapFile, regmapFor, hierModules } from '../core/regmap.js';

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
 * run for `ms`, the terminals' text `type` ({ terminal: text }) typed at the start; the tool's result. controls: the
 * System's boards emulated (Emulate System, #5212: core/system-emu.js): [{ node, control: 'btn0' | 'sw3', on, at_ns }],
 * each set at its time as its click does; then what each board shows over the run's last 10 ms.
 */
// the project's register maps' texts ({ path: text })
async function mapTexts(name) {
  const out = {};
  for (const f of (await P.fileTree(name)).filter(isRegmapFile)) out[f] = await P.readFile(name, f);
  return out;
}

export async function simulateSystem(name, file, { ms = 100, type = {}, controls = null } = {}) {
  if (!systemsOn()) throw toolError(SYSTEMS_OFF);   // (Systems not in a release yet, #5202)
  if (!isSystemFile(file)) throw toolError(`'${file}' is not a System document (.sys.json)`);
  if (!(ms > 0) || ms > 10000) throw toolError('time_ns: a System runs from 0 to 1e10 ns (10 s)');
  const r = readSystem(await projectText(name, file, `no System '${file}' in the project '${name}'`));
  if (r.error) throw toolError(`${file}: ${r.error}`);
  const sys = r.system;
  const { ports, designs } = await modulesOf(name, sys);
  const { netlistOf } = await import('../core/compiled-sim.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/node.js');
  const how = {
    ports,
    netlist: m => { if (!designs[m]) throw new Error(`no module '${m}' that elaborates in the project`); return netlistOf(designs[m], { run: yosysNode }); },
    firmware: async p => (/\.elf$/i.test(p) ? P.readFileBytes(name, p) : P.readFile(name, p)),   // (the page's reads, #5198)
    circuit: p => P.readFile(name, p),   // (a circuit node's, #5215)
    regmap: async m => regmapFor(await mapTexts(name), designs[m] ? hierModules(designs[m].top) : [m]),   // (a module made from a register map, or one instancing it: its accesses, #5288)
  };
  const emu = controls ? await emulated(sys, how) : null;
  const ready = emu ? emu.ready : await prepareSystem(sys, how);
  if (ready.error) throw toolError(`${file}: ${ready.error}`);
  for (const [id, text] of Object.entries(type || {})) {
    const t = ready.terminals.get(id);
    if (!t) throw toolError(`type: no terminal '${id}' in the System`);
    t.send([...new TextEncoder().encode(String(text))]);
  }
  const shown = emu ? runControls(ready.sim, emu.boards, controls, ms * 1e9) : null;
  if (!emu) ready.sim.run(ms * 1e9);
  const rep = systemReport(ready);
  const vcd = `build/${sys.name}.vcd`;
  await P.writeFile(name, vcd, systemVcd(ready.sim, { name: sys.name }));
  const bytes = t => t.bytes.map(b => ({ t: b.t, byte: b.byte, ...(b.error ? { error: b.error } : {}) }));
  return { text: [...rep.lines, ...(shown ? boardLines(shown) : []), `The waves: ${vcd}.`].join('\n'), isError: false,
    data: { project: name, file, time: runTimeText(rep.now), traffic: rep.traffic.map(t => ({ wire: t.wire, link: t.link, from: t.from, to: t.to, bytes: bytes(t) })), spi: rep.spi.map(x => ({ link: x.link, from: x.from, to: x.to, hz: x.hz, mode: x.mode, transfers: x.transfers })), i2c: rep.i2c.map(x => ({ link: x.link, from: x.from, to: x.to, hz: x.hz, transfers: x.transfers })), regs: rep.regs.map(x => ({ link: x.link, map: x.map, accesses: x.accesses.map(({ text, ...y }) => y) })), terminals: rep.terminals, ...(Object.keys(rep.circuits).length ? { circuits: rep.circuits } : {}), warnings: rep.warnings, errors: rep.errors, vcd, ...(shown ? { boards: shown } : {}) },
    untrusted: 'the System\'s names and the bytes its nodes sent' };
}

// the System built with its boards emulated (core/system-emu.js): { ready, boards }
async function emulated(sys, how) {
  const inputs = await systemInputs(sys, how);
  if (inputs.error) return { ready: inputs };
  if (sys.nodes.some(n => n.kind === 'mcu')) await loadAvr8js();
  const boards = emulationBoards(sys, inputs);
  const ready = systemFromInputs(sys, withBoards(inputs, boards));
  if (!ready.error) watchBoards(ready.sim, boards);
  return { ready, boards };
}

// the controls set at their times (as the System Emulator's clicks), the run to `end` (ps); what each board shows over
// its last 10 ms: { node: { leds, digits } | { pins, led } | { leds, inputs, lit } (a circuit's, #5322) }
function runControls(sim, boards, controls, end) {
  const list = (Array.isArray(controls) ? controls : []).map((c, i) => {
    const t = Number(c?.at_ns ?? 0) * 1e3;
    // (a circuit's switch or button: its part's id, a DIP switch's lever DIP1:2, #5322)
    const cb = boards.find(x => x.id === c?.node && x.kind === 'circuit');
    if (cb) {
      if (!cb.inputs.some(x => x.pin === String(c.control ?? ''))) throw toolError(`controls[${i}]: no switch or button '${c.control}' in the circuit ${cb.id} (${cb.inputs.map(x => x.pin).join(', ') || 'none'})`);
      if (!(t >= 0) || t > end) throw toolError(`controls[${i}]: at_ns from 0 to the run's time`);
      // (a temperature sensor's: its value, °C, #5342)
      if (cb.inputs.find(x => x.pin === String(c.control)).kind === 'temp') {
        if (!Number.isFinite(Number(c.value))) throw toolError(`controls[${i}]: ${c.control}'s value: a temperature (°C)`);
        return { t, b: cb, pin: String(c.control), on: Number(c.value) };
      }
      return { t, b: cb, pin: String(c.control), on: !!c.on };
    }
    const b = boards.find(x => x.id === c?.node && x.kind === 'fpga');
    if (!b) throw toolError(`controls[${i}]: no FPGA node '${c?.node}' with a board, nor a circuit, in the System`);
    const m = /^([a-z_]+?)(\d+)$/i.exec(String(c.control ?? ''));
    const x = m && b.wiring.bits.find(y => y.res.name === m[1].toLowerCase() && y.idx === Number(m[2]));
    if (!x || !b.inputs.some(i2 => i2.pin === pinOf(x))) throw toolError(`controls[${i}]: no switch or button '${c.control}' of ${b.id}'s board linked to its module (${b.inputs.map(i2 => `${i2.res}${i2.idx}`).join(', ') || 'none'})`);
    if (!(t >= 0) || t > end) throw toolError(`controls[${i}]: at_ns from 0 to the run's time`);
    return { t, b, pin: pinOf(x), on: !!c.on };
  }).sort((a, b) => a.t - b.t);
  for (const c of list) { sim.run(c.t); setBoardInput(sim, c.b, c.pin, c.on); }
  const from = Math.max(sim.now, end - 10e9);
  sim.run(from);
  boardStates(sim, boards, 0, from);
  sim.run(end);
  return boardStates(sim, boards, from, end);
}

// what the boards show, a line each
const boardLines = shown => Object.entries(shown).map(([id, s]) => (s.inputs && s.lit ? `${id}'s circuit: lit ${s.lit.join(' ') || 'none'}${Object.entries(s.sensors || {}).map(([k, x]) => `; ${k} ${x.temp.toFixed(1)} °C`).join('')}${Object.entries(s.servos || {}).map(([k, x]) => `; ${k} at ${Math.round(x.angle)}°`).join('')}${Object.entries(s.buzzers || {}).map(([k, x]) => `; ${k} ${x.sounding ? `${x.hz} Hz` : 'silent'}`).join('')}.` : s.leds
  ? `${id}'s board: LEDs ${s.leds.map((v, k) => [v, k]).filter(([v]) => v > 0.5).map(([, k]) => `LD${k}`).join(' ') || 'off'}${s.digits?.some(Boolean) ? `; display ${s.digits.map(d => (d ? digitText(d) : ' ')).reverse().join('')}` : ''}.`
  : `${id}'s board: LED L ${s.led > 0.5 ? 'on' : 'off'}; pins high ${Object.entries(s.pins).filter(([, v]) => v === 1).map(([p]) => p).join(' ') || 'none'}.`));
// a digit's segments as the hexadecimal digit they draw, or ? (other patterns)
const HEX = ['1111110', '0110000', '1101101', '1111001', '0110011', '1011011', '1011111', '1110000', '1111111', '1111011', '1110111', '0011111', '1001110', '0111101', '1001111', '1000111'];
const digitText = d => { const i = HEX.indexOf(d.seg.map(x => (x > 0.5 ? 1 : 0)).join('')); return i < 0 ? '?' : i.toString(16).toUpperCase(); };
