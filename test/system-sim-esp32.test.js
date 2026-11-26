// A System's ESP32 node, its Worker + Atomics back end (#5495, core/system-sim-esp32.js, core/esp32-engine.js,
// core/esp32-link.js): MicroPython's WebAssembly port in a Node Worker (server/esp32-spawn.js), in lockstep with the
// scheduler through a SharedArrayBuffer. Each line's time and a sleep's (the LED's edges at their exact times); its UART
// to a terminal both ways at the link's 9600 8N1 (the terminal's bytes the program's); its prints its REPL's console, a
// line typed there run once the program ended; a traceback its error, the program's lines only; the same run twice the
// same (determinism); an engine that dies said; why it cannot run where the page is not cross-origin isolated; the
// System's check, the editor's node, the plan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prepareSystem, systemReport, disposeSystem } from '../core/system-run.js';
import { esp32Problem } from '../core/system-sim-esp32.js';
import { esp32Buffer, hostLink } from '../core/esp32-link.js';
import { LINE_PS, esp32Prelude, timeWhileLoops } from '../core/esp32-python.js';
import { checkSystem } from '../core/system-check.js';
import { addNode } from '../core/system-edit.js';
import { newSystem, normalizeSystem } from '../core/system-doc.js';
import { systemBuildPlan } from '../core/system-plan.js';

before(async () => { await import('../server/esp32-spawn.js'); });
const runs = [];
after(() => runs.forEach(disposeSystem));

const SYS = (py = 'esp/main.py') => ({ format: 'silinx-system', version: 2, name: 's', nodes: [
  { id: 'esp', kind: 'mcu', board: 'esp32-devkitc', lang: 'micropython', firmware: py, interfaces: [{ name: 'UART2', kind: 'uart', baud: 9600, frame: '8N1' }] },
  { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 9600, frame: '8N1' }] }],
links: [{ id: 'serial', kind: 'uart', a: 'esp.UART2', b: 'term.serial' }] });
const ECHO = ['from machine import UART, Pin', 'import time', 'u = UART(2, 9600)', 'Pin(2, Pin.OUT).value(1)', 'u.write(b"Hi\\n")', 'print("sent", time.ticks_us())',
  'while True:', '    if u.any():', '        c = u.read(1)', '        print("got", c)', '        u.write(c.upper())', '    time.sleep_ms(1)', ''].join('\n');
async function run(py, ms, type = null, sys = SYS()) {
  const r = await prepareSystem(sys, { firmware: async () => py });
  assert.ok(!r.error, r.error);
  runs.push(r);
  r.sim.run(ms * 1e9);
  if (type) { r.terminals.get('term').send([...Buffer.from(type)]); r.sim.run(r.sim.now + 40e9); }
  return { r, rep: systemReport(r) };
}

test('#5495 the prelude: machine and time put into sys.modules, the program run traced; a line 1 µs', () => {
  assert.equal(LINE_PS, 1e6);
  const p = esp32Prelude('print(1)');
  assert.match(p, /^import sys, _silinx\n/);
  assert.ok(p.includes('_module("machine", Pin=Pin, UART=UART') && p.includes('sys.modules["utime"] = _t') && p.endsWith('    exec("print(1)", {"__name__": "__main__"})\nfinally:\n    sys.settrace(None)\n'));
});

test('#5495 an ESP32 and a terminal by UART: the program\'s bytes, the terminal\'s typed to it; its console; its LED', async () => {
  const { r, rep } = await run(ECHO, 20, 'ab');
  assert.deepEqual([rep.warnings, rep.errors], [[], []]);
  // (a line's time charged at its start: the 6th line runs at 6 µs)
  assert.deepEqual(rep.terminals, { 'esp.repl': 'sent 6\ngot b\'a\'\ngot b\'b\'\n', term: 'Hi\nAB' });
  assert.deepEqual(rep.traffic.map(t => [t.wire, t.from, t.to, String.fromCharCode(...t.bytes.map(b => b.byte))]), [['serial_esp', 'esp.GPIO17', 'term.rx', 'Hi\nAB'], ['serial_term', 'term.tx', 'esp.GPIO16', 'ab']]);
  assert.equal(r.sim.nodes.get('esp').value('GPIO2'), 1);
  assert.deepEqual(r.sim.nodes.get('esp').fidelity.map(f => f.kind), ['models', 'approximates', 'omits']);
  // (the program's first byte: its frame after the idle bit the UART's set-up drove, from its write's time, its 5th line)
  assert.equal(rep.traffic[0].bytes[0].t, 5e6);
});

