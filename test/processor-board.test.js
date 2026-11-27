// A Board project for a processor board alone (#5756, roadmap #5753: core/processor-board.js): for each processor board its
// silinx.json (a System of its one node with its board named: Board mode), its System document and its starter files; the
// AVR starter's .hex its .asm assembled, run on the AVR node: its LED L (D13) toggled every ~4 million cycles; its mode
// changes: up to System (its board's name dropped, nothing moved), a System down to its Arduino node (its System rewritten
// with it alone), down to Circuit refused, a processor board refused to a Circuit project.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processorProject, processorProjectText, processorBoardOf, AVR_BLINK_HEX, PROCESSOR_BOARDS } from '../core/processor-board.js';
import { modeOf } from '../core/project-mode.js';
import { modeChange } from '../core/mode-change.js';
import { readSystem } from '../core/system-doc.js';
import { projectNodes } from '../core/project-nodes.js';
import { newProjectJson } from '../core/project-defaults.js';
import { setBuildChannel } from '../core/build-channel.js';
import { AvrNode, loadAvr8js, CYCLE_PS } from '../core/system-sim-avr.js';
import { avrAssemble, intelHex } from './avr-asm.mjs';

setBuildChannel('dev');
after(() => setBuildChannel('dev'));
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fresh = name => newProjectJson(name);

test('#5756 each processor board\'s project: a System of its one node, its board named, Board mode; its starter', () => {
  const made = PROCESSOR_BOARDS.map(b => {
    const r = processorProject(fresh('p'), b.id);
    assert.equal(r.error, undefined, b.id);
    const sys = readSystem(r.writes[0].text).system;
    return [b.id, modeOf(r.project), processorBoardOf(r.project), r.node, r.firmware, r.writes.map(w => w.path), sys.nodes.map(n => [n.id, n.kind, n.board, n.firmware]), sys.links.length];
  });
  assert.deepEqual(made, [
    ['arduino-uno', 'board', 'arduino-uno', 'uno', 'uno/blink.hex', ['p.sys.json', 'uno/blink.asm', 'uno/blink.hex'], [['uno', 'mcu', 'arduino-uno', 'uno/blink.hex']], 0],
    ['arduino-nano', 'board', 'arduino-nano', 'nano', 'nano/blink.hex', ['p.sys.json', 'nano/blink.asm', 'nano/blink.hex'], [['nano', 'mcu', 'arduino-nano', 'nano/blink.hex']], 0],
    ['explorer-1632', 'board', 'explorer-1632', 'pic', null, ['p.sys.json'], [['pic', 'mcu', 'explorer-1632', null]], 0],
    ['pico', 'board', 'pico', 'pico', 'pico/main.py', ['p.sys.json', 'pico/main.py'], [['pico', 'mcu', 'pico', 'pico/main.py']], 0],
    ['pico-w', 'board', 'pico-w', 'picow', 'picow/main.py', ['p.sys.json', 'picow/main.py'], [['picow', 'mcu', 'pico-w', 'picow/main.py']], 0],
    ['esp32-devkitc', 'board', 'esp32-devkitc', 'esp32', 'esp32/main.py', ['p.sys.json', 'esp32/main.py'], [['esp32', 'mcu', 'esp32-devkitc', 'esp32/main.py']], 0],
  ]);
  // (a Pico under CircuitPython: its code.py; the runtime written on its node)
  const cp = processorProject(fresh('p'), 'pico', { runtime: 'circuitpython' });
  assert.deepEqual([cp.firmware, readSystem(cp.writes[0].text).system.nodes[0].runtime], ['pico/code.py', 'circuitpython']);
  assert.match(cp.writes[1].text, /digitalio\.DigitalInOut\(board\.LED\)/);
  // (its silinx.json: Embedded / SoC's profile, its System its top, no constraints)
  const r = processorProject(fresh('p'), 'pico');
  assert.deepEqual([r.project.profile, r.project.top, 'topSourceType' in r.project, r.project.constraints, r.project.kind], ['embedded', '', false, null, undefined]);
  // (its nodes, as the Design pane and project_info read them)
  assert.deepEqual(projectNodes(r.project, { files: ['p.sys.json', 'pico/main.py'], texts: { 'p.sys.json': r.writes[0].text } }).nodes.map(n => [n.id, n.kind, n.files]), [['pico', 'mcu', ['pico/main.py']]]);
  // (refused: no such board, an FPGA board, another board's runtime)
  assert.deepEqual(processorProject(fresh('p'), 'basys2'), { error: 'no processor board \'basys2\' (the processor boards: arduino-uno, arduino-nano, explorer-1632, pico, pico-w, esp32-devkitc)' });
  assert.deepEqual(processorProject(fresh('p'), 'arduino-uno', { runtime: 'circuitpython' }), { error: 'the Arduino Uno has no Python firmware to choose' });
  assert.equal(processorProjectText('p', 'pico', 'pico/main.py'), 'Board project \'p\' made for the Raspberry Pi Pico: its firmware pico/main.py, which blinks its LED.');
  assert.equal(processorProjectText('p', 'explorer-1632', null), 'Board project \'p\' made for the Explorer 16/32: no firmware yet: put its .hex (MPLAB X\'s) in its folder pic/ and make it the node\'s firmware (its row ▸ Open, or the MCP\'s edit_system).');
});

