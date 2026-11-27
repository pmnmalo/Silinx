// The MCP server's tools of a project's settings (server/mcp.js, #2674): the devices and boards to choose from,
// Design Properties (the board, the device, the synthesis tool, the Preferred Language), Process Properties (the
// Optimization, the FPGA's start-up clock) and a drawing's Source Properties (its
// language), as the interface's dialogs (web/js/wizards.js projectProperties, implProperties, sourceProperties)
// set them: the same checks of a new device (web/js/device-change.js), the constraints file of its format
// (web/js/constraints-format.js), Update Constraints from the new board's pins, the drawings' HDL made again in
// their language (server/drawing-sync.js).
import fs from 'node:fs';
import path from 'node:path';
import * as P from './projects.js';
import { topForBoardText } from '../core/board-generics.js';
import { toolError, readProject, viewSourcesOf, STR, PROJECT, deviceName } from './mcp-util.js';
import { DESIGN_KIND, DESIGN_ONLY_MESSAGES, isDesignOnly, isSystemProject } from '../core/project-kind.js';
import { PROFILES, profileById, profileChangedText, profileOf, systemProfile } from '../core/project-profile.js';
import { changeProfile } from '../core/profile-change.js';
import { isSystemFile, readSystem } from '../core/system-doc.js';
import { runnableNodes, emulateNodesOf, withEmulateNodes, simulateSettingsOf, withSimulateSettings } from '../core/system-alone.js';
import { MODEL_NAMES, emulateModelsOf, withEmulateModels } from '../core/system-models.js';
import { makeDesignProject } from './mcp-design-only.js';
import { setMode } from './mcp-mode.js';
import { MODES } from '../core/project-mode.js';

