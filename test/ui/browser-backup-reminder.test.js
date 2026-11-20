// UI: the browser edition's back-up reminder (#4971, web/js/backup-reminder.js): a project kept only in this browser's
// storage, not backed up for 7 days (its first sight 8 days ago, set in its record), is said in one console line when it
// opens, its buttons Export Project (.zip) and Store Project in a GitHub Repository…; Export Project (.zip) downloads the
// Silinx project and records the back-up (not due any more); at most one reminder in the page's session; a project just
// made is not due. In Portuguese too; no warning, no error. (The interface: SILINX_UI_INTERFACE.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, waitDownload } from './harness.js';
import { buildSite } from './site-lib.js';
import { reminderLine } from '../../core/backup.js';

let env, site;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  site = await buildSite(env.tmp);
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

const DAY = 24 * 3600 * 1000;
const boot = async (page) => {
  await page.goto(site.url);
  await page.waitFor(() => window.SilinxApp && window.Silinx.devices && window.Silinx.linksWatched, [], { what: 'site boot' });
};
const lines = async (page) => (await page.consoleText()).split('\n');
const problems = async (page) => (await lines(page)).filter((l) => /^(WARNING|ERROR)/.test(l));
const reminders = async (page) => (await lines(page)).filter((l) => / is kept only in this browser's storage and /.test(l));
const buttons = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].filter((l) => / is kept only in this browser's storage and /.test(l.textContent))
  .map((l) => [...l.querySelectorAll('.ln-action')].map((b) => [b.textContent, !b.disabled])));
const record = (page, name) => page.eval((n) => JSON.parse(localStorage.getItem('silinx.backups') || '{}')[`:browser:${n}`] ?? null, name);
// a project made in the browser's storage (the wizard), then its first sight put `days` back
const make = async (page, name, days) => {
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
  await page.waitFor((n) => JSON.parse(localStorage.getItem('silinx.backups') || '{}')[`:browser:${n}`], [name], { what: 'seen' });
  if (days) await page.eval((n, d) => { const j = JSON.parse(localStorage.getItem('silinx.backups')); j[`:browser:${n}`].since -= d; localStorage.setItem('silinx.backups', JSON.stringify(j)); }, name, days * DAY);
};
const open = (page, name) => page.eval((n) => window.SilinxApp.openProject(n), name);

uiTest('#4971 browser edition: a project not backed up for 7 days said once when it opens; Export Project (.zip) backs it up', E, async (page) => {
  await boot(page);
  await page.eval(() => localStorage.setItem('silinx.standalone.folderOffer', 'browser'));   // (the first run's offer answered, #4962)
  await make(page, 'Old', 8);
  await make(page, 'Older', 9);
  await make(page, 'Fresh', 0);
  assert.deepEqual(await reminders(page), [], 'none while they were made');
  // a new page session: Fresh (not due) reopened, nothing; Old opened: its reminder
  await boot(page);
  await page.waitFor(() => window.Silinx.project?.name === 'Fresh');
  assert.deepEqual(await reminders(page), []);
  await open(page, 'Old');
  await page.waitConsole(/Project 'Old' is kept only in this browser's storage/);
  const r = await record(page, 'Old');
  assert.deepEqual(await reminders(page), [`${reminderLine('Old', r, r.since + 8 * DAY)} Export Project (.zip) Store Project in a GitHub Repository…`]);
  assert.deepEqual(await buttons(page), [[['Export Project (.zip)', true], ['Store Project in a GitHub Repository…', true]]]);
  // once in the session: Older (due too) said nothing
  await open(page, 'Older');
  await page.waitFor(() => window.Silinx.project?.name === 'Older');
  await open(page, 'Old');
  await page.waitFor(() => window.Silinx.project?.name === 'Old');
  assert.equal((await reminders(page)).length, 1);
  // Export Project (.zip): the Silinx project downloaded, the back-up recorded, the buttons disabled
  await page.eval(() => [...document.querySelectorAll('#console-log .ln-action')].find((b) => b.textContent === 'Export Project (.zip)').click());
  await page.waitConsole(/^Exported Old-silinx\.zip: the whole Silinx project/m);
  await waitDownload(page, 'Old-silinx.zip');
  const done = await record(page, 'Old');
  assert.equal(done.how, 'export');
  assert.ok(Date.now() - done.last < 60000);
  assert.deepEqual(await buttons(page), [[['Export Project (.zip)', false], ['Store Project in a GitHub Repository…', false]]]);
  // the next session: Old backed up (not due); Older's turn
  await boot(page);
  await page.waitFor(() => window.Silinx.project?.name === 'Old');
  await open(page, 'Fresh');
  await page.waitFor(() => window.Silinx.project?.name === 'Fresh');
  assert.deepEqual(await reminders(page), []);
  await open(page, 'Older');
  await page.waitConsole(/Project 'Older' is kept only in this browser's storage and was never backed up \(9 day\(s\)\)/);
  assert.deepEqual(await problems(page), []);
  // in Portuguese: its buttons translated
  await page.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  await boot(page);
  await page.waitConsole(/Project 'Older' is kept only in this browser's storage/);
  assert.deepEqual(await buttons(page), [[['Exportar Projeto (.zip)', true], ['Guardar o Projeto num Repositório GitHub…', true]]]);
  assert.deepEqual(await problems(page), []);
}, { url: () => 'about:blank', timeout: 240000 });