test('#5756 the AVR starter: its .hex its .asm assembled; run, its LED L (D13) toggled every 21 x 256 x 256 x 3 cycles or so', async () => {
  const r = processorProject(fresh('p'), 'arduino-uno');
  const asm = r.writes.find(w => w.path.endsWith('.asm')).text;
  const lines = asm.split('\n').map(l => l.replace(/;.*/, '').trim()).filter(Boolean);
  assert.equal(intelHex(avrAssemble(lines)), AVR_BLINK_HEX);
  await loadAvr8js();
  const node = new AvrNode({ firmware: { name: 'uno/blink.hex', data: AVR_BLINK_HEX } });
  const d13 = node.advanceTo(1e12 * 0.6).filter(c => c.pin === 'D13');   // (0.6 s)
  const highs = d13.filter(c => c.value === 1).map(c => c.t), lows = d13.filter(c => c.value === 0).map(c => c.t);
  assert.ok(highs.length >= 2 && lows.length >= 2, JSON.stringify(d13.slice(0, 6)));
  // (a period of ~2 × 4.1 million cycles: 2 × 21 × (256 × (256 × 3 + 3) + 3) + its loop's)
  const half = (lows.find(t => t > highs[0]) - highs[0]) / CYCLE_PS;
  assert.ok(half > 4.0e6 && half < 4.3e6, String(half));
});

test('#5756 a processor board\'s mode changes: up to System, a System down to its Arduino, down to Circuit refused', () => {
  const r = processorProject(fresh('p'), 'pico');
  const files = r.writes.map(w => w.path), texts = { 'p.sys.json': r.writes[0].text };
  const up = modeChange(r.project, 'system', { files, texts });
  assert.deepEqual([modeOf(up.project), up.project.board, up.moves, up.write, up.lost, up.done], ['system', null, [], null, [], ['its board the System\'s first node, pico (pico), its files in its folder already']]);
  assert.deepEqual(modeChange(r.project, 'circuit', { files, texts }), { error: 'the project \'p\' is a processor board\'s (Raspberry Pi Pico): its firmware is no drawing, so it cannot be a Circuit project' });
  // (a Circuit project given a processor board: refused)
  assert.deepEqual(modeChange({ name: 'c', kind: 'design' }, 'board', { board: 'pico' }), { error: 'pico is a processor board: a Circuit project\'s drawings go to an FPGA board (a processor board\'s project: New Project ▸ Board)' });
  // (the uart-avr System kept to its Arduino: its System its node alone, rewritten; the FPGA node said lost)
  const dir = path.join(ROOT, 'examples', 'uart-avr');
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
  const sysText = fs.readFileSync(path.join(dir, 'uart_avr.sys.json'), 'utf8');
  const down = modeChange(pj, 'board', { files: ['uart_avr.sys.json', 'uno/hello.hex', 'fpga/uart.vhd'], texts: { 'uart_avr.sys.json': sysText }, keep: 'uno' });
  assert.deepEqual([modeOf(down.project), down.project.board, down.project.files, down.write.path, readSystem(down.write.text).system.nodes.map(n => n.id), readSystem(down.write.text).system.links], ['board', 'arduino-uno', [], 'uart_avr.sys.json', ['uno'], []]);
  assert.deepEqual(down.lost, ['the node fpga (fpga, basys2) leaves the project: its folder fpga/ stays on the disk', 'its 1 link (serial)', 'its System document uart_avr.sys.json rewritten with the node alone',
    'the sources of the other nodes leave the project\'s list: fpga/uart_rx.vhd, fpga/uart_tx.vhd, fpga/debounce.vhd, fpga/sevenseg.vhd, fpga/uart.vhd']);
  assert.deepEqual(modeChange(pj, 'circuit', { files: ['uart_avr.sys.json'], texts: { 'uart_avr.sys.json': sysText }, keep: 'uno' }), { error: 'the node uno is a microcontroller: its firmware is no drawing, so it cannot be a Circuit project\'s' });
});
