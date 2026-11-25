// Silinx - the pins of a synchronous reactive model's ports on an Arduino Uno or Nano (#5486, core/reactive-c.js): one
// digital pin per bit, bit 0 first; those the user gives, the others the next free ones (D2 to D13, then A0 to A5: D0
// and D1 are the USB serial port's).
// Isomorphic ES module: no DOM and no Node APIs.

const FREE = [...Array.from({ length: 12 }, (_, i) => `D${i + 2}`), ...Array.from({ length: 6 }, (_, i) => `A${i}`)];
const SERIAL = new Set(['D0', 'D1']);

/** A pin's name as the board writes it (D2, A0), or null when the board has no such digital pin. */
export function boardPin(name) {
  const m = /^\s*([DA])(\d+)\s*$/i.exec(String(name));
  if (!m) return null;
  const n = Number(m[2]), k = m[1].toUpperCase();
  return (k === 'D' && n <= 13) || (k === 'A' && n <= 5) ? `${k}${n}` : null;
}

/** A pin's number in the Arduino API: D2 is 2, A0 is A0. */
export const apiPin = (pin) => (pin[0] === 'D' ? pin.slice(1) : pin);

/**
 * The ports' pins ([{ name, width }], the inputs then the outputs): { pins: { name: [pin of bit 0, …] }, errors,
 * warnings } (messages). given: { name: [pins] | 'D2' } the user's.
 */
export function assignPins(ports, given = {}) {
  const errors = [], warnings = [], pins = {}, used = new Map();
  const take = (pin, port) => { used.set(pin, port); };
  for (const p of ports) {
    const g = given[p.name];
    if (g == null) continue;
    const list = (Array.isArray(g) ? g : [g]).map((x) => ({ raw: x, pin: boardPin(x) }));
    if (list.length !== p.width) { errors.push(`'${p.name}' is ${p.width} bit${p.width === 1 ? '' : 's'} wide: it needs ${p.width} pin${p.width === 1 ? '' : 's'}, not ${list.length}`); continue; }
    const bad = list.find((x) => !x.pin);
    if (bad) { errors.push(`'${bad.raw}' is not a digital pin of the board (D0 to D13, A0 to A5)`); continue; }
    const twice = list.find((x) => used.has(x.pin));
    if (twice) { errors.push(`${twice.pin} is given to '${used.get(twice.pin)}' and to '${p.name}'`); continue; }
    for (const x of list) {
      take(x.pin, p.name);
      if (SERIAL.has(x.pin)) warnings.push(`${x.pin} is the USB serial port's: '${p.name}' on it disturbs the upload of the program`);
    }
    pins[p.name] = list.map((x) => x.pin);
  }
  const free = FREE.filter((x) => !used.has(x));
  const need = ports.filter((p) => !pins[p.name] && !errors.some((m) => m.includes(`'${p.name}'`))).reduce((n, p) => n + p.width, 0);
  if (need > free.length) {
    errors.push(`The ports need ${need} more pin${need === 1 ? '' : 's'}: the board has ${free.length} free`);
    return { pins, errors, warnings };
  }
  for (const p of ports) if (!pins[p.name] && !errors.some((m) => m.includes(`'${p.name}'`))) pins[p.name] = free.splice(0, p.width);
  return { pins, errors, warnings };
}
