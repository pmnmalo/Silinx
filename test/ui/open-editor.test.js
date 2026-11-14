// UI: Open in VS Code (#4017, web/js/open-editor.js), the server edition: in a module's and a file's right-click menu of
// the Design pane, in a text file's tab menu (at the cursor's line), the project's folder in the project's menu; none
// for a drawing's module. The server runs the editor config.json names (here a fake "VS Code" that writes down its
// arguments, never the user's); a save there shows in Silinx (its editor reloaded), and with changes not saved in
// Silinx the question which to keep (#2843). Turned off in the configuration: no item. The browser edition (the site):
// no item. In Portuguese; both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';
import { buildSite } from './site-lib.js';

let env, fake, log, site;
before(async () => {
  env = await setupUi();
  if (env.skip) return;
  // (named as VS Code's label: the item reads as the user's; on Windows a .cmd cannot run without a shell: no fake there)
  fake = path.join(env.tmp, 'editor', 'VS Code');
  log = path.join(env.tmp, 'editor.log');
  await fs.mkdir(path.dirname(fake), { recursive: true });
  await fs.writeFile(fake, `#!/bin/sh\nprintf '%s\\n' "$@" > '${log}'\n`, { mode: 0o755 });
  await config({ editor: fake });
  site = await buildSite(env.tmp);
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => env;
const S = () => (site?.skip ? { skip: site.skip } : env);
const WIN = process.platform === 'win32' ? 'the fake editor is a POSIX shell script' : undefined;

const config = (cfg) => fs.writeFile(path.join(env.server.configDir, 'config.json'), JSON.stringify({ mode: 'local', ...cfg }));
const A = 'library ieee; use ieee.std_logic_1164.all;\nentity a is port (x : in std_logic; y : out std_logic); end a;\narchitecture r of a is begin\n  y <= x;\nend r;\n';
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
const doc = 'window.SilinxApp.S.docs.find((d) => d.path === "src/a.vhd")';
// the fake editor's arguments, once it ran
async function ran() {
  for (let i = 0; i < 300; i++) {
    try { const t = await fs.readFile(log, 'utf8'); await fs.rm(log); return t.trim().split('\n'); } catch { await new Promise((r) => setTimeout(r, 20)); }
  }
  throw new Error('the editor did not run');
}
const items = (page) => page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi')].map((m) => m.querySelector('.lbl')?.textContent.trim() ?? m.textContent.trim()));
const closeMenu = (page) => page.eval(() => document.querySelector('body > .menu-popup')?.remove());
// a Design pane row's menu, by its key (m:<module>, project)
async function rowMenu(page, key) {
  const i = await page.waitFor((k) => { const n = [...document.querySelectorAll('#hier .row')].findIndex((r) => r.dataset.key === k); return n + 1; }, [key], { what: key });
  await page.rightClick('#hier .row', { index: i - 1 });
  await page.waitForSelector('body > .menu-popup');
  return items(page);
}
// a tab's menu, by its title
async function tabMenu(page, title) {
  const at = await page.eval((t) => {
    const el = [...document.querySelectorAll('#doc-tabs .tab')].find((x) => x.querySelector('.tlabel')?.textContent === t && x.getClientRects().length);
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 3, y: r.top + r.height / 2 };
  }, title);
  await page.rightClick(at);
  await page.waitForSelector('body > .menu-popup');
  return items(page);
}

uiTest('#4017 Open in VS Code: a module, the tab at its line, the project\'s folder; a save there reloads the editor, or asks which to keep', E, async (page) => {
  const dir = await makeProject(env, { name: 'EdPj', top: 'a', files: { 'src/a.vhd': A } })
    .then(() => path.join(env.server.workspace, 'EdPj'));
  await page.openProject('EdPj');
  // a module's menu: after Open
  const mod = await rowMenu(page, 'm:a');
  assert.equal(mod[mod.indexOf('Open') + 1], 'Open in VS Code');
  await page.click('body > .menu-popup .mi', { text: 'Open in VS Code' });
  assert.deepEqual(await ran(), [dir, '--goto', `${path.join(dir, 'src', 'a.vhd')}:1`]);
  await page.waitConsole(/Opened src\/a\.vhd in VS Code\./);
  // its tab's menu: at the cursor's line
  await page.eval(() => window.SilinxApp.openFile('src/a.vhd'));
  await page.waitFor(new Function(`return !!${doc}?.editor`), [], { what: 'the editor' });
  await page.eval(new Function(`${doc}.editor.setCursor({ line: 3, ch: 2 })`));
  const tab = await tabMenu(page, 'a.vhd');
  assert.deepEqual(tab.slice(-1), ['Open in VS Code']);
  await page.click('body > .menu-popup .mi', { text: 'Open in VS Code' });
  assert.deepEqual(await ran(), [dir, '--goto', `${path.join(dir, 'src', 'a.vhd')}:4`]);
  // the project's menu: its folder
  assert.ok((await rowMenu(page, 'project')).includes('Open Folder in VS Code'));
  await page.click('body > .menu-popup .mi', { text: 'Open Folder in VS Code' });
  assert.deepEqual(await ran(), [dir]);
  await page.waitConsole(/Opened EdPj in VS Code\./);
  // saved in VS Code: the editor reloaded
  const saved = A.replace('y <= x;', 'y <= not x;');
  await fs.writeFile(path.join(dir, 'src', 'a.vhd'), saved);
  await page.waitFor(new Function('t', `return ${doc}.editor.getValue() === t`), [saved], { what: 'the editor reloaded' });
  await page.waitConsole(/src\/a\.vhd reloaded: changed outside Silinx\./);
  // saved there with changes not saved here: which to keep asked
  await page.eval(new Function(`const d = ${doc}; d.editor.setValue(d.editor.getValue() + '-- here\\n'); clearTimeout(d._autosave);`));
  await fs.writeFile(path.join(dir, 'src', 'a.vhd'), `${saved}-- there\n`);
  assert.equal(await page.waitDialog('File Changed on Disk'), 'File Changed on Disk');
  await page.dialogButton('Load from Disk');
  await page.waitNoDialog();
  await page.waitFor(new Function('t', `return ${doc}.editor.getValue() === t`), [`${saved}-- there\n`], { what: 'the disk\'s text' });
  assert.deepEqual(warnings(page), []);
}, { skip: WIN });

uiTest('#4017 Open in VS Code: a file of the Files page, none for a drawing\'s module; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'EdPt', top: 'a', files: { 'src/a.vhd': A, 'constraints/top.ucf': 'NET "x" LOC = "P11";\n' } });
  await page.openProject('EdPt');
  await page.leftTab('files');
  const i = await page.waitFor(() => [...document.querySelectorAll('#files-page tr')].findIndex((tr) => tr.dataset.file === 'constraints/top.ucf') + 1, [], { what: 'the UCF' });
  await page.rightClick('#files-page tr', { index: i - 1 });
  await page.waitForSelector('body > .menu-popup');
  const file = await items(page);
  assert.equal(file[file.indexOf('Open') + 1], 'Open in VS Code');
  await closeMenu(page);
  await page.leftTab('design');
  // a drawing's module (gates: its schematic): none, its HDL is the drawing's
  await makeProject(env, { name: 'EdSch', template: 'gates' });
  await page.openProject('EdSch');
  assert.equal((await rowMenu(page, 'm:gates')).some((l) => /^Open in /.test(l)), false);
  await closeMenu(page);
  await page.openProject('EdPt');
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    const mod = await rowMenu(page, 'm:a');
    assert.equal(mod[mod.indexOf('Abrir') + 1], 'Abrir no VS Code');
    await page.click('body > .menu-popup .mi', { text: 'Abrir no VS Code' });
    await ran();
    await page.waitConsole(/src\/a\.vhd aberto no VS Code\./);
    assert.ok((await rowMenu(page, 'project')).includes('Abrir a Pasta no VS Code'));
    await closeMenu(page);
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  assert.deepEqual(warnings(page), []);
}, { skip: WIN });

