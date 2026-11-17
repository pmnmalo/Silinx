// The top's hierarchy and the files it needs (#4421, core/top-hierarchy.js): a file with errors outside it is left out
// of the runs of the top (the flows' sources, ISE's and Vivado's build folder, the checks before them), one inside is
// kept (its errors stop the run); every case of what "inside" is: a module instantiated (a component, an entity
// instance, a Verilog instance), a package used, an architecture in a file of its own, a file `include'd, a
// SystemVerilog package, a module the hierarchy misses that a broken file may declare.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compile } from '../core/compile.js';
import { flowFrontEnd } from '../core/synth-front.js';
import { topFiles, leftOut, hierarchySources, hierarchyDiags, leftOutWarning, leftOutDiag } from '../core/top-hierarchy.js';

const vhd = (p, text) => ({ path: p, lang: 'vhdl', text });
const v = (p, text) => ({ path: p, lang: 'verilog', text });
const TOP = vhd('top.vhd', `library ieee; use ieee.std_logic_1164.all; use work.p.all;
entity top is port (x : in std_logic; y : out std_logic; z : out std_logic); end top;
architecture r of top is
  component sub port (a : in std_logic; y : out std_logic); end component;
begin
  u : sub port map (x, y);
  w : entity work.leaf port map (a => x, y => z);
end r;
`);
const SUB = v('sub.v', 'module sub(input a, output y); assign y = a; endmodule\n');
const LEAF = vhd('leaf.vhd', 'library ieee; use ieee.std_logic_1164.all;\nentity leaf is port (a : in std_logic; y : out std_logic); end leaf;\n');
const LEAF_ARCH = vhd('leaf_arch.vhd', 'architecture r of leaf is begin y <= a; end r;\n');
const PKG = vhd('p.vhd', 'package p is constant K : integer := 1; end p;\n');
const BROKEN = vhd('broken.vhd', 'library ieee; use ieee.std_logic_1164.all;\nentity broken is port (a : in std_logic; y : out std_logic); end broken;\narchitecture r of broken is begin y <= a and ; end r;\n');
const DESIGN = [TOP, SUB, LEAF, LEAF_ARCH, PKG];
const paths = r => r.sources.map(s => s.path);
const lib = srcs => compile(srcs);

test('topFiles: the files of the modules the top instantiates (a component, an entity instance), of an architecture in a file of its own, of the packages used', () => {
  const h = topFiles(lib([...DESIGN, BROKEN]), 'top');
  assert.deepEqual([[...h.files].sort(), [...h.modules].sort(), [...h.packages], [...h.unresolved]],
    [['leaf.vhd', 'leaf_arch.vhd', 'p.vhd', 'sub.v', 'top.vhd'], ['leaf', 'sub', 'top'], ['p'], []]);
  // a module nothing declares: unresolved
  assert.deepEqual([...topFiles(lib([TOP, LEAF, LEAF_ARCH, PKG]), 'top').unresolved], ['sub']);
});

test('hierarchySources: a broken file outside the hierarchy left out, its errors said; none with errors: every source as it is', () => {
  const r = hierarchySources([...DESIGN, BROKEN], 'top');
  assert.deepEqual([paths(r), r.left], [['top.vhd', 'sub.v', 'leaf.vhd', 'leaf_arch.vhd', 'p.vhd'], [{ path: 'broken.vhd', errors: ['3: expected expression but found \';\''] }]]);
  // (and the rest is what the open flow's front end compiles with no error)
  assert.deepEqual(flowFrontEnd(r.sources, 'top').errors, []);
  assert.deepEqual(flowFrontEnd([...DESIGN, BROKEN], 'top').errors, ['broken.vhd:3 expected expression but found \';\'']);
  // a clean file outside the hierarchy stays (only a file with errors is left out)
  const clean = vhd('other.vhd', 'entity other is end other;\narchitecture r of other is begin end r;\n');
  const all = [...DESIGN, clean];
  assert.equal(hierarchySources(all, 'top').sources, all);
  assert.deepEqual(hierarchySources(all, 'top').left, []);
});

test('hierarchySources: a broken file inside the hierarchy is kept, its errors the run\'s: a module, its architecture\'s file, a package, the top itself', () => {
  const cases = [
    ['sub.v', v('sub.v', 'module sub(input a, output y); assign y = a & ; endmodule\n')],
    ['leaf_arch.vhd', vhd('leaf_arch.vhd', 'architecture r of leaf is begin y <= a or ; end r;\n')],
    ['p.vhd', vhd('p.vhd', 'package p is constant K : integer := ; end p;\n')],
    ['top.vhd', vhd('top.vhd', `${TOP.text}\narchitecture s of top is begin y <= ; end s;\n`)],
  ];
  for (const [file, bad] of cases) {
    const srcs = [...DESIGN.map(s => (s.path === file ? bad : s)), BROKEN];
    const r = hierarchySources(srcs, 'top');
    assert.deepEqual([paths(r).includes(file), r.left.map(l => l.path)], [true, ['broken.vhd']], file);
    assert.ok(flowFrontEnd(r.sources, 'top').errors.some(e => e.startsWith(`${file}:`)), file);
  }
});

