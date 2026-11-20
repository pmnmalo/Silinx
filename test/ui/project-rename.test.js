// UI: Rename Project… (#4641). The local server: File ▸ Rename Project… on the open project, its dialog's checks (a
// clash with another project in any case, an invalid name: said in the dialog, which stays open), then renamed: the
// workspace's folder, the title, the browser tab's title, Recent Projects and the last project follow it, its source's
// tab stays open, the console says it (no warning), and Synthesize builds it under its new name; the Design pane's
// project menu and the Start page's Recent Projects have it too; in Portuguese. The browser edition: a project of the
// browser's storage renamed there. (The interface: SILINX_UI_INTERFACE.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { setupUi, uiTest, makeProject } from './harness.js';
import { buildSite } from './site-lib.js';
import { FILE, openImport } from './zip-helpers.js';
import { createZip } from '../../core/zip.js';

let env, site;
before(async () => {
  env = await setupUi();
  if (env.skip) return;
  site = await buildSite(env.tmp);
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => env;
const ES = () => (site?.skip ? { skip: site.skip } : env);

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\nentity top is port (a : in std_logic; y : out std_logic); end;\narchitecture rtl of top is begin y <= a; end;\n';
const SRC = 'src/top.vhd';
const problems = async (page, from = 0) => (await page.consoleText()).slice(from).split('\n').filter((l) => /^(WARNING|ERROR)/.test(l));
const exists = (p) => fs.access(p).then(() => true, () => false);
const dialogError = (page) => page.eval(() => document.querySelector('.dlg-overlay .rename-project-error')?.textContent ?? null);
const fillName = (page, name) => page.fill('.dlg-overlay.rename-project input[type=text], .dlg-overlay .rename-project input[type=text]', name);
// what the page shows and keeps of the open project's name
const shown = (page) => page.eval(() => ({
  name: window.Silinx.project?.name, title: document.getElementById('title-text').textContent, tab: document.title.split(' — ')[0],
  recent: JSON.parse(localStorage.getItem('silinx.recent') || '[]'), last: localStorage.getItem('silinx.lastProject'),
  open: !!window.SilinxApp.findDoc('file:src/top.vhd'),
}));
// a popup menu's item clicked by its label
async function popupItem(page, label) {
  const idx = await page.waitFor((l) => { const i = [...document.querySelectorAll('body > .menu-popup > .mi')].findIndex((r) => r.querySelector('.lbl')?.textContent === l); return i + 1; }, [label], { what: `menu item ${label}` }) - 1;
  await page.click('body > .menu-popup > .mi', { index: idx });
}

uiTest('#4641 Rename Project…: the dialog\'s checks, the open project renamed and kept open, built under its new name; the Design pane\'s menu, the Start page\'s, in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'RenA', files: { [SRC]: TOP }, top: 'top' });
  await makeProject(env, { name: 'RenB' });
  await page.openProject('RenA');
  await page.eval((p) => window.SilinxApp.openFile(p), SRC);
  await page.waitFor((p) => window.Silinx.active?.id === `file:${p}` && window.Silinx.active.editor, [SRC], { what: 'the source open' });
  const from = (await page.consoleText()).length;

  await page.menu('File', 'Rename Project…');
  await page.waitDialog('Rename Project');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[type=text]').value), 'RenA');
  // a clash (in another case), an invalid name, the same name: said in the dialog, which stays open
  for (const [name, error] of [
    ['renb', 'A project named \'RenB\' already exists: choose another name.'],
    ['1Ren', 'invalid project name \'1Ren\': a letter, then up to 63 letters, digits, - and _'],
    ['RenA', '\'RenA\' is the project\'s name already'],
  ]) {
    await fillName(page, name);
    await page.dialogButton('Rename');
    await page.waitFor((e) => document.querySelector('.dlg-overlay .rename-project-error')?.textContent === e, [error], { what: error });
  }
  assert.equal(await page.topDialogTitle(), 'Rename Project');
  await fillName(page, 'RenC');
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.waitConsole(/Project 'RenA' renamed to 'RenC'\./);
  assert.deepEqual(await shown(page), { name: 'RenC', title: 'RenC - [top.vhd]', tab: 'RenC', recent: ['RenC'], last: 'RenC', open: true });
  assert.ok(await exists(path.join(env.server.workspace, 'RenC', SRC)));
  assert.ok(!await exists(path.join(env.server.workspace, 'RenA')));
  assert.equal(JSON.parse(await fs.readFile(path.join(env.server.workspace, 'RenC', 'silinx.json'), 'utf8')).name, 'RenC');
  assert.deepEqual(await problems(page, from), []);
  // built under its new name (no ISE here: its scripts generated, as the project's ISE flow does)
  await page.treeRow('#procs', 'Synthesize', { dbl: true });
  await page.waitConsole(/Scripts generated in RenC\/build \(ISE not run\)\./, { timeout: 120000 });
  assert.match(await page.consoleText(), /Silinx implementation: RenC top=top/);
  assert.ok(await exists(path.join(env.server.workspace, 'RenC', 'build', 'top.prj')));
  // (the build's one warning: the project has no constraints)
  assert.deepEqual(await problems(page, from), ['WARNING: 2 port bit(s) have no LOC constraint (a, y): Silinx assigns free I/O pins automatically - do NOT program real hardware with this bitstream']);
  const built = (await page.consoleText()).length;

  // the Design pane's project menu: renamed again (a change of case alone)
  await page.leftTab('design');
  await page.treeRow('#hier', 'RenC', { exact: true, right: true });
  await popupItem(page, 'Rename Project…');
  await page.waitDialog('Rename Project');
  await fillName(page, 'renc');
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.waitConsole(/Project 'RenC' renamed to 'renc'\./);
  assert.deepEqual(await shown(page), { name: 'renc', title: 'renc - [top.vhd]', tab: 'renc', recent: ['renc'], last: 'renc', open: true });
  assert.ok((await fs.readdir(env.server.workspace)).includes('renc'));

  // the Start page's Recent Projects: a project not open renamed from its menu
  await page.eval(() => window.SilinxApp.closeProject());
  await page.waitFor(() => !window.Silinx.project && document.querySelector('#start-page [data-recent="renc"]'), [], { what: 'the Start page' });
  await page.rightClick('#start-page [data-recent="renc"] a');
  await popupItem(page, 'Rename Project…');
  await page.waitDialog('Rename Project');
  await fillName(page, 'RenD');
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.waitFor(() => document.querySelector('#start-page [data-recent="RenD"]'), [], { what: 'the Start page\'s RenD' });
  assert.deepEqual(await page.eval(() => JSON.parse(localStorage.getItem('silinx.recent'))), ['RenD']);
  assert.deepEqual(await problems(page, built), []);

  // in Portuguese: the menu, the dialog and its clash
  await page.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await page.openProject('RenD');
  await page.menu('Ficheiro', 'Mudar o Nome do Projeto…');
  await page.waitDialog('Mudar o Nome do Projeto');
  await fillName(page, 'RenB');
  await page.dialogButton('Mudar o Nome');
  await page.waitFor(() => document.querySelector('.dlg-overlay .rename-project-error')?.textContent === 'Já existe um projeto chamado \'RenB\': escolha outro nome.', [], { what: 'the clash, in Portuguese' });
  await fillName(page, 'RenE');
  await page.dialogButton('Mudar o Nome');
  await page.waitNoDialog();
  await page.waitConsole(/Project 'RenD' renamed to 'RenE'\./);   // (the console's lines as the tools write them)
  assert.equal(await page.eval(() => window.Silinx.project.name), 'RenE');
  await page.eval(() => localStorage.setItem('silinx.lang', 'en'));
});

uiTest('#4641 Rename Project… refused while an implementation runs: said in the console, no dialog', E, async (page) => {
  await makeProject(env, { name: 'RenBusy', files: { [SRC]: TOP }, top: 'top' });
  await page.openProject('RenBusy');
  await page.eval(() => { window.Silinx.busy = true; });
  await page.menu('File', 'Rename Project…');
  await page.waitConsole(/Rename Project: 'RenBusy' is not renamed while a process of it runs: stop it \(or wait for it to finish\) first\./);
  assert.equal(await page.dialogCount(), 0);
  await page.eval(() => { window.Silinx.busy = false; });
  assert.ok(await exists(path.join(env.server.workspace, 'RenBusy')));
  assert.deepEqual(await problems(page), []);
});

uiTest('#4641 the browser edition: a project of the browser\'s storage renamed there, kept open, Recent Projects following it', ES, async (page) => {
  await page.goto(site.url);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'site boot' });
  const codec = { deflate: (d) => zlib.deflateRawSync(d), inflate: (d, l) => zlib.inflateRawSync(d, { maxOutputLength: l }) };
  const pj = { name: 'W', top: 'top', board: 'basys2-250', files: [{ path: SRC, lang: 'vhdl', role: 'design' }], device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' } };
  const file = path.join(env.tmp, 'rename-site.zip');
  await fs.writeFile(file, await createZip([{ path: 'silinx.json', data: JSON.stringify(pj) }, { path: SRC, data: TOP }], codec));
  await openImport(page, 'silinx');
  await page.setFiles(FILE, [file]);
  await page.fill('.dlg-overlay input[type=text]', 'WebOne');
  await page.dialogButton('Import');
  await page.waitFor((n) => window.Silinx.project?.name === n, ['WebOne'], { timeout: 30000, what: 'the project imported' });
  await page.eval((p) => window.SilinxApp.openFile(p), SRC);
  await page.waitFor((p) => window.Silinx.active?.id === `file:${p}`, [SRC], { what: 'the source open' });
  const from = (await page.consoleText()).length;
  // (its snapshots, #4725: one planted, to follow it)
  await page.eval(() => localStorage.setItem('silinx.snapshots:browser::WebOne', JSON.stringify({ r1: { at: 'x' } })));
  await page.menu('File', 'Rename Project…');
  await page.waitDialog('Rename Project');
  await fillName(page, 'WebTwo');
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  await page.waitConsole(/Project 'WebOne' renamed to 'WebTwo'\./);
  const s = await shown(page);
  assert.deepEqual({ ...s, recent: s.recent.slice(0, 1) }, { name: 'WebTwo', title: 'WebTwo - [top.vhd]', tab: 'WebTwo', recent: ['WebTwo'], last: 'WebTwo', open: true });
  assert.ok(!s.recent.includes('WebOne'));
  // kept in the browser's storage under its new name only
  const kept = await page.eval(() => Object.keys(localStorage).filter((k) => /^silinx\.(standalone\.project|snapshots:browser:):Web/.test(k)).sort());
  assert.deepEqual(kept, ['silinx.snapshots:browser::WebTwo', 'silinx.standalone.project:WebTwo']);
  assert.deepEqual(await problems(page, from), []);
});
