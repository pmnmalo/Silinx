// A System's nodes programmed on their boards (#5489's part 3, #5447, server/system-program.js), never a real board: the
// FPGA programmers faked (test/server-helpers.js makeFakes), arduino-cli's upload and the USB listing stand-ins
// (test/fixtures/arduino-cli-stub, test/fixtures/usb-devices-stub). The uart-avr example built: Program All, the FPGA
// node first by djtgcfg on its board by its serial number, then the Uno by arduino-cli upload on its port, their exact
// lines; two Unos: the Uno refused, the FPGA programmed; the board chosen by hand; a programmer failing, the next node
// going on; an untrusted project refused; the MCP's program_board with node and connected. A CircuitPython node's program
// copied to a CIRCUITPY drive (a folder of the test's, SILINX_CIRCUITPY, #5697).
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, makeFakes, isolatedPath, writeConfig, makeBit, waitJob, ROOT, POSIX_ONLY } from './server-helpers.js';
import { setBuildChannel } from '../core/build-channel.js';
import { fpgaSources } from '../core/system-plan.js';

const USB = path.join(ROOT, 'test/fixtures/usb-devices-stub/usb-devices');
const CLI = path.join(ROOT, 'test/fixtures/arduino-cli-stub/arduino-cli');
let tmp, fakes, oldPath, P, jobs, startSystemProgram, TOOLS;
const cfgFile = f => path.join(process.env.SILINX_CONFIG_DIR, f);
const ADEPT = { vendor: '1443', product: '0007', serial: 'D1', name: 'Digilent USB Device' };
const port = (serial, address) => ({ port: { address, properties: { vid: '0x2341', pid: '0x0043', serialNumber: serial } } });
const boards = (devices, ports) => { fs.writeFileSync(cfgFile('usb-devices.json'), JSON.stringify(devices)); fs.writeFileSync(cfgFile('arduino-ports.json'), JSON.stringify(ports)); };
const uploads = () => { try { return JSON.parse(fs.readFileSync(cfgFile('uploads.json'), 'utf8')); } catch { return []; } };
const progLog = () => { try { return fs.readFileSync(process.env.FAKE_PROG_LOG, 'utf8'); } catch { return ''; } };
const own = j => j.lines.filter(l => /^(Program( plan|: )|  [a-z]+: |System node \w+: |ERROR: System node|WARNING: System node|NOTE: )/.test(l));

before(async () => {
  tmp = await scratchEnv('silinx-system-program-');
  fakes = await makeFakes(tmp);
  oldPath = process.env.PATH;
  // (the fakes, and node for the stand-ins' #! line)
  process.env.PATH = isolatedPath(fakes.prog, path.dirname(process.execPath));
  await writeConfig({ mode: 'silinx', paths: { adepttool: fakes.adept, 'usb-devices': USB, 'arduino-cli': CLI } });
  setBuildChannel('dev');
  P = await import('../server/projects.js');
  jobs = await import('../server/jobs.js');
  ({ startSystemProgram } = await import('../server/system-program.js'));
  ({ TOOLS } = await import('../server/mcp.js'));
});
afterEach(() => { delete process.env.FAKE_PROG_FAIL; delete process.env.STUB_UPLOAD_FAIL; fs.rmSync(cfgFile('uploads.json'), { force: true }); });
after(() => { process.env.PATH = oldPath; fs.rmSync(tmp, { recursive: true, force: true }); });

// the uart-avr example with its FPGA node built (a bitstream of its device, its build's record)
async function built(name, opts = {}) {
  await P.createProject({ name, template: 'uart-avr', ...opts });
  const dir = path.join(P.projectDir(name), 'build/nodes/fpga/build');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'uart.bit'), makeBit({ design: 'uart.ncd;UserID=0xFFFFFFFF' }));
  const { takeBuildRecord, writeBuildRecord } = await import('../server/system-plan.js');
  const sys = JSON.parse(fs.readFileSync(path.join(P.projectDir(name), 'uart_avr.sys.json'), 'utf8'));
  const node = sys.nodes.find(n => n.id === 'fpga');
  await writeBuildRecord(name, node, await takeBuildRecord(name, node, fpgaSources(await P.fileTree(name), 'fpga')));
}
const run = async (name, o = {}) => waitJob(jobs, (await startSystemProgram(name, o)).id, { timeoutMs: 30000 });