uiTest('#4017 Open in VS Code turned off in config.json: no item', E, async (page) => {
  await config({ editor: 'off' });
  try {
    await page.goto(env.server.url);
    await page.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await makeProject(env, { name: 'EdOff', top: 'a', files: { 'src/a.vhd': A } });
    await page.openProject('EdOff');
    assert.equal((await rowMenu(page, 'm:a')).some((l) => /^Open in /.test(l)), false);
    await closeMenu(page);
    assert.equal((await rowMenu(page, 'project')).some((l) => /^Open Folder in /.test(l)), false);
    await closeMenu(page);
  } finally { await config({ editor: fake }); }
  assert.deepEqual(warnings(page), []);
});

uiTest('#4017 the browser edition: no Open in VS Code', S, async (page) => {
  await page.goto(`${site.url}index.html`);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'site boot', timeout: 60000 });
  // File ▸ New Project… from gates
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'EdWeb');
  await page.fill('.dlg-overlay .wiz-main select', 'gates', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'EdWeb' && window.Silinx.project.top && document.querySelector('#hier .row'), [], { what: 'the project' });
  const top = await page.eval(() => window.Silinx.project.top);
  assert.equal((await rowMenu(page, `m:${top}`)).some((l) => /^Open in /.test(l)), false);
  await closeMenu(page);
  assert.equal((await rowMenu(page, 'project')).some((l) => /^Open Folder in /.test(l)), false);
  await closeMenu(page);
  assert.deepEqual(warnings(page), []);
}, { timeout: 180000 });
