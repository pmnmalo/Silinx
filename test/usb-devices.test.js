// The USB devices connected to the local server's computer (#5489's part 2, server/usb-devices.js): macOS's
// system_profiler (both its trees' keys), Windows's PnP instance ids and arduino-cli's board list read; the listing
// through config.json's paths['usb-devices'] (a stand-in: test/fixtures/usb-devices-stub) with arduino-cli's serial
// ports joined to it (its stand-in's board list); the uart-avr System's nodes matched (Connected Boards), their exact
// lines; the MCP's check_system with boards. Nothing is opened, nothing programmed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, writeConfig, ROOT } from './server-helpers.js';
import { setBuildChannel } from '../core/build-channel.js';

const STUB = path.join(ROOT, 'test/fixtures/usb-devices-stub/usb-devices');
const CLI = path.join(ROOT, 'test/fixtures/arduino-cli-stub/arduino-cli');
const WIN = process.platform === 'win32' ? 'the stand-ins are scripts run by their #! line, not on Windows' : false;
let tmp;
before(async () => { tmp = await scratchEnv('silinx-usb-devices-'); await writeConfig({ mode: 'silinx', paths: { 'usb-devices': STUB, 'arduino-cli': CLI } }); setBuildChannel('dev'); });
after(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));
const P = await import('../server/projects.js');
const { readSystemProfiler, readPnpIds, readArduinoPorts, listUsbDevices, connectedBoards } = await import('../server/usb-devices.js');
const { TOOLS } = await import('../server/mcp.js');
const tool = n => TOOLS.find(t => t.name === n);
const cfgFile = f => path.join(process.env.SILINX_CONFIG_DIR, f);
const devices = list => fs.writeFileSync(cfgFile('usb-devices.json'), JSON.stringify(list));
const ports = list => fs.writeFileSync(cfgFile('arduino-ports.json'), JSON.stringify(list));

test('#5489 the system\'s listings read: system_profiler\'s two trees, Windows\'s PnP ids, arduino-cli\'s ports', () => {
  // (macOS 15 and later: SPUSBHostDataType, its USBDeviceKey… keys; a hub's devices in its _items)
  const host = { SPUSBHostDataType: [{ _name: 'USB 3.1 Bus', _items: [
    { _name: 'Digilent USB Device', USBDeviceKeyVendorID: '0x1443', USBDeviceKeyProductID: '0x0007', USBDeviceKeySerialNumber: 'D1', _items: [] },
    { _name: 'Hub', USBDeviceKeyVendorID: '0x05e3', USBDeviceKeyProductID: '0x0610', _items: [
      { _name: 'Arduino Uno', USBDeviceKeyVendorID: '0x2341', USBDeviceKeyProductID: '0x0043', USBDeviceKeySerialNumber: '85735313' }] }] }] };
  assert.deepEqual(readSystemProfiler(JSON.stringify(host)), [
    { vendor: '1443', product: '0007', serial: 'D1', name: 'Digilent USB Device' },
    { vendor: '05e3', product: '0610', name: 'Hub' },
    { vendor: '2341', product: '0043', serial: '85735313', name: 'Arduino Uno' }]);
  // (before: SPUSBDataType, vendor_id with its maker's name)
  const old = { SPUSBDataType: [{ _name: 'USB31Bus', _items: [{ _name: 'USB Serial', vendor_id: '0x1a86  (QinHeng Electronics)', product_id: '0x7523', serial_num: '' }] }] };
  assert.deepEqual(readSystemProfiler(JSON.stringify(old)), [{ vendor: '1a86', product: '7523', name: 'USB Serial' }]);
  assert.deepEqual(readSystemProfiler('not json'), []);
  assert.deepEqual(readPnpIds('USB\\VID_2341&PID_0043\\85735313\r\nUSB\\VID_1A86&PID_7523\\5&2B3C&0&2\r\nUSB\\VID_0403&PID_6010&MI_00\\6&1\r\nUSB\\ROOT_HUB30\\4&1\r\n'), [
    { vendor: '2341', product: '0043', serial: '85735313' }, { vendor: '1a86', product: '7523' }]);
  const cli = { detected_ports: [
    { port: { address: '/dev/cu.Bluetooth-Incoming-Port', protocol: 'serial', properties: {} } },
    { matching_boards: [{ name: 'Arduino Uno', fqbn: 'arduino:avr:uno' }], port: { address: '/dev/cu.usbmodem101', protocol: 'serial', properties: { pid: '0x0043', vid: '0x2341', serialNumber: '85735313' } } }] };
  assert.deepEqual(readArduinoPorts(JSON.stringify(cli)), [{ vendor: '2341', product: '0043', serial: '85735313', name: 'Arduino Uno', port: '/dev/cu.usbmodem101' }]);
  assert.deepEqual(readArduinoPorts('[]'), []);
});

