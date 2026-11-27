// UI: a shared project hosted by the owner's page (#3227, the browser edition's way: no relay), two participants in one
// test, in both interfaces: the owner shares the open project from their page (its link …#view=<room>.<key>.host.<owner's
// key>); the follower opens the link (their name) and is in, with no code (#5868: no codes exchanged by hand, no Add a
// User…): the owner found at the meeting point (the tests' own, between the pages of one browser context), the project
// read only (a large file in it), the owner's editor followed, an edit
// arriving, the presence on both sides; the owner's Sharing menu with no Add a User…; Stop Sharing tells the follower.
// A hosted link of before the owner's key (…host with nothing after it) is refused, with an error. The follower's page
// in Portuguese (the dialog's labels; the console is not translated). No warnings but those asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const BIG = `${'a line of the notes of a large project\n'.repeat(10500)}`;
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
// (the meeting point between this browser's pages, never the public one; no STUN server)
const noStun = (page) => page.eval(async () => { const { STUN_KEY } = await import('/js/collab-rtc.js'); localStorage.setItem(STUN_KEY, '[]'); const { MEETING_KEY } = await import('/js/collab-meet.js'); localStorage.setItem(MEETING_KEY, 'local'); });
const menu = async (page) => {
  await page.click('.collab-presence .collab-btn');
  await page.waitForSelector('body > .menu-popup');
  const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi')].map((e) => e.textContent));
  await page.key('Escape');
  return items;
};

uiTest('#3227 #5868 the owner\'s page hosts the shared project: the follower opens the link and is in, no code; read only; an edit arrives; no Add a User…; Stop Sharing; the follower in Portuguese', E, async (page) => {
  // (a file of 400 KB: the owner's first message to a follower, the whole project)
  await makeProject(env, { name: 'Hosted', top: 'top', files: { 'src/top.vhd': TOP, 'doc/notes.txt': BIG } });
  await page.openProject('Hosted');
  await noStun(page);
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana', { via: 'host' }); return m.sharedLink(); });
  assert.match(link, /^http:\/\/[^/]+\/#view=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\.host\.[A-Za-z0-9_-]{86}&owner=[A-Za-z0-9_-]{86}$/);
  await page.waitConsole(/^This page hosts the shared project: its followers find it at the meeting point when they open the link; it lasts while this page is open\.$/m);
  // the follower opens the link: their name, and they are in
  const fp = await env.newPage(env.server.url, { sibling: page });   // (one browser context: the tests' meeting point)
  try {
    await fp.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await noStun(fp);
    await fp.eval(() => localStorage.setItem('silinx.lang', 'pt'));
    await fp.goto(`${new URL(link).origin}/?f=1${new URL(link).hash}`);
    await fp.waitDialog('Seguir um Projeto Partilhado');
    await fp.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await fp.dialogButton('Seguir');
    await fp.waitConsole(/^Follow a shared project: the owner was found at the meeting point\.$/m, { timeout: 30000 });
    await fp.waitFor(() => window.Silinx?.project?.name === 'Hosted' && window.Silinx.startupChecked, [], { what: 'the hosted project open', timeout: 60000 });
    // (no code shown nor asked, at any point)
    assert.equal(await fp.eval(() => !!document.querySelector('.dlg-overlay textarea')), false);
    await fp.waitFor(() => window.Silinx.active?.path === 'src/top.vhd', [], { what: 'the owner\'s editor followed' });
    assert.equal(await fp.eval(() => window.Silinx.active.editor.getValue()), TOP);
    assert.equal(await fp.eval(async () => (await (await import('/js/api.js')).api.readFile('Hosted', 'doc/notes.txt')).length), BIG.length);
    assert.equal(await fp.eval(() => window.Silinx.active.editor.readOnly()), true);
    assert.equal(await fp.eval(() => window.Silinx.active.el.querySelector('[data-follow-notice]')?.textContent), 'Só de leitura, a seguir o projeto de Ana');
    await page.waitConsole(/^Rui follows your project "Hosted"\.$/m);
    await page.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Sharing (1)', [], { what: 'Sharing (1)' });
    // the owner's Sharing menu: no Add a User… (#5868); Show Sharing Link… with no code's part
    const items = await menu(page);
    assert.ok(items.includes('Show Sharing Link…') && items.includes('Stop Sharing'), items.join(' | '));
    assert.equal(items.includes('Add a User…'), false, items.join(' | '));
    // an edit of the owner arrives
    await page.eval(() => { const ed = window.Silinx.active.editor; ed.setCursor({ line: 0, ch: 0 }); ed.replaceSelection('-- by Ana\n'); });
    await fp.waitFor((t) => window.Silinx.active.editor.getValue() === t, [`-- by Ana\n${TOP}`], { what: 'the edit arrived' });
    // Stop Sharing: the follower told
    await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
    await page.waitConsole(/^Stopped sharing "Hosted": its followers no longer see it\.$/m);
    await fp.waitConsole(/^WARNING: Ana's project "Hosted" is no longer followed \(the owner stopped sharing\): what you see is as it was then\.$/m);
    assert.deepEqual(await warnings(fp), ['WARNING: Ana\'s project "Hosted" is no longer followed (the owner stopped sharing): what you see is as it was then.']);
    assert.deepEqual(await warnings(page), []);
    assert.deepEqual(fp.errors, []);
  } finally { await fp.close(); }
});

uiTest('#5868 a hosted link of before the owner\'s key (…host, nothing after it): refused, with an error; no code asked', E, async (page) => {
  await noStun(page);
  const hash = `#view=${'R'.repeat(22)}.${'K'.repeat(43)}.host`;
  await page.goto(`${env.server.url}/?f=2${hash}`);
  await page.waitDialog('Follow a Shared Project');
  await page.fill('.dlg-overlay input[data-field=name]', 'Rui');
  await page.dialogButton('Follow');
  await page.waitConsole(/^ERROR: Follow a shared project: this link has no owner's key \(it was made by an earlier Silinx\): ask its owner for the link again\.$/m);
  await page.waitNoDialog();
  assert.deepEqual(await warnings(page), ['ERROR: Follow a shared project: this link has no owner\'s key (it was made by an earlier Silinx): ask its owner for the link again.']);
});
