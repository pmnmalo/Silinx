// Unit tests (#4772): core/hdl-defines.js definesUnit, whether an HDL text defines a module, the one copy of the drawings'
// HDL files (core/view-hdl.js definesModule), the schematic's live simulation (core/schlive.js), the .xise project's top
// (core/xise.js) and the board's generics (core/board-generics.js): its rules, and each of those on the cases where their
// own copies differed (a declaration in a comment, macromodule).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definesUnit } from '../core/hdl-defines.js';
import { definesModule } from '../core/view-hdl.js';
import { topFileOf } from '../core/board-generics.js';
import { exportXise } from '../core/xise.js';

const VHDL = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity Counter is\n  port (clk : in std_logic);\nend Counter;\n';
const VLOG = '`timescale 1ns / 1ps\nmodule counter #(parameter W = 4) (input clk);\nendmodule\n';

test('definesUnit: an entity in VHDL (any letter case), a module or macromodule in Verilog (as written), at a line\'s start', () => {
  assert.equal(definesUnit(VHDL, 'Counter', 'vhdl'), true);
  assert.equal(definesUnit(VHDL, 'counter', 'vhdl'), true, 'VHDL names in any case');
  assert.equal(definesUnit(VHDL, 'count', 'vhdl'), false);
  assert.equal(definesUnit(VHDL, 'Counter', 'verilog'), false);
  assert.equal(definesUnit(VLOG, 'counter', 'verilog'), true);
  assert.equal(definesUnit(VLOG, 'Counter', 'verilog'), false, 'Verilog names as written');
  assert.equal(definesUnit('macromodule m(input a);\nendmodule\n', 'm', 'verilog'), true);
  assert.equal(definesUnit('  module m;\nendmodule\n', 'm', 'verilog'), true, 'indented');
  assert.equal(definesUnit('wire endmodule_m;\nassign x = 1; module m;\n', 'm', 'verilog'), false, 'not at its line\'s start');
  // either language when none is given
  assert.equal(definesUnit(VHDL, 'counter'), true);
  assert.equal(definesUnit(VLOG, 'counter'), true);
  // no name, no text
  assert.equal(definesUnit(VHDL, '', 'vhdl'), false);
  assert.equal(definesUnit(null, 'm', 'verilog'), false);
  // a name with a RegExp's characters is read as it is (an extended identifier)
  assert.equal(definesUnit('entity \\a.b\\ is\nend;\n', '\\a.b\\', 'vhdl'), true);
  assert.equal(definesUnit('entity \\axb\\ is\nend;\n', '\\a.b\\', 'vhdl'), false);
});

test('definesUnit: a declaration in a comment declares nothing (-- in VHDL; // and /* */ in Verilog)', () => {
  assert.equal(definesUnit('-- entity old is\nentity new is end;\n', 'old', 'vhdl'), false);
  assert.equal(definesUnit('// module old;\nmodule new; endmodule\n', 'old', 'verilog'), false);
  assert.equal(definesUnit('/*\nmodule old;\nendmodule\n*/\nmodule new; endmodule\n', 'old', 'verilog'), false);
  assert.equal(definesUnit('/* a */ module m; endmodule\n', 'm', 'verilog'), true, 'after a closed comment on its line');
});

test('the copies it replaced, through their modules: view-hdl by the file\'s extension, the board\'s top file, the .xise top', () => {
  // view-hdl: VHDL unless .v / .sv, as before
  assert.equal(definesModule(VLOG, 'counter', 'src/c.v'), true);
  assert.equal(definesModule(VLOG, 'counter', 'src/c.sv'), true);
  assert.equal(definesModule(VLOG, 'counter', 'src/c.vhd'), false);
  assert.equal(definesModule(VHDL, 'counter', 'src/c.vhd'), true);
  // board-generics: the file that declares the top; a commented-out copy elsewhere no longer counts
  const sources = [
    { path: 'src/old.v', lang: 'verilog', text: '// module top(input clk);\n// endmodule\n' },
    { path: 'src/top.v', lang: 'verilog', text: 'macromodule top(input clk);\nendmodule\n' },
  ];
  assert.equal(topFileOf(sources, 'top')?.path, 'src/top.v');
  // xise: the top's file; an entity named only in a comment not taken
  const project = { name: 'p', top: 'top', device: { family: 'spartan3e', part: 'xc3s100e', package: 'cp132', speed: '-4' },
    files: [{ path: 'src/a.vhd', lang: 'vhdl', role: 'design' }, { path: 'src/top.vhd', lang: 'vhdl', role: 'design' }] };
  const xise = exportXise(project, { sources: {
    'src/a.vhd': '-- entity top is (the old one)\nentity a is end a;\narchitecture rtl of top is begin end;\n',
    'src/top.vhd': 'entity top is end top;\narchitecture behavioral of top is begin end behavioral;\n',
  } });
  const text = typeof xise === 'string' ? xise : xise.xml ?? xise.text ?? JSON.stringify(xise);
  assert.match(text, /"Implementation Top" xil_pn:value="Architecture\|top\|behavioral"/);
  assert.match(text, /"Implementation Top File" xil_pn:value="src\/top\.vhd"/);
});
