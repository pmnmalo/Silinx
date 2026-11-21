// UI: the browser edition asks the browser to keep its storage persistent at start-up (#4960, web/js/storage-persist.js):
// refused, one console line (an information line: no warning, no error); granted, persistent already, or a browser with
// no API (StorageManager's persist taken away), nothing said; the projects in a workspace folder on the disk (a fake
// one), nothing asked. The browser's answers are the page's own (StorageManager.prototype patched before the app loads).
// (The interface: SILINX_UI_INTERFACE.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, ROOT, chromeOnly } from './harness.js';
import { buildSite } from './site-lib.js';
import { REFUSED } from '../../web/js/storage-persist.js';

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

// the browser's answers, from localStorage (set before a reload): '__persist' = 'refused' | 'granted' | 'persisted' |
// 'none' (no API); the calls kept in localStorage '__persistCalls'
const FAKE_STORAGE = `(() => {
  const mode = localStorage.getItem('__persist');
  if (!mode || typeof StorageManager === 'undefined') return;
  const P = StorageManager.prototype;
  const note = (c) => localStorage.setItem('__persistCalls', (localStorage.getItem('__persistCalls') || '') + c + ' ');
  if (mode === 'none') { delete P.persist; delete P.persisted; return; }
  P.persisted = async () => { note('persisted'); return mode === 'persisted'; };
  P.persist = async () => { note('persist'); return mode === 'granted'; };
})();`;
const boot = async (page, mode) => {
  await page.eval((m) => { localStorage.setItem('__persist', m); localStorage.removeItem('__persistCalls'); }, mode);
  await page.goto(site.url);
  await page.waitFor(() => window.SilinxApp && window.Silinx.devices && document.querySelector('#start-page .start-storage'), [], { what: 'site boot' });
  await page.waitConsole(/Browser edition: projects are stored/);
};
const answered = (page) => page.waitFor(() => /persist/.test(localStorage.getItem('__persistCalls') || '') && localStorage.getItem('__persistCalls'), [], { what: 'the storage asked' });
const lines = async (page) => (await page.consoleText()).split('\n');
const problems = async (page) => (await lines(page)).filter((l) => /^(WARNING|ERROR)/.test(l));

uiTest('#4960 browser edition: the browser asked to keep its storage; refused, one line in the console; granted or persistent already, none', E, async (page) => {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_STORAGE });
  await page.goto(site.url);
  // refused: asked (persisted, then persist), one line
  await boot(page, 'refused');
  assert.equal(await answered(page), 'persisted persist ');
  await page.waitConsole(/did not make its storage persistent/);
  assert.deepEqual((await lines(page)).filter((l) => /persistent/.test(l)), [REFUSED]);
  assert.deepEqual(await problems(page), []);
  // granted: asked, nothing said
  await boot(page, 'granted');
  assert.equal(await answered(page), 'persisted persist ');
  await page.waitFor(() => !!window.Silinx.devices);
  assert.deepEqual((await lines(page)).filter((l) => /persistent/.test(l)), []);
  // persistent already: not asked again
  await boot(page, 'persisted');
  assert.equal(await page.waitFor(() => localStorage.getItem('__persistCalls'), [], { what: 'persisted asked' }), 'persisted ');
  assert.deepEqual((await lines(page)).filter((l) => /persistent/.test(l)), []);
  // no API (an older browser): nothing asked, nothing said, the app as before
  await boot(page, 'none');
  assert.equal(await page.eval(() => localStorage.getItem('__persistCalls')), null);
  assert.deepEqual((await lines(page)).filter((l) => /persistent/.test(l)), []);
  assert.deepEqual(await problems(page), []);
}, { url: () => 'about:blank', skip: chromeOnly, timeout: 180000 });

uiTest('#4960 browser edition: the projects in a workspace folder on the disk: the browser\'s storage not asked for', E, async (page) => {
  // (the folder remembered from a previous visit: the start-up opens it, its permission granted)
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `${FAKE_STORAGE}
    window.SILINX_WORKSPACE_HANDLES = { load: async () => (await import(new URL('/__test/fs-access-fake.js', location.href).href)).fakeDirectory('Silinx-projects'), save: async () => {} };` });
  await page.goto(site.url);
  await page.eval(() => localStorage.setItem('silinx.standalone.storage', 'folder'));
  await boot(page, 'refused');
  await page.waitConsole(/Browser edition: projects are stored in the folder 'Silinx-projects' on the disk/);
  assert.equal(await page.eval(() => localStorage.getItem('__persistCalls')), null);
  assert.deepEqual((await lines(page)).filter((l) => /persistent/.test(l)), []);
  assert.deepEqual(await problems(page), []);
}, { url: () => 'about:blank', skip: chromeOnly, timeout: 180000 });
