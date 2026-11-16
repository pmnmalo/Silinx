// core/auto-pins.js: the top-level port bits with no pin location, by the names XST gives them (the ISE flow assigns
// them free pins, server/ise.js), and portWidth, the bits XST makes of a port's type.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unconstrainedPorts, portWidth } from '../core/auto-pins.js';
import { compile, elaborate } from '../core/compile.js';

// ITC'99's b04 and b14 ports (integers with a range, a plain integer, bits)
const VHD = `entity t is port(clock, reset: in bit;
  data_in: in integer range 127 downto -128; x_in: in integer range 63 downto 0; canale: out integer range 8 downto 0;
  punti: out integer range 255 downto 0; addr: out integer range 2**20 - 1 downto 0; n: in natural range 0 to 9;
  zero: in integer range 0 to 0; datai: in integer; be_n: out bit_vector(3 downto 0); v: in bit_vector(2 to 3));
end;
architecture x of t is begin end;`;
const SRC = [{ path: 't.vhd', lang: 'vhdl', text: VHD }];
// { port: [its bits' indexes] } of the unconstrained bits
const byPort = list => {
  const out = {};
  for (const u of list) { const m = /^(\w+?)(?:<(\d+)>)?$/.exec(u.net); (out[m[1]] ||= []).push(m[2] === undefined ? null : +m[2]); }
  return out;
};
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);

test('portWidth: an integer with a range its range\'s bits (signed when it goes below 0), a plain integer 32, others their width', () => {
  const ports = Object.fromEntries(elaborate(compile(SRC), 't').top.ports.map(p => [p.name, portWidth(p.sig.t)]));
  assert.deepEqual(ports, { clock: 1, reset: 1, data_in: 8, x_in: 6, canale: 4, punti: 8, addr: 20, n: 4, zero: 1, datai: 32, be_n: 4, v: 2 });
  assert.equal(portWidth({ kind: 'int', w: 32, rlo: -129, rhi: 0 }), 9);
  assert.equal(portWidth({ kind: 'int', w: 32, rlo: 0, rhi: 2 ** 31 - 1 }), 31);
  assert.equal(portWidth(undefined), 1);
});

test('unconstrainedPorts: an integer port with a range has only its range\'s bits, as XST makes it (#3820)', async () => {
  // (before #3820 every integer had 32: the ISE flow gave data_in<8> to data_in<31> a pin, and ngdbuild refused their
  // LOCs, ConstraintSystem:59, the nets not being in XST's netlist)
  const bits = byPort(await unconstrainedPorts(SRC, 't', ''));
  assert.deepEqual(bits, {
    clock: [null], reset: [null], data_in: range(0, 7), x_in: range(0, 5), canale: range(0, 3), punti: range(0, 7),
    addr: range(0, 19), n: range(0, 3), zero: [0], datai: range(0, 31), be_n: range(0, 3), v: [2, 3],
  });
  // the UCF's LOCs by those names (a bit written addr[3] or addr(4) too); a LOC on a bit beyond the range changes nothing
  const ucf = 'NET "clock" LOC = "B8";\nNET "data_in<7>" LOC = "C7";\nNET "data_in<8>" LOC = "D7";\nNET "addr[3]" LOC = "P1";\nNET "addr(4)" LOC = "P2";\n';
  const left = byPort(await unconstrainedPorts(SRC, 't', ucf));
  assert.equal(left.clock, undefined);
  assert.deepEqual(left.data_in, range(0, 6));
  assert.deepEqual(left.addr, [...range(0, 2), ...range(5, 19)]);
});
