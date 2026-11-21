// Unit tests (#4768, #5076): core/hdl-emit.js, the HDL generators' shared primitives: a width's VHDL type and Verilog range,
// against the texts the generators wrote before (each its own copy), on every width the generators use and the edges;
// its port lists and headers (#5076), with their options and edges (no port, vectors, VHDL and Verilog).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vhdlEntity, vhdlPort, vhdlPortLines, vhdlType, vhdlWidthPorts, vlogModule, vlogPort, vlogPortLines, vlogRange, vlogWidthPorts } from '../core/hdl-emit.js';

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

// ------------------------------------------------------------------ port lists and headers (#5076)
const P = [{ name: 'clk', dir: 'in', type: 'std_logic' }, { name: 'data', dir: 'in', type: vhdlType(8) }, { name: 'q', dir: 'out', type: vhdlType(8), init: "(others => '0')" }];

test('vhdlPort: name, mode, type and its initial value; the columns padded', () => {
  assert.equal(vhdlPort(P[0]), 'clk : in std_logic');
  assert.equal(vhdlPort(P[2]), "q : out std_logic_vector(7 downto 0) := (others => '0')");
  assert.equal(vhdlPort(P[0], { nameWidth: 5, dirWidth: 3 }), 'clk   : in  std_logic');
  assert.equal(vhdlPort({ name: 'b', dir: 'inout', type: 'std_logic' }, { dirWidth: 3 }), 'b : inout std_logic');   // (a longer mode not cut)
});

test('vhdlPortLines: a semicolon after each but the last, aligned or not; none for no port', () => {
  assert.deepEqual(vhdlPortLines(P.slice(0, 2)), ['    clk : in std_logic;', '    data : in std_logic_vector(7 downto 0)']);
  assert.deepEqual(vhdlPortLines(P.slice(0, 2), { indent: '        ', align: true, dirWidth: 3 }),
    ['        clk  : in  std_logic;', '        data : in  std_logic_vector(7 downto 0)']);
  assert.deepEqual(vhdlPortLines([P[0]]), ['    clk : in std_logic']);
  assert.deepEqual(vhdlPortLines([]), []);
});

test('vhdlEntity: the header, its generics and ports, its three ends', () => {
  assert.deepEqual(vhdlEntity('top', { ports: P.slice(0, 2), end: 'name' }),
    ['entity top is', '  port (', '    clk : in std_logic;', '    data : in std_logic_vector(7 downto 0)', '  );', 'end top;']);
  assert.deepEqual(vhdlEntity('top', { ports: [P[0]], indent: '    ', generics: [{ name: 'N', value: 8 }, { name: 'WIDE', value: 0 }], alignGenerics: true }),
    ['entity top is', '    generic (', '        N    : integer := 8;', '        WIDE : integer := 0', '    );', '    port (', '        clk : in std_logic', '    );', 'end entity top;']);
  // a generic with no value, or of a type; a one-line clause as written
  assert.deepEqual(vhdlEntity('t', { generics: [{ name: 'S', type: 'string' }] }), ['entity t is', '  generic (', '    S : string', '  );', 'end entity t;']);
  assert.deepEqual(vhdlEntity('t', { genericClause: ['  generic (A : boolean := true);'], ports: [P[0]], end: 'bare' }),
    ['entity t is', '  generic (A : boolean := true);', '  port (', '    clk : in std_logic', '  );', 'end entity;']);
  // no ports: no port clause; ports given empty: its clause, as the generators wrote it
  assert.deepEqual(vhdlEntity('t'), ['entity t is', 'end entity t;']);
  assert.deepEqual(vhdlEntity('t', { ports: [] }), ['entity t is', '  port (', '  );', 'end entity t;']);
});

const V = [{ name: 'clk', dir: 'in', kind: 'wire' }, { name: 'd', dir: 'in', kind: 'wire', width: 8 }, { name: 'q', dir: 'out', kind: 'reg ', width: 16 }];

test('vlogPort: direction, kind, range and name; its columns', () => {
  assert.equal(vlogPort(V[0]), 'input wire clk');
  assert.equal(vlogPort(V[1]), 'input wire [7:0] d');
  assert.equal(vlogPort({ name: 'x', dir: 'out', width: 1 }), 'output x');                         // (no kind, no range)
  assert.equal(vlogPort({ name: 'b', dir: 'inout', width: 4 }), 'inout [3:0] b');
  assert.equal(vlogPort({ name: 'x', dir: 'output', kind: 'wire signed', range: '[N-1:0] ' }), 'output wire signed [N-1:0] x');
  assert.equal(vlogPort(V[0], { dirWidth: 6, rangeWidth: 7 }), 'input  wire        clk');
  assert.equal(vlogPort({ name: 'x', dir: 'in', width: 2 }, { kind: 'wire' }), 'input wire [1:0] x');   // (the default kind)
});

test('vlogPortLines: a comma after each but the last; the names in a column when aligned', () => {
  assert.deepEqual(vlogPortLines(V, { indent: '    ', align: true, dirWidth: 6 }),
    ['    input  wire        clk,', '    input  wire [7:0]  d,', '    output reg  [15:0] q']);
  assert.deepEqual(vlogPortLines([V[0]]), ['  input wire clk']);
  assert.deepEqual(vlogPortLines([]), []);
});

test('vlogModule: the header, its parameters, inline', () => {
  assert.deepEqual(vlogModule('top', { ports: V.slice(0, 2) }), ['module top (', '  input wire clk,', '  input wire [7:0] d', ');']);
  assert.deepEqual(vlogModule('top', { params: [{ name: 'N', value: 8 }, { name: 'WIDE', value: 0 }], alignParams: true, paramIndent: '    ', ports: [V[0]] }),
    ['module top #(', '    parameter N    = 8,', '    parameter WIDE = 0', ') (', '  input wire clk', ');']);
  assert.deepEqual(vlogModule('t', { params: [{ name: 'N', type: 'integer', value: 4 }], ports: [] }), ['module t #(', '  parameter integer N = 4', ') (', ');']);
  assert.deepEqual(vlogModule('t', { ports: [] }), ['module t (', ');']);
  assert.deepEqual(vlogModule('t', { inline: true, ports: V.slice(0, 2) }), ['module t (input wire clk, input wire [7:0] d);']);
  assert.deepEqual(vlogModule('t', { inline: true, ports: [{ name: 'a', dir: 'in' }], paramClause: '#(parameter E = 1) ' }), ['module t #(parameter E = 1) (input a);']);
  assert.deepEqual(vlogModule('t', { inline: true }), ['module t;']);
});

test('vhdlWidthPorts, vlogWidthPorts: the C generators\' ports of a width', () => {
  const ps = [{ name: 'ap_clk', dir: 'in', w: 1 }, { name: 'ap_return', dir: 'out', w: 32 }];
  assert.deepEqual(vhdlEntity('f', { ports: vhdlWidthPorts(ps), end: 'name' }),
    ['entity f is', '  port (', '    ap_clk : in std_logic;', '    ap_return : out std_logic_vector(31 downto 0)', '  );', 'end f;']);
  assert.deepEqual(vlogPortLines(vlogWidthPorts(ps), { dirWidth: 6, kind: 'wire' }), ['  input  wire ap_clk,', '  output wire [31:0] ap_return']);
});
