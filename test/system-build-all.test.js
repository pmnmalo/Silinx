// A System built by its plan (#5489, server/system-plan.js, server/system-build-all.js): the uart-avr example's plan (its
// FPGA node not built, its Arduino's .hex given); Build All with a sketch in the Arduino's folder (arduino-cli's
// stand-in, test/fixtures/arduino-cli-stub): the FPGA node first, then the Arduino, their records written; built again,
// both up to date and skipped; a sketch changed, only its node built; the System's pins changed, only the FPGA's out of
// date; the refusals and their exact messages; a build at a time; an untrusted project's Arduino not compiled; the MCP's
// run_process build and check_system's plan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, waitJob, writeConfig, ROOT } from './server-helpers.js';
import { setBuildChannel } from '../core/build-channel.js';
import { planLine } from '../core/system-plan.js';

const STUB = path.join(ROOT, 'test/fixtures/arduino-cli-stub/arduino-cli');
const WIN = process.platform === 'win32' ? 'the stand-in for arduino-cli is a script run by its #! line, not on Windows' : false;
let tmp;
before(async () => { tmp = await scratchEnv('silinx-system-build-'); await writeConfig({ mode: 'silinx', paths: { 'arduino-cli': STUB } }); setBuildChannel('dev'); });
after(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));
const P = await import('../server/projects.js');
const jobs = await import('../server/jobs.js');
const { readBuildPlan } = await import('../server/system-plan.js');
const { startSystemBuild } = await import('../server/system-build-all.js');
const { TOOLS } = await import('../server/mcp.js');
const tool = n => TOOLS.find(t => t.name === n);

const SKETCH = 'void setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  Serial.println("hello");\n}\n';
const lines = async name => (await readBuildPlan(name)).nodes.map(planLine);
const run = async (name, node = '*') => waitJob(jobs, (await startSystemBuild(name, { node })).id, { timeoutMs: 600000 });
const FPGA_BUILT = 'fpga: up to date; built by the Silinx toolchain to build/nodes/fpga/build/uart.bit, programmed over JTAG';
const UNO = 'compiled by arduino-cli to uno/hello.hex, programmed by avrdude (arduino-cli upload)';
// (the job's own lines: its plan, its nodes' and its end; the toolchain's in between are the flows' own tests')
const own = j => j.lines.filter(l => /^(Build|  [a-z]+: |System node \w+: (building|built)|ERROR: System node)/.test(l));

test('#5489 the uart-avr example\'s plan: its FPGA node not built, its Arduino\'s .hex given; the refusals', { skip: WIN }, async () => {
  await P.createProject({ name: 'ex', template: 'uart-avr' });
  assert.deepEqual(await lines('ex'), [
    'fpga: not built (no build/nodes/fpga/build/uart.bit yet); built by the Silinx toolchain to build/nodes/fpga/build/uart.bit, programmed over JTAG',
    'uno: given (its firmware uno/hello.hex, no sketch to compile); its image uno/hello.hex, programmed by avrdude (arduino-cli upload)',
  ]);
  await assert.rejects(startSystemBuild('ex', { node: 'term' }), { status: 400, message: 'no node \'term\' to build in the System of \'ex\' (fpga, uno)' });
  await assert.rejects(startSystemBuild('ex', { node: 'uno' }), { status: 400, message: 'uno: nothing to build: given (its firmware uno/hello.hex, no sketch to compile); its image uno/hello.hex, programmed by avrdude (arduino-cli upload)' });
  await P.createProject({ name: 'bl', template: 'blinky' });
  await assert.rejects(readBuildPlan('bl'), { status: 400, message: 'the project \'bl\' has no System as its top: a build plan is a System\'s' });
  await assert.rejects(startSystemBuild('bl', { node: '*' }), { status: 400, message: 'the project \'bl\' has no System as its top: a build plan is a System\'s' });
});

