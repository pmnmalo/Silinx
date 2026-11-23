// An I²C peripheral's bus side (#5336, a circuit's part on an I²C bus: core/circuit-oled.js), fed SCL's and SDA's levels
// at each change: a START (SDA falling while SCL is high), its address byte and each byte after it, MSB first, each bit
// taken as SCL rises; after the 8th bit, its ACK: SDA pulled low from the next SCL fall until the one after it; a STOP
// (SDA rising while SCL is high). Its own address written to: each byte acknowledged and handed on; another address, or
// a read (reads are not simulated): not acknowledged, the bus ignored until the next START. Isomorphic module.

/**
 * A peripheral at `address` (7 bits): feed(scl, sda) at each change of either ('0', '1', another level: neither) returns
 * whether it pulls SDA low now; onStart() its address acknowledged, onByte(b) each byte after it, onStop() a STOP after
 * it. reset() as at power-on.
 */
export function createI2cPeripheral(address, { onStart = () => {}, onByte = () => {}, onStop = () => {} } = {}) {
  let scl, sda, state, bits, byte, acking, pull;
  function reset() { scl = null; sda = null; state = 'idle'; bits = 0; byte = 0; acking = false; pull = false; }
  reset();
  function feed(c, d) {
    const wasScl = scl, wasSda = sda;
    scl = c; sda = d;
    // (START and STOP: SDA changing while SCL stays high)
    if (c === '1' && wasScl === '1' && d !== wasSda) {
      if (d === '0' && wasSda === '1') { const was = state; state = 'addr'; bits = 0; byte = 0; acking = false; pull = false; if (was === 'data') onStop(); }
      else if (d === '1' && wasSda === '0') { if (state === 'data') onStop(); state = 'idle'; acking = false; pull = false; }
      return pull;
    }
    if (state === 'idle' || state === 'ignore') return pull;
    // (a bit, as SCL rises; not the ACK's)
    if (c === '1' && wasScl === '0' && !acking) { byte = ((byte << 1) | (d === '1' ? 1 : 0)) & 0xff; bits++; }
    // (SCL falling: after 8 bits the ACK, pulled low; after the ACK's clock, released)
    if (c === '0' && wasScl === '1') {
      if (acking) { acking = false; pull = false; bits = 0; byte = 0; }
      else if (bits === 8) {
        if (state === 'addr') {
          if (byte >> 1 === address && !(byte & 1)) { state = 'data'; acking = true; pull = true; onStart(); }
          else { state = 'ignore'; bits = 0; }
        } else { acking = true; pull = true; onByte(byte); }
      }
    }
    return pull;
  }
  return { feed, reset, get pulling() { return pull; } };
}
