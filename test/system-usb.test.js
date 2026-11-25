// A System's nodes matched to the connected boards by their USB id (#5489's part 2, core/system-usb.js, core/usb-id.js):
// a USB id read and a node's usb checked; each node's ids (an FPGA board's the browser's programmer's, an Arduino's USB
// serial chips, the Explorer 16/32's Microchip debugger, the node's own); the match (a board each, a serial number's own
// board, a node with none, two boards one node could be, one board two nodes could be, a board with no known id) and
// its exact lines; the node's usb in the document, its edit and its check, their messages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchBoards, boardLines, nodeUsbIds, deviceText, MCU_USB } from '../core/system-usb.js';
import { readUsbId, usbIdText, usbError, normalUsb } from '../core/usb-id.js';
import { normalizeSystem, readSystem, writeSystem } from '../core/system-doc.js';
import { changeNode } from '../core/system-edit.js';
import { checkSystem } from '../core/system-check.js';

const FPGA = { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: {}, interfaces: [] };
const UNO = { id: 'uno', kind: 'mcu', board: 'arduino-uno', interfaces: [] };
const NANO = { id: 'nano', kind: 'mcu', board: 'arduino-nano', interfaces: [] };
const sys = (...nodes) => ({ nodes: [...nodes, { id: 'term', kind: 'terminal', interfaces: [] }] });
const ADEPT = { vendor: '1443', product: '0007', serial: 'D1', name: 'Digilent USB Device' };
const UNO_A = { vendor: '2341', product: '0043', serial: 'A1', port: '/dev/cu.usbmodem101' };
const UNO_B = { vendor: '2341', product: '0043', serial: 'B2', port: '/dev/cu.usbmodem102' };
const CH340 = { vendor: '1a86', product: '7523', port: '/dev/cu.usbserial-110' };

test('#5489 a USB id read and written; a node\'s usb checked, with its messages', () => {
  assert.deepEqual(readUsbId('2341:0043'), { vendor: '2341', product: '0043' });
  assert.deepEqual(readUsbId(' 0x1A86 : 0x7523 '), { vendor: '1a86', product: '7523' });
  assert.deepEqual(readUsbId('04D8'), { vendor: '04d8', product: null });
  for (const bad of ['', '234', '2341:43', 'zzzz', '2341:0043:1', null]) assert.equal(readUsbId(bad), null, String(bad));
  assert.equal(usbIdText({ vendor: '04d8', product: null }), '04d8');
  assert.equal(usbIdText({ vendor: '2341', product: '0043' }), '2341:0043');
  assert.equal(usbError(null), null);
  assert.equal(usbError({ vendor: '2341', product: '0043', serial: 'A1' }), null);
  assert.equal(usbError('A1'), 'its usb is { vendor, product, serial }');
  assert.equal(usbError({ port: 'x' }), 'its usb has no field \'port\' (vendor, product, serial)');
  assert.equal(usbError({ vendor: '23x1' }), 'its USB vendor id \'23x1\' is not 4 hexadecimal digits');
  assert.equal(usbError({ product: '0043' }), 'its USB product id needs its vendor id');
  assert.equal(usbError({ serial: ' ' }), 'its USB serial number is a text of 1 to 64 characters');
  assert.equal(usbError({ serial: 'x'.repeat(65) }), 'its USB serial number is a text of 1 to 64 characters');
  assert.deepEqual(normalUsb({ vendor: '1A86', serial: ' S9 ' }), { vendor: '1a86', serial: 'S9' });
  assert.equal(normalUsb({}), null);
});

