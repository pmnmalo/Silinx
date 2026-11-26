// Simulate System on the MCP server (#4701, #2674, docs/SYSTEMS.md): `simulate` of a System project, or of a System
// document (server/mcp-hdl.js; `<file>#a,b` its nodes a and b alone, #5581: core/system-alone.js), runs the System as Simulate System does (core/system-run.js): each FPGA node's module elaborated and compiled (Yosys, the compiled engine), each
// microcontroller's firmware read, the terminals' text typed at the start, run for a time; each wire's decoded bytes, the
// terminals' text, the warnings, and the System's waves written as a VCD (build/<name>.vcd).
import * as P from './projects.js';
import { toolError, projectText, elaborateView } from './mcp-util.js';
import { readSystem, isSystemFile } from '../core/system-doc.js';
import { systemsOn, SYSTEMS_OFF } from '../core/build-channel.js';
import { prepareSystem, systemReport, runTimeText, systemInputs, systemFromInputs, loadEngines } from '../core/system-run.js';
import './rp2040-firmware.js';   // (a Pico's firmware read from the local server's copy, #5494)
import { emulationBoards, withBoards, watchBoards, boardStates, setBoardInput } from '../core/system-emu.js';
import { systemVcd } from '../core/system-waves.js';
import { ucfPort } from '../core/board-constraints.js';
import { normalizeCircuit } from '../core/circuit.js';
import { runningSystem, emulateNodesOf, runName, simulateSettingsOf, SIMULATE_MS } from '../core/system-alone.js';
import { readStimulus, setsControls, stimulusSteps, runSteps } from '../core/system-stimulus.js';
import { MODEL_NAMES, emulateModelsOf, nodeModelFile, nodeReportsPath } from '../core/system-models.js';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { scalarizeNetlist } from '../core/netlist-hier.js';
import { MODEL_PROCESS } from './mcp-hdl.js';
import { withNodePins } from '../core/system-constraints.js';
import { constraintsTexts } from './system-constraints.js';
import { isRegmapFile, regmapFor, hierModules } from '../core/regmap.js';
import { controlSteps } from '../core/system-controls.js';

// the circuit nodes' circuits ({ path: circuit }: their boards, which run); one not read left out
async function circuitsOf(name, sys) {
  const out = {};
  for (const n of sys.nodes.filter(x => x.kind === 'circuit' && x.circuit)) {
    try { out[n.circuit] = normalizeCircuit(JSON.parse(await P.readFile(name, n.circuit))); } catch { /* (kept) */ }
  }
  return out;
}

// the FPGA nodes' models (`models`: { id: model }) read from their builds ({ id: { path, lang, text } }), or the tool's
// error: one not made yet (its run_process says how, #5612)
async function modelNetlists(name, sys, models) {
  const out = {};
  for (const [id, m] of Object.entries(models)) {
    if (!sys.nodes.some(n => n.id === id)) continue;
    let reports = null;
    try { reports = JSON.parse(await P.readFile(name, nodeReportsPath(id))); } catch { /* not built */ }
    const file = nodeModelFile(reports, id, m);
    if (!file) throw toolError(`${id}'s ${MODEL_NAMES[m].toLowerCase()} model is not made yet: run_process ${MODEL_PROCESS[m]} with node ${id} first`);
    const raw = await P.readFile(name, file), verilog = /\.v$/i.test(file);
    out[id] = { path: file, lang: verilog ? 'verilog' : 'vhdl', text: verilog ? raw : scalarizeNetlist(raw), role: 'design', netlist: m };
  }
  return out;
}

// the stimulus file `path` read (#5581), or the tool's error
async function stimulusOf(name, path) {
  const r = readStimulus(await projectText(name, path, `no stimulus file '${path}' in the project '${name}' (its Simulation Properties name it)`));
  if (r.error) throw toolError(`${path}: ${r.error}`);
  return r.stimulus;
}

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

