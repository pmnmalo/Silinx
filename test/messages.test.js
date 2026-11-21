// web/js/messages.js: the message centre of the Tasks interface (#798): the source of each Console line,
// read from the processes' headers, and the sources a filter or a task shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

globalThis.addEventListener ??= () => {};
const M = await import('../web/js/messages.js');

// the Console of a session with the pong example (the lines the app wrote, in order), each with its source
const SESSION = [
  ['Silinx 15.11.3 Project Navigator — HDL design, schematics, behavioural simulation and Xilinx FPGA implementation/programming.', 'app'],
  ['Toolchain: Silinx toolchain (no ISE): synthesis, place and route and bitstream by Silinx and Yosys.', 'app'],
  ['Programmers found: none (install openFPGALoader, xc3sprog, Digilent Adept or ISE iMPACT)', 'app'],
  ['Project "pong" opened (xc3s250e-4-cp132).', 'app'],
  ['', 'app'],
  ['Started : "Check Syntax".', 'check'],
  ['', 'check'],
  ['Analyzing Verilog file "src/debounce.v" into library work', 'check'],
  ['Elaborating top module <pong>: 49 signals, 19 processes.', 'check'],
  ['Process "Check Syntax" completed successfully', 'check'],
  ['Started : "Simulate Behavioral Model".', 'sim'],
  ['Building simulation model for top \'tb_pong\'...', 'sim'],
  ['Simulation model ready: 49 signals, 19 processes. Launching SSim view.', 'sim'],
  ['Started : "Behavioral Check Syntax".', 'check'],
  ['Process "Check Syntax" completed successfully', 'check'],
  ['Board Emulator: \'pong\' (RTL, compiled) on Digilent Basys2 — 27 port bit(s) on board resources.', 'emu'],
  ['Started : "Generate Programming File" (Silinx toolchain).', 'impl'],
  ['Silinx implementation with the Silinx toolchain (no ISE): pong top=pong device=xc3s250ecp132-4', 'impl'],
  ['=== SILINX STEP synth ===', 'impl'],
  ['Netlist: build/open/pong.json (1009 cells) in 3.6 s', 'impl'],
  ['=== SILINX STEP translate ===', 'impl'],
  ['=== SILINX STEP map ===', 'impl'],
  ['  Number of occupied Slices: 243 out of 2448 10%', 'impl'],
  ['=== SILINX STEP par ===', 'impl'],
  ['Routed 632 nets (4217 PIPs, 14 passes) in 0.7 s: build/open/routed.xdl', 'impl'],
  ['=== SILINX STEP bitgen ===', 'impl'],
  ['=== SILINX DONE ===', 'impl'],
  ['Process "Generate Programming File" completed successfully', 'impl'],
  ['Scanning JTAG chain...', 'impl'],
  ['Programming FPGA (SRAM)...', 'impl'],
  ['\'1\': Programmed successfully.', 'impl'],
  ['Programming XCF02S...', 'impl'],
  ['ERROR: Board Emulator: cannot build the design', 'emu'],
  ['Silinx 15.11.3 is up to date (latest release on GitHub: 15.11.3).', 'app'],   // (the update check, at any time)
];

test('sourceOf: each line of a session\'s Console is its process\'s (the lines after a header are its own)', () => {
  let cur = 'app';
  const got = SESSION.map(([line]) => (cur = M.sourceOf(line, cur)));
  assert.deepEqual(got, SESSION.map(([, src]) => src));
});

