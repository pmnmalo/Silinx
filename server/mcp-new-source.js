// The MCP server's New Source (server/mcp.js, #2674), as the interface's New Source wizard makes each type
// (web/js/new-source.js): a module (its ports), a VHDL package, a test bench of a module, a constraints file, a .mem
// file, a C or C++ function (Silinx HLS), an empty schematic, state diagram, ASM chart, Petri net, circuit (a breadboard and its supply, #3897) or truth table, a
// guided lab (#3179: core/labs.js newLab); from
// the wizard's own templates (core/templates.js, c-templates.js: they import nothing) and the drawings' models, with
// its checks: a file name, a name that is not a reserved word, a module or a drawing's HDL file that is not taken. A
// file that exists is not replaced.
import fs from 'node:fs';
import path from 'node:path';
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT, cpuRefusal } from './mcp-util.js';
import { NAME_RE, FILE_RE, sourceBase } from '../core/ident.js';
import { CIRCUIT_TEMPLATES } from '../core/circuit-templates.js';
import { FSM_TEMPLATES } from '../core/chart-templates.js';

const TYPES = {
  module: { label: 'Module (HDL)', ext: null, dir: 'src' },
  test_bench: { label: 'Test Bench', ext: null, dir: 'sim' },
  package: { label: 'VHDL Package', ext: '.vhd', dir: 'src' },
  constraints: { label: 'Implementation Constraints File', ext: '.ucf', dir: 'constraints' },
  mem: { label: 'Memory Initialization File (.mem)', ext: '.mem', dir: 'src' },
  c: { label: 'C Function (HLS)', ext: '.c', dir: 'src' },
  cpp: { label: 'C++ Function (HLS)', ext: '.cpp', dir: 'src' },
  schematic: { label: 'Schematic', ext: '.sch.json', dir: 'src' },
  fsm: { label: 'Finite State Machine (FSM)', ext: '.fsm.json', dir: 'src' },
  asm: { label: 'Algorithmic State Machine (ASM)', ext: '.asm.json', dir: 'src' },
  petri: { label: 'Petri Net', ext: '.pn.json', dir: 'src' },
  boolean: { label: 'Boolean Algebra', ext: '.bool.json', dir: 'src' },
  circuit: { label: 'Digital Electronic Circuit', ext: '.circ.json', dir: 'src' },   // (New Source's name, #4061)
  regmap: { label: 'Register Map', ext: '.regs.json', dir: 'src' },   // (a System's peripheral, #5288)
  lab: { label: 'Guided Lab', ext: '.lab.json', dir: 'labs' },
};
const ident = n => n.replace(/[^A-Za-z0-9_]/g, '_');
const DRAWN = ['schematic', 'fsm', 'asm', 'petri', 'boolean', 'circuit', 'regmap'];

// the source's text, as the wizard's Finish writes it: core/new-source-text.js, the interface's (#4751)
async function sourceText(type, opts) {
  if (!Object.hasOwn(TYPES, type)) throw toolError(`type: one of ${Object.keys(TYPES).join(', ')}`);
  return (await import('../core/new-source-text.js')).sourceText(type, opts);
}

// a module's ports from the tool's [{ name, dir, msb, lsb }] (a bus when msb is given)
function portsOf(list) {
  if (list === undefined) return [{ name: 'clk', dir: 'in', bus: false, msb: '', lsb: '' }, { name: 'rst', dir: 'in', bus: false, msb: '', lsb: '' }];
  if (!Array.isArray(list)) throw toolError('ports: a list of { name, dir (in, out, inout), msb, lsb }');
  return list.map(p => {
    if (!p || typeof p.name !== 'string') throw toolError('ports: each one { name, dir, msb, lsb }');
    const dir = p.dir || 'in';
    if (!['in', 'out', 'inout'].includes(dir)) throw toolError(`port '${p.name}': dir in, out or inout`);
    const bus = p.msb !== undefined && p.msb !== null;
    if (bus && !(Number.isInteger(+p.msb) && Number.isInteger(+(p.lsb ?? 0)))) throw toolError(`port '${p.name}': msb and lsb are integers`);
    return { name: p.name.trim(), dir, bus, msb: bus ? String(+p.msb) : '', lsb: bus ? String(+(p.lsb ?? 0)) : '' };
  });
}

