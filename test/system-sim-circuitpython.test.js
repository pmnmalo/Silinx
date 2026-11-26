// A System's Raspberry Pi Pico on CircuitPython (#5697, core/system-sim-rp2040.js, core/circuitpython-drive.js): its
// real firmware (pinned, core/rp2040-firmware.js, downloaded once into the folder the tests share) on rp2040js, its
// program code.py on its CIRCUITPY drive. Each module taught against the simulation: board and digitalio (the LED, an
// input with its pull-up, then driven low), analogio (an ADC input at its pin's level), pwmio (1 kHz at 25 %: its
// edges' times), time (sleep and monotonic on the simulation's clock), busio.UART to a serial terminal both ways (the
// terminal's bytes the program's, an independent reference); a module of lib/ imported; the console from "code.py
// output:" on, then its REPL; a traceback its error; the boot as fast as its boot_out.txt says (else the firmware's is
// not the one pinned); the check, the edits and the plan of a node's firmware choice.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { rp2040Contract, CIRCUITPYTHON_FIDELITY, loadRp2040 } from '../core/system-sim-rp2040.js';
import { contractProblems } from '../core/system-contract.js';
import { prepareSystem, systemReport, termCaption } from '../core/system-run.js';
import { checkSystem } from '../core/system-check.js';
import { addNode, changeNode, describeSystem } from '../core/system-edit.js';
import { newSystem, normalizeSystem, readSystem, writeSystem } from '../core/system-doc.js';
import { systemBuildPlan } from '../core/system-plan.js';

process.env.SILINX_RP2040_CACHE ??= path.join(os.tmpdir(), 'silinx-rp2040');
before(async () => { await import('../server/rp2040-firmware.js'); await loadRp2040(['circuitpython']); });

const text = node => String.fromCharCode(...node.engine.received.map(b => b.byte));
const cp = (data, files = []) => rp2040Contract({ runtime: 'circuitpython', program: { name: 'pico/code.py', data }, files });
const SYS = (baud = 9600) => ({ format: 'silinx-system', version: 2, name: 's', nodes: [
  { id: 'pico', kind: 'mcu', board: 'pico', runtime: 'circuitpython', lang: 'micropython', firmware: 'pico/code.py', interfaces: [{ name: 'UART0', kind: 'uart', baud, frame: '8N1' }] },
  { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud, frame: '8N1' }] }],
links: [{ id: 'serial', kind: 'uart', a: 'pico.UART0', b: 'term.serial' }] });

test('#5697 board and digitalio: the LED lit, code.py\'s output its console, a module of lib/; then its REPL; booted at once', () => {
  const node = cp('import board, digitalio, time\nfrom helper import WHO\nled = digitalio.DigitalInOut(board.LED)\nled.direction = digitalio.Direction.OUTPUT\nled.value = True\nprint("hello", WHO, 6 * 7)\nwhile True:\n    time.sleep(1)\n',
    [{ name: 'lib/helper.py', data: 'WHO = "lib"\n' }]);
  assert.deepEqual(contractProblems(node), []);
  assert.equal(node.fidelity, CIRCUITPYTHON_FIDELITY);
  const r = node.run(500e9);
  // (its boot_out.txt the firmware's: no second's wait before code.py, which lights the LED before 400 ms)
  const lit = r.outputs.find(o => o.pin === 'GP25' && o.value === 1 && o.t > 250e9);
  assert.ok(lit && lit.t < 400e9, `the LED lit at ${lit && lit.t / 1e9} ms: CircuitPython's boot_out.txt (core/rp2040-firmware.js bootOut) is not the one this firmware writes`);
  assert.equal(text(node), 'code.py output:\r\nhello lib 42\r\n');
  assert.equal(node.value('GP25'), 1);
  // (Ctrl-C: the program stopped, its REPL entered at a key; a line evaluated)
  node.engine.send([3]);
  node.run(800e9);
  node.engine.send([...Buffer.from('\n')]);
  node.run(1000e9);
  node.engine.send([...Buffer.from('print(6 * 7)\n')]);
  node.run(1200e9);
  const said = text(node);
  assert.match(said, /^code\.py output:\r\nhello lib 42\r\nTraceback \(most recent call last\):\r\n {2}File "code\.py", line 8, in <module>\r\nKeyboardInterrupt: \r\n\r\nCode done running\.\r\n/);
  assert.ok(said.endsWith('Adafruit CircuitPython 10.3.2 on 2026-11-11; Raspberry Pi Pico with rp2040\r\n>>> print(6 * 7)\r\n42\r\n>>> '), JSON.stringify(said.slice(-200)));
  const m = node.messages();
  assert.deepEqual(m.map(x => [x.kind, x.text]), [['error', 'its program: Traceback (most recent call last): | File "code.py", line 8, in <module> | KeyboardInterrupt:']]);
  assert.ok(m[0].time > 500e9 && m[0].time < 800e9, `said at ${m[0].time / 1e9} ms`);
});

