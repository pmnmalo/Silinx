// A System's PIC24 node's firmware compiled by XC16 (#5482, server/xc16-compile.js): XC16 found on this computer (its
// bin folder in config.json, a stand-in for it: test/fixtures/xc16-stub) or in its Docker image on the ISE machine (over
// ssh: the fake ssh and docker of server-helpers.js), which one used and why the other not; the uart-fpga-pic24 example's
// pic node's C compiled to its .hex (its folder, the node's firmware; set when it had none), run by the PIC24 emulator;
// the job's exact lines (gcc's, the assembler's and the linker's errors and warnings by the project's file and line, no
// warning when there is none); the refusals; the MCP's run_process firmware and toolchain_info. With the real XC16, when
// installed, a C program compiled with no warning (skipped, said why, when it is not on this computer).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, waitJob, writeConfig, makeFakes, isolatedPath, ROOT } from './server-helpers.js';
import { readSystem, writeSystem } from '../core/system-doc.js';
import { parseHex } from '../packages/silinx-pic24/src/hex.js';

const STUB = path.join(ROOT, 'test/fixtures/xc16-stub/v2.10/bin');
const WIN = process.platform === 'win32' ? 'the stand-in for XC16 is a script run by its #! line, not on Windows' : false;
const LCD_HEX = fs.readFileSync(path.join(ROOT, 'examples/uart-fpga-pic24/pic/lcd_uart.hex'), 'utf8');
let tmp, fakes;
before(async () => { tmp = await scratchEnv('silinx-xc16-'); fakes = await makeFakes(tmp); await writeConfig({ mode: 'silinx', paths: { xc16: STUB } }); });
after(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));
const P = await import('../server/projects.js');
const jobs = await import('../server/jobs.js');
const { startFirmwareCompile } = await import('../server/avr-compile.js');
const { detectXc16 } = await import('../server/xc16-compile.js');
const { TOOLS } = await import('../server/mcp.js');
const tool = n => TOOLS.find(t => t.name === n);

const MAIN = '#include <xc.h>\n\nint main(void) {\n  TRISA = 0;\n  for (;;) LATA = 0x55;\n}\n';
let made = 0;
async function project(files = { 'pic/main.c': MAIN }) {
  const name = `up${++made}`;
  await P.createProject({ name, template: 'uart-fpga-pic24' });
  for (const [f, t] of Object.entries(files)) await P.writeFile(name, f, t);
  return name;
}
const run = async (name, node = 'pic') => waitJob(jobs, (await startFirmwareCompile(name, { node })).id);
const fileOf = (name, f) => fs.readFileSync(path.join(P.projectDir(name), f), 'utf8');
const HEAD = n => `System node pic: its program (${n} C and assembly file(s) of pic/) for the PIC24FJ1024GB610 (Explorer 16/32), by XC16 2.10 on this computer, -O1 (XC16's free licence: -O0 to -O2), in build/nodes/pic/firmware/.`;
const WORDS = parseHex(LCD_HEX).words;

