// UI: a shared project's participants made editors or viewers (#3997, web/js/collab-share.js, collab-follow.js) from
// the Collaboration tab's Viewer | Editor on each follower's row (#4646: the owner's only, the role pressed; the
// Sharing menu's Make <name> an Editor / a Viewer gone), in both interfaces: the owner's menu lists each participant with
// their role (owner, editor, viewer: no more "follower") and no role command; a viewer made an editor: told in their
// console, their open editor editable, their change at the owner's and on the disk, the follower's tab showing the
// roles read only; made a viewer again: told, their editor read only again, the editors' link renewed (Share Project…
// shows the new one; the old one, opened, only follows: its change written nowhere); the menu and the control in
// Portuguese. The exact console lines; no warnings but the project untrusted by the editor's change (#3355).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const type = (page, s) => page.eval((t) => { const ed = window.Silinx.active.editor; ed.setCursor({ line: 0, ch: 0 }); ed.replaceSelection(t); }, s);
// the Sharing menu's items: [label, its shortcut column] (a separator: '-')
const menu = async (page) => {
  await page.click('.collab-presence .collab-btn');
  await page.waitForSelector('body > .menu-popup');
  return page.eval(() => [...document.querySelector('body > .menu-popup').children].map((m) => (m.classList.contains('sep') ? '-' : [m.querySelector('.lbl')?.textContent, m.querySelector('.sc')?.textContent || ''])));
};
// a participant opens a link in a page of their own
async function join(link, name) {
  const p = await env.newPage(env.server.url);
  await p.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await p.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
  await p.waitDialog('Follow a Shared Project');
  await p.fill('.dlg-overlay input[data-field=name]', name);
  await p.dialogButton('Follow');
  await p.waitFor(() => window.Silinx?.project?.name && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
  return p;
}
// the owner's Collaboration tab: each follower's [name, role states pressed, their tips] (#4646); a click on one
const roles = (page) => page.eval(() => [...document.querySelectorAll('#collab-page .collab-peer')].filter((r) => r.querySelector('.collab-roles'))
  .map((r) => [r.children[1].textContent, [...r.querySelectorAll('.collab-role-state')].map((b) => [b.textContent, b.getAttribute('aria-pressed'), b.title, b.disabled])]));
const choose = (page, role) => page.click(`#collab-page .collab-peer .collab-role-state[data-role="${role}"]`);
// a page's Sharing box's rows, as shown: [name, role] (read only: a follower's)
const rows = (page) => page.eval(() => [...document.querySelectorAll('#collab-page .collab-peer')].map((r) => [r.children[1].textContent, r.querySelector('.collab-role')?.textContent ?? null, !!r.querySelector('.collab-roles')]));
const readOnly = (p) => p.eval(() => window.Silinx.active.editor.readOnly());

uiTest('#3997 the Sharing menu: a viewer made an editor, then a viewer again (the editors\' link renewed, the old one only follows); Portuguese', E, async (page) => {
  await makeProject(env, { name: 'Roles', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('Roles');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  const [link, old] = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return [m.sharedLink(), m.editorsLink()]; });
  const rp = await join(link, 'Rui');
  try {
    await rp.waitFor(() => window.Silinx.active?.path === 'src/top.vhd', [], { what: 'the owner\'s editor followed' });
    assert.equal(await readOnly(rp), true);
    await page.waitConsole(/^Rui follows your project "Roles"\.$/m);
    // the owner's menu: Rui's Viewer | Editor (#4849, test/ui/collab-roles-menu.test.js); no role command in it (#4646)
    await page.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Sharing (1)', [], { what: 'Sharing (1)' });
    assert.deepEqual(await menu(page), [['Ana', 'you'], ['Rui', 'ViewerEditor'], '-', ['Copy View Link', ''], ['Copy Editor Link', ''], ['Add a User…', ''], ['Stop Sharing', '']]);
    await page.eval(() => document.body.click());
    // (the viewer's own menu: themselves a viewer)
    assert.deepEqual((await menu(rp)).slice(0, 2), [['Ana', 'owner'], ['Rui', 'you']]);
    await rp.eval(() => document.body.click());
    // the owner's tab: Rui's Viewer | Editor, Viewer pressed; no Make … command
    await page.leftTab('collab');
    await page.waitFor(() => !!document.querySelector('#collab-page .collab-roles'), [], { what: 'Rui\'s Viewer | Editor' });
    assert.deepEqual(await roles(page), [['Rui', [['Viewer', 'true', '', false], ['Editor', 'false', 'Make Rui an Editor', false]]]]);
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#collab-page .entry a')].map((a) => a.textContent).filter((t) => /^Make /.test(t))), []);
    const consoleAt = (await page.consoleText()).split('\n').length, rConsoleAt = (await rp.consoleText()).split('\n').length;
    // (a click on the pressed state: nothing)
    await page.click('#collab-page .collab-role-state[data-role="viewer"]');
    await choose(page, 'editor');
    await page.waitConsole(/^Rui is an editor now: they edit the project's text files and drawings with you\.$/m);
    await rp.waitConsole(/^Ana made you an editor: you edit the project's text files and drawings with them\.$/m);
    await rp.waitFor(() => window.Silinx.active?.path === 'src/top.vhd' && window.Silinx.active.editor && !window.Silinx.active.editor.readOnly(), [], { what: 'Rui\'s editor editable', timeout: 10000 });
    // both sides: Editor pressed at the owner's; Rui's tab, the roles read only (no control)
    await page.waitFor(() => document.querySelector('#collab-page .collab-role-state[data-role="editor"]')?.getAttribute('aria-pressed') === 'true', [], { what: 'Editor pressed' });
    assert.deepEqual(await roles(page), [['Rui', [['Viewer', 'false', 'Make Rui a Viewer', false], ['Editor', 'true', '', false]]]]);
    // (read from his Collaboration page, drawn while hidden: opening the tab would leave Ana's view, browsing alone)
    await rp.waitFor(() => document.querySelectorAll('#collab-page .collab-peer').length === 2, [], { what: 'Rui\'s Sharing box' });
    assert.deepEqual(await rows(rp), [['Ana', 'owner', false], ['Rui', 'you', false]]);
    // (the console lines: one at each side, the one click on the pressed state none)
    assert.deepEqual((await page.consoleText()).split('\n').slice(consoleAt).map((l) => l.trim()).filter(Boolean), ['Rui is an editor now: they edit the project\'s text files and drawings with you.']);
    assert.deepEqual((await rp.consoleText()).split('\n').slice(rConsoleAt).map((l) => l.trim()).filter(Boolean), ['Ana made you an editor: you edit the project\'s text files and drawings with them.']);
    await new Promise((r) => setTimeout(r, 700));   // (bound by the next round of each)
    await type(rp, '-- by Rui\n');
    for (let t = Date.now(); Date.now() - t < 8000 && await readWs(env, 'Roles', 'src/top.vhd') !== `-- by Rui\n${TOP}`;) await new Promise((r) => setTimeout(r, 100));
    assert.equal(await readWs(env, 'Roles', 'src/top.vhd'), `-- by Rui\n${TOP}`);
    assert.deepEqual((await menu(page)).slice(1, 3), [['Rui', 'ViewerEditor'], '-']);
    await page.eval(() => document.body.click());
    // made a viewer again (the tab's Viewer): read only; the editors' link renewed
    await page.leftTab('collab');
    await choose(page, 'viewer');
    await page.waitConsole(/^Rui is a viewer now: the editors' link was renewed \(the old one only follows\); your other editors keep editing\.$/m);
    await rp.waitConsole(/^Ana made you a viewer: you follow the project, read only\.$/m);
    await rp.waitFor(() => window.Silinx.active?.path === 'src/top.vhd' && window.Silinx.active.editor?.readOnly(), [], { what: 'Rui\'s editor read only', timeout: 10000 });
    await page.waitFor(() => document.querySelector('#collab-page .collab-role-state[data-role="viewer"]')?.getAttribute('aria-pressed') === 'true', [], { what: 'Viewer pressed again' });
    const renewed = await page.eval(async () => (await import('/js/collab-share.js')).editorsLink());
    assert.notEqual(renewed, old);
    assert.match(renewed, /#edit=/);
    // Share Project…: the new editors' link
    await page.eval(() => { window.__shared = import('/js/collab-share.js').then((m) => m.shareProjectDialog()); });
    await page.waitDialog('Share Project');
    assert.equal(await page.waitFor(() => (document.querySelector('.dlg-overlay .link-field:has([data-field=edit-link]) .link-generate:not(:disabled)')?.click(), document.querySelector('.dlg-overlay input[data-field=edit-link]')?.value) || null, [], { what: 'the editors\' link' }), renewed);
    await page.dialogButton('Close');
    await page.waitNoDialog();
    // the old editors' link: it opens, but what its page changes is written nowhere
    const op = await join(old, 'Old');
    try {
      await op.waitFor(() => window.Silinx.active?.path === 'src/top.vhd' && window.Silinx.active.editor, [], { what: 'the old link\'s page' });
      if (!await readOnly(op)) { await new Promise((r) => setTimeout(r, 700)); await type(op, '-- the old link\n'); }
      await new Promise((r) => setTimeout(r, 1000));
      assert.equal(await readWs(env, 'Roles', 'src/top.vhd'), `-- by Rui\n${TOP}`);
    } finally { await op.close(); }
    // in Portuguese: the roles, the commands; the tab's Espectador | Editor, its tip
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    try {
      await page.waitFor(() => document.querySelectorAll('.collab-presence .collab-badge').length === 2, [], { what: 'the old link\'s page gone' });
      assert.deepEqual((await menu(page)).slice(0, 4), [['Ana', 'você'], ['Rui', 'EspectadorEditor'], '-', ['Copiar Ligação de Visualização', '']]);
      await page.eval(() => document.body.click());
      await page.leftTab('collab');
      await page.waitFor(() => document.querySelector('#collab-page .collab-role-state[data-role="viewer"]')?.textContent === 'Espectador', [], { what: 'the control in Portuguese' });
      assert.deepEqual(await roles(page), [['Rui', [['Espectador', 'true', '', false], ['Editor', 'false', 'Tornar Rui Editor', false]]]]);
      assert.equal(await page.eval(() => document.querySelector('#collab-page .collab-roles').getAttribute('aria-label')), 'Papel');
    } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
    assert.deepEqual(await warnings(rp), []);
  } finally { await rp.close(); }
  await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
  // (the project untrusted by the editor's first change, #3355: the owner's one warning)
  assert.deepEqual(await warnings(page), ['WARNING: Project "Roles" was changed by an editor of its shared link: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it. Trust Project']);
}, { timeout: 120000 });
