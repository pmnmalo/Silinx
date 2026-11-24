// Every part of a circuit that behaves is checked against a reference of its own somewhere in the tests (#4602): the
// ICs against their datasheets' function tables (each group's test, test/circuit-references.mjs reads their tables), the
// other parts (the breadboards, the supply, the switches, the displays, the probe) by the tests named here, and the KiCad
// catalogue's symbols that behave as one of them; a table's part that is no longer the library's fails too, and the
// symbols drawn only (no model: #4485, #4452) are counted, not failed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PARTS } from '../core/circuit-parts.js';
import { CATALOGUE } from '../core/kicad-catalogue-data.js';
import { DISCRETE } from '../core/circuit-kicad-parts.js';
import { REFERENCE_TESTS, tableKeys, referencedParts } from './circuit-references.mjs';

// the parts but the ICs: the test that checks each one's behaviour (it names the part)
const OTHER_TESTS = {
  'breadboard-half': 'circuit.test.js', 'breadboard-full': 'circuit-parts.test.js', supply: 'circuit.test.js',
  'logic-switch': 'circuit.test.js', button: 'circuit.test.js', spdt: 'circuit-parts.test.js', 'dip-4': 'circuit-parts.test.js',
  'dip-8': 'circuit-parts.test.js', clock: 'circuit-parts.test.js', 'pull-up': 'circuit-parts.test.js', 'pull-down': 'circuit-parts.test.js',
  led: 'circuit.test.js', 'seg7-cc': 'circuit-parts.test.js', 'seg7-ca': 'circuit-parts.test.js', 'led-bar-10': 'circuit-parts.test.js',
  probe: 'circuit-probe.test.js',
  // (the boards, #5215: their pins against the boards' descriptions)
  'lcd-1602': 'circuit-lcd.test.js', 'oled-ssd1306': 'circuit-oled.test.js', lm75: 'circuit-lm75.test.js', 'servo-sg90': 'circuit-servo.test.js', 'keypad-4x4': 'circuit-keypad.test.js', 'rotary-encoder': 'circuit-encoder.test.js', buzzer: 'circuit-buzzer.test.js', 'stepper-28byj48': 'circuit-stepper.test.js', 'hc-sr04': 'circuit-sonar.test.js', 'hc-sr501': 'circuit-pir.test.js', dht11: 'circuit-dht.test.js', dht22: 'circuit-dht.test.js', 'arduino-uno': 'circuit-boards.test.js', 'arduino-nano': 'circuit-boards.test.js', 'fpga-basys2': 'circuit-boards.test.js', 'fpga-nexys2': 'circuit-boards.test.js',
};
// a part with a model and no reference test yet: its issue (none today; never a part left out silently)
const GAPS = {};

const HERE = new URL('./', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, HERE), 'utf8');

/** Every part with behaviour and the test that checks it (or its gap's issue, or nothing). */
function coverage() {
  const refs = referencedParts();
  for (const [type, file] of Object.entries(OTHER_TESTS)) {
    if (new RegExp(`'${type}'`).test(read(file))) refs.set(type, file);
  }
  return refs;
}

test('tableKeys: a table\'s keys (numbers, names, strings), those set after it; strings and comments not read; a spread refused', () => {
  const src = [
    'const SHEETS = {',
    '  7400: { a: 1, out: (c) => (c[1] ? 1 : 0) }, \'dip-4\': [1, 2], x: f({ y: 2 }),',
    '  // 7401: a comment',
    '  "s": \'7402: a string, {\', 74181: `t ${1} }`,',
    '};',
    'SHEETS[74145] = { ...SHEETS[7400] };',
    'const OTHER = { 1: 2 };',
  ].join('\n');
  assert.deepEqual(tableKeys(src, 'SHEETS'), ['7400', 'dip-4', 'x', 's', '74181', '74145']);
  assert.deepEqual(tableKeys(src, 'OTHER'), ['1']);
  assert.throws(() => tableKeys(src, 'NONE'), /^Error: no table NONE$/);
  assert.throws(() => tableKeys('const T = { 1: 2, ...U };', 'T'), /^Error: T: a key that is not a literal: \.\.\.U };$/);
  assert.throws(() => tableKeys('const T = { [k]: 2 };', 'T'), /^Error: T: a key that is not a literal: \[k\]: 2 };$/);
});

test('every group test with a table of datasheets is read here; each of its tables is there', () => {
  const tables = fs.readdirSync(HERE).filter((f) => /^circuit-.*\.test\.js$/.test(f) && /^const (SHEETS?|PINOUT|REF) = \{/m.test(read(f)));
  assert.deepEqual(tables.sort(), Object.keys(REFERENCE_TESTS).sort());
  for (const [file, names] of Object.entries(REFERENCE_TESTS)) for (const n of names) assert.ok(tableKeys(read(file), n).length > 0, `${file} ${n}`);
});

test('every part of the library is checked against its reference, by one test; no table names a part that is not the library\'s', (t) => {
  const refs = coverage(), parts = Object.keys(PARTS);
  assert.deepEqual([...refs.keys()].filter((k) => !PARTS[k]), [], 'a table\'s part no longer in the library');
  assert.deepEqual(Object.keys(GAPS).filter((k) => !PARTS[k] || refs.has(k)), [], 'a gap no longer one (gone, or tested)');
  assert.deepEqual(parts.filter((k) => !refs.has(k) && !GAPS[k]), [], 'a part with no reference test');
  assert.deepEqual([...refs].filter(([, f]) => f.includes(',')), [], 'a part in two groups');
  const ics = parts.filter((k) => PARTS[k].kind === 'ic');
  t.diagnostic(`${parts.length} parts: ${ics.length} ICs and ${parts.length - ics.length} others; ${parts.filter((k) => refs.has(k)).length} checked, ${Object.keys(GAPS).length} gaps`);
});

test('the KiCad catalogue: each symbol with a model behaves as a part checked against its reference; those drawn only counted', (t) => {
  const refs = coverage();
  assert.deepEqual(Object.keys(DISCRETE).filter((k) => !refs.has(k)), [], 'a discrete part a KiCad symbol behaves as');
  const modelled = CATALOGUE.filter((e) => e.as);
  assert.deepEqual(modelled.filter((e) => !PARTS[e.as]).map((e) => `${e.symbol}: ${e.as}`), [], 'a symbol as no part of the library');
  assert.deepEqual(modelled.filter((e) => !refs.has(e.as) && !GAPS[e.as]).map((e) => `${e.symbol}: ${e.as}`), [], 'a symbol whose part has no reference test');
  // (drawn only: the 74xx and 4xxx logic ICs with no model yet, #4485's and the others'; the other libraries' symbols)
  const drawn = CATALOGUE.filter((e) => !e.as), logic = drawn.filter((e) => /^kicad-(74xx|4xxx)$/.test(e.library));
  t.diagnostic(`${CATALOGUE.length} KiCad symbols: ${modelled.length} with a model (${new Set(modelled.map((e) => e.as)).size} parts), ${drawn.length} drawn only (${logic.length} logic ICs: ${logic.map((e) => e.symbol).join(', ')})`);
  assert.ok(modelled.length > 0 && drawn.length > 0);
});
