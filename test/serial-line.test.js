// A real board's serial port (#5449, core/serial-line.js): a link's baud and frame as Web Serial's options and as
// arduino-cli's monitor's, refused when they are not a serial port's; the port chooser's filters (an Arduino's boards'
// USB ids, none for an FPGA board's USB-UART); a terminal's board; a fake Web Serial port's bytes both ways, its text the
// simulation's (a TerminalNode decoding the same bytes from their frames), the port lost and closed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SerialLine, monitorConfig, portFilters, serialPortText, serialOptions, terminalPeer, webSerialMissing } from '../core/serial-line.js';
import { TerminalNode } from '../core/system-sim-terminal.js';
import { bytesText } from '../core/system-run.js';

/** A fake Web Serial port: open's options kept, its readable fed by push(bytes), failed by fail(error), its writes kept. */
export function fakePort(info = { usbVendorId: 0x2341, usbProductId: 0x0043 }) {
  let ctl = null;
  const port = {
    options: null, closed: 0, written: [], readable: null, writable: null,
    async open(o) {
      if (port.readable) throw new Error('The port is already open.');
      port.options = o;
      port.readable = new ReadableStream({ start(c) { ctl = c; } });
      port.writable = new WritableStream({ write(chunk) { port.written.push(...chunk); } });
    },
    async close() { port.closed++; port.readable = null; port.writable = null; },
    getInfo: () => info,
    push(bytes) { ctl.enqueue(Uint8Array.from(bytes)); },
    fail(e) { ctl.error(e); },
  };
  return port;
}
const tick = () => new Promise(r => setTimeout(r, 0));

test('#5449 a link\'s baud and frame as Web Serial\'s options and arduino-cli monitor\'s config; refused when not a serial port\'s', () => {
  assert.deepEqual(serialOptions({ baud: 9600, frame: '8N1' }), { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 });
  assert.deepEqual(serialOptions({ baud: 115200, frame: '7E2' }), { baudRate: 115200, dataBits: 7, parity: 'even', stopBits: 2 });
  assert.deepEqual(serialOptions({ baud: 300, frame: '8o1' }), { baudRate: 300, dataBits: 8, parity: 'odd', stopBits: 1 });
  assert.deepEqual(serialOptions(), { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 });
  assert.equal(monitorConfig({ baud: 9600, frame: '8N1' }), 'baudrate=9600,bits=8,parity=none,stop_bits=1');
  assert.equal(monitorConfig({ baud: 57600, frame: '7O2' }), 'baudrate=57600,bits=7,parity=odd,stop_bits=2');
  assert.throws(() => serialOptions({ baud: 9600, frame: '5N1' }), { message: 'a serial port has 7 or 8 data bits, not 5 (the frame 5N1)' });
  assert.throws(() => serialOptions({ baud: 9600, frame: '9N1' }), { message: '\'9N1\' is not a UART\'s frame (data bits 5 to 8, parity N, E or O, stop bits 1 or 2: 8N1)' });
  assert.throws(() => serialOptions({ baud: 0 }), { message: '\'0\' is not a baud rate (a whole number above 0)' });
  assert.throws(() => serialOptions({ baud: 96.5 }), { message: '\'96.5\' is not a baud rate (a whole number above 0)' });
});