export const NEW_SOURCE_TOOLS = [
  {
    name: 'new_source', title: 'New Source',
    description: 'Add a new source to a project, as the New Source wizard does: module (an HDL module with its ports), test_bench (of a module of the project), package (VHDL), constraints (in the device\'s format: UCF, PCF, LPF, CST, XDC), mem, c or cpp (a function for Silinx HLS), an empty drawing (schematic, fsm or an FSM Wizard template, asm, petri, boolean: a truth table, circuit: a breadboard or a template\'s assembly, regmap), or lab (labs/<name>.lab.json, a guided lab\'s steps to edit). In VHDL or Verilog (default: the Preferred Language), from the wizard\'s templates, added; edit it with write_file. An existing file is kept.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT, type: { type: 'string', enum: Object.keys(TYPES), description: 'The source\'s type.' },
      name: STR('Its file name, without the extension (letters, digits, _ and -; a letter first).'),
      location: STR('Its folder in the project (default: src, sim for a test bench, constraints for a constraints file).'),
      language: { type: 'string', enum: ['vhdl', 'verilog'], description: 'Its language (a module, a test bench, a drawing).' },
      module: STR('A module: its name (default: the file name). A test bench: the module it tests (default: the project\'s top).'),
      architecture: STR('A VHDL module: its architecture\'s name (default Behavioral).'),
      template: { type: 'string', enum: [...new Set([...CIRCUIT_TEMPLATES, ...FSM_TEMPLATES].map((t) => t.id))], description: 'An fsm: the FSM Wizard\'s template: empty, counter, updown, enable, ring, johnson (N states), detector (of a pattern), traffic. A circuit: the circuit wizard\'s assembly: boards, io, seg7, counter, adder, gates, comparator, decoder, shift, flipflop.' },
      template_params: { type: 'object', description: 'An fsm\'s: counter, updown, enable, ring, johnson {n}; detector {pattern: bits or a regular expression over 0 and 1, overlap: yes|no, type: moore|mealy}. A circuit\'s: boards {n: 1-4, size: half|full}, io {n, m: 1-8}, others {chip} as the wizard.' },
      ports: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, dir: { type: 'string', enum: ['in', 'out', 'inout'] }, msb: { type: 'integer' }, lsb: { type: 'integer' } }, required: ['name'] }, description: 'A module: its ports (a bus with msb and lsb; default: clk and rst).' },
    }, required: ['project', 'type', 'name'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
    async run({ project: name, type, name: file, location, language, module, architecture, ports: portList, template, template_params: tparams }) {
      const pj = await readProject(name);
      const t = TYPES[type];
      if (!t) throw toolError(`type: one of ${Object.keys(TYPES).join(', ')}`);
      const { reservedError } = await import('../core/reserved.js');
      const { constraintsExtOf } = await import('../packages/silinx-fpga/src/parts.js');
      file = sourceBase(file);
      if (!FILE_RE.test(file)) throw toolError('Enter a valid file name (letters, digits, _ and -).');
      const loc = String(location ?? t.dir).trim().replace(/\/+$/, '');
      if (!/^[A-Za-z0-9_/-]+$/.test(loc) || loc.split('/').some(s => !s || s.startsWith('.'))) throw toolError('Invalid location.');
      if (/^build(\/|$)/i.test(loc)) throw toolError('build/ is written by Silinx itself');
      if (type === 'lab' && loc !== 'labs') throw toolError('A guided lab is in the labs folder: Location labs.');
      if (type === 'package' && language === 'verilog') throw toolError('a package is VHDL\'s');
      const lang = type === 'package' ? 'vhdl' : language || (pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
      const ext = type === 'constraints' ? constraintsExtOf(pj.device) : t.ext ?? (lang === 'verilog' ? '.v' : '.vhd');
      const rel = `${loc}/${file}${ext}`;
      const tree = await P.fileTree(name);
      if (fs.existsSync(path.join(P.projectDir(name), rel))) throw toolError(`${rel} already exists: choose another name.`);
      // (a schematic, a circuit, a register map: hardware, refused in a CPU node, #5486)
      const refusal = DRAWN.includes(type) ? await cpuRefusal(name, rel) : null;
      if (refusal) throw toolError(refusal);
      // the project's modules (its HDL files')
      const { compile } = await import('../core/compile.js');
      const hdl = (await P.readSources(name)).filter(s => !s.missing && (s.lang === 'vhdl' || s.lang === 'verilog'));
      let lib = null;
      try { lib = compile(hdl); } catch { /* none */ }
      const mods = lib ? [...lib.modules.values()] : [];
      const taken = m => mods.find(x => x.name.toLowerCase() === m.toLowerCase());
      // the module named as the file (a drawing, a test bench, a package, a C function): not a reserved word
      if (!['module', 'constraints', 'mem', 'lab'].includes(type)) {
        const r = reservedError(ident(file));
        if (r) throw toolError(`${r}: choose another name.`);
      }
      // a drawing: its module (named as the file) and its HDL file free (#230)
      if (DRAWN.includes(type)) {
        if (taken(ident(file))) throw toolError(`A module named '${ident(file)}' already exists.`);
        const { drawnHdlPath } = await import('../core/view-hdl.js');
        const hdl = drawnHdlPath(rel, ident(file), lang);
        if (tree.includes(hdl)) throw toolError(`${hdl} already exists: the HDL generated from the new source would be written there. Choose another name.`);
      }
      const opts = { file, lang, pj };
      if (type === 'module') {
        opts.entity = String(module ?? file).trim();
        if (!NAME_RE.test(opts.entity)) throw toolError('Invalid module name.');
        opts.ports = portsOf(portList);
        const r = reservedError(opts.entity) || opts.ports.map(p => reservedError(p.name)).find(Boolean);
        if (r) throw toolError(`${r}: choose another name.`);
        for (const p of opts.ports) if (!NAME_RE.test(p.name)) throw toolError(`Invalid port name '${p.name}'.`);
        if (new Set(opts.ports.map(p => p.name.toLowerCase())).size !== opts.ports.length) throw toolError('Duplicate port names.');
        if (taken(opts.entity)) throw toolError(`A module named '${opts.entity}' already exists.`);
        opts.arch = String(architecture || 'Behavioral').trim();
        if (lang === 'vhdl' && !NAME_RE.test(opts.arch)) throw toolError('Invalid architecture name.');
      } else if (portList !== undefined || architecture !== undefined) throw toolError('ports and architecture: a module\'s');
      if (type === 'test_bench') {
        const uutName = module || pj.top;
        const m = mods.find(x => x.kind !== 'package' && x.name.toLowerCase() === String(uutName || '').toLowerCase());
        if (!m) throw toolError(uutName ? `no module '${uutName}' in the project's HDL files` : 'module: the module the test bench tests (the project has no top)');
        if (taken(ident(file))) throw toolError(`A module named '${ident(file)}' already exists.`);
        const { uutInfo } = await import('../core/uut-info.js');
        opts.uut = uutInfo({ name: m.name, lang: m.lang, mod: m });
      } else if (module !== undefined && type !== 'module') throw toolError('module: a module\'s name, or the module a test bench tests');
      if (template !== undefined || tparams !== undefined) {
        if (type !== 'circuit' && type !== 'fsm') throw toolError('template and template_params: a circuit\'s or a state diagram\'s (fsm)');
        const C = await import('../core/chart-templates.js');
        const list = type === 'fsm' ? FSM_TEMPLATES : CIRCUIT_TEMPLATES;
        const id = template ?? list[0].id;
        if (!list.some((t) => t.id === id)) throw toolError(`template: one of ${list.map((t) => t.id).join(', ')}`);   // (no empty circuit, #4161)
        const params = { ...C.templateDefaults(type, id), ...(tparams || {}) };
        if (type === 'fsm' && params.pattern !== undefined) params.pattern = String(params.pattern).trim();   // (as the wizard's field)
        const e = C.templateError(type, id, params);
        if (e) throw toolError(e);
        opts.template = { id, params };
      }
      const text = await sourceText(type, opts);
      const noConstraints = !pj.constraints || !tree.includes(pj.constraints);
      try { await P.writeFile(name, rel, text); } catch (e) { throw toolError(e.message); }
      if (type === 'constraints' && noConstraints) await P.updateProject(name, p => ({ ...p, constraints: rel }));
      // a drawing: its HDL file, as the interface gives it (#3184; an empty state diagram or ASM chart has none yet)
      const adopted = DRAWN.includes(type) ? await (await import('./drawing-sync.js')).adoptDrawing(P, name, rel) : null;
      const entry = (await P.readProject(name)).files.find(f => f.path === (adopted?.target || rel));
      return { text: [`Created ${t.label}${t.ext ? '' : ` (${lang === 'verilog' ? 'Verilog' : 'VHDL'})`} '${rel}'.`, ...(adopted?.messages || [])].join('\n'),
        data: { project: name, type, path: rel, language: lang, role: entry?.role || null, ...(adopted?.written ? { hdl: adopted.target } : {}), ...(type === 'constraints' ? { constraints: (await P.readProject(name)).constraints } : {}) } };
    },
  },
];