test('#5489 each node\'s USB ids: its board\'s (the FPGA board\'s programmer, the Arduino\'s chips, the Explorer\'s debugger), or its own', () => {
  assert.deepEqual(nodeUsbIds(FPGA), [{ vendor: '1443', product: null }], 'the Basys2\'s Digilent Adept');
  assert.deepEqual(nodeUsbIds({ ...FPGA, board: 'basys3', variant: undefined }), [{ vendor: '0403', product: '6010' }], 'the Basys 3\'s FT2232H');
  assert.deepEqual(nodeUsbIds({ ...FPGA, board: 'ulx3s', variant: undefined }), [{ vendor: '0403', product: '6015' }], 'the ULX3S\'s FT231X');
  assert.deepEqual(nodeUsbIds(UNO), MCU_USB['arduino-uno']);
  assert.deepEqual(nodeUsbIds(NANO).map(usbIdText), ['0403:6001', '1a86:7523']);
  assert.deepEqual(nodeUsbIds({ ...UNO, board: 'explorer-1632' }), [{ vendor: '04d8', product: null }]);
  assert.deepEqual(nodeUsbIds({ ...NANO, usb: { vendor: '10c4', product: 'ea60' } }), [{ vendor: '10c4', product: 'ea60' }], 'its own');
  assert.deepEqual(nodeUsbIds({ ...FPGA, board: 'nope' }), []);
  assert.deepEqual(nodeUsbIds({ id: 'term', kind: 'terminal' }), []);
});

test('#5489 every node matched to its board, the FPGAs first; the lines', () => {
  const devices = [UNO_A, ADEPT, CH340];
  // (the CH340 could be an Uno clone's or the Nano's: the Nano's, the Uno being the other board)
  const m = matchBoards(sys(UNO, FPGA, NANO), devices);
  assert.deepEqual(m.nodes, [{ id: 'fpga', device: ADEPT, message: null }, { id: 'uno', device: UNO_A, message: null }, { id: 'nano', device: CH340, message: null }]);
  assert.deepEqual(boardLines(m, devices), [
    'Connected USB devices (3):',
    '  USB 2341:0043, serial A1 (port /dev/cu.usbmodem101)',
    '  USB 1443:0007, serial D1 (Digilent USB Device)',
    '  USB 1a86:7523, no serial number (port /dev/cu.usbserial-110)',
    'The System\'s nodes:',
    '  fpga: USB 1443:0007, serial D1 (Digilent USB Device)',
    '  uno: USB 2341:0043, serial A1 (port /dev/cu.usbmodem101)',
    '  nano: USB 1a86:7523, no serial number (port /dev/cu.usbserial-110)',
  ]);
  assert.deepEqual(boardLines(matchBoards(sys(), []), []), ['No USB device connected.']);
});

test('#5489 a board missing, two boards one node could be, one board two nodes could be: their exact messages', () => {
  // (none connected)
  assert.deepEqual(boardLines(matchBoards(sys(FPGA, UNO), []), []), [
    'No USB device connected.', 'The System\'s nodes:',
    'WARNING: fpga: no board connected for it (Digilent Basys2, USB 1443)',
    'WARNING: uno: no board connected for it (Arduino Uno, USB 2341:0043 or 2341:0001 or 2341:0243 or 2a03:0043 or 1a86:7523)',
  ]);
  // (two Unos, one node)
  assert.deepEqual(matchBoards(sys(UNO), [UNO_A, UNO_B]).nodes, [{ id: 'uno', device: null,
    message: 'uno: 2 connected boards could be it (USB 2341:0043, serial A1 (port /dev/cu.usbmodem101); USB 2341:0043, serial B2 (port /dev/cu.usbmodem102)): give it its board\'s serial number' }]);
  // (one CH340, an Uno clone's or a Nano's: either node; said once)
  const both = matchBoards(sys(UNO, NANO), [CH340]);
  assert.deepEqual(both.nodes.map(n => n.device), [null, null]);
  assert.deepEqual(boardLines(both, [CH340]).slice(-1), ['WARNING: uno, nano: one connected board could be any of them (USB 1a86:7523, no serial number (port /dev/cu.usbserial-110)): give each its board\'s serial number']);
  // (a board Silinx has no USB id of)
  assert.deepEqual(matchBoards(sys({ ...FPGA, board: 'nope' }), [ADEPT]).nodes[0].message, 'fpga: Silinx knows no USB id of its board nope: give it its board\'s (its usb vendor and product)');
});

