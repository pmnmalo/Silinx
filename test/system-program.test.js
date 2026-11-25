// A System's programming steps (#5489's part 3, #5447, core/system-program.js): over the build plan and the boards
// matched by their USB id, in the plan's order; a board chosen by hand in place of the match; the refusals (not built, no
// board, two boards, a PIC24, a MicroPython node, an Arduino with no serial port) and the warnings (out of date, a board
// chosen by hand), their exact lines; a programmer's option that picks the board by its serial number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { programSteps, stepLine, toolBoard, deviceByKey } from '../core/system-program.js';
import { matchBoards } from '../core/system-usb.js';

const FPGA = { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: { tx: 'A3' }, interfaces: [] };
const UNO = { id: 'uno', kind: 'mcu', board: 'arduino-uno', interfaces: [] };
const sys = { nodes: [UNO, FPGA] };
const entry = (id, kind, o = {}) => ({ id, kind, board: null, build: null, image: kind === 'fpga' ? 'build/nodes/fpga/build/uart.bit' : 'uno/hello.hex', programmer: kind === 'fpga' ? 'jtag' : 'avrdude', sources: [], state: 'up to date', reason: null, ...o });
const PLAN = { nodes: [entry('fpga', 'fpga'), entry('uno', 'mcu', { state: 'given' })] };
const ADEPT = { vendor: '1443', product: '0007', serial: 'D1', name: 'Digilent USB Device' };
const UNO_A = { vendor: '2341', product: '0043', serial: 'A1', port: '/dev/cu.usbmodem101' };
const UNO_B = { vendor: '2341', product: '0043', serial: 'B2', port: '/dev/cu.usbmodem102' };
const steps = (devices, o = {}, plan = PLAN, s = sys) => programSteps(plan, matchBoards(s, devices), devices, o);

test('#5489 every node on its matched board, the FPGAs first; its lines', () => {
  const st = steps([UNO_A, ADEPT]);
  assert.deepEqual(st, [
    { id: 'fpga', kind: 'fpga', programmer: 'jtag', image: 'build/nodes/fpga/build/uart.bit', device: ADEPT, warning: null, refused: null },
    { id: 'uno', kind: 'mcu', programmer: 'avrdude', image: 'uno/hello.hex', device: UNO_A, warning: null, refused: null }]);
  assert.deepEqual(st.map(stepLine), [
    'fpga: build/nodes/fpga/build/uart.bit on USB 1443:0007, serial D1 (Digilent USB Device), over JTAG',
    'uno: uno/hello.hex on USB 2341:0043, serial A1 (port /dev/cu.usbmodem101), by avrdude (arduino-cli upload)']);
  assert.deepEqual(steps([UNO_A, ADEPT], { node: 'uno' }).map(s => s.id), ['uno'], 'a node alone');
});

test('#5489 the refusals and warnings: no board, two boards, not built, out of date, a PIC24, MicroPython, no serial port', () => {
  const [f, u] = steps([UNO_A, UNO_B]);
  assert.equal(stepLine(f), 'fpga: not programmed: no board connected for it (Digilent Basys2, USB 1443)');
  assert.equal(f.choose, true, 'a board the user may pick');
  assert.equal(stepLine(u), 'uno: not programmed: 2 connected boards could be it (USB 2341:0043, serial A1 (port /dev/cu.usbmodem101); USB 2341:0043, serial B2 (port /dev/cu.usbmodem102)): give it its board\'s serial number');
  assert.equal(u.choose, true);
  const plan = { nodes: [entry('fpga', 'fpga', { state: 'not built', reason: 'no build/nodes/fpga/build/uart.bit yet' }), entry('uno', 'mcu', { state: 'out of date', reason: 'uno/hello.ino changed since its last build' })] };
  const [nb, od] = steps([UNO_A, ADEPT], {}, plan);
  assert.equal(stepLine(nb), 'fpga: not programmed: not built yet (no build/nodes/fpga/build/uart.bit yet): Build All first');
  assert.equal(nb.choose, undefined, 'not a board\'s problem');
  assert.deepEqual([od.refused, od.warning], [null, 'out of date (uno/hello.ino changed since its last build): its last build is programmed']);
  const pic = { nodes: [entry('pic', 'mcu', { programmer: 'pickit', image: 'pic/blink.hex', state: 'given' }), entry('py', 'mcu', { programmer: 'repl', image: null, state: 'nothing to build' }), entry('t', 'mcu', { programmer: 'avrdude', state: 'not buildable', reason: 'no sketch in its folder t/' })] };
  assert.deepEqual(steps([], {}, pic).map(stepLine), [
    'pic: not programmed: a PIC24 is not programmed by Silinx yet: load its pic/blink.hex with MPLAB IPE',
    'py: not programmed: a MicroPython node is not programmed by Silinx yet: copy its .py files with mpremote',
    't: not programmed: it cannot be programmed: no sketch in its folder t/']);
  // (an Uno seen by the system with no serial port: arduino-cli's list did not give one)
  const [, np] = steps([ADEPT, { ...UNO_A, port: undefined }]);
  assert.equal(np.refused, 'its board (USB 2341:0043, serial A1) has no serial port: arduino-cli\'s board list does not see it');
});

test('#5489 a board chosen by hand: by its serial number or its port, in place of the match; one not connected, refused', () => {
  const [, u] = steps([UNO_A, UNO_B, ADEPT], { chosen: { uno: '/dev/cu.usbmodem102' } });
  assert.deepEqual([u.device, u.refused, u.warning], [UNO_B, null, 'its board chosen by hand: USB 2341:0043, serial B2 (port /dev/cu.usbmodem102)']);
  const [f] = steps([UNO_A, ADEPT], { chosen: { fpga: 'D1' } });
  assert.equal(f.device, ADEPT);
  const [, none] = steps([UNO_A, ADEPT], { chosen: { uno: 'Z9' } });
  assert.equal(none.refused, 'no connected board with the serial number or port Z9');
  assert.equal(deviceByKey([UNO_A, UNO_B], 'B2'), UNO_B);
  assert.equal(deviceByKey([UNO_A], '/dev/cu.usbmodem101'), UNO_A);
  assert.equal(deviceByKey([UNO_A], 'constructor'), null);
});

test('#5489 the programmer\'s option that picks a board by its serial number', () => {
  assert.deepEqual(toolBoard('djtgcfg', ADEPT), { device: 'SN:D1' });
  assert.deepEqual(toolBoard('openFPGALoader', { vendor: '0403', product: '6010', serial: '210183A' }), { ftdiSerial: '210183A' });
  assert.equal(toolBoard('adepttool', ADEPT), null);
  assert.equal(toolBoard('djtgcfg', { vendor: '1443', product: '0007' }), null, 'no serial number: the tool\'s first board');
});