export async function simulateSystem(name, top, { ms, type = {}, controls = null } = {}) {
  if (!systemsOn()) throw toolError(SYSTEMS_OFF);   // (Systems not in a release yet, #5202)
  // (`<file>#a,b`: its nodes a and b alone, #5581; else with controls, Emulate System's: the Emulation Properties' nodes;
  // with none, Simulate System's: the Simulation Properties' nodes, time and stimulus file)
  const [file, only] = String(top).split('#');
  if (!isSystemFile(file)) throw toolError(`'${file}' is not a System document (.sys.json)`);
  const r = readSystem(await projectText(name, file, `no System '${file}' in the project '${name}'`));
  if (r.error) throw toolError(`${file}: ${r.error}`);
  const pj = await P.readProject(name), set = controls ? null : simulateSettingsOf(pj, r.system);
  ms ??= set?.ms ?? SIMULATE_MS;
  if (!(ms > 0) || ms > 10000) throw toolError('time_ns: a System runs from 0 to 1e10 ns (10 s)');
  const ids = only != null ? only.split(',').map(x => x.trim()).filter(Boolean) : controls ? emulateNodesOf(pj, r.system) : set.nodes;
  const stimulus = set?.stimulus ? await stimulusOf(name, set.stimulus) : null;
  // (each FPGA node's pins its constraints file's, #5581; its problems the run's warnings)
  const pinned = withNodePins(r.system, await constraintsTexts(name, r.system, await P.fileTree(name)));
  const cut = runningSystem(pinned.system, ids, { circuits: await circuitsOf(name, r.system) });
  if (cut.error) throw toolError(`top: ${cut.error}`);
  const said = [...pinned.problems.map(p => p.message), ...cut.warnings].map(w => `WARNING: ${runName(controls ? 'Emulate' : 'Simulate', ids)}: ${w}`);
  const sys = cut.system;
  const { ports, designs } = await modulesOf(name, sys);
  // (Emulate System's: each FPGA node's model, its Emulation Properties', #5612; read from its node's build)
  const models = controls ? await modelNetlists(name, sys, emulateModelsOf(pj, sys)) : {};
  const { netlistOf } = await import('../core/compiled-sim.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/node.js');
  const how = {
    ports,
    netlist: (m, id) => {
      if (models[id]) { const d = elaborate(compile([...primitiveSources([models[id]]), models[id]]), m); if (!d.top) throw new Error(`its model ${models[id].path} does not elaborate`); return netlistOf(d, { run: yosysNode }); }
      if (!designs[m]) throw new Error(`no module '${m}' that elaborates in the project`); return netlistOf(designs[m], { run: yosysNode });
    },
    firmware: async p => (/\.elf$/i.test(p) ? P.readFileBytes(name, p) : P.readFile(name, p)),   // (the page's reads, #5198)
    circuit: p => P.readFile(name, p),   // (a circuit node's, #5215)
    regmap: async m => regmapFor(await mapTexts(name), designs[m] ? hierModules(designs[m].top) : [m]),   // (a module made from a register map, or one instancing it: its accesses, #5288)
  };
  // (a stimulus that sets a board's controls: the boards emulated, their steps set as the run goes, #5581)
  const emu = controls || setsControls(stimulus) ? await emulated(sys, how) : null;
  const ready = emu ? emu.ready : await prepareSystem(sys, how);
  if (ready.error) throw toolError(`${file}: ${ready.error}`);
  let steps = [];   // (a step after the run's end: not reached)
  try { steps = stimulus ? stimulusSteps(stimulus, { boards: emu?.boards ?? [], terminals: [...ready.terminals.keys()] }) : []; }
  catch (e) { throw toolError(`${set.stimulus}: ${e.message}`); }
  for (const [id, text] of Object.entries(type || {})) {
    const t = ready.terminals.get(id);
    if (!t) throw toolError(`type: no terminal '${id}' in the System`);
    t.send([...new TextEncoder().encode(String(text))]);
  }
  const shown = controls ? runControls(ready.sim, emu.boards, controls, ms * 1e9) : null;
  if (!controls) runSteps(ready, steps, ms * 1e9);
  const rep = systemReport(ready);
  const vcd = `build/${sys.name}.vcd`;
  await P.writeFile(name, vcd, systemVcd(ready.sim, { name: sys.name }));
  const bytes = t => t.bytes.map(b => ({ t: b.t, byte: b.byte, ...(b.error ? { error: b.error } : {}) }));
  return { text: [...said, ...rep.lines, ...(shown ? boardLines(shown) : []), `The waves: ${vcd}.`].join('\n'), isError: false,
    data: { project: name, file, ...(stimulus ? { stimulus: set.stimulus } : {}), time: runTimeText(rep.now), traffic: rep.traffic.map(t => ({ wire: t.wire, link: t.link, from: t.from, to: t.to, bytes: bytes(t) })), spi: rep.spi.map(x => ({ link: x.link, from: x.from, to: x.to, hz: x.hz, mode: x.mode, transfers: x.transfers })), i2c: rep.i2c.map(x => ({ link: x.link, from: x.from, to: x.to, hz: x.hz, transfers: x.transfers })), regs: rep.regs.map(x => ({ link: x.link, map: x.map, accesses: x.accesses.map(({ text, ...y }) => y) })), terminals: rep.terminals, ...(Object.keys(rep.circuits).length ? { circuits: rep.circuits } : {}), warnings: [...said, ...rep.warnings], errors: rep.errors, vcd, ...(ids ? { nodes: sys.nodes.map(n => n.id) } : {}), ...(shown ? { boards: shown } : {}) },
    untrusted: 'the System\'s names and the bytes its nodes sent' };
}

