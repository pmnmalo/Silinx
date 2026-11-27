// The processing system of a Zynq board's FPGA node (#4686, part 2; core/zynq-ps.js): its program (`ps`, a .c of its
// folder's ps/; a Board project's at the root), its checks, its starter program (the UART's registers and baud from the
// board's PS, compiled by the host's C compiler where there is one), its description, the edits that set it, the PL's
// build without it, a Board project's implicit node with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { psOfBoard, psProgramPath, psProgramError, psProblems, psSummary, psStarter, psWrites, isPsPath } from '../core/zynq-ps.js';
import { normalizeSystem } from '../core/system-doc.js';
import { changeNode, describeSystem } from '../core/system-edit.js';
import { analyzeSystem } from '../core/system-check.js';
import { fpgaSources } from '../core/system-plan.js';
import { nodeProject } from '../core/system-node.js';
import { projectSystem } from '../core/project-system.js';

const zybo = { id: 'zybo', kind: 'fpga', module: 'top', board: 'zybo-z7', variant: '20', interfaces: [], x: 0, y: 0 };
const sys = (...nodes) => normalizeSystem({ format: 'silinx-system', version: 2, name: 's', nodes, links: [] });

test('#4686 a board\'s PS: the Zybo Z7\'s and the Arty Z7\'s, none on the Basys 3 nor with no board; the program\'s place', () => {
  assert.equal(psOfBoard('zybo-z7', '10').uart.id, 1);
  assert.equal(psOfBoard('arty-z7').uart.id, 0);
  assert.deepEqual([psOfBoard('basys3'), psOfBoard(null), psOfBoard('no-such-board')], [null, null, null]);
  assert.deepEqual([psProgramPath('zybo'), psProgramPath(null)], ['zybo/ps/main.c', 'ps/main.c']);
  assert.deepEqual(['ps/main.c', 'PS/x.c', 'src/ps/main.c', 'psx/main.c'].map(isPsPath), [true, true, false, false]);
  assert.deepEqual([psProgramError('zybo/ps/main.c', 'zybo'), psProgramError('ps/blink.c', null)], [null, null]);
  assert.deepEqual([psProgramError('zybo/src/main.c', 'zybo'), psProgramError('other/ps/main.c', 'zybo'), psProgramError('zybo/ps/main.cpp', 'zybo'), psProgramError('../ps/main.c', null)], [
    'its PS\'s program zybo/src/main.c is not in zybo/ps/', 'its PS\'s program other/ps/main.c is not in zybo/ps/',
    'its PS\'s program zybo/ps/main.cpp is not a .c (C)', 'its PS\'s program ../ps/main.c is not in ps/']);
});

test('#4686 a node\'s PS checked: its board\'s PS, its program\'s place, its program in the project; none with no `ps`', () => {
  assert.deepEqual(psProblems({ ...zybo }), []);
  assert.deepEqual(psProblems({ ...zybo, ps: 'zybo/ps/main.c' }, ['zybo/ps/main.c']), []);
  assert.deepEqual(psProblems({ ...zybo, ps: 'zybo/ps/main.c' }, null), []);   // (files not known: not checked)
  assert.deepEqual(psProblems({ ...zybo, ps: 'zybo/ps/main.c' }, []), ['zybo: no PS\'s program zybo/ps/main.c in the project']);
  assert.deepEqual(psProblems({ ...zybo, board: 'basys3', ps: 'zybo/ps/main.c' }, ['zybo/ps/main.c']), ['zybo: the board basys3 has no processing system (its PS\'s program zybo/ps/main.c)']);
  assert.deepEqual(psProblems({ ...zybo, ps: 'zybo/main.c' }, ['zybo/main.c']), ['zybo: its PS\'s program zybo/main.c is not in zybo/ps/']);
  // (a Board project's implicit node: its program at the root)
  assert.deepEqual(psProblems({ ...zybo, id: 'fpga', implicit: true, ps: 'ps/main.c' }, ['ps/main.c']), []);
});

test('#4686 the PS described: its program, the Cortex-A9\'s clock, its UART\'s MIO pins, FCLK0; in the System\'s description', () => {
  assert.equal(psSummary({ ...zybo, ps: 'zybo/ps/main.c' }), 'its PS\'s program zybo/ps/main.c: the Cortex-A9 at 666.7 MHz, UART1 on MIO 48 (TX) and 49 (RX), FCLK0 50 MHz');
  assert.equal(psSummary({ ...zybo, board: 'arty-z7', ps: 'zybo/ps/main.c' }), 'its PS\'s program zybo/ps/main.c: the Cortex-A9 at 650 MHz, UART0 on MIO 15 (TX) and 14 (RX), FCLK0 100 MHz');
  assert.equal(psSummary({ ...zybo }), null);
  assert.equal(describeSystem(sys({ ...zybo, ps: 'zybo/ps/main.c' }))[1],
    'node zybo: FPGA, module top on zybo-z7-20, in VHDL; its PS\'s program zybo/ps/main.c: the Cortex-A9 at 666.7 MHz, UART1 on MIO 48 (TX) and 49 (RX), FCLK0 50 MHz');
});

