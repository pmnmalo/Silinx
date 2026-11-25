// A System project's layout (core/system-layout.js, #5488): each node a folder named by its id, its files' paths in it,
// the traversal attempts refused (through a node's id and through a file's name); each node's base language, its
// kind's languages and what mixes in a node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NODE_LANGS, nodeLangs, baseLang, langError, langMixes, sourceLang, relPathError, nodeDir, nodePath, nodeOfPath,
  relInNode, renamedPath, nodeFilesOf, groupByNode, layoutPlan, sourcePlace } from '../core/system-layout.js';
import { NODE_KINDS } from '../core/system-doc.js';

test('#5488 a node\'s folder: its id; a file\'s path in it; ids and names that would leave it refused', () => {
  assert.equal(nodeDir('fpga'), 'fpga');
  assert.equal(nodePath('fpga', 'uart.vhd'), 'fpga/uart.vhd');
  assert.equal(nodePath('uno', 'firmware/hello.hex'), 'uno/firmware/hello.hex');
  // (a node's id an identifier: a traversal, a separator, a dot, an empty one refused)
  for (const id of ['..', '.', '', 'a/b', 'a\\b', '../x', '_x', '1a', 'a.b', 'a b', null, undefined]) {
    assert.throws(() => nodeDir(id), new RegExp(`^Error: '${String(id).replace(/[.\\]/g, '\\$&')}' is not a node's id: a letter, then letters, digits and _$`), String(id));
  }
  // (a file's name: no part that leaves the folder, nothing absolute, no backslash, no NUL)
  const bad = { '': 'an empty path', '..': "'..' escapes its folder", '../x.vhd': "'../x.vhd' escapes its folder", 'a/../../x': "'a/../../x' escapes its folder",
    './x': "'./x' escapes its folder", 'a//b': "'a//b' escapes its folder", 'a/': "'a/' escapes its folder", '/etc/passwd': "'/etc/passwd' is an absolute path",
    'a\\..\\b': "'a\\..\\b' is not a project's path", 'C:x': "'C:x' is not a project's path", 'a\0b': "'a\0b' is not a project's path" };
  for (const [rel, why] of Object.entries(bad)) {
    assert.equal(relPathError(rel), why, JSON.stringify(rel));
    assert.throws(() => nodePath('fpga', rel), { message: why });
  }
  for (const rel of ['a.vhd', 'src/a.vhd', 'a..b.vhd', 'v2.0/a.vhd', '.gitignore']) assert.equal(relPathError(rel), null, rel);
});

test('#5488 a path\'s node: its first folder when a node\'s id (in any case), else none; renamed with its node', () => {
  const ids = ['fpga', 'uno'];
  assert.equal(nodeOfPath('fpga/uart.vhd', ids), 'fpga');
  assert.equal(nodeOfPath('FPGA/uart.vhd', ids), 'fpga');
  assert.equal(nodeOfPath('uno/fw/a.hex', ids), 'uno');
  for (const p of ['lab.sys.json', 'fpga', 'fpga/', 'src/a.vhd', 'fpga/../uno/a.hex', '/fpga/a.vhd', '', null]) assert.equal(nodeOfPath(p, ids), null, String(p));
  assert.equal(relInNode('fpga/src/a.vhd', 'fpga'), 'src/a.vhd');
  assert.equal(relInNode('Fpga/a.vhd', 'fpga'), 'a.vhd');
  for (const p of ['fpga2/a.vhd', 'uno/a.hex', 'fpga/../x', 'fpga']) assert.equal(relInNode(p, 'fpga'), null, p);
  assert.equal(renamedPath('fpga/a.vhd', 'fpga', 'top'), 'top/a.vhd');
  assert.equal(renamedPath('fpga2/a.vhd', 'fpga', 'top'), 'fpga2/a.vhd');
  assert.equal(renamedPath('lab.sys.json', 'fpga', 'top'), 'lab.sys.json');
  const files = ['lab.sys.json', 'fpga/uart.vhd', 'fpga/tb/uart_tb.vhd', 'uno/hello.hex', 'notes/a.txt', 'fpga2/x.vhd'];
  assert.deepEqual(nodeFilesOf(files, 'fpga'), ['fpga/uart.vhd', 'fpga/tb/uart_tb.vhd']);
  assert.deepEqual(groupByNode(files, ids), { root: ['lab.sys.json', 'notes/a.txt', 'fpga2/x.vhd'], nodes: { fpga: ['fpga/uart.vhd', 'fpga/tb/uart_tb.vhd'], uno: ['uno/hello.hex'] } });
  assert.deepEqual(groupByNode([], []), { root: [], nodes: {} });
});

