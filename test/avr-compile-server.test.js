// A System's Arduino node's firmware compiled by the local server (#5503, server/avr-compile.js): arduino-cli found (its
// path in config.json, a stand-in for it: test/fixtures/arduino-cli-stub) or not, its AVR core installed or not; the
// uart-avr example's uno node's sketch compiled to its .hex (its folder, the node's firmware; set when it had none), the
// job's exact lines (the compiler's errors and warnings by the project's file and line, no warning when there is none);
// the refusals; the MCP's run_process firmware and toolchain_info. With the real arduino-cli and its core, a sketch
// compiled and its .hex read as the Board Emulator reads it (skipped, said why, when they are not on this computer).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, waitJob, writeConfig, ROOT } from './server-helpers.js';
import { readSystem, writeSystem } from '../core/system-doc.js';
import { readFirmware } from '../core/avr-firmware.js';

const STUB = path.join(ROOT, 'test/fixtures/arduino-cli-stub/arduino-cli');
const WIN = process.platform === 'win32' ? 'the stand-in for arduino-cli is a script run by its #! line, not on Windows' : false;
let tmp;
before(async () => { tmp = await scratchEnv('silinx-avr-compile-'); await writeConfig({ mode: 'silinx', paths: { 'arduino-cli': STUB } }); });
after(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));
const P = await import('../server/projects.js');
const jobs = await import('../server/jobs.js');
const { startFirmwareCompile, detectAvrCompiler } = await import('../server/avr-compile.js');
const { TOOLS } = await import('../server/mcp.js');
const tool = n => TOOLS.find(t => t.name === n);

const SKETCH = 'void setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  Serial.println("hello");\n}\n';
let made = 0;
async function project(files = { 'uno/hello.ino': SKETCH }) {
  const name = `ua${++made}`;
  await P.createProject({ name, template: 'uart-avr' });
  for (const [f, t] of Object.entries(files)) await P.writeFile(name, f, t);
  return name;
}
const run = async (name, node = 'uno') => waitJob(jobs, (await startFirmwareCompile(name, { node })).id);
const hexOf = (name, f) => fs.readFileSync(path.join(P.projectDir(name), f), 'utf8');

test('#5503 the compiler found: arduino-cli\'s version and its AVR core\'s; without its core, or not found, said why', { skip: WIN }, async () => {
  assert.deepEqual(await detectAvrCompiler(), { available: true, path: STUB, version: '1.6.0', core: '1.8.6', reason: 'arduino-cli 1.6.0 with the Arduino AVR core 1.8.6' });
  process.env.STUB_NO_CORE = '1';
  try {
    assert.deepEqual(await detectAvrCompiler(), { available: false, path: STUB, version: '1.6.0', core: null, reason: 'arduino-cli 1.6.0 found, without its Arduino AVR core (arduino-cli core install arduino:avr)' });
    const name = await project();
    await assert.rejects(startFirmwareCompile(name, { node: 'uno' }), { message: 'Compile Firmware needs arduino-cli on the local server: arduino-cli 1.6.0 found, without its Arduino AVR core (arduino-cli core install arduino:avr)' });
  } finally { delete process.env.STUB_NO_CORE; }
  assert.deepEqual(await detectAvrCompiler({ paths: { 'arduino-cli': path.join(tmp, 'none') } }),
    { available: false, path: null, version: null, core: null, reason: 'arduino-cli not found (install it and its Arduino AVR core: arduino-cli core install arduino:avr)' });
});

test('#5503 the uno node\'s sketch compiled: its .hex the node\'s firmware, its lines exact, no warning; built in build/nodes/uno/firmware/', { skip: WIN }, async () => {
  const name = await project();
  const j = await run(name);
  assert.equal(j.status, 'ok', j.lines.join('\n'));
  assert.deepEqual(j.lines, [
    'System node uno: its sketch uno/hello.ino (1 file(s) of uno/) for arduino-uno (arduino:avr:uno), by arduino-cli, in build/nodes/uno/firmware/.',
    'System node uno: its firmware uno/hello.hex, 2 bytes of the flash.',
  ]);
  assert.equal(hexOf(name, 'uno/hello.hex'), ':02000000FFCF30\n:00000001FF\n', 'the example\'s hello.hex replaced by the sketch\'s');
  assert.deepEqual([...readFirmware('uno/hello.hex', hexOf(name, 'uno/hello.hex')).program.slice(0, 1)], [0xcfff]);
  const dir = path.join(P.projectDir(name), 'build/nodes/uno/firmware');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'args.json'), 'utf8')),
    ['compile', '--fqbn', 'arduino:avr:uno', '--warnings', 'default', '--build-path', path.join(dir, 'build'), '--output-dir', path.join(dir, 'out'), path.join(dir, 'hello')]);
  assert.equal(fs.readFileSync(path.join(dir, 'hello/hello.ino'), 'utf8'), SKETCH, 'the node\'s folder copied as a sketch');
  assert.deepEqual(j.result, { nodes: [{ node: 'uno', hex: 'uno/hello.hex', size: 2, warnings: 0, set: false }] });
});