test('#5482 XC16 found: this computer\'s (its version), else the ISE machine\'s image over ssh; which one and why not the other', { skip: WIN }, async () => {
  const local = { available: true, reason: 'XC16 2.10 installed here' };
  assert.deepEqual(await detectXc16(), { available: true, via: 'local', bin: STUB, root: path.dirname(STUB), version: '2.10', image: null, reason: 'XC16 2.10 installed here',
    local, remote: { available: false, reason: 'no ISE machine (no ssh host in the toolchain settings)' } });
  const ssh = { host: 'mini', user: 'dev', remoteDir: 'silinx-build' };
  const both = await detectXc16({ paths: { xc16: STUB }, ssh });
  assert.deepEqual([both.via, both.reason, both.remote], ['local', 'XC16 2.10 installed here (the ISE machine\'s image not used)', { available: true, reason: 'the image silinx/xc16:2.10 on the ISE machine, over ssh' }]);
  const none = 'no XC16 installed here (MPLAB XC16: its bin folder on the PATH or in config.json\'s paths.xc16)';
  if (!(await detectXc16({ ssh: {} })).available) {
    const r = await detectXc16({ ssh }, { dirs: [] });
    assert.deepEqual([r.available, r.via, r.image, r.version, r.reason], [true, 'ssh', 'silinx/xc16:2.10', '2.10', `XC16 in the image silinx/xc16:2.10 on the ISE machine, over ssh (${none})`]);
    assert.deepEqual(await detectXc16({ ssh: {} }, { dirs: [] }), { available: false, via: null, bin: null, root: null, version: null, image: null,
      reason: `${none}; no ISE machine (no ssh host in the toolchain settings)`, local: { available: false, reason: none }, remote: { available: false, reason: 'no ISE machine (no ssh host in the toolchain settings)' } });
  }
  // (config.json's xc16: its mode, its image)
  const forced = await detectXc16({ paths: { xc16: STUB }, ssh, xc16: { mode: 'ssh', image: 'me/xc16:2.10' } });
  assert.deepEqual([forced.via, forced.version, forced.reason], ['ssh', '2.10', 'XC16 in the image me/xc16:2.10 on the ISE machine, over ssh (not used (config.json\'s xc16.mode is ssh))']);
  const only = await detectXc16({ paths: { xc16: STUB }, ssh, xc16: { mode: 'local' } });
  assert.deepEqual([only.via, only.remote.reason], ['local', 'not used (config.json\'s xc16.mode is local)']);
  assert.equal((await detectXc16({ paths: { xc16: path.join(tmp, 'none') }, ssh: {} })).local.reason, 'config.json\'s paths.xc16 is not a bin folder of XC16 (its xc16-gcc and xc16-bin2hex)');
  // (its install's folders: <folder>/<version>/bin, the newest; its linker script needed)
  const inst = path.join(tmp, 'microchip-xc16');
  for (const v of ['v1.70', 'v2.10', 'v2.9']) fs.cpSync(path.dirname(STUB), path.join(inst, v), { recursive: true });
  fs.rmSync(path.join(inst, 'v2.10', 'support'), { recursive: true });
  if (!(await detectXc16({ ssh: {} })).available) {
    const i = await detectXc16({ ssh: {} }, { dirs: [inst] });
    assert.deepEqual([i.available, i.version, i.local.reason], [false, '2.10', 'XC16 2.10 installed here, without the PIC24FJ1024GB610\'s linker script (its PIC24F support)']);
  }
});

test('#5482 the pic node\'s C compiled: its .hex the node\'s firmware, read by the PIC24 emulator; its lines exact, no warning; xc16-gcc\'s and xc16-bin2hex\'s arguments', { skip: WIN }, async () => {
  const name = await project({ 'pic/main.c': MAIN, 'pic/lcd.h': '#define LCD 1\n', 'pic/delay.s': '; a delay\n' });
  fs.writeFileSync(path.join(P.projectDir(name), 'pic/lcd_uart.hex'), ':00000001FF\n');
  const j = await run(name);
  assert.equal(j.status, 'ok', j.lines.join('\n'));
  assert.deepEqual(j.lines, [HEAD(2), `System node pic: its firmware pic/lcd_uart.hex, ${WORDS} program word(s).`]);
  assert.equal(fileOf(name, 'pic/lcd_uart.hex'), LCD_HEX, 'the node\'s firmware replaced by the one XC16 made');
  assert.deepEqual(j.result, { nodes: [{ node: 'pic', hex: 'pic/lcd_uart.hex', size: WORDS, warnings: 0, set: false }] });
  const dir = path.join(P.projectDir(name), 'build/nodes/pic/firmware');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'xc16-gcc.json'), 'utf8')), ['-mcpu=24FJ1024GB610', '-omf=elf', '-O1', '-Wall', '-o', 'out/pic.elf', 'src/delay.s', 'src/main.c',
    '-T', path.join(path.dirname(STUB), 'support/PIC24F/gld/p24FJ1024GB610.gld'), '-Wl,--heap=512,-Map=out/pic.map']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'xc16-bin2hex.json'), 'utf8')), ['out/pic.elf', '-a', '-omf=elf']);
  assert.equal(fs.readFileSync(path.join(dir, 'src/lcd.h'), 'utf8'), '#define LCD 1\n', 'the node\'s folder copied into src/');
  // (the emulator runs the .hex made, the empty one it replaced not: the UART's greeting, its echo by the FPGA)
  const r = await tool('simulate').run({ project: name, time_ns: 40e6 });
  const text = w => String.fromCharCode(...r.data.traffic.find(t => t.wire === w).bytes.map(b => b.byte));
  assert.deepEqual([text('serial_pic'), text('serial_fpga'), r.data.warnings, r.data.errors], ['Hi from PIC24!\r\n', 'Hi from PIC24!\r\n', [], []]);
});

