// Silinx - a real board's serial port (#5449, roadmap #4695's phase 3, docs/SYSTEMS.md, Real boards): the System's serial
// terminal joined to a board's USB serial port (an Arduino's, an FPGA board's USB-UART), at its link's baud and frame. The
// port is the browser's Web Serial one (`navigator.serial`, Chrome and Edge) or anything with its shape ({ open(options),
// readable, writable, getInfo(), close() }: a test's fake); the local server's is arduino-cli's monitor
// (server/serial-monitor.js, monitorConfig). What the terminal shows is the simulation's text (core/system-run.js
// bytesText), so a class compares the simulation, the emulation and the board.
//
//   const line = new SerialLine(port, { baud: 9600, frame: '8N1' }, { onBytes });
//   await line.open(); await line.write(bytes); line.text(); await line.close();
//
// Isomorphic ES module, no DOM.
import { parseFrame } from './system-decode.js';
import { bytesText } from './system-run.js';
import { nodeUsbIds } from './system-usb.js';

const PARITY = { N: 'none', E: 'even', O: 'odd' };
const MAX_BYTES = 20000;   // (the bytes a terminal keeps)

/** Why `nav` (the browser's navigator) has no Web Serial, or null when it has. */
export function webSerialMissing(nav) {
  return nav?.serial?.requestPort ? null : 'Web Serial is not in this browser: a real board\'s serial port needs Chrome or Edge (not Safari, nor the iPad)';
}

/** A link's baud and frame ('8N1') as Web Serial's open options ({ baudRate, dataBits, parity, stopBits }); throws when
 *  they are not a UART's. */
export function serialOptions({ baud = 9600, frame = '8N1' } = {}) {
  const f = parseFrame(frame);
  if (!f) throw new Error(`'${frame}' is not a UART's frame (data bits 5 to 8, parity N, E or O, stop bits 1 or 2: 8N1)`);
  if (!(Number.isInteger(baud) && baud > 0)) throw new Error(`'${baud}' is not a baud rate (a whole number above 0)`);
  if (f.bits < 7) throw new Error(`a serial port has 7 or 8 data bits, not ${f.bits} (the frame ${frame})`);
  return { baudRate: baud, dataBits: f.bits, parity: PARITY[f.parity], stopBits: f.stop };
}

/** The same settings as arduino-cli's monitor takes them (`--config`): `baudrate=9600,bits=8,parity=none,stop_bits=1`. */
export function monitorConfig(link) {
  const o = serialOptions(link);
  return `baudrate=${o.baudRate},bits=${o.dataBits},parity=${o.parity},stop_bits=${o.stopBits}`;
}

/** The USB filters of Web Serial's port chooser for the node `node` (an Arduino's boards' USB ids; [] for a board whose
 *  serial port Silinx cannot tell: an FPGA board's, through a USB-UART adapter). */
export function portFilters(node) {
  if (node?.kind !== 'mcu' && !node?.usb?.vendor) return [];
  return nodeUsbIds(node).map(id => ({ usbVendorId: parseInt(id.vendor, 16), ...(id.product && { usbProductId: parseInt(id.product, 16) }) }));
}

/** A port's USB id as the console says it (`USB 2341:0043`), from its getInfo(); 'a serial port' when it has none. */
export function portText(info) {
  const h4 = v => Number(v).toString(16).padStart(4, '0');
  return info?.usbVendorId != null ? `USB ${h4(info.usbVendorId)}:${info.usbProductId != null ? h4(info.usbProductId) : '????'}` : 'a serial port';
}

/** The node at the other end of the terminal `id`'s link in the System `sys` (the board it talks to), and the link; or
 *  { node: null, link: null }. */
export function terminalPeer(sys, id) {
  const link = (sys?.links || []).find(l => l.kind === 'uart' && [l.a, l.b].some(e => String(e).split('.')[0] === id));
  if (!link) return { node: null, link: null };
  const other = String(String(link.a).split('.')[0] === id ? link.b : link.a).split('.')[0];
  return { node: (sys.nodes || []).find(n => n.id === other) || null, link };
}

/** A serial terminal on a real board's port: its bytes read as they come (`received`: [{ t (ms since open), byte }]), the
 *  bytes typed written. */
export class SerialLine {
  /** port: a Web Serial port (or its shape); link: { baud, frame }; onBytes(bytes): each read's bytes, onClose(error):
   *  the port lost (unplugged), or closed (error null). */
  constructor(port, link = {}, { onBytes = () => {}, onClose = () => {}, now = () => Date.now() } = {}) {
    this.port = port;
    this.options = serialOptions(link);
    this.onBytes = onBytes;
    this.onClose = onClose;
    this.now = now;
    this.received = [];
    this.sent = 0;
    this.open_ = false;
  }

  async open() {
    await this.port.open(this.options);
    this.open_ = true;
    this.start = this.now();
    this.reading = this.readLoop();
  }

  async readLoop() {
    let error = null;
    while (this.open_ && this.port.readable) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (!value?.length) continue;
          const t = this.now() - this.start;
          for (const byte of value) this.received.push({ t, byte });
          if (this.received.length > MAX_BYTES) this.received.splice(0, this.received.length - MAX_BYTES);
          this.onBytes([...value]);
        }
      } catch (e) { if (this.open_) error = e; } finally { this.reader.releaseLock(); this.reader = null; }
      if (error) break;
    }
    const was = this.open_;
    this.open_ = false;
    if (was && error) { try { await this.port.close(); } catch { /* (already gone) */ } this.onClose(error); }
  }

  /** The bytes `bytes` written on the port. */
  async write(bytes) {
    if (!this.open_) throw new Error('the serial port is not open');
    const w = this.port.writable.getWriter();
    try { await w.write(Uint8Array.from(bytes)); this.sent += bytes.length; } finally { w.releaseLock(); }
  }

  /** What the terminal shows: the simulation's text of the bytes received. */
  text() { return bytesText(this.received); }

  get isOpen() { return this.open_; }

  async close() {
    if (!this.open_) return;
    this.open_ = false;
    try { await this.reader?.cancel(); } catch { /* (its stream already ended) */ }
    await this.reading;
    await this.port.close();
    this.onClose(null);
  }
}
