// gowin_pack's differential, MIPI and I3C I/O (#4333): Silinx's port (packages/silinx-fpga/src/fpga/gowin/place.js) against
// Apicula 0.32's own gowin_pack, on the designs of test/fixtures/gowin-pack/designs.mjs (DIFF_IO) built by the flow on the Tang
// Nano 9K: the true LVDS (IOR11, pins 62 / 61) and emulated (IOT12, pins 80 / 79) outputs, tristates and inputs, the emulated
// bidirectional buffer, an ODDR on an LVDS pair, MIPI's output and input, I3C's buffer, and the user flash; their .fs byte for
// byte Apicula's. A pair on the wrong pins refused with Apicula's messages.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DIFF_IO } from './fixtures/gowin-pack/designs.mjs';
import { checkDesign, build, database } from './gowin-pack-lib.mjs';
import { gowinPack } from '../packages/silinx-fpga/src/fpga/gowin/pack.js';

describe('the differential, MIPI and I3C I/O from HDL to the .fs: Apicula\'s byte for byte', { concurrency: 2 }, () => {
  for (const [name, d] of Object.entries(DIFF_IO)) test(name, { timeout: 120000 }, () => checkDesign(name, d));
});

test('a differential pair on the wrong pins: refused with Apicula\'s messages', async () => {
  const db = await database();
  const routed = async name => JSON.parse((await build(name, DIFF_IO[name])).files['open/routed.json']);
  const pair = net => Object.values(net.modules.top.cells).filter(c => c.parameters.DIFF);
  const refused = (net, change, message) => { pair(net).forEach(change); assert.throws(() => gowinPack(net, db), message); };
  // (gowin_pack 0.32's ValueErrors on the same routed designs, changed alike)
  refused(await routed('tlvds'), c => { c.parameters.DIFF_TYPE = 'ELVDS_OBUF'; }, /^Error: gowin_pack: Cannot place p_OBUF_O at IOR11A - it is a true lvds pin$/);
  refused(await routed('elvds'), c => { c.parameters.DIFF_TYPE = 'TLVDS_OBUF'; }, /^Error: gowin_pack: Cannot place p_OBUF_O at IOT12A - it is an emulated lvds pin$/);
  refused(await routed('tlvds'), c => { c.attributes.NEXTPNR_BEL = c.attributes.NEXTPNR_BEL.replace(/IOB([AB])$/, (m, x) => (x === 'A' ? 'IOBB' : 'IOBA')); },
    /^Error: gowin_pack: Cannot place p_OBUF_O at IOR11B - not a P pin$/);
  // the ADC's differential input, not ported (Apicula fails on the GW1N-9C with a KeyError)
  refused(await routed('tlvdsi'), c => { c.parameters.DIFF_TYPE = 'TLVDS_IBUF_ADC'; }, /^Error: gowin_pack: the primitive ADC's input \(p_IBUF_I\) is not supported yet$/);
});
