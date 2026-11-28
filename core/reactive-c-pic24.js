// Silinx - the synchronous reactive model's C on the PIC24 (#5552, core/reactive-c.js): a drawing in a PIC24 node of a
// System (the Explorer 16/32's PIC24FJ1024GB610, #5484) is a unit of its node's program as an Arduino's is, its HAL the
// device's port registers instead of the Arduino API: a pin an input or an output by its port's TRISx (its ANSx bit
// cleared: a digital pin), read from PORTx, written to LATx, one bit at a time. Its pins: those the node's GPIO
// interfaces give, else the board's: the inputs on the buttons first (S3 RD6, S4 RD13, S6 RD7, S5 RA7; a press reads
// 0), the outputs on the LEDs (D3-D10, RA0-RA7, lit by a 1), then the pins the board leaves free. The node's program,
// `<id>/main.c` (pic24Main), calls each unit's <module>_init(), then its <module>_tick() at every tick of Timer1.
// Compiled by XC16 (server/xc16-compile.js, #5482) and run on silinx-pic24.
// Isomorphic ES module: no DOM and no Node APIs.
import { C_TAKEN, TICK_MS, generateUnit } from './reactive-c.js';
import { mcuBoard } from './system-doc.js';

// the board's buttons and LEDs (packages/silinx-pic24/src/explorer1632.js), and the pins it leaves free: not its
// programming pins (RB0, RB1), its analog inputs (RB4, RB5), its USB-UART (RF4, RF5), its LCD (RE0-RE7, RB15, RD4, RD5),
// its EEPROM (RG6-RG8, RD12), its crystals (RC12-RC15)
const BUTTONS = ['RD6', 'RD13', 'RD7', 'RA7'];
const LEDS = ['RA0', 'RA1', 'RA2', 'RA3', 'RA4', 'RA5', 'RA6', 'RA7'];
const FREE = ['RB2', 'RB3', ...[6, 7, 8, 9, 10, 11, 12, 13, 14].map((b) => `RB${b}`), 'RD0', 'RD1', 'RD2', 'RD3', 'RD8', 'RD9', 'RD10', 'RD11',
  'RD14', 'RD15', 'RF0', 'RF1', 'RF2', 'RF3', 'RF7', 'RF8', 'RF12', 'RF13', 'RG0', 'RG1', 'RG2', 'RG3', 'RG9', 'RG12', 'RG13', 'RG14', 'RG15',
  'RA9', 'RA10', 'RA14', 'RA15', 'RE8', 'RE9', 'RC1', 'RC2', 'RC3', 'RC4'];
// what the board puts on a pin a port is given (a warning)
const USED = { RF4: 'the USB-UART\'s RX', RF5: 'the USB-UART\'s TX', RB0: 'the PICkit\'s PGED', RB1: 'the PICkit\'s PGEC', RB4: 'the temperature sensor\'s',
  RB5: 'the potentiometer\'s', RB15: 'the LCD\'s RS', RD4: 'the LCD\'s E', RD5: 'the LCD\'s R/W', RD12: 'the EEPROM\'s CS', RG6: 'the EEPROM\'s SCK', RG7: 'the EEPROM\'s SO',
  RG8: 'the EEPROM\'s SI', RC12: 'the 8 MHz crystal\'s', RC15: 'the 8 MHz crystal\'s', RC13: 'the 32 kHz crystal\'s', RC14: 'the 32 kHz crystal\'s',
  ...Object.fromEntries(['RE0', 'RE1', 'RE2', 'RE3', 'RE4', 'RE5', 'RE6', 'RE7'].map((p, i) => [p, `the LCD's D${i}`])) };
// XC16's names a unit uses or that its header declares and a port could take
const XC16 = ['main', 'FCY', 'Nop', 'ClrWdt', 'Sleep', 'Idle', 'T1CON', 'PR1', 'TMR1', 'IFS0', 'IEC0', 'CLKDIV', 'OSCCON', 'RCON', 'WREG', 'SPLIM',
  ...'ABCDEFG'.split('').flatMap((p) => ['PORT', 'TRIS', 'LAT', 'ANS', 'ODC'].map((r) => `${r}${p}`)), 'uint8_t', 'uint16_t', 'uint32_t', 'int8_t', 'int16_t', 'int32_t', 'bool', 'true', 'false'];
