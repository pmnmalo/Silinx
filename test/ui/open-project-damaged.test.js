// UI: File ▸ Open Project…'s row of a damaged project (#4755): its silinx.json no description (a merge's conflict marks),
// the project listed, not hidden, "Damaged: silinx.json cannot be read" across its Device and Board, why in its tip;
// opened, its window says why (Open Project's error, as any project that cannot be read); in both interfaces (SILINX_UI_INTERFACE); in Portuguese; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const rowOf = (page, name) => page.eval((n) => {
  const r = [...document.querySelectorAll('.dlg-overlay table.grid tr')].find((x) => x.children[0].textContent === n);
  return r && [...r.children].slice(1).map((c) => [c.textContent, c.getAttribute('colspan'), c.title || null]).slice(0, 2);
}, name);

uiTest('#4755 Open Project: a damaged project listed with why; opened, why said; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'Sound', template: 'gates' });
  await makeProject(env, { name: 'Damaged', template: 'gates' });
  await fs.writeFile(path.join(env.server.workspace, 'Damaged', 'silinx.json'), '<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> theirs\n');
  await page.openProject('Sound');
  await page.menu('File', 'Open Project…');
  await page.waitDialog('Open Project');
  const [cell, place] = await rowOf(page, 'Damaged');
  assert.deepEqual(cell.slice(0, 2), ['Damaged: silinx.json cannot be read', '2']);
  assert.match(cell[2], /^its silinx\.json cannot be read: .*JSON/);
  assert.equal(place[0], 'Workspace Folder', 'its Stored In next, as any project\'s');
  // opened: Open Project's error says why
  await page.eval(() => [...document.querySelectorAll('.dlg-overlay table.grid tr')].find((x) => x.children[0].textContent === 'Damaged').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  await page.waitFor(() => /is damaged/.test(document.querySelector('.dlg-overlay')?.textContent || ''));
  const said = await page.eval(() => document.querySelector('.dlg-overlay').textContent);
  assert.match(said, /the project 'Damaged' is damaged: its silinx\.json cannot be read: .* \(correct it in a text editor, or delete the project\)/);
  await page.dialogButton('OK');
  await page.waitNoDialog();
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.equal(await page.eval(() => document.getElementById('warn-count').textContent), '');
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.menu('Ficheiro', 'Abrir Projeto…');
    await page.waitDialog('Abrir Projeto');
    assert.deepEqual((await rowOf(page, 'Damaged'))[0].slice(0, 2), ['Danificado: o silinx.json não pode ser lido', '2']);
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});
