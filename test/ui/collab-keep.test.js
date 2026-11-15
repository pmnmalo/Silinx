// UI: a follower's project once following ends is never left editable and saved nowhere (#4198), the owner and an editor
// in one test, in both interfaces. The editor changes a file, then Stop Following: its documents opened again read only
// (the notice in their toolbar), its typing refused, the tab's closing warned; the console's Keep a Copy saves the
// project as a project of its own (a free name beside the owner's, untrusted, the change in it) and opens it, nothing
// shared any more. The owner stops sharing while an editor (in Portuguese) has changed a file: read only, Close Project
// asks (Guardar uma Cópia), Close Without Keeping closes it, nothing kept, nothing editable left. The exact warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const until = async (fn, what, ms = 10000) => { for (const t = Date.now(); ;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error(`timed out: ${what}`); await sleep(100); } };
const untrustedByEditor = (name) => `WARNING: Project "${name}" was changed by an editor of its shared link: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it. Trust Project`;

// an editor opens the owner's editors' link (pt: in Portuguese), the owner's top.vhd in front, editable
async function editor(page, name, { pt = false } = {}) {
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  const ep = await env.newPage(env.server.url);
  await ep.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  if (pt) await ep.eval(() => localStorage.setItem('silinx.lang', 'pt'));
  await ep.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
  await ep.waitDialog(pt ? 'Seguir um Projeto Partilhado' : 'Follow a Shared Project');
  await ep.fill('.dlg-overlay input[data-field=name]', 'Rui');
  await ep.dialogButton(pt ? 'Seguir' : 'Follow');
  await ep.waitFor((n) => window.Silinx?.project?.name === n && window.Silinx.startupChecked, [name], { what: 'the project open', timeout: 30000 });
  await ep.waitFor(() => window.Silinx.active?.path === 'src/top.vhd' && window.Silinx.active.editor && !window.Silinx.active.editor.readOnly(), [], { what: 'the owner\'s editor, editable' });
  await sleep(700);   // (bound: its track)
  // a change of the editor's, delivered to the owner
  await ep.eval(() => { const ed = window.Silinx.active.editor; ed.setCursor({ line: 0, ch: 0 }); ed.replaceSelection('-- by Rui\n'); });
  await until(async () => (await page.eval(() => window.Silinx.active.editor.getValue())).startsWith('-- by Rui\n'), 'the change at the owner\'s');
  return ep;
}
const readOnlyNow = (ep) => ep.waitFor(() => window.Silinx.active?.path === 'src/top.vhd' && window.Silinx.active.editor?.readOnly() && !!window.Silinx.active.el.querySelector('[data-follow-notice]'), [], { what: 'opened again, read only' });

