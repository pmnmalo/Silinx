// packages/silinx-fpga/src/fpga/xc7/pins.js and check.js (#3145): a 7-series .bit checked with no Vivado: the package's
// pins as the bit database keeps them (Project X-Ray's package_pins.csv), the XDC's pins named as nextpnr names the ports,
// the IOBs a .bit's features configure, the two compared (a pin of no IOB, a missing buffer, one too many, another
// standard, an IOB no port has); and check.js on Project X-Ray's .bit of blinky (test/fixtures/xc7): its frames
// fasm2frames', its round trip clean, its pins the Basys 3's; a bit flipped, another part's ID code found.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { packagePins, xdcPins, ioConfig, checkPins } from '../src/fpga/xc7/pins.js';
import { checkBitXc7 } from '../src/fpga/xc7/check.js';
import { bitIndexXc7 } from '../src/fpga/xc7/readback.js';
import { loadBitDbXc7, XC7_DB_DIR } from '../src/fpga/xc7/bitdb-node.js';
import { readXdc } from '../src/xdc.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'xc7');
const gz = f => zlib.gunzipSync(fs.readFileSync(path.join(FIX, f)));
const rawOf = part => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(XC7_DB_DIR, `${part}.json.gz`))).toString('utf8'));
const raw = rawOf('xc7a35tcpg236-1'), index = bitIndexXc7(raw);

test('packagePins: an IOB pin\'s tile and site (IOB_Y0 / IOB_Y1 by its Y), the other pins left out; the bit database\'s', () => {
  const csv = ['pin,bank,site,tile,pin_function', 'A2,216,OPAD_X0Y2,GTP_CHANNEL_1_X97Y121,MGTPTXN1_216', 'W5,34,IOB_X1Y26,RIOB33_X43Y25,IO_L12P_T1_MRCC_34',
    'U16,14,IOB_X0Y3,LIOB33_X0Y3,IO_L23N_T3_A02_D18_14', 'T5,34,,,VCCO_34', ''].join('\n');
  assert.deepEqual(packagePins(csv), { W5: ['RIOB33_X43Y25', 'IOB_Y0'], U16: ['LIOB33_X0Y3', 'IOB_Y1'] });
  assert.throws(() => packagePins('pin,bank,tile\nW5,34,X'), /^Error: package_pins\.csv: no column site$/);
  // the database's: the Basys 3's 106 IOB pins (its bonded IOBs), the Nexys A7's 210; each a tile with that site
  const big = rawOf('xc7a100tcsg324-1');
  assert.deepEqual([Object.keys(raw.pins).length, Object.keys(big.pins).length], [106, 210]);
  for (const r of [raw, big]) for (const [pin, [tile, site]] of Object.entries(r.pins)) assert.ok(r.iobSites[tile]?.includes(site), `${pin}: ${tile}.${site}`);
  assert.deepEqual(loadBitDbXc7('xc7a35tcpg236-1').pins.W5, ['RIOB33_X43Y25', 'IOB_Y0']);
});

const NETLIST = JSON.stringify({ modules: { top: { attributes: { top: '00000000000000000000000000000001' }, ports: {
  clk: { direction: 'input', bits: [2] }, btn: { direction: 'input', bits: [3] }, led: { direction: 'output', bits: [4, 5] },
  io: { direction: 'inout', bits: [6] }, free: { direction: 'output', bits: [7] } } } } });

test('xdcPins: the netlist\'s ports with a pin, named as nextpnr names them (a one-bit vector\'s btn[0] as btn), their direction, LVCMOS33 when the XDC gives no standard', () => {
  const model = readXdc(['set_property -dict { PACKAGE_PIN W5 IOSTANDARD LVCMOS33 } [get_ports {clk}]', 'set_property -dict { PACKAGE_PIN U18 IOSTANDARD LVCMOS25 } [get_ports {btn[0]}]',
    'set_property -dict { PACKAGE_PIN U16 IOSTANDARD LVCMOS33 } [get_ports {led[0]}]', 'set_property PACKAGE_PIN E19 [get_ports {led[1]}]',
    'set_property -dict { PACKAGE_PIN J1 IOSTANDARD LVCMOS33 } [get_ports {io}]', 'set_property -dict { PACKAGE_PIN L2 IOSTANDARD LVCMOS33 } [get_ports {gone}]'].join('\n'));
  assert.deepEqual(xdcPins(model, NETLIST, 'top'), [
    { port: 'clk', loc: 'W5', iostandard: 'LVCMOS33', dir: 'input' }, { port: 'btn', loc: 'U18', iostandard: 'LVCMOS25', dir: 'input' },
    { port: 'led[0]', loc: 'U16', iostandard: 'LVCMOS33', dir: 'output' }, { port: 'led[1]', loc: 'E19', iostandard: 'LVCMOS33', dir: 'output' },
    { port: 'io', loc: 'J1', iostandard: 'LVCMOS33', dir: 'inout' }]);
  assert.deepEqual(xdcPins(null, NETLIST, 'top'), []);
});

