// UI: the browser edition's first run offers a workspace folder on the disk (#4962, web/js/storage-offer.js) where the
// browser can give one (a fake folder picker: the real one cannot be driven headless): one console line, its buttons
// Choose a Workspace Folder… and Keep in This Browser; the answer remembered (not offered again); a folder chosen with
// projects in the browser's storage: Copy, or Move… (deleted from the browser's storage only once confirmed; Keep Them
// keeps them); a browser with no folder API (Safari, Firefox) offered nothing. In Portuguese too; the console's warnings
// and errors asserted (none). (The interface: SILINX_UI_INTERFACE.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, ROOT, chromeOnly } from './harness.js';
import { buildSite } from './site-lib.js';
import { OFFER, KEPT, copyQuestion, deleteQuestion, keptLine, deletedLine } from '../../web/js/storage-choice.js';

let env, site;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  site = await buildSite(env.tmp, { route: async (req, res) => {
    if (!req.url.startsWith('/__test/fs-access-fake.js')) return false;
    res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(await fs.readFile(path.join(ROOT, 'test/fixtures/fs-access-fake.js')));
    return true;
  } });
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

// the fake folder picker (a folder kept in localStorage across reloads), its handle remembered in localStorage too;
// '__noFolderApi': a browser with no File System Access API
const FAKE = (url) => `(() => {
  if (localStorage.getItem('__noFolderApi')) { Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true, writable: true }); return; }
  const open = async () => (await import(${JSON.stringify(url)})).fakeDirectory('Silinx-projects', { storage: localStorage, key: '__fakefs' });
  window.showDirectoryPicker = async () => { if (localStorage.getItem('__cancelPicker')) throw new DOMException('cancelled', 'AbortError'); return open(); };
  window.SILINX_WORKSPACE_HANDLES = { load: async () => (localStorage.getItem('__remembered') ? open() : null), save: async () => { localStorage.setItem('__remembered', '1'); } };
})();`;
const boot = async (page) => {
  await page.goto(site.url);
  await page.waitFor(() => window.SilinxApp && window.Silinx.devices && window.Silinx.linksWatched && document.querySelector('#start-page .start-storage'), [], { what: 'site boot' });
};
const lines = async (page) => (await page.consoleText()).split('\n');
const problems = async (page) => (await lines(page)).filter((l) => /^(WARNING|ERROR)/.test(l));
// the offer's line's buttons: [label, enabled]
const offerButtons = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].filter((l) => l.querySelector('.ln-action'))
  .map((l) => [...l.querySelectorAll('.ln-action')].map((b) => [b.textContent, !b.disabled])));
