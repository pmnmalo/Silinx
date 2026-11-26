// The Board Emulator's analog inputs (#5385, core/emulate-xadc.js): a design's XADC instance found (its signals of the
// model's analog values), its VAUX6 and its die temperature set as the emulator's controls set them, the design's code
// on its LEDs against UG480's transfer function, a power cycle's values kept by the caller; the refusals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import { primitiveSources } from '../core/unisim.js';
import { xadcInputs, setXadcInput, XADC_TEMP } from '../core/emulate-xadc.js';
import { XADC_TOP } from './xadc-design.mjs';

function design() {
  const srcs = [{ path: 'adcled.vhd', lang: 'vhdl', text: XADC_TOP }];
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  const d = elaborate(lib, 'adcled');
  assert.deepEqual([...lib.errors, ...d.diags].map((x) => x.message), []);
  return d;
}

test('a design\'s XADC: found, its VAUX6 set to 0.5 V and to 1 V, its code on the LEDs; its temperature', () => {
  const d = design();
  const xs = xadcInputs(d);
  assert.equal(xs.length, 1);
  assert.equal(xs[0].path, 'adcled.adc');
  assert.equal(xs[0].vaux.length, 16);
  const s = new Simulator(d);
  const clk = d.top.ports.find((p) => p.name === 'clk').sig, led = d.top.ports.find((p) => p.name === 'led').sig;
  let t = 0;
  const run = (n) => { for (let k = 0; k < n; k++) { s.force(clk, { w: 1, v: 1n, x: 0n }); s.run(t += 5000); s.force(clk, { w: 1, v: 0n, x: 0n }); s.run(t += 5000); } };
  const force = (sig, v) => s.force(sig, v);
  run(300);
  assert.equal(Number(led.val.v), 0, '0 V at first');
  setXadcInput(xs[0], 'vaux6', 0.5, force);
  run(300);
  assert.equal(Number(led.val.v), (Math.floor(0.5 * 4096) >> 4), 'half scale: 1000 0000');
  setXadcInput(xs[0], 'vaux6', 1, force);
  run(300);
  assert.equal(Number(led.val.v), 0xff, 'full scale');
  setXadcInput(xs[0], 'temp', 85, force);
  assert.equal(Number(xs[0].temp.val.v), 85000, 'the temperature in thousandths of °C');
  setXadcInput(xs[0], 'temp', -40, force);
  assert.equal(Number(BigInt.asIntN(32, xs[0].temp.val.v)), -40000);
});

test('the refusals: a value out of range, an input it has not', () => {
  const x = xadcInputs(design())[0], force = () => {};
  assert.throws(() => setXadcInput(x, 'temp', 200, force), /^Error: the die temperature: from -40 to 125 °C$/);
  assert.throws(() => setXadcInput(x, 'vaux3', 1.2, force), /^Error: vaux3: from 0 to 1 V$/);
  assert.throws(() => setXadcInput(x, 'vaux16', 0.1, force), /^Error: no XADC input 'vaux16' \(temp, vp, vaux0 to vaux15\)$/);
  assert.deepEqual(XADC_TEMP, { min: -40, max: 125, default: 25 });
  assert.deepEqual(xadcInputs({ signals: [] }), []);
});
