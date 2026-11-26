// UI (#4700): the System editor of a System project. The Design pane's row `<name> [System]` in place of the device, the
// FPGA nodes' modules under it; the System opened, built with the editor's tools (an FPGA node on the uart module, an
// Arduino Uno, a serial terminal placed; a UART added to the FPGA node, its TX and RX ports set in the properties, their
// pins in its constraints file (#5581: named in its properties); the Uno's Serial linked to it, undone and redone by Edit ▸ Undo / Redo), saved by the autosave as the format has it, closed and reopened as it was;
// its check's warnings in the console's Warnings (a 5 V output on a 3.3 V input, a terminal that joins nothing) and Check's
// lines in the Console; an edit refused said in the console; Portuguese; both interfaces. No other warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { newSystem } from '../../core/system-doc.js';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const FILE = 'uart_avr.sys.json';

// a project file once `ok` says it is right (written by the autosave a moment after the edit)
async function untilSaved(ok, what, timeout = 15000) {
  const t0 = Date.now();
  let m;
  for (;;) {
    try { m = JSON.parse(await readWs(env, 'CoSys', FILE)); if (ok(m)) return m; } catch { /* not yet */ }
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${FILE}: ${what} (last: ${JSON.stringify(m)})`);
    await new Promise((r) => setTimeout(r, 100));
  }
}
const ifaceRow = (page, id) => page.eval((ed, id) => { const r = document.querySelector(`${ed} .sys-iface[data-id="${id}"] .sys-iface-row`).getBoundingClientRect(); return { x: r.x + r.width / 3, y: r.y + r.height / 2 }; }, ED, id);
const setField = (page, sel, value) => page.eval((ed, sel, value) => {
  const el = document.querySelector(`${ed} .asm-side ${sel}`);
  el.value = value; el.dispatchEvent(new Event('change', { bubbles: true }));
}, ED, sel, value);
const warnings = (page) => page.eval(() => window.SilinxApp.S.diags.filter((d) => d.source === 'editor' && d.tool === 'System').map((d) => `${d.severity}: ${d.message}`));

uiTest('#4700 the System editor: its Design row, a system built, saved and reopened, its check\'s warnings in the console; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CoSys', template: 'uart', files: { [FILE]: JSON.stringify(newSystem('uart_avr'), null, 2) } });
  const pj = await env.server.api('GET', '/api/projects/CoSys');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/CoSys', { ...pj, kind: 'system', board: null, constraints: null, top: null });
  await page.openProject('CoSys');
  await page.leftTab('design');
  // the Design pane: the System's row, nothing under it yet
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => r.querySelector('.lbl')?.textContent.trim() === 'uart_avr'), [], { what: 'the System\'s row' });
  const row = () => page.eval(() => { const r = [...document.querySelectorAll('#hier .row')].find((x) => x.querySelector('.lbl')?.textContent.trim() === 'uart_avr'); return [...r.querySelectorAll('.badge')].map((b) => b.textContent); });
  assert.deepEqual(await row(), ['System']);
  await page.click('#hier .row .badge', { text: 'System' });
  await page.waitFor((ed) => window.Silinx.active?.id === `sys:uart_avr.sys.json` && document.querySelector(ed), [ED], { what: 'the System editor' });
  const view = await page.eval((ed) => {
    const el = document.querySelector(ed), shown = (b) => !b.hidden && b.getClientRects().length > 0;
    return { tools: [...el.querySelectorAll('.asm-toolbar .asm-btn')].filter(shown).map((b) => b.textContent.trim()).filter(Boolean), status: el.querySelector('.doc-status')?.textContent, hint: el.querySelector('.asm-hint') };
  }, ED);
  for (const t of ['FPGA', 'Arduino Uno', 'Arduino Nano', 'Terminal', 'Link', 'Check']) assert.ok(view.tools.includes(t), `${t}: ${view.tools.join(', ')}`);
  assert.equal(view.status, '0 nodes · 0 links');
  assert.equal(view.hint, null);   // (no hint line)
  // the nodes placed: an FPGA node (the project's first module: uart), an Arduino Uno, a terminal
  const canvas = await page.eval((ed) => { const r = document.querySelector(`${ed} .sys-canvas`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, ED);
  const place = async (tool, fx, fy) => { await page.click(`${ED} .sys-tool`, { text: tool }); await page.click({ x: canvas.x + canvas.w * fx, y: canvas.y + canvas.h * fy }); };
  await place('FPGA', 0.7, 0.3);
  await place('Arduino Uno', 0.2, 0.3);
  await place('Terminal', 0.7, 0.75);
  await page.waitFor((ed) => document.querySelector(`${ed} .doc-status`)?.textContent === '3 nodes · 0 links', [ED], { what: 'three nodes' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .sys-node`)].map((g) => g.dataset.id), ED), ['fpga', 'mcu', 'term']);
  // the FPGA node: its module uart; a UART added, its TX and RX ports, their pins
  await page.click(`${ED} .sys-node[data-id="fpga"] .sys-head`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-selection h3`)?.textContent === 'FPGA fpga', [ED], { what: 'its properties' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .sys-module`).value, ED), 'uart');
  await setField(page, '.sys-variant', '250');
  await page.click(`${ED} .sys-add-uart`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-selection h3`)?.textContent === 'UART fpga.uart1', [ED], { what: 'the UART\'s properties' });
  await setField(page, '.sys-tx', 'tx');
  await setField(page, '.sys-rx', 'rx');
  // (its pins: its constraints file's, named in its properties, edited by its I/O Pin Planning or as text, #5581; written
  // here as they would write it, the project read again)
  await page.click(`${ED} .sys-node[data-id="fpga"] .sys-head`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-constraints`)?.textContent === 'fpga/uart.ucf', [ED], { what: 'its constraints file named' });
  // (I/O Pin Planning alone: its Text view the file as text, no Edit Constraints (Text) button, #5642)
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .sys-pins, ${ed} .sys-edit-constraints`)].map((b) => b.textContent), ED), ['I/O Pin Planning']);
  await env.server.api('PUT', `/api/projects/CoSys/file?path=${encodeURIComponent('fpga/uart.ucf')}`, 'NET "tx" LOC = "B5" ;\nNET "rx" LOC = "J3" ;\n');
  await page.eval(() => window.SilinxApp.reloadProject());
  // the link: the Uno's Serial, then the FPGA's UART
  await page.click(`${ED} .sys-tool`, { text: 'Link' });
  await page.click(await ifaceRow(page, 'mcu.Serial'));
  await page.click(await ifaceRow(page, 'fpga.uart1'));
  await page.waitFor((ed) => document.querySelector(`${ed} .doc-status`)?.textContent === '3 nodes · 1 link', [ED], { what: 'the link' });
  // Edit ▸ Undo takes it away, Redo brings it back
  await page.menu('Edit', 'Undo');
  await page.waitFor((ed) => document.querySelector(`${ed} .doc-status`)?.textContent === '3 nodes · 0 links', [ED], { what: 'the link undone' });
  await page.menu('Edit', 'Redo');
  await page.waitFor((ed) => document.querySelector(`${ed} .doc-status`)?.textContent === '3 nodes · 1 link', [ED], { what: 'the link redone' });
  // a link that cannot be: the terminal's UART to the FPGA's, linked already
  await page.click(`${ED} .sys-tool`, { text: 'Link' });
  await page.click(await ifaceRow(page, 'term.serial'));
  await page.click(await ifaceRow(page, 'fpga.uart1'));
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent.includes('WARNING: uart_avr.sys.json: fpga.uart1 is linked already (serial): an interface joins one link')), [], { what: 'the refusal' });
  // saved as the format has it
  const m = await untilSaved((x) => x.links.length === 1, 'the system built');
  assert.deepEqual(m.nodes.map((n) => [n.id, n.kind, n.board, n.module ?? null]), [['fpga', 'fpga', 'basys2', 'uart'], ['mcu', 'mcu', 'arduino-uno', null], ['term', 'terminal', undefined, null]]);
  assert.deepEqual([m.nodes[0].variant, m.nodes[0].pins, m.nodes[0].interfaces], ['250', undefined, [{ name: 'uart1', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }]]);
  assert.deepEqual(m.links, [{ id: 'serial', kind: 'uart', a: 'mcu.Serial', b: 'fpga.uart1' }]);
  // its check's warnings in the console's Warnings, as the editor shows it
  const W5 = "serial: mcu's D1, a 5 V output, drives fpga's rx (pin J3), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards";
  await page.waitFor((w) => window.SilinxApp.S.diags.some((d) => d.tool === 'System' && d.message === w), [W5], { what: 'the 5 V warning' });
  assert.deepEqual(await warnings(page), [`warning: ${W5}`, 'warning: term joins nothing: no link reaches it']);
  // Check: its lines in the Console
  await page.click(`${ED} .sys-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent.trim() === 'Process "Check System" completed successfully with 2 warning(s)'), [], { what: 'Check\'s lines' });
  const run = await page.eval(() => { const ls = [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent.trim()).filter(Boolean); const i = ls.lastIndexOf('Started : "Check System" of uart_avr.sys.json.'); return ls.slice(i, i + 4); });
  assert.deepEqual(run, ['Started : "Check System" of uart_avr.sys.json.', `WARNING: ${W5}`, 'WARNING: term joins nothing: no link reaches it', 'Process "Check System" completed successfully with 2 warning(s)']);
  // the Design row: the FPGA node's module under the System
  await page.waitFor(() => [...document.querySelectorAll('#hier .row')].some((r) => r.querySelector('.lbl')?.textContent.trim() === 'uart'), [], { what: 'the module under the System' });
  // closed and reopened as it was
  await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('sys:uart_avr.sys.json'), { force: true }));
  await page.click('#hier .row .badge', { text: 'System' });
  await page.waitFor((ed) => document.querySelector(`${ed} .doc-status`)?.textContent === '3 nodes · 1 link', [ED], { what: 'reopened' });
  assert.deepEqual(await page.eval(() => window.Silinx.active.systemEditor.getModel().links), m.links);
  // in Portuguese
  await page.click(`${ED} .sys-node[data-id="mcu"] .sys-head`);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-selection h3`)?.textContent === 'Microcontrolador mcu' && document.querySelector(`${ed} .doc-status`)?.textContent === '3 nós · 1 ligação', [ED], { what: 'Portuguese' });
  const pt = await page.eval((ed) => [...document.querySelectorAll(`${ed} .asm-side .asm-label`)].map((l) => l.textContent), ED);
  assert.deepEqual(pt.slice(0, 5), ['Identificador', 'Placa', 'Identificador USB', 'Número de série USB', 'Programa (firmware)']);   // (its board's USB id and serial, #5489)
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // (the warnings: the refusal only, said by the editor)
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

uiTest('#4700 the System editor mounted alone, read only (a project followed): no tools, its notice, nothing moved, deleted or changed', E, async (page) => {
  const model = { format: 'silinx-system', version: 2, name: 'ro', nodes: [
    { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: null, interfaces: [{ name: 'Serial', kind: 'uart', baud: 9600, frame: '8N1' }], x: 0, y: 0 },
    { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 9600, frame: '8N1' }], x: 300, y: 0 }],
  links: [{ id: 'serial', kind: 'uart', a: 'uno.Serial', b: 'term.serial' }] };
  await page.eval(async (m) => {
    const { mountSystemEditor } = await import('/js/system-editor.js');
    const host = document.createElement('div');
    Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: 9999, background: 'white', display: 'flex' });
    host.id = 'ro-host';
    document.body.append(host);
    const banner = document.createElement('span'); banner.className = 'ro-banner'; banner.textContent = 'Read-only';
    window.roEd = mountSystemEditor(host, { model: m, readOnly: true, banner, check: () => [] });
  }, model);
  const RO = '#ro-host .system-editor';
  await page.waitFor((ed) => document.querySelector(`${ed} .doc-status`)?.textContent === '2 nodes · 1 link', [RO], { what: 'the editor' });
  const shown = await page.eval((ed) => [...document.querySelectorAll(`${ed} .asm-toolbar button`)].filter((b) => !b.hidden).map((b) => b.dataset.act || b.textContent.trim()), RO);
  assert.ok(!shown.some((t) => ['FPGA', 'Arduino Uno', 'Arduino Nano', 'Terminal', 'Link', 'del'].includes(t)), shown.join(', '));
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .asm-toolbar .ro-banner`)?.textContent, RO), 'Read-only');
  const before = await page.eval(() => JSON.stringify(window.roEd.getModel()));
  const head = await page.eval((ed) => { const r = document.querySelector(`${ed} .sys-node[data-id="uno"] .sys-head`).getBoundingClientRect(); return { x: r.x + 20, y: r.y + 10 }; }, RO);
  await page.drag(head, { x: head.x + 120, y: head.y + 80 });
  await page.click(head);
  await page.eval((ed) => document.querySelector(ed).dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })), RO);
  assert.ok(await page.eval((ed) => [...document.querySelectorAll(`${ed} .asm-side input, ${ed} .asm-side select`)].every((x) => x.disabled || x.readOnly), RO));
  assert.equal(await page.eval(() => JSON.stringify(window.roEd.getModel())), before);
  assert.equal(await page.eval(() => window.roEd.canDelete()), false);
  await page.eval(() => { window.roEd.destroy(); document.getElementById('ro-host').remove(); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