test('sourceOf: the processes\' headers', () => {
  const cases = {
    'Started : "Check Syntax" of src/pong.v.': 'check',
    'Started : "Check Constraints" of constraints/top.ucf.': 'impl',   // (a UCF's Check Syntax too, #2692)
    'Started : "Simulate Post-Place & Route Model".': 'sim',
    'Started : "Save as Test Bench".': 'sim',
    'Started : "C Simulation" of src/gcd.c.': 'sim',   // (#1852)
    'Started : "C/RTL Co-simulation" of src/gcd.c (VHDL).': 'sim',
    'Started : "View C Synthesis Report" of src/gcd.c.': 'impl',
    'Started : "Synthesize - XST".': 'impl',
    'Started : "Synthesize - Yosys (open)".': 'impl',
    'Started : "Implement Design".': 'impl',
    'Started : "Check Design".': 'check',   // (a design and simulation project's Check Syntax, #4716)
    'Started : "Check Schematic" of gates.': 'check',   // (a schematic's, in the Tasks interface: #993)
    'Started : "Validate" of ctl.asm.json.': 'check',   // (a chart's, #2730)
    'Started : "Check State Diagram" of ctl.fsm.json.': 'check',   // (#2803)
    'Started : "Check Petri Net" of ctl.pn.json.': 'check',
    'Started : "Check Circuit" of half_adder.circ.json.': 'check',   // (a circuit's, #3897)
    'Started : "Validate Design Rules".': 'impl',
    'Started : "Translate".': 'impl',
    'Started : "Generate Post-Synthesis Simulation Model".': 'impl',
    'Started : "Generate Text Power Report".': 'impl',
    'Started : "Back-annotate Pin Locations".': 'impl',
    '=== SILINX STEP fpgaview ===': 'impl',
    'Verifying XCF04S...': 'impl',
    'Erasing XCF02S...': 'impl',
    'Backing up XCF02S...': 'impl',
    'Reloading the FPGA from the PROM...': 'impl',
  };
  for (const [line, src] of Object.entries(cases)) assert.equal(M.sourceOf(line, 'app'), src, line);
  // not headers: the current source goes on
  for (const line of ['Programming a board needs a cable', 'Started the job', 'Board Emulator help', '  Started : "x"']) assert.equal(M.sourceOf(line, 'sim'), line.trim().startsWith('Started : "') ? 'app' : 'sim', line);   // (an unknown process: the application's, #4729)
  assert.equal(M.sourceOf('anything'), 'app');
});

// (#1173: synthesis, implementation and the board's lines one filter, Implementation; Emulation)
test('filterSources: a picked filter, All, or the task\'s own sources (Implement: Implementation)', () => {
  assert.deepEqual(M.SOURCES, ['check', 'sim', 'emu', 'impl']);
  assert.deepEqual(['all', ...M.SOURCES].map((s) => M.SOURCE_LABEL[s]), ['All', 'Design', 'Simulation', 'Emulation', 'Implementation']);
  assert.equal(M.filterSources('all', 'sim'), null);
  assert.deepEqual(M.filterSources('emu', 'sim'), ['emu']);
  assert.deepEqual(M.filterSources(null, 'edit'), ['check']);
  assert.deepEqual(M.filterSources(null, 'sim'), ['sim']);
  assert.deepEqual(M.filterSources(null, 'emu'), ['emu']);
  assert.deepEqual(M.filterSources(null, 'impl'), ['impl']);
  assert.deepEqual(M.filterSources(null, 'prog'), ['impl']);
  assert.equal(M.filterSources('bogus', 'nothing'), null);
});

test('#1852 filterForProcess: a process started whose source the viewer\'s filter hides turns it to its source; one shown, or the task\'s filter, left', () => {
  assert.equal(M.filterForProcess('sim', 'check', null), 'sim');   // (Design picked: a C Simulation shown)
  assert.equal(M.filterForProcess('impl', 'sim', 'impl'), 'impl');
  assert.equal(M.filterForProcess('check', null, 'emu'), null);    // (the task's filter stays the task's: a Check Syntax while emulating)
  assert.equal(M.filterForProcess('sim', 'all', null), 'all');
  assert.equal(M.filterForProcess('sim', null, null), null);       // (no task, nothing picked: every source)
  assert.equal(M.filterForProcess('check', 'check', 'sim'), 'check');
});

test('#2262 filterForCommand: a command the viewer runs turns the filter that hides its source, the task\'s too; one shown, or every source, left', () => {
  assert.equal(M.filterForCommand('sim', null, 'edit'), 'sim');    // (the Edit task's filter: a C Simulation shown)
  assert.equal(M.filterForCommand('impl', null, 'edit'), 'impl');  // (View C Synthesis Report)
  assert.equal(M.filterForCommand('sim', 'check', 'edit'), 'sim');
  assert.equal(M.filterForCommand('sim', 'impl', null), 'sim');
  assert.equal(M.filterForCommand('sim', null, 'sim'), null);      // (the task's filter shows it: it stays the task's)
  assert.equal(M.filterForCommand('sim', 'sim', 'edit'), 'sim');
  assert.equal(M.filterForCommand('sim', 'all', 'edit'), 'all');
  assert.equal(M.filterForCommand('sim', null, null), null);       // (no task, nothing picked: every source)
});

