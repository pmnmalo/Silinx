// A System's RP2040 node (#5494, core/system-sim-rp2040.js): a Raspberry Pi Pico running MicroPython's own firmware on
// rp2040js, its program a .py typed into its raw REPL. The firmware's files (pinned, core/rp2040-firmware.js) downloaded
// once into a folder the tests share (server/rp2040-firmware.js, SILINX_RP2040_CACHE). A UF2 file read; the node behind
// the contract (its ports at 3.3 V, its fidelity notes); a program's output its REPL's console and its LED; its UART0 to a
// serial terminal both ways at the link's 9600 8N1 (the terminal's bytes the program's, an independent reference); a
// traceback its error; the System's check (a Pico in C refused), the editor's node (MicroPython, its UARTs) and its plan
// (its program run by the REPL, nothing to build).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { RP2040_FILES, wordsBytes } from '../core/rp2040-firmware.js';
import { loadUf2, rp2040Contract, RP2040_FIDELITY, loadRp2040 } from '../core/system-sim-rp2040.js';
import { contractProblems } from '../core/system-contract.js';
import { prepareSystem, systemReport } from '../core/system-run.js';
import { checkSystem } from '../core/system-check.js';
import { addNode } from '../core/system-edit.js';
import { newSystem, normalizeSystem } from '../core/system-doc.js';
import { systemBuildPlan } from '../core/system-plan.js';

process.env.SILINX_RP2040_CACHE ??= path.join(os.tmpdir(), 'silinx-rp2040');
before(async () => { await import('../server/rp2040-firmware.js'); await loadRp2040(); });

const SYS = (py = 'pico/main.py', baud = 9600) => ({ format: 'silinx-system', version: 2, name: 's', nodes: [
  { id: 'pico', kind: 'mcu', board: 'pico', lang: 'micropython', firmware: py, interfaces: [{ name: 'UART0', kind: 'uart', baud, frame: '8N1' }] },
  { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud, frame: '8N1' }] }],
links: [{ id: 'serial', kind: 'uart', a: 'pico.UART0', b: 'term.serial' }] });
const ECHO = ['from machine import UART, Pin', 'import time', 'u = UART(0, 9600, tx=Pin(0), rx=Pin(1))', 'Pin(25, Pin.OUT).value(1)', 'u.write(b"Hi\\n")', 'print("sent", 6 * 7)',
  'while True:', '    if u.any():', '        c = u.read(1)', '        print("got", c)', '        u.write(c.upper())', '    time.sleep_ms(1)', ''].join('\n');
const run = async (py, ms, type = null) => {
  const r = await prepareSystem(SYS(), { firmware: async () => py });
  assert.ok(!r.error, r.error);
  r.sim.run(ms * 1e9);
  if (type) { r.terminals.get('term').send([...Buffer.from(type)]); r.sim.run(r.sim.now + 60e9); }
  return { r, rep: systemReport(r) };
};

