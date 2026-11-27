// UI: several sources selected in the Design pane (#5720), as ISE's and a file manager's trees: Ctrl+click (Cmd+click on
// a Mac) adds a row or takes it out, Shift+click selects a range, a plain click or Esc goes back to one row; the rows
// marked and aria-selected, the tree aria-multiselectable, the Processes pane following the row clicked last. The menu
// of a selection: Open, Remove from Project and Duplicate (#5862) for all, the commands of one source disabled; Delete removes the
// selection. Remove from Project's question names the sources and offers to keep the files in the project folder (the
// default) or to delete them too (into the workspace's .trash): a drawing's HDL file goes with it, the console says what
// was removed and what was deleted, Undo brings it all back (the deleted files written again). In Portuguese too.
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

// (Cmd on a Mac, whose Ctrl+click is the right button's; CDP's modifier bits: 2 Ctrl, 4 Meta, 8 Shift)
const CTRL = process.platform === 'darwin' ? 4 : 2, SHIFT = 8;
const vhdl = (name) => `library ieee; use ieee.std_logic_1164.all;\nentity ${name} is port (x : in std_logic; y : out std_logic); end ${name};\narchitecture rtl of ${name} is begin y <= x; end rtl;\n`;
const FILES = { 'src/a.vhd': vhdl('a'), 'src/b.vhd': vhdl('b'), 'src/c.vhd': vhdl('c'), 'src/st.fsm.json': JSON.stringify(newFsm('st', 'vhdl'), null, 2) };

