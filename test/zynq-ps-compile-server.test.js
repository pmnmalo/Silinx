// A Zynq board's PS program compiled by the local server (#4687, part 1; server/zynq-ps-compile.js): arm-none-eabi-gcc
// found (config.json's path: a stand-in for it, test/fixtures/arm-gcc-stub) or not; a Board project's ps/ and a System
// node's compiled to their ELF in their build folders (Silinx's startup and linker script beside the sources), the job's
// exact lines (the compiler's errors and warnings by the project's file and line, none when there is none, the OCM
// overflowed); the refusals; the MCP's run_process ps and toolchain_info.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, waitJob, writeConfig, ROOT } from './server-helpers.js';
import { PS_LINKER_SCRIPT, PS_STARTUP } from '../core/zynq-ps-compile.js';

const STUB = path.join(ROOT, 'test/fixtures/arm-gcc-stub/arm-none-eabi-gcc');
const WIN = process.platform === 'win32' ? 'the stand-in for arm-none-eabi-gcc is a script run by its #! line, not on Windows' : false;
let tmp;
before(async () => { tmp = await scratchEnv('silinx-ps-compile-'); await writeConfig({ mode: 'silinx', paths: { 'arm-none-eabi-gcc': STUB } }); });
after(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));
const P = await import('../server/projects.js');
const jobs = await import('../server/jobs.js');
const { startPsCompile, detectArmGcc, armGccPath } = await import('../server/zynq-ps-compile.js');
const { TOOLS } = await import('../server/mcp.js');
const tool = (n) => TOOLS.find((t) => t.name === n);

const MAIN = 'int main(void) { for (;;) { } }\n';
const FLAGS = ['-mcpu=cortex-a9', '-marm', '-mfloat-abi=soft', '-O2', '-g', '-Wall', '-ffreestanding', '-nostartfiles', '--specs=nosys.specs'];
let made = 0;
async function boardProject(files = { 'ps/main.c': MAIN }, board = 'zybo-z7') {
  const name = `zb${++made}`;
  await P.createProject({ name, template: 'empty', board });
  for (const [f, t] of Object.entries(files)) await P.writeFile(name, f, t);
  return name;
}
const SYS = { format: 'silinx-system', version: 2, name: 'zynq', nodes: [
  { id: 'zybo', kind: 'fpga', module: 'uart', board: 'zybo-z7', variant: '20', ps: 'zybo/ps/main.c', interfaces: [], x: 0, y: 0 },
  { id: 'b2', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', interfaces: [], x: 300, y: 0 },
], links: [] };
async function systemProject(files = { 'zybo/ps/main.c': MAIN }) {
  const name = `zs${++made}`;
  await P.createProject({ name, template: 'uart' });
  await P.writeFile(name, 'zynq.sys.json', JSON.stringify(SYS, null, 2));
  for (const [f, t] of Object.entries(files)) await P.writeFile(name, f, t);
  await P.updateProject(name, (p) => ({ ...p, kind: 'system', board: null, constraints: null, top: null }));
  return name;
}
const run = async (name, node) => waitJob(jobs, (await startPsCompile(name, node === undefined ? {} : { node })).id);
const at = (name, f) => path.join(P.projectDir(name), f);

test('#4687 the compiler found: arm-none-eabi-gcc\'s version; not found, said why; Arm\'s installer\'s folder', { skip: WIN }, async () => {
  assert.deepEqual(await detectArmGcc(), { available: true, path: STUB, version: '14.2.1', reason: 'arm-none-eabi-gcc 14.2.1 found' });
  assert.deepEqual(await detectArmGcc({ paths: { 'arm-none-eabi-gcc': path.join(tmp, 'none') } }),
    { available: false, path: null, version: null, reason: 'arm-none-eabi-gcc not found (the Arm GNU Toolchain: on the PATH or in config.json\'s paths[\'arm-none-eabi-gcc\'])' });
  const apps = path.join(tmp, 'ArmGNUToolchain'), bin = path.join(apps, '14.2.rel1', 'arm-none-eabi', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.copyFileSync(STUB, path.join(bin, 'arm-none-eabi-gcc')); fs.chmodSync(path.join(bin, 'arm-none-eabi-gcc'), 0o755);
  const found = armGccPath({}, { apps });
  assert.ok(found === path.join(bin, 'arm-none-eabi-gcc') || /arm-none-eabi-gcc$/.test(found || ''), String(found));
});

test('#4687 a Board project on the Zybo Z7: its ps/ compiled to build/ps/out/ps.elf with Silinx\'s startup and linker script; its lines exact, no warning', { skip: WIN }, async () => {
  const name = await boardProject({ 'ps/main.c': MAIN, 'ps/uart.h': '#define X 1\n', 'ps/lib/util.c': 'int util(void) { return 1; }\n' });
  const j = await run(name);
  assert.equal(j.status, 'ok', j.lines.join('\n'));
  assert.deepEqual(j.lines, [
    'The project: its PS program (2 C and assembly file(s) of ps/) for the Cortex-A9, by arm-none-eabi-gcc, with Silinx\'s startup code and Silinx\'s linker script (the on-chip memory), in build/ps/.',
    'The project: its PS program build/ps/out/ps.elf, 8 bytes loaded in the on-chip memory (16392 of its 192 KB used, its .bss and stack included), its entry 0x00000000.',
  ]);
  assert.deepEqual(j.result, { node: null, elf: 'build/ps/out/ps.elf', entry: 0, size: 8, memsz: 16392, warnings: 0 });
  const dir = at(name, 'build/ps');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'args.json'), 'utf8')), [...FLAGS, '-T', 'silinx/ps.ld', 'silinx/startup.S', 'src/lib/util.c', 'src/main.c', '-o', 'out/ps.elf', '-Wl,-Map=out/ps.map']);
  assert.deepEqual([fs.readFileSync(path.join(dir, 'silinx/startup.S'), 'utf8'), fs.readFileSync(path.join(dir, 'silinx/ps.ld'), 'utf8'), fs.readFileSync(path.join(dir, 'src/uart.h'), 'utf8')], [PS_STARTUP, PS_LINKER_SCRIPT, '#define X 1\n']);
});

