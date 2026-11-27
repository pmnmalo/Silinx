// A new source's text, one implementation for New Source and the MCP's new_source (#4751, core/new-source-text.js): each
// kind against the generator it calls (an independent reference: the module's own function), a constraints file in the
// device's format or the one asked, an unknown kind refused; New Source's every type that writes a text maps to a kind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sourceText, SOURCE_KINDS } from '../core/new-source-text.js';
import * as T from '../core/templates.js';
import { cTemplate } from '../core/c-templates.js';
import { newDoc } from '../core/schdoc.js';
import { normalizeFsm } from '../core/fsm.js';
import { newTable } from '../core/logic.js';

const pj = { name: 'P', top: 'top', simTop: 'tb_top', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' } };
const ports = [{ name: 'a', dir: 'in' }, { name: 'y', dir: 'out', bus: true, msb: 3, lsb: 0 }];

test('#4751 each kind: the text of its generator', async () => {
  assert.equal(await sourceText('module', { file: 'm', lang: 'vhdl', pj, entity: 'm', arch: 'rtl', ports }), T.vhdlModule('m', 'rtl', ports, pj));
  assert.equal(await sourceText('module', { file: 'm', lang: 'verilog', pj, entity: 'm', ports }), T.vlogModule('m', ports, pj));
  assert.equal(await sourceText('package', { file: 'pkg', pj }), T.vhdlPackage('pkg', pj));
  assert.equal(await sourceText('c', { file: 'my-fn' }), cTemplate('my_fn'));
  assert.equal(await sourceText('schematic', { file: 'sch-1', lang: 'verilog' }), JSON.stringify(newDoc('sch_1', 'verilog'), null, 1));
  assert.equal(await sourceText('fsm', { file: 'ctl' }), JSON.stringify(normalizeFsm({ name: 'ctl', lang: 'vhdl' }), null, 2));
  assert.equal(await sourceText('boolean', { file: 'maj', lang: 'verilog' }), JSON.stringify({ ...newTable('maj', ['a', 'b', 'c'], ['f']), lang: 'verilog' }, null, 2));
  assert.match(await sourceText('mem', {}), /^\/\/ memory initialization file/);
  const lab = JSON.parse(await sourceText('lab', { file: 'lab1', pj }));
  assert.equal(typeof lab, 'object');
  for (const k of SOURCE_KINDS.filter(k => !['module', 'test_bench'].includes(k))) assert.equal(typeof await sourceText(k, { file: 'x', pj }), 'string', k);
});

test('#4751 constraints: the device\'s format, or the one asked (New Source\'s own type)', async () => {
  assert.equal(await sourceText('constraints', { pj }), T.ucfTemplate(pj));
  const ice = { ...pj, device: { family: 'ice40', part: 'ice40up5k', package: 'sg48', speed: '' } };
  assert.equal(await sourceText('constraints', { pj: ice }), T.pcfTemplate(ice));
  assert.equal(await sourceText('constraints', { pj, format: 'xdc' }), T.xdcTemplate(pj));
});

test('#4751 an unknown kind refused', async () => {
  await assert.rejects(sourceText('vhdl'), /no source of kind 'vhdl'/);
});

test('#4751 New Source\'s types that write a text each map to a kind of core/new-source-text.js', () => {
  const src = fs.readFileSync(new URL('../web/js/new-source.js', import.meta.url), 'utf8');
  const map = eval(`(${/const KIND_OF = (\{[\s\S]*?\});/.exec(src)[1]})`);
  const ids = [...src.matchAll(/^\s+\{ id: '([\w-]+)'.*$/gm)].filter(m => !/only: true/.test(m[0])).map(m => m[1]);
  assert.ok(ids.length > 15, ids.join());
  for (const id of ids) assert.ok(SOURCE_KINDS.includes(map[id]), `${id} → ${map[id]}`);
});

test('#5873 a microcontroller\'s program: its sketch, C, C++, assembly or Python file, empty, named', async () => {
  assert.equal(await sourceText('sketch', { file: 'blink' }), '// blink.ino: an Arduino sketch.\n\nvoid setup() {\n}\n\nvoid loop() {\n}\n');
  assert.equal(await sourceText('c_source', { file: 'util' }), '// util.c: a C source of the program.\n');
  assert.equal(await sourceText('cpp_source', { file: 'util' }), '// util.cpp: a C++ source of the program.\n');
  assert.equal(await sourceText('assembly', { file: 'fw' }), '; fw.asm: an AVR assembly program (avra).\nloop:\n    rjmp loop\n');
  assert.equal(await sourceText('python', { file: 'main' }), '# main.py: a Python program (MicroPython or CircuitPython).\n');
});