test('#5489 the listing: the user\'s command\'s devices, arduino-cli\'s serial ports joined to them', { skip: WIN }, async () => {
  devices([{ vendor: '1443', product: '0007', serial: 'D1', name: 'Digilent USB Device' }, { vendor: '2341', product: '0043', serial: 'A1' }]);
  ports([{ matching_boards: [{ name: 'Arduino Uno' }], port: { address: '/dev/cu.usbmodem101', properties: { vid: '0x2341', pid: '0x0043', serialNumber: 'A1' } } },
    { port: { address: '/dev/cu.usbserial-110', properties: { vid: '0x1a86', pid: '0x7523' } } }]);
  assert.deepEqual(await listUsbDevices(), [
    { vendor: '1443', product: '0007', serial: 'D1', name: 'Digilent USB Device' },
    { vendor: '2341', product: '0043', serial: 'A1', port: '/dev/cu.usbmodem101', name: 'Arduino Uno' },
    { vendor: '1a86', product: '7523', port: '/dev/cu.usbserial-110' }]);
  fs.writeFileSync(cfgFile('usb-devices.json'), 'nope');
  await assert.rejects(listUsbDevices(), { message: 'usb-devices: not a list of USB devices as JSON' });
});

test('#5489 Connected Boards: the uart-avr System\'s nodes matched, their lines; a board missing, said; the MCP\'s check_system boards', { skip: WIN }, async () => {
  await P.createProject({ name: 'ua', template: 'uart-avr' });
  devices([{ vendor: '1443', product: '0007', serial: 'D1', name: 'Digilent USB Device' }]);
  ports([{ port: { address: '/dev/cu.usbmodem101', properties: { vid: '0x2341', pid: '0x0043', serialNumber: 'A1' } } }]);
  const r = await connectedBoards('ua');
  assert.deepEqual(r.lines, [
    'Connected USB devices (2):',
    '  USB 1443:0007, serial D1 (Digilent USB Device)',
    '  USB 2341:0043, serial A1 (port /dev/cu.usbmodem101)',
    'The System\'s nodes:',
    '  fpga: USB 1443:0007, serial D1 (Digilent USB Device)',
    '  uno: USB 2341:0043, serial A1 (port /dev/cu.usbmodem101)',
  ]);
  assert.deepEqual(r.nodes.map(n => [n.id, n.device?.serial ?? null, n.message]), [['fpga', 'D1', null], ['uno', 'A1', null]]);
  // the Arduino unplugged: said
  ports([]);
  const c = await tool('check_system').run({ project: 'ua', file: 'uart_avr.sys.json', boards: true });
  assert.deepEqual(c.data.boards.lines.slice(-2), ['  fpga: USB 1443:0007, serial D1 (Digilent USB Device)',
    'WARNING: uno: no board connected for it (Arduino Uno, USB 2341:0043 or 2341:0001 or 2341:0243 or 2a03:0043 or 1a86:7523)']);
  assert.deepEqual(c.data.boards.nodes.map(n => n.id), ['fpga', 'uno']);
  assert.equal((await tool('check_system').run({ project: 'ua', file: 'uart_avr.sys.json' })).data.boards, undefined, 'not listed unless asked');
  // (its serial number, by edit_system: its own board)
  await tool('edit_system').run({ project: 'ua', file: 'uart_avr.sys.json', edits: [{ action: 'change_node', node: 'uno', fields: { usb: { serial: 'B2' } } }] });
  ports([{ port: { address: '/dev/cu.usbmodem101', properties: { vid: '0x2341', pid: '0x0043', serialNumber: 'A1' } } }, { port: { address: '/dev/cu.usbmodem102', properties: { vid: '0x2341', pid: '0x0043', serialNumber: 'B2' } } }]);
  const s = await connectedBoards('ua');
  assert.equal(s.nodes.find(n => n.id === 'uno').device.port, '/dev/cu.usbmodem102');
  await P.createProject({ name: 'bl', template: 'blinky' });
  await assert.rejects(connectedBoards('bl'), { status: 400, message: 'the project \'bl\' has no System as its top: a build plan is a System\'s' });
});