test('#4687 a System\'s Zynq node: its zybo/ps/ compiled to build/nodes/zybo/ps/out/zybo.elf; the user\'s linker script and startup in place of Silinx\'s', { skip: WIN }, async () => {
  const name = await systemProject({ 'zybo/ps/main.c': MAIN, 'zybo/ps/startup.S': '  .global _start\n_start: b .\n', 'zybo/ps/mine.ld': 'ENTRY(_start)\n' });
  const j = await run(name, 'zybo');
  assert.equal(j.status, 'ok', j.lines.join('\n'));
  assert.deepEqual(j.lines, [
    'System node zybo: its PS program (2 C and assembly file(s) of zybo/ps/) for the Cortex-A9, by arm-none-eabi-gcc, with its zybo/ps/startup.S and its zybo/ps/mine.ld, in build/nodes/zybo/ps/.',
    'System node zybo: its PS program build/nodes/zybo/ps/out/zybo.elf, 8 bytes loaded in the on-chip memory (16392 of its 192 KB used, its .bss and stack included), its entry 0x00000000.',
  ]);
  assert.deepEqual(JSON.parse(fs.readFileSync(at(name, 'build/nodes/zybo/ps/args.json'), 'utf8')).slice(FLAGS.length), ['-T', 'src/mine.ld', 'src/main.c', 'src/startup.S', '-o', 'out/zybo.elf', '-Wl,-Map=out/zybo.map']);
});

test('#4687 the compiler\'s errors and warnings by the project\'s file; the OCM overflowed; an ELF outside the OCM refused', { skip: WIN }, async () => {
  const name = await boardProject({ 'ps/main.c': '#warning check the clock\nint main(void) {\n  #error not yet\n}\n' });
  const j = await run(name);
  assert.equal(j.status, 'error');
  assert.deepEqual(j.lines.slice(1), ['ERROR: ps/main.c:3:4: #error not yet', 'WARNING: ps/main.c:1:2: #warning check the clock', 'ERROR: its PS program did not compile (1 error(s), 1 warning(s))']);
  await P.writeFile(name, 'ps/main.c', MAIN);
  process.env.STUB_OVERFLOW = '1200';
  try {
    const o = await run(name);
    assert.deepEqual(o.lines.slice(1), ['ERROR: collect2: error: ld returned 1 exit status',
      'ERROR: the program does not fit in the on-chip memory\'s 192 KB (its stack\'s 16 KB included): 1200 bytes too many', 'ERROR: its PS program did not compile (2 error(s), 0 warning(s))']);
  } finally { delete process.env.STUB_OVERFLOW; }
  process.env.STUB_ADDR = String(0x00100000);
  try {
    const d = await run(name);
    assert.deepEqual(d.lines.slice(1), ['ERROR: its ELF: a segment at 0x00100000–0x00100007, outside the on-chip memory\'s 0x00000000–0x0002FFFF (its linker script)']);
  } finally { delete process.env.STUB_ADDR; }
});

