// gowin_pack's I/O logic and clock primitives (#4333): Silinx's port (packages/silinx-fpga/src/fpga/gowin/iologic.js, hclk.js)
// against Apicula 0.32's own gowin_pack, on the designs of test/fixtures/gowin-pack/designs.mjs (IOLOGIC) built by the flow on
// the Tang Nano 9K: ODDR / ODDRC (with a tristate), IDDR / IDDRC, the serialisers and deserialisers by 4, 8, 10 and 7 with their
// CLKDIVs, an IODELAY, DHCEN, DCS and DQCE; their .fs byte for byte Apicula's. CLKDIV2, which nextpnr does not route alone, against
// Apicula's set_hclk_attrs; the primitives the GW1N-9C has not, refused by name.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { IOLOGIC } from './fixtures/gowin-pack/designs.mjs';
import { checkDesign, build, database } from './gowin-pack-lib.mjs';
import { hclkAttrs } from '../packages/silinx-fpga/src/fpga/gowin/hclk.js';
import { iologicAttrs } from '../packages/silinx-fpga/src/fpga/gowin/iologic.js';
import { gowinPack } from '../packages/silinx-fpga/src/fpga/gowin/pack.js';

describe('the I/O logic and the clock primitives from HDL to the .fs: Apicula\'s byte for byte', { concurrency: 2 }, () => {
  for (const [name, d] of Object.entries(IOLOGIC)) test(name, { timeout: 120000 }, () => checkDesign(name, d));
});

test('the HCLK\'s dividers: Apicula\'s set_hclk_attrs\'s codes, its DIV_MODEs refused as it refuses them', async () => {
  const db = await database();
  const codes = (typ, num, parms, device = 'GW1N-9C') => [...hclkAttrs(db, device, parms, num, typ, 'u')].sort((a, b) => a - b);
  // (set_hclk_attrs(db, parms, num, typ, 'u') run in Apicula 0.32 with device GW1N-9C)
  assert.deepEqual(codes('CLKDIV2', '_HCLK0_SECT0', {}), [2]);
  assert.deepEqual(codes('CLKDIV2', '_HCLK1_SECT1', {}), [7]);
  assert.deepEqual(codes('CLKDIV', '_HCLK1_SECT1', { DIV_MODE: '8' }), [24, 31]);
  assert.deepEqual(codes('CLKDIV', '_HCLK0_SECT0', { DIV_MODE: '101' }), [17]);
  assert.deepEqual(codes('CLKDIV', '_HCLK0_SECT1', { DIV_MODE: '3.5' }), [15, 30]);
  assert.throws(() => codes('CLKDIV', '_HCLK0_SECT0', { DIV_MODE: '6' }), /^Error: gowin_pack: Invalid DIV_MODE 6 for CLKDIV u on device GW1N-9C$/);
  assert.throws(() => codes('CLKDIV', '_HCLK0_SECT0', { DIV_MODE: '110' }), /^Error: gowin_pack: Invalid DIV_MODE 6 for CLKDIV u on device GW1N-9C$/);
  assert.throws(() => codes('CLKDIV', '_HCLK0_SECT0', { DIV_MODE: '8' }, 'GW1N-1'), /^Error: gowin_pack: Invalid DIV_MODE 8 for CLKDIV u on device GW1N-1$/);
  assert.throws(() => codes('CLKDIV', 'HCLK0', {}), /^Error: gowin_pack: Unknown HCLK Bel\/HCLK Section: CLKDIVHCLK0$/);
});

test('the I/O logic\'s attributes: a value the table has no code for refused, its unknown attributes left out', async () => {
  const db = await database();
  assert.ok(iologicAttrs(db, { OUTMODE: 'ODDRX1', SOMETHING: 'ELSE' }, { IOLOGIC_TYPE: 'ODDR', IOLOGIC_FCLK: 'UNKNOWN' }).size > 0);
  assert.throws(() => iologicAttrs(db, { OUTMODE: 'ODDRX3' }, { IOLOGIC_TYPE: 'ODDR', IOLOGIC_FCLK: 'UNKNOWN' }), /^Error: gowin_pack: no code for the I\/O logic's OUTMODE=ODDRX3$/);
});

test('the primitives the GW1N-9C has not, refused by name', async () => {
  const db = await database();
  const { files } = await build('oddr', IOLOGIC.oddr);
  for (const type of ['PLLVR', 'PLLA', 'DLLDLY', 'BANDGAP', 'EMCU', 'BUFS', 'BUFG', 'ADC']) {
    const routed = JSON.parse(files['open/routed.json']);
    routed.modules.top.cells.u.type = type;
    assert.throws(() => gowinPack(routed, db), new RegExp(`^Error: gowin_pack: the primitive ${type} \\(u\\) is not supported yet$`));
  }
});
