// The Cyclone V's measurement (#5377, scripts/cyclonev-measure.mjs): the size of a netlist's Cyclone V cells and the table,
// then through Yosys's synth_intel_alm -family cyclonev the examples gates (one ALUT, no flip-flop) and blinky (its counter on
// carry chains), each with no warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { synthSize, table, measureNetlist } from '../scripts/cyclonev-measure.mjs';
import { exampleNetlist } from '../scripts/machxo2-measure.mjs';

test('a netlist\'s size on the Cyclone V: ALUTs (their carry chains\' among them), FFs, MLAB, M10K, DSP, I/O, the other cells', () => {
  const cells = { MISTRAL_ALUT6: 3, MISTRAL_ALUT_ARITH: 4, MISTRAL_NOT: 1, MISTRAL_FF: 5, MISTRAL_MLAB: 1, MISTRAL_M10K: 2, MISTRAL_MUL27X27: 1,
    MISTRAL_IB: 2, MISTRAL_OB: 3, MISTRAL_CLKBUF: 1, cyclonev_oscillator: 1 };
  assert.deepEqual(synthSize(cells), { aluts: 8, carry: 4, ffs: 5, mlab: 1, m10k: 2, dsp: 1, ios: 5, other: ['cyclonev_oscillator'] });
  assert.deepEqual(synthSize({}), { aluts: 0, carry: 0, ffs: 0, mlab: 0, m10k: 0, dsp: 0, ios: 0, other: [] });
});

test('the table: a row per example, a failure\'s error, the warnings counted', () => {
  const ok = { name: 'a', ok: true, size: synthSize({ MISTRAL_ALUT2: 1, MISTRAL_IB: 1 }), warnings: [] };
  assert.equal(table([ok, { name: 'b', ok: false, error: 'ERROR: x', warnings: ['w1', 'w2'] }]), [
    '| Example | Synthesis (ALUTs / carry / FFs) | MLAB / M10K / DSP | I/O | Other cells | Warnings |', '|---|---|---|---|---|---|',
    '| a | 1 / 0 / 0 | 0 / 0 / 0 | 1 | none | none |', '| b | no: ERROR: x | - | - | - | 2: w1; w2 |'].join('\n'));
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-cyclonev-test-'));
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('gates and blinky through synth_intel_alm on the Cyclone V: their cells, no warning', { timeout: 600000 }, async () => {
  const gates = await measureNetlist(await exampleNetlist('gates', tmp));
  assert.equal(gates.ok, true, gates.error);
  assert.deepEqual(gates.size, { aluts: 1, carry: 0, ffs: 0, mlab: 0, m10k: 0, dsp: 0, ios: 6, other: [] });
  assert.deepEqual(gates.warnings, []);
  const blinky = await measureNetlist(await exampleNetlist('blinky', tmp));
  assert.equal(blinky.ok, true, blinky.error);
  assert.deepEqual(blinky.size, { aluts: 173, carry: 77, ffs: 92, mlab: 0, m10k: 0, dsp: 0, ios: 27, other: [] });
  assert.deepEqual(blinky.warnings, []);
  assert.equal(blinky.cells.MISTRAL_CLKBUF, 1);
});
