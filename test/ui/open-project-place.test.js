// UI: File ▸ Open Project…'s Stored In column (#4314, core/project-place.js): each project's place, the workspace folder
// (the server's), and its GitHub repository when it is in one (its origin's, here a clone's remote set on the disk); its
// tip in words; in both interfaces (SILINX_UI_INTERFACE); in Portuguese; no warnings. (The browser edition's, its
// storage and a clone from GitHub: test/ui/collab-tab-browser.test.js.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}
// the dialog's list: its header, and each of these projects' Stored In (the fourth column) lines and tip
const placeRows = (page, names) => page.eval((ns) => {
  const rows = [...document.querySelectorAll('.dlg-overlay table.grid tr')];
  return { header: [...rows[0].children].map((c) => c.textContent),
    rows: rows.slice(1).filter((r) => ns.includes(r.children[0].textContent)).map((r) => { const c = r.children[3]; return [r.children[0].textContent, [...c.children].map((d) => d.textContent), c.title]; }) };
}, names);
const git = (cwd, ...a) => { const r = spawnSync('git', a, { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };

uiTest('#4314 Open Project: each project\'s Stored In, the workspace folder and its GitHub repository, its tip; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'PlaceLocal', template: 'gates' });
  await makeProject(env, { name: 'PlaceRepo', template: 'gates' });
  // (a project in a GitHub repository: its own repository, origin github.com's)
  const dir = path.join(env.server.workspace, 'PlaceRepo');
  git(dir, 'init', '-q');
  git(dir, 'remote', 'add', 'origin', 'https://github.com/course/place-repo.git');
  await page.openProject('PlaceLocal');   // (the start-up's lines cleared with a project opened)
  await page.menu('File', 'Open Project…');
  await page.waitDialog('Open Project');
  assert.deepEqual(await placeRows(page, ['PlaceLocal', 'PlaceRepo']), {
    header: ['Project', 'Device', 'Board', 'Stored In', 'Last Used'],   // (no Top column)
    rows: [['PlaceLocal', ['Workspace Folder'], 'Kept in the workspace folder.'],   // (the newest first: just opened)
      ['PlaceRepo', ['Workspace Folder', '↔ GitHub: course/place-repo'], 'Kept in the workspace folder, in the GitHub repository course/place-repo.']],
  });
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.menu('Ficheiro', 'Abrir Projeto…');
    await page.waitDialog('Abrir Projeto');
    assert.deepEqual(await placeRows(page, ['PlaceLocal', 'PlaceRepo']), {
      header: ['Projeto', 'Dispositivo', 'Placa', 'Guardado em', 'Último uso'],
      rows: [['PlaceLocal', ['Pasta de Trabalho'], 'Guardado na pasta de trabalho.'],
        ['PlaceRepo', ['Pasta de Trabalho', '↔ GitHub: course/place-repo'], 'Guardado na pasta de trabalho, no repositório GitHub course/place-repo.']],
    });
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  await noWarnings(page);
});