test('#5489 Program All: the FPGA node by djtgcfg on its board by its serial number, then the Uno by arduino-cli upload on its port', { skip: POSIX_ONLY }, async () => {
  process.env.FAKE_PROG_LOG = path.join(tmp, 'all.log');
  await built('ua');
  boards([ADEPT], [port('A1', '/dev/cu.usbmodem101')]);
  const j = await run('ua');
  assert.equal(j.status, 'ok', j.lines.join('\n'));
  assert.deepEqual(own(j), [
    'Program plan (the FPGA nodes first, then the microcontrollers):',
    '  fpga: build/nodes/fpga/build/uart.bit on USB 1443:0007, serial D1 (Digilent USB Device), over JTAG',
    '  uno: uno/hello.hex on USB 2341:0043, serial A1 (port /dev/cu.usbmodem101), by avrdude (arduino-cli upload)',
    'System node fpga: programming build/nodes/fpga/build/uart.bit.',
    'System node fpga: programmed.',
    'System node uno: programming uno/hello.hex.',
    'System node uno: programmed.',
    'Program: 2 node(s) programmed (fpga, uno), 0 failed, 0 not programmed.',
  ]);
  assert.deepEqual(j.lines.filter(l => /^(WARNING|ERROR)/.test(l)), [], 'no warning');
  assert.match(progLog(), /^djtgcfg prog -d SN:D1 -i 0 -f .*build\/nodes\/fpga\/build\/uart\.bit$/m);
  assert.deepEqual(uploads(), [['upload', '--fqbn', 'arduino:avr:uno', '--port', '/dev/cu.usbmodem101', '--input-file', path.join(P.projectDir('ua'), 'uno/hello.hex'), '--verify']]);
  assert.deepEqual(j.result, { programmed: ['fpga', 'uno'], failed: [], refused: [] });
});

test('#5489 two Unos: the Uno refused, the FPGA programmed; the board chosen by hand; a programmer failing, the next node going on', { skip: POSIX_ONLY }, async () => {
  process.env.FAKE_PROG_LOG = path.join(tmp, 'two.log');
  await built('two');
  boards([ADEPT], [port('A1', '/dev/cu.usbmodem101'), port('B2', '/dev/cu.usbmodem102')]);
  const j = await run('two');
  assert.equal(j.status, 'error');
  assert.deepEqual(own(j).slice(3), [
    'System node fpga: programming build/nodes/fpga/build/uart.bit.',
    'System node fpga: programmed.',
    'ERROR: System node uno: not programmed: 2 connected boards could be it (USB 2341:0043, serial A1 (port /dev/cu.usbmodem101); USB 2341:0043, serial B2 (port /dev/cu.usbmodem102)): give it its board\'s serial number',
    'Program: 1 node(s) programmed (fpga), 0 failed, 1 not programmed (uno).',
  ]);
  assert.deepEqual(uploads(), []);
  // (by hand: the second, warned)
  const c = await run('two', { node: 'uno', chosen: { uno: '/dev/cu.usbmodem102' } });
  assert.equal(c.status, 'ok', c.lines.join('\n'));
  assert.deepEqual(c.lines.filter(l => /^WARNING/.test(l)), ['WARNING: System node uno: its board chosen by hand: USB 2341:0043, serial B2 (port /dev/cu.usbmodem102)']);
  assert.equal(uploads()[0][4], '/dev/cu.usbmodem102');
  // (djtgcfg failing: the Uno still programmed; avrdude failing: said)
  boards([ADEPT], [port('A1', '/dev/cu.usbmodem101')]);
  process.env.FAKE_PROG_FAIL = 'djtgcfg';
  const f = await run('two');
  assert.deepEqual(f.lines.filter(l => /^ERROR: System node/.test(l)), ['ERROR: System node fpga: djtgcfg exited with code 1']);
  assert.deepEqual(f.result ?? null, null);
  assert.ok(f.lines.includes('Program: 1 node(s) programmed (uno), 1 failed (fpga), 0 not programmed.'), f.lines.join('\n'));
  delete process.env.FAKE_PROG_FAIL;
  process.env.STUB_UPLOAD_FAIL = '1';
  const u = await run('two', { node: 'uno' });
  assert.deepEqual(u.lines.filter(l => /^ERROR: System node/.test(l)), ['ERROR: System node uno: arduino-cli upload failed (exit code 1): avrdude: stk500_recv(): programmer is not responding Failed uploading: uploading error: exit status 1']);
});

