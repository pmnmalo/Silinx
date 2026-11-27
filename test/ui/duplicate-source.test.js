// UI: Duplicate of a source or a file (#5862): a module's menu in the Design pane (its window, prefilled with
// name_copy, its Entity / Module name; a name typed), a drawing's (copied as a drawing, its HDL made for it), a selection
// of several rows (each one under its default name), the Files view's menu (a plain file: its path), the Project menu (the
// selected source); the copy in the project, never the top; the console's lines, a refusal said there (a name taken), a
// name that is not one said in the window; Undo takes the copy away, in a project shared live too. In Portuguese too.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newFsm } from '../../core/fsm.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const CTRL = process.platform === 'darwin' ? 4 : 2;
const vhdl = (name) => `library ieee; use ieee.std_logic_1164.all;\nentity ${name} is port (x : in std_logic; y : out std_logic); end ${name};\narchitecture rtl of ${name} is begin y <= x; end rtl;\n`;
const FILES = { 'src/a.vhd': vhdl('a'), 'src/b.vhd': vhdl('b'), 'src/st.fsm.json': JSON.stringify(newFsm('st', 'vhdl'), null, 2), 'data/notes.txt': 'notes\n' };

const project = (name) => env.server.api('GET', `/api/projects/${encodeURIComponent(name)}`);
const pjFiles = async (name) => (await project(name)).files.map((f) => f.path).sort();
const onDisk = (name, f) => fs.existsSync(path.join(env.server.workspace, name, f));
const consoleLines = async (page, re) => (await page.consoleText()).split('\n').filter((l) => re.test(l));
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR|AVISO|ERRO)\b/.test(l));
const modules = (page) => page.eval(() => [...document.querySelectorAll('#hier .row[data-key^="m:"] .lbl')].map((l) => l.textContent));
const waitModules = (page, list) => page.waitFor((l) => JSON.stringify([...document.querySelectorAll('#hier .row[data-key^="m:"] .lbl')].map((x) => x.textContent)) === l, [JSON.stringify(list)], { what: `the modules ${list}` });
async function rowClick(page, label, { modifiers = 0, button } = {}) {
  await page.leftTab('design');
  const i = await page.waitFor((l) => [...document.querySelectorAll('#hier .row .lbl')].findIndex((x) => x.textContent === l) + 1, [label], { what: `row ${label}` });
  return page.click('#hier .row .lbl', { index: i - 1, modifiers, button });
}
const menuItems = (page) => page.waitFor(() => { const m = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => `${i.textContent.trim()}${i.classList.contains('disabled') ? ' (disabled)' : ''}`); return m.length ? m : null; }, [], { what: 'the context menu' });
const pick = (page, text) => page.click('body > .menu-popup .mi', { text });
// the Duplicate window: its field's label and value, its hint
const form = (page) => page.eval(() => {
  const d = [...document.querySelectorAll('.dlg-overlay')].pop();
  return { label: d.querySelector('.form-grid label').textContent, value: d.querySelector('.form-grid input').value, hint: d.querySelector('.hint').textContent };
});
const typeName = (page, v) => page.eval((x) => { const i = [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.form-grid input'); i.value = x; i.dispatchEvent(new Event('input')); }, v);

async function open(page, name) {
  await makeProject(env, { name, top: 'a', files: FILES });
  await page.openProject(name);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/st.vhd'] === 'src/st.fsm.json', [], { what: 'the state diagram linked to its HDL' });
  await waitModules(page, ['a', 'b', 'st']);
}

uiTest('#5862 Duplicate… of a module: its window prefilled with name_copy, the copy in the project, not the top; Undo takes it away', E, async (page) => {
  const name = 'DupModule';
  await open(page, name);
  await rowClick(page, 'b', { button: 'right' });
  const items = await menuItems(page);
  assert.equal(items[items.indexOf('Rename…') + 1], 'Duplicate…');
  await pick(page, 'Duplicate…');
  await page.waitDialog('Duplicate');
  assert.deepEqual(await form(page), { label: 'Entity:', value: 'b_copy', hint: 'The copy is a module of its own, with this name, added to the project.' });
  await page.dialogButton('Duplicate');
  await page.waitNoDialog();
  await waitModules(page, ['a', 'b', 'b_copy', 'st']);
  assert.deepEqual(await consoleLines(page, /^Duplicate: /), ['Duplicate: src/b.vhd → src/b_copy.vhd; module \'b\' copied as \'b_copy\'.']);
  assert.equal(await readWs(env, name, 'src/b_copy.vhd'), vhdl('b_copy'));
  assert.deepEqual(await pjFiles(name), ['src/a.vhd', 'src/b.vhd', 'src/b_copy.vhd', 'src/st.vhd']);
  assert.equal((await project(name)).top, 'a');
  // Undo: the copy gone
  await page.menu('Edit', 'Undo Duplicate');
  await waitModules(page, ['a', 'b', 'st']);
  assert.equal(onDisk(name, 'src/b_copy.vhd'), false);
  assert.deepEqual(await pjFiles(name), ['src/a.vhd', 'src/b.vhd', 'src/st.vhd']);
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5862 a drawing duplicated under the name typed (its HDL made for it); a name taken refused in the console, a bad one in the window', E, async (page) => {
  const name = 'DupDrawing';
  await open(page, name);
  await rowClick(page, 'st', { button: 'right' });
  await pick(page, 'Duplicate…');
  await page.waitDialog('Duplicate');
  assert.deepEqual(await form(page), { label: 'Entity:', value: 'st_copy', hint: 'The copy is a module of its own, with this name, added to the project.' });
  await typeName(page, 'blink');
  await page.dialogButton('Duplicate');
  await page.waitNoDialog();
  await waitModules(page, ['a', 'b', 'blink', 'st']);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/blink.vhd'] === 'src/blink.fsm.json', [], { what: 'the copy linked to its HDL' });
  assert.deepEqual(await consoleLines(page, /^Duplicate: |blink\.vhd/), [
    'Duplicate: src/st.fsm.json → src/blink.fsm.json; module \'st\' copied as \'blink\' (src/blink.vhd with it).',
    'src/blink.vhd updated from src/blink.fsm.json',
  ]);
  assert.equal(JSON.parse(await readWs(env, name, 'src/blink.fsm.json')).name, 'blink');
  assert.match(await readWs(env, name, 'src/blink.vhd'), /^entity blink is/m);
  // a name taken: said in the console, nothing written
  const before = await pjFiles(name);
  await rowClick(page, 'b', { button: 'right' });
  await pick(page, 'Duplicate…');
  await page.waitDialog('Duplicate');
  await typeName(page, 'A');
  await page.dialogButton('Duplicate');
  await page.waitNoDialog();
  await page.waitConsole(/^ERROR: Duplicate: A module named 'A' already exists\.$/m);
  assert.deepEqual(await pjFiles(name), before);
  // not a name: said in the window, which stays open
  await rowClick(page, 'b', { button: 'right' });
  await pick(page, 'Duplicate…');
  await page.waitDialog('Duplicate');
  await typeName(page, '2b');
  await page.dialogButton('Duplicate');
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('.hint')[1].textContent), 'The module name must start with a letter and contain only letters, digits and _.');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(await pjFiles(name), before);
  assert.deepEqual(await warnings(page), ['ERROR: Duplicate: A module named \'A\' already exists.']);
});

uiTest('#5862 a selection\'s Duplicate: each source under its own name; the Files view\'s and the Project menu\'s Duplicate…', E, async (page) => {
  const name = 'DupMany';
  await open(page, name);
  await rowClick(page, 'b');
  await rowClick(page, 'st', { modifiers: CTRL });
  await rowClick(page, 'b', { button: 'right' });
  assert.deepEqual(await menuItems(page), ['Open', 'Remove from Project', 'Duplicate', 'Rename… (disabled)', 'Set as Top Module (disabled)', 'Source Properties… (disabled)']);
  await pick(page, 'Duplicate');
  await waitModules(page, ['a', 'b', 'b_copy', 'st', 'st_copy']);
  assert.deepEqual(await consoleLines(page, /^Duplicate: /), [
    'Duplicate: src/b.vhd → src/b_copy.vhd; module \'b\' copied as \'b_copy\'.',
    'Duplicate: src/st.fsm.json → src/st_copy.fsm.json; module \'st\' copied as \'st_copy\' (src/st_copy.vhd with it).',
  ]);
  // the Files view: a plain file, its path prefilled
  await page.leftTab('files');
  const i = await page.waitFor(() => [...document.querySelectorAll('#files-page tr')].findIndex((tr) => tr.dataset.file === 'data/notes.txt') + 1, [], { what: 'data/notes.txt' });
  await page.rightClick('#files-page tr', { index: i - 1 });
  await pick(page, 'Duplicate…');
  await page.waitDialog('Duplicate');
  assert.deepEqual(await form(page), { label: 'File:', value: 'data/notes_copy.txt', hint: 'The copy is added to the project.' });
  await page.dialogButton('Duplicate');
  await page.waitNoDialog();
  await page.waitConsole(/^Duplicate: data\/notes\.txt → data\/notes_copy\.txt\.$/m);
  assert.equal(await readWs(env, name, 'data/notes_copy.txt'), 'notes\n');
  await page.waitFor(() => !!document.querySelector('#files-page tr[data-file="data/notes_copy.txt"]'), [], { what: 'the copy in the Files view' });
  // the Project menu: the selected source
  await rowClick(page, 'a');
  await page.menu('Project', 'Duplicate…');
  await page.waitDialog('Duplicate');
  assert.equal((await form(page)).value, 'a_copy');
  await page.dialogButton('Duplicate');
  await page.waitNoDialog();
  await waitModules(page, ['a', 'a_copy', 'b', 'b_copy', 'st', 'st_copy']);
  assert.equal((await project(name)).top, 'a');
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5862 in Portuguese: the menus, the window, the console\'s lines', E, async (page) => {
  const name = 'DupPt';
  await open(page, name);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await rowClick(page, 'b', { button: 'right' });
    assert.ok((await menuItems(page)).includes('Duplicar…'));
    await pick(page, 'Duplicar…');
    await page.waitDialog('Duplicar');
    assert.deepEqual(await form(page), { label: 'Entidade:', value: 'b_copy', hint: 'A cópia é um módulo próprio, com este nome, acrescentado ao projeto.' });
    assert.deepEqual(await page.eval(() => [...[...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('.dlg-buttons .btn')].map((b) => b.textContent)), ['Duplicar', 'Cancelar']);
    await page.dialogButton('Duplicar');
    await page.waitNoDialog();
    await page.waitConsole(/^Duplicar: src\/b\.vhd → src\/b_copy\.vhd; módulo 'b' copiado como 'b_copy'\.$/m);
    await rowClick(page, 'b');
    await rowClick(page, 'st', { modifiers: CTRL });
    await rowClick(page, 'b', { button: 'right' });
    assert.ok((await menuItems(page)).includes('Duplicar'));
    await page.key('Escape');
    await page.leftTab('files');
    const i = await page.waitFor(() => [...document.querySelectorAll('#files-page tr')].findIndex((tr) => tr.dataset.file === 'data/notes.txt') + 1, [], { what: 'data/notes.txt' });
    await page.rightClick('#files-page tr', { index: i - 1 });
    await pick(page, 'Duplicar…');
    await page.waitDialog('Duplicar');
    assert.deepEqual(await form(page), { label: 'Ficheiro:', value: 'data/notes_copy.txt', hint: 'A cópia é acrescentada ao projeto.' });
    await page.dialogButton('Duplicar');
    await page.waitNoDialog();
    await page.waitConsole(/^Duplicar: data\/notes\.txt → data\/notes_copy\.txt\.$/m);
    assert.deepEqual(await warnings(page), []);
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});

// (a project shared live, #5743: an editor's Duplicate written into the owner's project, its Undo there too)
uiTest('#5862 in a project shared live: an editor\'s Duplicate… on the owner\'s disk and in the owner\'s Design pane; the editor\'s Undo takes it away', E, async (page) => {
  const name = 'DupShared';
  await open(page, name);
  const edit = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  const ep = await env.newPage(env.server.url);
  try {
    await ep.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await ep.goto(`${new URL(edit).origin}/?f=1${new URL(edit).hash}`);
    await ep.waitDialog('Follow a Shared Project');
    await ep.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await ep.dialogButton('Follow');
    await ep.waitFor((n) => window.Silinx?.project?.name === n && window.Silinx.startupChecked, [name], { what: 'the project open', timeout: 30000 });
    await waitModules(ep, ['a', 'b', 'st']);
    await rowClick(ep, 'b', { button: 'right' });
    await pick(ep, 'Duplicate…');
    await ep.waitDialog('Duplicate');
    await ep.dialogButton('Duplicate');
    await ep.waitNoDialog();
    await ep.waitConsole(/^Duplicate: src\/b\.vhd → src\/b_copy\.vhd; module 'b' copied as 'b_copy'\.$/m);
    await waitModules(page, ['a', 'b', 'b_copy', 'st']);
    assert.equal(await readWs(env, name, 'src/b_copy.vhd'), vhdl('b_copy'));
    await ep.menu('Edit', 'Undo Duplicate');
    await waitModules(page, ['a', 'b', 'st']);
    assert.equal(onDisk(name, 'src/b_copy.vhd'), false);
    assert.deepEqual(await warnings(ep), []);
  } finally { await ep.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
});
