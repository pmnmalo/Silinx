// UI: the toolbar's Sharing menu's Viewer | Editor on each follower's row (#4849: the Collaboration tab's, #4646, the
// same function, web/js/collab-roles.js), in both interfaces: the owner's row "you", a follower's the switch, its role
// pressed; a click on Editor in the menu: the menu kept open in every frame (no flicker), the follower told, Editor
// pressed in the same menu and in the Collaboration tab; Viewer chosen in the tab: the open menu shows it at once; the
// follower's own menu, roles read only; in Portuguese. The exact console lines; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const openMenu = async (page) => {
  await page.click('.collab-presence .collab-btn');
  await page.waitForSelector('body > .menu-popup');
};
// the open menu's participant rows: [name, its column: a text, or the switch's states [label, pressed, tip, disabled]]
const people = (page) => page.eval(() => [...document.querySelector('body > .menu-popup').children].slice(0, [...document.querySelector('body > .menu-popup').children].findIndex((m) => m.classList.contains('sep')))
  .map((m) => [m.querySelector('.lbl').textContent, m.querySelector('.collab-roles')
    ? [...m.querySelectorAll('.collab-role-state')].map((b) => [b.textContent, b.getAttribute('aria-pressed'), b.title, b.disabled])
    : m.querySelector('.sc').textContent]));
// the Collaboration tab's switch: the state pressed (the page drawn while hidden)
const tabPressed = (page) => page.eval(() => document.querySelector('#collab-page .collab-roles .collab-role-state[aria-pressed="true"]')?.dataset.role ?? null);
const menuPressed = (page) => page.eval(() => document.querySelector('body > .menu-popup .collab-roles .collab-role-state[aria-pressed="true"]')?.dataset.role ?? null);
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

uiTest('#4849 the toolbar\'s Sharing menu: each follower\'s Viewer | Editor, the menu kept open; in sync with the Collaboration tab both ways; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'MenuRoles', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('MenuRoles');
  const link = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.sharedLink(); });
  const rp = await join(link, 'Rui');
  try {
    await page.waitConsole(/^Rui follows your project "MenuRoles"\.$/m);
    await page.waitFor(() => document.querySelector('.collab-presence .collab-btn')?.textContent === 'Sharing (1)', [], { what: 'Sharing (1)' });
    // the owner's menu: Ana "you", Rui's switch, Viewer pressed
    await openMenu(page);
    assert.deepEqual(await people(page), [['Ana', 'you'], ['Rui', [['Viewer', 'true', '', false], ['Editor', 'false', 'Make Rui an Editor', false]]]]);
    const consoleAt = (await page.consoleText()).split('\n').length;
    // Editor clicked in the menu: the menu kept open in every frame, the same one, its switch Editor pressed
    await page.eval(() => {
      const m = document.querySelector('body > .menu-popup');
      window.__menuFrames = [];
      const tick = () => { window.__menuFrames.push(document.querySelector('body > .menu-popup') === m && m.isConnected); if (window.__menuFrames.length < 120) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await page.click('body > .menu-popup .collab-role-state[data-role="editor"]');
    await page.waitConsole(/^Rui is an editor now: they edit the project's text files and drawings with you\.$/m);
    await rp.waitConsole(/^Ana made you an editor: you edit the project's text files and drawings with them\.$/m);
    await page.waitFor(() => document.querySelector('body > .menu-popup .collab-role-state[data-role="editor"]')?.getAttribute('aria-pressed') === 'true', [], { what: 'Editor pressed in the open menu' });
    await page.waitFor(() => window.__menuFrames.length >= 120, [], { what: 'the frames recorded' });
    assert.deepEqual([...new Set(await page.eval(() => window.__menuFrames))], [true], 'the menu open in every frame');
    assert.deepEqual(await people(page), [['Ana', 'you'], ['Rui', [['Viewer', 'false', 'Make Rui a Viewer', false], ['Editor', 'true', '', false]]]]);
    // the Collaboration tab at once: Editor pressed
    await page.waitFor(() => document.querySelector('#collab-page .collab-roles .collab-role-state[aria-pressed="true"]')?.dataset.role === 'editor', [], { what: 'the tab: Editor' });
    // Viewer chosen in the tab (the menu still open): the menu shows it at once
    await page.eval(() => document.querySelector('#collab-page .collab-role-state[data-role="viewer"]').click());
    await page.waitConsole(/^Rui is a viewer now: the editors' link was renewed \(the old one only follows\); your other editors keep editing\.$/m);
    await page.waitFor(() => document.querySelector('body > .menu-popup .collab-role-state[data-role="viewer"]')?.getAttribute('aria-pressed') === 'true', [], { what: 'Viewer pressed in the open menu' });
    assert.deepEqual([await menuPressed(page), await tabPressed(page)], ['viewer', 'viewer']);
    // (a click on the pressed state: nothing, the menu open)
    await page.click('body > .menu-popup .collab-role-state[data-role="viewer"]');
    assert.equal(await page.eval(() => !!document.querySelector('body > .menu-popup')), true);
    await page.eval(() => document.body.click());
    await page.mouse?.click?.(5, 5);
    // the console: one line per change, at each side
    assert.deepEqual((await page.consoleText()).split('\n').slice(consoleAt).map((l) => l.trim()).filter(Boolean), [
      'Rui is an editor now: they edit the project\'s text files and drawings with you.',
      'Rui is a viewer now: the editors\' link was renewed (the old one only follows); your other editors keep editing.',
    ]);
    // the follower's own menu: the roles read only, no switch
    await openMenu(rp);
    assert.deepEqual(await people(rp), [['Ana', 'owner'], ['Rui', 'you']]);
    await rp.eval(() => document.body.click());
    // in Portuguese: Espectador | Editor, its tip
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    try {
      await openMenu(page);
      await page.waitFor(() => document.querySelector('body > .menu-popup .collab-role-state[data-role="viewer"]')?.textContent === 'Espectador', [], { what: 'the switch in Portuguese' });
      assert.deepEqual(await people(page), [['Ana', 'você'], ['Rui', [['Espectador', 'true', '', false], ['Editor', 'false', 'Tornar Rui Editor', false]]]]);
      assert.equal(await page.eval(() => document.querySelector('body > .menu-popup .collab-roles').getAttribute('aria-label')), 'Papel');
    } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
    assert.deepEqual(await warnings(rp), []);
  } finally { await rp.close(); }
  await page.eval(async () => (await import('/js/collab-share.js')).stopSharing());
  assert.deepEqual(await warnings(page), []);
}, { timeout: 120000 });
