// UI: a copy given out and taken in (#4205): Export Project (.zip) as Silinx gives a copy, its silinx.json naming its
// origin (the project's id and revision) and the zip carrying its ancestor (silinx.base.json), the project keeping it
// hidden; Import Project… of the copy makes a project with an id of its own and the copy's origin, the ancestor no
// project file; the copy given out again carries its first origin and ancestor. No warning. (The browser edition's:
// test/ui/standalone.test.js.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { setupUi, uiTest, makeProject, waitDownload } from './harness.js';
import { FILE, exportZip, openImport } from './zip-helpers.js';
import { readZip } from '../../core/zip.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const codec = { deflate: (d) => zlib.deflateRawSync(d), inflate: (d) => zlib.inflateRawSync(d) };
const unzip = async (f) => Object.fromEntries((await readZip(new Uint8Array(await fs.readFile(f)), codec)).map((e) => [e.path, Buffer.from(e.data).toString('utf8')]));

uiTest('#4205 Export Project (.zip) as Silinx gives a copy (its origin, its ancestor); Import Project… of it keeps them apart; given out again, the first origin', E, async (page) => {
  await makeProject(env, { name: 'Base', template: 'traffic', board: 'basys2' });
  await page.openProject('Base');
  await exportZip(page, 'silinx');
  const zip = path.join(env.tmp, 'base-copy.zip');
  await fs.copyFile(await waitDownload(page, 'Base-silinx.zip'), zip);
  const z = await unzip(zip);
  const pj = JSON.parse(z['silinx.json']), anc = JSON.parse(z['silinx.base.json']);
  const base = JSON.parse(await fs.readFile(path.join(env.server.workspace, 'Base', 'silinx.json'), 'utf8'));
  assert.match(base.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual([pj.origin.id, anc.id, anc.rev], [base.id, base.id, pj.origin.rev]);
  assert.ok(!(await page.eval(() => window.Silinx.diskTree)).some((f) => /silinx\.base\.json|\.silinx/.test(f)));
  await fs.access(path.join(env.server.workspace, 'Base', '.silinx', 'snapshots', `${pj.origin.rev}.json`));
  // the copy imported: an id of its own, the origin kept, the ancestor not a file of it
  await openImport(page, 'silinx');
  await page.setFiles(FILE, [zip]);
  await page.fill('.dlg-overlay input[type=text]', 'Ana');
  await page.dialogButton('Import');
  await page.waitFor(() => window.Silinx.project?.name === 'Ana' && document.querySelector('#hier .row'), [], { what: 'the copy open' });
  await page.waitConsole(/Imported Silinx project 'Ana'/);
  const ana = await page.eval(() => ({ id: window.Silinx.project.id, origin: window.Silinx.project.origin, tree: window.Silinx.diskTree }));
  assert.ok(ana.id && ana.id !== base.id);
  assert.deepEqual(ana.origin, pj.origin);
  assert.ok(!ana.tree.includes('silinx.base.json'), ana.tree.join());
  // Ana's work given out: the first origin, the first ancestor
  await exportZip(page, 'silinx');
  const back = await unzip(await waitDownload(page, 'Ana-silinx.zip'));
  assert.deepEqual(JSON.parse(back['silinx.json']).origin, pj.origin);
  assert.equal(back['silinx.base.json'], z['silinx.base.json']);
  const warnings = (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)/.test(l));
  assert.deepEqual(warnings, []);
});
