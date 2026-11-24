// A temperature and humidity sensor, a DHT11 or a DHT22 (AM2302) (#5470, part of #3902; docs/CIRCUITS.md): its pins VCC,
// DATA, NC and GND on the 0.1 inch grid under it, at 5 V; DATA open drain, its pull-up the circuit's. Its one-wire
// protocol: the host holds DATA low (18 ms or more for a DHT11, 1 ms or more for a DHT22) and releases it; 30 µs later
// the sensor answers: 80 µs low, 80 µs released, then 40 bits, each 50 µs low then released 26 µs (a 0) or 70 µs (a 1),
// and 50 µs low before it releases DATA: the humidity, the temperature and their checksum (a DHT11 whole percent and
// degrees; a DHT22 tenths, a negative temperature its sign bit). A read sooner than its interval after the last one or
// its power-on (1 s, 2 s), or a start too short, is not answered, said once. What it senses is the student's, set
// while running (its `sense`: `temp`, `hum`). Isomorphic module.

const sense = (t, h) => [{ prop: 'temp', label: 'Temperature (°C)', unit: '°C', ...t, nudge: 1 }, { prop: 'hum', label: 'Humidity (%)', unit: '%', ...h, nudge: 5 }];
const pins = [['VCC', 'vcc'], ['DATA', 'oc'], ['NC', 'nc'], ['GND', 'gnd']].map(([name, dir], i) => ({ n: i + 1, name, dir, dx: i, dy: 0, ...(name === 'DATA' ? { io: true } : {}) }));
// (its case, 0.6 x 0.8 inch over its legs: the editor's Fit and print)
const size = { x0: -1.5, y0: -9.6, x1: 4.5, y1: 0.6 };

export const DHT11 = {
  type: 'dht11', title: 'Temperature and humidity sensor (DHT11)', kind: 'dht', prefix: 'DHT', variant: 11, pins, size,
  sense: sense({ min: 0, max: 50, step: 1, default: 25 }, { min: 20, max: 90, step: 1, default: 50 }),
};
export const DHT22 = {
  type: 'dht22', title: 'Temperature and humidity sensor (DHT22)', kind: 'dht', prefix: 'DHT', variant: 22, pins, size,
  sense: sense({ min: -40, max: 80, step: 0.1, default: 25 }, { min: 0, max: 100, step: 0.1, default: 50 }),
};

/** Each model's timings (ns): its least start, its interval between reads. */
const DHT_TIMES = { 11: { start: 18_000_000, every: 1e9 }, 22: { start: 1_000_000, every: 2e9 } };
/** The answer's timings (ns): after the release, its response's low and high, a bit's low, a 0's and a 1's high, the end. */
export const DHT_WIRE = { wait: 30_000, response: 80_000, low: 50_000, zero: 26_000, one: 70_000, end: 50_000 };

/** Its 5 bytes for a temperature (°C) and a humidity (%): [humidity, humidity, temperature, temperature, checksum]. */
export function dhtBytes(model, temp, hum) {
  let b;
  if (model === 11) b = [Math.round(hum), 0, Math.round(temp), 0];
  else { const h = Math.round(hum * 10), t = Math.round(Math.abs(temp) * 10) | (temp < 0 ? 0x8000 : 0); b = [h >> 8, h & 255, t >> 8, t & 255]; }
  return [...b, b.reduce((a, x) => a + x, 0) & 255];
}

/** The answer from `t0` (its start, 30 µs after the release): [[t, '0' | 'Z']], the line driven low or released. */
export function dhtAnswer(bytes, t0) {
  const out = [];
  let t = t0;
  const at = (v, d) => { out.push([t, v]); t += d; };
  at('0', DHT_WIRE.response); at('Z', DHT_WIRE.response);
  for (const byte of bytes) for (let k = 7; k >= 0; k--) { at('0', DHT_WIRE.low); at('Z', (byte >> k) & 1 ? DHT_WIRE.one : DHT_WIRE.zero); }
  at('0', DHT_WIRE.end); out.push([t, 'Z']);
  return out;
}

/** A sensor of model 11 or 22, its temperature and humidity: powerOn(t); line(level, t) at each change of DATA while it
 *  does not answer (t in ns) returns the time it wants to be woken at, or null; wake(t) returns { drive ('0', 'Z' or
 *  null: no change), next (its next wake-up, or null) }; answering; state(): { temp, hum, reads }; warnings (each once). */
export function createDht({ model = 22, temp, hum } = {}) {
  const T = DHT_TIMES[model], name = `DHT${model}`;
  let fall = null, ready = 0, seen = null, queue = [], quiet = -1, reads = 0;
  const warnings = [];
  const warn = (k, text) => { if (!warnings.some((w) => w.kind === k)) warnings.push({ kind: k, text }); };
  const s = {
    temp, hum, warnings,
    get answering() { return queue.length > 0; },
    powerOn(t) { ready = t + T.every; fall = null; seen = null; queue = []; },
    line(v, t) {
      if (queue.length || t <= quiet) return null;
      const lv = v === '0' ? '0' : '1';
      if (lv === seen) return null;
      seen = lv;
      if (lv === '0') { fall = t; return null; }
      if (fall == null) return null;
      const w = t - fall;
      fall = null;
      if (w < T.start) { warn('start', `a start of ${+(w / 1e6).toFixed(3)} ms: a ${name}'s is ${T.start / 1e6} ms or more`); return null; }
      if (t < ready) { warn('early', `read ${+((t - ready + T.every) / 1e9).toFixed(3)} s after its last read or its power-on: a ${name} answers once every ${T.every / 1e9} s`); return null; }
      ready = t + T.every;
      reads++;
      queue = dhtAnswer(dhtBytes(model, s.temp, s.hum), t + DHT_WIRE.wait);
      return queue[0][0];
    },
    wake(t) {
      let drive = null;
      while (queue.length && queue[0][0] <= t) drive = queue.shift()[1];
      if (drive && !queue.length) { quiet = t; seen = '1'; }
      return { drive, next: queue.length ? queue[0][0] : null };
    },
    reset() { fall = null; seen = null; queue = []; },
    state: () => ({ temp: s.temp, hum: s.hum, reads }),
  };
  return s;
}