test('#5503 the compiler\'s errors and warnings: the job\'s ERROR and WARNING lines by the project\'s file, line and column; no .hex written', { skip: WIN }, async () => {
  const name = await project({ 'uno/hello.ino': '#warning check the baud\nvoid setup() {}\n', 'uno/lib/util.cpp': 'int f() {\n  #error no f yet\n}\n' });
  const before = hexOf(name, 'uno/hello.hex');
  const j = await run(name);
  assert.equal(j.status, 'error');
  assert.deepEqual(j.lines, [
    'System node uno: its sketch uno/hello.ino (2 file(s) of uno/) for arduino-uno (arduino:avr:uno), by arduino-cli, in build/nodes/uno/firmware/.',
    'ERROR: uno/lib/util.cpp:2:4: #error no f yet',
    'WARNING: uno/hello.ino:1:2: #warning check the baud',
    'ERROR: System node uno: uno: its sketch did not compile (1 error(s), 1 warning(s))',
    'ERROR: the System node(s) uno failed',
  ]);
  assert.equal(hexOf(name, 'uno/hello.hex'), before, 'the node\'s firmware as it was');
  // (warnings only: compiled, its warnings said)
  const w = await project({ 'uno/hello.ino': '#warning check the baud\nvoid setup() {}\n' });
  const jw = await run(w);
  assert.equal(jw.status, 'ok');
  assert.deepEqual(jw.lines.filter(l => /^(ERROR|WARNING)/.test(l)), ['WARNING: uno/hello.ino:1:2: #warning check the baud']);
});

test('#5503 a node with no firmware gets the one made: its System document written', { skip: WIN }, async () => {
  const name = await project({ 'uno/blink.ino': SKETCH });
  const file = 'uart_avr.sys.json';
  const sys = readSystem(await P.readFile(name, file)).system;
  sys.nodes.find(n => n.id === 'uno').firmware = null;
  await P.writeFile(name, file, writeSystem(sys));
  const j = await run(name);
  assert.equal(j.status, 'ok', j.lines.join('\n'));
  assert.deepEqual(j.lines.slice(-2), ['System node uno: its firmware uno/blink.hex, 2 bytes of the flash.', 'System node uno: its firmware set to uno/blink.hex in uart_avr.sys.json.']);
  assert.equal(readSystem(await P.readFile(name, file)).system.nodes.find(n => n.id === 'uno').firmware, 'uno/blink.hex');
});

test('#5503 the refusals: an FPGA node, no such node, no sketch, a project with no System as its top', { skip: WIN }, async () => {
  const name = await project({});
  await assert.rejects(startFirmwareCompile(name, { node: 'fpga' }), { message: 'fpga: a firmware is compiled for a microcontroller node (this one is fpga)' });
  await assert.rejects(startFirmwareCompile(name, { node: 'nano' }), { message: `no node 'nano' in the System of '${name}' (its microcontroller nodes: uno)` });
  const j = await run(name);
  assert.equal(j.status, 'error');
  assert.deepEqual(j.lines, ['ERROR: System node uno: uno: no sketch in its folder uno/ (an .ino: write one, or draw its program)', 'ERROR: the System node(s) uno failed']);
  await P.createProject({ name: 'plain', template: 'blinky' });
  await assert.rejects(startFirmwareCompile('plain', { node: 'uno' }), { message: 'the project \'plain\' has no System as its top: a firmware is compiled for a System\'s microcontroller node' });
});

test('#5503 MCP: run_process firmware, its errors, warnings and locations as the console\'s; its refusals; toolchain_info says arduino-cli', { skip: WIN }, async () => {
  const name = await project({ 'uno/hello.ino': '#warning check the baud\nvoid setup() {}\n' });
  const r = await tool('run_process').run({ project: name, process: 'firmware', node: 'uno' });
  assert.equal(r.isError, false);
  assert.ok(r.text.includes('Process "firmware" of <node uno> completed successfully with 1 warning(s) (arduino-cli).'), r.text);
  assert.deepEqual([r.data.toolchain, r.data.ok, r.data.errors, r.data.warnings], ['arduino', true, [], ['WARNING: uno/hello.ino:1:2: #warning check the baud']]);
  assert.deepEqual(r.data.locations, [{ severity: 'warning', text: 'WARNING: uno/hello.ino:1:2: #warning check the baud', file: 'uno/hello.ino', line: 1, col: 2 }]);
  await P.writeFile(name, 'uno/hello.ino', 'void setup() {\n#error nope\n}\n');
  const e = await tool('run_process').run({ project: name, process: 'firmware', node: 'uno' });
  assert.equal(e.isError, true);
  assert.deepEqual(e.data.errors, ['ERROR: uno/hello.ino:2:2: #error nope', 'ERROR: System node uno: uno: its sketch did not compile (1 error(s), 0 warning(s))', 'ERROR: the System node(s) uno failed']);
  assert.deepEqual(e.data.warnings, []);
  const refused = async (args, message) => assert.rejects(tool('run_process').run({ project: name, process: 'firmware', ...args }), { message });
  await refused({}, 'node: the firmware process compiles a System microcontroller node\'s firmware (its id, or * every Arduino and PIC24 node)');
  await refused({ node: 'uno', toolchain: 'ise' }, 'toolchain: a firmware is compiled by arduino-cli or XC16 (no toolchain to choose)');
  await refused({ node: 'fpga' }, 'fpga: a firmware is compiled for a microcontroller node (this one is fpga)');
  const t = await tool('toolchain_info').run({});
  assert.equal(t.text.split('\n')[2], 'Arduino (Compile Firmware): available: arduino-cli 1.6.0 with the Arduino AVR core 1.8.6.');
  assert.deepEqual(t.data.arduino, { available: true, version: '1.6.0', core: '1.8.6', reason: 'arduino-cli 1.6.0 with the Arduino AVR core 1.8.6' });
});

