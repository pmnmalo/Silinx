// A circuit part's details (#4126, docs/CIRCUITS.md), as the circuit editor's Properties show them (Part info) and the
// MCP server's circuit_parts gives them for one part: what it does, an IC's chip, family, package, supply pins, logic,
// typical delay, its outputs (open collector) and how an input left open reads; each pin's role. From the parts'
// descriptions (core/circuit-parts.js) and their simulation's rules (readInput). Isomorphic module.
import { PARTS, partDef, readInput } from './circuit-parts.js';

// what a part that is not an IC does
const ABOUT = {
  'breadboard-half': 'Plug the parts into its holes: the five holes a–e of a column are joined, and f–j; each rail along its edges is joined along the board, for +5 V and GND.',
  'breadboard-full': 'Plug the parts into its holes: the five holes a–e of a column are joined, and f–j; each rail along its edges is joined along half the board, cut in the middle.',
  supply: 'Gives +5 V (a logic 1) on its + terminal and GND (a logic 0) on its − terminal: wire them to the breadboard\'s rails.',
  'logic-switch': 'Drives its output to 1 or 0, as it is set: click it while trying the circuit. An input of the HDL.',
  button: 'Joins its two pins while it is pressed (momentary, normally open): with a pull-up or a pull-down, it gives a 0 or a 1. An input of the HDL.',
  spdt: 'Joins its middle pin C to A or to B, as it is set. An input of the HDL.',
  'dip-4': 'A row of switches, each joining its pin to the one opposite while it is on. Inputs of the HDL.',
  'dip-8': 'A row of switches, each joining its pin to the one opposite while it is on. Inputs of the HDL.',
  'rotary-encoder': 'A rotary encoder module (KY-040), 20 detents a turn: turning it joins CLK (A) and DT (B) to GND in quadrature, A first clockwise, B first anticlockwise, both open at each detent (its 10 kΩ pull-ups hold them high); pushing its knob joins SW to GND (no pull-up: the program\'s). A program counts the edges of A, reading B. Its turns and its switch are inputs of the HDL (ENC1_A, ENC1_B, ENC1_SW).',
  'keypad-4x4': 'A membrane keypad, 16 keys in 4 rows and 4 columns: a key joins its row (R1…R4) to its column (C1…C4) while pressed. A program scans it: its rows driven low one at a time, its columns pulled up and read. Each key an input of the HDL.',
  clock: 'Drives its output to 1 and 0 in turn, at its frequency. An input of the HDL.',
  'pull-up': 'A weak 1 (a resistor to +5 V): its net reads 1 unless something drives it to 0.',
  'pull-down': 'A weak 0 (a resistor to GND): its net reads 0 unless something drives it to 1.',
  led: 'Lights while its anode A is at 1 and its cathode K at 0. An output of the HDL.',
  'seg7-cc': 'Seven segments a–g and a point DP, each an LED; common cathode: a segment lights while its pin is at 1 and COM at 0. Outputs of the HDL.',
  'seg7-ca': 'Seven segments a–g and a point DP, each an LED; common anode: a segment lights while its pin is at 0 and COM at 1. Outputs of the HDL.',
  'led-bar-10': 'Ten LEDs side by side, each lighting while its anode is at 1 and its cathode at 0. Outputs of the HDL.',
  probe: 'Shows the level of the net its tip touches: H (1), L (0), – (open) or X (unknown). Not a port of the HDL.',
  // (a buzzer, #5454)
  buzzer: 'An active buzzer: its + at 1 and its − at 0, it sounds at its own tone (about 2.3 kHz); a square wave on its + (an Arduino\'s tone(), a PWM, an FPGA\'s divider) and it sounds at that wave\'s frequency; at 0 it is silent. Not a port of the HDL.',
  // (a stepper motor on its driver board, #5476)
  'stepper-28byj48': 'A geared stepper motor (28BYJ-48) on its ULN2003 board: IN1 to IN4 at 1 turn on its coils A to D (its LEDs), and the coils on pull its rotor: in the order A, AB, B, BC, C, CD, D, DA (half steps, or A, B, C, D: full steps) its shaft turns clockwise, the other way anticlockwise; 4096 half steps a turn of its shaft (its gearbox, 1:64), one every 1 ms at most. A jump it cannot follow (the opposite coil) is said. Not a port of the HDL.',
  // (an SD card on SPI, #5477)
  'sd-card': 'A microSD card module with a 32 MB SDHC card, on SPI (mode 0: MOSI read on SCK\'s rise; MISO released while CS is high): after 74 clocks or more with CS high, the SD protocol\'s commands: CMD0, CMD8, CMD55 + ACMD41 (idle, then ready), CMD58, CMD17 (a 512-byte block read) and CMD24 (a block written), by block number. Its blocks are empty at first; those written are kept while trying it, shown with its state. Not a port of the HDL.',
  // (an ultrasonic range sensor, #5456)
  'hc-sr04': 'An ultrasonic range sensor: a pulse of 10 µs or more on Trig and, about 0.46 ms after it ends, Echo is at 1 for as long as the sound takes to reach the object and come back, 58 µs a centimetre (2 to 400 cm; 38 ms out of its range). The object\'s distance is set while trying it (its − and +), as saved in its properties. Not a port of the HDL.',
  // (a motion sensor, #5463)
  'hc-sr501': 'A motion sensor (PIR): someone moving in front of it (press and hold its dome while trying it: its input, an input of the HDL) sets OUT to 1 for its hold time (3 to 300 s, its Properties); retriggering (its jumper at H), OUT stays at 1 while they move and for its hold time after; single (L), it falls after its hold time. Then it is blind for 2.5 s. Its minute of warming up at power-on is not simulated.',
  // (the temperature and humidity sensors, #5470)
  dht11: 'A temperature and humidity sensor on one wire, its DATA open drain (a pull-up on it, 10 kΩ): the host holds DATA low 18 ms or more and releases it; it answers 80 µs low, 80 µs high, then 40 bits (50 µs low, then 26 µs high a 0, 70 µs a 1): the humidity (%), the temperature (°C), whole, and their checksum. Once a second at most. Its temperature (0 to 50 °C) and humidity (20 to 90 %) are set while trying it (its − and +), as saved in its properties. Not a port of the HDL.',
  dht22: 'A temperature and humidity sensor on one wire (AM2302), its DATA open drain (a pull-up on it, 10 kΩ): the host holds DATA low 1 ms or more and releases it; it answers 80 µs low, 80 µs high, then 40 bits (50 µs low, then 26 µs high a 0, 70 µs a 1): the humidity and the temperature in tenths (16 bits each, a negative temperature its top bit) and their checksum. Once every 2 seconds at most. Its temperature (−40 to 80 °C) and humidity (0 to 100 %) are set while trying it (its − and +), as saved in its properties. Not a port of the HDL.',
  // (a servo, #5347)
  'servo-sg90': "Its arm at the angle its signal's pulses ask for: 0.5 ms 0°, 2.5 ms 180°, every 20 ms (an Arduino's or an FPGA's PWM), moving at 60° in 0.1 s. Not a port of the HDL.",
  // (a temperature sensor, #5342)
  lm75: "Its temperature, set while trying it (its − and +, its Properties), read on I²C at 0x48 + A2..A0: 9 bits, 0.5 °C; its OS output (open drain) over TOS (80 °C) and under THYST (75 °C). Not a port of the HDL.",
  // (a character LCD, #5330)
  'lcd-1602': "Two lines of 16 characters, its HD44780 controller simulated: a write on E's falling edge, RS 0 a command, 1 a character; 8-bit or 4-bit (D7..D4) mode; off until its program turns it on. Not a port of the HDL.",
  // (a graphic OLED, #5336)
  'oled-ssd1306': "128 × 64 pixels, its SSD1306 controller simulated on I²C at 0x3C: a control byte, then commands or its display's bytes (8 pages of 128, bit 0 a page's top row); lit while on and its charge pump on. SCL and SDA need a pull-up each. Not a port of the HDL.",
  // (the analog parts, #5382: a circuit with one is solved as a circuit, core/circuit-analog.js)
  resistor: 'Limits the current between its two leads: I = V / R (Ohm\'s law). On a circuit with an analog part, every voltage and current is solved; in the HDL, a resistor from a rail is a pull-up or a pull-down, one between two nets joins them. Not a port of the HDL.',
  capacitor: 'Holds a charge: its voltage changes as its current charges it, I = C dV/dt (through a resistor, an exponential with the time constant RC). Not in the HDL.',
  potentiometer: 'A resistor with a wiper W between its ends 1 and 3: its position (0 to 100 %, set while trying it: its − and +) divides its resistance, the wiper\'s voltage between its ends\'. Not a port of the HDL.',
  ldr: 'A light-dependent resistor (GL5528): about 10 kΩ at 10 lux, less with more light, 1 MΩ in the dark. The light (lux) is set while trying it (its − and +). With a resistor, a voltage divider that a Schmitt-trigger input or an ADC reads. Not a port of the HDL.',
  thermistor: 'An NTC thermistor, 10 kΩ at 25 °C (B = 3950 K): less resistance as it warms. Its temperature is set while trying it (its − and +). With a resistor, a voltage divider that an ADC reads. Not a port of the HDL.',
  diode: 'A silicon diode (1N4148): it conducts from its anode A to its cathode K (about 0.6 V across it), not the other way. Not in the HDL.',
  voltmeter: 'Shows the voltage of its + lead against its COM lead, and draws no current. On a circuit with no analog part, a net\'s level as the volts of what drives it (a 74LS output\'s 1 at 3.4 V). Not a port of the HDL.',
  // (an oscilloscope, #5383)
  oscilloscope: 'Two channels, CH1 and CH2, each the voltage of the net its lead touches against GND, drawn against time while trying the circuit: from its trigger (its source\'s edge through its level; auto shows the last screen without one, normal waits for one, single keeps the first), over its time base and its scale (each its − and +). A click on its screen sets a cursor, then a second: their Δt. Under it, each channel\'s frequency, period, duty cycle, Vpp and mean. Not a port of the HDL.',
  // (a generator, a comparator, the DAC and ADC Pmods, #5384)
  'function-generator': 'A bench function generator: a square wave (its duty cycle: a PWM, turned while trying it, its − and +), a sine or a triangle, between its low and high levels at its frequency (its Properties), on OUT through 50 Ω; its COM is earthed, the circuit\'s GND. Through a resistor into a capacitor, a PWM\'s mean: a simple DAC. Not a port of the HDL.',
  'lm393': 'Two comparators (DIP-8): each output, open collector (put a pull-up on it), is off while its IN+ is above its IN−, else low, 300 ns later; powered by VCC and GND. A sine on IN+ and a divider on IN−: a square wave. Not in the HDL.',
  'pmod-da2': 'Digilent\'s Pmod DA2: two 12-bit DACs (DAC121S101) on SPI, J1 a Pmod\'s pins (SYNC, DINA, DINB, SCLK, GND, VCC), J2 their outputs (VOUTA, VOUTB, GND). SYNC low, 16 bits on SCLK\'s falling edges, MSB first (2 ignored, 2 of power-down, 12 of the code): VOUT = VCC × code / 4096 (3.3 V on a board\'s Pmod connector). Not in the HDL.',
  'pmod-ad1': 'Digilent\'s Pmod AD1: two 12-bit ADCs (AD7476A) on SPI, J1 a Pmod\'s pins (CS, D0, D1, SCK, GND, VCC), J2 their inputs (A0, GND, A1). CS falling samples A0 and A1; D0 and D1 put out 4 zeros and the 12 bits of the code, MSB first, one on each of SCK\'s falling edges: code = VIN × 4096 / VCC. Not in the HDL.',
  // (the boards, #5215)
  'arduino-uno': "Its headers' pins, the board's (D0…D13, A0…A5; SDA and SCL are A4 and A5): its 5V, 3V3 and GND power the breadboard; its other pins are its program's, in a System (alone, they drive nothing).",
  'arduino-nano': "A DIP-30 that straddles a breadboard's channel, its pins the board's (D0…D13, A0…A7; A6 and A7 inputs only): its 5V, 3V3 and GND power the breadboard; its other pins are its program's, in a System (alone, they drive nothing).",
  'fpga-basys2': "Its Pmod connectors' pins (JA1…, each its FPGA's package pin): its 3V3 and GND power the breadboard; its other pins are its design's, in a System (alone, they drive nothing).",
  'fpga-nexys2': "Its Pmod connectors' pins (JA1…, each its FPGA's package pin): its 3V3 and GND power the breadboard; its other pins are its design's, in a System (alone, they drive nothing).",
};
/** A pin's role by its direction. */
export const PIN_ROLES = { in: 'input', out: 'output', oc: 'open-collector output', vcc: 'supply +5 V', gnd: 'supply GND', nc: 'not connected',
  pass: 'contact', weak: 'weak output', probe: 'tip', none: 'not simulated', board: "the board's pin", vcc33: 'supply 3.3 V', analog: 'terminal' };
