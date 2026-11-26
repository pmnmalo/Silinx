// UI: a project's versions (#5740, phase 2 of #5743), the local server's edition, in both interfaces: Project ▸ Save
// Version… keeps one with a name (said in the console); Project ▸ Versions… lists them newest first (the number, the
// author, what made it, its name, what it changed), the first one selected; Restore Project puts the one selected back
// (the open editor reads it again), the project as it was kept first, and says how to undo it; Remove from Project keeps
// a version before it; nothing new to keep, said; in Portuguese, the menu, the dialog and the console's line. The exact
// console lines; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const A = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity a is\n  port (x : in std_logic; y : out std_logic);\nend a;\n\narchitecture rtl of a is\nbegin\n  y <= x;\nend rtl;\n';
const B = A.replace(/\ba\b/g, 'b').replace('y <= x;', 'y <= not x;');
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR|AVISO|ERRO)\b/.test(l));
// the Versions… dialog's rows: [number, author, made, name, files], the selected one marked *
const rows = (page) => page.waitFor(() => { const r = [...document.querySelectorAll('.dlg-overlay table.versions tbody tr')]; return r.length ? r.map((t) => [...t.cells].filter((_, i) => i !== 1).map((c) => c.textContent).join(' | ') + (t.getAttribute('aria-selected') === 'true' ? ' *' : '')) : null; }, [], { what: 'the versions' });
const heads = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay table.versions th')].map((t) => t.textContent));
const author = (page, n) => page.eval((v) => localStorage.setItem(Object.keys(localStorage).find((k) => k.endsWith('silinx.collab.name')) || 'silinx.collab.name', v), n);

uiTest('#5740 Save Version…, Versions…, Restore Project; a version before Remove from Project; Portuguese', E, async (page) => {
  const name = 'Versions';
  await makeProject(env, { name, top: 'a', files: { 'src/a.vhd': A, 'src/b.vhd': B } });
  await page.openProject(name);
  await author(page, 'Ana');
  // Save Version…: its name
  await page.menu('Project', 'Save Version…');
  await page.waitDialog('Save Version');
  await page.fill('.dlg-overlay input[type=text]', 'before the lab');
  await page.dialogButton('OK');
  await page.waitConsole(/^Version 1 of Versions saved: before the lab\.$/m);
  // nothing changed: no new version, said
  await page.menu('Project', 'Save Version…');
  await page.waitDialog('Save Version');
  await page.dialogButton('OK');
  await page.waitConsole(/^Version 1 of Versions has it already: no version saved\.$/m);
  // the file broken in its editor (saved), then the version restored: the editor reads it again
  await page.eval(() => window.SilinxApp.openFile('src/a.vhd'));
  await page.waitFor(() => window.Silinx.active?.path === 'src/a.vhd', [], { what: 'a.vhd open' });
  await page.eval(() => window.Silinx.active.editor.setValue('-- broken\n'));
  await page.eval(() => window.SilinxApp.saveAll());
  for (let t = Date.now(); Date.now() - t < 5000 && await readWs(env, name, 'src/a.vhd') !== '-- broken\n';) await new Promise((r) => setTimeout(r, 100));
  await page.menu('Project', 'Versions…');
  await page.waitDialog('Versions of Versions');
  assert.deepEqual(await heads(page), ['Version', 'Time', 'Author', 'Made', 'Name', 'Files']);
  assert.deepEqual(await rows(page), ['1 | Ana | saved by hand | before the lab | +2 *']);
  await page.dialogButton('Restore Project');
  await page.waitConsole(/^Restored Versions as version 1 had it: 1 file\(s\) written, 0 removed; the project before it kept as version 2 \(restore it to undo\)\.$/m);
  assert.equal(await readWs(env, name, 'src/a.vhd'), A);
  await page.waitFor((t) => window.Silinx.active?.editor.getValue() === t, [A], { what: 'the editor read again' });
  // a.vhd changed again, then Remove from Project (the Design pane's menu): a version kept before it
  await page.eval(() => window.Silinx.active.editor.setValue('-- second\n'));
  await page.eval(() => window.SilinxApp.saveAll());
  for (let t = Date.now(); Date.now() - t < 5000 && await readWs(env, name, 'src/a.vhd') !== '-- second\n';) await new Promise((r) => setTimeout(r, 100));
  await page.leftTab('design');
  const i = await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].findIndex((x) => x.textContent === 'b') + 1, [], { what: 'row b' });
  await page.click('#hier .row .lbl', { index: i - 1, button: 'right' });
  await page.click('body > .menu-popup .mi', { text: 'Remove from Project' });
  await page.waitDialog('Remove Source');
  await page.dialogButton('Remove from Project');
  await page.waitConsole(/^Removed src\/b\.vhd from the project/m);
  await page.menu('Project', 'Versions…');
  await page.waitDialog('Versions of Versions');
  assert.deepEqual(await rows(page), [
    '4 | Ana | before Remove from Project |  | ~1 *',
    '3 | Ana | restored version 1 |  | ~1',
    '2 | Ana | before a restore |  | ~1',
    '1 | Ana | saved by hand | before the lab | +2',
  ]);
  // a row selected by a click; Close restores nothing
  await page.click('.dlg-overlay table.versions tbody tr', { index: 3 });
  assert.deepEqual((await rows(page)).map((r) => r.endsWith('*')), [false, false, false, true]);
  await page.dialogButton('Close');
  await page.waitNoDialog();
  assert.equal(await readWs(env, name, 'src/a.vhd'), '-- second\n');
  // in Portuguese: the menu, the dialog, the line
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.menu('Projeto', 'Versões…');
  await page.waitDialog('Versões de Versions');
  assert.deepEqual(await heads(page), ['Versão', 'Hora', 'Autor', 'Feita', 'Nome', 'Ficheiros']);
  assert.equal((await rows(page)).at(-1), '1 | Ana | guardada à mão | before the lab | +2');
  // (version 4: b in the project again; its file was kept in the folder, only silinx.json written)
  await page.dialogButton('Restaurar Projeto');
  await page.waitConsole(/^Restaurado Versions como a versão 4 o tinha: 0 ficheiro\(s\) escrito\(s\), 0 removido\(s\); o projeto antes disso guardado como versão 5 \(restaure-a para anular\)\.$/m);
  assert.ok((JSON.parse(await readWs(env, name, 'silinx.json')).files || []).some((f) => f.path === 'src/b.vhd'));
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(await warnings(page), []);
});
