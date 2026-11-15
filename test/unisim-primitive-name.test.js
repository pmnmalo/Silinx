// A UNISIM primitive's name (#4188): the Design pane's row of an instance of one is the device's primitive, not a
// module missing from the project. Every primitive of the schematic's Device Primitives (both families, at their
// defaults) is one, in any case; a project module's name and the Gowin-only cells are not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUnisimPrimitive } from '../core/unisim.js';
import { DEVICE_PRIMITIVES, primitiveOf } from '../core/primitives.js';

test('#4188 isUnisimPrimitive: the device primitives (any case), not the project\'s modules', () => {
  for (const n of ['BUFG', 'bufg', 'Ramb16_S9', 'DCM_SP', 'FDCE', 'IBUFG', 'RAMB16BWER', 'DSP48A1', 'PLL_BASE', 'BUFIO2', 'LUT4']) assert.ok(isUnisimPrimitive(n), n);
  for (const n of ['counter', 'mem', 'BUFG2', 'rPLL', 'DFFE', '', null, undefined]) assert.equal(isUnisimPrimitive(n), false, String(n));
  // (every symbol of the Device Primitives makes one)
  for (const t of Object.keys(DEVICE_PRIMITIVES)) {
    const p = primitiveOf(t);
    assert.ok(isUnisimPrimitive(p.name), `${t}: ${p.name}`);
  }
});