test('#5697 digitalio\'s input and its pull-up, analogio, pwmio at 1 kHz and 25 %, time on the simulation\'s clock', () => {
  const node = cp(['import board, digitalio, analogio, pwmio, time',
    'pwm = pwmio.PWMOut(board.GP15, frequency=1000, duty_cycle=16384)',
    'a = analogio.AnalogIn(board.GP26)', 'b = digitalio.DigitalInOut(board.GP2)', 'b.switch_to_input(pull=digitalio.Pull.UP)',
    't0 = time.monotonic_ns()', 'time.sleep(0.05)', 'print("slept", round((time.monotonic_ns() - t0) / 1e6))',
    'while True:', '    print("a", a.value, "b", b.value)', '    time.sleep(0.1)', ''].join('\n'));
  const r = node.run(800e9, [{ pin: 'GP26', t: 500e9, value: 1 }, { pin: 'GP2', t: 650e9, value: 0 }]);
  const lines = text(node).split('\r\n');
  assert.deepEqual(lines.slice(0, 3), ['code.py output:', 'slept 50', 'a 0 b True']);
  assert.deepEqual(lines.slice(-3), ['a 65535 b True', 'a 65535 b False', '']);
  assert.deepEqual(node.messages(), []);
  // (its PWM's edges: a rise every period, high a quarter of it)
  const e = r.outputs.filter(o => o.pin === 'GP15' && o.t > 700e9);
  const rises = e.filter(o => o.value === 1).map(o => o.t), falls = e.filter(o => o.value === 0).map(o => o.t);
  const period = (rises.at(-1) - rises[0]) / (rises.length - 1), high = falls.find(t => t > rises[0]) - rises[0];
  assert.ok(rises.length >= 90, `${rises.length} periods in 100 ms`);
  assert.ok(Math.abs(period - 1e9) < 0.02e9, `its period ${period / 1e9} ms`);
  assert.ok(Math.abs(high / period - 0.25) < 0.01, `its duty ${high / period}`);
});

test('#5697 busio.UART: a Pico and a terminal, the program\'s bytes on the terminal, the terminal\'s to the program', async () => {
  const PY = ['import board, busio, time', 'u = busio.UART(board.GP0, board.GP1, baudrate=9600)', 'u.write(b"Hi\\n")', 'print("sent", 6 * 7)',
    'while True:', '    c = u.read(1)', '    if c:', '        print("got", c)', '        u.write(c.upper())', '    time.sleep(0.001)', ''].join('\n');
  const r = await prepareSystem(SYS(), { firmware: async () => PY, nodeFiles: async () => ['pico/code.py'] });
  assert.ok(!r.error, r.error);
  r.sim.run(700e9);
  r.terminals.get('term').send([...Buffer.from('ab')]);
  r.sim.run(r.sim.now + 60e9);
  const rep = systemReport(r);
  assert.deepEqual(rep.terminals, { 'pico.repl': 'code.py output:\r\nsent 42\r\ngot b\'a\'\r\ngot b\'b\'\r\n', term: 'Hi\nAB' });
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
  const w = t => rep.traffic.find(x => x.wire === t);
  assert.deepEqual([w('serial_pico').bytes.map(b => b.byte), w('serial_term').bytes.map(b => b.byte)], [[...Buffer.from('Hi\nAB')], [...Buffer.from('ab')]]);
});

