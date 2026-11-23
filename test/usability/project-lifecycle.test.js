// Usability (#5206, phase 2): a project's lifecycle as a person goes through it: File ▸ New Project… (its wizard, the
// Basys2 chosen, VHDL), Project ▸ New Source… of each kind it offers (a VHDL module and a Verilog one with their ports,
// a schematic, a state diagram, an ASM chart, a Boolean algebra, a Petri net, a circuit, a test bench of the VHDL
// module, a constraints file, a memory file, a C and a C++ function, a guided lab; the Clocking Wizard and the Block
// Memory through their wizards), the top set from a module's row, one removed (Undo, Redo), one opened and renamed (its
// file and the test bench that uses it), the top changed, File ▸ Export Project (.zip)…, Import Project… of that zip as
// a new project, closed and opened again. After every step the page and the disk agree with the project's model
// (lib/project-model.js, lib/project-session.js): the Design pane's rows, the top, the editors open, the files and
// silinx.json, the modules their HDL holds, the console's lines exactly, no warnings. In both interfaces
// (SILINX_UI_INTERFACE=ise) and in Portuguese (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { ProjectSession, same } from './lib/project-session.js';
import { RUN } from './lib/session.js';
import { ProjectModel } from './lib/project-model.js';
import { pageState, projectActions, consoleLines, consoleCount } from './lib/project-actions.js';
import { tr } from './lib/hdl-actions.js';
import { readZip } from '../../core/zip.js';
import { compile, elaborate } from '../../core/compile.js';

const FILE = 'test/usability/project-lifecycle.test.js';
const ise = RUN.ui === 'ise';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const DEVICE = 'xc3s250e-4-cp132';
// each New Source: its type, its kind (the model's), its name, what its pages are given, the console's lines it adds
const made = (f, d) => `${f} generated from ${d} (every source has its HDL)`;
const SOURCES = [
  { type: 'Module (HDL)', kind: 'vhdl', name: 'alu', lang: 'vhdl', ports: [['a', 'in'], ['y', 'out']], lines: ["Created Module (HDL) (VHDL) 'src/alu.vhd'."] },
  { type: 'Module (HDL)', kind: 'verilog', name: 'cnt', lang: 'verilog', ports: [['q', 'out']], lines: ["Created Module (HDL) (Verilog) 'src/cnt.v'."] },
  { type: 'Schematic', kind: 'sch', name: 'sheet', lines: [made('src/sheet.vhd', 'src/sheet.sch.json'), "Created Schematic 'src/sheet.sch.json'."] },
  { type: 'Finite State Machine (FSM)', kind: 'fsm', name: 'ctl', lines: ["Created Finite State Machine (FSM) 'src/ctl.fsm.json'."] },
  { type: 'Algorithmic State Machine (ASM)', kind: 'asm', name: 'seq', lines: ["Created Algorithmic State Machine (ASM) 'src/seq.asm.json'."] },
  { type: 'Boolean Algebra', kind: 'tt', name: 'dec', lines: [made('src/dec.vhd', 'src/dec.bool.json'), "Created Boolean Algebra 'src/dec.bool.json'."] },
  { type: 'Petri Net', kind: 'pn', name: 'net', lines: [made('src/net.vhd', 'src/net.pn.json'), "Created Petri Net 'src/net.pn.json'."] },
  { type: 'Digital Electronic Circuit', kind: 'circ', name: 'board', lines: [made('src/board.vhd', 'src/board.circ.json'), "Created Digital Electronic Circuit 'src/board.circ.json'."] },
  // (the Silinx interface's: the bench simulated, the ISE style's: selected in its Simulation view)
  { type: 'Test Bench', kind: 'tb', name: 'tb_alu', lang: 'vhdl', uut: 'alu', lines: ["Created Test Bench (VHDL) 'sim/tb_alu.vhd'.", "Top-level simulation module set to 'tb_alu'."], ise: ["Created Test Bench (VHDL) 'sim/tb_alu.vhd'."] },
  { type: 'Implementation Constraints File', kind: 'ucf', name: 'pins', lines: ["Created Implementation Constraints File 'constraints/pins.ucf'."] },
  { type: 'Memory Initialization File (.mem)', kind: 'mem', name: 'rom', lines: ["Created Memory Initialization File (.mem) 'src/rom.mem'."] },
  { type: 'C Function (HLS)', kind: 'c', name: 'add', lines: ["Created C Function (HLS) 'src/add.c'."] },
  { type: 'C++ Function (HLS)', kind: 'cpp', name: 'mul', lines: ["Created C++ Function (HLS) 'src/mul.cpp'."] },
  { type: 'Guided Lab', kind: 'lab', name: 'lab1', lines: ["Created Guided Lab 'labs/lab1.lab.json'."] },
  // (its wizard's pages as it proposes them: the board's 50 MHz in, CLK0 out; a 1024 x 8 memory)
  { type: 'Clock Manager (DCM / PLL)', kind: 'clock', name: 'clkgen', wizard: 'Clocking Wizard', lines: ['Clocking Wizard: created src/clkgen.vhd, the module clkgen: clk0 50 MHz.'] },
  { type: 'Block Memory', kind: 'bram', name: 'ram', wizard: 'Block Memory', lines: ['Block Memory: created src/ram.vhd, the module ram: 1024 x 8, 1 RAMB16_S9.'] },
];
const opened = (name) => `Project "${name}" opened (${DEVICE}).`;
const TRUST = (name) => `Project "${name}" came from outside (imported): it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it.`;

