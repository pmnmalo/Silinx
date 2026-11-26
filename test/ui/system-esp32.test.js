// UI (#5495): a System's ESP32 node, its Worker + Atomics back end, in the local server's page (cross-origin isolated,
// #5648). In a System project's System editor: the ESP32 tool places an ESP32 DevKitC (in MicroPython, its UART2), its
// properties (its program a .py of its folder; no SPI or I²C yet), linked to a terminal, saved as the format has it; Try
// it runs its .py on MicroPython's WebAssembly port in a Worker of its own: the program's bytes in the terminal, its
// console a terminal of its own, a line typed to the terminal echoed back in upper case; no warnings. Portuguese; both
// interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { newSystem } from '../../core/system-doc.js';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const FILE = 'esp.sys.json';
const PY = ['from machine import UART, Pin', 'import time', 'u = UART(2, 9600)', 'u.write(b">")', 'print("ready")',
  'while True:', '    if u.any():', '        u.write(u.read(1).upper())', '    time.sleep_ms(1)', ''].join('\n');

async function untilSaved(ok, what, timeout = 15000) {
  const t0 = Date.now();
  let m;
  for (;;) {
    try { m = JSON.parse(await readWs(env, 'EspSys', FILE)); if (ok(m)) return m; } catch { /* not yet */ }
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${FILE}: ${what} (last: ${JSON.stringify(m)})`);
    await new Promise((r) => setTimeout(r, 100));
  }
}
const ifaceRow = (page, id) => page.eval((ed, id) => { const r = document.querySelector(`${ed} .sys-iface[data-id="${id}"] .sys-iface-row`).getBoundingClientRect(); return { x: r.x + r.width / 3, y: r.y + r.height / 2 }; }, ED, id);
const setField = (page, sel, value) => page.eval((ed, sel, value) => {
  const el = document.querySelector(`${ed} .asm-side ${sel}`);
  el.value = value; el.dispatchEvent(new Event('change', { bubbles: true }));
}, ED, sel, value);
const term = (page, id) => page.eval((ed, id) => document.querySelector(`${ed} .sys-term-out[data-term="${id}"]`)?.textContent ?? null, ED, id);

uiTest('#5495 the ESP32 in the System editor: placed, its .py, linked to a terminal; Try it runs it in its Worker, its console a terminal; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'EspSys', template: 'uart', files: { [FILE]: JSON.stringify(newSystem('esp'), null, 2), 'mcu/main.py': PY, 'mcu/old.hex': ':00000001FF\n' } });
  const pj = await env.server.api('GET', '/api/projects/EspSys');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/EspSys', { ...pj, kind: 'system', board: null, constraints: null, top: null });
  await page.openProject('EspSys');
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .badge')].some((b) => b.textContent === 'System'), [], { what: 'the System\'s row' });
  await page.click('#hier .row .badge', { text: 'System' });
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
  assert.deepEqual(await page.eval((ed) => { const b = document.querySelector(`${ed} .sys-add-esp32`); return [b.textContent.trim(), b.title]; }, ED),
    ['ESP32', 'Click the canvas to add an ESP32 DevKitC: MicroPython, behavioural, its program a .py']);
  const canvas = await page.eval((ed) => { const r = document.querySelector(`${ed} .sys-canvas`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, ED);
  await page.click(`${ED} .sys-add-esp32`);
  await page.click({ x: canvas.x + canvas.w * 0.25, y: canvas.y + canvas.h * 0.3 });
  await page.click(`${ED} .sys-tool`, { text: 'Terminal' });
  await page.click({ x: canvas.x + canvas.w * 0.7, y: canvas.y + canvas.h * 0.6 });
  await page.waitFor((ed) => document.querySelector(`${ed} .doc-status`)?.textContent === '2 nodes · 0 links', [ED], { what: 'two nodes' });
  // its properties: the board, its program (its folder's .py only), no SPI nor I²C yet
  await page.click(`${ED} .sys-node[data-id="mcu"] .sys-head`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-selection h3`)?.textContent === 'Microcontroller mcu', [ED], { what: 'its properties' });
  const side = await page.eval((ed) => {
    const s = document.querySelector(`${ed} .asm-side`), fw = s.querySelector('.sys-firmware'), f = fw.closest('.asm-field');
    return { board: s.querySelector('.sys-board').value, program: [...fw.options].map((o) => o.value), hint: f.querySelector('.asm-fhint').textContent,
      adds: [...s.querySelectorAll('.asm-small')].map((b) => b.textContent.trim()).filter((t) => t.startsWith('+')) };
  }, ED);
  assert.deepEqual(side, { board: 'esp32-devkitc', program: ['', 'mcu/main.py'], hint: 'a .py of the project, run by MicroPython', adds: ['+ GPIO'] });
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-add-esp32`)?.title.startsWith('Clique') && document.querySelector(`${ed} .asm-side .sys-firmware`), [ED], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((ed) => [document.querySelector(`${ed} .sys-add-esp32`).title, document.querySelector(`${ed} .asm-side .sys-firmware`).closest('.asm-field').querySelector('.asm-fhint').textContent], ED),
    ['Clique na tela para acrescentar uma ESP32 DevKitC: MicroPython, comportamental, o seu programa um .py', 'um .py do projeto, corrido pelo MicroPython']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await setField(page, '.sys-firmware', 'mcu/main.py');
  await page.click(`${ED} .sys-tool`, { text: 'Link' });
  await page.click(await ifaceRow(page, 'mcu.UART2'));
  await page.click(await ifaceRow(page, 'term.serial'));
  await page.waitFor((ed) => document.querySelector(`${ed} .doc-status`)?.textContent === '2 nodes · 1 link', [ED], { what: 'the link' });
  const m = await untilSaved((x) => x.links.length === 1 && x.nodes[0]?.firmware, 'the node and its link');
  assert.deepEqual(m.nodes[0], { id: 'mcu', kind: 'mcu', board: 'esp32-devkitc', firmware: 'mcu/main.py', lang: 'micropython',
    interfaces: [{ name: 'UART2', kind: 'uart', baud: 9600, frame: '8N1' }], x: m.nodes[0].x, y: m.nodes[0].y });
  assert.deepEqual(m.links, [{ id: 'serial', kind: 'uart', a: 'mcu.UART2', b: 'term.serial' }]);
  // Try it: the program's > on the terminal, its print on its console; a line typed, echoed
  await page.click(`${ED} .sys-sim-btn`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-sim-panel:not([hidden]) .sys-run-for`), [ED], { what: 'the simulation view' });
  await page.click(`${ED} .sys-run-for`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-term-out[data-term="term"]`)?.textContent === '>' && !window.Silinx.active.systemEditor.sim.state()?.running, [ED], { what: 'its prompt', timeout: 120000 });
  assert.equal(await term(page, 'mcu.repl'), 'ready\n');
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .sys-term-cap`)].map((c) => c.textContent), ED), ['mcu · MicroPython REPL (USB)', 'term · 9600 8N1']);
  await page.click(`${ED} .sys-term:has([data-term="term"]) .sys-term-in`);
  await page.type('hi');
  await page.key('Enter');
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-term-out[data-term="term"]`)?.textContent === '>HI\n', [ED], { what: 'the echo', timeout: 120000 });
  await page.waitFor(() => !window.Silinx.active.systemEditor.sim.state()?.running, [], { what: 'the run ended', timeout: 120000 });
  const s = await page.eval(() => window.Silinx.active.systemEditor.sim.state());
  assert.deepEqual([s.warnings, s.errors, s.traffic.map((t) => [t.wire, t.from, t.to])], [[], [], [['serial_mcu', 'mcu.GPIO17', 'term.rx'], ['serial_term', 'term.tx', 'mcu.GPIO16']]]);
  const lines = await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent.trim()).filter(Boolean));
  assert.deepEqual(lines.filter((l) => /^(ERROR|WARNING)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 300000 });