test('#4687 the refusals: no node in a System, a node in a Board project, a board with no PS, no C, untrusted, no compiler', { skip: WIN }, async () => {
  const sys = await systemProject();
  const refused = (name, args, message) => assert.rejects(startPsCompile(name, args), { message });
  await refused(sys, {}, 'node: the System node whose PS program is compiled (its Zynq nodes: zybo)');
  await refused(sys, { node: 'b2' }, 'b2: not an FPGA node on a Zynq board (the Zybo Z7, the Arty Z7): no processing system');
  await refused(sys, { node: 'nope' }, `no node 'nope' in the System of '${sys}' (its Zynq nodes: zybo)`);
  const zb = await boardProject();
  await refused(zb, { node: 'zybo' }, `node: the project '${zb}' is a Board project (no System): its PS program is compiled with no node`);
  const b3 = await boardProject({ 'ps/main.c': MAIN }, 'basys3');
  await refused(b3, {}, `the project '${b3}' is not on a Zynq board (the Zybo Z7, the Arty Z7): its board basys3 has no processing system`);
  const empty = await boardProject({});
  await refused(empty, {}, 'the project: no C in its ps/ (its PS program: a .c, New Source\'s PS Program)');
  await P.updateProject(zb, (p) => ({ ...p, trusted: false }));
  await assert.rejects(startPsCompile(zb, {}), (e) => e.status === 403 && /arm-none-eabi-gcc/.test(e.message));
  await writeConfig({ mode: 'silinx', paths: { 'arm-none-eabi-gcc': path.join(tmp, 'none') } });
  try {
    await refused(await boardProject(), {}, 'Compile PS Program needs arm-none-eabi-gcc on the local server: arm-none-eabi-gcc not found (the Arm GNU Toolchain: on the PATH or in config.json\'s paths[\'arm-none-eabi-gcc\'])');
  } finally { await writeConfig({ mode: 'silinx', paths: { 'arm-none-eabi-gcc': STUB } }); }
});

test('#4687 MCP: run_process ps, its warnings and locations; its refusals; toolchain_info says arm-none-eabi-gcc', { skip: WIN }, async () => {
  const name = await boardProject({ 'ps/main.c': '#warning check the clock\nint main(void) { for (;;) { } }\n' });
  const r = await tool('run_process').run({ project: name, process: 'ps' });
  assert.equal(r.isError, false, r.text);
  assert.ok(r.text.includes('Process "ps" of <PS program> completed successfully with 1 warning(s) (arm-none-eabi-gcc).'), r.text);
  assert.deepEqual([r.data.toolchain, r.data.ok, r.data.errors, r.data.warnings], ['arm-gcc', true, [], ['WARNING: ps/main.c:1:2: #warning check the clock']]);
  assert.deepEqual(r.data.locations, [{ severity: 'warning', text: 'WARNING: ps/main.c:1:2: #warning check the clock', file: 'ps/main.c', line: 1, col: 2 }]);
  const sys = await systemProject();
  const s = await tool('run_process').run({ project: sys, process: 'ps', node: 'zybo' });
  assert.ok(s.text.includes('Process "ps" of <node zybo> completed successfully (arm-none-eabi-gcc).'), s.text);
  assert.deepEqual(s.data.warnings, []);
  await assert.rejects(tool('run_process').run({ project: name, process: 'ps', toolchain: 'ise' }), { message: 'toolchain: a PS program is compiled by arm-none-eabi-gcc (no toolchain to choose)' });
  await assert.rejects(tool('run_process').run({ project: sys, process: 'ps' }), { message: 'node: the System node whose PS program is compiled (its Zynq nodes: zybo)' });
  const t = await tool('toolchain_info').run({});
  assert.equal(t.text.split('\n').at(-1), 'arm-none-eabi-gcc (a Zynq\'s Compile PS Program): available: arm-none-eabi-gcc 14.2.1 found.');
  assert.deepEqual(t.data.armGcc, { available: true, version: '14.2.1', reason: 'arm-none-eabi-gcc 14.2.1 found' });
});
