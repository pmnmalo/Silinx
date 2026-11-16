// core/project-folder.js (#3965): a Silinx project imported from its folder, as the .zip of the same project. The
// rule itself (hidden files and build/ left out, silinx.json at the folder's root); against the export's zip, the
// independent reference (server/project-zip.js exportProjectZip, the workspace's file tree): every example's folder
// takes the zip's files, and its import (through the import gate, server/project-zip.js importProjectEntries) makes the
// same project, with the same warnings (none); a folder with no silinx.json, an error.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { silinxFolderError, silinxFolderSkips } from '../core/project-folder.js';
import { EXAMPLE_ORDER } from '../core/examples.js';

let tmp;
before(async () => { tmp = fs.realpathSync(await scratchEnv('silinx-project-folder-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');
const { exportProjectZip, importProjectEntries } = await import('../server/project-zip.js');
const { gateEntries, gateZip } = await import('../core/import-gate.js');
const { NODE_CODEC } = await import('../server/impl-routes.js');
const { readZip } = await import('../core/zip.js');

// a folder's files, as the interface's folder picker gives them (relative to it), those the rule takes
function folderFiles(dir, sub = '') {
  return fs.readdirSync(path.join(dir, sub), { withFileTypes: true }).flatMap((d) => {
    const rel = sub ? `${sub}/${d.name}` : d.name;
    return d.isDirectory() ? folderFiles(dir, rel) : [rel];
  });
}
const taken = dir => folderFiles(dir).filter(r => !silinxFolderSkips(r)).sort();
const bad = (m) => { throw new Error(m); };
// a project's files and their contents, silinx.json's fields but its name and its trust
async function snapshot(name) {
  const { name: _n, trusted: _t, id: _i, ...pj } = await P.readProject(name);   // (each import a project of its own: its own id, #4205)
  const files = {};
  for (const f of await P.fileTree(name)) files[f] = fs.readFileSync(P.safeJoin(P.projectDir(name), f), 'utf8');
  return { pj, files };
}

test('#3965 silinxFolderSkips: hidden files and folders, and the build folder at the root; nothing else', () => {
  for (const r of ['.git/config', '.DS_Store', 'src/.hidden.vhd', 'src/.cache/x', 'build/top.bit', 'build/reports/top.twr', 'BUILD/x', 'build'])
    assert.equal(silinxFolderSkips(r), true, r);
  for (const r of ['silinx.json', 'src/top.vhd', 'src/build/top.vhd', 'builds/x.vhd', 'rebuild/x', 'constraints/top.ucf', 'src/a.b.vhd', 'sim/tb.vhd'])
    assert.equal(silinxFolderSkips(r), false, r);
});

test('#3965 silinxFolderError: silinx.json at the folder\'s root, any case; else the message', () => {
  assert.equal(silinxFolderError(['silinx.json', 'src/top.vhd'], 'gates'), null);
  assert.equal(silinxFolderError(new Set(['SILINX.JSON']), 'gates'), null);
  assert.equal(silinxFolderError(['src/top.vhd'], 'gates'), "no silinx.json project file in the folder 'gates'");
  // (one in a subfolder is not the project's: the folder picked is)
  assert.equal(silinxFolderError(['inner/silinx.json'], 'outer'), "no silinx.json project file in the folder 'outer'");
  assert.equal(silinxFolderError(['mysilinx.json', 'silinx.json.bak'], 'x'), "no silinx.json project file in the folder 'x'");
  assert.equal(silinxFolderError([], ''), "no silinx.json project file in the folder ''");
});

test('#3965 every example: its folder takes its export\'s zip files, and imports as the same project, no warnings', async () => {
  for (const ex of EXAMPLE_ORDER) {
    await P.createProject({ name: ex, template: ex });
    const dir = P.projectDir(ex);
    // what a folder on the disk holds besides: Silinx's outputs, a repository, a Mac's file
    fs.mkdirSync(path.join(dir, 'build', 'reports'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'build', 'top.bit'), 'bits');
    fs.writeFileSync(path.join(dir, 'build', 'reports', 'top.twr'), 'timing');
    fs.mkdirSync(path.join(dir, '.git'));
    fs.writeFileSync(path.join(dir, '.git', 'config'), '[core]\n');
    fs.writeFileSync(path.join(dir, '.DS_Store'), '\0');
    const { zip } = await exportProjectZip(P, ex, 'silinx');
    const zipped = (await readZip(zip, NODE_CODEC)).map(e => e.path).sort();
    assert.deepEqual(taken(dir), zipped, ex);
    // the zip's import and the folder's: the same project
    const fromZip = await importProjectEntries(P, `${ex}_z`, await gateZip(zip, NODE_CODEC), bad);
    const entries = taken(dir).map(r => ({ path: r, data: new Uint8Array(fs.readFileSync(path.join(dir, r))) }));
    const fromFolder = await importProjectEntries(P, `${ex}_f`, gateEntries(entries), bad);
    assert.deepEqual([fromFolder.warnings, fromFolder.missing], [[], []], ex);
    assert.deepEqual([fromFolder.warnings, fromFolder.missing, fromFolder.extra], [fromZip.warnings, fromZip.missing, fromZip.extra], ex);
    assert.deepEqual(await snapshot(`${ex}_f`), await snapshot(`${ex}_z`), ex);
    assert.deepEqual((await snapshot(`${ex}_f`)).files, (await snapshot(ex)).files, ex);
  }
});
