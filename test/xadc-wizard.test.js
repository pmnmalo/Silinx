// The XADC Wizard's module (#5385, core/xadc-wizard.js): its plan (CLKDIV for ADCCLK ≤ 26 MHz, the sequence's INIT_48 /
// INIT_49 bits, its rates) and its refusals; its module in VHDL and in Verilog compiled, elaborated with no message,
// linted with no warning, and simulated with the XADC's model: each channel's output the code of UG480's transfer
// function (the die temperature at 25 °C, VCCINT, a VAUX input forced to 0.75 V, then to 0.2 V), EOS once a pass; its
// settings read back from its header.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planXadc, xadcModule, XADC_CHANNELS } from '../core/xadc-wizard.js';
import { readWizardSpec } from '../core/clocking.js';
import { compile, elaborate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { primitiveSources } from '../core/unisim.js';

const spec = (lang, more = {}) => ({ wizard: 'xadc', version: 1, name: 'adc', lang, family: 'artix7', dclkMHz: 100, dclk: 'clk', reset: 'rst', eos: 'eos',
  channels: [{ id: 'temp', port: 'temp' }, { id: 'vccint', port: 'vint' }, { id: 'vaux6', port: 'pot' }], ...more });

test('its plan: CLKDIV for an ADCCLK of 26 MHz at most, the channels\' bits, the rates; its refusals', () => {
  const p = planXadc(spec('vhdl'));
  assert.deepEqual([p.clkdiv, p.init[41], p.init[42], p.init[48], p.init[49], p.errors], [4, 0x2F0F, 0x0400, 0x0300, 0x0040, []]);
  assert.deepEqual(p.notes, ['ADCCLK 25 MHz (DCLK / 4): a conversion every 26 cycles, 961.5 kSPS in all, 320.5 kSPS a channel.']);
  assert.equal(planXadc(spec('vhdl', { dclkMHz: 26 })).clkdiv, 2, 'never under 2');
  assert.equal(planXadc(spec('vhdl', { dclkMHz: 52.1 })).clkdiv, 3);
  assert.equal(planXadc(spec('vhdl', { channels: [{ id: 'vpvn' }, { id: 'vccbram' }, { id: 'vccaux' }, { id: 'vaux15' }] })).init[48], (1 << 11) | (1 << 14) | (1 << 10));
  assert.deepEqual(planXadc(spec('vhdl', { dclkMHz: 5, channels: [] })).errors, ['DCLK: from 8 to 250 MHz (UG480).', 'Choose at least one channel.']);
  assert.deepEqual(planXadc(spec('vhdl', { channels: [{ id: 'temp' }, { id: 'temp' }, { id: 'vaux16' }] })).errors, ['No channel vaux16.', 'A channel is chosen twice.']);
  assert.equal(xadcModule(spec('vhdl', { channels: [] })).code, '');
  assert.equal(XADC_CHANNELS.length, 21);
});

for (const lang of ['vhdl', 'verilog']) {
  test(`its module in ${lang}: no message, no lint warning; simulated with the XADC's model, each output its channel's code`, () => {
    const s0 = spec(lang);
    const { code } = xadcModule(s0);
    assert.deepEqual(readWizardSpec(code), s0, 'its settings in its header');
    const srcs = [{ path: lang === 'vhdl' ? 'adc.vhd' : 'adc.v', lang, text: code }];
    const lib = compile([...primitiveSources(srcs), ...srcs]);
    const d = elaborate(lib, 'adc');
    assert.deepEqual([...lib.errors, ...d.diags].map((x) => x.message), []);
    assert.deepEqual(designChecks(lib, d, { lint: true }).filter((x) => !/XADC|unisim/i.test(x.file ?? '')).map((x) => `${x.severity}: ${x.message}`), []);
    const sim = new Simulator(d);
    const port = (n) => d.top.ports.find((p) => p.name === n).sig;
    let t = 0;
    const set = (n, v) => sim.force(port(n), V.mk(1, BigInt(v)));
    for (const n of ['clk', 'rst', 'pot_p', 'pot_n']) set(n, 0);
    sim.run(t += 5);
    const vaux = d.signals.find((x) => x.name === 'vaux_mv');
    const force = (mv) => sim.force(vaux, vaux.val.map((e, i) => (i === 6 ? V.mk(32, BigInt(mv)) : e)));
    let eos = 0;
    const run = (n) => { for (let k = 0; k < n; k++) { set('clk', 1); sim.run(t += 5); set('clk', 0); sim.run(t += 5); eos += Number(port('eos').val.v); } };
    const out = () => ['temp', 'vint', 'pot'].map((n) => Number(port(n).val.v));
    force(750);
    run(1000);
    // (25 °C: (298.15 × 4096 / 503.975); VCCINT 1 V: 4096 / 3; 0.75 V: 3072; three channels × 26 × 4 cycles a pass)
    assert.deepEqual(out(), [Math.floor(298.15 * 4096 / 503.975), Math.floor(4096 / 3), 3072]);
    assert.equal(eos, Math.floor(1000 / 312), 'EOS once a pass');
    force(200);
    run(400);
    assert.equal(out()[2], Math.floor(0.2 * 4096), 'its input moved: its next code');
  });
}