const FAMILY = { ttl: '74LS (TTL)', cmos: '4000 (CMOS)' };
const FN = { and: 'AND', or: 'OR', nand: 'NAND', nor: 'NOR', xor: 'XOR', xnor: 'XNOR', not: 'NOT', buf: 'BUF' };

/**
 * The details of the part `type`, or null: { type, title, about? (a part that is not an IC), chip?, family?, package?,
 * power? ('VCC 14, GND 7'), logic? (a gate IC's: '1Y = NAND(1A, 1B)', …), delay? (ns), openCollector?, openInput? (how an
 * input left open reads: '1', 'X'), pins: [{ n, name, role }] }.
 */
export function partInfo(type) {
  const d = partDef(type);
  if (!d) return null;
  const name = (n) => d.pins.find((p) => p.n === n)?.name ?? String(n);
  const info = { type: d.type, title: d.title };
  if (ABOUT[d.type]) info.about = ABOUT[d.type];
  if (d.kind === 'ic') {
    const supply = (dir) => d.pins.filter((p) => p.dir === dir).map((p) => `${p.name} ${p.n}`);
    Object.assign(info, { chip: d.chip, family: FAMILY[d.family] ?? d.family, package: `DIP-${d.dip}`, power: [...supply('vcc'), ...supply('gnd')].join(', ') });
    // (an AND-OR-INVERT, #4397: the NOR of its terms' ANDs)
    const aoi = (g) => { let k = 0; return `NOR(${g.terms.map((n) => `AND(${g.ins.slice(k, (k += n)).map(name).join(', ')})`).join(', ')})`; };
    // (a three-state buffer's: while its enables are at their active levels)
    const en = (g) => (g.en ? ` while ${g.en.map(([n, a]) => `${name(n)} = ${a}`).join(', ')}` : '');
    if (d.gates) info.logic = d.gates.map((g) => `${name(g.out)} = ${g.fn === 'aoi' ? aoi(g) : `${FN[g.fn] ?? g.fn.toUpperCase()}(${g.ins.map(name).join(', ')})`}${en(g)}`);
    if (d.tpd) info.delay = d.tpd;
    if (d.oc || d.pins.some((p) => p.dir === 'oc')) info.openCollector = true;   // (a 7447's outputs, its flag not set)
    info.openInput = readInput(d.family, 'Z');
  }
  // (a project's KiCad part, #4280: its file, its symbol and its source; the library part it behaves as, or none)
  if (d.kicad) {
    info.kicad = d.kicad;
    info.about = d.behaves ? `Behaves as the ${PARTS[d.behaves]?.kind === 'ic' ? d.behaves : PARTS[d.behaves]?.title ?? d.behaves} of the library (by its ${d.how}).` : d.kind === 'model' ? `Simulated by the project's module ${d.module}, in Try it and in the HDL.`
      : 'Drawn only: not simulated, its pins drive nothing.';
  }
  // (a board's pins, #5215: a 3V3 its supply's; an FPGA board's its package pin)
  const role = (p) => (p.supply && p.volts === 3.3 ? PIN_ROLES.vcc33 : PIN_ROLES[p.dir] ?? p.dir);
  info.pins = d.pins.map((p) => ({ n: p.kicadN ?? p.n, name: p.name, role: role(p), ...(p.loc ? { loc: p.loc } : {}), ...(p.port ? { port: p.port } : {}), ...(p.kicadType ? { kicadType: p.kicadType } : {}) }));
  return info;
}