const PIN = /^R([A-G])(\d{1,2})$/;
const pinOf = (pin) => { const m = PIN.exec(pin); return { port: m[1], bit: Number(m[2]) }; };

/** A pin's name as the device writes it (RA0, RD13), or null when the board's PIC24FJ1024GB610 has no such pin. */
export function pic24Pin(name) {
  const m = /^\s*R([A-G])(\d{1,2})\s*$/i.exec(String(name));
  const pin = m ? `R${m[1].toUpperCase()}${Number(m[2])}` : null;
  return pin && mcuBoard('explorer-1632').pins.includes(pin) ? pin : null;
}

/**
 * The ports' pins on the Explorer 16/32: { pins: { name: [pin of bit 0, …] }, errors, warnings }. The inputs then the
 * outputs, `given` the user's ({ name: [pins] | 'RA0' }); the others the buttons' (inputs), the LEDs' (outputs), then the
 * free pins.
 */
export function assignPic24Pins(inputs, outputs, given = {}) {
  const errors = [], warnings = [], pins = {}, used = new Map();
  const ports = [...inputs.map((p) => ({ ...p, out: false })), ...outputs.map((p) => ({ ...p, out: true }))];
  for (const p of ports) {
    const g = given[p.name];
    if (g == null) continue;
    const list = (Array.isArray(g) ? g : [g]).map((x) => ({ raw: x, pin: pic24Pin(x) }));
    if (list.length !== p.width) { errors.push(`'${p.name}' is ${p.width} bit${p.width === 1 ? '' : 's'} wide: it needs ${p.width} pin${p.width === 1 ? '' : 's'}, not ${list.length}`); continue; }
    const bad = list.find((x) => !x.pin);
    if (bad) { errors.push(`'${bad.raw}' is not a pin of the PIC24FJ1024GB610 (RA0 to RG15)`); continue; }
    const twice = list.find((x) => used.has(x.pin));
    if (twice) { errors.push(`${twice.pin} is given to '${used.get(twice.pin)}' and to '${p.name}'`); continue; }
    for (const x of list) {
      used.set(x.pin, p.name);
      if (USED[x.pin]) warnings.push(`${x.pin} is ${USED[x.pin]} on the Explorer 16/32: '${p.name}' on it disturbs it`);
    }
    pins[p.name] = list.map((x) => x.pin);
  }
  const left = ports.filter((p) => !pins[p.name] && !errors.some((m) => m.includes(`'${p.name}'`)));
  const pool = (out) => [...(out ? LEDS : BUTTONS), ...FREE].filter((x) => !used.has(x));
  const need = left.reduce((n, p) => n + p.width, 0), room = new Set([...pool(false), ...pool(true)]).size;
  if (need > room) { errors.push(`The ports need ${need} more pin${need === 1 ? '' : 's'}: the board has ${room} free`); return { pins, errors, warnings }; }
  for (const p of left) {
    const free = pool(p.out);
    if (free.length < p.width) { errors.push(`The ports need ${p.width} more pin${p.width === 1 ? '' : 's'} for '${p.name}': the board has ${free.length} free`); break; }
    pins[p.name] = free.slice(0, p.width);
    for (const x of pins[p.name]) used.set(x, p.name);
  }
  return { pins, errors, warnings };
}

// a port's bits by pin, as C: `(PORTD >> 6) & 1`, `LATA |= 1u << 0`
const bitOf = (pin) => { const { port, bit } = pinOf(pin); return { port, bit, mask: `1u << ${bit}` }; };

