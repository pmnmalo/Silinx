// A circuit's analog parts (#5382, the analog and digital roadmap #5387): resistors, capacitors, a potentiometer, a
// light-dependent resistor, a thermistor, a diode and a voltmeter, and the electrical side of the digital parts at their
// pins: an output's levels and its output resistance, an input's thresholds (a Schmitt trigger's two), an LED's
// diode by its colour. A circuit with an analog part is solved as a circuit too (core/circuit-analog.js); one without
// any is the logic it always was. Each part's values (`values`: set in its Properties, edit_circuit's set) and what it
// senses while running (`sense`: a potentiometer's position, the light, the temperature). Isomorphic module.

const pin = (n, name, dx, dy) => ({ n, name, dir: 'analog', dx, dy });

// ------------------------------------------------------------------ values in SI, read and said
const SI = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
/** A value as written: a number, or "4.7k", "4k7", "100n", "2.2u", "1M", "220Ω" (its unit dropped); NaN if none. */
export function parseSi(s) {
  if (typeof s === 'number') return s;
  const t = String(s ?? '').trim().replace(/\s+/g, '').replace(/(Ω|ohms?|F|V|A|Hz)$/i, '');
  const m = /^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)([pnuµmkKMG])?(\d*)$/.exec(t);
  if (!m || (m[3] && !m[2])) return NaN;
  const base = m[3] ? Number(`${m[1]}.${m[3]}`) : Number(m[1]);
  return base * (m[2] ? SI[m[2]] : 1);
}
/** A value said with its unit and its SI prefix, three digits: 4.7 kΩ, 100 nF, 1.25 V. */
export function formatSi(v, unit) {
  if (!Number.isFinite(v)) return `– ${unit}`;
  if (v === 0) return `0 ${unit}`;
  const steps = [['G', 1e9], ['M', 1e6], ['k', 1e3], ['', 1], ['m', 1e-3], ['µ', 1e-6], ['n', 1e-9], ['p', 1e-12]];
  const [p, f] = steps.find(([, f]) => Math.abs(v) >= f * 0.9995) ?? steps.at(-1);
  return `${Number((v / f).toPrecision(3))} ${p}${unit}`;
}
/** A value kept to three significant digits (as saved). */
export const sig3 = (v) => Number(Number(v).toPrecision(3));

// ------------------------------------------------------------------ the parts
const ohms = (def) => ({ prop: 'ohms', label: 'Resistance (Ω)', unit: 'Ω', min: 1, max: 10e6, default: def });
export const RESISTOR = { type: 'resistor', title: 'Resistor', kind: 'analog', prefix: 'R', pins: [pin(1, '1', 0, 0), pin(2, '2', 4, 0)], values: [ohms(1000)] };
export const CAPACITOR = { type: 'capacitor', title: 'Capacitor', kind: 'analog', prefix: 'C', pins: [pin(1, '1', 0, 0), pin(2, '2', 1, 0)],
  values: [{ prop: 'farads', label: 'Capacitance (F)', unit: 'F', min: 1e-12, max: 0.01, default: 1e-6 }] };
// (a trimmer, 0.1 inch: its ends 1 and 3, its wiper W between them; its position from 1 (0 %) to 3 (100 %))
export const POTENTIOMETER = { type: 'potentiometer', title: 'Potentiometer', kind: 'analog', prefix: 'RV', pins: [pin(1, '1', 0, 0), pin(2, 'W', 1, 0), pin(3, '3', 2, 0)],
  values: [ohms(10000)], sense: [{ prop: 'pos', label: 'Position (%)', unit: '%', min: 0, max: 100, step: 1, default: 50, nudge: 10 }] };
// (a GL5528: about 10 kΩ at 10 lux, its resistance as lux^-0.7, 1 MΩ in the dark)
export const LDR = { type: 'ldr', title: 'Light-dependent resistor (LDR)', kind: 'analog', prefix: 'LDR', pins: [pin(1, '1', 0, 0), pin(2, '2', 1, 0)],
  sense: [{ prop: 'lux', label: 'Light (lux)', unit: 'lux', min: 0, max: 1000, step: 1, default: 100, nudge: 50 }] };
// (an NTC thermistor, 10 kΩ at 25 °C, B = 3950 K)
export const THERMISTOR = { type: 'thermistor', title: 'Thermistor (NTC, 10 kΩ)', kind: 'analog', prefix: 'TH', pins: [pin(1, '1', 0, 0), pin(2, '2', 1, 0)],
  sense: [{ prop: 'temp', label: 'Temperature (°C)', unit: '°C', min: -20, max: 100, step: 1, default: 25, nudge: 5 }] };
export const DIODE = { type: 'diode', title: 'Diode (1N4148)', kind: 'analog', prefix: 'D', pins: [pin(1, 'A', 0, 0), pin(2, 'K', 4, 0)] };
// (a voltmeter, its + lead against its COM: it measures, it draws no current; on a circuit with no analog part, a net's
// level as its driver's volts)
export const VOLTMETER = { type: 'voltmeter', title: 'Voltmeter', kind: 'meter', prefix: 'VM', pins: [pin(1, '+', 0, 0), pin(2, 'COM', 1, 0)] };