const f = (tile, key, zero = false) => ({ tile, key, zero });

test('ioConfig: each IOB\'s input buffer\'s and output driver\'s standards; zero encodings, IN_ONLY, SLEW, PULLTYPE, STEPDOWN and other tiles not read', () => {
  const io = ioConfig([f('RIOB33_X43Y25', 'IOB_Y0.LVCMOS25_LVCMOS33_LVTTL.IN'), f('RIOB33_X43Y25', 'IOB_Y0.LVCMOS12_LVCMOS15_LVCMOS18_LVCMOS25_LVCMOS33_LVDS_25_LVTTL_SSTL135_SSTL15_TMDS_33.IN_ONLY'),
    f('RIOB33_X43Y25', 'IOB_Y1.LVCMOS33_LVTTL.DRIVE.I12_I8'), f('RIOB33_X43Y25', 'IOB_Y1.LVCMOS12_LVCMOS15_LVCMOS18_LVCMOS25_LVCMOS33_LVTTL_SSTL135_SSTL15.SLEW.SLOW'),
    f('LIOB33_X0Y3', 'IOB_Y1.LVDS_25_TMDS_33.IN'), f('LIOB33_X0Y3', 'IOB_Y1.LVCMOS33_LVTTL.DRIVE.I12_I8'), f('LIOB33_X0Y5', 'IOB_Y0.LVCMOS33_LVTTL.DRIVE.I12_I8', true),
    f('LIOB33_X0Y7', 'IOB_Y0.PULLTYPE.NONE'), f('LIOB33_X0Y7', 'IOB_Y1.LVCMOS12_LVCMOS15_LVCMOS18.STEPDOWN'), f('CLBLL_L_X2Y37', 'SLICEL_X0.ALUT.INIT[5]')]);
  assert.deepEqual([...io.keys()], ['RIOB33_X43Y25.IOB_Y0', 'RIOB33_X43Y25.IOB_Y1', 'LIOB33_X0Y3.IOB_Y1']);
  assert.deepEqual(io.get('RIOB33_X43Y25.IOB_Y0'), { in: new Set(['LVCMOS25', 'LVCMOS33', 'LVTTL']), out: null });
  assert.deepEqual(io.get('RIOB33_X43Y25.IOB_Y1'), { in: null, out: new Set(['LVCMOS33', 'LVTTL']) });
  assert.deepEqual(io.get('LIOB33_X0Y3.IOB_Y1'), { in: new Set(['LVDS_25', 'TMDS_33']), out: new Set(['LVCMOS33', 'LVTTL']) });
});

test('checkPins: the XDC\'s pins against the IOBs configured: each one\'s buffers and standard, and no other IOB', () => {
  const pins = { W5: ['RIOB33_X43Y25', 'IOB_Y0'], V5: ['RIOB33_X43Y25', 'IOB_Y1'], U16: ['LIOB33_X0Y3', 'IOB_Y1'], U15: ['LIOB33_X0Y3', 'IOB_Y0'] };
  const set = (...s) => new Set(s);
  const io = new Map([['RIOB33_X43Y25.IOB_Y0', { in: set('LVCMOS25', 'LVCMOS33', 'LVTTL'), out: null }], ['RIOB33_X43Y25.IOB_Y1', { in: null, out: set('LVCMOS33', 'LVTTL') }],
    ['LIOB33_X0Y3.IOB_Y1', { in: set('LVCMOS25', 'LVCMOS33', 'LVTTL'), out: set('LVCMOS33', 'LVTTL') }]]);
  const p = (port, loc, dir, iostandard = 'LVCMOS33') => ({ port, loc, iostandard, dir });
  const good = [p('clk', 'W5', 'input'), p('led', 'V5', 'output'), p('io', 'U16', 'inout')];
  assert.deepEqual(checkPins(pins, good, io), { ok: true, checked: 3, errors: [] });
  assert.deepEqual(checkPins(pins, [p('clk', 'W5', 'input', 'LVCMOS18'), p('led', 'V5', 'input'), p('io', 'U16', 'output'), p('x', 'ZZ9', 'input')], io).errors, [
    'clk (W5, RIOB33_X43Y25.IOB_Y0): LVCMOS18 in the XDC, the .bit\'s input buffer LVCMOS25 / LVCMOS33 / LVTTL',
    'led (V5, RIOB33_X43Y25.IOB_Y1): an input with no input buffer in the .bit',
    'led (V5, RIOB33_X43Y25.IOB_Y1): an input with an output driver in the .bit',
    'io (U16, LIOB33_X0Y3.IOB_Y1): an output with an input buffer in the .bit',
    'x: the pin ZZ9 is not one of the package\'s IOBs']);
  // a port's IOB not configured; an IOB configured that no port has (its pin named when the package has one)
  assert.deepEqual(checkPins(pins, [...good, p('sw', 'U15', 'input')], io).errors, ['sw (U15, LIOB33_X0Y3.IOB_Y0): an input with no input buffer in the .bit']);
  assert.deepEqual(checkPins(pins, good.slice(1), new Map([...io, ['LIOB33_X0Y9.IOB_Y0', { in: set('LVCMOS33'), out: null }]])).errors, [
    'LIOB33_X0Y9.IOB_Y0: an IOB the .bit configures, no port\'s in the XDC', 'RIOB33_X43Y25.IOB_Y0 (W5): an IOB the .bit configures, no port\'s in the XDC']);
});

