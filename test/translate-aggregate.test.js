// #5853: VHDL's aggregates with named choices translated to Verilog (core/translate-to-verilog.js): a one-element one,
// unsigned'(0 => ci), the 1-bit vector a schematic's ADD / SUB makes of its carry in, and named choices of any single
// bits (signals too, not only literals), with others or ranges, where the target's width or the choices' own give every
// bit; signed'(0 => x) a signed bit; what cannot be expressed refused with its reason. Then a schematic's ADD and SUB
// with their carry / borrow in, their VHDL translated to Verilog and back to VHDL, each simulated against the integers'
// sums and differences with no warning; a signed 1-bit comparator too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translateSource } from '../core/translate.js';
import { normalizeDoc, symbolPins } from '../core/schdoc.js';
import { generateHdl } from '../core/schdoc-hdl.js';
import { compile, elaborate, simulate } from '../core/compile.js';

const HEAD = 'library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\n';
// an architecture's statements in an entity of a few ports, translated: its assigns, or its errors
function v(body) {
  const text = `${HEAD}entity e is\n  port (a, b : in unsigned(3 downto 0); ci, x : in std_logic; s : out unsigned(4 downto 0); y : out std_logic_vector(3 downto 0));\nend e;\narchitecture r of e is\nbegin\n${body}\nend r;\n`;
  const r = translateSource(text, { path: 'src/e.vhd', to: 'verilog', sources: [] });
  return r.ok ? r.text.split('\n').filter(l => /^\s*assign /.test(l)).map(l => l.trim()) : r.errors;
}

test('#5853 translate: a one-element aggregate with a named choice, a std_logic made a 1-bit vector', () => {
  assert.deepEqual(v("  s <= resize(a, 5) + resize(b, 5) + unsigned'(0 => ci);"), ['assign s = {1\'b0, a} + {1\'b0, b} + ci;']);
  assert.deepEqual(v("  s <= resize(a, 5) - resize(b, 5) - unsigned'(0 => ci);"), ['assign s = {1\'b0, a} - {1\'b0, b} - ci;']);
  assert.deepEqual(v("  y <= std_logic_vector(resize(unsigned'(0 => x), 4));"), ['assign y = {{3{1\'b0}}, x};']);
  // signed: its one bit the sign (-1 or 0)
  assert.deepEqual(v("  y(0) <= '1' when signed'(0 => x) < signed'(0 => ci) else '0';\n  y(3 downto 1) <= \"000\";"),
    ['assign y[0] = $signed(x) < $signed(ci) ? 1\'b1 : 1\'b0;', 'assign y[3:1] = 3\'b000;']);
});

test('#5853 translate: named choices of single bits with others and ranges, a concatenation of the target\'s width', () => {
  assert.deepEqual(v("  y <= (0 => x, others => '0');"), ['assign y = {3\'b000, x};']);
  assert.deepEqual(v("  y <= (3 => x, others => ci);"), ['assign y = {x, ci, ci, ci};']);
  assert.deepEqual(v("  y <= (3 => '1', 1 => x, others => '0');"), ['assign y = {2\'b10, x, 1\'b0};']);
  assert.deepEqual(v("  y <= (3 => '1', 2 downto 0 => x);"), ['assign y = {1\'b1, x, x, x};']);
  assert.deepEqual(v("  y <= (3 | 0 => x, 2 downto 1 => not ci);"), ['assign y = {x, ~ci, ~ci, x};']);
  // literals only: one literal, as before
  assert.deepEqual(v("  y <= (1 => '1', others => '0');"), ['assign y = 4\'b0010;']);
  assert.deepEqual(v("  y <= (others => '0');"), ['assign y = 4\'d0;']);
  // no target's width: the choices' own range
  assert.deepEqual(v("  s <= resize(unsigned'(1 => x, 0 => ci), 5);"), ['assign s = {{3{1\'b0}}, {x, ci}};']);
});

test('#5853 translate: what a concatenation cannot express, refused with its reason', () => {
  const no9 = m => [{ line: 9, message: `${m} cannot be translated to Verilog` }];
  assert.deepEqual(v("  y <= (0 => a, others => '0');"), no9('an aggregate with named choices of values that are not single bits'));
  assert.deepEqual(v("  y <= (1 => x, 0 => '1');"), no9('an aggregate that does not give every bit'));
  assert.deepEqual(v("  y <= (4 => x, others => '0');"), no9('an aggregate with a choice out of its range'));
  assert.deepEqual(v("  s <= resize(unsigned'(0 => x, others => ci), 5);"), no9('an aggregate with named choices'));
  assert.deepEqual(v("  y <= (to_integer(a) => x, others => '0');"), no9('an aggregate with named choices that are not constant'));
});

