// UI: Import Project (.zip)…, a Silinx project from its folder (#3965): the Silinx choice's rows the Xilinx ISE one's
// (the project folder, or a .zip file, then the project's name), a folder's software preselected (as a zip's), the
// folder imported as the .zip of the same project (its build folder and hidden files left out, no warning); a folder of
// no project said; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';
import { FOLDER, openImport } from './zip-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the window's fields, their labels, the folder's and the file's shown
const rows = (page) => page.eval(() => {
  const grid = document.querySelectorAll('.dlg-overlay .form-grid')[1];
  return [...grid.querySelectorAll(':scope > label')].filter((l) => !l.hidden).map((l) => l.textContent)
    .concat([...grid.querySelectorAll('input')].filter((i) => !i.hidden).map((i) => i.dataset.field || i.type));
});
const checked = (page, id) => page.waitFor((i) => document.querySelector(`.dlg-overlay input[data-field=software-${i}]`).checked, [id], { what: `${id} checked` });
const info = (page, text) => page.waitFor((t) => [...document.querySelectorAll('.dlg-overlay .dlg-body .hint')].at(-1).textContent === t, [text], { what: `'${text}'` });
const hint = (page) => page.eval(() => document.querySelector('.dlg-overlay .form-grid + .hint').textContent);

uiTest('#3965 Import Project (.zip)…: a Silinx project from its folder, in the Xilinx ISE window\'s rows; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'FolderSrc', template: 'gates', board: 'basys2' });
  const src = await env.server.api('GET', '/api/projects/FolderSrc');
  // the project's folder on the disk, with Silinx's outputs and hidden files besides
  const dir = path.join(env.tmp, 'gates-folder');
  await fs.cp(path.join(env.server.workspace, 'FolderSrc'), dir, { recursive: true });
  await fs.mkdir(path.join(dir, 'build'), { recursive: true });
  await fs.writeFile(path.join(dir, 'build', 'top.bit'), 'bits');
  await fs.writeFile(path.join(dir, '.DS_Store'), 'x');
  // (the files the browser's picker gives: its files, silinx.json, build/top.bit and .DS_Store; WebKit's leaves the
  // hidden ones out itself)
  const taken = src.fileTree.length + 1;
  let count;
  const none = path.join(env.tmp, 'no-project');
  await fs.mkdir(none, { recursive: true });
  await fs.writeFile(path.join(none, 'notes.txt'), 'notes\n');

  // the same rows for both
  await openImport(page, 'xilinx');
  assert.deepEqual(await rows(page), ['Project folder:', 'or .zip / .xise file(s):', 'Project name:', 'folder', 'file', 'text']);
  await page.click('.dlg-overlay input[data-field=software-silinx]');
  assert.deepEqual(await rows(page), ['Project folder:', 'or .zip file:', 'Project name:', 'folder', 'file', 'text']);
  assert.equal(await hint(page), 'Import a whole Silinx project from its folder (the folder with the silinx.json file), or from a .zip of that folder (e.g. one exported with File ▸ Export Project (.zip)…). Its build folder (build) and hidden files are not imported.');
  // the Silinx project's folder: Silinx preselected, the name its folder's; a folder of no project, said
  await page.click('.dlg-overlay input[data-field=software-xilinx]');
  await page.setFiles(FOLDER, [dir]);
  // (Chrome reads the folder after the change event: its files in a moment)
  await page.waitFor((s) => document.querySelector(s).files.length > 0, [FOLDER], { what: 'the folder\'s files' });
  count = await page.eval((s) => document.querySelector(s).files.length, FOLDER);
  assert.ok(count === taken + 2 || count === taken + 1, `${count} file(s) picked`);
  await checked(page, 'silinx');
  await info(page, `Folder 'gates-folder': ${count} file(s), project silinx.json`);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[type=text]').value), 'gates-folder', 'name suggested from the folder');
  await page.setFiles(FOLDER, [none]);
  await info(page, 'The folder holds no silinx.json nor .xise: it is not a project Silinx reads.');
  await checked(page, 'silinx');
  await page.setFiles(FOLDER, [dir]);
  await info(page, `Folder 'gates-folder': ${count} file(s), project silinx.json`);
  // (Xilinx ISE chosen by hand: no .xise in it, said)
  await page.click('.dlg-overlay input[data-field=software-xilinx]');
  await info(page, `Folder 'gates-folder': ${count} file(s) — no .xise found!`);
  await page.click('.dlg-overlay input[data-field=software-silinx]');
  await page.fill('.dlg-overlay input[type=text]', 'FromFolder');
  await page.dialogButton('Import');
  await page.waitFor(() => window.Silinx.project?.name === 'FromFolder' && document.querySelector('#hier .row'), [], { what: 'the imported project open' });
  await page.waitConsole(/Imported Silinx project 'FromFolder' \(\d+ source file\(s\)(, \d+ other file\(s\))?\)\./);
  const text = await page.consoleText();
  assert.ok(text.includes(`Importing folder 'gates-folder': ${taken} file(s), ${count - taken} build/hidden file(s) skipped.`), text);
  assert.deepEqual(text.split('\n').filter((l) => /^(WARNING|ERROR)/.test(l)), [], 'no warnings');
  const got = await env.server.api('GET', '/api/projects/FromFolder');
  assert.deepEqual([got.fileTree, got.top, got.board], [src.fileTree, src.top, src.board]);

  // in Portuguese
  await openImport(page, 'silinx');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitDialog('Importar Projeto');
    assert.deepEqual(await rows(page), ['Pasta do projeto:', 'ou ficheiro .zip:', 'Nome do projeto:', 'folder', 'file', 'text']);
    assert.equal(await hint(page), 'Importe um projeto Silinx completo a partir da sua pasta (a pasta com o ficheiro silinx.json), ou de um .zip dessa pasta (p. ex. um exportado com Ficheiro ▸ Exportar Projeto (.zip)…). A sua pasta de compilação (build) e os ficheiros ocultos não são importados.');
    await page.setFiles(FOLDER, [none]);
    await info(page, 'A pasta não tem silinx.json nem .xise: não é um projeto que o Silinx leia.');
    await page.setFiles(FOLDER, [dir]);
    await info(page, `Pasta 'gates-folder': ${count} ficheiro(s), projeto silinx.json`);
    await page.click('.dlg-overlay input[data-field=software-xilinx]');
    await info(page, `Pasta 'gates-folder': ${count} ficheiro(s) — sem .xise!`);
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