// the project `name` (`pj`) given the profile `to` (#5440): its System's nodes read, the change refused with the
// interface's message, or written; nothing else changes
async function changeProfileOf(name, pj, to) {
  const files = (await P.fileTree(name)).filter(f => !/^build\//.test(f));
  const system = files.find(isSystemFile);
  const ctx = { files, texts: system ? { [system]: await P.readFile(name, system).catch(() => '') } : {} };
  const r = changeProfile(pj, to, ctx);
  if (r.error) throw toolError(r.error);
  const p = profileById(to);
  if (profileOf(pj) === to) throw toolError(`the project '${name}' is ${p.label} already`);
  await P.updateProject(name, cur => { const c = changeProfile(cur, to, ctx); if (c.error) throw toolError(c.error); return c.project; });
  return { text: profileChangedText(name, to),
    data: { project: name, profile: to, nodes: p.nodes } };
}

// the project's kind dropped when a design and simulation project is given a board or a device (#3780)
const withoutKind = (pj, drop) => { if (drop) delete pj.kind; return pj; };

// the device database (server/devices.js) and the toolchain package's checks, loaded on first use
// a System project's Emulation and Simulation Properties (#5581, core/system-alone.js): the nodes Emulate System runs (none:
// every node); Simulate System's nodes, run time and stimulus file; in its silinx.json, as their dialogs write them
async function systemProperties(name, pj, { nodes, simulation }, others) {
  const what = nodes !== undefined ? 'emulate_nodes' : 'simulation';
  if (!isSystemProject(pj)) throw toolError(`${what}: the project '${name}' is not a System project`);
  if (Object.values(others).some(v => v !== undefined)) throw toolError(`${what}: a System's, given alone (its FPGA nodes' properties are not the project's)`);
  const files = await P.fileTree(name), f = files.find(isSystemFile);
  const r = f ? readSystem(await P.readFile(name, f)) : { error: 'no System document (.sys.json)' };
  if (r.error) throw toolError(`${what}: ${f || name}: ${r.error}`);
  let next = pj;
  // (fpga@postsynth: the node and its model, #5612; a node named alone: its RTL)
  const ids = (nodes || []).map(x => String(x).split('@')[0]);
  if (nodes !== undefined) next = withEmulateNodes(next, r.system, ids.length ? ids : null);
  if (nodes !== undefined && !next.error) next = withEmulateModels(next, r.system, Object.fromEntries((nodes || []).map(x => String(x).split('@')).filter(([id, m]) => m !== undefined || r.system.nodes.some(n => n.id === id && n.kind === 'fpga')).map(([id, m]) => [id, m ?? 'rtl'])));
  if (next.error) throw toolError(`emulate_nodes: ${next.error}`);
  if (simulation !== undefined) {
    const s = simulation && typeof simulation === 'object' && !Array.isArray(simulation) ? simulation : null;
    const bad = s ? Object.keys(s).filter(k => !['nodes', 'ms', 'stimulus'].includes(k)) : ['?'];
    if (bad.length) throw toolError('simulation: { nodes, ms, stimulus }');
    next = withSimulateSettings(next, r.system, { ...('nodes' in s ? { nodes: s.nodes?.length ? s.nodes : null } : {}), ...('ms' in s ? { ms: s.ms } : {}), ...('stimulus' in s ? { stimulus: s.stimulus } : {}) }, files);
    if (next.error) throw toolError(`simulation: ${next.error}`);
  }
  await P.updateProject(name, () => next);
  // (what was given said)
  const on = emulateNodesOf(next, r.system), mods = emulateModelsOf(next, r.system), sim = simulateSettingsOf(next, r.system), said = [];
  if (nodes !== undefined) said.push(`Emulate System runs ${on ? on.join(', ') : 'every node'}${Object.entries(mods).map(([id, m]) => `, ${id} on its ${MODEL_NAMES[m]} model`).join('')}`);
  if (simulation !== undefined) said.push(`Simulate System runs ${sim.nodes ? sim.nodes.join(', ') : 'every node'} for ${sim.ms} ms${sim.stimulus ? `, its stimulus ${sim.stimulus}` : ''}`);
  return { text: `${name}: ${said.join('; ')}.`, data: { project: name, ...(nodes !== undefined ? { emulateNodes: on ?? runnableNodes(r.system), emulateModels: mods } : {}),
    ...(simulation !== undefined ? { simulation: { nodes: sim.nodes ?? runnableNodes(r.system), ms: sim.ms, stimulus: sim.stimulus } } : {}) } };
}

const devices = () => import('./devices.js');
const parts = () => import('../packages/silinx-fpga/src/parts.js');

const SYNTH_TOOLS = ['silinx', 'xst', 'vivado', 'quartus'];   // (vivado: the Artix-7's, #3146; quartus: the Intel families', #5378)
const OPTIMIZATIONS = ['fast', 'area', 'speed'];
const STARTUP_CLOCKS = { jtag: 'JtagClk', cclk: 'CCLK', user: 'UserClk' };
// the Spartan-6's Map (#3138): nextpnr's packer (the default since its parity, #3139, #3140), or Silinx's
const S6_MAPS = ['nextpnr', 'silinx'];
const XC7_SEEDS = [1, 3];

// the issues of the design on a new device (web/js/device-change.js deviceChangeMessages): the primitives its
// family lacks, the resources the design needs more of than the part has
async function deviceChangeMessages(name, pj, next) {
  const D = await devices(), R = await parts();
  const to = D.findPart(next.part);
  if (!to) return [];
  const fromPart = D.findPart(pj.device?.part);
  const from = fromPart?.family || pj.device?.family;
  let instances = [], ports = 0;
  if (pj.top) {
    try {
      const { compile, elaborate } = await import('../core/compile.js');
      const { primitiveSources } = await import('../core/unisim.js');
      const srcs = await viewSourcesOf(name, pj, false);
      const top = elaborate(compile([...primitiveSources(srcs), ...srcs]), pj.top).top;
      instances = R.primitiveInstances(top);
      ports = (top?.ports || []).reduce((n, p) => n + (p.sig?.t?.w || 1), 0);
    } catch { /* a design that does not elaborate: its report only */ }
  }
  let used = {};
  try {
    const { projectReports } = await import('./impl-routes.js');
    if (fromPart) used = R.usedOfReport(await projectReports(name), R.resourcesOf(fromPart, pj.device.package));
  } catch { /* no report */ }
  const familyName = D.findFamily(to.family)?.displayName || to.family;
  return R.deviceChangeIssues({ from, to, pkg: next.package, familyName, instances, used, ports }).messages;
}

export const SETTINGS_TOOLS = [
  {
    name: 'list_devices', title: 'The devices and boards',
    description: 'The boards (variants, devices) and the devices (part, packages, speed grades, by family) a project can target, as Design Properties and New Project offer them.',
    inputSchema: { type: 'object', properties: { family: STR('Only this family\'s devices (e.g. spartan3e).') }, additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ family }) {
      const D = await devices();
      const fams = family ? [D.findFamily(family)].filter(Boolean) : D.FAMILIES;
      if (family && !fams.length) throw toolError(`unknown family '${family}' (${D.FAMILIES.map(f => f.id).join(', ')})`);
      // (an experimental family's boards and devices, #3142: listed and marked, as the dialogs show them; the 7-series' flow
      // AMD Vivado's, #1649, #3895)
      const R = await parts(), exp = o => (o ? { experimental: true } : {});
      const mark = (o, device) => (!o.experimental ? '' : R.vivadoDevice(device) ? ' [experimental: AMD Vivado\'s flow]' : R.quartusDevice(device) ? ' [experimental: Intel Quartus Prime\'s flow]' : ' [experimental: no implementation flow yet]');
      const boards = D.BOARDS.map(b => ({ id: b.id, name: b.name, device: deviceName(D.resolveBoard(b.id).device), ...exp(R.experimentalDevice(b.device)),
        variants: (b.variants || []).map(v => ({ id: v.id, label: v.label, device: deviceName(v.device), ...(v.default ? { default: true } : {}) })) }));
      const families = fams.map(f => ({ id: f.id, name: f.displayName || f.name, ...exp(f.experimental),
        parts: D.partsOfFamily(f.id).map(p => ({ part: p.part, packages: Object.fromEntries(Object.entries(p.packages).map(([k, v]) => [k, v.speeds || p.speeds])) })) }));
      const text = [...(family ? [] : ['Boards:', ...boards.map(b => `  ${b.id}: ${b.name} (${b.variants.length ? b.variants.map(v => `${v.id} ${v.device}${v.default ? ', the default' : ''}`).join('; ') : b.device})${mark(b, D.resolveBoard(b.id).device)}`), '']),
        'Devices:', ...families.flatMap(f => [`  ${f.name} (${f.id})${mark(f, { family: f.id })}:`, ...f.parts.map(p => `    ${p.part}: ${Object.entries(p.packages).map(([k, s]) => `${k}${s.length ? ` ${s.join(' ')}` : ''}`).join(', ')}`)])];
      // (the processor boards, #5756: a Board project's alone, new_project's board; listed last, no family)
      const { PROCESSOR_BOARDS } = await import('../core/processor-board.js');
      const processorBoards = family ? [] : PROCESSOR_BOARDS.map(b => ({ id: b.id, name: b.name, mcu: b.mcu, type: b.arch }));   // (its Board Type, New Project's)
      if (processorBoards.length) text.push('Processor boards (a Board project of one: new_project board):', ...processorBoards.map(b => `  ${b.id}: ${b.name} (${b.mcu})`));
      return { text: text.join('\n'), data: { ...(family ? {} : { boards, processorBoards }), families } };
    },
  },
  {
    name: 'set_design_properties', title: 'Design Properties',
    description: 'Change a project\'s target as Design Properties does: its board (none: no board) or device (part, package, speed), synthesis tool (silinx: the Silinx toolchain; xst: Xilinx ISE; vivado: AMD Vivado, the Artix-7\'s and Zynq-7000\'s default, the Spartan-7\'s and Kintex-7\'s only; quartus: Intel Quartus Prime, the Intel FPGAs\'), Preferred Language (the drawings\' HDL made again in it), and Project Kind (kind). A new device is checked against the design (warnings). update_constraints writes a new board\'s pins for the top\'s ports into the constraints file, as Update Constraints does.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, board: STR('The board (list_devices), or none for no board.'), variant: STR('The board\'s variant (default: the board\'s default).'),
      part: STR('The device, e.g. xc3s500e; with no board.'), package: STR('The package, e.g. fg320.'), speed: STR('The speed grade, e.g. -4.'),
      synth_tool: { type: 'string', enum: SYNTH_TOOLS, description: 'The synthesis tool.' },
      preferred_language: { type: 'string', enum: ['vhdl', 'verilog'], description: 'The drawings\' HDL made again in it (those with no language of their own).' },
      update_constraints: { type: 'boolean', description: 'With a new board: write its pins into the constraints file (default false).' },
      profile: { type: 'string', enum: PROFILES.map(p => p.id), description: 'Its profile (Design Properties\' Project Kind): logic (Digital Logic: no board, HDL hidden; refused with HDL or C of its own), fpga (with a board or a device), embedded, system (narrower refused while a node is not allowed).' },
      mode: { type: 'string', enum: MODES.map(m => m.id), description: 'Change Mode; down: confirm.' },
      keep: STR('Mode down from a System: the node kept.'), confirm: { type: 'boolean', description: 'Mode down: do it.' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async run(args) {
      // (its mode, #5755: Project ▸ Change Mode…, server/mcp-mode.js)
      if (args.mode !== undefined) return setMode(args);
      if (args.keep !== undefined || args.confirm !== undefined) throw toolError('keep, confirm: given with mode only');
      const { project: name, board, variant, part, package: pkg, speed, synth_tool: synthTool, preferred_language: language, update_constraints: constraints = false } = args;
      let pj = await readProject(name);
      // (the project's kind, #3780, #4103: kind (design_only, its deprecated name: server/mcp-aliases.js); a design and
      // simulation project made one; or made an FPGA project by kind fpga, a board or a device)
      // (its profile, #5440: kind and design_only its deprecated names; a System's profile, or a System project's, one
      // profile change: core/profile-change.js)
      const profile = args.profile;
      if (profile !== undefined && (systemProfile(profile) || isSystemProject(pj))) {
        if (Object.keys(args).some(k => !['project', 'profile'].includes(k))) throw toolError(`profile ${profile}: give it alone (a System's nodes name their boards)`);
        return changeProfileOf(name, pj, profile);
      }
      const kind = profile === 'logic' ? DESIGN_KIND : profile;
      const device = [board, variant, part, pkg, speed, synthTool, language, args.update_constraints].some(x => x !== undefined);
      if (kind === DESIGN_KIND) return makeDesignProject(name, pj, args);
      const fromDesign = isDesignOnly(pj);
      if (kind === 'fpga' && !fromDesign && !device) throw toolError(`the project '${name}' is an FPGA project already`);
      if (fromDesign) {
        if (kind !== 'fpga' && !(board && board !== 'none') && !part) throw toolError(DESIGN_ONLY_MESSAGES.flow(name));
        pj = { ...pj, board: null, constraints: null };
      }
      const D = await devices(), R = await parts();
      if (kind === undefined && board === undefined && variant === undefined && part === undefined && pkg === undefined && speed === undefined && synthTool === undefined && language === undefined) throw toolError('give board, part, package, speed, synth_tool or preferred_language');
      if (language !== undefined && !['vhdl', 'verilog'].includes(language)) throw toolError('preferred_language: vhdl or verilog');
      if (board && board !== 'none' && (part || pkg || speed)) throw toolError('give a board or a device (part, package, speed), not both: a board\'s device is its own');
      let nextBoard = pj.board || null, next = { ...pj.device };
      if (board === 'none' || board === '') nextBoard = null;
      else if (board || variant) {
        const id = board || pj.board;
        if (!id) throw toolError('variant: the project has no board (give board)');
        const r = D.resolveBoard(id, { variant });
        if (!r) throw toolError(`unknown board '${id}' (list_devices)`);
        if (variant && r.variant?.id !== variant) throw toolError(`the ${r.board.name} has no variant '${variant}'`);
        nextBoard = r.board.id;
        next = r.device;
      }
      if (part || pkg || speed) {
        if (nextBoard) throw toolError(`the project's device is its board's (${nextBoard}): give board none to choose a device`);
        // (a new part's package and speed: given, or its only one)
        const p = D.findPart(part || next.part);
        if (part && !p) throw toolError(`${D.validateDevice({ part }).join('; ')} (list_devices)`);
        const only = (list, what) => {
          if (list.length === 1) return list[0];
          throw toolError(`${what}: the ${p.part.toUpperCase()} has ${list.length ? list.join(', ') : 'none'}`);
        };
        const newPart = part && p.part !== next.part;
        const pk = String(pkg || (newPart ? only(Object.keys(p.packages), 'package') : next.package)).toLowerCase();
        const speeds = p.packages[pk]?.speeds || p.speeds;
        const sp = speed !== undefined ? String(speed) : newPart || pkg ? (speeds.length ? only(speeds, 'speed') : '') : next.speed;
        next = { family: p.family, part: p.part, package: pk, speed: sp && !sp.startsWith('-') && !/^[a-z]/i.test(sp) ? `-${sp}` : sp };   // (an Intel part's grade, c7, as it is, #5376)
      }
      const errs = D.validateDevice(next);
      if (errs.length) throw toolError(`${errs.join('; ')} (list_devices)`);
      // a family ISE does not implement: the Silinx toolchain's only (as the dialog locks it)
      const tool = synthTool || pj.synthTool || null;
      if (R.openOnlyDevice(next) && tool === 'xst') throw toolError(`the ${next.part.toUpperCase()} is the Silinx toolchain's only: no XST`);
      // (an experimental family, #3142: no flow runs it yet, the synthesis tool locked as the dialog locks it)
      const experimental = R.experimentalDevice(next);
      // (the Artix-7: AMD Vivado's on this server, #1649)
      const vivado = R.vivadoDevice(next);
      // (an Intel device, #5378: Intel Quartus Prime's alone, as the dialog locks it)
      const quartus = R.quartusDevice(next);
      if (quartus && synthTool && synthTool !== 'quartus') throw toolError(`the ${next.part.toUpperCase()} is implemented by Intel Quartus Prime: no ${{ xst: 'XST', vivado: 'Vivado', silinx: 'Silinx synthesis tool' }[synthTool]}`);
      if (synthTool === 'quartus' && !quartus) throw toolError(`Intel Quartus Prime implements the Intel FPGAs (the MAX 10, the Cyclone IV E, the Cyclone V), not the ${next.part.toUpperCase()}`);
      if (experimental && synthTool === 'xst') throw toolError(vivado ? `the ${next.part.toUpperCase()} is implemented by AMD Vivado: no XST` : `${R.noFlowMessage(next)}: no XST`);
      if (synthTool === 'vivado' && !vivado) throw toolError(`AMD Vivado implements the 7-series devices of Vivado ML Standard (the Artix-7, the Spartan-7, the Kintex-7, the Zynq-7000), not the ${next.part.toUpperCase()}`);
      // (#3895: the Spartan-7, the Kintex-7: AMD Vivado's alone, as the dialog locks it; the Zynq-7000's PL the Silinx toolchain's too, #4680)
      const vivadoOnly = vivado && !R.openFlowDevice(next);
      if (vivadoOnly && synthTool === 'silinx') throw toolError(`${R.noOpenFlowMessage(next)}: no Silinx synthesis tool`);
      // (#3146) the Artix-7's synthesis tool: the one given, else the project's when it was one of the Artix-7's, else AMD Vivado;
      // a Vivado-only family's Vivado; another family's never Vivado (the project's, from an Artix-7: Silinx)
      const synthOf = () => (quartus ? { synthTool: 'quartus' } : vivadoOnly ? { synthTool: 'vivado' } : vivado ? { synthTool: synthTool || (R.vivadoDevice(pj.device) && R.openFlowDevice(pj.device) && ['vivado', 'silinx'].includes(pj.synthTool) ? pj.synthTool : 'vivado') }
        : R.openOnlyDevice(next) || experimental ? { synthTool: 'silinx' } : synthTool ? { synthTool } : pj.synthTool === 'vivado' ? { synthTool: 'silinx' } : {});
      const warnings = [];
      const deviceChanged = next.part !== pj.device?.part || next.package !== pj.device?.package;
      if (deviceChanged) for (const m of await deviceChangeMessages(name, pj, next)) warnings.push(`WARNING: ${next.part.toUpperCase()}: ${m}`);
      const changed = nextBoard !== (pj.board || null) || deviceChanged;
      if (constraints && !(changed && nextBoard && pj.top)) throw toolError(nextBoard ? (pj.top ? 'update_constraints: the board did not change' : `the project '${name}' has no top module: its constraints cannot come from a board's pins`) : 'update_constraints: the project has no board');
      // the constraints of the new device's format (UCF, the iCE40's PCF, the ECP5's LPF, the Gowin's CST, the GateMate's CCF, the 7-series' XDC)
      const ext = R.constraintsExtOf(next);
      let constraintsFile = fromDesign ? `constraints/top${ext}` : pj.constraints;
      if (constraintsFile && !constraintsFile.toLowerCase().endsWith(ext)) {
        const old = constraintsFile;
        constraintsFile = old.replace(/\.[^./]*$/, '') + ext;
        if (fs.existsSync(path.join(P.projectDir(name), old))) warnings.push(`WARNING: this device's constraints are ${ext.slice(1).toUpperCase()}: ${constraintsFile} is the project's now, ${old} was not converted.`);
      }
      const oldLang = pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl';
      await P.updateProject(name, p => withoutKind({ ...p, board: nextBoard, device: next, constraints: constraintsFile, ...synthOf(), ...(language ? { preferredLanguage: language } : {}) }, fromDesign));
      // every drawing in the new language, its HDL file made again in it (#1477)
      const languageLines = [];
      if (language && language !== oldLang) {
        const { drawingsInLanguage } = await import('./drawing-sync.js');
        const r = await drawingsInLanguage(P, name, language);
        languageLines.push(`Preferred Language: ${language === 'verilog' ? 'Verilog' : 'VHDL'}${r.changed.length ? ` (${r.changed.length} drawing(s) now in it, their HDL made again in it)` : ''}.`, ...r.messages);
        warnings.push(...r.messages.filter(m => /^WARNING/.test(m)));
      }
      const after = await P.readProject(name);
      // another board: its clock and its inputs' levels as the defaults of the top's generics (#3710), as the dialog does
      const generics = changed && nextBoard && nextBoard !== (pj.board || null) ? await P.boardGenerics(P.projectDir(name), after) : null;
      if (generics) languageLines.push(topForBoardText(generics, generics.board));
      const pins = [];
      if (constraints) await P.boardConstraints(P.projectDir(name), after);
      else if (changed && !nextBoard && after.constraints && fs.existsSync(path.join(P.projectDir(name), after.constraints))) pins.push(`WARNING: check the pin locations in ${after.constraints} — they must exist on the ${next.package.toUpperCase()} package.`);
      warnings.push(...pins);
      // (after the device, as the dialog's console says it)
      const noFlow = experimental && !vivado && !quartus ? [`WARNING: ${R.noFlowMessage(next)}.`] : [];
      warnings.push(...noFlow);
      const text = [...warnings.filter(w => !pins.includes(w) && !languageLines.includes(w) && !noFlow.includes(w)), ...languageLines, ...(fromDesign ? [`${name}: an FPGA project now: its HDL and its implementation shown.`] : []), `Device set to ${R.deviceLabel(next)}${nextBoard ? ` (board ${nextBoard})` : ''}; synthesis tool ${after.synthTool || 'of Toolchain Settings'}${constraints ? `; ${after.constraints} written from the ${nextBoard}'s pins` : ''}.`, ...pins, ...noFlow];
      return { text: text.join('\n'), data: { project: name, board: nextBoard, device: next, synthTool: after.synthTool || null, preferredLanguage: after.preferredLanguage || 'vhdl', constraints: after.constraints || null, constraintsUpdated: constraints, generics: generics ? { file: generics.path, ...generics.values } : null, warnings } };
    },
  },
  {
    name: 'set_process_properties', title: 'Process Properties',
    description: 'Change a project\'s Process Properties: the Optimization (fast; area: smallest; speed: fastest, several placements tried), the FPGA start-up clock (jtag; cclk: from the PROM or flash; user); a Spartan-6\'s Map (s6_map); a 7-series\' Place & Route seeds (xc7_seeds: 1, or the best Fmax of seeds 1-3); a System\'s (emulate_nodes, simulation).',
    inputSchema: { type: 'object', properties: {
      project: PROJECT,
      optimization: { type: 'string', enum: OPTIMIZATIONS, description: 'The Optimization.' },
      startup_clock: { type: 'string', enum: Object.keys(STARTUP_CLOCKS), description: 'The FPGA start-up clock.' },
      s6_map: { type: 'string', enum: S6_MAPS, description: 'A Spartan-6\'s Map: nextpnr (the default) or silinx.' },
      xc7_seeds: { type: 'integer', enum: XC7_SEEDS, description: 'A 7-series\' Place & Route: 1 seed (the default) or the best of 3.' },
      emulate_nodes: { type: 'array', items: { type: 'string' }, description: 'The nodes Emulate System runs (id@model; []: all).' },
      simulation: { type: 'object', description: 'Simulate System\'s { nodes, ms, stimulus }.' },
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async run({ project: name, optimization, startup_clock: clock, s6_map: map, xc7_seeds: seeds, emulate_nodes: nodes, simulation }) {
      const pj = await readProject(name);
      // (a System project's Emulation and Simulation Properties, #5581: the nodes Emulate System runs; Simulate System's
      // nodes, time and stimulus file)
      if (nodes !== undefined || simulation !== undefined) return systemProperties(name, pj, { nodes, simulation }, { optimization, clock, map, seeds });
      if (!optimization && !clock && !map && seeds === undefined) throw toolError('give optimization, startup_clock, s6_map, xc7_seeds or emulate_nodes');
      const { familyProfile } = await import('../core/family-profile.js');
      const s6 = !!familyProfile((await parts()).deviceFamily(pj.device)).mapChoice;   // (a Spartan-6's Map, as Process Properties shows it)
      if (map && !S6_MAPS.includes(map)) throw toolError(`s6_map: one of ${S6_MAPS.join(', ')}`);
      if (map && !s6) throw toolError(`s6_map: the project's device (${deviceName(pj.device)}) is not a Spartan-6`);
      // (a 7-series' seeds, #3825)
      const xc7 = !!familyProfile((await parts()).deviceFamily(pj.device)).seedsChoice;
      if (seeds !== undefined && !XC7_SEEDS.includes(seeds)) throw toolError(`xc7_seeds: one of ${XC7_SEEDS.join(', ')}`);
      if (seeds !== undefined && !xc7) throw toolError(`xc7_seeds: the project's device (${deviceName(pj.device)}) is not a 7-series`);
      if (optimization && !OPTIMIZATIONS.includes(optimization)) throw toolError(`optimization: one of ${OPTIMIZATIONS.join(', ')}`);
      if (clock && !STARTUP_CLOCKS[clock]) throw toolError(`startup_clock: one of ${Object.keys(STARTUP_CLOCKS).join(', ')}`);
      const { synthGoal, GOAL_IMPL } = await import('../packages/silinx-fpga/src/index.js');
      const { s6MapOf, xc7SeedsOf } = await parts();
      // (a place and route engine saved by an earlier version, #2136: dropped, nextpnr the one engine since #2137)
      await P.updateProject(name, p => {
        const { engine, s6Map, xc7Seeds, ...impl } = p.impl || {};
        return { ...p, impl: { ...impl, ...(optimization ? GOAL_IMPL[optimization] : {}), ...(clock ? { startupClk: STARTUP_CLOCKS[clock] } : {}), ...(s6MapOf({ s6Map: map ?? s6Map }) === 'silinx' ? { s6Map: 'silinx' } : {}),
          ...(xc7SeedsOf({ xc7Seeds: seeds ?? xc7Seeds }) === 3 ? { xc7Seeds: 3 } : {}) } };
      });
      const impl = (await P.readProject(name)).impl || {};
      const data = { project: name, optimization: synthGoal(impl), startupClock: Object.keys(STARTUP_CLOCKS).find(k => STARTUP_CLOCKS[k] === (impl.startupClk || 'JtagClk')), ...(s6 ? { s6Map: s6MapOf(impl) } : {}), ...(xc7 ? { xc7Seeds: xc7SeedsOf(impl) } : {}) };
      return { text: `${name}: Optimization ${data.optimization}, FPGA start-up clock ${data.startupClock}${s6 ? `, Map ${data.s6Map === 'nextpnr' ? 'nextpnr' : 'Silinx'}` : ''}${xc7 ? `, Place & Route ${data.xc7Seeds === 3 ? 'the best of 3 seeds' : 'one seed'}` : ''}.`, data };
    },
  },
  {
    name: 'set_source_properties', title: 'Source Properties',
    description: 'Choose a drawing\'s language, as Source Properties does: vhdl or verilog (its own, kept when the Preferred Language changes), or project (following the Preferred Language). Its HDL file is made again in it, the other removed. HDL written by hand, or a drawing made from its HDL, has no choice.',
    inputSchema: { type: 'object', properties: { project: PROJECT, path: STR('The drawing (e.g. src/traffic.fsm.json) or its HDL file.'), language: { type: 'string', enum: ['vhdl', 'verilog', 'project'], description: 'Its language, or project (the Preferred Language).' } }, required: ['project', 'path', 'language'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async run({ project: name, path: rel, language }) {
      await readProject(name);
      if (!['vhdl', 'verilog', 'project'].includes(language)) throw toolError('language: vhdl, verilog or project');
      const S = await import('./drawing-sync.js');
      // the drawing, or the drawing of an HDL file (its generatedFile)
      const tree = await P.fileTree(name);
      let drawing = null;
      if (tree.includes(rel) && await S.drawingLanguage(P, name, rel)) drawing = rel;
      else for (const f of tree.filter(f => /\.(sch|asm|tt|bool|fsm|pn|circ|regs)\.json$/i.test(f))) {
        try { if (JSON.parse(await P.readFile(name, f)).generatedFile === rel && await S.drawingLanguage(P, name, f)) { drawing = f; break; } } catch { /* not a drawing */ }
      }
      if (!drawing) throw toolError(tree.includes(rel) ? `'${rel}' has no language to choose: HDL written by hand, or a drawing made from its HDL` : `no file '${rel}' in the project '${name}'`);
      const r = await S.setSourceLanguage(P, name, drawing, language === 'project' ? '' : language);
      const L = r.language === 'verilog' ? 'Verilog' : 'VHDL';
      return { text: [...r.messages, `${drawing}: ${L}${language === 'project' ? ' (the project\'s Preferred Language)' : ''}${r.changed ? '' : ', as it was'}.`].join('\n'), data: { project: name, drawing, language: r.language, own: language !== 'project', changed: r.changed, messages: r.messages } };
    },
  },
];