export const ANALOG_PARTS = [RESISTOR, CAPACITOR, POTENTIOMETER, LDR, THERMISTOR, DIODE, VOLTMETER];

/** The resistive parts and the pins each joins (a potentiometer's ends to its wiper). */
const RESISTIVE = { resistor: [[1, 2]], ldr: [[1, 2]], thermistor: [[1, 2]], potentiometer: [[1, 2], [2, 3]] };
/** A circuit's resistive links, as its logic reads them (the checks, the HDL): [{ part, a, b }], the nets each resistive
 *  part joins (`pinNet`: circuitNets'). */
export const resistiveLinks = (m, pinNet) => m.parts.flatMap((p) => (RESISTIVE[p.type] ?? []).map(([x, y]) => ({ part: p.id, a: pinNet.get(`${p.id}.${x}`), b: pinNet.get(`${p.id}.${y}`) })))
  .filter((l) => l.a != null && l.b != null && l.a !== l.b);

/** The resistance of a light-dependent resistor at `lux`. */
export const ldrOhms = (lux) => Math.min(1e6, lux > 0 ? 10e3 * (lux / 10) ** -0.7 : 1e6);
/** The resistance of the 10 kΩ NTC thermistor at `temp` (°C). */
export const ntcOhms = (temp) => 10e3 * Math.exp(3950 * (1 / (temp + 273.15) - 1 / 298.15));
/** The 1N4148's diode: Shockley's is and n, its series resistance. */
export const DIODE_MODEL = { is: 2.52e-9, n: 1.752, rs: 0.568 };

// ------------------------------------------------------------------ the digital parts' electrical side
/** An LED's forward voltage at 20 mA by its colour, its emission coefficient and series resistance; its rated current. */
export const LED_VF = { red: 1.9, yellow: 2.0, green: 2.1, blue: 3.1, white: 3.1 };
export const LED_RATED = 0.02, LED_MAX = 0.03, LED_LIT = 0.0001;
export function ledModel(color = 'red') {
  const vf = LED_VF[color] ?? LED_VF.red, n = 2, rs = 10;
  return { vf, n, rs, is: LED_RATED / Math.exp((vf - LED_RATED * rs) / (n * 0.025852)) };
}

/** An output's levels and resistances (V, Ω) by its family: a 74LS's high 3.4 V through about 70 Ω, its low through 30;
 *  a 4000's 5 V and 0 V through 400 Ω; a switch's, a clock's, a module's, a device's: 5 V and 0 V through 25 Ω. */
export const OUTPUT_SPEC = {
  ttl: { voh: 3.4, vol: 0.1, rh: 70, rl: 30 },
  cmos: { voh: 5, vol: 0, rh: 400, rl: 400 },
  default: { voh: 5, vol: 0, rh: 25, rl: 25 },
  weak: { voh: 5, vol: 0, rh: 10e3, rl: 10e3 },
};
/** A supply's terminal: its volts through 0.05 Ω. */
export const supplySpec = (volts = 5) => ({ voh: volts, vol: 0, rh: 0.05, rl: 0.05 });
/** A board's pin (#5215): its own volts (3.3 V an FPGA's) through 25 Ω; weak (an AVR's pull-up) through 35 kΩ. */
export const boardSpec = (volts = 3.3) => ({ voh: volts, vol: 0, rh: 25, rl: 25, rw: 35e3 });

/** An input's thresholds (V) by its family: below vil a 0, above vih a 1, between them unknown (X); a Schmitt trigger's
 *  rising and falling ones (vtp, vtn) with its hysteresis between them. A 74LS input sources its current: 1.5 V through
 *  4 kΩ (open, it reads high). */
export const INPUT_SPEC = {
  ttl: { vil: 0.8, vih: 2.0, schmitt: { vtp: 1.6, vtn: 0.8 }, src: { volts: 1.5, ohms: 4000 } },
  cmos: { vil: 1.5, vih: 3.5, schmitt: { vtp: 2.9, vtn: 1.9 } },
  default: { vil: 0.8, vih: 2.0 },
};

/** A level read from a voltage by an input's thresholds (`spec` INPUT_SPEC's), `prev` its level before (a Schmitt
 *  trigger's hysteresis). */
export function readVolts(v, spec, schmitt = false, prev = null) {
  if (schmitt && spec.schmitt) {
    const { vtp, vtn } = spec.schmitt;
    if (v >= vtp) return '1';
    if (v <= vtn) return '0';
    return prev === '0' || prev === '1' ? prev : v >= (vtp + vtn) / 2 ? '1' : '0';
  }
  return v <= spec.vil ? '0' : v >= spec.vih ? '1' : 'X';
}