// #4729: every process's header, by the modules that write one, and the source it gives its lines: a new producer is
// found by its "Started : " and fails here until its process is listed with the source it is meant to have
const { EXTRA_STEPS, SYNTH_OPEN } = await import('../web/js/tool-descriptors.js');
const { VERIFY_PROCESS } = await import('../core/verify.js');
const { PROPERTY_PROCESS } = await import('../core/verify-props.js');
const { ASSERT_PROCESS } = await import('../core/verify-assert.js');
const PRODUCERS = {
  'web/js/c-source.js': { 'C Simulation': 'sim', 'C/RTL Co-simulation': 'sim', 'View C Synthesis Report': 'impl' },
  'web/js/exercise-view.js': { 'Run Visible Tests': 'check', 'Run All Tests': 'check' },   // (an exercise's tests: Design's)
  'web/js/lab-view.js': { 'Check Syntax': 'check' },
  // (checkLines: a drawing's Check or Validate, a schematic's Try it refused: Design's, as its comment says)
  'web/js/tasks-check.js': { 'Check Schematic': 'check', 'Try it': 'check', 'Validate': 'check', 'Check State Diagram': 'check', 'Check Petri Net': 'check', 'Check Circuit': 'check' },
  'web/js/processes.js': { 'Check Syntax': 'check', 'Behavioral Check Syntax': 'check', 'Check Design': 'check' },
  'web/js/viewers.js': { 'Simulate Behavioral Model': 'sim', 'Simulate Post-Place & Route Model': 'sim', 'Simulate Post-Synthesis Model': 'sim' },
  'web/js/implement.js': { 'Check Constraints': 'impl', 'Synthesize - XST': 'impl', 'Synthesize - Vivado': 'impl', [SYNTH_OPEN]: 'impl',
    'Implement Design': 'impl', 'Generate Programming File': 'impl', ...Object.fromEntries(Object.values(EXTRA_STEPS).map((p) => [p, 'impl'])) },
  // (Verify: the Simulation view's processes)
  'core/verify.js': { [VERIFY_PROCESS]: 'sim' }, 'core/verify-props.js': { [PROPERTY_PROCESS]: 'sim' }, 'core/verify-assert.js': { [ASSERT_PROCESS]: 'sim' },
};
const ROOT = new URL('../', import.meta.url);
const producersFound = () => ['web/js', 'core'].flatMap((d) => readdirSync(new URL(`${d}/`, ROOT)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`))
  // (messages.js and console.js read the headers, #4728: console.js's runs, they write none but startRun's; a run's
  // writer states its source, #4749)
  .filter((f) => !['web/js/messages.js', 'web/js/console.js'].includes(f) && /Started : \\?"|\bstartRun\(\{/.test(readFileSync(new URL(f, ROOT), 'utf8'))).sort();

test('#4729 every module writing a process\'s header is known, and each of its processes has its intended source', () => {
  assert.deepEqual(producersFound(), Object.keys(PRODUCERS).sort());
  for (const [file, procs] of Object.entries(PRODUCERS)) {
    for (const [proc, src] of Object.entries(procs)) assert.equal(M.sourceOf(`Started : "${proc}" of x.`, 'impl'), src, `${file}: ${proc}`);
  }
  assert.equal(VERIFY_PROCESS, 'Verify Equivalence');
});

test('#4729 an unknown process is the application\'s, never Implementation\'s', () => {
  for (const p of ['Something New', 'Grade', 'Lab Step']) assert.equal(M.sourceOf(`Started : "${p}".`, 'impl'), 'app', p);
});

test('#4729 lineSource: the lines after a process\'s result are the application\'s until the next header', () => {
  const LOG = [
    ['Started : "Simulate Behavioral Model".', 'sim'],
    ['Building simulation model for top \'tb\'...', 'sim'],
    ['Process "Simulate Behavioral Model" failed', 'sim'],
    ['INFO: No quick fix here.', 'app'],                       // (a refusal after it: not the simulation's)
    ['Started : "Try it" of gates.', 'check'],
    ['ERROR: the schematic has an unconnected input', 'check'],
    ['Process "Try it" failed', 'check'],
    ['Changed by an agent: src/top.vhd', 'app'],
    ['Started : "Synthesize - XST".', 'impl'],
    ['WARNING:Xst:647 - Input <sw> is never used.', 'impl'],
    ['Process failed: see log', 'impl'],
    ['Merge Contribution: nothing differs.', 'app'],
    ['Board Emulator: \'pong\' on Digilent Basys2', 'emu'],
    ['Project "pong" opened (xc3s250e-4-cp132).', 'app'],
    ['Started : "Generate Programming File".', 'impl'],
    ['Process "Generate Programming File" completed successfully', 'impl'],
    ['Scanning JTAG chain...', 'impl'],
    ['\'1\': Programmed successfully.', 'impl'],
  ];
  let cur = 'app';
  const got = LOG.map(([line]) => { let src; [src, cur] = M.lineSource(line, cur); return src; });
  assert.deepEqual(got, LOG.map(([, src]) => src));
  assert.deepEqual(M.lineSource('Process "Check Syntax" stopped by the user', 'check'), ['check', 'app']);
  assert.deepEqual(M.lineSource('a line', 'sim'), ['sim', 'sim']);
});

test('#4729 isShown: the application\'s lines under every filter and task; the others under theirs only', () => {
  for (const task of [null, 'edit', 'sim', 'emu', 'impl', 'prog']) {
    for (const filter of [null, 'all', ...M.SOURCES]) {
      const set = M.filterSources(filter, task);
      assert.equal(M.isShown(set, 'app'), true, `${filter} ${task}`);
      for (const src of M.SOURCES) assert.equal(M.isShown(set, src), !set || set.includes(src), `${src} ${filter} ${task}`);
    }
  }
});

test('#4749 the messages\' sources (core/message.js) are the filters\' and the application\'s', async () => {
  const { MESSAGE_SOURCES } = await import('../core/message.js');
  assert.deepEqual(MESSAGE_SOURCES, [...M.SOURCES, 'app']);
});

test('#4729 the application\'s own messages state their source: logError / logWarning / logInfo, appLog, the trust notice; mirrored lines their own', () => {
  const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
  const con = read('web/js/console.js');
  for (const [fn, cls] of [['logError', 'err'], ['logWarning', 'warn'], ['logInfo', 'info']]) {
    assert.match(con, new RegExp(`export function ${fn}\\(text\\) \\{\\n  log\\(\`[A-Z]+: \\$\\{t\\(text\\)\\}\`, '${cls}', \\{ src: 'app' \\}\\);`), fn);
  }
 // (a command's failure, warning, information, #4747: the application's too)
  assert.match(con, /function commandLines\(tag, cls, title, message\) \{\n[^\n]*\n[^\n]*log\([^\n]*, cls, \{ src: 'app' \}\);\n\}/);
  assert.match(con, /export const appLog = \(text, cls = '', opts = \{\}\) => log\(text, cls, \{ \.\.\.opts, src: 'app' \}\);/);
  assert.match(read('web/js/project.js'), /appLog\(untrustedNotice\(name, S\.project\), 'info', \{ action: trustAction\(name\) \}\)/);
  // the modules of the application's own lines, whatever ran last; the logic analyzer's: Implementation's
  for (const f of ['project-watch.js', 'storage-late.js']) assert.match(read(`web/js/${f}`), /import \{ appLog as log/, f);
  for (const f of ['link-hash.js', 'project-zip-dialogs.js', 'wizards.js']) {
    const src = read(`web/js/${f}`);
    assert.doesNotMatch(src, /\bapp\.log\(/, f);
    assert.match(src, /import \{ appLog(, \w+)* \} from '\.\/console\.js';/, f);
  }
  assert.match(read('web/js/capture-ui.js'), /const log = \(text, cls = '', opts = \{\}\) => consoleLog\(text, cls, \{ \.\.\.opts, src: 'impl' \}\);/);
  assert.match(read('web/js/messages.js'), /app\.log\(text, cls, \{ diag: false, src \}\);/);
});
