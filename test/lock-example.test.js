// The lock example (examples/lock, #5111): a combination lock made of every kind of source Silinx has, at the same time:
// VHDL and Verilog, a schematic, a state diagram, a truth table, a Petri net, an ASM chart, a digital circuit, a C and a
// C++ function (Silinx HLS). Its sources, each drawing's HDL generated from it; the C's and the C++'s test benches (C
// simulation, C/RTL co-simulation in VHDL and in Verilog); the lock's self-checking test bench, with the drawings' HDL
// in VHDL and in Verilog (Check Syntax and the simulation with no warning, the MCP server's as the interface's); a lock
// made wrong fails it. The flows common to every example: test/examples.test.js, test/ise/examples.test.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { example, runTestbench } from './examples-lib.mjs';

const ex = example('lock');
const read = (f) => fs.readFileSync(path.join(ex.dir, f), 'utf8');
let tmp, P, TOOLS;
before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-lock-'));
  process.env.SILINX_WORKSPACE = path.join(tmp, 'ws');
  process.env.SILINX_CONFIG_DIR = path.join(tmp, 'cfg');
  P = await import('../server/projects.js');
  ({ TOOLS } = await import('../server/mcp.js'));
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const tool = (name, args) => TOOLS.find((t) => t.name === name).run(args);

// each kind of source, its file(s)
const KINDS = {
  vhdl: ['src/debounce.vhd', 'src/top.vhd'], verilog: ['src/sevenseg.v'], schematic: ['src/control.sch.json'], fsm: ['src/lock.fsm.json'],
  boolean: ['src/digit_ok.bool.json'], petri: ['src/alarm.pn.json'], asm: ['src/timer.asm.json'], circuit: ['src/sync.circ.json'],
  c: ['src/penalty.c'], cpp: ['src/typed.cpp'],
};

test('#5111 lock: every kind of source; each drawing the base of its HDL file, the C and the C++ of their modules', () => {
  const drawn = Object.values(KINDS).flat().filter((f) => f.endsWith('.json'));
  assert.deepEqual(fs.readdirSync(path.join(ex.dir, 'src')).sort(), [...Object.values(KINDS).flat(), ...drawn.map((f) => f.replace(/\.\w+\.json$/, '.vhd'))].map((f) => f.slice(4)).sort());
  for (const f of drawn) {
    const j = JSON.parse(read(f));
    assert.equal(j.generatedFile, f.replace(/\.\w+\.json$/, '.vhd'), f);
    assert.ok(ex.project.files.some((x) => x.path === j.generatedFile), f);
  }
  assert.deepEqual(ex.project.files.map((f) => f.path), ['src/sync.vhd', 'src/debounce.vhd', 'src/digit_ok.vhd', 'src/lock.vhd', 'src/alarm.vhd', 'src/timer.vhd', 'src/control.vhd', 'src/sevenseg.v', 'src/top.vhd', 'sim/tb_lock.vhd']);
  assert.deepEqual([ex.project.top, ex.project.simTop, ex.project.board, ex.project.constraints], ['top', 'tb_lock', 'basys2', 'constraints/lock.ucf']);
  // the schematic wires the controller's four drawings together
  const sch = JSON.parse(read('src/control.sch.json'));
  assert.deepEqual(sch.symbols.filter((s) => s.type === 'module').map((s) => s.params.module).sort(), ['alarm', 'digit_ok', 'lock', 'timer']);
  // the C and the C++: modules with Vitis HLS's ports, no warning
  for (const [f, ports] of [['src/penalty.c', [['fails', 'in', 2], ['ap_return', 'out', 4]]], ['src/typed.cpp', [['clear', 'in', 1], ['digit', 'in', 4], ['shown', 'out', 16], ['shown_ap_vld', 'out', 1]]]]) {
    for (const lang of ['vhdl', 'verilog']) {
      const r = cToHdl(read(f), { file: f, lang });
      assert.deepEqual(r.diagnostics, [], `${f} ${lang}`);
      assert.deepEqual(r.ports.filter((p) => !/^ap_(clk|rst|start|done|idle|ready)$/.test(p.name)).map((p) => [p.name, p.dir, p.w]), ports, `${f} ${lang}`);
    }
  }
});

