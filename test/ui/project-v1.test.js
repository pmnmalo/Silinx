// UI: a project saved before silinx.json's version 2 (#5907: its mode as the old kind) opens as it did: a Circuit
// project of `kind: 'design'` in Circuit mode (the page's design flag, its profile Digital Logic), a System one of
// `kind: 'system'` a System; its description read through the migration, in version 2 once saved, its kind never
// written again, a version of the project ('before a document's new format') holding it as it was; no warnings; in both
// interfaces (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR|AVISO|ERRO)\b/.test(l));

uiTest('#5907 a Circuit project of version 1 (kind design): opened in Circuit mode; saved in version 2, its kind gone, a version kept first', E, async (page) => {
  await makeProject(env, { name: 'OldCircuit', kind: 'design' });
  const file = path.join(env.server.workspace, 'OldCircuit', 'silinx.json');
  const v1 = { ...JSON.parse(fs.readFileSync(file, 'utf8')), version: 1, kind: 'design' };
  delete v1.profile;
  fs.writeFileSync(file, `${JSON.stringify(v1, null, 2)}\n`);
  await page.openProject('OldCircuit');
  assert.deepEqual(await page.eval(() => [document.documentElement.dataset.projectKind, window.Silinx.project.profile, 'kind' in window.Silinx.project, window.Silinx.project.version]), ['design', 'logic', false, 2]);
  // (written: in version 2, the project as it was kept first)
  // (a save that changes nothing keeps it as it was; one that changes it writes version 2)
  await page.eval(() => { window.Silinx.project.excluded = ['src/x.vhd']; return window.SilinxApp.saveProjectJson(); });
  for (let t = Date.now(); Date.now() - t < 10000 && JSON.parse(fs.readFileSync(file, 'utf8')).version !== 2; await new Promise((r) => setTimeout(r, 100)));
  const now = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual([now.version, now.profile, 'kind' in now], [2, 'logic', false]);
  const ix = JSON.parse(fs.readFileSync(path.join(env.server.workspace, 'OldCircuit', '.silinx', 'versions', 'index.json'), 'utf8'));
  const mig = ix.versions.filter((v) => v.reason === 'before-migrate');
  assert.equal(mig.length, 1);
  const kept = JSON.parse(fs.readFileSync(path.join(env.server.workspace, 'OldCircuit', '.silinx', 'versions', 'texts', mig[0].json), 'utf8'));
  assert.deepEqual([kept.version, kept.kind], [1, 'design'], 'as it was');
  // (opened again: Circuit still)
  await page.openProject('OldCircuit');
  assert.equal(await page.eval(() => document.documentElement.dataset.projectKind), 'design');
  assert.deepEqual(await warnings(page), []);
});