test('#5482 XC16\'s errors and warnings: gcc\'s, the assembler\'s, the linker\'s, as ERROR and WARNING lines by the project\'s file and line; no .hex written', { skip: WIN }, async () => {
  const name = await project({ 'pic/main.c': '#warning check the baud\nint main(void) {\n  #error no main yet\n}\n', 'pic/lib/delay.s': '  .error "no delay"\n' });
  const j = await run(name);
  assert.equal(j.status, 'error');
  assert.deepEqual(j.lines, [HEAD(2),
    'ERROR: pic/lib/delay.s:1: no delay',
    'ERROR: pic/main.c:3:4: #error no main yet',
    'WARNING: pic/main.c:1:2: #warning check the baud',
    'ERROR: System node pic: pic: its program did not compile (2 error(s), 1 warning(s))',
    'ERROR: the System node(s) pic failed',
  ]);
  assert.equal(fileOf(name, 'pic/lcd_uart.hex'), LCD_HEX, 'the node\'s firmware as it was');
  const l = await project({ 'pic/main.c': 'int main(void) { for (;;); }  //stub-link-error\n' });
  const jl = await run(l);
  assert.deepEqual(jl.lines.slice(1), ['ERROR: Could not allocate section .nbss, size = 9000 bytes, attributes = bss near',
    'ERROR: System node pic: pic: its program did not compile (1 error(s), 0 warning(s))', 'ERROR: the System node(s) pic failed']);
  // (warnings only: compiled, its warnings said)
  const w = await project({ 'pic/main.c': '#warning check the baud\nint main(void) { for (;;); }\n' });
  const jw = await run(w);
  assert.equal(jw.status, 'ok');
  assert.deepEqual(jw.lines.filter(x => /^(ERROR|WARNING)/.test(x)), ['WARNING: pic/main.c:1:2: #warning check the baud']);
});

test('#5482 a node with no firmware gets the one made, <id>/<id>.hex: its System document written', { skip: WIN }, async () => {
  const name = await project();
  const file = 'uart_fpga_pic24.sys.json';
  const sys = readSystem(await P.readFile(name, file)).system;
  sys.nodes.find(n => n.id === 'pic').firmware = null;
  await P.writeFile(name, file, writeSystem(sys));
  const j = await run(name);
  assert.equal(j.status, 'ok', j.lines.join('\n'));
  assert.deepEqual(j.lines.slice(-2), [`System node pic: its firmware pic/pic.hex, ${WORDS} program word(s).`, 'System node pic: its firmware set to pic/pic.hex in uart_fpga_pic24.sys.json.']);
  assert.equal(readSystem(await P.readFile(name, file)).system.nodes.find(n => n.id === 'pic').firmware, 'pic/pic.hex');
  // (the build plan: up to date, compiled by XC16)
  const c = await tool('check_system').run({ project: name, file });
  assert.equal(c.data.plan.lines.find(l => /^ {2}pic:/.test(l)), '  pic: up to date; compiled by XC16 to pic/pic.hex, programmed by a PICkit (MPLAB IPE)');
});

