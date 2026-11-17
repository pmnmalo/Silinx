// KiCad parts that behave as the library's LED, slide switch and push button (#4349, core/circuit-kicad-parts.js): known
// by what their symbols say or named by Silinx.Model; their pins matched by their names (an LED's A and K, whatever
// their numbers), by their numbers (a button's), by their places (a slide switch's, its middle pin the common); what is
// refused and why; then in a circuit: the LED lit (or not, the wrong way round, Check's warning), the switch's and the
// button's contacts, the HDL's ports and the Part info.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kicadPartsOf } from '../core/circuit-kicad.js';
import { DISCRETE, discreteModel, discretePins } from '../core/circuit-kicad-parts.js';
import { PARTS, setProjectParts } from '../core/circuit-parts.js';
import { partInfo } from '../core/circuit-part-info.js';
import { checkCircuit } from '../core/circuit-check.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { circuitPorts, newCircuit, normalizeCircuit, newId } from '../core/circuit.js';

afterEach(() => setProjectParts([]));
const LED_FP = fs.readFileSync(new URL('./fixtures/kicad/parts.pretty/LED_D5.0mm_test.kicad_mod', import.meta.url), 'utf8');
const pin = (n, name) => `(pin passive line (at 0 0 0) (length 2.54) (name "${name}") (number "${n}"))`;
const sym = (name, props, pins) => `(symbol "${name}" ${Object.entries(props).map(([k, v]) => `(property "${k}" "${v}")`).join(' ')} (symbol "${name}_1_1" ${pins.map(([n, nm]) => pin(n, nm)).join(' ')}))`;
const LIB = (...syms) => `(kicad_symbol_lib (version 20231120) (generator "t") ${syms.join(' ')})`;
const HEADER = (n) => `PinHeader_1x0${n}_P2.54mm_Vertical`;
const SYMS = LIB(
  // SparkFun's way: its cathode pin 1, its anode pin 2
  sym('LED_Red', { Reference: 'D', Value: 'Red', ki_keywords: 'LED diode', Footprint: 'leds:LED_D5.0mm_test' }, [['1', 'K'], ['2', 'A']]),
  sym('SW_SPDT', { Reference: 'SW', Value: 'SPDT', ki_keywords: 'switch slide spdt', Footprint: HEADER(3) }, [['1', 'A'], ['2', 'B'], ['3', 'C']]),
  sym('BTN', { Reference: 'SW', Value: 'Tact', Description: 'Push button, momentary', Footprint: HEADER(2) }, [['1', '1'], ['2', '2']]),
  // named by Silinx.Model, its pins anode and cathode
  sym('LAMP', { Reference: 'D', Value: 'Green lamp', 'Silinx.Model': 'led', Footprint: HEADER(2) }, [['1', 'anode'], ['2', 'cathode']]),
  // like an LED but its pins not an LED's: drawn only, a note; a relay: no switch; Silinx.Model led on 3 pins: refused
  sym('LED_X', { Reference: 'D', Value: 'X', ki_keywords: 'LED', Footprint: HEADER(2) }, [['1', 'P'], ['2', 'Q']]),
  sym('RELAY', { Reference: 'K', Value: 'Relay', ki_keywords: 'relay spdt switch', Footprint: HEADER(3) }, [['1', 'A'], ['2', 'B'], ['3', 'C']]),
  sym('BADLED', { Reference: 'D', Value: 'Bad', 'Silinx.Model': 'led', Footprint: HEADER(3) }, [['1', 'A'], ['2', 'K'], ['3', 'X']]));
const FILES = { 'parts/p.kicad_sym': SYMS, 'parts/leds.pretty/LED_D5.0mm_test.kicad_mod': LED_FP };
const T = (s) => `parts/p.kicad_sym#${s}`;
const load = () => { const r = kicadPartsOf(FILES); setProjectParts(r.defs); return r; };

test('discreteModel: an LED, a slide switch SPDT (not a relay), a push button by what their symbols say; none else', () => {
  const s = (props, n = 2) => [{ name: 'x', properties: props }, Array.from({ length: n }, (_, i) => ({ number: String(i + 1) }))];
  assert.equal(discreteModel(...s({ ki_keywords: 'SparkFun LED diode' })), 'led');
  assert.equal(discreteModel(...s({ Description: 'Switch, single pole double throw' }, 3)), 'spdt');
  assert.equal(discreteModel(...s({ ki_keywords: 'SparkFun Power Relay SPDT switch' }, 3)), null);
  assert.equal(discreteModel(...s({ Description: 'Tactile push button' })), 'button');
  assert.equal(discreteModel(...s({ ki_keywords: 'LED' }, 4)), null, 'an RGB LED: not the library\'s');
  assert.equal(discreteModel(...s({ ki_keywords: 'LEDGER' })), null);
  assert.deepEqual(Object.keys(DISCRETE), ['led', 'button', 'spdt']);
});