/** The model's other files: neither a source nor the constraints (an Import Project…'s count). */
const others = (m) => { const src = new Set(m.files().map((f) => f.split(':')[0])); return m.tree().filter((f) => !src.has(f) && f !== m.constraints).length; };

/** A project's files on disk, path → text (silinx.json apart). */
async function texts(name) {
  const dir = path.join(env.server.workspace, name), out = {};
  for (const f of (await env.server.api('GET', `/api/projects/${encodeURIComponent(name)}`)).fileTree) out[f] = await fsp.readFile(path.join(dir, f), 'utf8');
  return out;
}

/** The project's whole lifecycle, up to the zip exported (the session and the zip's file). */
async function lifecycle(page, title) {
  const model = new ProjectModel('UsabLife');
  model.flowFiles = ise;
  const s = new ProjectSession(page, env, { file: FILE, title, model });
  await s.start();
  await s.act('New Project', { name: 'UsabLife', board: 'basys2' }, () => s.a.newProject({ name: 'UsabLife', board: 'basys2' }), { lines: [opened('UsabLife')] });
  for (const S of SOURCES) {
    await s.act('New Source', { type: S.type, name: S.name }, () => s.a.newSource({ ...S, file: ProjectModel.fileOf(S) }), {
      // (a test bench: shown in the ISE style's Simulation view)
      update: (m) => { m.add(S.kind, S.name, { uut: S.uut, simTop: !ise }); if (S.kind === 'tb' && ise) m.view = 'sim'; }, lines: (ise && S.ise) || S.lines,
    });
  }
  // (the ISE style's Design pane shows the new test bench in its Simulation view: Implementation chosen again)
  if (ise) await s.act('View: Implementation', {}, () => page.setView('impl'), { update: (m) => { m.view = 'impl'; } });
  // the top: the Verilog module, from its row's menu
  await s.act('Set as Top Module', { row: 'cnt' }, () => s.a.setTop('cnt'), { update: (m) => m.setTop('cnt'), lines: ["Top-level module set to 'cnt'."] });
  // the Petri net removed (its drawing and its HDL out of the project, left in the folder), Undo, Redo
  await s.act('Remove from Project', { row: 'net' }, async () => {
    const q = await s.a.remove('net');
    const [want] = await s.trs(["Remove 'src/net.pn.json' and its HDL file 'src/net.vhd' from the project?\n(The files stay in the project folder: Undo or Add to Project in the Files view brings them back.)"]);
    assert.equal(q, want);
  }, { update: (m) => m.remove('net'), lines: ['Removed src/net.pn.json and its HDL file src/net.vhd from the project (the files are kept in the project folder).'] });
  await s.act('Edit ▸ Undo', {}, () => s.a.editMenu('Undo'), { update: (m) => m.restore('net'), lines: ['Undo: Remove from Project.'] });
  await s.act('Edit ▸ Redo', {}, () => s.a.editMenu('Redo'), { update: (m) => m.remove('net'), lines: ['Redo: Remove from Project.'] });
  // the VHDL module renamed from its row (its editor open behind others): its file and the test bench that instantiates
  // it, their editors in their tabs' places, the one in front kept (#5250)
  await s.act('Rename…', { row: 'alu', to: 'alu2' }, () => s.a.rename('alu', 'alu2'), {
    update: (m) => m.rename('alu', 'alu2'),
    lines: ["Rename: module 'alu' renamed to 'alu2' (2 file(s) updated); src/alu.vhd → src/alu2.vhd."],
    // (the bench elaborated with the renamed module: it instantiates alu2)
    expect: async () => {
      const t = await texts('UsabLife');
      const lib = compile(['src/alu2.vhd', 'sim/tb_alu.vhd'].map((p) => ({ path: p, lang: 'vhdl', text: t[p] })));
      const d = elaborate(lib, 'tb_alu');
      same([...lib.errors, ...d.diags].filter((x) => x.severity !== 'note').map((x) => x.message), [], 'the bench elaborated');
      // (its code: its header's comment names the module it was made for)
      same(t['sim/tb_alu.vhd'].split('\n').filter((l) => /\balu\b/.test(l.replace(/--.*/, ''))), [], 'the bench\'s lines that name alu');
    },
  });
  await s.act('Set as Top Module', { row: 'sheet' }, () => s.a.setTop('sheet'), { update: (m) => m.setTop('sheet'), lines: ["Top-level module set to 'sheet'."] });
  // exported: the zip holds silinx.json and every file of the folder, as they are on disk
  let zip = null;
  await s.act('Export Project (.zip)', {}, async () => { zip = await s.a.exportZip('UsabLife'); }, {
    changes: false,
    lines: async () => [`Exported UsabLife-silinx.zip: the whole Silinx project (silinx.json + all project files, ${Math.round((await fsp.stat(zip)).size / 1024)} KB).`],
    expect: async () => {
      const entries = await readZip(new Uint8Array(await fsp.readFile(zip)), { inflate: (d) => zlib.inflateRawSync(d) });
      // (and the copy's ancestor, silinx.base.json: what a Merge Contribution… compares it with, #4205)
      same(entries.map((e) => e.path).sort(), ['silinx.json', 'silinx.base.json', ...model.tree()].sort(), 'the zip\'s files');
      const t = await texts('UsabLife');
      same(entries.filter((x) => !/^silinx(\.base)?\.json$/.test(x.path) && Buffer.from(x.data).toString('utf8') !== t[x.path]).map((x) => x.path), [], 'the zip\'s files not as on disk');
    },
  });
  return { s, model, zip };
}