uiTest('#4198 an editor stops following: read only, the tab\'s closing warned; Keep a Copy saves it as a project of its own, untrusted, and opens it', E, async (page) => {
  await makeProject(env, { name: 'Keep', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('Keep');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  const ep = await editor(page, 'Keep');
  try {
    assert.equal(await ep.eval(async () => (await import('/js/collab-leave.js')).unsaved()), false, 'following: the owner has the change');
    // Stop Following
    await ep.click('.collab-presence .collab-btn');
    await ep.waitForSelector('body > .menu-popup');
    await ep.click('body > .menu-popup .mi', { text: 'Stop Following' });
    await ep.waitConsole(/^Ana's project "Keep" is read only now and saved nowhere: Keep a Copy saves it as a project of yours \(untrusted, as any project from someone else\)\.\s*Keep a Copy$/m);
    await readOnlyNow(ep);
    // nothing editable: its typing refused; the tab's closing warned (a change saved nowhere)
    await ep.click('.doc:not([hidden]) .cm-content');
    await ep.key('x');
    assert.ok((await ep.eval(() => window.Silinx.active.editor.getValue())).startsWith('-- by Rui\nlibrary'));
    assert.equal(await ep.eval(async () => (await import('/js/collab-leave.js')).unsaved()), true);
    assert.equal(await ep.eval(() => { const e = new Event('beforeunload', { cancelable: true }); dispatchEvent(e); return e.defaultPrevented; }), true);
    // the presence's menu has it too
    await ep.click('.collab-presence .collab-btn');
    await ep.waitForSelector('body > .menu-popup');
    assert.deepEqual(await ep.eval(() => [...document.querySelectorAll('body > .menu-popup .mi .lbl')].map((m) => m.textContent)), ['Rui', 'Keep a Copy']);
    await ep.key('Escape');
    // Keep a Copy (the console's button): a project of its own beside the owner's, untrusted, the change in it, opened
    await ep.eval(() => [...document.querySelectorAll('#console-log .ln-action')].find((b) => b.textContent === 'Keep a Copy').click());   // (the console may be folded)
    await ep.waitFor(() => window.Silinx.project?.name === 'Keep_2' && window.Silinx.startupChecked, [], { what: 'the copy open', timeout: 20000 });
    await ep.waitConsole(/^Kept a copy of Ana's project "Keep" as your project "Keep_2" \(untrusted: Trust Project, when it opens, once you trust it\)\.$/m);
    assert.ok((await readWs(env, 'Keep_2', 'src/top.vhd')).startsWith('-- by Rui\nlibrary'));
    assert.equal(JSON.parse(await readWs(env, 'Keep_2', 'silinx.json')).trusted, false);
    assert.equal(await ep.eval(() => !!document.querySelector('.collab-presence')), false, 'nothing shared any more');
    assert.equal(await ep.eval(async () => (await import('/js/collab-leave.js')).unsaved()), false);
    assert.equal(await ep.eval(() => { const e = new Event('beforeunload', { cancelable: true }); dispatchEvent(e); return e.defaultPrevented; }), false);
    assert.deepEqual(await warnings(ep), ['WARNING: Ana\'s project "Keep" is no longer followed (the connection to the relay ended): what you see is as it was then.']);
    assert.deepEqual(await warnings(page), [untrustedByEditor('Keep')]);
    assert.deepEqual(ep.errors, []);
  } finally { await ep.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
}, { timeout: 150000 });

uiTest('#4198 the owner stops sharing while an editor (in Portuguese) changed a file: read only; Close Project asks, Close Without Keeping keeps nothing, nothing editable left', E, async (page) => {
  await makeProject(env, { name: 'Lost', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('Lost');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  const ep = await editor(page, 'Lost', { pt: true });
  try {
    await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
    await ep.waitConsole(/^WARNING: Ana's project "Lost" is no longer followed \(the owner stopped sharing\): what you see is as it was then\.$/m);
    await ep.waitConsole(/^Ana's project "Lost" is read only now and saved nowhere: .*Guardar uma Cópia$/m);
    await readOnlyNow(ep);
    // Close Project: asked, in Portuguese
    const closing = ep.eval(() => window.SilinxApp.closeProject()).catch(() => {});
    await ep.waitDialog('Guardar uma Cópia');
    assert.equal(await ep.eval(() => document.querySelector('.dlg-overlay p').textContent), 'Alterou este projeto, que já não é partilhado, e não está guardado em lado nenhum. Guardar uma cópia dele como um projeto seu?');
    await ep.dialogButton('Fechar sem Guardar');
    await closing;
    await ep.waitFor(() => !window.Silinx.project && !window.Silinx.docs.length, [], { what: 'closed, nothing left open' });
    await ep.waitConsole(/^WARNING: Ana's project "Lost" closed: your changes were not kept\.$/m);
    assert.equal(fs.existsSync(path.join(env.server.workspace, 'Lost_2')), false, 'nothing kept');
    assert.equal(await ep.eval(async () => (await import('/js/collab-leave.js')).unsaved()), false);
    assert.equal(await ep.eval(() => !!document.querySelector('.collab-presence')), false);
    assert.deepEqual(await warnings(ep), [
      'WARNING: Ana\'s project "Lost" is no longer followed (the owner stopped sharing): what you see is as it was then.',
      'WARNING: Ana\'s project "Lost" closed: your changes were not kept.',
    ]);
    assert.deepEqual(ep.errors, []);
  } finally { await ep.close(); }
}, { timeout: 150000 });