test('#5482 the refusals: no C in the node\'s folder (the example\'s assembly is MPASM\'s .asm), no XC16 anywhere', { skip: WIN }, async () => {
  const name = await project({});
  const j = await run(name);
  assert.equal(j.status, 'error');
  assert.deepEqual(j.lines, ['ERROR: System node pic: pic: no C or assembly in its folder pic/ (a .c or a .s: write one)', 'ERROR: the System node(s) pic failed']);
  await writeConfig({ mode: 'silinx', paths: { xc16: path.join(tmp, 'none') } });
  try {
    await assert.rejects(startFirmwareCompile(name, { node: 'pic' }), { message: 'Compile Firmware needs XC16 on the local server or the ISE machine: config.json\'s paths.xc16 is not a bin folder of XC16 (its xc16-gcc and xc16-bin2hex); no ISE machine (no ssh host in the toolchain settings)' });
  } finally { await writeConfig({ mode: 'silinx', paths: { xc16: STUB } }); }
});

test('#5482 XC16 in its image on the ISE machine: the build folder sent over ssh, build.sh run in the image, its .hex brought back; the remote folder removed', { skip: WIN }, async () => {
  const home = path.join(tmp, 'remote-home'), log = path.join(tmp, 'ssh.log'), dlog = path.join(tmp, 'docker.log');
  const was = process.env.PATH;
  // (the stand-in found in the "image" on its PATH: the fake docker runs it here)
  process.env.PATH = isolatedPath(fakes.ssh, fakes.docker, STUB, path.dirname(process.execPath));
  Object.assign(process.env, { FAKE_SSH_HOME: home, FAKE_SSH_LOG: log, FAKE_DOCKER_LOG: dlog });
  await writeConfig({ mode: 'silinx', ssh: { host: 'mini', user: 'dev', remoteDir: 'silinx-build' }, xc16: { mode: 'ssh' } });
  try {
    const name = await project({ 'pic/main.c': '#warning check the baud\nint main(void) { for (;;); }\n' });
    const j = await run(name);
    assert.equal(j.status, 'ok', j.lines.join('\n'));
    assert.deepEqual(j.lines, [
      'System node pic: its program (1 C and assembly file(s) of pic/) for the PIC24FJ1024GB610 (Explorer 16/32), by XC16 in the image silinx/xc16:2.10 on the ISE machine, -O1 (XC16\'s free licence: -O0 to -O2), in build/nodes/pic/firmware/.',
      'WARNING: pic/main.c:1:2: #warning check the baud',
      `System node pic: its firmware pic/lcd_uart.hex, ${WORDS} program word(s).`,
    ]);
    assert.equal(fileOf(name, 'pic/lcd_uart.hex'), LCD_HEX);
    const rdir = `silinx-build/${name}.pic.xc16`;
    const calls = fs.readFileSync(log, 'utf8').trim().split('\n');
    assert.equal(calls.length, 4, calls.join('\n'));
    assert.ok(calls.every(c => c.startsWith('dev@mini ')));
    assert.ok(calls[0].includes(`mkdir -p ${rdir} && tar -C ${rdir} -xf -`));
    assert.ok(calls[1].includes(`cd ${rdir} && docker run --rm --pull=never --network none`) && calls[1].endsWith('silinx/xc16:2.10 bash build.sh'), calls[1]);
    assert.ok(calls[2].endsWith(`tar -C ${rdir} -cf - out`));
    assert.ok(calls[3].endsWith(`rm -rf ${rdir}`));
    assert.ok(!fs.existsSync(path.join(home, rdir)), 'the remote folder removed');
    const script = fs.readFileSync(path.join(P.projectDir(name), 'build/nodes/pic/firmware/build.sh'), 'utf8').split('\n');
    assert.deepEqual(script.slice(-3), ['"$XC16_BIN/xc16-gcc" -mcpu=24FJ1024GB610 -omf=elf -O1 -Wall -o out/pic.elf src/main.c -T "$XC16_ROOT/support/PIC24F/gld/p24FJ1024GB610.gld" -Wl,--heap=512,-Map=out/pic.map || exit $?',
      '"$XC16_BIN/xc16-bin2hex" out/pic.elf -a -omf=elf', '']);
    // (the image not on the ISE machine: said so)
    const none = path.join(tmp, 'docker-none');
    fs.mkdirSync(none, { recursive: true });
    fs.writeFileSync(path.join(none, 'docker'), '#!/bin/sh\necho "docker: Error response from daemon: No such image: silinx/xc16:latest." >&2\nexit 125\n', { mode: 0o755 });
    process.env.PATH = isolatedPath(fakes.ssh, none, path.dirname(process.execPath));
    const e = await run(name);
    assert.equal(e.status, 'error');
    assert.deepEqual(e.lines.slice(1), ['ERROR: pic: the image silinx/xc16:2.10 is not on the ISE machine (build it there from Microchip\'s XC16 installer)',
      'ERROR: System node pic: pic: its program did not compile (1 error(s), 0 warning(s))', 'ERROR: the System node(s) pic failed']);
    // (the ISE machine refuses the connection)
    process.env.FAKE_SSH_FAIL = '1';
    const f = await run(name);
    assert.deepEqual(f.lines.slice(1, 2), ['ERROR: pic: its sources could not be sent to the ISE machine (exit code 255)']);
  } finally {
    process.env.PATH = was;
    for (const k of ['FAKE_SSH_HOME', 'FAKE_SSH_LOG', 'FAKE_DOCKER_LOG', 'FAKE_SSH_FAIL']) delete process.env[k];
    await writeConfig({ mode: 'silinx', paths: { xc16: STUB } });
  }
});

