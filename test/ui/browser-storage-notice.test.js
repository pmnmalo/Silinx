// UI: the browser edition's notice that the projects are kept in the browser's storage (#4957), in red (the theme's
// --error-fg: clearing the browser's data loses them): the New Project wizard's, the Start page's Where Projects Are Kept
// and the status line's Storage; not in red once the projects are in a workspace folder on the disk (a fake one: the
// real picker cannot be driven headless). In Portuguese too; no warning, no error. (The interface: SILINX_UI_INTERFACE;
// the server's own wizard, its workspace folder, has no such notice: test/ui/wizard*.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, ROOT, chromeOnly } from './harness.js';
import { buildSite } from './site-lib.js';

let env, site;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  // (the fake folder of test/fixtures, served beside the site)
  site = await buildSite(env.tmp, { route: async (req, res) => {
    if (!req.url.startsWith('/__test/fs-access-fake.js')) return false;
    res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(await fs.readFile(path.join(ROOT, 'test/fixtures/fs-access-fake.js')));
    return true;
  } });
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

// the notice's colour, and the theme's --error-fg in the same place (a probe), and whether the notice has the class
const RED = `window.__red = (el) => {
  if (!el) return null;
  const probe = document.createElement('span');
  probe.style.color = 'var(--error-fg)';
  el.parentElement.appendChild(probe);
  const red = getComputedStyle(probe).color;
  probe.remove();
  return { text: el.textContent.trim(), red: getComputedStyle(el).color === red, cls: el.classList.contains('storage-browser') };
};`;
const notices = async (page) => {
  await page.eval(RED);
  return page.eval(() => ({
    start: window.__red(document.querySelector('#start-page .start-storage .entry')),
    // (the status line: the ISE style interface's; the Silinx one has none, #1039)
    status: document.getElementById('status-storage')?.getClientRects().length ? window.__red(document.getElementById('status-storage')) : null,
  }));
};
const EN = { file: 'File', item: 'New Project…', cancel: 'Cancel' }, PT = { file: 'Ficheiro', item: 'Novo Projeto…', cancel: 'Cancelar' };
const wizardHint = async (page, l = EN) => {
  // (the single file's menus run from their definitions where no menu bar is shown: by the English label there)
  await page.menu(l.file, l.item).catch(() => page.menu(l.file, EN.item));
  await page.waitDialog(null);
  await page.eval(RED);
  const hint = await page.eval(() => window.__red(document.querySelector('.dlg-overlay .wiz-main .hint:last-child')));
  await page.dialogButton(l.cancel);
  await page.waitNoDialog();
  return hint;
};
const boot = async (page) => {
  await page.goto(site.url);
  await page.waitFor(() => window.SilinxApp && window.Silinx.devices && document.querySelector('#start-page .start-storage'), [], { what: 'site boot' });
};
const problems = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)/.test(l));

uiTest('#4957 browser edition: the projects kept in the browser\'s storage said in red (the wizard, the Start page, the status line), in Portuguese too', E, async (page) => {
  await boot(page);
  const bar = !await page.eval(() => document.documentElement.dataset.layout);
  const st = await notices(page);
  assert.deepEqual(st.start, { text: 'In this browser\'s storage.', red: true, cls: true });
  if (bar) assert.deepEqual(st.status, { text: 'Storage: this browser', red: true, cls: true });
  assert.deepEqual(await wizardHint(page), { text: 'Projects are kept in this browser\'s storage (File ▸ Open Workspace Folder… keeps them in a folder on the disk).', red: true, cls: true });
  assert.deepEqual(await problems(page), []);
  // in Portuguese: the same notices, translated, still in red
  await page.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  await boot(page);
  const pt = await notices(page);
  assert.deepEqual(pt.start, { text: 'No armazenamento deste navegador.', red: true, cls: true });
  if (bar) assert.deepEqual(pt.status, { text: 'Armazenamento: este navegador', red: true, cls: true });
  assert.deepEqual(await wizardHint(page, PT), { text: 'Os projetos ficam guardados neste browser (File ▸ Open Workspace Folder… guarda-os numa pasta do disco).', red: true, cls: true });
  assert.deepEqual(await problems(page), []);
}, { url: () => 'about:blank', timeout: 180000 });

uiTest('#4957 browser edition: the projects in a workspace folder on the disk: no notice in red', E, async (page) => {
  const fake = `${site.url}__test/fs-access-fake.js`;
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.showDirectoryPicker = async () => (await import(${JSON.stringify(fake)})).fakeDirectory('Silinx-projects');
    window.SILINX_WORKSPACE_HANDLES = { load: async () => null, save: async () => {} };` });
  await boot(page);
  await page.menu('File', 'Open Workspace Folder…');
  await page.waitConsole(/Projects are now kept in the folder 'Silinx-projects' on the disk/);
  await page.waitFor(() => /In the folder/.test(document.querySelector('#start-page .start-storage')?.textContent || ''));
  const st = await notices(page);
  assert.deepEqual(st.start, { text: 'In the folder Silinx-projects on the disk.', red: false, cls: false });
  if (st.status) assert.deepEqual(st.status, { text: 'Storage: folder Silinx-projects', red: false, cls: false });
  assert.deepEqual(await wizardHint(page), { text: 'Projects are kept in the folder Silinx-projects on the disk (File ▸ Open Workspace Folder… to change it).', red: false, cls: false });
  assert.deepEqual(await problems(page), []);
}, { url: () => 'about:blank', skip: chromeOnly, timeout: 180000 });
