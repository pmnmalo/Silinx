// A Zynq board's PS program loaded over JTAG and started by the local server's OpenOCD (#4687, part 3b;
// server/zynq-ps-run.js): OpenOCD found (config.json's path: a stand-in for it, test/fixtures/openocd-stub) or not, said;
// the ELF Compile PS Program made (by the stand-in arm-none-eabi-gcc) run from its build folder's run/ (the Tcl from its
// checked plan, the segments' files); the job's exact lines, OpenOCD's warnings and errors; the refusals before OpenOCD
// runs (no ELF, an old one, a board with no PS, an untrusted project, no OpenOCD); the MCP's program_board ps and
// toolchain_info.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, waitJob, writeConfig, ROOT } from './server-helpers.js';

const GCC = path.join(ROOT, 'test/fixtures/arm-gcc-stub/arm-none-eabi-gcc');
const OCD = path.join(ROOT, 'test/fixtures/openocd-stub/openocd');
const WIN = process.platform === 'win32' ? 'the stand-ins are scripts run by their #! line, not on Windows' : false;
let tmp;
const config = (paths = { 'arm-none-eabi-gcc': GCC, openocd: OCD }) => writeConfig({ mode: 'silinx', paths });
before(async () => { tmp = await scratchEnv('silinx-ps-run-'); await config(); });
after(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));
const P = await import('../server/projects.js');
const jobs = await import('../server/jobs.js');
const { startPsCompile } = await import('../server/zynq-ps-compile.js');
const { startPsRun, detectOpenocd } = await import('../server/zynq-ps-run.js');
const { TOOLS } = await import('../server/mcp.js');
const tool = (n) => TOOLS.find((t) => t.name === n);

const MAIN = 'int main(void) { for (;;) { } }\n';
let made = 0;
async function boardProject({ compile = true, board = 'zybo-z7' } = {}) {
  const name = `zr${++made}`;
  await P.createProject({ name, template: 'empty', board });
  await P.writeFile(name, 'ps/main.c', MAIN);
  if (compile) assert.equal((await waitJob(jobs, (await startPsCompile(name, {})).id)).status, 'ok');
  return name;
}
const run = async (name, node) => waitJob(jobs, (await startPsRun(name, node === undefined ? {} : { node })).id);
const NONE = 'OpenOCD not found (install it: on the PATH or in config.json\'s paths.openocd; Silinx does not install it)';

test('#4687 OpenOCD found: its version; not found, said why (Silinx does not install it)', { skip: WIN }, async () => {
  assert.deepEqual(await detectOpenocd(), { available: true, path: OCD, version: '0.12.0', reason: 'OpenOCD 0.12.0 found' });
  assert.deepEqual(await detectOpenocd({ paths: { openocd: path.join(tmp, 'none') } }), { available: false, path: null, version: null, reason: NONE });
});

test('#4687 Run PS Program on a Board project: the ELF loaded by OpenOCD from build/ps/run/, its lines exact; its warning said', { skip: WIN }, async () => {
  const name = await boardProject();
  const j = await run(name);
  assert.equal(j.status, 'ok', j.lines.join('\n'));
  assert.deepEqual(j.lines, [
    'The project: its PS program build/ps/out/ps.elf (8 bytes) loaded over JTAG by OpenOCD 0.12.0, after ps7_init (26 register operations of the SLCR), CPU 0 started at 0x00000000; its script build/ps/run/run.tcl.',
    'WARNING: OpenOCD: zynq.cpu1: ran after reset and before halt ...',
    'The project: its PS program runs on CPU 0 (its UART on the board\'s USB serial port).',
  ]);
  assert.deepEqual(j.result, { node: null, elf: 'build/ps/out/ps.elf', bytes: 8, entry: 0, warnings: 1 });
  const dir = path.join(P.projectDir(name), 'build/ps/run');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'args.json'), 'utf8')), { args: ['-f', 'run.tcl'], images: [{ file: 'ps-0.bin', addr: '0x00000000', size: 8 }] });
  assert.match(fs.readFileSync(path.join(dir, 'run.tcl'), 'utf8'), /\nresume 0x00000000\nshutdown\n$/);
  // (no board: OpenOCD's error, said, the job failed)
  process.env.STUB_OPENOCD_NO_BOARD = '1';
  try {
    const f = await run(name);
    assert.equal(f.status, 'error');
    assert.deepEqual(f.lines.slice(1), ['ERROR: OpenOCD: unable to open ftdi device with vid 0403, pid 6010, description \'*\', serial \'*\' at bus location \'*\'',
      'ERROR: its PS program was not started (is the board connected and on, its boot jumper on JTAG?)']);
  } finally { delete process.env.STUB_OPENOCD_NO_BOARD; }
});

test('#4687 the refusals before OpenOCD runs: no ELF, an old one, a board with no PS, an untrusted project, no OpenOCD', { skip: WIN }, async () => {
  const refused = (name, args, message) => assert.rejects(startPsRun(name, args), { message });
  const fresh = await boardProject({ compile: false });
  await refused(fresh, {}, 'no build/ps/out/ps.elf yet: compile the PS program first (Compile PS Program)');
  const old = await boardProject();
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(path.join(P.projectDir(old), 'ps/main.c'), later, later);
  await refused(old, {}, 'build/ps/out/ps.elf is older than ps/main.c: compile the PS program again (Compile PS Program)');
  const b3 = await boardProject({ compile: false, board: 'basys3' });
  await refused(b3, {}, `the project '${b3}' is not on a Zynq board (the Zybo Z7, the Arty Z7): its board basys3 has no processing system`);
  const un = await boardProject();
  await P.updateProject(un, (p) => ({ ...p, trusted: false }));
  await assert.rejects(startPsRun(un, {}), (e) => e.status === 403 && /OpenOCD runs only once you trust it/.test(e.message));
  const ok = await boardProject();
  await config({ 'arm-none-eabi-gcc': GCC, openocd: path.join(tmp, 'none') });
  try { await refused(ok, {}, `Run PS Program needs OpenOCD on the local server: ${NONE}`); } finally { await config(); }
  assert.equal(fs.existsSync(path.join(P.projectDir(ok), 'build/ps/run')), false, 'nothing written');
});

test('#4687 MCP: program_board ps starts the PS program, its lines; its refusals; toolchain_info says OpenOCD', { skip: WIN }, async () => {
  const name = await boardProject();
  const r = await tool('program_board').run({ project: name, ps: true });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.text.split('\n')[0], 'Started the PS program (build/ps/out/ps.elf).');
  assert.deepEqual([r.data.ok, r.data.elf, r.data.bytes], [true, 'build/ps/out/ps.elf', 8]);
  await assert.rejects(tool('program_board').run({ project: name, ps: true, tool: 'openFPGALoader' }), { message: 'ps: a PS program is loaded by OpenOCD over the board\'s JTAG (no tool, position or connected)' });
  await assert.rejects(tool('program_board').run({ project: await boardProject({ compile: false }), ps: true }), { message: /compile the PS program first/ });
  const t = await tool('toolchain_info').run({});
  assert.equal(t.text.split('\n').at(-1), 'OpenOCD 0.12.0 (a Zynq\'s Run PS Program): available: OpenOCD 0.12.0 found.');
  assert.deepEqual(t.data.openocd, { available: true, version: '0.12.0', reason: 'OpenOCD 0.12.0 found' });
});