// the System built with its boards emulated (core/system-emu.js): { ready, boards }
async function emulated(sys, how) {
  const inputs = await systemInputs(sys, how);
  if (inputs.error) return { ready: inputs };
  try { await loadEngines(sys); } catch (e) { return { ready: { error: e.message } }; }
  const boards = emulationBoards(sys, inputs);
  const ready = systemFromInputs(sys, withBoards(inputs, boards));
  if (!ready.error) watchBoards(ready.sim, boards);
  return { ready, boards };
}

// the controls set at their times (as the System Emulator's clicks), the run to `end` (ps); what each board shows over
// its last 10 ms: { node: { leds, digits } | { pins, led } | { leds, inputs, lit } (a circuit's, #5322) }
function runControls(sim, boards, controls, end) {
  let list;
  // (core/system-controls.js, #5602: its error the tool's)
  try { list = controlSteps(boards, controls, end); } catch (e) { throw toolError(e.message); }
  for (const c of list) { sim.run(c.t); setBoardInput(sim, c.b, c.pin, c.on); }
  const from = Math.max(sim.now, end - 10e9);
  sim.run(from);
  boardStates(sim, boards, 0, from);
  sim.run(end);
  return boardStates(sim, boards, from, end);
}

// what the boards show, a line each
const boardLines = shown => Object.entries(shown).map(([id, s]) => (s.lcd ? explorerLine(id, s) : s.inputs && s.lit ? `${id}'s circuit: lit ${s.lit.join(' ') || 'none'}${Object.entries(s.sensors || {}).map(([k, x]) => `; ${k} ${x.temp.toFixed(1)} °C`).join('')}${Object.entries(s.servos || {}).map(([k, x]) => `; ${k} at ${Math.round(x.angle)}°`).join('')}${Object.entries(s.buzzers || {}).map(([k, x]) => `; ${k} ${x.sounding ? `${x.hz} Hz` : 'silent'}`).join('')}${Object.entries(s.steppers || {}).map(([k, x]) => `; ${k} at ${x.angle}°`).join('')}${Object.entries(s.sds || {}).map(([k, x]) => `; ${k} ${x.stage}, ${x.written.length} block(s) written`).join('')}${Object.entries(s.sonars || {}).map(([k, x]) => `; ${k} ${x.cm} cm`).join('')}${Object.entries(s.pirs || {}).map(([k, x]) => `; ${k} OUT ${x.out ? 1 : 0}`).join('')}${Object.entries(s.dhts || {}).map(([k, x]) => `; ${k} ${x.temp} °C ${x.hum} %`).join('')}.` : s.leds
  ? `${id}'s board: LEDs ${s.leds.map((v, k) => [v, k]).filter(([v]) => v > 0.5).map(([, k]) => `LD${k}`).join(' ') || 'off'}${s.digits?.some(Boolean) ? `; display ${s.digits.map(d => (d ? digitText(d) : ' ')).reverse().join('')}` : ''}.`
  : `${id}'s board: LED L ${s.led > 0.5 ? 'on' : 'off'}; pins high ${Object.entries(s.pins).filter(([, v]) => v === 1).map(([p]) => p).join(' ') || 'none'}.`));
// an Explorer 16/32's (#5484): its LEDs lit, its buttons held, R6, the temperature, the LCD's rows
const explorerLine = (id, s) => `${id}'s Explorer 16/32: LEDs ${Object.entries(s.leds).filter(([, v]) => v > 0.5).map(([d]) => d).join(' ') || 'off'}`
  + `; held ${Object.entries(s.held).filter(([, v]) => v).map(([b]) => b).join(' ') || 'none'}; R6 at ${Math.round(s.analog.R6 * 100)} %, ${s.analog.TC1047A} °C`
  + `; LCD "${s.lcd[0].trimEnd()}" / "${s.lcd[1].trimEnd()}".`;
// a digit's segments as the hexadecimal digit they draw, or ? (other patterns)
const HEX = ['1111110', '0110000', '1101101', '1111001', '0110011', '1011011', '1011111', '1110000', '1111111', '1111011', '1110111', '0011111', '1001110', '0111101', '1001111', '1000111'];
const digitText = d => { const i = HEX.indexOf(d.seg.map(x => (x > 0.5 ? 1 : 0)).join('')); return i < 0 ? '?' : i.toString(16).toUpperCase(); };