test('#5488 a node\'s base language: its kind\'s, its own kept, the project\'s preferred HDL as the default; refused when not its kind\'s', () => {
  assert.deepEqual(Object.keys(NODE_LANGS).sort(), [...NODE_KINDS].sort(), 'every node kind has its list');
  assert.deepEqual(nodeLangs('fpga'), ['vhdl', 'verilog']);
  assert.deepEqual(nodeLangs('mcu'), ['c', 'cpp', 'micropython']);
  assert.deepEqual([nodeLangs('terminal'), nodeLangs('circuit'), nodeLangs('nope')], [[], [], []]);
  assert.equal(baseLang({ kind: 'fpga' }), 'vhdl');
  assert.equal(baseLang({ kind: 'fpga' }, 'verilog'), 'verilog');
  assert.equal(baseLang({ kind: 'fpga', lang: 'vhdl' }, 'verilog'), 'vhdl', 'its own first');
  assert.equal(baseLang({ kind: 'fpga', lang: 'c' }), 'vhdl', 'one not its kind\'s: the default');
  assert.equal(baseLang({ kind: 'mcu' }, 'verilog'), 'c', 'an HDL preferred is no microcontroller\'s');
  assert.equal(baseLang({ kind: 'mcu', lang: 'micropython' }), 'micropython');
  assert.equal(baseLang({ kind: 'terminal' }), null);
  assert.equal(baseLang(null), null);
  assert.equal(langError('fpga', 'verilog'), null);
  assert.equal(langError('fpga', 'cpp'), "'cpp' is not an FPGA node's base language: vhdl, verilog");
  assert.equal(langError('mcu', 'vhdl'), "'vhdl' is not a microcontroller node's base language: c, cpp, micropython");
  assert.equal(langError('terminal', 'c'), 'a terminal node has no base language');
  assert.equal(langError('circuit', 'c'), 'a circuit node has no base language');
});

test('#5488 languages mix in a node only where the toolchain joins them; a source\'s language by its name', () => {
  assert.equal(langMixes('vhdl', 'verilog'), true);
  assert.equal(langMixes('verilog', 'vhdl'), true);
  assert.equal(langMixes('c', 'asm'), true);
  assert.equal(langMixes('c', 'cpp'), true);
  assert.equal(langMixes('cpp', 'c'), true);
  assert.equal(langMixes('c', 'micropython'), false);
  assert.equal(langMixes('micropython', 'c'), false);
  assert.equal(langMixes('vhdl', 'c'), false);
  assert.equal(langMixes('c', 'vhdl'), false);
  assert.equal(langMixes(null, 'c'), false);
  const by = { 'a.vhd': 'vhdl', 'a.VHDL': 'vhdl', 'a.v': 'verilog', 'a.sv': 'verilog', 'a.c': 'c', 'a.h': 'c', 'a.cpp': 'cpp', 'a.ino': 'cpp',
    'a.hpp': 'cpp', 'a.asm': 'asm', 'a.S': 'asm', 'main.py': 'micropython', 'a.hex': null, 'a.sch.json': null, 'a.ucf': null };
  for (const [p, l] of Object.entries(by)) assert.equal(sourceLang(p), l, p);
});

