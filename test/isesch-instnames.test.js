// An ISE schematic's instance named with a reserved word (#3870): ISE's sch2hdl refuses a block named so (reg, wire,
// reg(3:0): "is an illegal block name. It is a reserved word for verilog", in a VHDL schematic too), so the export
// (core/isesch-export.js, core/isesch-instnames.js) writes it with _1 after its name (_2 … when another instance has
// that one) and says so in a warning: every word of Verilog-2005 and of VHDL (2008's included), in any letter case,
// an arrayed instance's base; the other names as they are. The schematic read back has the new name, no warnings, and
// its HDL compiles in VHDL and in Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportIseSch, importIseSch } from '../core/isesch.js';
import { iseInstanceNames } from '../core/isesch-instnames.js';
import { VERILOG_WORDS, VHDL_WORDS } from '../core/reserved.js';
import { generateHdl, netlist, normalizeDoc, symbolPins } from '../core/schdoc.js';
import { instanceParams } from '../core/symbol-layout.js';
import { compile, elaborate } from '../core/compile.js';

const OUT = { W: [-60, 0], E: [60, 0], N: [0, -60], S: [0, 60] };
const why = (w, langs) => `'${w}' is a reserved word of ${langs}, which ISE's schematic refuses as a block's name`;
const langsOf = w => [VHDL_WORDS.has(w.toLowerCase()) && 'VHDL', VERILOG_WORDS.has(w.toLowerCase()) && 'Verilog'].filter(Boolean).join(' and ');

