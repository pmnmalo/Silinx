// Silinx's MicroPython build for the ESP32 node's JSPI back end (#5658): its smoke test, on the build's output, in Node with
// JSPI (node --experimental-wasm-jspi until its V8 has it on). Each check prints a line; a failure throws.
//
//   node --experimental-wasm-jspi scripts/micropython-wasm/smoke.mjs <output folder>
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = path.resolve(process.argv[2] ?? '.');
assert.ok(typeof WebAssembly.Suspending === 'function' && typeof WebAssembly.promising === 'function', 'this Node has no JSPI (--experimental-wasm-jspi)');
const url = pathToFileURL(path.join(dir, 'micropython.mjs')).href;
const ok = what => console.log(`ok - ${what}`);

// one MicroPython: what it prints, and its waits answered after a turn of the event loop
async function instance(tag) {
  const { loadMicroPython, runPythonSuspending } = await import(`${url}?${tag}`);
  const out = [];
  const mp = await loadMicroPython({ url: path.join(dir, 'micropython.wasm'), linebuffer: false, stdout: b => out.push(...b), stderr: b => out.push(...b) });
  const text = () => new TextDecoder().decode(new Uint8Array(out));
  return { mp, text, run: (code, wait) => runPythonSuspending(mp, code, wait) };
}

const a = await instance('a');
// waits suspend the program, the event loop runs meanwhile, wait() returns its number
let ticks = 0;
const timer = setInterval(() => ticks++, 0);
let n = 0;
const wait = () => new Promise(r => setTimeout(() => r(++n), 2));
assert.equal(await a.run('import silinx_jspi\nprint([silinx_jspi.wait() for i in range(3)])\nr = 6 * 7', wait), null);
assert.equal(a.mp.globals.get('r'), 42);
clearInterval(timer);
assert.equal(a.text(), '[1, 2, 3]\n');
assert.ok(ticks > 0, 'the event loop ran while the program waited');
ok('silinx_jspi.wait() suspends, its promise\'s number returned, the result as runPython\'s (None)');

// settrace: each line of the program traced, a wait in the trace function itself
await a.run(`import sys, silinx_jspi
lines = []
def t(frame, event, arg):
    if frame.f_code.co_filename != "<string>":
        return None
    if event == "line":
        lines.append(silinx_jspi.wait())
    return t
sys.settrace(t)
exec("x = 1\\ny = 2\\nz = x + y", {})
sys.settrace(None)
print(len(lines))`, wait);
assert.match(a.text(), /\n3\n$/);
ok('sys.settrace: a wait at each line of the traced code');

// an exception raised after a suspension, caught in Python (nlr across the suspended stack) and uncaught (PythonError)
await a.run('import silinx_jspi\ntry:\n    silinx_jspi.wait()\n    raise ValueError("x")\nexcept ValueError as e:\n    print("caught", e)', wait);
assert.match(a.text(), /caught x\n$/);
await assert.rejects(a.run('import silinx_jspi\nsilinx_jspi.wait()\n1 / 0', wait), e => /ZeroDivisionError/.test(String(e?.message ?? e)));
ok('exceptions after a suspension: caught in Python, and an uncaught one rejects');

// two instances on one thread, both suspended at once, each resumed with its own Module
const b = await instance('b');
let resumeA, resumeB;
const pa = a.run('import silinx_jspi\nprint("a", silinx_jspi.wait())', () => new Promise(r => { resumeA = r; }));
const pb = b.run('import silinx_jspi\nprint("b", silinx_jspi.wait())', () => new Promise(r => { resumeB = r; }));
await new Promise(r => setTimeout(r, 5));
resumeA(7);
await pa;
resumeB(8);
await pb;
assert.match(a.text(), /a 7\n$/);
assert.equal(b.text(), 'b 8\n');
ok('two instances suspended at once, each resumed on its own');

// the plain API still works (runPython, a JavaScript module), once the instance's Module is the global one again (b's
// since it resumed: MicroPython's JavaScript reads the global; a caller with several instances selects one first)
globalThis.Module = a.mp._module;
a.mp.registerJsModule('_js', { twice: x => 2 * x });
a.mp.runPython('import _js\ny = _js.twice(21)');
assert.equal(a.mp.globals.get('y'), 42);
ok('runPython and registerJsModule as before');
