// A temperature sensor LM75 on I²C (#5342, part of #3902; docs/CIRCUITS.md): the circuit's part (a DIP-8 on the
// breadboard: 1 SDA, 2 SCL, 3 OS, 4 GND, 5 A2, 6 A1, 7 A0, 8 VCC; SDA and OS open drain) and its registers as the
// datasheet says them (National Semiconductor / TI LM75): its address 0x48 + A2..A0 (core/circuit-i2c.js, reads too);
// a write's first byte the pointer (0 temperature, 1 configuration, 2 THYST, 3 TOS), the bytes after it its register's
// (the configuration one, THYST and TOS two, MSB first); a read the pointed register's, two bytes (the configuration one),
// again from its MSB at each read, the pointer kept. The temperature 9 bits, 0.5 °C, two's complement, left-justified in
// 16 (25 °C: 0x1900); the configuration's shutdown (bit 0: no conversion, its last kept), comparator or interrupt mode
// (bit 1), OS's polarity (bit 2: active high), its fault queue (bits 4..3: 1, 2, 4 or 6 conversions over or under); THYST
// 75 °C and TOS 80 °C at power-on. OS: in comparator mode active from a conversion over TOS (its fault queue's count
// of them) until one under THYST; in interrupt mode active from one over TOS until a read, then from one under THYST
// until a read, and so on. Its temperature the student's (the part's `temp`, set while running); each set a conversion.
// Isomorphic module.

import { dip } from './circuit-ics.js';

const PIN_NAMES = ['SDA', 'SCL', 'OS', 'GND', 'A2', 'A1', 'A0', 'VCC'];
const DIR = { SDA: 'oc', SCL: 'in', OS: 'oc', GND: 'gnd', A2: 'in', A1: 'in', A0: 'in', VCC: 'vcc' };
const at = dip(8);
/** A temperature's range (°C) and its step: the LM75's. */
export const LM75_TEMP = { min: -55, max: 125, step: 0.5, default: 25 };
export const LM75 = {
  type: 'lm75', title: 'Temperature sensor LM75 (I²C)', kind: 'sensor', prefix: 'U', dip: 8, address: 0x48,
  // (its SDA read too: an open-drain line, its ACK and its bits driven, the master's read)
  pins: PIN_NAMES.map((name, i) => ({ n: i + 1, name, dir: DIR[name], ...at(i + 1), ...(name === 'SDA' ? { io: true } : {}) })),
};

/** A temperature as the LM75's register holds it: 16 bits, its 9 high ones the half-degrees (two's complement). */
export const lm75Raw = (t) => ((Math.round(Math.min(LM75_TEMP.max, Math.max(LM75_TEMP.min, t)) * 2) & 0x1ff) << 7);
// a register's half-degrees (its 9 high bits, signed)
const halves = (raw) => { const v = (raw >> 7) & 0x1ff; return v & 0x100 ? v - 0x200 : v; };
const FAULTS = [1, 2, 4, 6];

/** The sensor at power-on, its temperature `temp`: start(read), write(b), read() (its next byte), setTemp(t), state(): {
 *  temp, raw, conf, thyst, tos, os (active), pointer }, osLow() (whether OS pulls low now). */
export function createLm75({ temp = LM75_TEMP.default } = {}) {
  let t, raw, conf, thyst, tos, pointer, n, active, over, under, latched, rd;
  function reset() {
    raw = lm75Raw(t ?? temp); conf = 0; thyst = 75 << 8; tos = 80 << 8; pointer = 0; n = 0; active = false; over = 0; under = 0; latched = 'tos'; rd = 0;
    convert();   // (its first conversion at power-on)
  }
  t = temp;
  reset();
  // a conversion: the temperature's register, then OS (its fault queue's consecutive conversions)
  function convert() {
    if (conf & 1) return;
    raw = lm75Raw(t);
    const v = halves(raw), q = FAULTS[(conf >> 3) & 3];
    over = v > halves(tos) ? over + 1 : 0;
    under = v < halves(thyst) ? under + 1 : 0;
    if (!(conf & 2)) { if (over >= q) active = true; else if (under >= q) active = false; return; }
    // (interrupt mode: TOS's event, then THYST's, each active until a read)
    if (latched === 'tos' && over >= q) { active = true; latched = 'thyst'; } else if (latched === 'thyst' && under >= q && !active) { active = true; latched = 'tos'; }
  }
  return {
    reset,
    start(read) { n = 0; rd = 0; if (read && conf & 2) active = false; },
    write(b) {
      if (n++ === 0) { pointer = b & 3; return; }
      const k = n - 2;   // (its register's byte: 0 the MSB)
      if (pointer === 1) { if (k === 0) { conf = b & 0x1f; convert(); } } else if (pointer === 2) thyst = k === 0 ? (b << 8) | (thyst & 0xff) : (thyst & 0xff00) | (b & 0x80);
      else if (pointer === 3) tos = k === 0 ? (b << 8) | (tos & 0xff) : (tos & 0xff00) | (b & 0x80);
    },
    read() {
      if (pointer === 1) return conf;
      const r = [raw, conf, thyst, tos][pointer];
      return rd++ % 2 ? r & 0xff : r >> 8;
    },
    setTemp(v) { t = Math.min(LM75_TEMP.max, Math.max(LM75_TEMP.min, Math.round(v * 2) / 2)); convert(); },
    state: () => ({ temp: t, raw, conf, thyst, tos, os: active, pointer }),
    osLow: () => active !== !!(conf & 4),
  };
}