test('#5697 the node\'s folder\'s files on its drive (a module, settings.toml); a traceback its error', async () => {
  const files = { 'pico/code.py': 'import os\nfrom util import double\nprint(double(21), os.getenv("GREETING"))\nx = 1 / 0\n', 'pico/util.py': 'def double(x):\n    return 2 * x\n', 'pico/settings.toml': 'GREETING = "hi"\n', 'other/x.py': 'not its' };
  const r = await prepareSystem(SYS(), { firmware: async p => files[p], nodeFiles: async () => Object.keys(files) });
  assert.ok(!r.error, r.error);
  r.sim.run(600e9);
  const rep = systemReport(r);
  assert.equal(rep.terminals['pico.repl'].split('\r\n').slice(0, 3).join('|'), 'code.py output:|42 hi|Traceback (most recent call last):');
  assert.deepEqual(rep.errors, ['pico: its program: Traceback (most recent call last): | File "code.py", line 4, in <module> | ZeroDivisionError: division by zero']);
});

test('#5697 the node\'s firmware: written, checked, edited (MCP\'s and Properties\' edit), its plan, its console\'s caption', () => {
  const s = normalizeSystem(SYS());
  assert.equal(s.nodes[0].runtime, 'circuitpython');
  assert.equal(readSystem(writeSystem(s)).system.nodes[0].runtime, 'circuitpython');
  assert.equal(normalizeSystem({ ...SYS(), nodes: [{ ...SYS().nodes[0], runtime: undefined }] }).nodes[0].runtime, undefined);
  const said = sys => checkSystem(normalizeSystem(sys), { files: ['pico/code.py'] }).map(d => `${d.severity}: ${d.message}`);
  assert.deepEqual(said(SYS()), []);
  assert.deepEqual(said({ ...SYS(), nodes: [{ ...SYS().nodes[0], runtime: 'lua' }, SYS().nodes[1]] }), ['error: pico: the Raspberry Pi Pico\'s firmware is MicroPython or CircuitPython, not lua']);
  assert.deepEqual(said({ ...SYS(), nodes: [{ ...SYS().nodes[0], board: 'arduino-uno', lang: 'c', firmware: null, interfaces: [] }, SYS().nodes[1]], links: [] }), ['error: pico: the Arduino Uno has no Python firmware to choose (runtime circuitpython)', 'warning: pico joins nothing: no link reaches it', 'warning: term joins nothing: no link reaches it']);
  // (edited: the board's default not written; another firmware refused; dropped with a board that has none)
  assert.equal(changeNode(s, 'pico', { runtime: 'micropython' }).system.nodes[0].runtime, undefined);
  assert.equal(changeNode(changeNode(s, 'pico', { runtime: null }).system, 'pico', { runtime: 'circuitpython' }).system.nodes[0].runtime, 'circuitpython');
  assert.deepEqual(changeNode(s, 'pico', { runtime: 'lua' }), { error: 'pico: the Raspberry Pi Pico\'s firmware is micropython or circuitpython, not lua' });
  assert.equal(changeNode(s, 'pico', { board: 'arduino-uno' }).system.nodes[0].runtime, undefined);
  assert.deepEqual(changeNode(changeNode(s, 'pico', { board: 'arduino-uno' }).system, 'pico', { runtime: 'circuitpython' }), { error: 'pico: the Arduino Uno has no Python firmware to choose' });
  assert.equal(addNode(newSystem('x'), { kind: 'mcu', board: 'pico', id: 'p', runtime: 'circuitpython' }).system.nodes[0].runtime, 'circuitpython');
  assert.deepEqual(addNode(newSystem('x'), { kind: 'mcu', board: 'arduino-nano', runtime: 'circuitpython' }), { error: 'the Arduino Nano has no Python firmware to choose' });
  assert.equal(describeSystem(s)[1], 'node pico: Raspberry Pi Pico, CircuitPython, program pico/code.py');
  // (its plan: copied to its CIRCUITPY drive, nothing to build)
  const plan = systemBuildPlan(s, { files: ['pico/code.py', 'pico/lib/x.py'] });
  assert.deepEqual(plan.nodes.map(e => [e.id, e.programmer, e.image, e.sources, e.state, e.reason]), [['pico', 'circuitpy', 'pico/code.py', ['pico/code.py', 'pico/lib/x.py'], 'nothing to build', 'a CircuitPython program runs as it is']]);
  assert.deepEqual([termCaption('pico.repl', null, s), termCaption('pico.repl', null, changeNode(s, 'pico', { runtime: null }).system), termCaption('term', { baud: 9600, frame: '8N1' }, s)],
    ['pico · CircuitPython REPL (USB)', 'pico · MicroPython REPL (USB)', 'term · 9600 8N1']);
});