test('#4686 the starter program: the board\'s UART at 115200 baud from its 100 MHz clock (124 x 7), the Zybo Z7\'s LD4 blinking; C the host compiles', () => {
  const z = psStarter(psOfBoard('zybo-z7'), 'Digilent Zybo Z7'), a = psStarter(psOfBoard('arty-z7'), 'Digilent Arty Z7');
  for (const line of ['#define UART_CR    REG(0xE0001000)', '#define UART_BRGR  REG(0xE0001018)', '#define UART_BDIV  REG(0xE0001034)', '  UART_BRGR = 124;', '  UART_BDIV = 6;',
    '#define LED_BIT     (1u << 7)', '  uart_puts("Hello from the Cortex-A9 of Digilent Zybo Z7\\n");', '    GPIO_DATA_0 ^= LED_BIT;']) assert.ok(z.split('\n').some((l) => l.startsWith(line)), line);
  assert.ok(a.includes('#define UART_CR    REG(0xE0000000)') && !a.includes('LED_BIT') && a.includes('  for (;;) { }'));
  // (compiled where the host has a C compiler: no warning)
  let cc = null;
  for (const c of ['cc', 'gcc', 'clang']) { try { execFileSync(c, ['--version'], { stdio: 'ignore' }); cc = c; break; } catch { /* none */ } }
  if (!cc) return;
  for (const text of [z, a]) assert.equal(execFileSync(cc, ['-fsyntax-only', '-std=c11', '-Wall', '-Wextra', '-x', 'c', '-'], { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }), '');
});

test('#4686 the starter programs a System needs: a Zynq node\'s program the project has not; none for one it has, another board\'s, a program out of ps/', () => {
  const s = sys({ ...zybo, ps: 'zybo/ps/main.c' }, { ...zybo, id: 'arty', board: 'arty-z7', ps: 'arty/ps/app.c' }, { ...zybo, id: 'b3', board: 'basys3', ps: 'b3/ps/main.c' }, { ...zybo, id: 'bad', ps: 'bad/main.c' });
  const w = psWrites(s, ['arty/ps/app.c']);
  assert.deepEqual(w.map((x) => x.path), ['zybo/ps/main.c']);
  assert.match(w[0].text, /Hello from the Cortex-A9 of Digilent Zybo Z7/);
  assert.deepEqual(psWrites(s, ['zybo/ps/main.c', 'arty/ps/app.c']), []);
});

test('#4686 the PS\'s program set and removed by an edit: on a Zynq board, in its ps/, a .c; renamed with its node; refused elsewhere', () => {
  const s = sys({ ...zybo }, { ...zybo, id: 'b3', board: 'basys3' });
  const r = changeNode(s, 'zybo', { ps: 'zybo/ps/main.c' });
  assert.equal(r.error, undefined);
  assert.equal(r.system.nodes[0].ps, 'zybo/ps/main.c');
  // (kept by the document, renamed with its node, removed by null)
  assert.equal(normalizeSystem(r.system).nodes[0].ps, 'zybo/ps/main.c');
  assert.equal(changeNode(r.system, 'zybo', { id: 'z7' }).system.nodes[0].ps, 'z7/ps/main.c');
  assert.equal('ps' in changeNode(r.system, 'zybo', { ps: null }).system.nodes[0], false);
  assert.deepEqual([changeNode(s, 'b3', { ps: 'b3/ps/main.c' }), changeNode(s, 'zybo', { ps: 'zybo/main.c' }), changeNode(s, 'zybo', { ps: 'zybo/ps/main.s' })].map((x) => x.error), [
    'b3: the board basys3 has no processing system', 'zybo: its PS\'s program zybo/main.c is not in zybo/ps/', 'zybo: its PS\'s program zybo/ps/main.s is not a .c (C)']);
});

test('#4686 the System\'s check says a PS\'s problem; the PL\'s build leaves the PS\'s program out', () => {
  const s = sys({ ...zybo, ps: 'zybo/ps/main.c' });
  const errors = (files) => analyzeSystem(s, { modules: { top: [] }, files }).diags.filter((d) => d.severity === 'error' && /PS/.test(d.message)).map((d) => d.message);
  assert.deepEqual(errors(['zybo/top.vhd', 'zybo/ps/main.c']), []);
  assert.deepEqual(errors(['zybo/top.vhd']), ['zybo: no PS\'s program zybo/ps/main.c in the project']);
  assert.deepEqual(fpgaSources(['zybo/top.vhd', 'zybo/ps/main.c', 'zybo/ps/util.h', 'zybo/sim/tb.vhd', 'zybo/top.xdc'], 'zybo'), ['zybo/top.vhd', 'zybo/top.xdc']);
  const pj = { name: 'p', files: ['zybo/top.vhd', 'zybo/ps/main.c', 'zybo/zybo.xdc'].map((path) => ({ path })) };
  assert.deepEqual(nodeProject(pj, { ...zybo }, 'zybo/zybo.xdc').files.map((f) => f.path), ['zybo/top.vhd', 'zybo/zybo.xdc']);
});

test('#4686 a Board project on a Zynq board: its implicit node\'s PS program its silinx.json\'s `ps`, at the root; none when it has none', () => {
  const pj = { name: 'p', board: 'zybo-z7', device: { family: 'zynq', part: 'xc7z020', package: 'clg400', speed: '-1' }, top: 'top', constraints: 'top.xdc' };
  assert.equal(projectSystem({ ...pj, ps: 'ps/main.c' }).model.nodes[0].ps, 'ps/main.c');
  assert.equal('ps' in projectSystem(pj).model.nodes[0], false);
  assert.deepEqual(psProblems(projectSystem({ ...pj, ps: 'ps/main.c' }).model.nodes[0], ['ps/main.c']), []);
});
