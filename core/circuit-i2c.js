// An I²C peripheral's bus side (#5336, a circuit's part on an I²C bus: core/circuit-oled.js), fed SCL's and SDA's levels
// at each change: a START (SDA falling while SCL is high), its address byte and each byte after it, MSB first, each bit
// taken as SCL rises; after the 8th bit, its ACK: SDA pulled low from the next SCL fall until the one after it; a STOP
// (SDA rising while SCL is high). Its own address written to: each byte acknowledged and handed on; read from (#5342,
// `onRead`): its bytes sent MSB first, each bit set as SCL falls, then the master's ACK read as SCL rises (an ACK: the
// next byte; a NACK: SDA released until the STOP); another address, or a read with no `onRead`: not acknowledged, the
// bus ignored until the next START. Isomorphic module.

/**
 * A peripheral at `address` (7 bits): feed(scl, sda) at each change of either ('0', '1', another level: neither) returns
 * whether it pulls SDA low now; onStart(read) its address acknowledged, onByte(b) each byte written after it, onRead()
 * the next byte to send (none: reads not acknowledged), onStop() a STOP after it. `address` a number, or a function of
 * the time of the START (its address pins). reset() as at power-on.
 */
export function createI2cPeripheral(address, { onStart = () => {}, onByte = () => {}, onRead = null, onStop = () => {} } = {}) {
  let scl, sda, state, bits, byte, acking, pull, out, sent, master;
  function reset() { scl = null; sda = null; state = 'idle'; bits = 0; byte = 0; acking = false; pull = false; out = 0; sent = 0; master = null; }
  const me = () => (typeof address === 'function' ? address() : address);
  // (a byte to send: its first bit on SDA, MSB first; low pulls, high releases)
  const load = () => { out = onRead() & 0xff; sent = 0; pull = !((out >> 7) & 1); };
  reset();
  function feed(c, d) {
    const wasScl = scl, wasSda = sda;
    scl = c; sda = d;
    // (START and STOP: SDA changing while SCL stays high)
    if (c === '1' && wasScl === '1' && d !== wasSda) {
      if (d === '0' && wasSda === '1') { const was = state; state = 'addr'; bits = 0; byte = 0; acking = false; pull = false; if (was === 'data' || was === 'read') onStop(); }
      else if (d === '1' && wasSda === '0') { if (state === 'data' || state === 'read') onStop(); state = 'idle'; acking = false; pull = false; }
      return pull;
    }
    if (state === 'idle' || state === 'ignore') return pull;
    if (state === 'read') return readBit(c, wasScl, d);
    // (a bit, as SCL rises; not the ACK's)
    if (c === '1' && wasScl === '0' && !acking) { byte = ((byte << 1) | (d === '1' ? 1 : 0)) & 0xff; bits++; }
    // (SCL falling: after 8 bits the ACK, pulled low; after the ACK's clock, released)
    if (c === '0' && wasScl === '1') {
      if (acking) { acking = false; pull = false; bits = 0; byte = 0; }
      else if (bits === 8) {
        if (state === 'addr') {
          const read = !!(byte & 1);
          if (byte >> 1 === me() && (!read || onRead)) { state = read ? 'read' : 'data'; acking = true; pull = true; master = null; onStart(read); }
          else { state = 'ignore'; bits = 0; }
        } else { acking = true; pull = true; onByte(byte); }
      }
    }
    return pull;
  }
  // a read: the address's ACK released and the first byte's MSB set as SCL falls; each bit after it as SCL falls; after
  // the 8th, SDA released for the master's ACK, read as SCL rises; at the next fall, its next byte or (a NACK) nothing
  function readBit(c, wasScl, d) {
    if (c === '1' && wasScl === '0' && sent === 8) master = d === '0';
    if (c !== '0' || wasScl !== '1') return pull;
    if (acking) { acking = false; load(); return pull; }
    if (sent < 7) { sent++; pull = !((out >> (7 - sent)) & 1); return pull; }
    if (sent === 7) { sent = 8; pull = false; master = null; return pull; }
    if (master) load(); else { state = 'ignore'; pull = false; }
    return pull;
  }
  return { feed, reset, get pulling() { return pull; } };
}