// the real arduino-cli and its AVR core, when this computer has them (config.json's path none: PATH's)
const real = await detectAvrCompiler({});
test('#5503 the real arduino-cli: a sketch compiled, its .hex read as the Board Emulator reads it', { skip: !real.available && `no arduino-cli with its AVR core here (${real.reason})`, timeout: 300000 }, async () => {
  await writeConfig({ mode: 'silinx' });
  try {
    const name = await project();
    const j = await waitJob(jobs, (await startFirmwareCompile(name, { node: 'uno' })).id, { timeoutMs: 280000 });
    assert.equal(j.status, 'ok', j.lines.join('\n'));
    assert.deepEqual(j.lines.filter(l => /^(ERROR|WARNING)/.test(l)), [], 'no warning');
    const fw = readFirmware('uno/hello.hex', hexOf(name, 'uno/hello.hex'));
    assert.ok(!fw.error && fw.size > 1000, `a program of the flash (${fw.size} bytes)`);
    await P.writeFile(name, 'uno/hello.ino', 'void setup() {\n  int unused = 1;\n  digitalWrit(13, HIGH);\n}\nvoid loop() {}\n');
    const e = await waitJob(jobs, (await startFirmwareCompile(name, { node: 'uno' })).id, { timeoutMs: 280000 });
    assert.equal(e.status, 'error');
    assert.ok(e.lines.some(l => /^ERROR: uno\/hello\.ino:3:3: 'digitalWrit' was not declared in this scope/.test(l)), e.lines.join('\n'));
    // (#5486's generated C: a state diagram drawn in the uno node, its C uno/traffic.c and the node's sketch uno/uno.ino
    // calling it, compiled)
    const d = await project({});
    const fsm = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8'));
    delete fsm.generatedFile;
    await tool('write_file').run({ project: d, path: 'uno/traffic.fsm.json', text: JSON.stringify(fsm, null, 2) });
    const g = await waitJob(jobs, (await startFirmwareCompile(d, { node: 'uno' })).id, { timeoutMs: 280000 });
    assert.equal(g.status, 'ok', g.lines.join('\n'));
    assert.deepEqual(g.lines.filter(l => /^(ERROR|WARNING)/.test(l)), [], 'no warning');
    assert.equal(g.lines[0], 'System node uno: its sketch uno/uno.ino (2 file(s) of uno/) for arduino-uno (arduino:avr:uno), by arduino-cli, in build/nodes/uno/firmware/.');
    assert.ok(!readFirmware('uno/hello.hex', hexOf(d, 'uno/hello.hex')).error);
  } finally { await writeConfig({ mode: 'silinx', paths: { 'arduino-cli': STUB } }); }
});

test('#5561 the real arduino-cli: uart-avr\'s hello.ino compiled, its Serial read by the FPGA and echoed byte for byte; no warning', { skip: !real.available && `no arduino-cli with its AVR core here (${real.reason})`, timeout: 300000 }, async () => {
  await writeConfig({ mode: 'silinx' });
  try {
    // (the Arduino core's start-up before Serial.begin: D1 an input for about 100 µs, the line at rest high)
    const name = await project({ 'uno/hello.ino': 'int count = 0;\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  Serial.print("hello ");\n  Serial.println(count++);\n  delay(1000);\n}\n' });
    const j = await waitJob(jobs, (await startFirmwareCompile(name, { node: 'uno' })).id, { timeoutMs: 280000 });
    assert.equal(j.status, 'ok', j.lines.join('\n'));
    assert.deepEqual(j.lines.filter(l => /^(ERROR|WARNING)/.test(l)), [], 'no warning');
    const r = await tool('simulate').run({ project: name, time_ns: 20e6 });
    const text = w => String.fromCharCode(...r.data.traffic.find(t => t.wire === w).bytes.map(b => b.byte));
    assert.equal(text('serial_uno'), 'hello 0\r\n');
    assert.equal(text('serial_fpga'), 'hello 0\r\n', 'the FPGA\'s echo: no byte misread while D1 was an input');
    assert.deepEqual([r.data.warnings, r.data.errors], [[], []]);
  } finally { await writeConfig({ mode: 'silinx', paths: { 'arduino-cli': STUB } }); }
});