// a sheet of the instances `syms` ({ id, type, name, params }), each pin wired to a marker of the instance's id and pin
function sheet(lang, syms, modules) {
  const symbols = syms.map((s, i) => ({ x: 300, y: 200 + 200 * i, rot: 0, mirror: false, params: {}, ...s }));
  const wires = [], ports = [];
  for (const s of symbols) for (const p of symbolPins(s, modules)) {
    const b = { x: p.x + OUT[p.side][0], y: p.y + OUT[p.side][1] };
    wires.push({ id: `w_${s.id}_${p.name}`, points: [{ x: p.x, y: p.y }, b] });
    ports.push({ id: `m_${s.id}_${p.name}`, name: `${s.id}_${p.name}`, dir: p.dir === 'out' ? 'out' : 'in', width: p.width ?? 1, x: b.x, y: b.y });
  }
  return normalizeDoc({ version: 4, name: 'top', lang, symbols, wires, ports, labels: [] }, { modules });
}
const exported = (doc, modules) => exportIseSch(doc, { modules, timestamp: '2026-11-16T00:00:00' });
const blockNames = xml => [...xml.matchAll(/<block symbolname="[^"]*" name="([^"]*)">/g)].map(m => m[1]);
const instNames = xml => [...xml.matchAll(/<instance x="\d+" y="\d+" name="([^"]*)"/g)].map(m => m[1]);
// (the HDL of a schematic read back, compiled: no errors, no warnings)
function compiles(doc, lang, modules = {}, extra = []) {
  const g = generateHdl(doc, { lang, modules });
  assert.deepEqual(g.diagnostics, []);
  const lib = compile([...extra, { path: `top.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: g.code }]);
  assert.deepEqual(lib.errors.map(e => e.message), []);
  const design = elaborate(lib, 'top');
  assert.deepEqual(design.diags.map(e => e.message), [], 'no warnings');
  assert.equal(design.top.name, 'top');
  return g.code;
}

for (const lang of ['vhdl', 'verilog']) {
  test(`#3870 ${lang}: an and2 named with each reserved word of Verilog and of VHDL written with _1, said in a warning; read back so, its HDL compiled`, () => {
    const words = [...new Set([...VERILOG_WORDS, ...VHDL_WORDS])].sort();
    assert.ok(words.length > 150);
    for (const w of words) {
      const doc = sheet(lang, [{ id: 'G', type: 'and2', name: w }]);
      const r = exported(doc, {});
      assert.deepEqual([blockNames(r.xml), instNames(r.xml)], [[`${w}_1`], [`${w}_1`]], w);
      assert.deepEqual(r.warnings, [`instance '${w}' written as '${w}_1': ${why(w, langsOf(w))}`], w);
      const im = importIseSch(r.xml, { name: 'top', lang });
      assert.deepEqual(im.warnings, [], w);
      assert.deepEqual(im.doc.symbols.map(s => [s.type, s.name]), [['and2', `${w}_1`]], w);
      assert.deepEqual(netlist(im.doc).diagnostics.map(d => d.message), [], w);
    }
    // (one of each language's, compiled: the gate's label in its HDL)
    for (const w of ['reg', 'wire', 'signal', 'process', 'begin']) {
      const im = importIseSch(exported(sheet(lang, [{ id: 'G', type: 'and2', name: w }]), {}).xml, { name: 'top', lang });
      compiles(im.doc, lang);
    }
  });
}

test('#3870 a reserved word in another letter case renamed too (VHDL ignores it, sch2hdl too); other names as they are, a SystemVerilog word too', () => {
  const doc = sheet('vhdl', [{ id: 'A', type: 'and2', name: 'WIRE' }, { id: 'B', type: 'and2', name: 'Signal' }, { id: 'C', type: 'and2', name: 'bits' },
    { id: 'D', type: 'and2', name: 'logic' }, { id: 'E', type: 'and2', name: 'U1' }]);
  const r = exported(doc, {});
  assert.deepEqual(blockNames(r.xml), ['WIRE_1', 'Signal_1', 'bits', 'logic', 'U1']);
  assert.deepEqual(r.warnings, [`instance 'WIRE' written as 'WIRE_1': ${why('WIRE', 'Verilog')}`, `instance 'Signal' written as 'Signal_1': ${why('Signal', 'VHDL')}`]);
});

test('#3870 the new name none of another instance\'s (in any letter case): _2, _3 …', () => {
  const doc = sheet('verilog', [{ id: 'A', type: 'and2', name: 'reg' }, { id: 'B', type: 'and2', name: 'REG_1' }, { id: 'C', type: 'and2', name: 'reg_2' }, { id: 'D', type: 'and2', name: 'Reg' }]);
  const r = exported(doc, {});
  assert.deepEqual(blockNames(r.xml), ['reg_3', 'REG_1', 'reg_2', 'Reg_4']);
  assert.deepEqual(r.warnings, [`instance 'reg' written as 'reg_3': ${why('reg', 'Verilog')}`, `instance 'Reg' written as 'Reg_4': ${why('Reg', 'Verilog')}`]);
  const im = importIseSch(r.xml, { name: 'top', lang: 'verilog' });
  assert.deepEqual([im.warnings, im.doc.symbols.map(s => s.name)], [[], ['reg_3', 'REG_1', 'reg_2', 'Reg_4']]);
});

test('#3870 iseInstanceNames: the names, a range kept after the new base; no warning when none renamed', () => {
  const w = [];
  const m = iseInstanceNames([{ id: 1, name: 'reg(3:0)' }, { id: 2, name: 'reg_1' }, { id: 3, name: 'next[0:1]' }, { id: 4, name: 'u1(3:0)' }, { id: 5, name: 'and2' }], x => w.push(x));
  assert.deepEqual([...m], [[1, 'reg_2(3:0)'], [2, 'reg_1'], [3, 'next_1[0:1]'], [4, 'u1(3:0)'], [5, 'and2']]);
  assert.deepEqual(w, [`instance 'reg(3:0)' written as 'reg_2(3:0)': ${why('reg', 'Verilog')}`, `instance 'next[0:1]' written as 'next_1[0:1]': ${why('next', 'VHDL')}`]);
  const none = [];
  assert.deepEqual([...iseInstanceNames([{ id: 1, name: 'U1' }], x => none.push(x))], [[1, 'U1']]);
  assert.deepEqual(none, []);
});

// an arrayed instance of a module (#3828), reg(3:0) of a 1-bit register: the block reg_1(3:0), read back arrayed
const P = (name, dir = 'in') => ({ name, dir, width: 1 });
const HDL = {
  vhdl: ['reg1.vhd', 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity reg1 is\n  port (d, c : in std_logic; q : out std_logic);\nend entity reg1;\n\narchitecture rtl of reg1 is\nbegin\n  process (c) begin\n    if rising_edge(c) then\n      q <= d;\n    end if;\n  end process;\nend architecture rtl;\n'],
  verilog: ['reg1.v', 'module reg1 (input d, input c, output reg q);\n  always @(posedge c) q <= d;\nendmodule\n'],
};
for (const lang of ['vhdl', 'verilog']) {
  test(`#3870 ${lang}: an arrayed instance reg(3:0) written as reg_1(3:0), read back arrayed, its copies reg_1_3 … reg_1_0; its HDL compiled`, () => {
    const mods = { reg1: { name: 'reg1', lang, file: `src/${HDL[lang][0]}`, ports: [P('d'), P('c'), P('q', 'out')] } };
    const s = { id: 'U', type: 'module', name: 'reg(3:0)', params: { module: 'reg1', generics: {}, ...instanceParams(mods.reg1) } };
    const doc = sheet(lang, [s], mods);
    // (the markers of d and q 4 bits wide)
    for (const p of doc.ports) if (/_[dq]$/.test(p.name)) p.width = 4;
    assert.deepEqual(netlist(doc, { modules: mods }).diagnostics.map(d => d.message), []);
    const r = exported(doc, mods);
    assert.deepEqual([blockNames(r.xml), instNames(r.xml)], [['reg_1(3:0)'], ['reg_1(3:0)']]);
    assert.deepEqual(r.warnings, [`instance 'reg(3:0)' written as 'reg_1(3:0)': ${why('reg', 'Verilog')}`,
      "'reg1': project module — ISE uses its HDL source and the reg1.sym symbol (or regenerate it with Create Schematic Symbol)"]);
    const im = importIseSch(r.xml, { modules: mods, name: 'top', lang });
    assert.deepEqual(im.warnings, []);
    assert.deepEqual(im.doc.symbols.map(x => [x.type, x.name]), [['module', 'reg_1(3:0)']]);
    assert.deepEqual(netlist(im.doc, { modules: mods }).diagnostics.map(d => d.message), []);
    const code = compiles(im.doc, lang, mods, [{ path: HDL[lang][0], text: HDL[lang][1] }]);
    assert.deepEqual(code.match(lang === 'vhdl' ? /reg_1_\d : entity work\.reg1/g : /reg1 reg_1_\d \(/g),
      [3, 2, 1, 0].map(i => (lang === 'vhdl' ? `reg_1_${i} : entity work.reg1` : `reg1 reg_1_${i} (`)));
  });
}