test('#5494 the firmware\'s files pinned; a UF2 file\'s blocks into the flash; the bootrom\'s words as bytes', () => {
  assert.deepEqual(RP2040_FILES.map(f => [f.file, /^[0-9a-f]{64}$/.test(f.sha256), /^https:\/\//.test(f.url)]), [['micropython-rpi-pico-v1.24.1.uf2', true, true], ['circuitpython-rpi-pico-v10.3.2.uf2', true, true], ['rp2040-bootrom-b1.bin', true, true]]);
  assert.deepEqual([...wordsBytes('export const b = new Uint32Array([\n  0x20041f00, 0x000000ef,\n]);')], [0x00, 0x1f, 0x04, 0x20, 0xef, 0, 0, 0]);
  assert.equal(wordsBytes('nothing'), null);
  // (a UF2 block: its magics, its address and size, its data at 32)
  const block = (addr, data) => { const b = new Uint8Array(512), v = new DataView(b.buffer); v.setUint32(0, 0x0a324655, true); v.setUint32(4, 0x9e5d5157, true); v.setUint32(12, addr, true); v.setUint32(16, data.length, true); b.set(data, 32); return b; };
  const uf2 = new Uint8Array(1024);
  uf2.set(block(0x10000100, [1, 2, 3]), 0);
  uf2.set(block(0x20000000, [9]), 512);   // (not the flash's: skipped)
  const flash = new Uint8Array(0x200);
  assert.equal(loadUf2(uf2, flash), 3);
  assert.deepEqual([...flash.subarray(0x100, 0x104)], [1, 2, 3, 0]);
  assert.throws(() => loadUf2(new Uint8Array(512), flash), { message: 'not a UF2 file: no block at 0' });
});

test('#5494 the node behind the contract: its pins at 3.3 V, its fidelity said; its program\'s output its REPL\'s, its LED lit', async () => {
  const node = rp2040Contract({ program: { name: 'pico/main.py', data: 'from machine import Pin\nPin(25, Pin.OUT).value(1)\nprint("hello", 6 * 7)\n' } });
  assert.deepEqual(contractProblems(node), []);
  assert.equal(node.fidelity, RP2040_FIDELITY);
  assert.deepEqual([node.ports.length, node.ports[0], node.ports.at(-1).name], [27, { name: 'GP0', dir: 'inout', kind: 'pin', volts: 3.3, width: 1, protocol: null, role: null }, 'GP28']);
  node.run(500e9);
  // (the program ended: its friendly REPL's prompt, for what is typed)
  assert.equal(String.fromCharCode(...node.engine.received.map(b => b.byte)), 'hello 42\r\n>>> ');
  assert.equal(node.value('GP25'), 1);
  // (a line typed to its REPL, evaluated)
  node.engine.send([...Buffer.from('print(6 * 7)\n')]);
  node.run(700e9);
  assert.equal(String.fromCharCode(...node.engine.received.map(b => b.byte)), 'hello 42\r\n>>> print(6 * 7)\r\n42\r\n>>> ');
  assert.equal(node.value('GP2'), 0, 'a pin with its pull-down');
  assert.deepEqual(node.messages(), []);
  // (not a .py: said, the node finished)
  const bad = rp2040Contract({ program: { name: 'pico/main.hex', data: '' } });
  assert.deepEqual(bad.messages(), [{ kind: 'error', time: 0, text: 'its program pico/main.hex is not a .py' }]);
  assert.equal(bad.finished, 'error');
});

test('#5494 a Pico and a terminal by UART: the program\'s bytes on the terminal, the terminal\'s typed to the program, its REPL its console', async () => {
  const { rep } = await run(ECHO, 600, 'ab');
  assert.deepEqual(rep.terminals, { 'pico.repl': 'sent 42\r\ngot b\'a\'\r\ngot b\'b\'\r\n', term: 'Hi\nAB' });
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
  const w = t => rep.traffic.find(x => x.wire === t);
  assert.deepEqual(rep.traffic.map(t => [t.wire, t.from, t.to, t.baud, t.frame]), [['serial_pico', 'pico.GP0', 'term.rx', 9600, '8N1'], ['serial_term', 'term.tx', 'pico.GP1', 9600, '8N1']]);
  assert.deepEqual([w('serial_pico').bytes.map(b => b.byte), w('serial_term').bytes.map(b => b.byte)], [[...Buffer.from('Hi\nAB')], [...Buffer.from('ab')]]);
});

test('#5494 a program longer than the USB FIFO (512 bytes): typed as it drains, whole', async () => {
  const long = `${Array.from({ length: 40 }, (_, i) => `x${i} = ${i}  # a comment to make the program long`).join('\n')}\nprint("sum", ${Array.from({ length: 40 }, (_, i) => `x${i}`).join(' + ')})\n`;
  assert.ok(long.length > 2000);
  const { rep } = await run(long, 600);
  assert.deepEqual([rep.terminals['pico.repl'], rep.errors], ['sum 780\r\n>>> ', []]);
});

test('#5494 a traceback: its error, said with the node; the REPL\'s console has it too', async () => {
  const { rep } = await run('print("before")\nx = 1 / 0\n', 500);
  assert.deepEqual(rep.errors, ['pico: its program: Traceback (most recent call last): |   File "<stdin>", line 2, in <module> | ZeroDivisionError: divide by zero']);
  assert.equal(rep.terminals['pico.repl'].split('\r\n').slice(0, 2).join('|'), 'before|Traceback (most recent call last):');
});

test('#5494 the check (a Pico in C refused), the editor\'s Pico (MicroPython, its UARTs), its plan (run by its REPL)', () => {
  const said = (s, files) => checkSystem(normalizeSystem(s), { files }).map(d => `${d.severity}: ${d.message}`);
  assert.deepEqual(said({ ...SYS(), nodes: [{ ...SYS().nodes[0], lang: 'c' }, SYS().nodes[1]] }, ['pico/main.py']), ['error: pico: the Raspberry Pi Pico runs MicroPython, not C']);
  assert.deepEqual(said(SYS(), ['pico/main.py']), []);
  assert.deepEqual(said(SYS('pico/main.hex'), ['pico/main.hex']), ['error: pico: its firmware pico/main.hex is not a .py']);
  const a = addNode(newSystem('x'), { kind: 'mcu', board: 'pico', id: 'pico' });
  assert.deepEqual(a.system.nodes[0], { id: 'pico', kind: 'mcu', board: 'pico', firmware: null, lang: 'micropython', interfaces: [{ name: 'UART0', kind: 'uart', baud: 9600, frame: '8N1' }, { name: 'UART1', kind: 'uart', baud: 9600, frame: '8N1' }], x: 0, y: 0 });
  assert.deepEqual(addNode(newSystem('x'), { kind: 'mcu', board: 'pico', lang: 'c' }), { error: 'the Raspberry Pi Pico runs micropython, not c' });
  const plan = systemBuildPlan(SYS(), { files: ['pico/main.py'] });
  assert.deepEqual(plan.nodes.map(e => [e.id, e.programmer, e.state, e.reason]), [['pico', 'repl', 'nothing to build', 'a MicroPython program runs as it is']]);
});

test('#5881 regression: an output pin\'s value() its level, as on the Pico: after toggle() it reads back what it drives; an input still reads its link', async () => {
  const PY = ['from machine import Pin', 'import time', 'led = Pin(25, Pin.OUT)', 'led.value(1)', 'print("read", led.value())',
    'for i in range(3):', '    led.toggle()', '    print("on" if led.value() else "off")', '    time.sleep_ms(1)',
    'led.value(not led.value())', 'print("flip", led.value())', 'b = Pin(1, Pin.IN, Pin.PULL_UP)', 'print("in", b.value())', ''].join('\n');
  const { r, rep } = await run(PY, 300);
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
  assert.equal(rep.terminals['pico.repl'].replace(/^[\s\S]*?read/, 'read'), 'read 1\r\noff\r\non\r\noff\r\nflip 1\r\nin 1\r\n>>> ');
  assert.equal(r.sim.nodes.get('pico').value('GP25'), 1);
});
