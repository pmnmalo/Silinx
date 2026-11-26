// Digilent's Pmod DA2 and Pmod AD1 as a circuit's parts (#5384, the analog and digital roadmap #5387), their chips' SPI
// as the datasheets give it, at 3.3 V (their VCC). The DA2: two DAC121S101 (12 bits), their SYNC and SCLK shared, DINA
// and DINB each one's data: SYNC falling starts a word, its 16 bits read MSB first on SCLK's falling edges (2 bits
// ignored, PD1 PD0, then the 12 bits of the code), the output updated at the 16th; SYNC high before it aborts the word;
// VOUT = VCC × code / 4096 (its VCC the reference: 3.3 V on a board's Pmod connector), a power-down mode its output off
// (PD 01: to GND through 1 kΩ, 10: 100 kΩ, 11: open). The AD1: two AD7476A (12 bits), CS and SCK shared, D0 and D1 each
// one's data: CS falling samples its input and puts out its first bit, each SCK falling edge the next, 4 zeros then the
// 12 bits of the code MSB first, D released after the 16th and while CS is high; code = ⌊VIN × 4096 / VCC⌋, from 0 to
// 4095. Their J1 the Pmod's 6 pins (on a board's Pmod connector), their J2 the analog pins. Isomorphic module.

const p = (n, name, dir, dx, dy) => ({ n, name, dir, dx, dy });
/** The Pmod DA2: J1 SYNC, DINA, DINB, SCLK, GND, VCC; J2 (above) VOUTA, VOUTB, GND. */
export const PMOD_DA2 = {
  type: 'pmod-da2', title: 'Pmod DA2 (two 12-bit DACs, SPI)', kind: 'analog', prefix: 'DA',
  pins: [p(1, 'SYNC', 'in', 0, 0), p(2, 'DINA', 'in', 1, 0), p(3, 'DINB', 'in', 2, 0), p(4, 'SCLK', 'in', 3, 0), p(5, 'GND', 'gnd', 4, 0), p(6, 'VCC', 'vcc', 5, 0),
    p(7, 'VOUTA', 'analog', 0, -5), p(8, 'VOUTB', 'analog', 1, -5), p(9, 'GND', 'gnd', 2, -5)],
  bridges: [[5, 9]], size: { x0: -0.6, y0: -5.6, x1: 5.6, y1: 0.6 },
};
/** The Pmod AD1: J1 CS, D0, D1, SCK, GND, VCC; J2 (above) A0, GND, A1. */
export const PMOD_AD1 = {
  type: 'pmod-ad1', title: 'Pmod AD1 (two 12-bit ADCs, SPI)', kind: 'analog', prefix: 'AD',
  pins: [p(1, 'CS', 'in', 0, 0), p(2, 'D0', 'out', 1, 0), p(3, 'D1', 'out', 2, 0), p(4, 'SCK', 'in', 3, 0), p(5, 'GND', 'gnd', 4, 0), p(6, 'VCC', 'vcc', 5, 0),
    p(7, 'A0', 'analog', 0, -5), p(8, 'GND', 'gnd', 1, -5), p(9, 'A1', 'analog', 2, -5)],
  bridges: [[5, 8]], size: { x0: -0.6, y0: -5.6, x1: 5.6, y1: 0.6 },
};
const PMOD_VCC = 3.3;

/** A DAC121S101: step(sync, sclk, din) at each change of its pins' levels ('0', '1'); { code, pd } its output's. */
export function createDac121() {
  let word = 0, n = -1, was = { sync: '1', sclk: '0' };
  const st = { code: 0, pd: 0, writes: 0 };
  return {
    state: () => ({ ...st }),
    step(sync, sclk, din) {
      if (was.sync !== '0' && sync === '0') { word = 0; n = 0; }   // (its word starts)
      if (sync !== '0') n = -1;                                    // (high: none, a word cut short aborted)
      else if (n >= 0 && was.sclk === '1' && sclk === '0') {
        word = ((word << 1) | (din === '1' ? 1 : 0)) & 0xffff;
        if (++n === 16) { st.pd = (word >> 12) & 3; st.code = word & 0xfff; st.writes++; n = -1; }
      }
      was = { sync, sclk };
      return st;
    },
  };
}
/** Its output (V): VCC × code / 4096 (normal), or off (power-down): { volts, ohms }. */
export const dacOutput = (st, vcc = PMOD_VCC) => (st.pd === 0 ? { volts: vcc * st.code / 4096, ohms: 1 } : { volts: 0, ohms: [0, 1e3, 1e5, Infinity][st.pd] });

/** An AD7476A: step(cs, sck, vin, vcc) at each change of its pins' levels (vcc its reference); { out ('0', '1', 'Z': its D),
 *  code, samples }. */
export function createAd7476() {
  let k = -1, was = { cs: '1', sck: '1' };
  const st = { out: 'Z', code: 0, samples: 0 };
  return {
    state: () => ({ ...st }),
    step(cs, sck, vin, vcc = PMOD_VCC) {
      if (was.cs !== '0' && cs === '0') {   // (sampled; its first bit, a 0)
        st.code = Math.max(0, Math.min(4095, Math.floor((Number.isFinite(vin) ? vin : 0) * 4096 / vcc)));
        st.samples++; k = 15;
      } else if (cs !== '0') k = -1;
      else if (k >= 0 && was.sck === '1' && sck === '0') k--;   // (the next bit; after the 16th released)
      st.out = k < 0 ? 'Z' : k >= 12 ? '0' : (st.code >> k) & 1 ? '1' : '0';
      was = { cs, sck };
      return st;
    },
  };
}
