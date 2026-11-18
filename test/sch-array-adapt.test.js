// An arrayed instance's width defines its pins' (#4451): REG1bit given Width 8, a wire connected to one of its pins
// before or after (to a net name with no range, to an open end, to another arrayed instance) makes its net the 8-bit
// bus, not the pin a single one shared by the copies; an I/O marker added on a pin (the tool's one, add_markers' many)
// is 8 bits wide, the HDL from those markers compiled, elaborated and simulated in VHDL and in Verilog with no
// warnings. Only where the net's width is fixed elsewhere at the pin's own (a 1-bit marker, another symbol's 1-bit
// pin) the pin is shared by the copies, said in a warning, none when it is ticked in Shared pins (#3966).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateHdl, netlist, normalizeDoc, symbolDef, symbolPins } from '../core/schdoc.js';
import { arrayedDef, pinWidthOn } from '../core/sch-array.js';
import { planMarkers, addMarkers } from '../core/schmarker-many.js';
import { simulate } from '../core/compile.js';

const P = (name, dir = 'in', width = 1) => ({ name, dir, width });
const REG = { name: 'REG1bit', lang: 'vhdl', ports: [P('D'), P('CE'), P('C'), P('Q', 'out')] };
const MODS = { REG1bit: REG };
const OUT = { W: -1, E: 1 };
const reg = (id, name, y = 200, shared) => ({ id, type: 'module', x: 300, y, rot: 0, mirror: false, name, params: { module: 'REG1bit', generics: {}, ports: REG.ports.map(q => ({ ...q })), ...(shared ? { shared } : {}) } });
const pinOf = (s, n) => symbolPins(s, MODS).find(p => p.name === n);
// a wire from pin `n` of `s` 60 to its outside, its end returned
function wire(doc, s, n) {
  const p = pinOf(s, n), b = { x: p.x + 60 * OUT[p.side], y: p.y };
  doc.wires.push({ id: `w_${s.id}_${n}`, points: [{ x: p.x, y: p.y }, b] });
  return b;
}
const make = (symbols, lang = 'vhdl') => normalizeDoc({ version: 4, name: 'top', lang, symbols, wires: [], ports: [], labels: [] }, { modules: MODS });
const msgs = nl => nl.diagnostics.map(d => d.message);
const drawn = (doc, nl, i = 0) => arrayedDef(doc.symbols[i], symbolDef(doc.symbols[i], MODS), nl).pins.map(p => `${p.name}${p.width}`);
const widthOf = (nl, sym, n) => nl.pinNet.get(`${sym}/${n}`).width;

