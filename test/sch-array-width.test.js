// An instance's Width (#3950): its number of copies, the range of its name (core/sch-array.js withArrayWidth, the
// Properties' Width field and the MCP's set_instance_width): the name ↔ width round trip, its checks; the arrayed symbol
// as drawn (arrayedDef): its sliced pins buses N × w wide, named with their range when they fit, a shared pin (on a net
// of its own width) as it is, an open pin a bus, its title with its copies; a REG1bit made 8 bits wide with its Width,
// its HDL compiled, elaborated and simulated in VHDL and in Verilog with no warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateHdl, netlist, normalizeDoc, symbolDef, symbolPins } from '../core/schdoc.js';
import { arrayWidth, withArrayWidth, arrayedDef } from '../core/sch-array.js';
import { simulate } from '../core/compile.js';

const P = (name, dir = 'in', width = 1) => ({ name, dir, width });
const REG = { name: 'REG1bit', lang: 'vhdl', ports: [P('D'), P('CE'), P('C'), P('Q', 'out')] };
const MODS = { REG1bit: REG };
const OUT = { W: -1, E: 1 };

// a sheet: the instance `name` of REG1bit, each pin in `widths` wired to an I/O marker n_<pin> of that many bits
function sheet(name, widths, lang = 'vhdl') {
  const s = { id: 'U', type: 'module', x: 300, y: 200, rot: 0, mirror: false, name, params: { module: 'REG1bit', generics: {}, ports: REG.ports.map(q => ({ ...q })) } };
  const wires = [], ports = [];
  for (const p of symbolPins(s, MODS)) {
    if (widths[p.name] == null) continue;
    const b = { x: p.x + 60 * OUT[p.side], y: p.y };
    wires.push({ id: `w_${p.name}`, points: [{ x: p.x, y: p.y }, b] });
    ports.push({ id: `m_${p.name}`, name: `n_${p.name}`, dir: p.dir === 'out' ? 'out' : 'in', width: widths[p.name], x: b.x, y: b.y });
  }
  return normalizeDoc({ version: 4, name: 'top', lang, symbols: [s], wires, ports, labels: [] }, { modules: MODS });
}

test('#3950 withArrayWidth / arrayWidth: the name for a width and back; 1 a single instance; the same width the same name', () => {
  assert.deepEqual(withArrayWidth('reg', 8), { name: 'reg(7:0)' });
  assert.deepEqual(withArrayWidth('reg(7:0)', 1), { name: 'reg' });
  assert.deepEqual(withArrayWidth('reg(7:0)', 4), { name: 'reg(3:0)' });
  assert.deepEqual(withArrayWidth('r[1:3]', 2), { name: 'r(1:0)' }, 'its bracket and order made ISE\'s');
  assert.deepEqual(withArrayWidth('r[1:3]', 3), { name: 'r[1:3]' }, 'its width already: as it is');
  assert.deepEqual(withArrayWidth('inst_4', 1), { name: 'inst_4' });
  assert.deepEqual(withArrayWidth('u', 1024), { name: 'u(1023:0)' });
  for (const n of [1, 2, 8, 16, 1024]) assert.equal(arrayWidth(withArrayWidth('reg', n).name), n, `round trip ${n}`);
  for (const name of ['reg', 'reg(3)', 'reg(0:0)', 'reg(7:0)', 'x[2:9]']) assert.equal(withArrayWidth(name, arrayWidth(name)).name, name, `round trip ${name}`);
  assert.deepEqual([arrayWidth('reg'), arrayWidth('reg(0:0)'), arrayWidth('reg(7:0)'), arrayWidth(''), arrayWidth(null)], [1, 1, 8, 1, 1]);
  for (const w of [0, -2, 2.5, 1025, NaN, 'x']) assert.deepEqual(withArrayWidth('reg', w), { error: `Width ${w}: a whole number from 1 to 1024` }, String(w));
  assert.deepEqual(withArrayWidth('reg', ' '), { error: 'Width (empty): a whole number from 1 to 1024' });
});

test('#3950 arrayedDef: D and Q on 8-bit buses drawn 8 wide, named D(7:0), Q(7:0); C and CE on 1-bit nets shared; the title ×8', () => {
  const doc = sheet('reg(7:0)', { D: 8, CE: 1, C: 1, Q: 8 });
  const nl = netlist(doc, { modules: MODS });
  assert.deepEqual(nl.diagnostics.map(d => d.message), []);
  const s = doc.symbols[0], def = symbolDef(s, MODS), d = arrayedDef(s, def, nl);
  assert.deepEqual(d.pins.map(p => [p.name, p.width, p.label ?? null]), [['D', 8, 'D(7:0)'], ['CE', 1, null], ['C', 1, null], ['Q', 8, 'Q(7:0)']]);
  assert.deepEqual([d.title, d.copies], ['REG1bit ×8', 8]);
  assert.deepEqual(d.pins.map(p => [p.x, p.y, p.side]), def.pins.map(p => [p.x, p.y, p.side]), 'its pins where they were');
  assert.deepEqual(def.pins.map(p => p.width), [1, 1, 1, 1], 'the module\'s symbol itself untouched');
  // not connected: drawn as buses; a single instance: its def itself
  const open = sheet('reg(7:0)', { C: 1 }), nlo = netlist(open, { modules: MODS });
  assert.deepEqual(arrayedDef(open.symbols[0], symbolDef(open.symbols[0], MODS), nlo).pins.map(p => [p.name, p.width]), [['D', 8], ['CE', 8], ['C', 1], ['Q', 8]]);
  const one = sheet('reg', { D: 1 }), d1 = symbolDef(one.symbols[0], MODS);
  assert.equal(arrayedDef(one.symbols[0], d1, netlist(one, { modules: MODS })), d1);
  // (no netlist: every pin a bus)
  assert.deepEqual(arrayedDef(s, def, null).pins.map(p => p.width), [8, 8, 8, 8]);
});

