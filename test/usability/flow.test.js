// Usability (#5148, part 5): a design's whole flow as a student runs it, on the gates example (examples/gates) with the
// Silinx toolchain (no ISE): Process ▸ Implement Top Module (synthesis to the bitstream), its processes all done and the
// console's warnings exactly (none: the examples build clean); then the schematic edited (an inverter dragged, a net renamed: its HDL changed, saved by itself):
// the processes' results out of date, and Implement Top Module again; the Board Emulator on the design: each of the
// switches' 16 numbers set, the LEDs read against the prime detector it is (2, 3, 5, 7, 11, 13). In both interfaces
// (SILINX_UI_INTERFACE=ise) and in Portuguese (SILINX_USABILITY_LANG=pt).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from '../ui/harness.js';
import { SchSession, RUN } from './lib/session.js';

const FILE = 'test/usability/flow.test.js';
let env;
before(async () => { env = await setupUi(); await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' }); });
after(async () => { await env?.server?.api('PUT', '/api/toolchain', { mode: 'local' }).catch(() => {}); await env?.teardown?.(); });
const E = () => env;
const STEPS = ['synth', 'translate', 'map', 'par', 'impl', 'bitgen'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A menu's item by its English labels, in the page's language. */
async function menu(page, m, item) {
  const [a, b] = await page.eval(async (x, y) => { const { t } = await import('/js/i18n.js'); return [t(x), t(y)]; }, m, item);
  await page.menu(a, b);
}
/** Process ▸ Implement Top Module, to its end: the console's lines it added, and the processes' states. */
async function implement(page) {
  const n0 = await page.eval(() => document.getElementById('console-log').innerText.length);
  await menu(page, 'Process', 'Implement Top Module');
  await page.waitFor((st) => st.every((k) => ['ok', 'warn', 'error'].includes(window.SilinxApp.S.status[k])) && !document.querySelector('.proc-running, .running'), [STEPS], { what: 'the implementation run', timeout: 240000 });
  await sleep(500);
  const text = await page.eval((n) => document.getElementById('console-log').innerText.slice(n), n0);
  return { text, status: await page.eval((st) => st.map((k) => window.SilinxApp.S.status[k]), STEPS) };
}
const warningsOf = (text) => text.split('\n').filter((l) => /^(WARNING|AVISO|ERROR|ERRO)\b/.test(l.trim())).map((l) => l.trim());

uiTest('usability: flow: the gates example implemented, its schematic edited, implemented again; no warnings', E, async (page) => {
  await makeProject(env, { name: 'UsabFlow', template: 'gates' });
  await page.openProject('UsabFlow');
  if (RUN.lang !== 'en') await page.eval(async (l) => { (await import('/js/i18n.js')).setLanguage(l); }, RUN.lang);
  const first = await implement(page);
  assert.deepEqual(first.status, STEPS.map(() => 'ok'), first.text.slice(-2000));
  assert.deepEqual(warningsOf(first.text), [], 'no warnings');
  // the schematic edited: an inverter dragged (its wires follow), the drawing checked as a step; its HDL made again
  const s = new SchSession(page, env, { file: FILE, title: 'flow: edit' });
  await s.open('src/gates.sch.json');
  await s.step('moveSymbol', { name: 'inv_b', dx: 20 }, () => s.a.moveSymbol('inv_b', 20, 0));
  // (the HDL the same after a move, nor its instances' names in it: the results still current; the net c_n renamed
  // with the Net Name tool on its name changes it, saved by itself)
  await s.step('netName', { at: '(390, 340)', name: 'cn' }, () => s.a.netName(390, 340, 'cn'), {
    expect: (d) => assert.deepEqual(d.labels.filter((l) => /^c_?n$/.test(l.net)).map((l) => l.net), ['cn']),
  });
  // the results out of date: the processes no longer all done
  await page.waitFor((st) => st.some((k) => window.SilinxApp.S.status[k] !== 'ok'), [STEPS], { what: 'the processes out of date', timeout: 15000 });
  const again = await implement(page);
  assert.deepEqual(again.status, STEPS.map(() => 'ok'), again.text.slice(-2000));
  assert.deepEqual(warningsOf(again.text), [], 'no warnings');
});

uiTest('usability: flow: the Board Emulator on the gates example: every number of the switches, the LEDs the prime detector\'s', E, async (page) => {
  await makeProject(env, { name: 'UsabEmu', template: 'gates' });
  await page.openProject('UsabEmu');
  if (RUN.lang !== 'en') await page.eval(async (l) => { (await import('/js/i18n.js')).setLanguage(l); }, RUN.lang);
  await menu(page, 'Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'the emulator running', timeout: 60000 });
  // (the board's switches and LEDs as on the Basys2: SW7 … SW0 and LD7 … LD0 from the left; SW0 found by its tip)
  const swIndex = await page.eval(() => [0, 1, 2, 3].map((b) => [...document.querySelectorAll('.emu-sw')].findIndex((e) => e.title.startsWith(`SW${b} `))));
  assert.deepEqual(swIndex, [7, 6, 5, 4]);
  const ledOf = (k) => 7 - k;
  const lit = () => page.eval((ix) => ix.map((i) => { const l = document.querySelectorAll('.emu-led')[i]; return !!l.style.boxShadow && l.style.boxShadow !== 'none'; }), [ledOf(0), ledOf(1)]);
  const sw = () => page.eval((ix) => ix.map((i) => document.querySelectorAll('.emu-sw')[i].classList.contains('on')), swIndex);
  const PRIMES = new Set([2, 3, 5, 7, 11, 13]);
  for (let n = 0; n < 16; n++) {
    // the switches flipped where they differ from n's bits (SW0 its least significant), with a click each
    const now = await sw();
    for (let b = 0; b < 4; b++) if (now[b] !== !!((n >> b) & 1)) await page.click('.emu-sw', { index: swIndex[b] });
    assert.deepEqual(await sw(), [0, 1, 2, 3].map((b) => !!((n >> b) & 1)), `the switches at ${n}`);
    // both LEDs (its two ways of making F: sum of products and NANDs) lit for a prime, dark otherwise
    const want = PRIMES.has(n);
    await page.waitFor((w, ix) => ix.every((i) => { const l = document.querySelectorAll('.emu-led')[i]; return (!!l.style.boxShadow && l.style.boxShadow !== 'none') === w; }), [want, [ledOf(0), ledOf(1)]], { what: `the LEDs at ${n}: ${want ? 'lit' : 'dark'}`, timeout: 5000 });
    assert.deepEqual(await lit(), [want, want], `n = ${n}`);
  }
  assert.deepEqual(warningsOf(await page.eval(() => document.getElementById('console-log').innerText)), [], 'no warnings');
});
