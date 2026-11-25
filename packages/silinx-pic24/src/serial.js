// silinx-pic24 - a serial terminal on two pins (#5481): what the Explorer 16/32's MCP2221A USB-UART does between the
// device's pins and a terminal: the device's TX pin's frames decoded into characters (8N1 at its baud), characters
// typed sent as frames on the device's RX pin. It reads and drives the pins as the outside does (gpio.js's levels and
// setInput), so the device's UART, PPS and ports are all in the path.

export class SerialTerminal {
  /** dev: gb610.js's device; tx: the device's TX pin ('RF5'), rx: its RX pin ('RF4'); baud. */
  constructor(dev, { tx, rx, baud = 9600 } = {}) {
    Object.assign(this, { dev, tx, rx, baud, received: [], listeners: [] });
    this.busy = false;
    this.sendEnd = 0;
    dev.ports.setInput(rx, 1);   // (the line idle)
    dev.ports.onLevel((pin, level) => { if (pin === tx && level === 0) this.start(); });
  }

  get bitPs() { return 1e12 / this.baud; }
  onReceive(fn) { this.listeners.push(fn); }
  /** The characters received so far, as text. */
  get text() { return String.fromCharCode(...this.received); }

  // the device's start bit: its 8 bits sampled at their middles, its stop bit
  start() {
    if (this.busy) return;
    this.busy = true;
    const { mcu, ports } = this.dev, t0 = mcu.time, bit = this.bitPs;
    let v = 0;
    for (let i = 0; i < 8; i++) mcu.schedule(t0 + (i + 1.5) * bit, () => { if (ports.level(this.tx)) v |= 1 << i; });
    mcu.schedule(t0 + 9.5 * bit, () => {
      this.busy = false;
      if (!ports.level(this.tx)) return;   // (no stop bit: not a character)
      this.received.push(v);
      for (const fn of this.listeners) fn(v);
    });
  }

  /** Characters typed: each a frame on the device's RX pin, one after another, from now. */
  type(text) {
    const { mcu, ports } = this.dev, bit = this.bitPs;
    let t = Math.max(mcu.time, this.sendEnd);
    for (const ch of String(text)) {
      const c = ch.charCodeAt(0) & 0xff, bits = [0, ...Array.from({ length: 8 }, (_, i) => (c >> i) & 1), 1];
      bits.forEach((b, i) => { const at = t + i * bit; if (at <= mcu.time) ports.setInput(this.rx, b); else mcu.schedule(at, () => ports.setInput(this.rx, b)); });
      t += 10 * bit;
    }
    this.sendEnd = t;
  }
}
