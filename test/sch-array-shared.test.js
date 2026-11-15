// An arrayed instance's pins marked shared (#3966, params.shared, its Properties' Shared pins): a marked pin never sliced
// whatever its net (core/sch-array.js sliceArrayed, netlist()), drawn a single pin (arrayedDef) even when open, its name
// matched whatever its case; on a net of another width an error of its own (no width mismatch); only an input marked
// (#4053: the MCP's output refused, a mark left on an output ignored, the output by its net's width); sharedList,
// the MCP's names; a REG1bit(7:0) with C and CE marked, its HDL the unmarked one's, compiled,
// elaborated and simulated in VHDL and in Verilog with no warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateHdl, netlist, normalizeDoc, symbolDef, symbolPins } from '../core/schdoc.js';
import { arrayedDef, sharedPins, sharedList, sliceArrayed } from '../core/sch-array.js';
import { simulate } from '../core/compile.js';

const P = (name, dir = 'in', width = 1) => ({ name, dir, width });
const REG = { name: 'REG1bit', lang: 'vhdl', ports: [P('D'), P('CE'), P('C'), P('Q', 'out')] };
const MODS = { REG1bit: REG };
const OUT = { W: -1, E: 1 };

// a sheet: the instance `name` of REG1bit, its pins `shared` marked shared, each pin in `widths` wired to an I/O marker
// n_<pin> of that many bits
function sheet(name, widths, shared, lang = 'vhdl') {
  const s = { id: 'U', type: 'module', x: 300, y: 200, rot: 0, mirror: false, name, params: { module: 'REG1bit', generics: {}, ports: REG.ports.map(q => ({ ...q })), ...(shared ? { shared } : {}) } };
  const wires = [], ports = [];
  for (const p of symbolPins(s, MODS)) {
    if (widths[p.name] == null) continue;
    const b = { x: p.x + 60 * OUT[p.side], y: p.y };
    wires.push({ id: `w_${p.name}`, points: [{ x: p.x, y: p.y }, b] });
    ports.push({ id: `m_${p.name}`, name: `n_${p.name}`, dir: p.dir === 'out' ? 'out' : 'in', width: widths[p.name], x: b.x, y: b.y });
  }
  return normalizeDoc({ version: 4, name: 'top', lang, symbols: [s], wires, ports, labels: [] }, { modules: MODS });
}

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

const msgs = nl => nl.diagnostics.map(d => d.message);
const drawn = (doc, nl) => arrayedDef(doc.symbols[0], symbolDef(doc.symbols[0], MODS), nl).pins.map(p => `${p.name}${p.width}${p.label ? ` ${p.label}` : ''}`);

test('#3966 sharedPins / sharedList: the names lower case, any case; the MCP\'s list in the pins\' order and case, a pin not there refused', () => {
  assert.deepEqual([...sharedPins({ params: { shared: ['C', 'ce'] } })], ['c', 'ce']);
  assert.deepEqual([...sharedPins({ params: {} })], []);
  assert.deepEqual([...sharedPins({ params: { shared: 'C' } })], [], 'not a list: none');
  assert.deepEqual([...sharedPins(null)], []);
  const pins = REG.ports;
  assert.deepEqual(sharedList(pins, ['c', 'D']), { names: ['D', 'C'] });
  assert.deepEqual(sharedList(pins, []), { names: [] });
  assert.deepEqual(sharedList(pins, [' ce ']), { names: ['CE'] });
  assert.deepEqual(sharedList(pins, ['C', 'x', 'y']), { error: 'Shared pins: no pin x, y (its pins: D, CE, C, Q)' });
  // only an input (#4053)
  assert.deepEqual(sharedList(pins, ['C', 'q']), { error: 'Shared pins: Q not an input: only an input is shared by the copies' });
  assert.deepEqual(sharedList([...pins, P('B', 'inout')], ['b', 'Q']), { error: 'Shared pins: Q, B not inputs: only an input is shared by the copies' });
});

test('#3966 sliceArrayed: a pin marked shared never sliced; on a net of another width misfit; an output not sliced in error', () => {
  const pin = (o) => ({ kind: 'pin', dir: 'in', width: 1, arr: 8, ...o });
  const a = pin({ shared: true });
  assert.deepEqual([sliceArrayed([a], [8]), a.sliced, a.misfit], [[a], undefined, true], 'on an 8-bit marker');
  const b = pin({ shared: true });
  assert.deepEqual([sliceArrayed([b], [1]), b.width, b.sliced, b.misfit], [[], 1, undefined, undefined], 'on a 1-bit one');
  const c = pin({ shared: true }), q = pin({ dir: 'out' });
  assert.deepEqual([sliceArrayed([c, q], []), q.sliced, q.width, c.misfit], [[c], true, 8, true], 'with a sliced output: the output 8 bits, the shared pin 1');
  const o = pin({ dir: 'out', shared: true });
  assert.deepEqual([sliceArrayed([o], []), o.sliced, o.misfit], [[o], undefined, undefined], 'an output flagged shared (netlist() never does, #4053): a shared output\'s error');
  const open = pin({ shared: true });
  assert.deepEqual([sliceArrayed([open], []), open.misfit], [[], undefined], 'alone on its net');
});

