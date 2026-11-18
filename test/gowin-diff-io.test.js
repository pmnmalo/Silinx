// gowin_pack's differential, MIPI and I3C I/O (#4333): Silinx's port (packages/silinx-fpga/src/fpga/gowin/place.js) against
// Apicula 0.32's own gowin_pack, on the designs of test/fixtures/gowin-pack/designs.mjs (DIFF_IO) built by the flow on the Tang
// Nano 9K: the true LVDS (IOR11, pins 62 / 61) and emulated (IOT12, pins 80 / 79) outputs, tristates and inputs, the emulated
// bidirectional buffer, an ODDR on an LVDS pair, MIPI's output and input, I3C's buffer, and the user flash; their .fs byte for
// byte Apicula's. A pair on the wrong pins refused with Apicula's messages. A pair's IO_LOC on its P port with both pins (#4351).
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

// (#4351) Gowin's convention: a differential pair's IO_LOC on its P port names both pins ("p" 62,61), its N port none: the N port
// at the second, the routed design and the .fs the same as with an IO_LOC on each port (an output, an input, a bidirectional pair)
describe('#4351 a differential pair\'s IO_LOC with both pins on its P port: the same .fs as an IO_LOC on each port', { concurrency: 2 }, () => {
  for (const [name, pins] of [['tlvds', '62,61'], ['tlvdsi', '62,61'], ['elvdsio', '80,79']]) {
    test(name, { timeout: 120000 }, () => {
      const d = DIFF_IO[name], [p] = pins.split(',');
      const cst = d.cst.replace(/IO_LOC "p" \d+;\n/, `IO_LOC "p" ${pins};\n`).replace(/IO_LOC "n" \d+;\n/, '');
      assert.match(cst, new RegExp(`IO_LOC "p" ${p},`));
      assert.doesNotMatch(cst, /"n"/);
      return checkDesign(name, { ...d, cst });
    });
  }
});

test('#4351 a two-pin IO_LOC on a port no differential buffer pairs, or with its N port elsewhere: refused, named', async () => {
  const d = DIFF_IO.tlvds;
  // the N port's own IO_LOC at the pair's second pin: as before
  assert.ok((await build('tlvds', { ...d, cst: d.cst.replace('IO_LOC "p" 62;', 'IO_LOC "p" 62,61;') })).r.ok);
  const failed = async cst => { const { r, log } = await build('tlvds', { ...d, cst }); assert.equal(r.ok, false); return [r.error, log.filter(l => /warning|error/i.test(l))]; };
  assert.deepEqual(await failed(d.cst.replace('IO_LOC "p" 62;', 'IO_LOC "p" 62,61;').replace('IO_LOC "n" 61;', 'IO_LOC "n" 60;')), [
    'IO_LOC "p" 62,61: its N port n has IO_LOC 60, not 61',
    ['ERROR:Silinx - IO_LOC "p" 62,61: its N port n has IO_LOC 60, not 61']]);
  // (a one-bit vector's led[0] named as nextpnr names it, led)
  assert.deepEqual(await failed(d.cst.replace('IO_LOC "led[0]" 10;', 'IO_LOC "led[0]" 10,11;')), [
    'IO_LOC "led" 10,11: led is no differential buffer\'s P port, so 11 is no port\'s pin',
    ['ERROR:Silinx - IO_LOC "led" 10,11: led is no differential buffer\'s P port, so 11 is no port\'s pin']]);
  // (its N port, not its P port: no buffer's P port either)
  assert.deepEqual((await failed(d.cst.replace('IO_LOC "p" 62;', '').replace('IO_LOC "n" 61;', 'IO_LOC "n" 61,62;')))[0],
    'IO_LOC "n" 61,62: n is no differential buffer\'s P port, so 62 is no port\'s pin');
});