test('discretePins: an LED\'s by their names (or anode, cathode), a button\'s by their numbers, a slide switch\'s by their places; why not', () => {
  const at = (...xs) => new Map(xs.map(([n, dx, dy]) => [n, { dx, dy }]));
  const p = (...xs) => xs.map(([number, name]) => ({ number, name }));
  assert.deepEqual(discretePins(PARTS.led, p(['1', 'K'], ['2', 'A']), at(['1', 0, 0], ['2', 1, 0])).pins.map((q) => [q.n, q.name, q.kicadN, q.dx]), [[1, 'A', '2', 1], [2, 'K', '1', 0]]);
  assert.deepEqual(discretePins(PARTS.led, p(['1', 'cathode'], ['2', '+']), at(['1', 0, 0], ['2', 1, 0])).pins.map((q) => q.kicadN), ['2', '1']);
  assert.deepEqual(discretePins(PARTS.led, p(['1', 'K'], ['2', 'X']), at(['1', 0, 0], ['2', 1, 0])), { error: 'it has no pin A (the led\'s pin 1)' });
  assert.deepEqual(discretePins(PARTS.led, p(['1', 'A']), at(['1', 0, 0])), { error: 'its 1 pin(s) are not the led\'s 2' });
  assert.deepEqual(discretePins(PARTS.button, p(['2', 'x'], ['1', 'y']), at(['1', 0, 0], ['2', 0, 1])).pins.map((q) => [q.n, q.kicadN]), [[1, '1'], [2, '2']]);
  // (the switch's middle pin its common, C; its ends A and B as their places go, in a column too)
  const sw = discretePins(PARTS.spdt, p(['1', 'A'], ['2', 'B'], ['3', 'C']), at(['1', 0, 2], ['2', 0, 1], ['3', 0, 0]));
  assert.deepEqual(sw.pins.map((q) => [q.n, q.name, q.kicadN]), [[1, 'A', '3'], [2, 'C', '2'], [3, 'B', '1']]);
  assert.deepEqual(discretePins(PARTS.spdt, p(['1'], ['2'], ['3']), at(['1', 0, 0], ['2', 1, 1], ['3', 2, 0])), { error: 'its three pins are not in a line' });
  assert.deepEqual(discretePins(PARTS.spdt, p(['1'], ['2'], ['3']), at(['1', 0, 0], ['2', 1, 0], ['3', 3, 0])), { error: 'its three pins are not one step apart' });
});

test('kicadPartsOf: SparkFun\'s LED, a slide switch, a button, an LED by Silinx.Model as the library\'s; what is not, and why', () => {
  const r = load();
  const by = Object.fromEntries(r.defs.map((d) => [d.kicad.symbol, d]));
  assert.deepEqual(Object.values(by).map((d) => [d.kicad.symbol, d.kind, d.behaves, d.how ?? null]), [
    ['LED_Red', 'output', 'led', 'symbol'], ['SW_SPDT', 'input', 'spdt', 'symbol'], ['BTN', 'input', 'button', 'symbol'], ['LAMP', 'output', 'led', 'Silinx.Model'],
    ['LED_X', 'drawn', null, null], ['RELAY', 'drawn', null, null]]);
  // an LED's colour its own (its value's; none said: red); its look kept
  assert.deepEqual([by.LED_Red.color, by.LAMP.color, by.LED_Red.look.layer, by.LED_Red.title], ['red', 'green', 'F.Fab', 'Red']);
  assert.deepEqual(by.LED_Red.lamps, PARTS.led.lamps);
  assert.deepEqual(r.skipped, [{ type: T('BADLED'), reason: 'its Silinx.Model is led but its 3 pin(s) are not the led\'s 2' }]);
  assert.deepEqual(r.notes, ['parts/p.kicad_sym: LED_X: it looks like a led but it has no pin A (the led\'s pin 1): drawn only']);
  assert.deepEqual(r.errors, []);
  // its Part info: what it behaves as, its pins by their KiCad numbers
  const info = partInfo(T('LED_Red'));
  assert.equal(info.about, 'Behaves as the LED of the library (by its symbol).');
  assert.deepEqual(info.pins, [{ n: '2', name: 'A', role: 'input' }, { n: '1', name: 'K', role: 'input' }]);
  assert.equal(partInfo(T('LAMP')).about, 'Behaves as the LED of the library (by its Silinx.Model).');
});