test('#3966 netlist and drawing: C and CE marked shared on 1-bit nets as before; open, drawn single pins; any case', () => {
  const doc = sheet('reg(7:0)', { D: 8, CE: 1, C: 1, Q: 8 }, ['c', 'Ce']), nl = netlist(doc, { modules: MODS });
  assert.deepEqual(msgs(nl), []);
  const ep = pin => nl.pinNet.get(`U/${pin}`).endpoints.find(e => e.sym === 'U');
  assert.deepEqual(['D', 'CE', 'C', 'Q'].map(p => [p, !!ep(p).shared, !!ep(p).sliced, ep(p).width]), [['D', false, true, 8], ['CE', true, false, 1], ['C', true, false, 1], ['Q', false, true, 8]]);
  assert.deepEqual(drawn(doc, nl), ['D8 D(7:0)', 'CE1', 'C1', 'Q8 Q(7:0)']);
  // not wired yet: a marked pin a single pin, the others buses (as #3950's); with no netlist too
  const open = sheet('reg(7:0)', {}, ['C', 'CE']);
  assert.deepEqual(drawn(open, netlist(open, { modules: MODS })), ['D8 D(7:0)', 'CE1', 'C1', 'Q8 Q(7:0)']);
  assert.deepEqual(arrayedDef(open.symbols[0], symbolDef(open.symbols[0], MODS), null).pins.map(p => p.width), [8, 1, 1, 8]);
  // a single instance: its marks change nothing
  const one = sheet('r1', { D: 1, CE: 1, C: 1, Q: 1 }, ['C']), nl1 = netlist(one, { modules: MODS });
  assert.deepEqual([msgs(nl1), nl1.nets.some(n => n.endpoints.some(e => e.shared))], [[], false]);
});

test('#3966 #4053 the errors: a marked pin on a bus (no width mismatch, drawn a single pin), said once; a mark on an output ignored', () => {
  const bus = sheet('reg(7:0)', { D: 8, CE: 8, C: 1, Q: 8 }, ['CE', 'C']), nl = netlist(bus, { modules: MODS });
  assert.deepEqual(msgs(nl), ["reg(7:0): pin CE is shared by its 8 copies, but its net 'n_CE' is 8 bits wide: connect it to a 1-bit net, or untick it in Shared pins"]);
  assert.deepEqual(nl.diagnostics[0].ref, { kind: 'symbol', id: 'U', pin: 'CE' });
  assert.deepEqual(drawn(bus, nl), ['D8 D(7:0)', 'CE1', 'C1', 'Q8 Q(7:0)']);
  // unmarked, the same sheet: CE sliced, no error (today's rule)
  assert.deepEqual(msgs(netlist(sheet('reg(7:0)', { D: 8, CE: 8, C: 1, Q: 8 }), { modules: MODS })), []);
  // a mark left on the output Q (a file written before #4053): ignored, Q by its net's width (sliced on 8 bits, a
  // shared output's error on 1)
  const out = sheet('reg(7:0)', { D: 8, CE: 1, C: 1, Q: 8 }, ['q']), nlo = netlist(out, { modules: MODS });
  assert.deepEqual([msgs(nlo), drawn(out, nlo)], [[], ['D8 D(7:0)', 'CE1', 'C1', 'Q8 Q(7:0)']]);
  assert.equal(generateHdl(out, { modules: MODS }).code, generateHdl(sheet('reg(7:0)', { D: 8, CE: 1, C: 1, Q: 8 }), { modules: MODS }).code, 'its HDL the unmarked one\'s');
  const out1 = sheet('reg(7:0)', { D: 8, CE: 1, C: 1, Q: 1 }, ['Q']);
  assert.deepEqual(msgs(netlist(out1, { modules: MODS })), ["reg(7:0): output Q of its 8 copies drives the 1-bit net 'n_Q': connect it to a 8-bit bus"]);
  assert.deepEqual(arrayedDef(out1.symbols[0], symbolDef(out1.symbols[0], MODS), null).pins.map(p => p.width), [8, 8, 8, 8], 'drawn a bus, as an unmarked one');
  // an error: no HDL generated from it (as any other)
  assert.ok(generateHdl(bus, { modules: MODS }).diagnostics.some(d => d.severity === 'error' && /pin CE is shared/.test(d.message)));
});

test('#3966 REG1bit(7:0), C and CE marked shared: its HDL the unmarked one\'s, compiled, elaborated and simulated in VHDL and Verilog, no warnings', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = sheet('bits(7:0)', { D: 8, CE: 1, C: 1, Q: 8 }, ['C', 'CE'], lang);
    const g = generateHdl(doc, { lang, modules: MODS });
    assert.deepEqual(g.diagnostics, [], `${lang}: no warnings`);
    assert.equal(g.code, generateHdl(sheet('bits(7:0)', { D: 8, CE: 1, C: 1, Q: 8 }, null, lang), { lang, modules: MODS }).code, `${lang}: the unmarked one's`);
    assert.match(g.code, lang === 'vhdl' ? /bits_5 : entity work\.REG1bit\n {4}port map \(\n {6}D => n_D\(5\),\n {6}CE => n_CE,\n {6}C => n_C,/ : /REG1bit bits_5 \(\n {4}\.D\(n_D\[5\]\),\n {4}\.CE\(n_CE\),\n {4}\.C\(n_C\),/);
    const ext = lang === 'vhdl' ? 'vhd' : 'v';
    const r = simulate([{ path: `REG1bit.${ext}`, text: SRC[lang] }, { path: `top.${ext}`, text: g.code }, { path: `tb.${ext}`, text: bench(lang, ['10100101', '01101001', '11111111', '00000001']) }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors.map(e => e.message), [], `${lang}: compiles and elaborates`);
    assert.deepEqual([...r.lib.errors, ...r.design.diags].map(e => e.message), [], `${lang}: no warnings`);
    assert.deepEqual(r.sim.log.map(l => l.text.replace(/'/g, '').replace(/^.*q=/, '')), ['10100101', '01101001', '01101001', '00000001'], `${lang}: simulated`);
  }
});
