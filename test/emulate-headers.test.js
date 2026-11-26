// The Board Emulator's modules on a board's headers (#5641, core/emulate-headers.js): on the Zybo Z7, the Arty Z7 and the
// Arty S7, the examples' ports the board lacks (LEDs past its own, its display, switches, VGA) are on its Pmods; read from
// the constraints, they become resources the emulator wires (boardWiring's board) and shows, the Pmods they are on named.
// The modules checked against the constraints' text itself (the pins of each port's bits, read by a regular expression);
// stopwatch on the Zynq boards run as on the Basys 3, its display on its Pmods, on both engines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';
import { example, exampleUcf, exampleBoard } from './examples-lib.mjs';
import { designOf } from './compiled-diff.js';
import { engines, boardOf, shown } from './emulate-lib.js';
import { boardWiring } from '../core/emulate.js';
import { withHeaderModules } from '../core/emulate-headers.js';

const { readPins } = await import('../web/js/constraints-format.js');

// a board of two Pmods and an LED of its own; a port of `w` bits (w 1: a scalar)
const BOARD = { name: 'b', resources: [
  { name: 'clk', pins: ['C1'], dir: 'in', group: 'Clock', extra: { period: '10 ns' } },
  { name: 'led', pins: ['L0'], dir: 'out', group: 'LEDs', extra: { activeHigh: true } },
  { name: 'ja', label: 'Pmod JA (JA1-4, JA7-10)', pins: ['A1', 'A2', 'A3', 'A4'], dir: 'inout', group: 'Headers' },
  { name: 'ck_io', label: 'Shield header IO0..IO13 (ck_io0-13)', pins: ['S0', 'S1'], dir: 'inout', group: 'Headers' },
] };
const port = (name, dir, w) => ({ name, dir, sig: { t: w === 1 ? { w: 1, scalar: true } : { w, left: w - 1, right: 0, desc: true, kind: 'logic' } } });
const asg = (o) => Object.fromEntries(Object.entries(o).map(([k, loc]) => [k, { loc }]));

test('#5641 withHeaderModules: a kind of port on header pins a module (its pins in the bits\' order, the Pmods it is on, its first bit); the board\'s own kept', () => {
  const b = withHeaderModules(BOARD, [port('led', 'out', 3), port('sw', 'in', 2), port('dp', 'out', 1)],
    asg({ 'led<0>': 'L0', 'led<2>': 'A2', 'led<1>': 'A1', 'sw<1>': 'S0', 'sw<0>': 'A3', dp: 'S1' }));
  assert.deepEqual(b.resources.slice(0, 4), BOARD.resources);
  assert.deepEqual(b.resources.slice(4).map((r) => [r.name, r.pins, r.group, r.dir, r.extra.on, r.extra.first, r.extra.module, r.label]), [
    ['pmod_led', ['A1', 'A2'], 'LEDs', 'out', ['JA'], 1, true, 'LEDs on JA'],
    ['pmod_sw', ['A3', 'S0'], 'Switches', 'in', ['JA', 'SHIELD'], 0, true, 'Switches on JA, SHIELD'],
    ['dp', ['S1'], '7-segment', 'out', ['SHIELD'], 0, true, '7-segment decimal point on SHIELD'],
  ]);
  // (the display's level: the examples' default, active low; the LEDs active high)
  assert.deepEqual([b.resources[4].extra.activeHigh, b.resources[6].extra.activeLow], [true, true]);
});

test('#5641 withHeaderModules: the same board with no header, no port on one, a port of no known kind or of the other direction there', () => {
  const none = { name: 'n', resources: BOARD.resources.filter((r) => r.group !== 'Headers') };
  assert.equal(withHeaderModules(none, [port('led', 'out', 2)], asg({ 'led<1>': 'A1' })), none);
  assert.equal(withHeaderModules(BOARD, [port('led', 'out', 1)], asg({ led: 'L0' })), BOARD);
  assert.equal(withHeaderModules(BOARD, [port('x', 'out', 2), port('led', 'in', 2), port('sw', 'out', 1)], asg({ 'x<0>': 'A1', 'led<0>': 'A2', sw: 'A3' })), BOARD);
  assert.equal(withHeaderModules(null, [], {}), null);
  // (made once: a board with its modules given again is kept, its modules not doubled)
  const once = withHeaderModules(BOARD, [port('led', 'out', 2)], asg({ 'led<1>': 'A1' }));
  assert.equal(withHeaderModules(once, [port('led', 'out', 2)], asg({ 'led<1>': 'A1' })), once);
  assert.equal(boardWiring({ ports: [port('led', 'out', 2)], assignments: asg({ 'led<1>': 'A1' }), board: once }).board, once);
});

test('#5641 boardWiring: a module\'s switches and buttons wired as switches and buttons, its LEDs numbered after the board\'s; wiring.board the board with them', () => {
  const ports = [port('led', 'out', 2), port('sw', 'in', 1), port('btn', 'in', 1)];
  const w = boardWiring({ ports, assignments: asg({ 'led<0>': 'L0', 'led<1>': 'A1', sw: 'A2', btn: 'A3' }), board: BOARD });
  assert.deepEqual(w.bits.map((b) => [b.bit, b.kind, b.res.name, b.idx, b.led]), [
    ['led<1>', 'led', 'pmod_led', 0, 1], ['led<0>', 'led', 'led', 0, 0], ['sw', 'sw', 'pmod_sw', 0, undefined], ['btn', 'btn', 'pmod_btn', 0, undefined]]);
  assert.deepEqual(w.board.resources.map((r) => r.name), ['clk', 'led', 'ja', 'ck_io', 'pmod_led', 'pmod_sw', 'pmod_btn']);
  // (a board with no header: itself)
  assert.equal(boardWiring({ ports, assignments: {}, board: boardOf('basys3') }).board.resources.length, boardOf('basys3').resources.length);
});