test('#5489 the refusals: an untrusted project, no such node, a node not built; MCP: program_board with node and connected', { skip: POSIX_ONLY }, async () => {
  process.env.FAKE_PROG_LOG = path.join(tmp, 'mcp.log');
  await built('un', { madeBy: 'mcp' });
  await assert.rejects(startSystemProgram('un', { node: '*' }), { status: 403, message: 'project \'un\' was made through the MCP server (by an assistant): programming the boards runs only once you trust it (Trust Project, in the console when the project opens)' });
  await built('mc');
  await assert.rejects(startSystemProgram('mc', { node: 'term' }), { status: 400, message: 'no node \'term\' to program in the System of \'mc\' (fpga, uno)' });
  boards([ADEPT], [port('A1', '/dev/cu.usbmodem101')]);
  fs.rmSync(path.join(P.projectDir('mc'), 'build/nodes/fpga/build/uart.bit'));
  const nb = await run('mc', { node: 'fpga' });
  assert.deepEqual(nb.lines.filter(l => /^ERROR/.test(l)), ['ERROR: System node fpga: not programmed: not built yet (no build/nodes/fpga/build/uart.bit yet): Build All first', 'ERROR: the System node(s) fpga not programmed']);
  // MCP
  const tool = TOOLS.find(t => t.name === 'program_board');
  const r = await tool.run({ project: 'mc', node: 'uno' });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.text.split('\n')[0], 'Programmed the System node uno: 1 node(s) programmed (uno), 0 failed, 0 not programmed.');
  assert.deepEqual([r.data.programmed, r.data.warnings, r.data.errors], [['uno'], [], []]);
  const h = await tool.run({ project: 'mc', node: 'uno', connected: 'A1' });
  assert.deepEqual(h.data.warnings, ['System node uno: its board chosen by hand: USB 2341:0043, serial A1 (port /dev/cu.usbmodem101)']);
  const all = await tool.run({ project: 'mc', node: '*' });
  assert.equal(all.isError, true);
  assert.deepEqual(all.data.errors, ['System node fpga: not programmed: not built yet (no build/nodes/fpga/build/uart.bit yet): Build All first', 'the System node(s) fpga not programmed']);
  await assert.rejects(tool.run({ project: 'mc', node: '*', connected: 'A1' }), { message: 'connected: one node\'s board (node its id, not *)' });
  await assert.rejects(tool.run({ project: 'mc', node: 'uno', tool: 'djtgcfg' }), { message: 'node: a System node is programmed with its board\'s own programmer (no tool, position or force)' });
  await assert.rejects(tool.run({ project: 'mc', connected: 'A1' }), { message: 'connected: the board of a System node (node)' });
});

test('#5581 the Implement tree\'s, by the MCP: each node\'s plan state (its mark) by check_system; the PIC24\'s Program Node refused, its tip\'s text', { skip: POSIX_ONLY }, async () => {
  await P.createProject({ name: 'pic', template: 'uart-fpga-pic24' });
  const sys = await TOOLS.find(t => t.name === 'check_system').run({ project: 'pic', file: 'uart_fpga_pic24.sys.json' });
  assert.deepEqual(sys.data.plan.nodes.map(e => [e.id, e.state]), [['fpga', 'not built'], ['pic', 'given']]);
  boards([ADEPT], []);
  const r = await TOOLS.find(t => t.name === 'program_board').run({ project: 'pic', node: 'pic' });
  assert.equal(r.isError, true);
  assert.deepEqual(r.data.errors, ['System node pic: not programmed: a PIC24 is not programmed by Silinx yet: load its pic/lcd_uart.hex with MPLAB IPE', 'the System node(s) pic not programmed']);
  assert.deepEqual(r.data.warnings, []);
});

