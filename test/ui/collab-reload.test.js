// UI: a live share and a follow that survive their page reloaded (#4850), in both interfaces: the owner shares (its
// editors' link), an editor follows it through this Silinx's relay. The owner's page reloaded: the share resumes by
// itself, its project open again, the same links; the editor's toolbar says "Reconnecting to Ana…" meanwhile, its
// console one line, then that Ana is back; edits continue both ways, on the disk too. The editor's page reloaded: it
// follows again with no dialog, its name the same, an editor still; its change and the owner's on both sides, once.
// Stop Sharing, and a reload resumes nothing. A follower's page in Portuguese: "A religar a Ana…" while the owner's page
// reloads, "A seguir Ana" once it is back; its Stop Following (Deixar de Seguir), and a reload follows nothing. The exact console lines; no warnings but those
// asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const type = (page, line, ch, s) => page.eval((l, c, t) => { const ed = window.Silinx.active.editor; ed.setCursor({ line: l, ch: c }); ed.replaceSelection(t); }, line, ch, s);
const label = (page) => page.eval(() => document.querySelector('.collab-presence .collab-btn')?.textContent);
const exactly = (line) => new RegExp(`^${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm');
const count = async (page, line) => ((await page.consoleText()).match(new RegExp(exactly(line).source, 'gm')) || []).length;
// (the toolbar's labels as they change, kept by the page: a short state is seen too)
const recordLabels = (p) => p.eval(() => {
  window.__labels = [];
  const look = () => { const t = document.querySelector('.collab-presence .collab-btn')?.textContent; if (t && t !== window.__labels.at(-1)) window.__labels.push(t); };
  new MutationObserver(look).observe(document.body, { subtree: true, childList: true, characterData: true });
  look();
});
const disk = async (project, path, text) => { for (let t = Date.now(); Date.now() - t < 8000 && await readWs(env, project, path) !== text;) await new Promise((r) => setTimeout(r, 100)); assert.equal(await readWs(env, project, path), text); };

const AWAY = (p) => `WARNING: Ana's connection to the shared project "${p}" was lost: reconnecting, waiting for them to come back (at most 2 minutes); what you see is as it was then.`;
const BACK = (p) => `Ana is back: "${p}" as it is now.`;
const RESUMED = (p) => `Sharing project "${p}" again after the page was reloaded: the same links; its followers reconnect by themselves.`;
const UNTRUSTED = (p) => `WARNING: Project "${p}" was changed by an editor of its shared link: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it. Trust Project`;

// the link opened in a page of its own, the follower's name given
async function open(link, name, { pt = false } = {}) {
  const fp = await env.newPage(env.server.url);
  await fp.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  if (pt) await fp.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  await fp.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
  await fp.waitDialog(pt ? 'Seguir um Projeto Partilhado' : 'Follow a Shared Project');
  await fp.fill('.dlg-overlay input[data-field=name]', name);
  await fp.dialogButton(pt ? 'Seguir' : 'Follow');
  await fp.waitFor(() => window.Silinx?.project && window.Silinx.startupChecked, [], { what: 'the shared project open', timeout: 30000 });
  return fp;
}

uiTest('#4850 the owner\'s page reloaded, then the editor\'s: the share and the follow resume, the same links, edits continue both ways; stopped on purpose, a reload resumes nothing', E, async (page) => {
  await makeProject(env, { name: 'Reload', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('Reload');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  const [view, edit] = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return [m.sharedLink(), m.editorsLink()]; });
  const ep = await open(edit, 'Rui');
  try {
    await ep.waitFor(() => window.Silinx.active?.path === 'src/top.vhd', [], { what: 'the owner\'s editor followed' });
    await page.waitConsole(/^Rui edits your project "Reload" with you\.$/m);
    await new Promise((r) => setTimeout(r, 700));   // (both bound)
    await recordLabels(ep);

    // the owner's page reloaded
    await page.reload();
    await page.waitConsole(exactly(RESUMED('Reload')), 30000);
    assert.equal(await page.eval(() => window.Silinx.project?.name), 'Reload');
    assert.deepEqual(await page.eval(async () => { const m = await import('/js/collab-share.js'); return [m.sharedLink(), m.editorsLink()]; }), [view, edit]);
    await ep.waitConsole(exactly(BACK('Reload')), 30000);
    await page.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Sharing (1)', [], { what: 'Sharing (1) again', timeout: 30000 });
    await ep.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Following Ana', [], { what: 'Following Ana again' });
    await ep.waitFor(() => [...document.querySelectorAll('.collab-presence .collab-badge')].map((b) => b.title).join() === 'Ana,Rui', [], { what: 'who is in, again' });
    const labels = await ep.eval(() => window.__labels);
    assert.deepEqual(labels.slice(labels.indexOf('Reconnecting to Ana…') - 1), ['Following Ana', 'Reconnecting to Ana…', 'Following Ana']);
    assert.equal(await count(ep, AWAY('Reload')), 1);   // (one line, not a stream)
    assert.equal(await count(page, 'Rui edits your project "Reload" with you.'), 0);   // (its console new: the followers it knew not said again)
    // edits continue, both ways
    await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
    await type(page, 0, 0, '-- by Ana\n');
    await ep.waitFor((t) => window.Silinx.active?.editor?.getValue() === t, [`-- by Ana\n${TOP}`], { what: 'the owner\'s change at the editor\'s' });
    await new Promise((r) => setTimeout(r, 700));   // (bound again on both sides)
    await type(ep, 12, 0, '-- by Rui\n');
    const both = `-- by Ana\n${TOP}-- by Rui\n`;
    await page.waitFor((t) => window.Silinx.active.editor.getValue() === t, [both], { what: 'the editor\'s change at the owner\'s' });
    await disk('Reload', 'src/top.vhd', both);

    // the editor's page reloaded: no dialog, an editor still
    await ep.reload();
    await ep.waitConsole(exactly('Editing Ana\'s project "Reload" with them again after the page was reloaded.'), 30000);
    assert.equal(await ep.eval(() => !!document.querySelector('.dlg-overlay')), false);
    await ep.waitFor((t) => window.Silinx.active?.path === 'src/top.vhd' && window.Silinx.active.editor.getValue() === t, [both], { what: 'the project as it is now, the owner\'s editor followed' });
    await page.waitConsole(/^Rui no longer follows your project\.$/m);
    await page.waitFor(() => (document.querySelector('.collab-presence .collab-btn')?.textContent || '') === 'Sharing (1)', [], { what: 'Sharing (1) after the editor\'s reload' });
    await new Promise((r) => setTimeout(r, 700));
    await type(ep, 0, 0, '-- Rui again\n');
    const three = `-- Rui again\n${both}`;
    await page.waitFor((t) => window.Silinx.active.editor.getValue() === t, [three], { what: 'the reloaded editor\'s change, once' });
    await disk('Reload', 'src/top.vhd', three);
    await type(page, 1, 0, '-- Ana again\n');
    const four = `-- Rui again\n-- Ana again\n-- by Ana\n${TOP}-- by Rui\n`;
    await ep.waitFor((t) => window.Silinx.active.editor.getValue() === t, [four], { what: 'the owner\'s change at the reloaded editor\'s' });
    assert.equal(await label(ep), 'Following Ana');
    assert.deepEqual(await warnings(ep), []);   // (its console new since the reload)
    assert.deepEqual(await warnings(page), [UNTRUSTED('Reload')]);   // (#3355; the owner's console new since its reload)
  } finally { await ep.close(); }
  // Stop Sharing, a reload shares nothing
  await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
  await page.reload();
  await new Promise((r) => setTimeout(r, 1500));
  assert.doesNotMatch(await page.consoleText(), /again after the page was reloaded/);
  assert.equal(await page.eval(async () => (await import('/js/collab-share.js')).sharedLink()), null);
  assert.deepEqual(await warnings(page), []);
});

uiTest('#4850 a follower\'s page in Portuguese: A religar a Ana… while the owner\'s page reloads, A seguir Ana once it is back', E, async (page) => {
  await makeProject(env, { name: 'ReloadPt', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('ReloadPt');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.sharedLink(); });
  const fp = await open(link, 'Rui', { pt: true });
  try {
    await fp.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'A seguir Ana', [], { what: 'A seguir Ana' });
    await recordLabels(fp);
    await page.reload();
    await page.waitConsole(exactly(RESUMED('ReloadPt')), 30000);
    await fp.waitConsole(exactly(BACK('ReloadPt')), 30000);
    await fp.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'A seguir Ana', [], { what: 'A seguir Ana again' });
    assert.deepEqual(await fp.eval(() => window.__labels), ['A seguir Ana', 'A religar a Ana…', 'A seguir Ana']);
    await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
    await type(page, 0, 0, '-- by Ana\n');
    await fp.waitFor((t) => window.Silinx.active?.editor?.getValue() === t, [`-- by Ana\n${TOP}`], { what: 'the owner\'s change after its reload' });
    assert.deepEqual(await warnings(fp), [AWAY('ReloadPt')]);
    assert.deepEqual(await warnings(page), []);
    // stopped on purpose: Stop Following, a reload follows nothing
    await fp.click('.collab-presence .collab-btn');
    await fp.waitForSelector('body > .menu-popup');
    await fp.click('body > .menu-popup .mi', { text: 'Deixar de Seguir' });
    await fp.waitConsole(/^Stopped following Ana's project "ReloadPt": what you see is as it was then\.$/m);
    await page.waitConsole(/^Rui no longer follows your project\.$/m);
    await fp.reload();
    await new Promise((r) => setTimeout(r, 1500));
    assert.doesNotMatch(await fp.consoleText(), /again after the page was reloaded/);
    assert.equal(await fp.eval(async () => (await import('/js/collab-state.js')).collab.role), null);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); }
  await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
});