test('#5495 deterministic: the same run twice the same; a blinking LED\'s edges at their lines\' and sleeps\' times', async () => {
  const BLINK = 'from machine import Pin\nimport time\nled = Pin(2, Pin.OUT)\nfor i in range(3):\n    led.value(1)\n    time.sleep_ms(2)\n    led.value(0)\n    time.sleep_ms(2)\n';
  const edges = async () => {
    const r = await prepareSystem({ ...SYS(), links: [] }, { firmware: async () => BLINK });
    runs.push(r);
    const node = r.sim.nodes.get('esp'), seen = [];
    for (let t = 1e8; t <= 20e9; t += 1e8) seen.push(...node.advanceTo(t).filter(e => e.pin === 'GPIO2').map(e => [e.t, e.value]));
    return seen;
  };
  const a = await edges();
  // (the first edge after a few lines' µs; then each 2 ms of sleep and the loop's few lines apart, 1 µs each)
  assert.equal(a.length, 6);
  assert.deepEqual(a.map(e => e[1]), [1, 0, 1, 0, 1, 0]);
  assert.ok(a[0][0] >= 5e6 && a[0][0] <= 8e6, `${a[0][0]}`);
  for (let i = 1; i < a.length; i++) { const d = a[i][0] - a[i - 1][0]; assert.ok(d >= 2001e6 && d <= 2005e6, `${i}: ${d}`); assert.equal(d % 1e6, 0); }
  assert.deepEqual(await edges(), a);
});

test('#5751 a while loop\'s header: its condition through _silinx_loop with its line, on the same lines; strings, comments, brackets, for loops left as they are', () => {
  const t = (...l) => timeWhileLoops(l.join('\n'));
  assert.equal(t('while k < 5:', '    pass'), 'while _silinx_loop(1, ( k < 5)):\n    pass');
  // (a condition over two lines, a slice's colon, a comment's; a walrus; an inline body; a string's colon)
  assert.equal(t('x = 1', 'while (a and', '   b) or c[1:2]:  # wait: here', '    while x := f(): y()', 'while "a:b" in s: pass'),
    ['x = 1', 'while _silinx_loop(2, ( (a and', '   b) or c[1:2])):  # wait: here', '    while _silinx_loop(4, ( x := f())): y()', 'while _silinx_loop(5, ( "a:b" in s)): pass'].join('\n'));
  // (a while in a string, a name that starts with while, a for loop, a tab's indent, a continued line)
  assert.equal(t('s = """while no:', 'while"""', 'whileX = 3', 'for i in range(3): pass', 'def f():', '\twhile(1): return 2', 'while\\', '  z: pass'),
    ['s = """while no:', 'while"""', 'whileX = 3', 'for i in range(3): pass', 'def f():', '\twhile _silinx_loop(6, ((1))): return 2', 'while _silinx_loop(7, (\\', '  z)): pass'].join('\n'));
  // (an assignment for a condition still the syntax error it was, not a keyword argument)
  assert.equal(t('while x = 1:', '  pass'), 'while _silinx_loop(1, ( x = 1)):\n  pass');
  assert.ok(esp32Prelude('while 1:\n  pass\n').includes('exec("while _silinx_loop(1, ( 1)):\\n  pass\\n", {"__name__": "__main__"})'));
});

