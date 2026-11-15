// A circuit part's details (core/circuit-part-info.js, #4126): every part has them; an IC's chip, family, package, supply
// pins, logic (each gate written with its pins' names), delay, open-collector outputs and an open input's reading, checked
// against the parts' own descriptions; what each other part does; each pin's role; an unknown part.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partInfo, PIN_ROLES } from '../core/circuit-part-info.js';
import { PARTS, PART_ORDER, readInput } from '../core/circuit-parts.js';

test('#4126 every part: its details, consistent with its description', () => {
  for (const t of PART_ORDER) {
    const d = PARTS[t], info = partInfo(t);
    assert.equal(info.title, d.title, t);
    assert.deepEqual(info.pins.map((q) => q.n), d.pins.map((q) => q.n), t);
    assert.ok(info.pins.every((q) => Object.values(PIN_ROLES).includes(q.role)), `${t}: a pin's role named`);
    if (d.kind === 'ic') {
      assert.equal(info.about, undefined, t);
      assert.equal(info.package, `DIP-${d.dip}`, t);
      assert.equal(info.openInput, d.family === 'ttl' ? '1' : 'X', t);
      assert.equal(info.openInput, readInput(d.family, 'Z'), t);
      // the supply: its + pin, then its ground, by number
      const vcc = d.pins.find((q) => q.dir === 'vcc'), gnd = d.pins.find((q) => q.dir === 'gnd');
      assert.equal(info.power, `${vcc.name} ${vcc.n}, ${gnd.name} ${gnd.n}`, t);
      assert.equal(info.delay, d.tpd, t);
      assert.equal(!!info.openCollector, !!d.oc || d.pins.some((q) => q.dir === 'oc'), t);
      if (d.gates) {
        assert.equal(info.logic.length, d.gates.length, t);
        // each gate: its output's name = its function of its inputs' names
        d.gates.forEach((g, i) => {
          const nm = (n) => d.pins.find((q) => q.n === n).name;
          assert.equal(info.logic[i], `${nm(g.out)} = ${g.fn.toUpperCase()}(${g.ins.map(nm).join(', ')})`, t);
        });
      } else assert.equal(info.logic, undefined, t);
    } else {
      assert.ok(info.about?.length > 20, `${t}: what it does`);
      for (const k of ['chip', 'family', 'package', 'power', 'logic', 'delay', 'openInput']) assert.equal(info[k], undefined, `${t}: ${k}`);
    }
  }
});

test('#4126 a gate IC, a CMOS IC, an open-collector IC, an LED, a supply; an unknown part', () => {
  const nand = partInfo('7400');
  assert.deepEqual({ chip: nand.chip, family: nand.family, package: nand.package, power: nand.power, logic: nand.logic, delay: nand.delay, openInput: nand.openInput },
    { chip: 'SN74LS00', family: '74LS (TTL)', package: 'DIP-14', power: 'VCC 14, GND 7', logic: ['1Y = NAND(1A, 1B)', '2Y = NAND(2A, 2B)', '3Y = NAND(3A, 3B)', '4Y = NAND(4A, 4B)'], delay: 10, openInput: '1' });
  assert.deepEqual(partInfo('7404').logic.slice(0, 2), ['1Y = NOT(1A)', '2Y = NOT(2A)']);
  const cmos = partInfo('4011');
  assert.deepEqual([cmos.family, cmos.power, cmos.openInput], ['4000 (CMOS)', 'VDD 14, VSS 7', 'X']);
  assert.equal(partInfo('7401').openCollector, true);
  assert.equal(partInfo('7447').openCollector, true, 'its outputs open collector, its flag not set');
  assert.deepEqual(partInfo('7401').pins[0], { n: 1, name: '1Y', role: 'open-collector output' });
  assert.equal(partInfo('74138').logic, undefined, 'an MSI IC: its title says its function');
  assert.deepEqual(partInfo('led').pins, [{ n: 1, name: 'A', role: 'input' }, { n: 2, name: 'K', role: 'input' }]);
  assert.deepEqual(partInfo('supply').pins.map((q) => q.role), ['supply +5 V', 'supply GND']);
  assert.deepEqual(partInfo('breadboard-half').pins, []);
  assert.equal(partInfo('nope'), null);
  assert.equal(partInfo('__proto__'), null);
});