uiTest('usability: project: New Project, a source of each kind, the top set, one removed (Undo, Redo), one renamed, the top changed, exported, imported, closed and opened again', E, async (page) => {
  const { s, model, zip } = await lifecycle(page, 'project: lifecycle');
  // imported as a new project: the same files, sources and settings; opened with no editor
  const left = await pageState(page);
  s.model = model.clone('UsabLife2');
  await s.act('Import Project…', { zip: path.basename(zip), name: 'UsabLife2' }, () => s.a.importZip(zip, 'UsabLife2'), {
    // (the trust's line and its button; the other files: neither a source nor the constraints, #5253)
    lines: async () => [opened('UsabLife2'), `${(await s.trs([TRUST('UsabLife2')]))[0]} ${(await s.trs(['Trust Project']))[0]}`,
      ...await s.trs([`Imported Silinx project 'UsabLife2' (8 source file(s), ${others(model)} other file(s)).`])],
    expect: async () => { const a = await texts('UsabLife2'), b = await texts('UsabLife'); same(Object.keys(a).filter((f) => a[f] !== b[f]), [], 'the files not as the first project\'s'); },
  });
  // closed: the Start page, no project, no editor
  await s.act('Close Project', {}, () => s.a.close(), { model: false, expect: async (a) => assert.deepEqual([a.page.name, a.page.rows, a.page.docs.ids, a.disk], [null, [], [], null]) });
  // the first one opened again (File ▸ Open Project…): as it was left, its editors and the one in front restored
  s.model = model;
  await s.act('Open Project…', { name: 'UsabLife' }, () => s.a.open('UsabLife'), {
    lines: [opened('UsabLife')],
    expect: async (a) => assert.deepEqual(a.page.docs.ids.filter((d) => d !== 'summary'), left.docs.ids.filter((d) => d !== 'summary'), 'the editors in their order'),
  });
}, { timeout: 360000 });

// a module, a bench that instantiates it, another module: the project of the scenarios below
const ALU = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity alu is\n  port (a : in std_logic; y : out std_logic);\nend alu;\n\narchitecture rtl of alu is\nbegin\n  y <= not a;\nend rtl;\n';
const TB = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity tb_alu is\nend tb_alu;\n\narchitecture sim of tb_alu is\n  signal a, y : std_logic := \'0\';\nbegin\n  uut : entity work.alu port map (a => a, y => y);\n  a <= \'1\' after 10 ns;\nend sim;\n';
const OTHER = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity other is\n  port (b : in std_logic; z : out std_logic);\nend other;\n\narchitecture rtl of other is\nbegin\n  z <= b;\nend rtl;\n';
async function small(page, name) {
  await makeProject(env, { name, board: 'basys2', top: 'other', files: { 'src/alu.vhd': ALU, 'sim/tb_alu.vhd': TB, 'src/other.vhd': OTHER }, roles: { 'sim/tb_alu.vhd': 'sim' } });
  await page.openProject(name);
  if (RUN.lang !== 'en') await page.eval(async (l) => { (await import('/js/i18n.js')).setLanguage(l); }, RUN.lang);
  return projectActions(page, env);
}