test('#6019 XC16 in its image in this computer\'s Docker (xc16.mode docker, the ISE runner\'s): build.sh run there on the build folder, its .hex made; the image missing said; toolchain_info says so', { skip: WIN }, async () => {
  const dlog = path.join(tmp, 'docker-local.log');
  const was = process.env.PATH;
  // (the stand-in found in the "image" on its PATH: the fake docker runs it here)
  process.env.PATH = isolatedPath(fakes.docker, STUB, path.dirname(process.execPath));
  Object.assign(process.env, { FAKE_DOCKER_LOG: dlog });
  await writeConfig({ mode: 'silinx', paths: { xc16: STUB }, xc16: { mode: 'docker' } });
  try {
    const d = await detectXc16();
    assert.deepEqual([d.available, d.via, d.image, d.version, d.docker, d.reason, d.local.reason], [true, 'docker', 'silinx/xc16:2.10', '2.10', path.join(fakes.docker, 'docker'),
      'XC16 in the image silinx/xc16:2.10 in this computer\'s Docker (not used (config.json\'s xc16.mode is docker))', 'not used (config.json\'s xc16.mode is docker)']);
    const name = await project({ 'pic/main.c': '#warning check the baud\nint main(void) { for (;;); }\n' });
    const j = await run(name);
    assert.equal(j.status, 'ok', j.lines.join('\n'));
    assert.deepEqual(j.lines, [
      'System node pic: its program (1 C and assembly file(s) of pic/) for the PIC24FJ1024GB610 (Explorer 16/32), by XC16 in the image silinx/xc16:2.10 in this computer\'s Docker, -O1 (XC16\'s free licence: -O0 to -O2), in build/nodes/pic/firmware/.',
      'WARNING: pic/main.c:1:2: #warning check the baud',
      `System node pic: its firmware pic/lcd_uart.hex, ${WORDS} program word(s).`,
    ]);
    assert.equal(fileOf(name, 'pic/lcd_uart.hex'), LCD_HEX);
    const calls = fs.readFileSync(dlog, 'utf8').trim().split('\n');
    assert.deepEqual(calls.map(c => c.split(' ')[0]), ['image', 'image', 'run'], calls.join('\n'));
    assert.equal(calls[2], `run --rm --pull=never --network none --cap-drop ALL --security-opt no-new-privileges --pids-limit 512 -v ${path.join(P.projectDir(name), 'build/nodes/pic/firmware')}:/work -w /work silinx/xc16:2.10 bash build.sh`);
    const t = await tool('toolchain_info').run({});
    assert.equal(t.text.split('\n')[4], 'XC16 2.10 (a PIC24\'s Compile Firmware): available, in this computer\'s Docker: XC16 in the image silinx/xc16:2.10 in this computer\'s Docker (not used (config.json\'s xc16.mode is docker)).');
    // (the image not in this computer's Docker: not there, said; Compile Firmware refused)
    process.env.FAKE_DOCKER_NO_IMAGE = '1';
    assert.deepEqual((await detectXc16()).remote, { available: false, reason: 'the image silinx/xc16:2.10 is not in this computer\'s Docker' });
    await assert.rejects(startFirmwareCompile(name, { node: 'pic' }), { message: 'Compile Firmware needs XC16 on the local server or the ISE machine: not used (config.json\'s xc16.mode is docker); the image silinx/xc16:2.10 is not in this computer\'s Docker' });
  } finally {
    process.env.PATH = was;
    for (const k of ['FAKE_DOCKER_LOG', 'FAKE_DOCKER_NO_IMAGE']) delete process.env[k];
    await writeConfig({ mode: 'silinx', paths: { xc16: STUB } });
  }
});