test('#5751 a busy wait whose body is one line takes time and ends: on the time, on a byte typed; an inline loop a line a check', async () => {
  // (each check of its condition a line, 1 µs: the loop ends once ticks_us() reaches 900, its print's line 2 µs later
  // (the last check's and its own); it took no time and the node stopped after 30 s, "start" never said)
  let { rep } = await run(['import time', 'print("start")', 'while time.ticks_us() < 900:', '    pass', 'print("B", time.ticks_us())', ''].join('\n'), 2);
  assert.deepEqual([rep.warnings, rep.errors, rep.terminals['esp.repl']], [[], [], 'start\nB 902\n']);
  ({ rep } = await run(['from machine import UART', 'import time', 'u = UART(2, 9600)', 'while not u.any():', '    pass', 'print("got", u.read(1), time.ticks_us() > 1000)', ''].join('\n'), 1, 'x'));
  assert.deepEqual([rep.warnings, rep.errors, rep.terminals['esp.repl']], [[], [], 'got b\'x\' True\n']);
  // (an inline loop: its first check the line's own, then a line a check: 5 µs, after the 3 lines before and with the
  // print's own, a line's time charged at its start)
  ({ rep } = await run(['import time', 'k = 0', 'while k < 5: k += 1', 'print(k, time.ticks_us())', ''].join('\n'), 1));
  assert.deepEqual([rep.errors, rep.terminals['esp.repl']], [[], '5 9\n']);
  // (a Timer's callback inside the wait, its flag the loop's condition: run at its time, 1 ms after its line's 5 µs)
  ({ rep } = await run(['from machine import Timer', 'import time', 'done = []', 'Timer(0, mode=Timer.ONE_SHOT, period=1, callback=lambda t: done.append(time.ticks_us()))', 'while not done:', '    pass', 'print("tick", done, time.ticks_us())', ''].join('\n'), 3));
  assert.deepEqual([rep.warnings, rep.errors, rep.terminals['esp.repl']], [[], [], 'tick [1005] 1007\n']);
});

test('#5495 a traceback: its error, the program\'s own lines; a line typed to its REPL once the program ended', async () => {
  const { r, rep } = await run('print("before")\nx = 1 / 0\n', 5);
  assert.deepEqual(rep.errors, ['esp: its program: Traceback (most recent call last): |   File "main.py", line 2, in <module> | ZeroDivisionError: divide by zero']);
  r.terminals.get('esp.repl').send([...Buffer.from('print(6 * 7)\n')]);
  r.sim.run(r.sim.now + 1e9);
  assert.equal(systemReport(r).terminals['esp.repl'], 'before\nTraceback (most recent call last):\n  File "main.py", line 2, in <module>\nZeroDivisionError: divide by zero\n>>> print(6 * 7)\n42\n');
});

test('#5495 an engine that does not answer: said, the node stopped; where the page is not cross-origin isolated: why', () => {
  const link = hostLink(esp32Buffer(), { limit: 50 });
  assert.throws(() => link.command(1e6, { inputs: [] }), { message: 'its MicroPython did not answer in 0.05 s' });
  assert.equal(esp32Problem(globalThis), null, 'Node: SharedArrayBuffer');
  assert.equal(esp32Problem({ SharedArrayBuffer, crossOriginIsolated: false, isSecureContext: true, location: { protocol: 'https:' } }), null, 'Node runs it anywhere');
  // (a page: isolated, or why not, the console's words)
  assert.equal(esp32Problem({ SharedArrayBuffer, crossOriginIsolated: true }, false), null);
  assert.equal(esp32Problem({ crossOriginIsolated: false, isSecureContext: true, location: { protocol: 'https:' } }, false), 'an ESP32 node runs in a page cross-origin isolated: the page is not cross-origin isolated: its server sent no Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy, or the browser refused them');
  assert.equal(esp32Problem({ location: { protocol: 'file:' } }, false), 'an ESP32 node runs in a page cross-origin isolated: the page is opened from a file, which cannot be cross-origin isolated: open the site or the local server');
});

test('#5495 the check (an ESP32 in C refused, a .py its program), the editor\'s ESP32, its plan', () => {
  const said = s => checkSystem(normalizeSystem(s), { files: [s.nodes[0].firmware] }).map(d => `${d.severity}: ${d.message}`);
  assert.deepEqual(said(SYS()), []);
  assert.deepEqual(said({ ...SYS(), nodes: [{ ...SYS().nodes[0], lang: 'c' }, SYS().nodes[1]] }), ['error: esp: the ESP32 DevKitC runs MicroPython, not C']);
  assert.deepEqual(said(SYS('esp/main.hex')), ['error: esp: its firmware esp/main.hex is not a .py']);
  const a = addNode(newSystem('x'), { kind: 'mcu', board: 'esp32-devkitc', id: 'esp' });
  assert.deepEqual([a.system.nodes[0].lang, a.system.nodes[0].interfaces], ['micropython', [{ name: 'UART2', kind: 'uart', baud: 9600, frame: '8N1' }]]);
  assert.deepEqual(systemBuildPlan(SYS(), { files: ['esp/main.py'] }).nodes.map(e => [e.id, e.programmer, e.state]), [['esp', 'repl', 'nothing to build']]);
});
