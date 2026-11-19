// UI: a shared project's cursors at once (#4647, core/collab-pace.js): the owner's page and a follower's look at
// themselves at their events (a key, a click), not only at their look every TRACK_MS. With that look stopped in both
// pages (their setInterval of TRACK_MS dropped), the owner's cursor moved by a key still reaches the follower's editor,
// and the follower's click still puts their cursor in the owner's editor (the owner's page looks again when the
// participants change). In both interfaces; no new label. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const consoleWarnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l.trim()));
// (the page's look every TRACK_MS (300 ms) never started: only its events tell what it does)
const noLook = (page) => page.eval(() => { const si = window.setInterval; window.setInterval = (f, ms, ...a) => (ms === 300 ? 0 : si(f, ms, ...a)); });

async function share(page, name) {
  await page.menu('File', 'Share Project…');
  await page.waitDialog('Share Project');
  if (!await page.eval(() => document.querySelector('.dlg-overlay input[data-field=how-live]')?.checked)) await page.click('.dlg-overlay input[data-field=how-live]');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .collab-dlg'), [], { what: 'the live window' });
  await page.fill('.dlg-overlay input[data-field=name]', name);
  await page.dialogButton('Start Sharing');
  const link = await page.waitFor(() => (document.querySelector('.dlg-overlay .link-field:has([data-field=link]) .link-generate:not(:disabled)')?.click(), document.querySelector('.dlg-overlay input[data-field=link]')?.value) || null, [], { what: 'the link' });
  await page.dialogButton('Close');
  await page.waitNoDialog();
  return link;
}
async function follow(link, name) {
  const fp = await env.newPage(env.server.url);
  await fp.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  const u = new URL(link);
  await fp.goto(`${u.origin}/?f=1${u.hash}`);
  await fp.waitDialog('Follow a Shared Project');
  await noLook(fp);
  await fp.fill('.dlg-overlay input[data-field=name]', name);
  await fp.dialogButton('Follow');
  await fp.waitFor(() => window.Silinx?.project && window.Silinx.startupChecked, [], { what: 'the shared project open', timeout: 20000 });
  return fp;
}

uiTest('#4647 a cursor moved by a key, or put by a click, reaches the other page at once, with no look every 300 ms', E, async (page) => {
  await makeProject(env, { name: 'Paced', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('Paced');
  await page.eval(async () => { await window.SilinxApp.openFile('src/top.vhd'); window.Silinx.active.editor.setCursor({ line: 2, ch: 0 }); });
  await noLook(page);
  const link = await share(page, 'Ana');
  const fp = await follow(link, 'Rui');
  try {
    await fp.waitFor(() => window.Silinx.active?.path === 'src/top.vhd', [], { what: 'the owner\'s editor followed' });
    // the owner's cursor moved by keys: followed
    await page.click('.doc:not([hidden]) .cm-content');
    await page.eval(() => window.Silinx.active.editor.setCursor({ line: 4, ch: 0 }));
    await page.key('ArrowDown');
    await page.key('ArrowDown');
    assert.equal(await page.eval(() => window.Silinx.active.editor.getCursor().line), 6);
    await fp.waitFor(() => window.Silinx.active.editor.getCursor().line === 6, [], { what: 'the owner\'s cursor, moved by a key' });
    // the follower's click: their cursor in the owner's editor
    await fp.click('.doc:not([hidden]) .cm-content');
    await page.waitFor(() => document.querySelector('.doc:not([hidden]) .cm-peer-name')?.textContent === 'Rui', [], { what: 'Rui\'s cursor at the owner\'s' });
    assert.equal(await fp.eval(() => window.Silinx.active?.path), 'src/top.vhd', 'still following');
    assert.deepEqual(await consoleWarnings(page), []);
    assert.deepEqual(await consoleWarnings(fp), []);
  } finally {
    await fp.close();
  }
});
