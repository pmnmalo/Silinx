// UI: a shared project's versions (#5742, phase 4 of #5743), the owner and an editor in one test, in both interfaces: the
// editor's Versions… lists the owner's versions, a version's files are what it changed (opened and compared at the
// owner's); the editor's Restore of one file is done by the owner (on its disk, in both editors), the project before it
// kept as a version, the editor's name its author; the editor's Save Version… kept by the owner; each answer's line in
// both consoles; the dialog in Portuguese too. The exact console lines; no warnings but the project untrusted by the editor's edit.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity top is\n  port (a : in std_logic; y : out std_logic);\nend top;\n\narchitecture rtl of top is\nbegin\n  y <= not a;\nend rtl;\n';
const P = 'src/top.vhd';
const warnings = async (page) => (await page.consoleText()).split('\n').map((l) => l.trim()).filter((l) => /^(WARNING|AVISO|ERROR|ERRO)/.test(l));
const until = async (fn, what, ms = 10000) => { for (let t = Date.now(); Date.now() - t < ms;) { if (await fn()) return; await new Promise((r) => setTimeout(r, 100)); } assert.fail(`timed out: ${what}`); };
const rows = (page) => page.waitFor(() => { const r = [...document.querySelectorAll('.dlg-overlay table.versions tbody tr')]; return r.length ? r.map((t) => [...t.cells].filter((_, i) => i !== 1).map((c) => c.textContent).join(' | ')) : null; }, [], { what: 'the versions' });
const fileRows = (page) => page.waitFor(() => { const r = [...document.querySelectorAll('.dlg-overlay .version-file-list li')]; return r.length ? r.map((l) => l.textContent.replace(/\s+/g, ' ').trim()) : null; }, [], { what: 'the version\'s files' });
const name = (page, n) => page.eval((v) => { for (const k of Object.keys(localStorage).filter((x) => x.endsWith('silinx.collab.name'))) localStorage.setItem(k, v); }, n);

uiTest('#5742 an editor\'s Versions…: the owner\'s versions; Restore of a file and Save Version… done by the owner, said to both; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'Shared', top: 'top', files: { [P]: TOP } });
  await page.openProject('Shared');
  await page.menu('Project', 'Save Version…');
  await page.waitDialog('Save Version');
  await page.fill('.dlg-overlay input[type=text]', 'as given');
  await page.dialogButton('OK');
  await page.waitConsole(/^Version 1 of Shared saved: as given\.$/m);
  const edit = await page.eval(async () => { const m = await import('/js/collab-share.js'); await m.startSharing('Ana'); return m.editorsLink(); });
  const ep = await env.newPage(env.server.url);
  try {
    await ep.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await ep.goto(`${new URL(edit).origin}/?f=1${new URL(edit).hash}`);
    await ep.waitDialog('Follow a Shared Project');
    await ep.fill('.dlg-overlay input[data-field=name]', 'Rui');
    await ep.dialogButton('Follow');
    await ep.waitFor(() => window.Silinx?.project?.name === 'Shared' && window.Silinx.startupChecked, [], { what: 'the project open', timeout: 30000 });
    await page.waitConsole(/^Rui edits your project "Shared" with you\.$/m);
    await name(ep, 'Rui');
    // Rui's edit, on the owner's disk
    await ep.eval((p) => window.SilinxApp.openFile(p), P);
    await ep.waitFor((p) => window.Silinx.active?.path === p, [P], { what: 'the file open' });
    await new Promise((r) => setTimeout(r, 700));
    await ep.eval(() => { const ed = window.Silinx.active.editor; ed.setCursor({ line: 0, ch: 0 }); ed.replaceSelection('-- by Rui\n'); });
    await until(async () => await readWs(env, 'Shared', P) === `-- by Rui\n${TOP}`, 'Rui\'s edit on the disk');
    // the editor's Versions…: the owner's; a version's files are what it changed
    await ep.menu('Project', 'Versions…');
    await ep.waitDialog('Versions of Shared');
    assert.deepEqual(await rows(ep), ['1 |  | saved by hand | as given | +1']);
    assert.deepEqual(await fileRows(ep), ['src/top.vhd (added in it) Restore']);
    assert.equal(await ep.eval(() => document.querySelector('.dlg-overlay .version-files p').textContent), 'Version 1 changed (its files are opened and compared in Ana\'s Silinx):');
    // Restore src/top.vhd: done by the owner, in both editors, said to both
    await ep.eval(() => [...document.querySelectorAll('.dlg-overlay .version-file-list a.version-restore')][0].click());
    const line = 'Rui restored src/top.vhd as version 1 had it: 1 file(s) written, 0 removed; the project before it kept as version 2.';
    await page.waitConsole(new RegExp(`^${line.replace(/[.()]/g, '\\$&')}$`, 'm'));
    await ep.waitConsole(new RegExp(`^${line.replace(/[.()]/g, '\\$&')}$`, 'm'));
    await until(async () => await readWs(env, 'Shared', P) === TOP, 'the restore on the disk');
    await ep.waitFor((t) => window.Silinx.active.editor.getValue() === t, [TOP], { what: 'the restore at Rui\'s' });
    // Rui's Save Version…: kept by the owner, Rui its author
    await ep.menu('Project', 'Save Version…');
    await ep.waitDialog('Save Version');
    await ep.fill('.dlg-overlay input[type=text]', 'Rui\'s');
    await ep.dialogButton('OK');
    await page.waitConsole(/^Rui saved version 4: Rui's\.$/m);
    await ep.waitConsole(/^Rui saved version 4: Rui's\.$/m);
    await ep.menu('Project', 'Versions…');
    await ep.waitDialog('Versions of Shared');
    await ep.waitFor(() => document.querySelectorAll('.dlg-overlay table.versions tbody tr').length === 4, [], { what: 'the owner\'s versions published again' });
    assert.deepEqual(await rows(ep), ['4 | Rui | saved by hand | Rui\'s | ', '3 | Rui | restored version 1 |  | ~1', '2 | Rui | before a restore |  | ~1', '1 |  | saved by hand | as given | +1']);
    await ep.dialogButton('Close');
    // in Portuguese, at Rui's: the dialog (the answers' lines are the collaboration's, in English, as its other lines)
    await ep.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    await ep.menu('Projeto', 'Versões…');
    await ep.waitDialog('Versões de Shared');
    await ep.eval(() => document.querySelector('.dlg-overlay tr[data-version="1"]').click());
    assert.deepEqual(await fileRows(ep), ['src/top.vhd (acrescentado nela) Restaurar']);
    assert.equal(await ep.eval(() => document.querySelector('.dlg-overlay .version-files p').textContent), 'A versão 1 alterou (os seus ficheiros abrem-se e comparam-se no Silinx de Ana):');
    await ep.dialogButton('Fechar');
    await ep.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    // no warnings but the project untrusted by Rui's edit, at the owner's; none at Rui's
    const w = await warnings(page);
    assert.equal(w.length, 1, w.join('\n'));
    assert.match(w[0], /^WARNING: Project "Shared" was changed by an editor of its shared link/);
    assert.deepEqual(await warnings(ep), []);
  } finally { await ep.close(); await page.eval(async () => (await import('/js/collab-share.js')).stopSharing()); }
});
