// The Digital Electronic Circuit Wizard's assemblies (#4061, core/circuit-templates.js; the MCP's new_source template):
// N breadboards and a supply, every board powered (checked by a chip on the last one, powered from its rails: the
// circuit's check finds it powered, as an independent reckoning of the rails' connections), a full board's split rails
// joined; switches and LEDs, their labels the vector ports; empty; their parameters' errors (the template page's).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circuitTemplate, CIRCUIT_TEMPLATES } from '../core/circuit-templates.js';
import { templateOf, templateDefaults, templateError } from '../core/chart-templates.js';
import { checkCircuit } from '../core/circuit-check.js';
import { circuitPorts } from '../core/circuit.js';
import { addPart, addWire } from '../core/circuit-edit.js';
import { circuitNets, netSupply } from '../core/circuit-net.js';

// a 7404 on the board `bb`'s f5, its VCC (pin 14) to tp5 and its GND (pin 7) to bn11, its inputs to the − rail
function chipOn(m, bb) {
  const r = addPart(m, { type: '7404', at: `${bb}.f5`, id: 'UT' });
  let c = r.model;
  for (const [from, to] of [['UT.14', `${bb}.tp5`], ['UT.7', `${bb}.bn11`], ...[1, 3, 5, 9, 11, 13].map((p, k) => [`UT.${p}`, `${bb}.${k % 2 ? 'tn' : 'bn'}${20 + k}`])]) c = addWire(c, { from, to }).model;
  return c;
}

test('the templates\' list: boards first, its parameters\' defaults and errors', () => {
  // (no empty one, #4161; then the assemblies of ICs, #4164: test/circuit-assemblies.test.js)
  assert.deepEqual(CIRCUIT_TEMPLATES.map((t) => t.id), ['boards', 'io', 'seg7', 'counter', 'adder', 'gates', 'comparator', 'decoder', 'shift', 'flipflop']);
  assert.equal(templateOf('circuit', 'nope').id, 'boards');
  assert.deepEqual(templateDefaults('circuit', 'boards'), { n: 1, size: 'half' });
  assert.deepEqual(templateDefaults('circuit', 'io'), { n: 4, m: 4 });
  assert.equal(templateError('circuit', 'boards', { n: 5, size: 'half' }), 'Breadboards (N): a whole number from 1 to 4.');
  assert.equal(templateError('circuit', 'boards', { n: 2, size: 'huge' }), 'Size: choose one.');
  assert.equal(templateError('circuit', 'io', { n: 0, m: 2 }), 'Switches (N): a whole number from 1 to 8.');
  assert.equal(templateError('circuit', 'io', { n: 8, m: 8 }), null);
});

test('N breadboards and a supply: every board powered, a full board\'s halves too; no errors, no warnings', () => {
  const one = circuitTemplate('boards', { n: 1, size: 'half' }, { name: 'bench' });
  assert.deepEqual(one.parts.map((p) => [p.id, p.type, p.x, p.y]), [['P1', 'supply', -4, -4], ['BB1', 'breadboard-half', 0, 0]]);
  assert.equal(one.wires.length, 4);
  assert.deepEqual(checkCircuit(one), []);
  for (const size of ['half', 'full']) {
    for (const n of [1, 2, 3, 4]) {
      const m = circuitTemplate('boards', { n, size }, { name: 'bench', lang: 'verilog' });
      assert.deepEqual([m.name, m.lang, m.parts.length], ['bench', 'verilog', n + 1]);
      assert.deepEqual(checkCircuit(m), [], `${n} ${size}`);
      // the last board's chip powered from its own rails (on a full board: its right half's rails, past the split)
      const c = chipOn(m, `BB${n}`);
      assert.deepEqual(checkCircuit(c), [], `${n} ${size}: the chip on BB${n} powered`);
      // every rail's both halves on the supply: a wire from it, its net the supply's + or −
      for (const rail of size === 'full' ? ['tp', 'tn', 'bn', 'bp'] : []) {
        for (const col of [5, 40]) {
          const r = addWire(m, { from: `BB${n}.${rail}${col}`, to: [100, 100], id: 'probe' }).model;
          const net = circuitNets(r).nets.find((x) => x.wires.includes('probe'));
          assert.deepEqual(netSupply(net), { vcc: rail.endsWith('p'), gnd: rail.endsWith('n') }, `BB${n}.${rail}${col}`);
        }
      }
    }
  }
  // (the parameters out of range: kept in it)
  assert.equal(circuitTemplate('boards', { n: 9 }).parts.length, 5);
});

test('switches and LEDs: on the board, their labels the vector ports sw and led; the switches join nothing yet', () => {
  const m = circuitTemplate('io', { n: 3, m: 2 }, { name: 'io' });
  assert.deepEqual(m.parts.map((p) => [p.id, p.x, p.y, p.label ?? '']), [['P1', -4, -4, ''], ['BB1', 0, 0, ''], ['S1', 2, 0, 'sw[0]'], ['S2', 5, 0, 'sw[1]'], ['S3', 8, 0, 'sw[2]'],
    ['D1', 2, 9, 'led[0]'], ['D2', 5, 9, 'led[1]']]);
  assert.deepEqual(circuitPorts(m).inputs.map((p) => p.name), ['sw[0]', 'sw[1]', 'sw[2]']);
  assert.deepEqual(circuitPorts(m).outputs.map((p) => p.name), ['led[0]', 'led[1]']);
  assert.deepEqual(checkCircuit(m).map((d) => `${d.severity}: ${d.message}`), ['warning: S1 (Logic switch) joins nothing', 'warning: S2 (Logic switch) joins nothing', 'warning: S3 (Logic switch) joins nothing']);
  // a switch's column wired to an LED's anode's: it lights it (no warning left for it)
  const w = addWire(m, { from: 'BB1.e3', to: 'BB1.f3' }).model;
  assert.deepEqual(checkCircuit(w).map((d) => d.message), ['S2 (Logic switch) joins nothing', 'S3 (Logic switch) joins nothing']);
  assert.equal(circuitTemplate('io', { n: 8, m: 8 }).parts.length, 18);
});

test('no empty template (#4161): empty, or an unknown one, refused naming the valid ones', () => {
  for (const id of ['empty', 'nope', undefined]) assert.throws(() => circuitTemplate(id, {}, { name: 'e', lang: 'verilog' }), { message: 'template: one of boards, io, seg7, counter, adder, gates, comparator, decoder, shift, flipflop' });
});