test('hierarchySources: a broken file declaring a module the hierarchy misses is kept; one reading as nothing, kept only when the hierarchy misses a module', () => {
  const brokenSub = v('bsub.v', 'module sub(input a, output y); assign y = ; endmodule\n');
  // (sub.v gone: the broken one is the only sub)
  assert.deepEqual(hierarchySources([TOP, LEAF, LEAF_ARCH, PKG, brokenSub], 'top').left, []);
  const garbage = v('junk.v', '@@ not verilog\n');
  assert.deepEqual(hierarchySources([...DESIGN, garbage], 'top').left.map(l => l.path), ['junk.v']);
  assert.deepEqual(hierarchySources([TOP, LEAF, LEAF_ARCH, PKG, garbage], 'top').left, []);
  // a top no source declares: nothing left out (the run says the top is not found)
  assert.deepEqual(hierarchySources([...DESIGN, BROKEN], 'nothere').left, []);
});

test('hierarchySources: an `include\'d file and a header are never left out; a SystemVerilog package is a Verilog module\'s', () => {
  const inc = v('defs.v', '`define W 4\nmodule unused_defs; wire [`W-1:0] q = ; endmodule\n');
  const top = v('vtop.v', '`include "defs.v"\nmodule vtop(input a, output y); assign y = a; endmodule\n');
  assert.ok(lib([top, inc]).errors.some(e => e.file === 'defs.v'));
  assert.deepEqual(hierarchySources([top, inc], 'vtop').left, []);
  const svPkg = v('pk.sv', 'package pk; localparam int N = ; endpackage\n');
  const svTop = v('svtop.sv', 'module svtop(output [3:0] y); assign y = pk::N; endmodule\n');
  assert.ok(lib([svTop, svPkg]).errors.some(e => e.file === 'pk.sv'));
  assert.deepEqual(hierarchySources([svTop, svPkg], 'svtop').left, []);
  assert.deepEqual(hierarchySources([svTop, svPkg, BROKEN], 'svtop').left.map(l => l.path), ['broken.vhd']);
});

test('leftOut: a C source whose HDL cannot be made, left out when its module is none of the hierarchy\'s', () => {
  const l = lib([...DESIGN, BROKEN]);
  assert.deepEqual(leftOut(l, 'top', ['f.c', 'g.c'], [{ file: 'f.c', module: 'fir' }, { file: 'g.c', module: 'SUB' }]), ['f.c']);
  assert.deepEqual(leftOut(l, 'top', []), []);
});

test('hierarchyDiags: the diagnostics of a file left out replaced by its warning; the others as they are', () => {
  const srcs = [...DESIGN, BROKEN];
  const err = { severity: 'error', file: 'broken.vhd', line: 3, col: 1, message: 'expected expression but found \';\'' };
  const warn = { severity: 'warning', file: 'broken.vhd', line: 2, col: 1, message: 'a warning of the file' };
  const mine = { severity: 'warning', file: 'sub.v', line: 1, col: 1, message: 'a warning of the hierarchy' };
  assert.deepEqual(hierarchyDiags([err, warn, mine], lib(srcs), 'top'), [mine,
    { severity: 'warning', file: 'broken.vhd', line: 0, col: 0, tool: 'Silinx', drawn: true, message: 'not in the hierarchy of the top module \'top\': left out, its 1 error not checked (Check Syntax shows them)' }]);
  assert.deepEqual(hierarchyDiags([mine], lib(srcs), 'top'), [mine]);
  assert.equal(leftOutWarning({ path: 'a.vhd', errors: ['1: x', '2: y'] }, 't'), 'a.vhd is not in the hierarchy of the top module \'t\': left out, its 2 errors not checked (Check Syntax shows them)');
  assert.equal(leftOutDiag('a.vhd', 't', 0).message, 'not in the hierarchy of the top module \'t\': left out');
});

// ISE's and Vivado's build folder (server/ise.js generateBuild): the .prj lists the hierarchy's files only
let tmp;
before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'silinx-top-hierarchy-'));
  process.env.SILINX_CONFIG_DIR = path.join(tmp, 'cfg');
});
after(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

test('generateBuild: a broken file outside the top\'s hierarchy not copied nor in the .prj, its warning; one inside is (#4421)', async () => {
  const ise = await import('../server/ise.js');
  const dir = path.join(tmp, 'p');
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  for (const s of [...DESIGN, BROKEN]) await fs.writeFile(path.join(dir, 'src', s.path), s.text);
  const project = { name: 'p', top: 'top', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' },
    files: [...DESIGN, BROKEN].map(s => ({ path: `src/${s.path}`, lang: s.lang, role: 'design' })) };
  const g = await ise.generateBuild(project, dir, { sourcesOnly: true });
  assert.deepEqual([g.sources.map(s => s.path), g.warnings], [['src/top.vhd', 'src/sub.v', 'src/leaf.vhd', 'src/leaf_arch.vhd', 'src/p.vhd'],
    ['src/broken.vhd is not in the hierarchy of the top module \'top\': left out, its 1 error not checked (Check Syntax shows them)']]);
  await assert.rejects(fs.access(path.join(dir, 'build', 'src', 'src', 'broken.vhd')));
  assert.equal(ise.generatePrj(g.sources).includes('broken'), false);
  // the broken file instantiated: kept, no warning
  await fs.writeFile(path.join(dir, 'src', 'top.vhd'), TOP.text.replace('w : entity work.leaf', 'b : entity work.broken port map (a => x, y => open);\n  w : entity work.leaf'));
  const g2 = await ise.generateBuild(project, dir, { sourcesOnly: true });
  assert.deepEqual([g2.sources.map(s => s.path).includes('src/broken.vhd'), g2.warnings], [true, []]);
});
