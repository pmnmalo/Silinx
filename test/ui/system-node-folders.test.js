// UI (#5488): a System project's nodes as folders in the System editor (web/js/system-folders-ui.js): the uart-avr
// example's node renamed, its folder renamed with it when the System is saved (its firmware's path too); a node
// removed, the user asked whether its folder goes: No keeps it, Yes (in Portuguese) deletes it; an old System project
// (its document of version 1) said when it is opened. The warnings: each save's Check System. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const tree = async (name) => (await env.server.api('GET', `/api/projects/${name}`)).fileTree.filter((f) => f !== 'silinx.json');
const consoleLines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const errors = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((l) => /^(WARNING|ERROR)/.test(l)));
const selectNode = async (page, id) => {
  // (selected through the editor: the clicks on its canvas are its own tests')
  await page.eval((id) => window.Silinx.active.systemEditor.select({ kind: 'node', id }), id);
  await page.waitFor((ed, id) => document.querySelector(`${ed} .sys-selection h3`)?.textContent.endsWith(` ${id}`), [ED, id], { what: `${id}'s properties` });
};
const removeSelected = (page) => page.eval((ed) => document.querySelector(ed).dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })), ED);
const dialogText = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop()?.querySelector('.dlg-body')?.innerText.trim().replace(/^\?\n/, ''));   // (its icon, ?, first)

uiTest('#5488 a node renamed: its folder renamed with it; a node removed: its folder kept (No) or deleted (Yes, in Portuguese)', E, async (page) => {
  await makeProject(env, { name: 'Folders', template: 'uart-avr' });
  await page.openProject('Folders');
  await page.leftTab('design');
  await page.treeRow('#hier', 'uart_avr', { exact: true, dbl: true });
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .sys-node`).length === 2, [ED], { what: 'the System editor' });
  // renamed: uno → avr, its folder and firmware with it once saved
  await selectNode(page, 'uno');
  await page.eval((ed) => { const el = document.querySelector(`${ed} .sys-selection input`); el.value = 'avr'; el.dispatchEvent(new Event('change', { bubbles: true })); }, ED);
  await page.waitFor(async () => (await (await fetch('/api/projects/Folders')).json()).fileTree.includes('avr/hello.hex'), [], { what: 'the folder renamed' });
  await page.waitConsole(/^Folder uno renamed to avr\.$/m);
  assert.deepEqual(await tree('Folders'), ['avr/hello.asm', 'avr/hello.hex', 'fpga/debounce.vhd', 'fpga/sevenseg.vhd', 'fpga/uart.vhd', 'fpga/uart_rx.vhd', 'fpga/uart_tx.vhd', 'uart_avr.sys.json']);
  await page.waitFor(async () => /"firmware": "avr\/hello\.hex"/.test(await (await fetch('/api/projects/Folders/file?path=uart_avr.sys.json')).text()), [], { what: 'the System saved' });
  // removed: asked; No keeps its folder
  await selectNode(page, 'avr');
  await removeSelected(page);
  await page.waitDialog('Remove Node');
  assert.equal(await dialogText(page), "Delete the folder 'avr' of the removed node avr and the 2 file(s) in it from the project?\n(They are moved to the workspace's .trash folder, from where you can move them back.)\n\navr/hello.asm\navr/hello.hex");
  await page.dialogButton('No');
  await page.waitConsole(/^Folder avr of the removed node avr kept\.$/m);
  assert.ok((await tree('Folders')).includes('avr/hello.hex'));
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/Folders/file?path=uart_avr.sys.json')).text()).nodes.length === 1, [], { what: 'saved without it' });
  // back (Undo: its folder there, nothing asked), then removed again in Portuguese: Yes deletes it
  await page.menu('Edit', 'Undo');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .sys-node`).length === 2, [ED], { what: 'the node back' });
  await page.waitFor(async () => JSON.parse(await (await fetch('/api/projects/Folders/file?path=uart_avr.sys.json')).text()).nodes.length === 2, [], { what: 'saved with it' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await selectNode(page, 'avr');
  await removeSelected(page);
  await page.waitDialog('Remover Nó');
  assert.equal(await dialogText(page), "Apagar a pasta 'avr' do nó removido avr e o(s) 2 ficheiro(s) que contém do projeto?\n(São movidos para a pasta .trash da área de trabalho, de onde os pode repor.)\n\navr/hello.asm\navr/hello.hex");
  await page.dialogButton('Sim');
  await page.waitFor(async () => !(await (await fetch('/api/projects/Folders')).json()).fileTree.some((f) => f.startsWith('avr/')), [], { what: 'the folder deleted' });
  await page.waitConsole(/^Folder avr deleted \(2 file\(s\); moved to the workspace's \.trash folder: /m);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  // (each save's Check System: the 5 V warning with the Arduino, the FPGA alone without it)
  const HOT = "WARNING: serial: avr's D1, a 5 V output, drives fpga's rx (pin J3), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards";
  const ALONE = 'WARNING: fpga joins nothing: no link reaches it';
  // (#5591: the last save's Check System, after the folder's deletion, may come after its message: waited for)
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].filter((l) => /^(WARNING|ERROR)/.test(l.textContent)).length >= 4, [], { what: 'the last save\'s Check System' });
  assert.deepEqual(await errors(page), [HOT, ALONE, HOT, ALONE]);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});

uiTest('#5488 an old System project (its System document of version 1): said when it is opened, not read', E, async (page) => {
  const OLD = JSON.stringify({ format: 'silinx-system', version: 1, name: 'old', nodes: [{ id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'firmware/a.hex', interfaces: [] }], links: [] }, null, 2);
  await makeProject(env, { name: 'OldSys', template: 'uart', files: { 'old.sys.json': OLD } });
  const pj = await env.server.api('GET', '/api/projects/OldSys');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/OldSys', { ...pj, kind: 'system', board: null, constraints: null, top: null });
  await page.openProject('OldSys');
  const said = 'ERROR: old.sys.json: a System document of version 1, made before each node was a folder of its project (#5488): this Silinx does not read it; make the System again in a new System project, each node\'s files in its folder';
  await page.waitFor((s) => [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent === s), [said], { what: 'the old System said' });
  assert.deepEqual((await consoleLines(page)).filter((l) => /^(WARNING|ERROR)/.test(l)), [said]);
});

uiTest('#5488 the regs-avr example\'s register map: its Header written in the System\'s microcontroller\'s folder', E, async (page) => {
  await makeProject(env, { name: 'RegsAvr', template: 'regs-avr' });
  await page.openProject('RegsAvr');
  await page.eval(async () => (await import('/js/drawings-regs.js')).openRegs('fpga/pwm_regs.regs.json'));
  await page.waitFor(() => !!document.querySelector('.doc:not([hidden]) .regs-header'), [], { what: 'the register map\'s editor' });
  await page.click('.doc:not([hidden]) .regs-header');
  await page.waitFor(async () => (await (await fetch('/api/projects/RegsAvr')).json()).fileTree.includes('uno/pwm_regs.h'), [], { what: 'the header' });
  await page.waitConsole(/^Wrote uno\/pwm_regs\.h, the header of pwm_regs\.regs\.json\.$/m);
  assert.deepEqual(await errors(page), []);
});