// each port's bits' pins in the constraints' text, read by a regular expression: { port: [pin of bit 0, bit 1, …] }
const pinsInText = (text) => {
  const out = {};
  for (const m of text.matchAll(/PACKAGE_PIN (\w+) .*\[get_ports \{(\w+)(?:\[(\d+)\])?\}\]/g)) (out[m[2]] ??= [])[Number(m[3] ?? 0)] = m[1];
  return out;
};
// the Pmods' resources of the board: the name of the one each pin is on
const pmodOf = (board, pin) => board.resources.find((r) => r.group === 'Headers' && r.pins.includes(pin))?.label.match(/^Pmod (\w+)|^(Shield)/).slice(1).find(Boolean).toUpperCase();

for (const [board, variant] of [['zybo-z7', '20'], ['zybo-z7', '10'], ['arty-z7', '20'], ['arty-s7', '50']]) {
  for (const name of ['stopwatch', 'pong', 'micro80', 'vga']) {
    test(`#5641 ${name} on the ${board}-${variant}: its ports on the Pmods modules of their kind, on the pins its constraints give them, no bit unwired`, () => {
      const t = exampleBoard(name, { board, variant }), ex = example(name), { text, device } = exampleUcf(name, t);
      const b = boardOf(t.board, variant), d = designOf(ex.design, ex.project.top);
      const w = boardWiring({ ports: d.top.ports, assignments: readPins(device, text).assignments, board: b });
      assert.deepEqual(w.unmapped, []);
      assert.deepEqual(w.bits.filter((x) => x.kind === 'other' && !x.res.name.startsWith('vga_')).map((x) => x.bit), []);
      // each module: the pins of its port's bits on the Pmods, the lowest first, the Pmods named
      const own = new Set(b.resources.flatMap((r) => (r.group === 'Headers' ? [] : r.pins)));
      const want = {};
      for (const [p, pins] of Object.entries(pinsInText(text))) {
        const onPmod = pins.map((pin, i) => [pin, i]).filter(([pin]) => pin && !own.has(pin));
        if (!onPmod.length) continue;
        const res = { led: 'pmod_led', sw: 'pmod_sw', btn: 'pmod_btn' }[p] || p;
        want[res] = [onPmod.map(([pin]) => pin), [...new Set(onPmod.map(([pin]) => pmodOf(b, pin)))], onPmod[0][1]];
      }
      const got = Object.fromEntries(w.board.resources.filter((r) => r.extra?.module).map((r) => [r.name, [r.pins, r.extra.on, r.extra.first]]));
      assert.deepEqual(got, want);
      assert.ok(Object.keys(got).length > 0, 'some module');
    });
  }
}

// the display as it reads, AN3 (the leftmost digit) first (test/emulate-boards.test.js's)
const DIGITS = { '0000000': ' ', '1111110': '0', '0110000': '1', '1101101': '2', '1111001': '3', '0110011': '4', '1011011': '5', '1011111': '6', '1110000': '7', '1111111': '8', '1111011': '9' };
const digitsOf = (st) => st.prev.digits.map((d) => (d ? (DIGITS[d.seg.map(Math.round).join('')] ?? '?') + (Math.round(d.dp) ? '.' : '') : ' ')).reverse().join('');

for (const [board, variant] of [['zybo-z7', '20'], ['arty-z7', '10']]) {
  test(`#5641 stopwatch on the ${board}-${variant}: its display on the Pmods, BTN0 starts and stops it, SW0 resets it, on both engines`, async () => {
    const t = exampleBoard('stopwatch', { board, variant }), ex = example('stopwatch'), { text, device } = exampleUcf('stopwatch', t);
    const b = await engines({ sources: ex.design, top: ex.project.top, generics: { CS: 20, STABLE: 4, REFRESH: 4 }, assignments: readPins(device, text).assignments, board: boardOf(t.board, variant) });
    assert.deepEqual([b.cb.clock, b.period, b.wiring.unmapped], ['clk', 8000, []]);
    const show = (n) => { const st = b.window(n); assert.deepEqual(shown(st.cb), shown(st.ev)); return digitsOf(st.ev); };
    b.force('sw', 0n);
    b.force('btn', 0n);
    assert.equal(show(400), ' 0.00', 'at rest: 0.00');
    const press = (bit) => { b.force('btn', 1n << BigInt(bit)); b.window(40); b.force('btn', 0n); b.window(40); };
    press(0);
    const a = show(400), c = show(400);
    assert.match(a, /^[ \d]\d\.\d\d$/);
    assert.ok(Number(c) > Number(a), `running: ${a} then ${c}`);
    press(0);
    const s = show(400);
    assert.equal(show(400), s, 'stopped: the time stays');
    b.force('sw', 1n);
    b.window(40);
    b.force('sw', 0n);
    assert.equal(show(400), ' 0.00', 'SW0: reset');
    assert.deepEqual(b.cb.log, []);
  });
}
