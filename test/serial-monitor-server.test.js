// A real board's serial terminal from the local server (#5449, server/serial-monitor.js), never a real board:
// arduino-cli's monitor and the USB listing stand-ins (test/fixtures/arduino-cli-stub, test/fixtures/usb-devices-stub).
// A session on a port at a link's baud and frame (the monitor's arguments), the board's greeting and its echo of the text
// sent; the port not there; no arduino-cli; the port of a System node's board matched by its USB id (a terminal's: its
// link's board; an FPGA board with no serial port; no such node); the MCP's serial_terminal.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, isolatedPath, writeConfig, ROOT, POSIX_ONLY } from './server-helpers.js';

const USB = path.join(ROOT, 'test/fixtures/usb-devices-stub/usb-devices');
const CLI = path.join(ROOT, 'test/fixtures/arduino-cli-stub/arduino-cli');
let tmp, oldPath, P, serialSession, serialPortOf, TOOLS;
const cfgFile = f => path.join(process.env.SILINX_CONFIG_DIR, f);
const monitorArgs = () => JSON.parse(fs.readFileSync(cfgFile('monitor.json'), 'utf8'));
const ADEPT = { vendor: '1443', product: '0007', serial: 'D1', name: 'Digilent USB Device' };
const port = (serial, address) => ({ port: { address, properties: { vid: '0x2341', pid: '0x0043', serialNumber: serial } } });
const boards = (devices, ports) => { fs.writeFileSync(cfgFile('usb-devices.json'), JSON.stringify(devices)); fs.writeFileSync(cfgFile('arduino-ports.json'), JSON.stringify(ports)); };

before(async () => {
  tmp = await scratchEnv('silinx-serial-monitor-');
  oldPath = process.env.PATH;
  process.env.PATH = isolatedPath(path.dirname(process.execPath));
  await writeConfig({ mode: 'silinx', paths: { 'usb-devices': USB, 'arduino-cli': CLI } });
  P = await import('../server/projects.js');
  ({ serialSession, serialPortOf } = await import('../server/serial-monitor.js'));
  ({ TOOLS } = await import('../server/mcp.js'));
});
after(() => { process.env.PATH = oldPath; delete process.env.STUB_MONITOR_FAIL; fs.rmSync(tmp, { recursive: true, force: true }); });

test('#5449 a session: the port at the link\'s baud and frame, the board\'s greeting and its echo; the port not there; no arduino-cli', { skip: POSIX_ONLY }, async () => {
  const r = await serialSession({ port: '/dev/cu.usbmodem101', link: { baud: 115200, frame: '7E2' }, send: [...Buffer.from('ping\n')], sendAfterMs: 50, listenMs: 600 });
  assert.deepEqual(monitorArgs(), ['monitor', '-p', '/dev/cu.usbmodem101', '-c', 'baudrate=115200,bits=7,parity=even,stop_bits=2', '--quiet']);
  assert.equal(r.text, 'Hello from the board\r\nping\n');
  assert.equal(r.sent, 5);
  assert.ok(r.bytes.every(b => b.t >= 0 && b.t <= 1000), JSON.stringify(r.bytes.map(b => b.t)));
  process.env.STUB_MONITOR_FAIL = '1';
  await assert.rejects(serialSession({ port: '/dev/none', listenMs: 2000 }), { message: 'arduino-cli monitor on /dev/none: Port monitor error: command \'open\' failed: Serial port not found' });
  delete process.env.STUB_MONITOR_FAIL;
  await assert.rejects(serialSession({ port: '/dev/x', link: { frame: '5N1' } }), { message: 'a serial port has 7 or 8 data bits, not 5 (the frame 5N1)' });
  await assert.rejects(serialSession({}), { message: 'no serial port: give the board\'s (its address: /dev/cu.usbmodem101, COM3) or its node' });
  await writeConfig({ mode: 'silinx', paths: { 'usb-devices': USB, 'arduino-cli': path.join(tmp, 'no-such-cli') } });
  try {
    await assert.rejects(serialSession({ port: '/dev/x' }), { message: 'a real board\'s serial port needs arduino-cli on the local server (its monitor opens the port; install it from arduino.cc)' });
  } finally { await writeConfig({ mode: 'silinx', paths: { 'usb-devices': USB, 'arduino-cli': CLI } }); }
});

