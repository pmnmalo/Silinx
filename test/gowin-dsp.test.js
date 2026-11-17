// gowin_pack's DSPs (#4333): Silinx's port (packages/silinx-fpga/src/fpga/gowin/dsp.js, dsp-multalu.js) against Apicula 0.32's
// own gowin_pack, on the designs of test/fixtures/gowin-pack/designs.mjs (DSP) built by the flow on the Tang Nano 9K:
// MULTALU18X18 in its three modes (one design with two of them on two clocks, their enables and resets), MULTALU36X18,
// MULTADDALU18X18, MULT36X36, ALU54D, PADD9 and PADD18, registered or not, synchronous or asynchronous; their .fs byte for byte
// Apicula's. The GW5A's DSPs refused by name, an ALU54D without its B_ADD_SUB refused (Apicula fails on it).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DSP } from './fixtures/gowin-pack/designs.mjs';
import { checkDesign, build, database } from './gowin-pack-lib.mjs';
import { dspAttrs } from '../packages/silinx-fpga/src/fpga/gowin/dsp.js';
import { gowinPack } from '../packages/silinx-fpga/src/fpga/gowin/pack.js';

describe('the DSPs from HDL to the .fs: Apicula\'s byte for byte', { concurrency: 2 }, () => {
  for (const [name, d] of Object.entries(DSP)) test(name, { timeout: 120000 }, () => checkDesign(name, d));
});

test('the GW5A\'s DSPs refused by name; an ALU54D without B_ADD_SUB refused', async () => {
  const db = await database();
  for (const type of ['MULT12X12', 'MULTALU27X18', 'MULTADDALU12X12']) {
    assert.throws(() => dspAttrs({ db }, type, {}, '00', {}), new RegExp(`^Error: gowin_pack: the DSP primitive ${type} is the GW5A's, not supported$`));
  }
  const routed = JSON.parse((await build('alu54', DSP.alu54)).files['open/routed.json']);
  const alu = Object.values(routed.modules.top.cells).find(c => c.type === 'ALU54D');
  delete alu.parameters.B_ADD_SUB;
  assert.throws(() => gowinPack(routed, db), /^Error: gowin_pack: the ALU54D has no parameter B_ADD_SUB$/);
});