const project = (name) => env.server.api('GET', `/api/projects/${encodeURIComponent(name)}`);
const pjFiles = async (name) => (await project(name)).files.map((f) => f.path).sort();
const excluded = async (name) => (await project(name)).excluded || [];
const onDisk = (name, f) => fs.existsSync(path.join(env.server.workspace, name, f));
const consoleLines = async (page, re) => (await page.consoleText()).split('\n').filter((l) => re.test(l));
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)\b/.test(l));
// the modules' rows (their labels), the selected ones, the current one
const modules = (page) => page.eval(() => [...document.querySelectorAll('#hier .row[data-key^="m:"] .lbl')].map((l) => l.textContent));
const selection = (page) => page.eval(() => {
  const tree = document.querySelector('#hier .tree');
  const sel = [...tree.querySelectorAll('li[aria-selected="true"] > .row')].map((r) => r.querySelector('.lbl').textContent);
  const marked = [...tree.querySelectorAll('.row.msel')].map((r) => r.querySelector('.lbl').textContent);
  return { sel, marked, current: tree.querySelector('.row.sel .lbl')?.textContent, multi: tree.getAttribute('aria-multiselectable'), procs: window.SilinxApp.S.sel?.module ?? null };
});
// a module's row clicked on its name, with the keys `modifiers`
async function rowClick(page, label, { modifiers = 0, button } = {}) {
  await page.leftTab('design');
  const i = await page.waitFor((l) => [...document.querySelectorAll('#hier .row .lbl')].findIndex((x) => x.textContent === l) + 1, [label], { what: `row ${label}` });
  return page.click('#hier .row .lbl', { index: i - 1, modifiers, button });
}
const menuItems = (page) => page.waitFor(() => { const m = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => `${i.textContent.trim()}${i.classList.contains('disabled') ? ' (disabled)' : ''}`); return m.length ? m : null; }, [], { what: 'the context menu' });
const question = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.msg-text').textContent);
// the question's buttons that do not show their label on one line, in one row (#5748: they wrapped and overflowed)
const badButtons = (page) => page.eval(() => {
  const all = [...[...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('.dlg-buttons .btn')];
  return all.filter((b) => {
    const r = document.createRange();
    r.selectNodeContents(b);
    return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size !== 1 || b.scrollWidth > b.clientWidth || b.offsetTop !== all[0].offsetTop;
  }).map((b) => b.textContent);
});
const buttons = (page) => page.eval(() => [...[...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('.dlg-buttons .btn')].map((b) => `${b.textContent}${b.classList.contains('primary') ? '*' : ''}`));

async function openMulti(page, name) {
  await makeProject(env, { name, top: 'a', files: FILES });
  await page.openProject(name);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/st.vhd'] === 'src/st.fsm.json', [], { what: 'the state diagram linked to its HDL' });
  await page.waitFor(() => document.querySelectorAll('#hier .row[data-key^="m:"]').length === 4, [], { what: 'the four modules' });
  assert.deepEqual(await modules(page), ['a', 'b', 'c', 'st']);
}

uiTest('#5720 the Design pane\'s selection of several rows: Ctrl / Cmd+click, Shift+click, Esc, a plain click; aria-selected; the Processes follow the row clicked', E, async (page) => {
  await openMulti(page, 'MultiSel');
  await rowClick(page, 'b');
  assert.deepEqual(await selection(page), { sel: ['b'], marked: [], current: 'b', multi: 'true', procs: 'b' });
  await rowClick(page, 'st', { modifiers: CTRL });
  assert.deepEqual(await selection(page), { sel: ['b', 'st'], marked: ['b', 'st'], current: 'st', multi: 'true', procs: 'st' });
  // Shift: from the last row clicked (st) to a
  await rowClick(page, 'a', { modifiers: SHIFT });
  assert.deepEqual(await selection(page), { sel: ['a', 'b', 'c', 'st'], marked: ['a', 'b', 'c', 'st'], current: 'a', multi: 'true', procs: 'a' });
  // Ctrl / Cmd on a selected row: out of the selection
  await rowClick(page, 'c', { modifiers: CTRL });
  assert.deepEqual(await selection(page), { sel: ['a', 'b', 'st'], marked: ['a', 'b', 'st'], current: 'a', multi: 'true', procs: 'a' });
  // the current row taken out: the first one left the current one
  await rowClick(page, 'a', { modifiers: CTRL });
  assert.deepEqual(await selection(page), { sel: ['b', 'st'], marked: ['b', 'st'], current: 'b', multi: 'true', procs: 'b' });
  // Esc: back to the current row
  await page.key('Escape');
  assert.deepEqual(await selection(page), { sel: ['b'], marked: [], current: 'b', multi: 'true', procs: 'b' });
  // a plain click: one row
  await rowClick(page, 'c', { modifiers: SHIFT });
  assert.deepEqual((await selection(page)).sel, ['b', 'c']);
  await rowClick(page, 'st');
  assert.deepEqual(await selection(page), { sel: ['st'], marked: [], current: 'st', multi: 'true', procs: 'st' });
  // a row with no source (the project's, the device's) takes no part: a plain click
  await rowClick(page, 'b', { modifiers: CTRL });
  await rowClick(page, 'MultiSel', { modifiers: CTRL });
  assert.deepEqual((await selection(page)).sel, ['MultiSel']);
  // the selection kept when the tree is drawn again
  await rowClick(page, 'a');
  await rowClick(page, 'c', { modifiers: CTRL });
  await page.eval(async () => (await import('/js/design.js')).renderHierarchy());
  assert.deepEqual(await selection(page), { sel: ['a', 'c'], marked: ['a', 'c'], current: 'c', multi: 'true', procs: 'c' });
  // a right-click on a row out of the selection: that row alone, its own menu
  await rowClick(page, 'b', { button: 'right' });
  assert.ok((await menuItems(page)).includes('Rename…'));
  await page.key('Escape');
  assert.deepEqual((await selection(page)).sel, ['b']);
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5720 Remove from Project of a selection (its menu): the files kept in the project folder, the drawing\'s HDL file with it; one Undo brings them back', E, async (page) => {
  const name = 'MultiKeep';
  await openMulti(page, name);
  const before = Object.fromEntries(await Promise.all(['src/b.vhd', 'src/c.vhd', 'src/st.fsm.json', 'src/st.vhd'].map(async (f) => [f, await readWs(env, name, f)])));
  await rowClick(page, 'b');
  await rowClick(page, 'c', { modifiers: CTRL });
  await rowClick(page, 'st', { modifiers: CTRL });
  // the selection's menu: the commands of several sources; those of one disabled
  await rowClick(page, 'c', { button: 'right' });
  assert.deepEqual(await menuItems(page), ['Open', 'Duplicate', 'Remove…', 'Rename… (disabled)', 'Set as Top Module (disabled)', 'Source Properties… (disabled)']);
  await page.click('body > .menu-popup .mi', { text: 'Remove…' });
  await page.waitDialog('Remove Source');
  assert.equal(await question(page), "Remove these 3 sources from the project?\n'src/b.vhd'\n'src/c.vhd'\n'src/st.fsm.json' and its HDL file 'src/st.vhd'\n(The files stay in the project folder: Undo or Add to Project in the Files view brings them back.)\n\nRemove and Delete Files moves them to the workspace's .trash folder.");
  assert.deepEqual(await badButtons(page), []);
  assert.deepEqual(await buttons(page), ['Remove from Project*', 'Remove and Delete Files', 'Cancel']);
  // (the default: Enter, the files kept)
  await page.key('Enter');
  await page.waitNoDialog();
  await page.waitFor(() => document.querySelectorAll('#hier .row[data-key^="m:"]').length === 1, [], { what: 'one module left' });
  assert.deepEqual(await modules(page), ['a']);
  assert.deepEqual(await pjFiles(name), ['src/a.vhd']);
  assert.deepEqual(await excluded(name), ['src/st.fsm.json']);
  for (const [f, text] of Object.entries(before)) assert.equal(await readWs(env, name, f), text, `${f} kept as it was`);
  await page.waitConsole(/^Removed src\/st\.fsm\.json and its HDL file/m);
  assert.deepEqual(await consoleLines(page, /^Removed /), [
    'Removed src/b.vhd from the project (the file is kept in the project folder).',
    'Removed src/c.vhd from the project (the file is kept in the project folder).',
    'Removed src/st.fsm.json and its HDL file src/st.vhd from the project (the files are kept in the project folder).',
  ]);
  await page.waitFor(() => [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('Removed 3 sources from the project')), [], { what: 'the toast' });
  // one Undo: all back
  await page.menu('Edit', 'Undo Remove from Project');
  await page.waitFor(() => document.querySelectorAll('#hier .row[data-key^="m:"]').length === 4, [], { what: 'the modules back' });
  assert.deepEqual(await pjFiles(name), ['src/a.vhd', 'src/b.vhd', 'src/c.vhd', 'src/st.vhd']);
  assert.deepEqual(await excluded(name), []);
  // Cancel: nothing removed
  await rowClick(page, 'b');
  await rowClick(page, 'c', { modifiers: CTRL });
  await rowClick(page, 'b', { button: 'right' });
  await page.click('body > .menu-popup .mi', { text: 'Remove…' });
  await page.waitDialog('Remove Source');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(await pjFiles(name), ['src/a.vhd', 'src/b.vhd', 'src/c.vhd', 'src/st.vhd']);
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5720 Delete on a selection: Remove and Delete Files deletes them (into the .trash), the drawing\'s HDL file with it; Undo writes them back', E, async (page) => {
  const name = 'MultiDel';
  await openMulti(page, name);
  const before = Object.fromEntries(await Promise.all(['src/b.vhd', 'src/st.fsm.json', 'src/st.vhd'].map(async (f) => [f, await readWs(env, name, f)])));
  // the drawing open: closed with its files
  await page.eval(() => window.SilinxApp.openFile('src/st.fsm.json'));
  await page.waitFor(() => String(window.Silinx.active?.id || '').endsWith(':src/st.fsm.json'), [], { what: 'the drawing open' });
  await rowClick(page, 'b');
  await rowClick(page, 'st', { modifiers: CTRL });
  await page.key('Delete');
  await page.waitDialog('Remove Source');
  assert.equal(await question(page), "Remove these 2 sources from the project?\n'src/b.vhd'\n'src/st.fsm.json' and its HDL file 'src/st.vhd'\n(The files stay in the project folder: Undo or Add to Project in the Files view brings them back.)\n\nRemove and Delete Files moves them to the workspace's .trash folder.");
  await page.dialogButton('Remove and Delete Files');
  await page.waitNoDialog();
  await page.waitFor(() => document.querySelectorAll('#hier .row[data-key^="m:"]').length === 2, [], { what: 'two modules left' });
  assert.deepEqual(await modules(page), ['a', 'c']);
  assert.deepEqual(await pjFiles(name), ['src/a.vhd', 'src/c.vhd']);
  assert.deepEqual(await excluded(name), []);
  for (const f of Object.keys(before)) assert.equal(onDisk(name, f), false, `${f} deleted`);
  assert.deepEqual(await page.eval(() => window.Silinx.docs.map((d) => String(d.id))), ['summary']);
  await page.waitConsole(/^Removed src\/st\.fsm\.json and its HDL file/m);
  assert.deepEqual(await consoleLines(page, /^Removed /), [
    'Removed src/b.vhd from the project and deleted it (moved to the workspace\'s .trash folder).',
    'Removed src/st.fsm.json and its HDL file src/st.vhd from the project and deleted them (moved to the workspace\'s .trash folder).',
  ]);
  // in the .trash
  const trash = path.join(env.server.workspace, '.trash');
  const inTrash = fs.readdirSync(trash).filter((d) => d.startsWith(`${name}-`)).flatMap((d) => fs.readdirSync(path.join(trash, d, 'src')));
  assert.deepEqual(inTrash.sort(), ['b.vhd', 'st.fsm.json', 'st.vhd']);
  // Undo: the files written back, in the project again
  await page.menu('Edit', 'Undo Remove from Project');
  await page.waitFor(() => document.querySelectorAll('#hier .row[data-key^="m:"]').length === 4, [], { what: 'the modules back' });
  for (const [f, text] of Object.entries(before)) assert.equal(await readWs(env, name, f), text, `${f} back`);
  assert.deepEqual(await pjFiles(name), ['src/a.vhd', 'src/b.vhd', 'src/c.vhd', 'src/st.vhd']);
  // Delete on one row (no selection of several): that source; its one file
  await rowClick(page, 'c');
  await page.key('Delete');
  await page.waitDialog('Remove Source');
  assert.equal(await question(page), "Remove 'src/c.vhd' from the project?\n(The file stays in the project folder: Undo or Add to Project in the Files view brings it back.)\n\nRemove and Delete File moves it to the workspace's .trash folder.");
  assert.deepEqual(await badButtons(page), []);
  assert.deepEqual(await buttons(page), ['Remove from Project*', 'Remove and Delete File', 'Cancel']);
  await page.dialogButton('Remove and Delete File');
  await page.waitNoDialog();
  await page.waitConsole(/^Removed src\/c\.vhd from the project and deleted it \(moved to the workspace's \.trash folder\)\.$/m);
  assert.equal(onDisk(name, 'src/c.vhd'), false);
  assert.deepEqual(await modules(page), ['a', 'b', 'st']);
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5720 in Portuguese: a selection\'s menu, the question and its buttons, the console\'s lines', E, async (page) => {
  const name = 'MultiPt';
  await openMulti(page, name);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await rowClick(page, 'a');
    await rowClick(page, 'c', { modifiers: SHIFT });
    await rowClick(page, 'b', { button: 'right' });
    assert.deepEqual(await menuItems(page), ['Abrir', 'Duplicar', 'Remover…', 'Mudar o Nome… (disabled)', 'Definir como Módulo de Topo (disabled)', 'Propriedades da Fonte… (disabled)']);
    await page.click('body > .menu-popup .mi', { text: 'Remover…' });
    await page.waitDialog('Remover Fonte');
    assert.equal(await question(page), "Remover estas 3 fontes do projeto?\n'src/a.vhd'\n'src/b.vhd'\n'src/c.vhd'\n(Os ficheiros ficam na pasta do projeto: Anular ou Acrescentar ao Projeto na vista Ficheiros repõe-nos.)\n\nRemover e Apagar Ficheiros move-os para a pasta .trash da área de trabalho.");
    assert.deepEqual(await badButtons(page), []);
  assert.deepEqual(await buttons(page), ['Remover do Projeto*', 'Remover e Apagar Ficheiros', 'Cancelar']);
    await page.dialogButton('Remover e Apagar Ficheiros');
    await page.waitNoDialog();
    await page.waitFor(() => document.querySelectorAll('#hier .row[data-key^="m:"]').length === 1, [], { what: 'st left' });
    await page.waitConsole(/^Removido src\/c\.vhd do projeto/m);
    assert.deepEqual(await consoleLines(page, /^Removido /), ['src/a.vhd', 'src/b.vhd', 'src/c.vhd'].map((f) => `Removido ${f} do projeto, e apagado (movido para a pasta .trash da área de trabalho).`));
    await page.waitFor(() => [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('Removidas 3 fontes do projeto')), [], { what: 'the toast in Portuguese' });
    assert.ok(!onDisk(name, 'src/a.vhd') && !onDisk(name, 'src/b.vhd') && !onDisk(name, 'src/c.vhd'));
  } finally {
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  }
});
