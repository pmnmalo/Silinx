// UI (#5648): the page cross-origin isolated by the local server's headers (COOP, COEP): crossOriginIsolated, a worker
// given a SharedArrayBuffer that it blocks on with Atomics.wait and the page wakes (the ESP32's Worker + Atomics back end,
// #5495); the app's own workers still run under COEP (a System's run in its worker, the uart-avr example's Try it); no
// error in the browser's console. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';

uiTest('#5648 the page cross-origin isolated: SharedArrayBuffer and Atomics.wait in a worker; a System\'s worker still runs', E, async (page) => {
  assert.deepEqual(await page.eval(() => [globalThis.crossOriginIsolated, typeof SharedArrayBuffer]), [true, 'function']);
  // (a worker blocked on a shared word until the page stores and notifies it: what it read)
  const got = await page.eval(() => new Promise((resolve, reject) => {
    const sab = new SharedArrayBuffer(8), word = new Int32Array(sab);
    const src = 'onmessage = e => { const w = new Int32Array(e.data); const r = Atomics.wait(w, 0, 0, 5000); postMessage([r, Atomics.load(w, 1)]); };';
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = e => { w.terminate(); resolve(e.data); };
    w.onerror = e => reject(new Error(e.message));
    w.postMessage(sab);
    setTimeout(() => { Atomics.store(word, 1, 42); Atomics.store(word, 0, 1); Atomics.notify(word, 0); }, 100);
  }));
  assert.deepEqual(got, ['ok', 42]);
  // the app's System worker under COEP: the uart-avr example tried
  await makeProject(env, { name: 'Coi', template: 'uart-avr' });
  await page.openProject('Coi');
  await page.eval(() => window.SilinxApp.openFile('uart_avr.sys.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-sim-btn`), [ED], { what: 'the System editor' });
  await page.click(`${ED} .sys-sim-btn`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-sim-panel:not([hidden]) .sys-run-for`), [ED], { what: 'the simulation view' });
  await page.click(`${ED} .sys-run-for`);
  await page.waitFor(() => { const s = window.Silinx.active.systemEditor.sim.state(); return s && !s.running && s.traffic.some((t) => t.bytes.length); }, [], { what: 'its run', timeout: 120000 });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
