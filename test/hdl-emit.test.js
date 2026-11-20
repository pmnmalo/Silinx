// Unit tests (#4768): core/hdl-emit.js, the HDL generators' shared primitives: a width's VHDL type and Verilog range,
// against the texts the generators wrote before (each its own copy), on every width the generators use and the edges.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vhdlType, vlogRange } from '../core/hdl-emit.js';

test('vhdlType: std_logic for one bit, else std_logic_vector(w-1 downto 0)', () => {
  assert.equal(vhdlType(1), 'std_logic');
  assert.equal(vhdlType(2), 'std_logic_vector(1 downto 0)');
  assert.equal(vhdlType(32), 'std_logic_vector(31 downto 0)');
  // (the copies it replaces: the same text on every width)
  const before = (w) => (w === 1 ? 'std_logic' : `std_logic_vector(${w - 1} downto 0)`);
  for (let w = 0; w <= 130; w++) assert.equal(vhdlType(w), before(w), String(w));
});

test('vlogRange: no range for one bit, else [w-1:0] and its space', () => {
  assert.equal(vlogRange(1), '');
  assert.equal(vlogRange(0), '');
  assert.equal(vlogRange(8), '[7:0] ');
  assert.equal(`  wire ${vlogRange(1)}x;`, '  wire x;');
  assert.equal(`  wire ${vlogRange(16)}x;`, '  wire [15:0] x;');
  const before = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
  for (let w = -1; w <= 130; w++) assert.equal(vlogRange(w), before(w), String(w));
});
