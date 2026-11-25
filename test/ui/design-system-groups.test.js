// UI (#5488): a System project's Design pane grouped by node (web/js/design-system.js): under the System's row, one
// branch per node with its folder's rows (the FPGA node's module and its folder's other modules and packages, the
// Arduino's firmware first and then its folder's sources); the rows in no node's folder under the System itself. New
// Source puts a source in the selected node's folder, in its base language (an FPGA node in Verilog), else in the first
// FPGA node's. A CPU node's drawing: its last badge its node's language (C), in Portuguese too. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const vhdl = (n) => `library ieee;\nuse ieee.std_logic_1164.all;\nentity ${n} is\n  port (a : in std_logic; y : out std_logic);\nend ${n};\narchitecture rtl of ${n} is\nbegin\n  y <= a;\nend rtl;\n`;
// (a state diagram in the Arduino's folder: a CPU node's drawing, its last badge its node's language, #5488)
const LOCK = (() => { const d = JSON.parse(fs.readFileSync(new URL('../../examples/lock/src/lock.fsm.json', import.meta.url), 'utf8')); delete d.generatedFile; return JSON.stringify(d, null, 2); })();
const PKG = 'package consts is\n  constant WIDTH : integer := 8;\nend package;\n';
// the System's rows: [its own rows' labels, each node's [label, its rows' labels]]
const groups = (page) => page.eval(() => {
  const sys = [...document.querySelectorAll('#hier li')].find((li) => li.querySelector(':scope > .row .badge')?.textContent === 'System');
  const lbl = (li) => li.querySelector(':scope > .row .lbl').textContent.trim();
  const kids = [...sys.querySelectorAll(':scope > ul > li')];
  const isNode = (li) => li.querySelector(':scope > .row').dataset.key.startsWith('node:');
  return kids.map((li) => (isNode(li) ? [lbl(li), [...li.querySelectorAll(':scope > ul > li')].map(lbl)] : lbl(li)));
});
const fileGrid = (page) => page.eval(() => { const g = document.querySelector('.dlg-overlay .form-grid'); return [g.querySelectorAll('input')[1].value, g.querySelector('select')?.value]; });
const warnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((l) => /^(WARNING|ERROR)/.test(l)));

async function newSourcePlace(page) {
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await page.dialogButton('Next >');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .form-grid'), [], { what: 'the File Name and Location page' });
  const at = await fileGrid(page);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  return at;
}

uiTest('#5488 the Design pane grouped by node: each node\'s folder\'s rows under it, the others under the System; New Source in the selected node\'s folder and language', E, async (page) => {
  await makeProject(env, { name: 'Groups', template: 'uart-avr', files: { 'fpga/extra.vhd': vhdl('extra'), 'fpga/consts.vhd': PKG, 'other/misc.vhd': vhdl('misc'), 'uno/lock.fsm.json': LOCK } });
  await page.openProject('Groups');
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'misc'), [], { what: 'the rows' });
  assert.deepEqual(await groups(page), [['uno', ['lock', 'hello.hex', 'hello.asm']], ['fpga', ['uart', 'extra', 'consts']], 'misc']);
  // (the Arduino's drawing: its badge first, then its node's language, C, no schematic of it; the FPGA node's module: its HDL's)
  const badges = (label) => page.eval((l) => [...[...document.querySelectorAll('#hier .row')].find((r) => r.querySelector('.lbl')?.textContent.trim() === l).querySelectorAll('.badge')].map((b) => [b.textContent, b.title]), label);
  assert.deepEqual(await badges('lock'), [['FSM', 'Open'], ['C', 'The node\'s base language: C']]);
  assert.deepEqual((await badges('extra')).map(([t]) => t), ['VHDL']);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor(() => [...document.querySelectorAll('#hier .badge')].some((b) => b.title === 'A linguagem de base do nó: C'), [], { what: 'the badge in Portuguese' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  // New Source: the first FPGA node's folder by default (nothing of a node selected), then the selected node's in its language
  await page.treeRow('#hier', 'misc', { exact: true });
  assert.deepEqual(await newSourcePlace(page), ['fpga', 'vhdl']);
  await env.server.api('PUT', `/api/projects/Groups/file?path=${encodeURIComponent('uart_avr.sys.json')}`,
    (await env.server.api('GET', `/api/projects/Groups/file?path=${encodeURIComponent('uart_avr.sys.json')}`, undefined, { text: true })).replace('"lang": "vhdl"', '"lang": "verilog"'));
  await page.openProject('Groups');
  await page.leftTab('design');
  await page.treeRow('#hier', 'fpga', { exact: true });
  assert.deepEqual(await newSourcePlace(page), ['fpga', 'verilog']);
  // (a row of a file in the node's folder: its node's)
  await page.treeRow('#hier', 'extra', { exact: true });
  assert.deepEqual(await newSourcePlace(page), ['fpga', 'verilog']);
  assert.deepEqual(await warnings(page), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