test('#5482 MCP: run_process firmware on a PIC24 node, its errors, warnings and locations as the console\'s; toolchain_info says XC16', { skip: WIN }, async () => {
  const name = await project({ 'pic/main.c': '#warning check the baud\nint main(void) { for (;;); }\n' });
  const r = await tool('run_process').run({ project: name, process: 'firmware', node: 'pic' });
  assert.equal(r.isError, false);
  assert.ok(r.text.includes('Process "firmware" of <node pic> completed successfully with 1 warning(s) (XC16).'), r.text);
  assert.deepEqual([r.data.toolchain, r.data.ok, r.data.errors, r.data.warnings], ['xc16', true, [], ['WARNING: pic/main.c:1:2: #warning check the baud']]);
  assert.deepEqual(r.data.locations, [{ severity: 'warning', text: 'WARNING: pic/main.c:1:2: #warning check the baud', file: 'pic/main.c', line: 1, col: 2 }]);
  await P.writeFile(name, 'pic/main.c', 'int main(void) {\n#error nope\n}\n');
  const e = await tool('run_process').run({ project: name, process: 'firmware', node: 'pic' });
  assert.equal(e.isError, true);
  assert.deepEqual(e.data.errors, ['ERROR: pic/main.c:2:2: #error nope', 'ERROR: System node pic: pic: its program did not compile (1 error(s), 0 warning(s))', 'ERROR: the System node(s) pic failed']);
  assert.deepEqual(e.data.warnings, []);
  await assert.rejects(tool('run_process').run({ project: name, process: 'firmware', node: 'pic', toolchain: 'ise' }), { message: 'toolchain: a firmware is compiled by arduino-cli or XC16 (no toolchain to choose)' });
  const t = await tool('toolchain_info').run({});
  assert.equal(t.text.split('\n')[4], 'XC16 2.10 (a PIC24\'s Compile Firmware): available, on this computer: XC16 2.10 installed here.');
  assert.deepEqual(t.data.xc16, { available: true, via: 'local', version: '2.10', reason: 'XC16 2.10 installed here', local: 'XC16 2.10 installed here', remote: 'no ISE machine (no ssh host in the toolchain settings)' });
});