/** The PIC24's HAL (core/reactive-c.js ARDUINO_HAL's members): its pins its port registers' bits. */
const PIC24_HAL = {
  taken: new Set([...C_TAKEN, ...XC16]), api: 'XC16\'s device header', init: 'main()\'s',
  caller: (name) => `the node's main.c calls it every tick, its main() ${name}_init() first`,
  assign: (model, given) => assignPic24Pins(model.inputs, model.outputs, given),
  include: ['#include <xc.h>', '#include <stdint.h>'],
  declare: () => [],
  helpers: () => [],
  // (a bit at 15 or above shifted in uint32_t: the PIC24's int is 16 bits)
  read: (i, c, name, pins) => [`  ${c} = ${pins.map((p, k) => { const b = bitOf(p); const r = `((PORT${b.port} >> ${b.bit}) & 1)`; return !k ? r : k < 15 ? `(${r} << ${k})` : `((uint32_t)${r} << ${k})`; }).join(' | ')};`
    + `   // ${pins.join(' ')}`],
  write: (o, c, name, pins) => pins.map((p, k) => { const b = bitOf(p); const v = o.width === 1 ? c : `(${c} >> ${k}) & 1`; return `  if (${v}) LAT${b.port} |= ${b.mask}; else LAT${b.port} &= ~(${b.mask});   // ${p}`; }),
  // (a digital pin: its ANSx bit cleared, PORTF having none; TRISx's bit 1 an input, 0 an output)
  mode: (p, out, name, pins) => pins.flatMap((x) => { const b = bitOf(x); return [...(b.port === 'F' ? [] : [`  ANS${b.port} &= ~(${b.mask});`]), out ? `  TRIS${b.port} &= ~(${b.mask});   // ${x} an output` : `  TRIS${b.port} |= ${b.mask};   // ${x} an input`]; }),
};

/** The model as a unit of a PIC24 node's program: generateUnit's, on the PIC24's HAL (C only: XC16 compiles C). */
export function generatePic24Unit(model, { pins = {} } = {}) { return generateUnit(model, { pins, lang: 'c', hal: PIC24_HAL }); }

/** The instruction clock of a program with no configuration words (XC16's, with no #pragma config): the FRC through its
 *  divider at reset, Fosc 4 MHz, Fcy = Fosc / 2 (DS30010074 section 9; silinx-pic24's oscillator). */
export const PIC24_FCY = 2000000;
/** The PIC24 node's program's path. */
export const pic24MainPath = (id) => `${id}/main.c`;

/**
 * The PIC24 node's program, calling its drawings' units ([{ module, file }], in their files' order): its C, main.c.
 * Timer1 counts Fcy / 8 and its flag (IFS0's T1IF, bit 3) every TICK_MS milliseconds is a tick: each unit's tick, in
 * their order; the watchdog cleared meanwhile (enabled by the erased configuration words).
 */
export function pic24Main(id, units, { tickMs = TICK_MS, mark = '' } = {}) {
  const period = (PIC24_FCY / 8 / 1000) * tickMs - 1;
  return [
    `// ${id}: its program, ${mark} (${units.map((u) => u.file.split('/').pop()).join(', ')}): edit the drawings, not this file.`,
    '// main() calls each drawing\'s <module>_init(), then each one\'s <module>_tick() every TICK_MS milliseconds, timed by',
    '// Timer1 (XC16, the PIC24FJ1024GB610 of the Explorer 16/32).',
    '', '#include <xc.h>', '', '// ---- the drawings\' functions (their files next to this one)', ...units.flatMap((u) => [`void ${u.module}_init(void);`, `void ${u.module}_tick(void);`]),
    '', `#define FCY ${PIC24_FCY}UL   // the instruction clock: the FRC (8 MHz) through its divider at reset, over 2`,
    `#define TICK_MS ${tickMs}   // the tick's period`,
    '', 'int main(void) {', ...units.map((u) => `  ${u.module}_init();`),
    `  PR1 = ${period};   // FCY / 8 / 1000 * TICK_MS - 1`, '  TMR1 = 0;', '  IFS0 &= ~(1u << 3);   // T1IF', '  T1CON = 0x8010;   // TON, a 1:8 prescaler, Fcy',
    '  for (;;) {', '    ClrWdt();', '    if (IFS0 & (1u << 3)) {', '      IFS0 &= ~(1u << 3);', ...units.map((u) => `      ${u.module}_tick();`), '    }', '  }', '}', '',
  ].join('\n');
}