test('#5489 Build All: the FPGA node first, then the Arduino\'s sketch; built again, up to date; a change rebuilds its node only', { skip: WIN, timeout: 900000 }, async () => {
  await P.createProject({ name: 'ua', template: 'uart-avr' });
  await P.writeFile('ua', 'uno/hello.ino', SKETCH);
  assert.deepEqual(await lines('ua'), [
    'fpga: not built (no build/nodes/fpga/build/uart.bit yet); built by the Silinx toolchain to build/nodes/fpga/build/uart.bit, programmed over JTAG',
    `uno: out of date (its last build left no record of its sources); ${UNO}`,
  ]);
  const s = await startSystemBuild('ua', { node: '*' });
  await assert.rejects(startSystemBuild('ua', { node: '*' }), { status: 409, message: `a build of 'ua' is already running (job ${s.id}); wait for it or cancel it` });
  const j = await waitJob(jobs, s.id, { timeoutMs: 600000 });
  assert.equal(j.status, 'ok', j.lines.join('\n'));
  assert.deepEqual(own(j), [
    'Build plan (the FPGA nodes first, then the microcontrollers):',
    '  fpga: not built (no build/nodes/fpga/build/uart.bit yet); built by the Silinx toolchain to build/nodes/fpga/build/uart.bit, programmed over JTAG',
    `  uno: out of date (its last build left no record of its sources); ${UNO}`,
    'System node fpga: building (not built).',
    'System node fpga: built, build/nodes/fpga/build/uart.bit.',
    'System node uno: building (out of date).',
    'System node uno: built, uno/hello.hex.',
    'Build: 2 node(s) built (fpga, uno), 0 failed, 0 left as they were.',
  ]);
  assert.deepEqual(j.lines.filter(l => /^(ERROR|WARNING)/.test(l)), [], 'no error, no warning');
  assert.deepEqual(j.result, { built: ['fpga', 'uno'], failed: [], skipped: [] });
  const rec = JSON.parse(fs.readFileSync(path.join(P.projectDir('ua'), 'build/nodes/uno/firmware/built-from.json'), 'utf8'));
  assert.deepEqual(rec.node, { kind: 'mcu', board: 'arduino-uno', firmware: 'uno/hello.hex', lang: 'c' });
  assert.deepEqual(Object.keys(rec.sources), ['uno/hello.ino']);
  assert.deepEqual(await lines('ua'), [FPGA_BUILT, `uno: up to date; ${UNO}`]);

  // built again: nothing to do
  const again = await run('ua');
  assert.equal(again.status, 'ok');
  assert.deepEqual(again.lines, [
    'Build plan (the FPGA nodes first, then the microcontrollers):', `  ${FPGA_BUILT}`, `  uno: up to date; ${UNO}`,
    'Build: 0 node(s) built, 0 failed, 2 left as they were (fpga, uno).',
  ]);

  // the sketch changed: its node alone
  await P.writeFile('ua', 'uno/hello.ino', SKETCH.replace('hello', 'hi'));
  assert.deepEqual(await lines('ua'), [FPGA_BUILT, `uno: out of date (uno/hello.ino changed since its last build); ${UNO}`]);
  const one = await run('ua');
  assert.deepEqual(own(one).slice(3), ['System node uno: building (out of date).', 'System node uno: built, uno/hello.hex.', 'Build: 1 node(s) built (uno), 0 failed, 1 left as they were (fpga).']);

  // a node's own Build: built up to date too
  const forced = await run('ua', 'uno');
  assert.deepEqual(forced.result, { built: ['uno'], failed: [], skipped: ['fpga'] });

  // the FPGA node's pins changed in the System: it alone out of date
  const file = path.join(P.projectDir('ua'), 'uart_avr.sys.json');
  const sys = JSON.parse(fs.readFileSync(file, 'utf8'));
  sys.nodes.find(n => n.id === 'fpga').pins.tx = 'B4';
  sys.nodes.find(n => n.id === 'uno').x = 333;   // (its place on the canvas: not its build's)
  fs.writeFileSync(file, JSON.stringify(sys, null, 2));
  assert.deepEqual(await lines('ua'), [
    'fpga: out of date (its pins changed since its last build); built by the Silinx toolchain to build/nodes/fpga/build/uart.bit, programmed over JTAG',
    `uno: up to date; ${UNO}`,
  ]);

  // MCP: check_system's plan, Build Plan's lines in its data
  const c = await tool('check_system').run({ project: 'ua', file: 'uart_avr.sys.json' });
  assert.deepEqual(c.data.plan.nodes.map(e => [e.id, e.state]), [['fpga', 'out of date'], ['uno', 'up to date']]);
  assert.deepEqual(c.data.plan.lines, ['Build plan (the FPGA nodes first, then the microcontrollers):',
    '  fpga: out of date (its pins changed since its last build); built by the Silinx toolchain to build/nodes/fpga/build/uart.bit, programmed over JTAG',
    `  uno: up to date; ${UNO}`]);
  assert.ok(!c.text.includes('Build plan'), 'its text Check System\'s');
});

test('#5489 MCP: run_process build (a node, or every one); its refusals; an untrusted project\'s Arduino not compiled', { skip: WIN }, async () => {
  await P.createProject({ name: 'mc', template: 'uart-avr' });
  await P.writeFile('mc', 'uno/hello.ino', SKETCH);
  const r = await tool('run_process').run({ project: 'mc', process: 'build', node: 'uno' });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.data.ok, true);
  assert.deepEqual(r.data.warnings, []);
  assert.deepEqual(r.data.errors, []);
  assert.ok(r.text.includes('Process "build" of <node uno> completed successfully (its nodes\' toolchains).'), r.text);
  assert.ok(r.data.log.includes('Build: 1 node(s) built (uno), 0 failed, 1 left as they were (fpga).'), r.data.log.join('\n'));
  await assert.rejects(tool('run_process').run({ project: 'mc', process: 'build', node: 'uno', toolchain: 'ise' }), { message: 'toolchain: a System is built by its nodes\' own (the Silinx toolchain, arduino-cli)' });
  await assert.rejects(tool('run_process').run({ project: 'mc', process: 'build', node: 'nope' }), { message: 'no node \'nope\' to build in the System of \'mc\' (fpga, uno)' });

  // (an untrusted project: its compiler not run, said; the node failed)
  await P.createProject({ name: 'un', template: 'uart-avr', madeBy: 'mcp' });
  await P.writeFile('un', 'uno/hello.ino', SKETCH);
  const u = await run('un', 'uno');
  assert.equal(u.status, 'error');
  assert.deepEqual(own(u).slice(3), [
    'System node uno: building (out of date).',
    'ERROR: System node uno: project \'un\' was made through the MCP server (by an assistant): arduino-cli runs only once you trust it (Trust Project, in the console when the project opens)',
    'Build: 0 node(s) built, 1 failed (uno), 1 left as they were (fpga).',
  ]);
});