// a circuit: the supply's + at (-20, -20), its − at (-20, -19); parts placed, wires from point to point
function circuit(parts, wires) {
  const m = newCircuit('kc', 'vhdl', { breadboard: false });
  m.parts.push({ id: 'P1', type: 'supply', x: -20, y: -20 }, ...parts);
  wires.forEach((points, i) => m.wires.push({ id: `w${i + 1}`, points, color: 'blue' }));
  return normalizeCircuit(m);
}
const PLUS = [-20, -20], MINUS = [-20, -19];

test('a KiCad LED lit from its anode (KiCad\'s pin 2) to its cathode; the wrong way round: dark, Check says so; its HDL port; its colour its own', () => {
  load();
  // (D1 at (0, 0): its cathode, pad 1, there; its anode, pad 2, a step up)
  const right = circuit([{ id: 'D1', type: T('LED_Red'), x: 0, y: 0, color: 'blue' }], [[PLUS, [0, -1]], [MINUS, [0, 0]]]);
  assert.equal(right.parts.find((p) => p.id === 'D1').color, 'red', 'its own colour, not one given');
  const sim = createCircuitSim(right);
  sim.run();
  assert.deepEqual(sim.leds(), { D1: 'on' });
  assert.deepEqual(checkCircuit(right), []);
  assert.deepEqual(circuitPorts(right).outputs.map((o) => [o.name, o.part]), [['D1', 'D1']]);
  assert.match(generateCircuit(right, 'vhdl').code, /D1 *: out std_logic/);
  assert.match(generateCircuit(right, 'verilog').code, /output (wire )?D1/);
  const wrong = circuit([{ id: 'D1', type: T('LED_Red'), x: 0, y: 0 }], [[PLUS, [0, 0]], [MINUS, [0, -1]]]);
  const s2 = createCircuitSim(wrong);
  s2.run();
  assert.deepEqual(s2.leds(), { D1: 'off' });
  assert.deepEqual(checkCircuit(wrong).map((d) => `${d.severity}: ${d.message}`), ['warning: D1 never lights: it is the wrong way round (its anode on the supply\'s −, its cathode on the supply\'s +)']);
  assert.equal(newId(right, T('LED_Red')), 'D2', 'named as an LED');
});

test('a KiCad slide switch: its common (the middle pin) to A while off, to B while on; a KiCad push button: closed while pressed', () => {
  load();
  // the switch S1 at (0, 0): its pins at (0..2, 0), the middle one its common; A on +, B on −; its common to an LED of the library
  const m = circuit([{ id: 'S1', type: T('SW_SPDT'), x: 0, y: 0 }, { id: 'D1', type: 'led', x: 10, y: 0 }],
    [[PLUS, [0, 0]], [MINUS, [2, 0]], [[1, 0], [10, 0]], [[11, 0], MINUS]]);
  const sim = createCircuitSim(m);
  sim.run();
  assert.deepEqual(sim.leds(), { D1: 'on' }, 'off: its common to A, the +');
  sim.set('S1', true);
  sim.run();
  assert.deepEqual(sim.leds(), { D1: 'off' }, 'on: its common to B, the −');
  assert.deepEqual(circuitPorts(m).inputs.map((i) => [i.name, i.part]), [['S1', 'S1']]);
  assert.deepEqual(checkCircuit(m), []);
  // the button B1 at (0, 5): its pins at (0, 5) and (1, 5); + to one, the other to an LED
  const b = circuit([{ id: 'B1', type: T('BTN'), x: 0, y: 5 }, { id: 'D1', type: 'led', x: 10, y: 5 }, { id: 'R1', type: 'pull-down', x: 10, y: 8 }],
    [[PLUS, [0, 5]], [[1, 5], [10, 5]], [[10, 8], [10, 5]], [[11, 5], MINUS]]);
  const bs = createCircuitSim(b);
  bs.run();
  assert.deepEqual(bs.leds(), { D1: 'off' });
  bs.set('B1', true);
  bs.run();
  assert.deepEqual(bs.leds(), { D1: 'on' });
  assert.equal(newId(b, T('BTN')), 'B2');
});