// the real XC16, when this computer has it (config.json's path none: the PATH's and the installers' folders)
const real = await detectXc16({ ssh: {} });
test('#5482 the real XC16: a C program compiled with no warning, its .hex read by the emulator; an error by file and line', { skip: (WIN || !real.available) && `no XC16 here (${real.reason})`, timeout: 300000 }, async () => {
  await writeConfig({ mode: 'silinx' });
  try {
    const name = await project();
    const j = await waitJob(jobs, (await startFirmwareCompile(name, { node: 'pic' })).id, { timeoutMs: 280000 });
    assert.equal(j.status, 'ok', j.lines.join('\n'));
    assert.deepEqual(j.lines.filter(l => /^(ERROR|WARNING)/.test(l)), [], 'no warning');
    const hex = parseHex(fileOf(name, 'pic/lcd_uart.hex'));
    assert.ok(hex.words > 10 && !hex.warnings.length, `a program of the flash (${hex.words} words)`);
    await P.writeFile(name, 'pic/main.c', '#include <xc.h>\nint main(void) {\n  TRISQ = 0;\n}\n');
    const e = await waitJob(jobs, (await startFirmwareCompile(name, { node: 'pic' })).id, { timeoutMs: 280000 });
    assert.equal(e.status, 'error');
    assert.ok(e.lines.some(l => /^ERROR: pic\/main\.c:3(:\d+)?: .*TRISQ/.test(l)), e.lines.join('\n'));
  } finally { await writeConfig({ mode: 'silinx', paths: { xc16: STUB } }); }
});

test('#5552 a drawing in the pic node: its C and the node\'s main.c made (MCP write_file), compiled by run_process firmware with them; the plan\'s sources the drawing too', { skip: WIN }, async () => {
  const name = await project({});
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/lock/src/lock.fsm.json'), 'utf8'));
  delete lock.generatedFile;
  const w = await tool('write_file').run({ project: name, path: 'pic/lock.fsm.json', text: JSON.stringify(lock, null, 2) });
  assert.deepEqual(w.text.split('\n').slice(1), ['pic/lock.c generated from pic/lock.fsm.json', 'pic/main.c generated from pic\'s drawings']);
  const r = await tool('run_process').run({ project: name, process: 'firmware', node: 'pic' });
  assert.equal(r.isError, false, r.text);
  assert.deepEqual([r.data.errors, r.data.warnings], [[], []]);
  assert.ok(r.text.includes('System node pic: its program (2 C and assembly file(s) of pic/) for the PIC24FJ1024GB610 (Explorer 16/32), by XC16 2.10 on this computer, -O1 (XC16\'s free licence: -O0 to -O2), in build/nodes/pic/firmware/.'), r.text);
  const args = JSON.parse(fs.readFileSync(path.join(P.projectDir(name), 'build/nodes/pic/firmware/xc16-gcc.json'), 'utf8'));
  assert.deepEqual(args.filter(a => a.startsWith('src/')), ['src/lock.c', 'src/main.c']);
  const c = await tool('check_system').run({ project: name, file: 'uart_fpga_pic24.sys.json' });
  assert.deepEqual(c.data.plan.nodes.find(e => e.id === 'pic').sources, ['pic/lock.c', 'pic/lock.fsm.json', 'pic/main.c']);
  assert.equal(c.data.plan.lines.find(l => /^ {2}pic:/.test(l)), '  pic: up to date; compiled by XC16 to pic/lcd_uart.hex, programmed by a PICkit (MPLAB IPE)');
  // (the drawing deleted: its C no longer called, the node's main.c removed before the compile, nothing left to compile)
  await tool('delete_file').run({ project: name, path: 'pic/lock.fsm.json' });
  await tool('delete_file').run({ project: name, path: 'pic/lock.c' });
  const j = await run(name);
  assert.deepEqual(j.lines, ['pic/main.c removed: pic has no drawing with its C', 'ERROR: System node pic: pic: no C or assembly in its folder pic/ (a .c or a .s: write one)', 'ERROR: the System node(s) pic failed']);
});