// a sheet of one symbol, each pin wired to a port of its name, in VHDL
function sheet(type, params) {
  const sym = { id: 'S1', type, name: 'U1', x: 400, y: 400, params };
  const pins = symbolPins(normalizeDoc({ symbols: [sym] }).symbols[0]);
  const ports = pins.map((p, i) => ({ id: `P${i}`, name: p.name, dir: p.dir, width: p.width || 1, x: p.x, y: p.y }));
  return generateHdl(normalizeDoc({ name: 'sheet', lang: 'vhdl', symbols: [sym], ports, wires: [], labels: [] }), {});
}
// the sheet's VHDL, its Verilog translation and that back in VHDL: each translated with no error
function three(g) {
  const vl = translateSource(g.code, { path: 'src/sheet.vhd', to: 'verilog', sources: [] });
  assert.deepEqual(vl.errors, []);
  const vh = translateSource(vl.text, { path: 'src/sheet.v', to: 'vhdl', sources: [] });
  assert.deepEqual(vh.errors, []);
  return [['vhdl', { path: 'src/sheet.vhd', text: g.code }], ['verilog', { path: 'src/sheet.v', text: vl.text }], ['vhdl again', { path: 'src/sheet.vhd', text: vh.text }]];
}
// a test bench with each of the sources: no error or warning, its report
function run(src, tb) {
  const sources = [src, { path: 'tb.vhd', text: tb }];
  const lib = compile(sources);
  const des = elaborate(lib, 'tb');
  assert.deepEqual([...lib.errors, ...des.diags].map(d => `${d.severity}: ${d.message}`), []);
  return simulate(sources, 'tb', { until: 1e9 }).sim.log.map(l => l.text);
}

test('#5853 schematic: ADD with CI and SUB with BI, their VHDL translated to Verilog and back, each the integers\' results', () => {
  for (const [type, params] of [['add', { width: 4, cin: true, cout: true }], ['sub', { width: 4, bin: true, bout: true }],
    ['add', { width: 1, cin: true, cout: true }], ['sub', { width: 3, bits: true, bin: true, bout: true }]]) {
    const w = params.width, sub = type === 'sub', [ci, o, co] = sub ? ['BI', 'D', 'BO'] : ['CI', 'S', 'CO'];
    const what = `${type} ${JSON.stringify(params)}`;
    const g = sheet(type, params);
    assert.deepEqual(g.diagnostics, [], what);
    // (the carry a 1-bit vector: the aggregate the translation refused, #5853)
    assert.match(g.code, new RegExp(`${sub ? '-' : '\\+'} unsigned'\\(0 => ${ci}\\);`), what);
    // every operand, the carry / borrow 0 and 1: the result and its carry / borrow out against the integers'
    const map = params.bits ? [...Array(w).keys()].flatMap(i => [`A${i} => a(${i})`, `B${i} => b(${i})`, `${o}${i} => r(${i})`]) : [`A => a${w === 1 ? '(0)' : ''}`, `B => b${w === 1 ? '(0)' : ''}`, `${o} => r${w === 1 ? '(0)' : ''}`];
    const tb = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tb is end;
architecture s of tb is
  signal a, b, r : std_logic_vector(${w - 1} downto 0);
  signal c, k : std_logic;
begin
  u : entity work.sheet port map (${[...map, `${ci} => c`, `${co} => k`].join(', ')});
  process
    variable e, bad, n : integer := 0;
  begin
    for i in 0 to ${2 ** w - 1} loop for j in 0 to ${2 ** w - 1} loop for x in 0 to 1 loop
      a <= std_logic_vector(to_unsigned(i, ${w})); b <= std_logic_vector(to_unsigned(j, ${w}));
      c <= '0'; if x = 1 then c <= '1'; end if;
      wait for 1 ns;
      e := (i ${sub ? '-' : '+'} j ${sub ? '-' : '+'} x + ${2 ** (w + 1)}) mod ${2 ** (w + 1)};
      n := n + 1;
      if to_integer(unsigned(r)) /= e mod ${2 ** w} or (k = '1') /= (e >= ${2 ** w}) then bad := bad + 1; end if;
    end loop; end loop; end loop;
    report "checked " & integer'image(n) & ", wrong " & integer'image(bad);
    wait;
  end process;
end;`;
    for (const [lang, src] of three(g)) assert.deepEqual(run(src, tb), [`checked ${4 ** w * 2}, wrong 0`], `${what} ${lang}`);
  }
});

test('#5853 schematic: a signed 1-bit comparator (signed\'(0 => A)), translated and back, -1 < 0', () => {
  const g = sheet('compare', { width: 1, signed: true, op: 'lt' });
  assert.deepEqual(g.diagnostics, []);
  assert.match(g.code, /signed'\(0 => A\) < signed'\(0 => B\)/);
  const tb = `library ieee; use ieee.std_logic_1164.all;
entity tb is end;
architecture s of tb is
  signal a, b, o : std_logic;
  type bits is array (0 to 3) of std_logic;
  constant A_V : bits := ('0', '0', '1', '1');
  constant B_V : bits := ('0', '1', '0', '1');
  constant O_V : bits := ('0', '0', '1', '0');   -- (signed: '1' is -1)
begin
  u : entity work.sheet port map (A => a, B => b, O => o);
  process
    variable bad : integer := 0;
  begin
    for i in 0 to 3 loop
      a <= A_V(i); b <= B_V(i);
      wait for 1 ns;
      if o /= O_V(i) then bad := bad + 1; end if;
    end loop;
    report "wrong " & integer'image(bad);
    wait;
  end process;
end;`;
  for (const [lang, src] of three(g)) assert.deepEqual(run(src, tb), ['wrong 0'], lang);
});