test('#4451 a wire connected after the Width: to a net name with no range, to an open end; the pins stay 8-bit buses', () => {
  const doc = make([reg('U', 'reg(7:0)', 200, ['C'])]);
  // open: every pin but the shared one a bus
  assert.deepEqual(drawn(doc, netlist(doc, { modules: MODS })), ['D8', 'CE8', 'C1', 'Q8']);
  // a wire on D named din, one on Q named dout, an open wire on CE: their nets the 8-bit buses
  const s = doc.symbols[0];
  const d = wire(doc, s, 'D'), q = wire(doc, s, 'Q');
  wire(doc, s, 'CE');
  doc.labels.push({ id: 'L1', x: d.x, y: d.y, net: 'din' }, { id: 'L2', x: q.x, y: q.y, net: 'dout' });
  const nl = netlist(doc, { modules: MODS });
  assert.deepEqual(['D', 'CE', 'Q'].map(n => widthOf(nl, 'U', n)), [8, 8, 8]);
  assert.deepEqual(drawn(doc, nl), ['D8', 'CE8', 'C1', 'Q8']);
  assert.deepEqual(msgs(nl), ["net 'din' has no driver (read by reg(7:0).D)", "net 'din' connects only reg(7:0).D", "net 'net_1' has no driver (read by reg(7:0).CE)",
    "net 'net_1' connects only reg(7:0).CE", "net 'dout' connects only reg(7:0).Q", 'input pin C of reg(7:0) (REG1bit) is not connected']);
  assert.equal(pinWidthOn(nl.pinNet.get('U/D'), 'U', 'D', 1), 8);
  // its HDL: din and dout declared 8 bits wide, each copy its bit
  const v = generateHdl(doc, { lang: 'vhdl', modules: MODS }).code;
  assert.match(v, /signal din : std_logic_vector\(7 downto 0\);/);
  assert.match(v, /reg_5 : entity work\.REG1bit\n {4}port map \(\n {6}D => din\(5\),\n {6}CE => net_1\(5\),/);
  assert.match(generateHdl(doc, { lang: 'verilog', modules: MODS }).code, /wire \[7:0\] din;/);
  // (its module's ports typed, as read from its VHDL: the nets still 8 bits wide, not std_logic; C's open net_2 1 bit)
  const typed = { REG1bit: { ...REG, ports: REG.ports.map(q => ({ ...q, type: 'std_logic' })) } };
  assert.match(generateHdl(doc, { lang: 'vhdl', modules: typed }).code, /signal din : std_logic_vector\(7 downto 0\);\n {2}signal net_1 : std_logic_vector\(7 downto 0\);\n {2}signal net_2 : std_logic;\n {2}signal dout : std_logic_vector\(7 downto 0\);/);
});

test('#4451 Q of one reg(7:0) to D of another: an 8-bit bus; to a reg(3:0) a width mismatch', () => {
  const doc = make([reg('U', 'a(7:0)', 200, ['C', 'CE']), reg('V', 'b(7:0)', 500, ['C', 'CE'])]);
  const [a, b] = doc.symbols, qa = pinOf(a, 'Q'), db = pinOf(b, 'D');
  doc.wires.push({ id: 'w1', points: [{ x: qa.x, y: qa.y }, { x: qa.x + 40, y: qa.y }, { x: qa.x + 40, y: db.y }, { x: db.x, y: db.y }] });
  let nl = netlist(doc, { modules: MODS });
  assert.deepEqual([widthOf(nl, 'U', 'Q'), widthOf(nl, 'V', 'D')], [8, 8]);
  assert.deepEqual([drawn(doc, nl, 0), drawn(doc, nl, 1)], [['D8', 'CE1', 'C1', 'Q8'], ['D8', 'CE1', 'C1', 'Q8']]);
  doc.symbols[1].name = 'b(3:0)';
  nl = netlist(doc, { modules: MODS });
  assert.equal(msgs(nl)[0], "width mismatch on net 'net_4': 8 vs 4 bits");
});

test('#4451 the net\'s width fixed elsewhere at 1 bit: the pin shared by the copies, said in a warning; none when ticked', () => {
  // D wired to an inverter's 1-bit output, C to a 1-bit I/O marker
  const doc = make([reg('U', 'reg(7:0)'), { id: 'I', type: 'inv', x: 100, y: 100, rot: 0, mirror: false, name: 'inv1', params: {} }]);
  const s = doc.symbols[0], o = symbolPins(doc.symbols[1], MODS).find(p => p.dir === 'out'), d = pinOf(s, 'D');
  doc.wires.push({ id: 'w1', points: [{ x: o.x, y: o.y }, { x: d.x, y: o.y }, { x: d.x, y: d.y }] });
  const c = wire(doc, s, 'C');
  doc.ports.push({ id: 'P1', name: 'clk', dir: 'in', width: 1, x: c.x, y: c.y });
  let nl = netlist(doc, { modules: MODS });
  assert.deepEqual([widthOf(nl, 'U', 'D'), widthOf(nl, 'U', 'C')], [1, 1]);
  assert.deepEqual(drawn(doc, nl), ['D1', 'CE8', 'C1', 'Q8']);
  assert.deepEqual(nl.diagnostics.filter(x => /shared/.test(x.message)).map(x => [x.severity, x.message, x.ref]), [
    ['warning', "reg(7:0): pin D is shared by its 8 copies: its net 'net_1' is 1 bit wide; tick it in Shared pins, or connect it to a 8-bit bus", { kind: 'symbol', id: 'U', pin: 'D' }],
    ['warning', "reg(7:0): pin C is shared by its 8 copies: its net 'clk' is 1 bit wide; tick it in Shared pins, or connect it to a 8-bit bus", { kind: 'symbol', id: 'U', pin: 'C' }]]);
  s.params.shared = ['D', 'C'];
  nl = netlist(doc, { modules: MODS });
  assert.deepEqual(nl.diagnostics.filter(x => /shared/.test(x.message)), []);
  assert.deepEqual(drawn(doc, nl), ['D1', 'CE8', 'C1', 'Q8']);
});

// REG1bit in either language, and a test bench of top: in1 (8 bits, D), in2 (CE) 1 but on the third step, in3 (C), out1
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
  uut: entity work.top port map (in1 => d, in2 => ce, in3 => c, out1 => q);
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
  top uut (.in1(d), .in2(ce), .in3(c), .out1(q));
  initial begin
${values.map((v, i) => `    d = 8'b${v}; ce = ${i === 2 ? 0 : 1}; #5; c = 1; #5; c = 0; $display("q=%b", q);`).join('\n')}
  end
endmodule
`;
}

test('#4451 I/O markers added on reg(7:0)\'s pins: D and Q 8 bits wide, CE and C (ticked) 1; its HDL simulated in VHDL and Verilog, no warnings', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = make([reg('U', 'reg(7:0)', 200, ['CE', 'C'])], lang);
    const plan = planMarkers(doc, { instance: 'reg(7:0)', modules: MODS });
    assert.deepEqual(plan.markers.map(m => `${m.name}:${m.dir}:${m.width}`), ['in1:in:8', 'in2:in:1', 'in3:in:1', 'out1:out:8'], lang);
    addMarkers(doc, plan.markers);
    assert.deepEqual(msgs(netlist(doc, { modules: MODS })), [], `${lang}: no warnings`);
    const g = generateHdl(doc, { lang, modules: MODS });
    assert.deepEqual(g.diagnostics, [], `${lang}: no warnings`);
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const r = simulate([{ path: `REG1bit.${ext}`, text: SRC[lang] }, { path: `top.${ext}`, text: g.code }, { path: `tb.${ext}`, text: bench(lang, ['10100101', '01101001', '11111111', '00000001']) }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors.map(e => e.message), [], `${lang}: compiles and elaborates`);
    assert.deepEqual([...r.lib.errors, ...r.design.diags].map(e => e.message), [], `${lang}: no warnings`);
    assert.deepEqual(r.sim.log.map(l => l.text.replace(/'/g, '').replace(/^.*q=/, '')), ['10100101', '01101001', '01101001', '00000001'], `${lang}: simulated`);
  }
});