test('#5489 a serial number takes its own board, the others what is left; its board missing, said', () => {
  const m = matchBoards(sys({ ...UNO, usb: { serial: 'B2' } }, { ...UNO, id: 'uno2' }), [UNO_A, UNO_B]);
  assert.deepEqual(m.nodes, [{ id: 'uno', device: UNO_B, message: null }, { id: 'uno2', device: UNO_A, message: null }]);
  assert.deepEqual(matchBoards(sys({ ...UNO, usb: { serial: 'C3' } }), [UNO_A]).nodes[0].message, 'uno: no board connected for it (Arduino Uno, USB 2341:0043 or 2341:0001 or 2341:0243 or 2a03:0043 or 1a86:7523, serial C3)');
  // (its own id: a Nano clone with another chip)
  const own = { ...NANO, usb: { vendor: '10c4', product: 'ea60' } };
  const cp = { vendor: '10c4', product: 'ea60', serial: '0001' };
  assert.deepEqual(matchBoards(sys(own), [CH340, cp]).nodes, [{ id: 'nano', device: cp, message: null }]);
  // (a serial number of another kind of board: not its)
  assert.equal(matchBoards(sys({ ...UNO, usb: { serial: 'D1' } }), [ADEPT]).nodes[0].device, null);
  assert.equal(deviceText({ vendor: '2341', product: '0043' }), 'USB 2341:0043, no serial number');
});

test('#5489 the node\'s usb in the document, its edit and its check', () => {
  const text = writeSystem(normalizeSystem({ name: 's', nodes: [{ ...UNO, usb: { vendor: '2341', product: '0043', serial: 'A1' } }, { id: 'term', kind: 'terminal', usb: { serial: 'x' }, interfaces: [] }], links: [] }));
  const back = readSystem(text).system;
  assert.deepEqual(back.nodes[0].usb, { vendor: '2341', product: '0043', serial: 'A1' });
  assert.equal(back.nodes[1].usb, undefined, 'a terminal has no board');
  let r = changeNode(back, 'uno', { usb: { serial: 'B2' } });
  assert.deepEqual(r.system.nodes[0].usb, { vendor: '2341', product: '0043', serial: 'B2' }, 'merged');
  r = changeNode(r.system, 'uno', { usb: { vendor: null, product: '' } });
  assert.deepEqual(r.system.nodes[0].usb, { serial: 'B2' }, 'its id removed, its serial kept');
  assert.equal(changeNode(r.system, 'uno', { usb: null }).system.nodes[0].usb, undefined);
  assert.deepEqual(changeNode(back, 'uno', { usb: { vendor: 'zz' } }), { error: 'uno: its USB vendor id \'zz\' is not 4 hexadecimal digits' });
  assert.deepEqual(changeNode(back, 'uno', { usb: 'A1' }), { error: 'uno: its usb is { vendor, product, serial }' });
  assert.deepEqual(changeNode(back, 'term', { usb: { serial: 'x' } }), { error: 'term: a Serial terminal node has no field \'usb\' (id, x, y)' });
  assert.deepEqual(changeNode({ nodes: [FPGA] }, 'fpga', { usb: { serial: 'D1' } }).system.nodes[0].usb, { serial: 'D1' });
  // the check: one serial number one board; an id that is not one
  const two = normalizeSystem({ nodes: [{ ...UNO, usb: { serial: 'A1' } }, { ...NANO, usb: { serial: 'A1' } }, { ...FPGA, usb: { vendor: '14x3' } }] });
  assert.deepEqual(checkSystem(two).filter(d => /USB/.test(d.message)).map(d => [d.severity, d.message]), [
    ['error', 'uno and nano have the same USB serial number A1: one board is one node'],
    ['error', 'fpga: its USB vendor id \'14x3\' is not 4 hexadecimal digits'],
  ]);
});
