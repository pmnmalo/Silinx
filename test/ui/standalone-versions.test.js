// UI: a project's versions in the browser edition (#5740: kept in the browser's IndexedDB, web/js/versions-local.js),
// the site over HTTP: Save Version… keeps one; a file changed and saved; Versions… lists it; Restore Project puts it
// back (the open editor reads it again), the project before it kept as a version, the version's file that differs from
// now listed first (#5741); the page loaded again, the versions are still there; its index damaged in IndexedDB, the
// versions listed from their records, said, and the index rebuilt by the next save (#5908). The exact console lines; no
// other warnings, no error of the page's scripts. (The interface:
// SILINX_UI_INTERFACE.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';
import { buildSite } from './site-lib.js';

let env, site;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  site = await buildSite(env.tmp);
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

const problems = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)/.test(l));
const rows = (page) => page.waitFor(() => { const r = [...document.querySelectorAll('.dlg-overlay table.versions tbody tr')]; return r.length ? r.map((t) => [...t.cells].filter((_, i) => i !== 1 && i !== 2).map((c) => c.textContent).join(' | ')) : null; }, [], { what: 'the versions' });
const boot = (page) => page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'site boot' });

uiTest('#5740 browser edition: Save Version…, a change, Versions… and Restore Project; kept in IndexedDB across a reload', E, async (page) => {
  await page.goto(site.url);
  await boot(page);
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'Kept');
  await page.fill('.dlg-overlay .wiz-main select', 'blinky', { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', 'basys2', { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'Kept' && window.Silinx.project.top);
  await page.menu('Project', 'Save Version…');
  await page.waitDialog('Save Version');
  await page.fill('.dlg-overlay input[type=text]', 'as made');
  await page.dialogButton('OK');
  await page.waitConsole(/^Version 1 of Kept saved: as made\.$/m);
  // the top's file changed in its editor, saved
  const file = await page.eval(() => window.Silinx.project.files.find((f) => f.role === 'design' && /\.(vhd|v)$/.test(f.path)).path);
  await page.eval((p) => window.SilinxApp.openFile(p), file);
  await page.waitFor((p) => window.Silinx.active?.path === p, [file], { what: 'the file open' });
  const orig = await page.eval(() => window.Silinx.active.editor.getValue());
  await page.eval(() => window.Silinx.active.editor.setValue('-- broken\n'));
  await page.eval(() => window.SilinxApp.saveAll());
  await page.menu('Project', 'Versions…');
  await page.waitDialog('Versions of Kept');
  assert.equal((await rows(page)).at(-1).replace(/\| \+\d+$/, '| +N'), '1 | saved by hand | as made | +N');
  // version 1 selected (a newer one, the page's own save, may be first): its file that differs from now (#5741)
  await page.eval(() => document.querySelector('.dlg-overlay tr[data-version="1"]').click());
  await page.waitFor((f) => [...document.querySelectorAll('.dlg-overlay .version-file-list li')].some((l) => l.dataset.path === f && l.textContent.includes('(changed since)')), [file], { what: 'the file changed since version 1' });
  await page.dialogButton('Restore Project');
  await page.waitConsole(/^Restored Kept as version 1 had it: 1 file\(s\) written, 0 removed; the project before it kept as version \d+ \(restore it to undo\)\.$/m);
  await page.waitFor((t) => window.Silinx.active?.editor.getValue() === t, [orig], { what: 'the editor read again' });
  // the page loaded again: the versions still there
  await page.goto(site.url);
  await boot(page);
  await page.waitFor(() => window.Silinx.project?.name === 'Kept', [], { what: 'the project open again', timeout: 30000 });
  await page.menu('Project', 'Versions…');
  await page.waitDialog('Versions of Kept');
  const after = await rows(page);
  assert.equal(after.at(-1).replace(/\| \+\d+$/, '| +N'), '1 | saved by hand | as made | +N');
  assert.match(after[0], /^\d+ \| restored version 1 \|  \| ~1$/);
  await page.dialogButton('Close');
  assert.deepEqual(await problems(page), []);
  // #5908: the index's record damaged in IndexedDB: the versions listed from their own records, said; the next save
  // sets it aside and rebuilds it, in one transaction
  const n = after.length;
  await page.eval(async () => {
    const dbName = (await indexedDB.databases()).map(d => d.name).find(x => /versions$/.test(x));
    const db = await new Promise((r, j) => { const o = indexedDB.open(dbName); o.onsuccess = () => r(o.result); o.onerror = () => j(o.error); });
    const keys = await new Promise(r => { const q = db.transaction('kv').objectStore('kv').getAllKeys(); q.onsuccess = () => r(q.result); });
    const key = keys.find(k => k.endsWith('\u0000Kept\u0000index'));
    await new Promise(r => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put('{"version":1,"ne', key); tx.oncomplete = r; });
    db.close();
  });
  await page.menu('Project', 'Versions…');
  await page.waitDialog('Versions of Kept');
  assert.equal((await rows(page)).length, n, 'every version, from its record');
  await page.waitConsole(new RegExp(`^WARNING: the versions' index of 'Kept' was damaged \\(not JSON\\): rebuilt, ${n} version\\(s\\) taken from their own records; no version that could be read is lost$`, 'm'));
  await page.dialogButton('Close');
  await page.menu('Project', 'Save Version…');
  await page.waitDialog('Save Version');
  await page.fill('.dlg-overlay input[type=text]', 'after');
  await page.dialogButton('OK');
  await page.waitConsole(new RegExp(`^WARNING: the versions' index of 'Kept' was damaged \\(not JSON\\): set aside as index-damaged-[^ ]+ and rebuilt, ${n} version\\(s\\) taken from their own records; no version that could be read is lost$`, 'm'));
  await page.waitConsole(new RegExp(`^Version ${n + 1} of Kept saved: after\\.$`, 'm'));
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
}, { url: () => 'about:blank', timeout: 240000 });