test('#5697 a CircuitPython node: its program as code.py and its folder\'s other .py files onto the Pico\'s CIRCUITPY drive; none mounted: how to copy them; MCP: program_board', { skip: POSIX_ONLY }, async () => {
  await P.createProject({ name: 'cpy', template: 'uart-fpga-pico' });
  await P.writeFile('cpy', 'pico/lib/util.py', 'def double(x):\n    return 2 * x\n');
  const drive = path.join(tmp, 'CIRCUITPY');
  fs.mkdirSync(drive, { recursive: true });
  process.env.SILINX_CIRCUITPY = drive;
  try {
    // (no CircuitPython drive there yet: its boot_out.txt not CircuitPython's)
    const none = await run('cpy', { node: 'pico' });
    assert.deepEqual(none.lines.filter(l => /^(ERROR|WARNING)/.test(l)), ['ERROR: System node pico: no CIRCUITPY drive mounted: copy pico/code.py as code.py, and pico/lib/util.py at their places in its folder, to the Pico\'s CIRCUITPY drive (the Pico running CircuitPython, connected by USB)', 'ERROR: the System node(s) pico not programmed']);
    fs.writeFileSync(path.join(drive, 'boot_out.txt'), 'Adafruit CircuitPython 10.3.2 on 2026-11-11; Raspberry Pi Pico with rp2040\r\n');
    fs.writeFileSync(path.join(drive, 'code.py'), 'print("the old program")\n');
    const j = await run('cpy', { node: 'pico' });
    assert.equal(j.status, 'ok', j.lines.join('\n'));
    assert.deepEqual(own(j), ['Program plan (the FPGA nodes first, then the microcontrollers):', '  pico: pico/code.py as code.py onto the Pico\'s CIRCUITPY drive', 'System node pico: programming pico/code.py.',
      `System node pico: code.py, lib/util.py written on ${drive}: CircuitPython runs code.py again.`, 'System node pico: programmed.', 'Program: 1 node(s) programmed (pico), 0 failed, 0 not programmed.']);
    assert.deepEqual(j.lines.filter(l => /^(WARNING|ERROR)/.test(l)), [], 'no warning');
    assert.equal(fs.readFileSync(path.join(drive, 'code.py'), 'utf8'), fs.readFileSync(path.join(P.projectDir('cpy'), 'pico/code.py'), 'utf8'));
    assert.equal(fs.readFileSync(path.join(drive, 'lib/util.py'), 'utf8'), 'def double(x):\n    return 2 * x\n');
    assert.deepEqual(fs.readdirSync(drive).sort(), ['boot_out.txt', 'code.py', 'lib']);
    // MCP: the same
    const r = await TOOLS.find(t => t.name === 'program_board').run({ project: 'cpy', node: 'pico' });
    assert.equal(r.isError, false, r.text);
    assert.deepEqual([r.data.programmed, r.data.warnings, r.data.errors], [['pico'], [], []]);
  } finally { delete process.env.SILINX_CIRCUITPY; }
});

test('#5489 openFPGALoader\'s board by its FTDI serial number; one that is no value refused', async () => {
  const prog = await import('../server/programmer.js');
  assert.deepEqual(prog.buildCommands('program', { tool: 'openFPGALoader', cable: 'digilent_hs2', ftdiSerial: '210183A', position: 0, bitfile: '/w/a.bit' }),
    [{ cmd: 'openFPGALoader', args: ['-c', 'digilent_hs2', '--ftdi-serial', '210183A', '--index-chain', '0', '/w/a.bit'] }]);
  assert.equal(prog.resolveOptions({ ftdiSerial: '210183A' }, {}, 'basys3').ftdiSerial, '210183A');
  assert.throws(() => prog.resolveOptions({ ftdiSerial: '-x;rm' }, {}, 'basys3'), e => e.status === 400 && e.message === 'invalid ftdiSerial \'-x;rm\'');
});
