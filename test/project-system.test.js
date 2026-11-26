// Any project's System (#5416's phase 3, core/project-system.js), read only, on the repository's whole corpus: every
// project with a silinx.json (the examples, the test designs, the exercises, the test fixtures), the ISE projects (.xise)
// imported, the old kind id. Each one's System derived: a System project's its System document as it reads, any other's
// implicit (one node, its board, variant, device, top module and constraints as silinx.json says them, no link); its check
// the expected one; nothing written (every file's bytes the same before and after).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { projectSystem } from '../core/project-system.js';
import { checkSystem } from '../core/system-check.js';
import { resolveBoard } from '../core/devices.js';
import { importXise } from '../core/xise.js';
import { readSystem } from '../core/system-doc.js';
import { constraintsPaths } from '../core/system-constraints.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const DESCRIPTIONS = execFileSync('git', ['ls-files', '*silinx.json'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
const XISE = execFileSync('git', ['ls-files', '*.xise'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');

// a path as the stores give it, `/` between its folders: readdirSync's are the system's (`\\` on Windows, #5685)
const storePath = (f, sep = path.sep) => String(f).split(sep).join('/');
const filesOf = dir => fs.readdirSync(dir, { recursive: true }).map(f => storePath(f)).filter(f => fs.statSync(path.join(dir, f)).isFile()).sort();
// a project read as the stores give it to projectSystem: its silinx.json, its files, its System documents' texts
function project(rel) {
  const dir = path.join(ROOT, path.dirname(rel));
  const pj = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const files = filesOf(dir);
  const texts = Object.fromEntries(files.filter(f => f.endsWith('.sys.json')).map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
  return { dir, pj, files, texts };
}
// every file of the corpus's folders, its bytes' digest
const snapshot = dirs => Object.fromEntries(dirs.flatMap(d => filesOf(d).map(f => [path.join(d, f), crypto.createHash('sha256').update(fs.readFileSync(path.join(d, f))).digest('hex')])));
const said = d => `${d.severity}: ${d.message}`;

// what the check says of an implicit FPGA node, from its silinx.json alone (an independent reading of its rules)
function expectedFpga(pj) {
  const out = [];
  if (!pj.top) out.push('error: fpga: an FPGA node with no module');
  if (!pj.board) out.push('error: fpga: an FPGA node with no board');
  else if (!resolveBoard(pj.board, { part: pj.device?.part })) out.push(`error: fpga: no FPGA board '${pj.board}'`);
  return [...out, 'warning: fpga joins nothing: no link reaches it'];
}

test('#5685 the corpus\'s files as the stores give them: a Windows path\'s folders joined by /, as the constraints\' paths are', () => {
  assert.equal(storePath('fpga\\uart.ucf', '\\'), 'fpga/uart.ucf');
  assert.equal(storePath('a\\b\\c.vhd', '\\'), 'a/b/c.vhd');
  assert.equal(storePath('fpga/uart.ucf', '/'), 'fpga/uart.ucf');
  // (a System's FPGA node's constraints file found among them on any system)
  const files = ['uart_avr.sys.json', 'fpga\\uart.ucf', 'uno\\hello.hex'].map(f => storePath(f, '\\'));
  const model = readSystem(fs.readFileSync(path.join(ROOT, 'examples/uart-avr/uart_avr.sys.json'), 'utf8')).system;
  assert.deepEqual(constraintsPaths(model).filter(f => files.includes(f)), ['fpga/uart.ucf']);
});

test('#5416 phase 3: the corpus has its kinds of projects', () => {
  assert.ok(DESCRIPTIONS.length >= 80, String(DESCRIPTIONS.length));
  for (const top of ['examples/', 'test-designs/', 'test/fixtures/', 'exercises/']) assert.ok(DESCRIPTIONS.some(f => f.startsWith(top)), top);
  assert.equal(XISE.length, 3);
});

test('#5416 phase 3: every project of the corpus its System; one node as silinx.json says; its check; nothing written', () => {
  const dirs = [...new Set(DESCRIPTIONS.map(f => path.join(ROOT, path.dirname(f))))];
  const before = snapshot(dirs);
  let implicit = 0, systems = 0;
  for (const rel of DESCRIPTIONS) {
    const { pj, files, texts } = project(rel);
    const r = projectSystem(pj, { files, texts });
    assert.equal(r.error, null, rel);
    assert.equal(r.model.format, 'silinx-system', rel);
    if (r.implicit) {
      implicit++;
      assert.equal(r.system, null, rel);
      assert.deepEqual(r.model.links, [], rel);
      assert.equal(r.model.nodes.length, 1, rel);
      const [n] = r.model.nodes;
      // (every board of the corpus is one of the board lists': its variant from the device, never in its id, #5439)
      if (pj.board) assert.ok(resolveBoard(pj.board, { part: pj.device?.part }), `${rel}: no FPGA board '${pj.board}'`);
      assert.deepEqual([n.id, n.kind, n.implicit, n.module, n.board, n.device, n.constraints],
        ['fpga', 'fpga', true, pj.top || null, pj.board ?? null, pj.device ?? null, pj.constraints ?? null], rel);
      const variant = pj.board ? resolveBoard(pj.board, { part: pj.device?.part })?.variant?.id ?? null : null;
      assert.equal(n.variant ?? null, variant == null ? null : String(variant), rel);
      assert.deepEqual(checkSystem(r.model).map(said), expectedFpga(pj), rel);
    } else {
      systems++;
      // (a System project: its System document as it reads; its check's warnings the 5 V outputs on 3.3 V inputs, no error)
      assert.deepEqual(r.model, readSystem(texts[r.system]).system, rel);
      // (its FPGA nodes' pins their constraints files', #5581)
      const constraints = Object.fromEntries(constraintsPaths(r.model).filter(f => files.includes(f)).map(f => [f, fs.readFileSync(path.join(ROOT, path.dirname(rel), f), 'utf8')]));
      assert.deepEqual(Object.keys(constraints).length, r.model.nodes.filter(n => n.kind === 'fpga').length, rel);
      const d = checkSystem(r.model, { constraints });
      assert.deepEqual(d.filter(x => x.severity === 'error'), [], rel);
      assert.ok(d.every(x => /a 5 V output, drives .* a 3\.3 V input of the FPGA \(LVCMOS33\): a level shifter or a divider on the real boards$/.test(x.message)), rel);
    }
  }
  assert.equal(systems, 6);   // (the System examples: uart-avr, spi-avr, i2c-avr, regs-avr, uart-pic24, uart-pico)
  assert.equal(implicit, DESCRIPTIONS.length - 6);
  assert.deepEqual(snapshot(dirs), before);
});

test('#5416 phase 3: an ISE project imported (.xise): its System implicit, its device, top and constraints', () => {
  const before = snapshot([path.join(ROOT, 'test/fixtures/ise-xise')]);
  for (const rel of XISE) {
    const x = importXise(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    const pj = { name: path.basename(rel, '.xise'), ...x };
    const r = projectSystem(pj);
    assert.equal(r.implicit, true, rel);
    const [n] = r.model.nodes;
    assert.deepEqual([n.kind, n.module, n.board, n.device, n.constraints], ['fpga', x.top || null, null, x.device, x.constraints ?? null], rel);
    assert.deepEqual(checkSystem(r.model).map(said), expectedFpga(pj), rel);
  }
  assert.deepEqual(snapshot([path.join(ROOT, 'test/fixtures/ise-xise')]), before);
});

test('#5416 phase 3: a design and simulation project; the old kind id, a profile, a module as the top; a System project with no or a damaged document', () => {
  const d = projectSystem({ name: 'dl', kind: 'design', top: 'adder', board: 'basys2' });
  assert.deepEqual(d.model.nodes, [{ id: 'design', kind: 'design', module: 'adder', board: null, device: null, constraints: null, lang: 'vhdl', pins: {}, interfaces: [], x: 0, y: 0, implicit: true }]);
  // (a design node a node kind of a System document since #5440, the Digital Logic profile's: alone, it joins nothing)
  assert.deepEqual(checkSystem(d.model).map(said), ['warning: design joins nothing: no link reaches it']);
  // the old kind id of #5411: no System project's since #5440 (an FPGA project's implicit System); the profile's
  const { pj, files, texts } = project('examples/uart-avr/silinx.json');
  assert.equal(projectSystem({ ...pj, kind: 'codesign' }, { files, texts }).implicit, true);
  assert.deepEqual(projectSystem({ ...pj, kind: undefined, profile: 'embedded' }, { files, texts }), projectSystem({ ...pj, kind: 'system' }, { files, texts }));
  // (a System project with a module as its top: its System implicit, the System document no longer its top, #5440)
  assert.equal(projectSystem({ ...pj, top: 'uart' }, { files, texts }).implicit, true);
  assert.deepEqual(projectSystem({ name: 's', kind: 'system' }, { files: ['src/a.vhd'] }), { model: null, implicit: false, system: null, error: null });
  assert.match(projectSystem({ name: 's', kind: 'system' }, { files: ['s.sys.json'], texts: { 's.sys.json': '{' } }).error, /^not a System document/);
  // (a board's variant for the device, against the boards' own lists: the Basys2-250 and -100, the Nexys2-1200; none for the Nexys3)
  const v = (board, part) => projectSystem({ name: 'v', board, device: { part } }).model.nodes[0].variant ?? null;
  assert.deepEqual([v('basys2', 'xc3s250e'), v('basys2', 'xc3s100e'), v('nexys2', 'xc3s1200e'), v('nexys3', 'xc6slx16'), v('nope', 'xc3s250e')], ['250', '100', '1200', null, null]);
  // (no description at all: an FPGA project's, empty)
  assert.deepEqual(projectSystem(null).model.nodes.map(n => [n.kind, n.module, n.board]), [['fpga', null, null]]);
});