test('#5449 a System node\'s port: its board by its USB id, its UART\'s baud and frame; a terminal\'s board; the refusals', { skip: POSIX_ONLY }, async () => {
  await P.createProject({ name: 'ser', template: 'uart-avr' });
  boards([ADEPT], [port('A1', '/dev/cu.usbmodem101')]);
  assert.deepEqual(await serialPortOf({ project: 'ser', node: 'uno' }), { port: '/dev/cu.usbmodem101', link: { baud: 9600, frame: '8N1' }, node: 'uno' });
  assert.deepEqual(await serialPortOf({ project: 'ser', node: 'uno', baud: 115200, frame: '8e1' }), { port: '/dev/cu.usbmodem101', link: { baud: 115200, frame: '8E1' }, node: 'uno' });
  assert.deepEqual(await serialPortOf({ port: 'COM3' }), { port: 'COM3', link: { baud: 9600, frame: '8N1' }, node: null });
  // (the FPGA board: its programmer has no serial port; a USB-UART adapter's port given)
  await assert.rejects(serialPortOf({ project: 'ser', node: 'fpga' }), { message: 'fpga: its board (USB 1443:0007, serial D1 (Digilent USB Device)) has no serial port Silinx sees: give its port (an FPGA board\'s, its USB-UART adapter\'s)' });
  assert.deepEqual(await serialPortOf({ project: 'ser', node: 'fpga', port: '/dev/cu.usbserial-1' }), { port: '/dev/cu.usbserial-1', link: { baud: 9600, frame: '8N1' }, node: 'fpga' });
  // (a terminal node: the board at its link's other end, at the terminal's settings)
  const file = path.join(P.projectDir('ser'), 'uart_avr.sys.json'), sys = JSON.parse(fs.readFileSync(file, 'utf8'));
  sys.nodes.push({ id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 19200, frame: '8N2' }], x: 0, y: 300 });
  sys.links = [{ id: 'console', kind: 'uart', a: 'term.serial', b: 'uno.Serial' }];
  fs.writeFileSync(file, JSON.stringify(sys));
  assert.deepEqual(await serialPortOf({ project: 'ser', node: 'term' }), { port: '/dev/cu.usbmodem101', link: { baud: 19200, frame: '8N2' }, node: 'uno' });
  await assert.rejects(serialPortOf({ project: 'ser', node: 'nope' }), { message: 'no node \'nope\' in the System of \'ser\' (uno, fpga, term)' });
  await assert.rejects(serialPortOf({ node: 'uno' }), { message: 'node: a node of a System project\'s System, with its project' });
  await assert.rejects(serialPortOf({ project: 'ser' }), { message: 'project: with node, a node of its System (or port alone)' });
  await assert.rejects(serialPortOf({}), { message: 'port or node: the board\'s serial port (its address), or a System node whose board is connected' });
  boards([ADEPT], []);
  await assert.rejects(serialPortOf({ project: 'ser', node: 'uno' }), { message: 'uno: no board connected for it (Arduino Uno, USB 2341:0043 or 2341:0001 or 2341:0243 or 2a03:0043 or 1a86:7523); or give its port' });
});

test('#5449 MCP: serial_terminal on a node\'s board, its text and data; on a port; a refusal the tool\'s error', { skip: POSIX_ONLY }, async () => {
  await P.createProject({ name: 'mser', template: 'uart-avr' });
  boards([ADEPT], [port('A1', '/dev/cu.usbmodem101')]);
  const tool = TOOLS.find(t => t.name === 'serial_terminal');
  const r = await tool.run({ project: 'mser', node: 'uno', send: 'hi\n', send_after_ms: 50, listen_ms: 600 });
  assert.equal(r.isError, undefined);
  assert.deepEqual(r.text.split('\n'), ['Serial port /dev/cu.usbmodem101 (the board of uno) at 9600 baud, 8N1: 25 byte(s) received in 600 ms, 3 sent.', '', 'Hello from the board\r', 'hi', '']);
  assert.deepEqual(r.data, { port: '/dev/cu.usbmodem101', node: 'uno', baud: 9600, frame: '8N1', sent: 3, received: 25, text: 'Hello from the board\r\nhi\n', warnings: [] });
  assert.equal(r.untrusted, 'what the board sent on its serial port');
  const p = await tool.run({ port: '/dev/cu.usbserial-1', baud: 57600, listen_ms: 300 });
  assert.equal(p.text.split('\n')[0], 'Serial port /dev/cu.usbserial-1 at 57600 baud, 8N1: 22 byte(s) received in 300 ms, 0 sent.');
  assert.equal(monitorArgs()[4], 'baudrate=57600,bits=8,parity=none,stop_bits=1');
  await assert.rejects(tool.run({ project: 'mser', node: 'fpga' }), { toolError: true });
});