// Rename… of a module: the editors it reopens (its file renamed, the bench it changed) where their tabs were, the one in
// front kept in front
uiTest('usability: project: Rename… of a module keeps the editors\' tabs in their places and the one in front (#5250)', E, async (page) => {
  const a = await small(page, 'UsabRenameTabs');
  for (const f of ['src/alu.vhd', 'sim/tb_alu.vhd', 'src/other.vhd']) await page.eval((p) => window.SilinxApp.openFile(p), f);
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/other.vhd', [], { what: 'the three editors open' });
  await a.rename('alu', 'alu2');
  await page.waitFor(() => window.Silinx.docs.some((d) => d.id === 'file:src/alu2.vhd'), [], { what: 'the renamed file\'s editor' });
  const { docs } = await pageState(page);
  assert.deepEqual([docs.ids.filter((d) => d !== 'summary'), docs.active], [['file:src/alu2.vhd', 'file:sim/tb_alu.vhd', 'file:src/other.vhd'], 'file:src/other.vhd']);
});

// Export Project (.zip)… gives the project its id (a copy's origin, #4205), a write of silinx.json of its own: no line
// says that it changed outside Silinx
uiTest('usability: project: Export Project (.zip)…: no "Changed outside Silinx" line after it (#5252)', E, async (page) => {
  const a = await small(page, 'UsabExportOutside');
  const n = await consoleCount(page);
  const zip = await a.exportZip('UsabExportOutside');
  await sleep(4000);
  assert.deepEqual(await consoleLines(page, n), await tr(page, [`Exported UsabExportOutside-silinx.zip: the whole Silinx project (silinx.json + all project files, ${Math.round((await fsp.stat(zip)).size / 1024)} KB).`]));
});

// Import Project… of a Silinx zip: its line counts the sources and the other files apart
uiTest('usability: project: Import Project…\'s line counts the sources and the other files once (#5253)', E, async (page) => {
  const a = await small(page, 'UsabCount');
  const zip = await a.exportZip('UsabCount');
  const n = await consoleCount(page);
  await a.importZip(zip, 'UsabCount2');
  await page.waitFor((k) => document.querySelectorAll('#console-log .ln').length > k + 2, [n], { what: 'the import\'s lines' });
  assert.equal((await consoleLines(page, n)).at(-1), (await tr(page, ["Imported Silinx project 'UsabCount2' (3 source file(s))."]))[0]);
});

// in Portuguese the lifecycle's lines are Portuguese, as the simulation's (#5223), and English again in English
uiTest('usability: project: the console\'s lines of New Source, Remove from Project, Undo / Redo, Rename and Export in Portuguese (#5254)', E, async (page) => {
  const a = await small(page, 'UsabLinesPt');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  const n = await consoleCount(page);
  await a.newSource({ type: 'Schematic', name: 'sheet', file: 'src/sheet.sch.json' });
  await a.remove('sheet');
  // (Undo right after the question, New Source's end may still be running: it waits for the removal, #5263; each one's
  // line written, the page settled, before the next)
  const step = async (which, line) => { await a.editMenu(which); await page.waitFor((l) => [...document.querySelectorAll('#console-log .ln')].some((x) => x.textContent === l), [line], { what: `${which}'s line` }); await pageState(page); };
  await step('Undo', 'Anular: Remover do Projeto.');
  await step('Redo', 'Refazer: Remover do Projeto.');
  await a.rename('alu', 'alu2');
  const zip = await a.exportZip('UsabLinesPt');
  const kb = Math.round((await fsp.stat(zip)).size / 1024);
  await sleep(500);
  const english = ['src/sheet.vhd generated from src/sheet.sch.json (every source has its HDL)', "Created Schematic 'src/sheet.sch.json'.",
    'Removed src/sheet.sch.json and its HDL file src/sheet.vhd from the project (the files are kept in the project folder).',
    'Undo: Remove from Project.', 'Redo: Remove from Project.', "Rename: module 'alu' renamed to 'alu2' (2 file(s) updated); src/alu.vhd → src/alu2.vhd.",
    `Exported UsabLinesPt-silinx.zip: the whole Silinx project (silinx.json + all project files, ${kb} KB).`];
  assert.deepEqual(await consoleLines(page, n), ['src/sheet.vhd gerado a partir de src/sheet.sch.json (todas as fontes têm o seu HDL)',
    "Nova fonte criada: Esquemático 'src/sheet.sch.json'.", 'Removidos do projeto src/sheet.sch.json e o seu ficheiro HDL src/sheet.vhd (os ficheiros ficam na pasta do projeto).',
    'Anular: Remover do Projeto.', 'Refazer: Remover do Projeto.', "Mudar o Nome: módulo 'alu' passou a chamar-se 'alu2' (2 ficheiro(s) atualizado(s)); src/alu.vhd → src/alu2.vhd.",
    `Exportado UsabLinesPt-silinx.zip: o projeto Silinx inteiro (silinx.json + todos os ficheiros do projeto, ${kb} KB).`]);
  // drawn again in English when the language changes
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(await consoleLines(page, n), english);
});