test('checkBitXc7: Project X-Ray\'s .bit of blinky: frames fasm2frames\', the round trip clean, its pins the Basys 3\'s; a bit flipped, the wrong pins found', () => {
  const fasm = gz('blinky.fasm.gz').toString('utf8'), bit = new Uint8Array(gz('blinky.bitstream.gz'));
  // the pins: the IOBs nextpnr placed (its FASM's IN and DRIVE features), named by the package's pins
  const byIob = Object.fromEntries(Object.entries(raw.pins).map(([pin, [t, s]]) => [`${t}.${s}`, pin]));
  const placed = new Map();
  for (const l of fasm.split('\n')) {
    const m = /^(\w*IOB33\w*)\.(IOB_Y[01])\.\w+\.(IN|DRIVE)\b/.exec(l);
    if (m) placed.set(`${m[1]}.${m[2]}`, [...(placed.get(`${m[1]}.${m[2]}`) || []), m[3]]);
  }
  const pins = [...placed].map(([k, s], i) => ({ port: `p${i}`, loc: byIob[k], iostandard: 'LVCMOS33', dir: s.includes('IN') ? (s.includes('DRIVE') ? 'inout' : 'input') : 'output' }));
  assert.equal(pins.length, 27);
  assert.ok(pins.every(p => p.loc), JSON.stringify(pins));
  const r = checkBitXc7(index, { fasm, bit, pins });
  assert.deepEqual([r.ok, r.errors, r.idcode, r.frames, r.pins.checked], [true, [], raw.idcode, { read: 5408, reference: 4974, differ: 0 }, 27]);
  assert.deepEqual([r.roundTrip.lost, r.roundTrip.stray, r.roundTrip.extra, r.roundTrip.counts.features], [[], [], [], 9816]);
  assert.equal(Object.hasOwn(r.roundTrip, 'features'), false);
  assert.equal(checkBitXc7(index, { fasm, bit }).pins, null);
  // the wrong pins: an input as an output, a standard the IOB has not
  const wrong = pins.map((p, i) => (i === 0 ? { ...p, dir: p.dir === 'input' ? 'output' : 'input' } : i === 1 ? { ...p, iostandard: 'SSTL15' } : p));
  const w = checkBitXc7(index, { fasm, bit, pins: wrong });
  assert.equal(w.ok, false);
  assert.equal(w.errors.length, 3, w.errors.join('\n'));
  assert.ok(w.errors.every(e => /^pins: p[01] \(/.test(e)), w.errors.join('\n'));
  // a bit of a configured frame flipped: one frame not fasm2frames', a bit lost or stray in the round trip
  const ref = checkBitXc7(index, { fasm: '', bit });
  assert.equal(ref.ok, false);
  assert.match(ref.errors[0], /^\d+ frames not the ones fasm2frames makes of the FASM$/);
  assert.match(ref.errors[1], /^round trip: \d+ stray \(/);
  // another part's database: its ID code, not the .bit's
  const big = bitIndexXc7(rawOf('xc7a100tcsg324-1'));
  assert.equal(checkBitXc7(big, { fasm: '', bit }).errors[0], 'the .bit\'s ID code 0x362d093, the part\'s 0x3631093');
});