test('#3950 arrayedDef: a 2-bit pin on 4 copies is 8 wide, its range (7:0); names too long for the body drawn without it', () => {
  const R2 = { name: 'r2', lang: 'vhdl', ports: [P('d', 'in', 2), P('q', 'out', 2)] };
  const s = { id: 'U', type: 'module', x: 0, y: 0, rot: 0, mirror: false, name: 'r(3:0)', params: { module: 'r2', generics: {}, ports: R2.ports } };
  const d = arrayedDef(s, symbolDef(s, { r2: R2 }), null);
  assert.deepEqual(d.pins.map(p => [p.width, p.label]), [[8, 'd(7:0)'], [8, 'q(7:0)']]);
  const LONG = { name: 'm', lang: 'vhdl', ports: [P('data_in'), P('data_out', 'out')] };
  const t = { ...s, name: 'm(15:0)', params: { module: 'm', generics: {}, ports: LONG.ports } };
  const dl = arrayedDef(t, symbolDef(t, { m: LONG }), null);
  assert.deepEqual(dl.pins.map(p => [p.width, p.label ?? null]), [[16, null], [16, null]], 'data_in(15:0) and data_out(15:0) do not fit its 80 px body');
});

// REG1bit in either language, and a test bench of top: n_D (8 bits), n_CE 1 but on the third step; n_Q after each clock
const SRC = {
  vhdl: 'library ieee; use ieee.std_logic_1164.all;\nentity REG1bit is port (D, CE, C : in std_logic; Q : out std_logic); end REG1bit;\narchitecture rtl of REG1bit is begin\n  process (C) begin if rising_edge(C) then if CE = \'1\' then Q <= D; end if; end if; end process;\nend rtl;\n',
  verilog: 'module REG1bit (input D, input CE, input C, output reg Q);\n  always @(posedge C) if (CE) Q <= D;\nendmodule\n',
};
function bench(lang, values) {
  if (lang === 'vhdl') {
    return `library ieee; use ieee.std_logic_1164.all;
entity tb is end tb;
architecture t of tb is
  signal d, q : std_logic_vector(7 downto 0) := (others => '0'); signal c, ce : std_logic := '0';
begin
  uut: entity work.top port map (n_D => d, n_CE => ce, n_C => c, n_Q => q);
  process begin
${values.map((v, i) => `    d <= "${v}"; ce <= '${i === 2 ? 0 : 1}'; wait for 5 ns; c <= '1'; wait for 5 ns; c <= '0'; report "q=" & ${Array.from({ length: 8 }, (_, k) => `std_logic'image(q(${7 - k}))`).join(' & ')};`).join('\n')}
    wait;
  end process;
end t;
`;
  }
  return `\`timescale 1ns/1ps
module tb;
  reg [7:0] d = 0; reg c = 0, ce = 0; wire [7:0] q;
  top uut (.n_D(d), .n_CE(ce), .n_C(c), .n_Q(q));
  initial begin
${values.map((v, i) => `    d = 8'b${v}; ce = ${i === 2 ? 0 : 1}; #5; c = 1; #5; c = 0; $display("q=%b", q);`).join('\n')}
  end
endmodule
`;
}

test('#3950 REG1bit given Width 8: an 8-bit register, its HDL compiled, elaborated and simulated in VHDL and Verilog, no warnings', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = sheet('bits', { D: 8, CE: 1, C: 1, Q: 8 }, lang);
    assert.deepEqual(netlist(doc, { modules: MODS }).diagnostics.map(d => d.message), ["width mismatch on net 'n_D': 8 vs 1 bits", "width mismatch on net 'n_Q': 8 vs 1 bits"], `${lang}: a single instance on 8-bit buses`);
    doc.symbols[0].name = withArrayWidth(doc.symbols[0].name, 8).name;
    assert.equal(doc.symbols[0].name, 'bits(7:0)');
    const g = generateHdl(doc, { lang, modules: MODS });
    assert.deepEqual(g.diagnostics, [], `${lang}: no warnings`);
    assert.equal((g.code.match(/REG1bit/g) || []).length, 8, `${lang}: 8 copies`);
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const r = simulate([{ path: `REG1bit.${ext}`, text: SRC[lang] }, { path: `top.${ext}`, text: g.code }, { path: `tb.${ext}`, text: bench(lang, ['10100101', '01101001', '11111111', '00000001']) }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors.map(e => e.message), [], `${lang}: compiles and elaborates`);
    assert.deepEqual([...r.lib.errors, ...r.design.diags].map(e => e.message), [], `${lang}: no warnings`);
    assert.deepEqual(r.sim.log.map(l => l.text.replace(/'/g, '').replace(/^.*q=/, '')), ['10100101', '01101001', '01101001', '00000001'], `${lang}: simulated`);
  }
});
