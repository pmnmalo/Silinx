// UI: a shared project's participants made editors or viewers from the toolbar's Sharing menu (#3997, web/js/
// collab-share.js, collab-follow.js), in both interfaces: the owner's menu lists each participant with their role
// (owner, editor, viewer: no more "follower") and Make <name> an Editor / a Viewer; a viewer made an editor: told in
// their console, their open editor editable, their change at the owner's and on the disk; made a viewer again: told,
// their editor read only again, the editors' link renewed (Share Project… shows the new one; the old one, opened, only
// follows: its change written nowhere); the menu in Portuguese. The exact console lines; no warnings but the
// project untrusted by the editor's change (#3355).
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
const pick = async (page, label) => {
  if (!await page.eval(() => !!document.querySelector('body > .menu-popup'))) await menu(page);
  await page.click('body > .menu-popup .mi', { text: label });
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
    // the owner's menu: Rui a viewer; Make Rui an Editor
    await page.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Sharing (1)', [], { what: 'Sharing (1)' });
    assert.deepEqual(await menu(page), [['Ana', 'you'], ['Rui', 'viewer'], '-', ['Make Rui an Editor', ''], '-', ['Copy Link', ''], ['Copy Editor Link', ''], ['Add a User…', ''], ['Stop Sharing', '']]);
    // (the viewer's own menu: themselves a viewer)
    assert.deepEqual((await menu(rp)).slice(0, 2), [['Ana', 'owner'], ['Rui', 'you']]);
    await rp.eval(() => document.body.click());
    await pick(page, 'Make Rui an Editor');
    await page.waitConsole(/^Rui is an editor now: they edit the project's text files and drawings with you\.$/m);
    await rp.waitConsole(/^Ana made you an editor: you edit the project's text files and drawings with them\.$/m);
    await rp.waitFor(() => window.Silinx.active?.path === 'src/top.vhd' && window.Silinx.active.editor && !window.Silinx.active.editor.readOnly(), [], { what: 'Rui\'s editor editable', timeout: 10000 });
    await new Promise((r) => setTimeout(r, 700));   // (bound by the next round of each)
    await type(rp, '-- by Rui\n');
    for (let t = Date.now(); Date.now() - t < 8000 && await readWs(env, 'Roles', 'src/top.vhd') !== `-- by Rui\n${TOP}`;) await new Promise((r) => setTimeout(r, 100));
    assert.equal(await readWs(env, 'Roles', 'src/top.vhd'), `-- by Rui\n${TOP}`);
    assert.deepEqual((await menu(page)).slice(1, 4), [['Rui', 'editor'], '-', ['Make Rui a Viewer', '']]);
    // made a viewer again: read only; the editors' link renewed
    await pick(page, 'Make Rui a Viewer');
    await page.waitConsole(/^Rui is a viewer now: the editors' link was renewed \(the old one only follows\); your other editors keep editing\.$/m);
    await rp.waitConsole(/^Ana made you a viewer: you follow the project, read only\.$/m);
    await rp.waitFor(() => window.Silinx.active?.path === 'src/top.vhd' && window.Silinx.active.editor?.readOnly(), [], { what: 'Rui\'s editor read only', timeout: 10000 });
    const renewed = await page.eval(async () => (await import('/js/collab-share.js')).editorsLink());
    assert.notEqual(renewed, old);
    assert.match(renewed, /#edit=/);
    // Share Project…: the new editors' link
    await page.eval(() => { window.__shared = import('/js/collab-share.js').then((m) => m.shareProjectDialog()); });
    await page.waitDialog('Share Project');
    assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[data-field="edit-link"]').value), renewed);
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
    // in Portuguese: the roles, the commands
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    try {
      await page.waitFor(() => document.querySelectorAll('.collab-presence .collab-badge').length === 2, [], { what: 'the old link\'s page gone' });
      assert.deepEqual((await menu(page)).slice(0, 4), [['Ana', 'você'], ['Rui', 'espectador'], '-', ['Tornar Rui Editor', '']]);
      await page.eval(() => document.body.click());
    } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
    assert.deepEqual(await warnings(rp), []);
  } finally { await rp.close(); }
  await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
  // (the project untrusted by the editor's first change, #3355: the owner's one warning)
  assert.deepEqual(await warnings(page), ['WARNING: Project "Roles" was changed by an editor of its shared link: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it. Trust Project']);
}, { timeout: 120000 });