test('#5488 a System saved: its nodes\' folders renamed with them (a chain of renames one), a removed node\'s said; a rename undone or reused nothing', () => {
  const sys = (...ids) => ({ nodes: ids.map(id => ({ id })) });
  assert.deepEqual(layoutPlan(sys('fpga', 'uno'), sys('fpga', 'uno')), { renames: [], removed: [] });
  assert.deepEqual(layoutPlan(sys('fpga', 'uno'), sys('top', 'uno'), [{ from: 'fpga', to: 'top' }]), { renames: [{ from: 'fpga', to: 'top' }], removed: [] });
  assert.deepEqual(layoutPlan(sys('fpga'), sys('c'), [{ from: 'fpga', to: 'b' }, { from: 'b', to: 'c' }]), { renames: [{ from: 'fpga', to: 'c' }], removed: [] });
  // (undone: back to its name, or the editor's undo leaving the old id)
  assert.deepEqual(layoutPlan(sys('fpga'), sys('fpga'), [{ from: 'fpga', to: 'b' }, { from: 'b', to: 'fpga' }]), { renames: [], removed: [] });
  assert.deepEqual(layoutPlan(sys('fpga'), sys('fpga'), [{ from: 'fpga', to: 'b' }]), { renames: [], removed: [] });
  // (its old id a new node's: no rename, the renamed one a new folder)
  assert.deepEqual(layoutPlan(sys('fpga'), sys('fpga', 'b'), [{ from: 'fpga', to: 'b' }]), { renames: [], removed: [] });
  // (a case changed: renamed)
  assert.deepEqual(layoutPlan(sys('fpga'), sys('FPGA'), [{ from: 'fpga', to: 'FPGA' }]), { renames: [{ from: 'fpga', to: 'FPGA' }], removed: [] });
  assert.deepEqual(layoutPlan(sys('fpga', 'uno', 'term'), sys('fpga2'), [{ from: 'fpga', to: 'fpga2' }]), { renames: [{ from: 'fpga', to: 'fpga2' }], removed: ['uno', 'term'] });
  assert.deepEqual(layoutPlan(sys(), sys('fpga')), { renames: [], removed: [] });
  assert.deepEqual(layoutPlan(null, null), { renames: [], removed: [] });
});

test('#5488 a new source\'s place: the node\'s folder (its sub-folder), else the first FPGA node\'s; the node\'s base language', () => {
  const sys = { nodes: [{ id: 'uno', kind: 'mcu', lang: 'cpp' }, { id: 'term', kind: 'terminal' }, { id: 'pl', kind: 'fpga', lang: 'verilog' }, { id: 'f2', kind: 'fpga' }] };
  assert.deepEqual(sourcePlace(sys), { node: 'pl', location: 'pl', lang: 'verilog' });
  assert.deepEqual(sourcePlace(sys, { id: 'f2', preferred: 'verilog' }), { node: 'f2', location: 'f2', lang: 'verilog' });
  assert.deepEqual(sourcePlace(sys, { id: 'f2' }), { node: 'f2', location: 'f2', lang: 'vhdl' });
  assert.deepEqual(sourcePlace(sys, { id: 'uno' }), { node: 'uno', location: 'uno', lang: 'cpp' });
  assert.deepEqual(sourcePlace(sys, { id: 'pl', dir: 'sim' }), { node: 'pl', location: 'pl/sim', lang: 'verilog' });
  assert.deepEqual(sourcePlace(sys, { id: 'pl', dir: 'constraints' }), { node: 'pl', location: 'pl/constraints', lang: 'verilog' });
  assert.deepEqual(sourcePlace(sys, { id: 'pl', dir: 'labs' }), { node: 'pl', location: 'labs', lang: 'verilog' });
  // (a terminal or an unknown node: the first FPGA node's)
  assert.deepEqual(sourcePlace(sys, { id: 'term' }).node, 'pl');
  assert.deepEqual(sourcePlace(sys, { id: 'nope' }).node, 'pl');
  assert.equal(sourcePlace({ nodes: [{ id: 'uno', kind: 'mcu' }, { id: 't', kind: 'terminal' }] }), null);
  assert.equal(sourcePlace({ nodes: [{ id: 'd', kind: 'design' }] }).location, 'd');
  assert.equal(sourcePlace(null), null);
});
