// UI (#5484): a System's PIC24 node. In a System project's System editor: the Explorer 16/32 tool places one (its board,
// its UART), its properties (its firmware a .hex of its folder, not an .elf; no SPI or I²C yet), linked to a terminal,
// saved as the format has it; Try it runs its firmware (made by the tests' assembler): its prompt in the terminal, a
// line typed echoed back; no warnings. Portuguese; both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { newSystem } from '../../core/system-doc.js';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { echoHex } from '../pic24-node-lib.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const FILE = 'pic.sys.json';

async function untilSaved(ok, what, timeout = 15000) {
  const t0 = Date.now();
  let m;
  for (;;) {
    try { m = JSON.parse(await readWs(env, 'PicSys', FILE)); if (ok(m)) return m; } catch { /* not yet */ }
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${FILE}: ${what} (last: ${JSON.stringify(m)})`);
    await new Promise((r) => setTimeout(r, 100));
  }
}
const ifaceRow = (page, id) => page.eval((ed, id) => { const r = document.querySelector(`${ed} .sys-iface[data-id="${id}"] .sys-iface-row`).getBoundingClientRect(); return { x: r.x + r.width / 3, y: r.y + r.height / 2 }; }, ED, id);
const setField = (page, sel, value) => page.eval((ed, sel, value) => {
  const el = document.querySelector(`${ed} .asm-side ${sel}`);
  el.value = value; el.dispatchEvent(new Event('change', { bubbles: true }));
}, ED, sel, value);

uiTest('#5484 the Explorer 16/32 in the System editor: placed, its .hex, linked to a terminal; Try it echoes what is typed; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'PicSys', template: 'uart', files: { [FILE]: JSON.stringify(newSystem('pic'), null, 2), 'mcu/echo.hex': echoHex(), 'mcu/old.elf': 'x' } });
  const pj = await env.server.api('GET', '/api/projects/PicSys');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/PicSys', { ...pj, kind: 'system', board: null, constraints: null, top: null });
  await page.openProject('PicSys');
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .badge')].some((b) => b.textContent === 'System'), [], { what: 'the System\'s row' });
  await page.click('#hier .row .badge', { text: 'System' });
  await page.waitFor((ed) => document.querySelector(ed), [ED], { what: 'the System editor' });
  const tool = await page.eval((ed) => { const b = document.querySelector(`${ed} .sys-add-explorer`); return [b.textContent.trim(), b.title, !b.hidden]; }, ED);
  assert.deepEqual(tool, ['Explorer 16/32', 'Click the canvas to add an Explorer 16/32: a PIC24FJ1024GB610, its firmware a .hex', true]);
  const canvas = await page.eval((ed) => { const r = document.querySelector(`${ed} .sys-canvas`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, ED);
  const place = async (cls, fx, fy) => { await page.click(`${ED} ${cls}`); await page.click({ x: canvas.x + canvas.w * fx, y: canvas.y + canvas.h * fy }); };
  await place('.sys-add-explorer', 0.25, 0.3);
  await page.click(`${ED} .sys-tool`, { text: 'Terminal' });
  await page.click({ x: canvas.x + canvas.w * 0.7, y: canvas.y + canvas.h * 0.6 });
  await page.waitFor((ed) => document.querySelector(`${ed} .doc-status`)?.textContent === '2 nodes · 0 links', [ED], { what: 'two nodes' });
  // its properties: the board, its firmware (its folder's .hex only), its buttons (GPIO; no SPI nor I²C yet)
  await page.click(`${ED} .sys-node[data-id="mcu"] .sys-head`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-selection h3`)?.textContent === 'Microcontroller mcu', [ED], { what: 'its properties' });
  const side = await page.eval((ed) => {
    const s = document.querySelector(`${ed} .asm-side`), fw = s.querySelector('.sys-firmware');
    return { board: s.querySelector('.sys-board').value, boards: [...s.querySelector('.sys-board').options].map((o) => o.textContent), firmware: [...fw.options].map((o) => o.value),
      hint: fw.closest('.asm-field').querySelector('.asm-fhint').textContent, adds: [...s.querySelectorAll('.asm-small')].map((b) => b.textContent.trim()) };
  }, ED);
  assert.deepEqual([side.board, side.boards, side.firmware, side.adds.filter((t) => t.startsWith('+'))], ['explorer-1632', ['Arduino Uno', 'Arduino Nano', 'Explorer 16/32'], ['', 'mcu/echo.hex'], ['+ GPIO']]);
  assert.equal(side.hint, 'a .hex of the project (XC16\'s)');
  assert.deepEqual(await page.eval((ed) => document.querySelector(`${ed} .sys-node[data-id="mcu"]`).textContent.includes('Explorer 16/32'), ED), true);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-add-explorer`)?.title.startsWith('Clique') && document.querySelector(`${ed} .asm-side .sys-firmware`), [ED], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((ed) => { const fw = document.querySelector(`${ed} .asm-side .sys-firmware`); return [document.querySelector(`${ed} .sys-add-explorer`).title, fw.closest('.asm-field').querySelector('.asm-fhint').textContent]; }, ED),
    ['Clique na tela para acrescentar uma Explorer 16/32: um PIC24FJ1024GB610, o seu programa um .hex', 'um .hex do projeto (do XC16)']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await setField(page, '.sys-firmware', 'mcu/echo.hex');
  // linked to the terminal: its UART, the USB-UART's pins
  await page.click(`${ED} .sys-tool`, { text: 'Link' });
  await page.click(await ifaceRow(page, 'mcu.UART'));
  await page.click(await ifaceRow(page, 'term.serial'));
  await page.waitFor((ed) => document.querySelector(`${ed} .doc-status`)?.textContent === '2 nodes · 1 link', [ED], { what: 'the link' });
  const m = await untilSaved((x) => x.links.length === 1 && x.nodes[0]?.firmware, 'the node and its link');
  assert.deepEqual(m.nodes[0], { id: 'mcu', kind: 'mcu', board: 'explorer-1632', firmware: 'mcu/echo.hex', lang: 'c', interfaces: [{ name: 'UART', kind: 'uart', baud: 9600, frame: '8N1' }], x: m.nodes[0].x, y: m.nodes[0].y });
  assert.deepEqual(m.links, [{ id: 'serial', kind: 'uart', a: 'mcu.UART', b: 'term.serial' }]);
  // Try it: the PIC24's prompt, then a line typed echoed
  await page.click(`${ED} .sys-sim-btn`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-sim-panel:not([hidden]) .sys-run-for`), [ED], { what: 'the simulation view' });
  await page.click(`${ED} .sys-run-for`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-term-out`)?.textContent === '>' && !window.Silinx.active.systemEditor.sim.state()?.running, [ED], { what: 'its prompt', timeout: 60000 });
  await page.click(`${ED} .sys-term-in`);
  await page.type('Hi');
  await page.key('Enter');
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-term-out`)?.textContent === '>Hi\n', [ED], { what: 'the echo', timeout: 30000 });
  await page.waitFor(() => !window.Silinx.active.systemEditor.sim.state()?.running, [], { what: 'the run ended', timeout: 30000 });
  const s = await page.eval(() => window.Silinx.active.systemEditor.sim.state());
  assert.deepEqual([s.warnings, s.errors, s.traffic.map((t) => [t.wire, t.from, t.to])], [[], [], [['serial_mcu', 'mcu.RF5', 'term.rx'], ['serial_term', 'term.tx', 'mcu.RF4']]]);
  const lines = await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent.trim()).filter(Boolean));
  assert.ok(lines.includes('Simulate System: mcu, term ready, 2 wire(s).'), lines.join('\n'));
  assert.deepEqual(lines.filter((l) => /^(ERROR|WARNING)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
