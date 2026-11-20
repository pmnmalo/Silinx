// UI: the Sharing menu's Renew Editor Link (#4745, web/js/collab-share.js), in both interfaces: the editors' link
// renewed (Show Sharing Link… shows the new one), said in the console; an editor in the project keeps editing, their
// change at the owner's; the old link, opened by a new page, follows read only, told so; the command in Portuguese.
// The exact console lines; no warnings but the project untrusted by the editor's change (#3355).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const menuLabels = async (page) => {
  await page.click('.collab-presence .collab-btn');
  await page.waitForSelector('body > .menu-popup');
  return page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi .lbl')].map((l) => l.textContent));
};
const clickItem = (page, label) => page.eval((l) => [...document.querySelectorAll('body > .menu-popup .mi')].find((m) => m.querySelector('.lbl')?.textContent === l).click(), label);
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
const problems = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));

uiTest('#4745 Renew Editor Link: the editors\' link renewed, said; an editor in the project keeps editing; the old link follows read only; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'Renew', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('Renew');
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  const old = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  const rp = await join(old, 'Rui');
  const later = [];
  try {
    await page.waitConsole(/^Rui edits your project "Renew" with you\.$/m);
    await rp.waitFor(() => window.Silinx.active?.path === 'src/top.vhd' && window.Silinx.active.editor && !window.Silinx.active.editor.readOnly(), [], { what: 'Rui\'s editor editable', timeout: 10000 });
    assert.ok((await menuLabels(page)).includes('Renew Editor Link'));
    await clickItem(page, 'Renew Editor Link');
    await page.waitConsole(/^The editors' link was renewed: the old one no longer lets anyone edit; your editors in the project now keep editing\. Show Sharing Link… shows the new one\.$/m);
    const renewed = await page.eval(async () => (await import('/js/collab-share.js')).editorsLink());
    assert.notEqual(renewed, old);
    assert.equal(new URL(renewed).hash.split('.')[0], new URL(old).hash.split('.')[0], 'the same room');
    // Rui, in the project: still edits, his change on the owner's disk
    await rp.eval(() => { const ed = window.Silinx.active.editor; ed.setCursor({ line: 0, ch: 0 }); ed.replaceSelection('-- Rui\n'); });
    for (let i = 0; i < 150 && !(await readWs(env, 'Renew', 'src/top.vhd')).startsWith('-- Rui'); i++) await new Promise((r) => setTimeout(r, 100));
    assert.ok((await readWs(env, 'Renew', 'src/top.vhd')).startsWith('-- Rui\n'), 'on the disk');
    // the old link, opened by a new page: told it follows read only
    const op = await join(old, 'Old');
    later.push(op);
    await op.waitConsole(/this editor link is not this shared project's, or its owner renewed it: you follow it read only/);
    await op.waitFor(() => window.Silinx.active?.editor?.readOnly?.() !== false, [], { what: 'read only' });
    // in Portuguese
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    assert.ok((await menuLabels(page)).includes('Renovar a Ligação de Editor'));
    await page.key('Escape');
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    assert.deepEqual(await problems(page), ['WARNING: Project "Renew" was changed by an editor of its shared link: it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it. Trust Project']);
  } finally {
    for (const p of [rp, ...later]) await p.close();
  }
}, { timeout: 180000 });
