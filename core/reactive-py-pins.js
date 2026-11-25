// Silinx - the pins of a synchronous reactive model's ports on a MicroPython board (#5487, core/reactive-py.js): the
// ESP32 DevKit's GPIOs or the Raspberry Pi Pico's, one per bit, bit 0 first; those the user gives, the others the next
// free ones (on the ESP32 neither its strapping pins nor its serial port's, its flash's or its inputs-only ones). In the
// program a pin is its GPIO number, machine.Pin's on both boards.
// Isomorphic ES module: no DOM and no Node APIs.

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** The MicroPython boards: their GPIOs, the free ones in their order, their names' prefix, their I/O level. */
export const PY_BOARDS = {
  esp32: {
    name: 'ESP32 DevKit', prefix: 'GPIO', vio: 3.3, gpios: [...range(0, 19), ...range(21, 23), ...range(25, 27), ...range(32, 39)],
    free: [4, 13, 14, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33], serial: [1, 3], flash: range(6, 11), inputOnly: [34, 35, 36, 37, 38, 39],
  },
  pico: { name: 'Raspberry Pi Pico', prefix: 'GP', vio: 3.3, gpios: [...range(0, 22), ...range(26, 28)], free: [...range(2, 22), ...range(26, 28)], serial: [], flash: [], inputOnly: [] },
};
export const PY_BOARD = 'esp32';   // the default: the co-design's MicroPython board (docs/SYSTEMS.md)

/** A pin's GPIO number on the board (GPIO4, IO4, GP4, 4), or null when the board has no such GPIO. */
export function gpioOf(name, board = PY_BOARD) {
  const m = /^\s*(?:GPIO|IO|GP)?(\d+)\s*$/i.exec(String(name));
  const n = m ? Number(m[1]) : NaN;
  return PY_BOARDS[board].gpios.includes(n) ? n : null;
}

/** A pin's name as the board writes it: GPIO4 on the ESP32, GP4 on the Pico. */
export const pinLabel = (n, board = PY_BOARD) => `${PY_BOARDS[board].prefix}${n}`;

/**
 * The ports' pins ([{ name, width, dir: 'in' | 'out' }], the inputs then the outputs): { pins: { name: [GPIO of bit 0,
 * …] }, errors, warnings } (messages). given: { name: [pins] | 'GPIO4' } the user's.
 */
export function assignPyPins(ports, given = {}, board = PY_BOARD) {
  const B = PY_BOARDS[board];
  const errors = [], warnings = [], pins = {}, used = new Map();
  const range0 = `${pinLabel(B.gpios[0], board)} to ${pinLabel(B.gpios[B.gpios.length - 1], board)}`;
  for (const p of ports) {
    const g = given[p.name];
    if (g == null) continue;
    const list = (Array.isArray(g) ? g : [g]).map((x) => ({ raw: x, pin: gpioOf(x, board) }));
    if (list.length !== p.width) { errors.push(`'${p.name}' is ${p.width} bit${p.width === 1 ? '' : 's'} wide: it needs ${p.width} pin${p.width === 1 ? '' : 's'}, not ${list.length}`); continue; }
    const bad = list.find((x) => x.pin == null);
    if (bad) { errors.push(`'${bad.raw}' is not a GPIO of the ${B.name} (${range0})`); continue; }
    const flash = list.find((x) => B.flash.includes(x.pin));
    if (flash) { errors.push(`${pinLabel(flash.pin, board)} is the ${B.name}'s flash memory's: '${p.name}' cannot use it`); continue; }
    const inOnly = p.dir === 'out' && list.find((x) => B.inputOnly.includes(x.pin));
    if (inOnly) { errors.push(`${pinLabel(inOnly.pin, board)} is an input only: '${p.name}' is an output`); continue; }
    const twice = list.find((x) => used.has(x.pin));
    if (twice) { errors.push(`${pinLabel(twice.pin, board)} is given to '${used.get(twice.pin)}' and to '${p.name}'`); continue; }
    for (const x of list) {
      used.set(x.pin, p.name);
      if (B.serial.includes(x.pin)) warnings.push(`${pinLabel(x.pin, board)} is the USB serial port's: '${p.name}' on it disturbs the REPL and the upload of the program`);
    }
    pins[p.name] = list.map((x) => x.pin);
  }
  const free = B.free.filter((x) => !used.has(x));
  const left = ports.filter((p) => !pins[p.name] && !errors.some((m) => m.includes(`'${p.name}'`)));
  const need = left.reduce((n, p) => n + p.width, 0);
  if (need > free.length) {
    errors.push(`The ports need ${need} more pin${need === 1 ? '' : 's'}: the ${B.name} has ${free.length} free`);
    return { pins, errors, warnings };
  }
  for (const p of left) pins[p.name] = free.splice(0, p.width);
  return { pins, errors, warnings };
}
