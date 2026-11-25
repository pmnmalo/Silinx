// The System Emulator's Explorer 16/32 (#5484, core/system-emu-explorer.js through core/system-emu.js): a PIC24 node's
// board to emulate (its buttons, those whose pins a link drives left out; R6 and the TC1047A; its LEDs' pins watched),
// what it shows over a window (each LED's share of it lit, the buttons held, R6 and the temperature, the LCD's rows), its
// buttons pressed through the node's pins (S3 lighting D3 in its firmware), R6 and the temperature on the board's model
// (the A/D converter reads them), the wrong part or value refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emulationBoards, withBoards, watchBoards, boardStates, setBoardInput } from '../core/system-emu.js';
import { systemFromInputs } from '../core/system-run.js';
import { systemPlan } from '../core/system-build.js';
import { normalizeSystem } from '../core/system-doc.js';
import { explorerOf } from '../core/system-sim-pic24.js';
import { EXPLORER_ANALOG } from '../core/system-emu-explorer.js';
import { explorerHex } from './pic24-node-lib.mjs';

const MS = 1e9;
function emulate(sys) {
  const plan = systemPlan(sys, {});
  const inputs = { plan, netlists: {}, firmware: Object.fromEntries(sys.nodes.filter((n) => n.kind === 'mcu').map((n) => [n.id, { name: n.firmware, data: explorerHex() }])) };
  const boards = emulationBoards(sys, inputs);
  const r = systemFromInputs(sys, withBoards(inputs, boards));
  watchBoards(r.sim, boards);
  return { sim: r.sim, boards };
}
const one = () => normalizeSystem({ name: 's', nodes: [{ id: 'pic', kind: 'mcu', board: 'explorer-1632', firmware: 'pic/e.hex', interfaces: [] }], links: [] });

test('#5484 an Explorer 16/32 to emulate: its buttons, R6 and the TC1047A; its LEDs\' pins watched', () => {
  const { boards } = emulate(one());
  const b = boards[0];
  assert.deepEqual([b.id, b.kind, b.arch, b.board.id], ['pic', 'mcu', 'pic24', 'explorer-1632']);
  assert.deepEqual(b.inputs, [{ pin: 'S3', kind: 'button', nodePin: 'RD6' }, { pin: 'S4', kind: 'button', nodePin: 'RD13' }, { pin: 'S5', kind: 'button', nodePin: 'RA7' },
    { pin: 'S6', kind: 'button', nodePin: 'RD7' }, { pin: 'R6', kind: 'pot', min: 0, max: 1 }, { pin: 'TC1047A', kind: 'temp', min: -40, max: 125 }]);
  assert.deepEqual(b.outputs, ['RA0', 'RA1', 'RA2', 'RA3', 'RA4', 'RA5', 'RA6', 'RA7']);
  assert.deepEqual([b.held, b.analog], [{}, { R6: 0.5, TC1047A: 25 }]);
  assert.deepEqual(EXPLORER_ANALOG.R6, { kind: 'pot', min: 0, max: 1, rest: 0.5 });
});

test('#5484 what the Explorer 16/32 shows: its LCD\'s rows, D4 and D5 lit; S3 held lights D3, let go turns it off; R6 and the temperature', () => {
  const { sim, boards } = emulate(one());
  const [b] = boards;
  sim.run(10 * MS);
  boardStates(sim, boards, 0, 5 * MS);
  let s = boardStates(sim, boards, 5 * MS, 10 * MS).pic;
  assert.deepEqual(s.lcd, ['Silinx PIC24    ', 'Explorer 16/32  ']);
  assert.deepEqual(Object.entries(s.leds).map(([d, v]) => [d, v > 0.5]), [['D3', false], ['D4', true], ['D5', true], ['D6', false], ['D7', false], ['D8', false], ['D9', false], ['D10', false]]);
  assert.deepEqual([s.leds.D4, s.leds.D5, s.held, s.analog], [1, 1, {}, { R6: 0.5, TC1047A: 25 }]);
  setBoardInput(sim, b, 'S3', 1);
  setBoardInput(sim, b, 'R6', 0.2);
  setBoardInput(sim, b, 'TC1047A', 40);
  sim.run(15 * MS);
  s = boardStates(sim, boards, 10 * MS, 15 * MS).pic;
  assert.ok(s.leds.D3 > 0.99, `D3 lit: ${s.leds.D3}`);
  assert.deepEqual([s.held, s.analog], [{ S3: true }, { R6: 0.2, TC1047A: 40 }]);
  // (on the board's model: the A/D converter's inputs)
  const x = explorerOf(sim.nodes.get('pic'));
  assert.ok(Math.abs(x.dev.adc.volts.get('AN5') - 0.66) < 1e-9 && Math.abs(x.dev.adc.volts.get('AN4') - 0.9) < 1e-9);
  setBoardInput(sim, b, 'S3', 0);
  sim.run(20 * MS);
  s = boardStates(sim, boards, 15 * MS, 20 * MS).pic;
  assert.ok(s.leds.D3 < 0.01, `D3 off within the loop's turn: ${s.leds.D3}`);
  assert.deepEqual(s.held, { S3: false });
  assert.deepEqual(sim.log, []);
});

test('#5484 an Explorer 16/32\'s button whose pin a link drives is no input; a wrong part or value refused', () => {
  const sys = normalizeSystem({ name: 'g', nodes: [
    { id: 'a', kind: 'mcu', board: 'explorer-1632', firmware: 'a/e.hex', interfaces: [{ name: 'o', kind: 'gpio', pins: ['RA0'], dir: 'out' }] },
    { id: 'b', kind: 'mcu', board: 'explorer-1632', firmware: 'b/e.hex', interfaces: [{ name: 'i', kind: 'gpio', pins: ['RD13'], dir: 'in' }] }],
  links: [{ id: 'w', kind: 'gpio', a: 'a.o', b: 'b.i' }] });
  const { sim, boards } = emulate(sys);
  assert.deepEqual(boards.map((b) => [b.id, b.inputs.filter((i) => i.kind === 'button').map((i) => i.pin)]), [['a', ['S3', 'S4', 'S5', 'S6']], ['b', ['S3', 'S5', 'S6']]]);
  assert.throws(() => setBoardInput(sim, boards[1], 'S4', 1), { message: '\'S4\' is not a button, the potentiometer nor the temperature sensor of b\'s Explorer 16/32 (S3, S5, S6, R6, TC1047A)' });
  assert.throws(() => setBoardInput(sim, boards[0], 'R6', 'x'), { message: 'R6\'s value: a number from 0 to 1' });
  // (a value out of its range: at its end)
  setBoardInput(sim, boards[0], 'R6', 3);
  assert.equal(boards[0].analog.R6, 1);
  // (S3 on a: its D3, a link to b's RD13: b's RA1 follows)
  setBoardInput(sim, boards[0], 'S3', 1);
  sim.run(5 * MS);
  assert.deepEqual([sim.nodes.get('a').value('RA0'), sim.nodes.get('b').value('RA1')], [1, 1]);
});