test('#5449 Web Serial missing (Safari, the iPad) said; the chooser\'s filters; a port\'s USB id; a terminal\'s board', () => {
  assert.equal(webSerialMissing({}), 'Web Serial is not in this browser: a real board\'s serial port needs Chrome or Edge (not Safari, nor the iPad)');
  assert.equal(webSerialMissing(undefined), webSerialMissing({}));
  assert.equal(webSerialMissing({ serial: { requestPort() {} } }), null);
  // (an Uno: its ATmega16U2's and its clones' CH340; an FPGA board: any port, its USB-UART adapter's; a node's own id)
  assert.deepEqual(portFilters({ kind: 'mcu', board: 'arduino-nano' }), [{ usbVendorId: 0x0403, usbProductId: 0x6001 }, { usbVendorId: 0x1a86, usbProductId: 0x7523 }]);
  assert.equal(portFilters({ kind: 'mcu', board: 'arduino-uno' }).length, 5);
  assert.deepEqual(portFilters({ kind: 'fpga', board: 'basys2' }), []);
  assert.deepEqual(portFilters(null), []);
  assert.deepEqual(portFilters({ kind: 'fpga', board: 'basys2', usb: { vendor: '0403', product: null } }), [{ usbVendorId: 0x0403 }]);
  assert.equal(serialPortText({ usbVendorId: 0x2341, usbProductId: 0x43 }), 'USB 2341:0043');
  assert.equal(serialPortText({ usbVendorId: 0x2341 }), 'USB 2341:????');
  assert.equal(serialPortText({}), 'a serial port');
  const sys = { nodes: [{ id: 'term', kind: 'terminal' }, { id: 'uno', kind: 'mcu' }, { id: 'lone', kind: 'terminal' }], links: [{ id: 'console', kind: 'uart', a: 'uno.Serial', b: 'term.serial' }] };
  assert.deepEqual([terminalPeer(sys, 'term').node.id, terminalPeer(sys, 'term').link.id], ['uno', 'console']);
  assert.deepEqual(terminalPeer(sys, 'lone'), { node: null, link: null });
});

test('#5449 a fake port\'s bytes both ways at the link\'s settings; its text the simulation\'s terminal\'s for the same bytes', async () => {
  const port = fakePort(), got = [];
  let t = 1000;
  const line = new SerialLine(port, { baud: 9600, frame: '8N1' }, { onBytes: b => got.push(b), now: () => t });
  await line.open();
  assert.deepEqual(port.options, { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 });
  assert.equal(line.isOpen, true);
  const bytes = [...new TextEncoder().encode('Hi!\r\n'), 0x00, 0xff, 0x09];
  t = 1005;
  port.push(bytes.slice(0, 3));
  await tick();
  t = 1020;
  port.push(bytes.slice(3));
  await tick();
  assert.deepEqual(got, [bytes.slice(0, 3), bytes.slice(3)]);
  assert.deepEqual(line.received.map(r => r.t), [5, 5, 5, 20, 20, 20, 20, 20]);
  assert.equal(line.text(), 'Hi!\r\n\\x00\\xff\t');
  // (the simulation's terminal: the same bytes' frames on its RX, decoded at its settings)
  const tx = new TerminalNode({ baud: 9600, frame: '8N1' }), rx = new TerminalNode({ baud: 9600, frame: '8N1' });
  rx.setPin('rx', 1);
  tx.advanceTo(1e6);
  tx.send(bytes);
  for (const c of tx.advanceTo(12e9)) { rx.advanceTo(c.t); rx.setPin('rx', c.value); }
  rx.advanceTo(12e9);
  assert.equal(line.text(), bytesText(rx.received));
  // the line typed: written on the port
  await line.write([0x41, 0x0a]);
  assert.deepEqual(port.written, [0x41, 0x0a]);
  assert.equal(line.sent, 2);
  await line.close();
  assert.equal(port.closed, 1);
  assert.equal(line.isOpen, false);
  await assert.rejects(line.write([1]), { message: 'the serial port is not open' });
  await line.close();
  assert.equal(port.closed, 1, 'closed once');
});

test('#5449 the board unplugged: the port lost, said once; a frame the port cannot take refused before it opens', async () => {
  const port = fakePort(), closes = [];
  const line = new SerialLine(port, {}, { onClose: e => closes.push(e?.message ?? null) });
  await line.open();
  port.fail(new Error('The device has been lost.'));
  await line.reading;
  assert.deepEqual(closes, ['The device has been lost.']);
  assert.equal(line.isOpen, false);
  assert.equal(port.closed, 1);
  // (closed by the user: onClose(null))
  const p2 = fakePort(), c2 = [];
  const l2 = new SerialLine(p2, {}, { onClose: e => c2.push(e) });
  await l2.open();
  await l2.close();
  assert.deepEqual(c2, [null]);
  assert.throws(() => new SerialLine(fakePort(), { frame: '6N1' }), { message: 'a serial port has 7 or 8 data bits, not 6 (the frame 6N1)' });
});