const clickAction = (page, label) => page.eval((l) => [...document.querySelectorAll('#console-log .ln-action')].find((b) => b.textContent === l && !b.disabled).click(), label);
const dialogText = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.msg-text').textContent);
const browserProjects = (page) => page.eval(() => Object.keys(localStorage).filter((k) => k.startsWith('silinx.standalone.project:')).map((k) => k.slice(26)).sort());
const newProject = async (page, name) => {
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.fill('.dlg-overlay .wiz-main select', 'blinky', { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n, [name]);
};

uiTest('#4962 browser edition, first run: a workspace folder offered in the console; Keep in This Browser remembered', E, async (page) => {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE(`${site.url}__test/fs-access-fake.js`) });
  await boot(page);
  await page.waitConsole(/This browser can keep the projects in a folder on the disk/);
  assert.deepEqual((await lines(page)).filter((l) => l.startsWith(OFFER)), [`${OFFER} Choose a Workspace Folder… Keep in This Browser`]);
  assert.deepEqual(await offerButtons(page), [[['Choose a Workspace Folder…', true], ['Keep in This Browser', true]]]);
  // the picker cancelled: no answer, the buttons back, the browser's storage kept
  await page.eval(() => localStorage.setItem('__cancelPicker', '1'));
  await clickAction(page, 'Choose a Workspace Folder…');
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln-action')].every((b) => !b.disabled), [], { what: 'the buttons back' });
  assert.equal(await page.eval(() => window.SilinxApp.S.project === null && document.getElementById('status-storage').textContent), 'Storage: this browser');
  await page.eval(() => localStorage.removeItem('__cancelPicker'));
  // kept: said, the buttons disabled, not offered at the next start-up
  await clickAction(page, 'Keep in This Browser');
  await page.waitConsole(/^Projects stay in this browser's storage/m);
  assert.deepEqual(await offerButtons(page), [[['Choose a Workspace Folder…', false], ['Keep in This Browser', false]]]);
  assert.ok((await lines(page)).includes(KEPT));
  assert.deepEqual(await problems(page), []);
  await boot(page);
  await page.waitConsole(/Browser edition: projects are stored in this browser/);
  assert.deepEqual((await lines(page)).filter((l) => l.startsWith(OFFER)), []);
  // a browser with no folder API (Safari, Firefox): nothing offered, at its first run too
  await page.eval(() => { localStorage.clear(); localStorage.setItem('__noFolderApi', '1'); });
  await boot(page);
  await page.waitConsole(/Browser edition: projects are stored in this browser \(File > Export Project/);
  assert.deepEqual((await lines(page)).filter((l) => l.startsWith(OFFER)), []);
  assert.deepEqual(await problems(page), []);
}, { url: () => 'about:blank', skip: chromeOnly, timeout: 180000 });

uiTest('#4962 browser edition, first run: a folder chosen; the browser\'s projects moved once confirmed (Keep Them first: copied only)', E, async (page) => {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE(`${site.url}__test/fs-access-fake.js`) });
  await boot(page);
  await newProject(page, 'InBrowser');
  await newProject(page, 'Second');
  assert.deepEqual(await browserProjects(page), ['InBrowser', 'Second']);
  await clickAction(page, 'Choose a Workspace Folder…');
  await page.waitConsole(/Projects are now kept in the folder 'Silinx-projects' on the disk/);
  await page.waitDialog('Projects in This Browser');
  assert.equal(await dialogText(page), copyQuestion(['InBrowser', 'Second'], 'Silinx-projects'));
  // Move…, then Keep Them: copied, still in the browser's storage
  await page.dialogButton('Move…');
  await page.waitDialog('Delete from This Browser');
  assert.equal(await dialogText(page), deleteQuestion(['InBrowser', 'Second'], 'Silinx-projects'));
  await page.dialogButton('Keep Them');
  await page.waitNoDialog();
  await page.waitConsole(/^Kept 2 project/m);
  assert.deepEqual((await lines(page)).slice(-2), ['Copied 2 project(s) from the browser\'s storage into the folder \'Silinx-projects\': InBrowser, Second.', keptLine(['InBrowser', 'Second'])]);
  assert.deepEqual(await browserProjects(page), ['InBrowser', 'Second']);
  assert.deepEqual(await offerButtons(page), [[['Choose a Workspace Folder…', false], ['Keep in This Browser', false]]]);
  // the next start-up: the folder (remembered), no offer; the folder's projects
  await boot(page);
  await page.waitConsole(/Browser edition: projects are stored in the folder 'Silinx-projects' on the disk/);
  assert.deepEqual((await lines(page)).filter((l) => l.startsWith(OFFER)), []);
  // a move confirmed (the offer's dialog again, as at the first run: its answer forgotten, the folder emptied)
  await page.eval(() => { for (const k of ['silinx.standalone.folderOffer', 'silinx.standalone.storage', '__remembered', '__fakefs']) localStorage.removeItem(k); });
  await boot(page);
  await clickAction(page, 'Choose a Workspace Folder…');
  await page.waitDialog('Projects in This Browser');
  await page.dialogButton('Move…');
  await page.waitDialog('Delete from This Browser');
  await page.dialogButton('Delete from This Browser');
  await page.waitNoDialog();
  await page.waitConsole(/^Deleted 2 project/m);
  assert.ok((await lines(page)).includes(deletedLine(['InBrowser', 'Second'], 'Silinx-projects')));
  assert.deepEqual(await browserProjects(page), []);
  assert.deepEqual(await problems(page), []);
}, { url: () => 'about:blank', skip: chromeOnly, timeout: 240000 });

uiTest('#4962 browser edition, first run in Portuguese: the offer\'s buttons and the dialog translated; Copy', E, async (page) => {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE(`${site.url}__test/fs-access-fake.js`) });
  await boot(page);
  await newProject(page, 'InBrowser');
  await page.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  await boot(page);
  await page.waitConsole(/This browser can keep the projects in a folder on the disk/);
  assert.deepEqual(await offerButtons(page), [[['Escolher uma Pasta de Trabalho…', true], ['Manter Neste Navegador', true]]]);
  await clickAction(page, 'Escolher uma Pasta de Trabalho…');
  await page.waitDialog('Projetos Neste Navegador');
  assert.equal(await dialogText(page), 'O armazenamento deste navegador tem 1 projeto(s): InBrowser. Copiá-los para a pasta \'Silinx-projects\'? Mover… copia-os e depois apaga-os do armazenamento deste navegador, depois de confirmar.');
  assert.deepEqual(await page.eval(() => [...[...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('.dlg-buttons .btn')].map((b) => b.textContent)), ['Copiar', 'Mover…', 'Agora Não']);
  await page.dialogButton('Copiar');
  await page.waitNoDialog();
  await page.waitConsole(/^Copied 1 project/m);
  assert.deepEqual(await browserProjects(page), ['InBrowser']);
  assert.deepEqual(await problems(page), []);
}, { url: () => 'about:blank', skip: chromeOnly, timeout: 180000 });