test('#5111 lock: the C and the C++ test benches: C simulation PASS, C/RTL co-simulation in VHDL and in Verilog; a wrong one fails', () => {
  const pen = simulateC(read('src/penalty.c'), { file: 'src/penalty.c' });
  assert.deepEqual([pen.ok, pen.exitCode, pen.diagnostics], [true, 0, []]);
  assert.equal(pen.output, '0 failure(s): 0 s\n1 failure(s): 3 s\n2 failure(s): 6 s\n3 failure(s): 9 s\nPASS\n');
  const typ = simulateC(read('src/typed.cpp'), { file: 'src/typed.cpp' });
  assert.deepEqual([typ.ok, typ.exitCode, typ.diagnostics], [true, 0, []]);
  assert.equal(typ.output, 'typed 2: fff2\ntyped 0: ff20\ntyped 2: f202\ntyped 6: 2026\nPASS\n');
  for (const f of ['src/penalty.c', 'src/typed.cpp']) {
    for (const lang of ['vhdl', 'verilog']) {
      const r = cosimulate(read(f), { file: f, lang });
      assert.deepEqual([r.ok, r.pass, r.mismatches, r.errors], [true, true, [], []], `${f} ${lang}`);
    }
  }
  const wrong = simulateC(read('src/penalty.c').replace('{0, 3, 6, 9}', '{0, 3, 5, 9}'), { file: 'src/penalty.c' });
  assert.match(wrong.output, /\nFAIL: 1 wrong result\(s\)\n$/);
});

test('#5111 lock: its test bench passes with no warning; a wrong code or a wrong penalty fails it', async () => {
  const r = await runTestbench('lock');
  assert.equal(r.passed, true, r.log.slice(-5).join('\n'));
  assert.deepEqual(r.warnings, []);
  // the code's last digit 7, not 6 (the truth table's minimal sum: its term of position 3)
  const code = await runTestbench('lock', { edit: { 'src/digit_ok.vhd': read('src/digit_ok.vhd').replace('pos1 and pos0 and not d3 and d2 and d1 and not d0', 'pos1 and pos0 and not d3 and d2 and d1 and d0') } });
  assert.equal(code.passed, false, 'the code 2 0 2 7');
  assert.ok(code.log.some((l) => /ERROR: the code typed: open: the LEDs are /.test(l)), code.log.filter((l) => /ERROR/.test(l)).join('\n'));
  // the lock-out a second short (the timer's last count one sooner)
  const short = await runTestbench('lock', { edit: { 'src/timer.vhd': read('src/timer.vhd').replaceAll('(resize(unsigned(secs), 32) - 1)', '(resize(unsigned(secs), 32) - 2)') } });
  assert.equal(short.passed, false, 'a lock-out one second short');
  assert.ok(short.log.some((l) => /ERROR: the first failure: (unlocked after \d+ clock cycles, 3 s expected|the count down to 2)/.test(l)), short.log.filter((l) => /ERROR/.test(l)).join('\n'));
});

test('#5111 lock: Check Syntax and the simulation with no warning, the drawings\' HDL in VHDL, then in Verilog (the MCP server\'s)', async () => {
  await P.createProject({ name: 'Lock', template: 'lock' });
  const run = async (lang) => {
    for (const simulation of [false, true]) {
      const cs = await tool('check_syntax', { project: 'Lock', simulation });
      assert.match(cs.text, /^Process "Check Syntax" of <(top|tb_lock)> completed successfully \(\d+ signals?, \d+ process(?:es)?\)\.$/, `${lang}: ${cs.text}`);
    }
    const sim = await tool('simulate', { project: 'Lock', time_ns: 100000, signals: [] });
    assert.deepEqual(sim.data.log.filter((l) => /WARNING|ERROR|finished/.test(l.text)).map((l) => l.text), ['Simulation finished OK'], lang);
  };
  await run('vhdl');
  const v = await tool('set_design_properties', { project: 'Lock', preferred_language: 'verilog' });
  assert.match(v.text, /^Preferred Language: Verilog \(6 drawing\(s\) now in it, their HDL made again in it\)\./);
  assert.deepEqual(fs.readdirSync(path.join(P.projectDir('Lock'), 'src')).filter((f) => /\.(v|vhd)$/.test(f)).sort(),
    ['alarm.v', 'control.v', 'debounce.vhd', 'digit_ok.v', 'lock.v', 'sevenseg.v', 'sync.v', 'timer.v', 'top.vhd']);
  await run('verilog');
});
