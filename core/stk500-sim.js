// Silinx - a simulated Optiboot (#5448, core/stk500.js): an Arduino's bootloader answering the STK500 version 1 protocol
// as Optiboot's source (optiboot.c) does, on a flash of its own, for the tests of the upload (unit, and the interface's
// through a fake Web Serial port, simulatedPort) where no board is. It starts on a reset (DTR low, then high); out of it,
// the program runs and answers nothing. A command not ended by CRC_EOP leaves it (Optiboot's watchdog reset), as a wrong
// baud rate does. Its faults, for the tests: another chip's signature, a flash byte that does not take, a wrong answer.
//
//   const boot = new Optiboot({ signature, faults }); boot.feed(bytes) -> answer bytes; boot.flash, boot.commands
//   const port = simulatedPort(boot, { usbVendorId, usbProductId });   // Web Serial's shape
//
// Isomorphic ES module, no DOM.
import { STK } from './stk500.js';

// each command's bytes after its code, before CRC_EOP (a page's: its length's, read from its header)
const ARGS = { [STK.GET_SYNC]: 0, [STK.GET_PARAMETER]: 1, [STK.SET_DEVICE]: 20, [STK.SET_DEVICE_EXT]: 5, [STK.ENTER_PROGMODE]: 0,
  [STK.LEAVE_PROGMODE]: 0, [STK.LOAD_ADDRESS]: 2, [STK.UNIVERSAL]: 4, [STK.READ_PAGE]: 3, [STK.READ_SIGN]: 0 };

export class Optiboot {
  /** signature: its chip's; flash: its size; baud: the bootloader's (a port opened at another hears garbage); faults: {
   *  signature (another chip's), stuck (a byte address whose flash byte stays 0xFF), insync (the byte it answers in
   *  place of INSYNC) }. */
  constructor({ signature = [0x1e, 0x95, 0x0f], flash = 32768, baud = 115200, faults = {} } = {}) {
    this.signature = faults.signature || signature;
    this.flash = new Uint8Array(flash).fill(0xff);
    this.baud = baud;
    this.faults = faults;
    this.running = false;      // (the bootloader's, after a reset)
    this.started = 0;          // (the program started by LEAVE_PROGMODE)
    this.address = 0;
    this.buf = [];
    this.commands = [];        // (each command's bytes, CRC_EOP included)
  }

  /** The board reset: the bootloader runs. */
  reset() { this.running = true; this.buf = []; }

  /** Bytes from the programmer: the bootloader's answer to the commands they complete. */
  feed(bytes) {
    const out = [];
    for (const b of bytes) {
      if (!this.running) continue;
      this.buf.push(b);
      const need = this.need();
      if (need == null || this.buf.length < need) continue;
      out.push(...this.command(this.buf.splice(0)));
    }
    return out;
  }

  // the bytes of the command begun in buf (its code, its arguments, CRC_EOP), or null while its header is not complete
  need() {
    const c = this.buf[0];
    if (c === STK.PROG_PAGE) return this.buf.length < 3 ? null : 4 + ((this.buf[1] << 8) | this.buf[2]) + 1;
    return 1 + (ARGS[c] ?? 0) + 1;
  }

  command(cmd) {
    this.commands.push(cmd);
    // (not ended by CRC_EOP: Optiboot's verifySpace starts its watchdog, the board resets into its program)
    if (cmd[cmd.length - 1] !== STK.CRC_EOP) { this.running = false; return []; }
    const c = cmd[0], data = [];
    if (c === STK.GET_PARAMETER) data.push(cmd[1] === 0x81 ? 8 : cmd[1] === 0x82 ? 3 : 0x03);
    else if (c === STK.LOAD_ADDRESS) this.address = (cmd[1] | (cmd[2] << 8)) * 2;
    else if (c === STK.UNIVERSAL) data.push(0x00);
    else if (c === STK.PROG_PAGE) {
      const n = (cmd[1] << 8) | cmd[2];
      for (let i = 0; i < n; i++) if (this.address + i !== this.faults.stuck) this.flash[this.address + i] = cmd[4 + i];
    } else if (c === STK.READ_PAGE) data.push(...this.flash.subarray(this.address, this.address + ((cmd[1] << 8) | cmd[2])));
    else if (c === STK.READ_SIGN) data.push(...this.signature);
    else if (c === STK.LEAVE_PROGMODE) { this.running = false; this.started++; }
    else if (ARGS[c] == null) return [STK.INSYNC, STK.UNKNOWN];
    return [this.faults.insync ?? STK.INSYNC, ...data, STK.OK];
  }
}

/** A Web Serial port (its shape) on the simulated bootloader `boot`: open at its baud rate (another: it hears nothing),
 *  setSignals resetting it on DTR's rising edge, its answers read. `info`: getInfo()'s USB ids. Its opens kept (`opens`). */
export function simulatedPort(boot, info = { usbVendorId: 0x2341, usbProductId: 0x0043 }) {
  let ctl = null, dtr = true, baud = 0;
  const port = {
    opens: [], closed: 0, readable: null, writable: null,
    async open(o) {
      if (port.readable) throw new Error('The port is already open.');
      port.opens.push(o);
      baud = o.baudRate;
      port.readable = new ReadableStream({ start(c) { ctl = c; } });
      port.writable = new WritableStream({ write(chunk) {
        const out = baud === boot.baud ? boot.feed([...chunk]) : [];
        if (out.length) ctl.enqueue(Uint8Array.from(out));
      } });
    },
    async setSignals(s) {
      if (s.dataTerminalReady === undefined) return;
      if (s.dataTerminalReady && !dtr) boot.reset();
      dtr = s.dataTerminalReady;
    },
    async close() { port.closed++; port.readable = null; port.writable = null; },
    getInfo: () => info,
  };
  return port;
}
