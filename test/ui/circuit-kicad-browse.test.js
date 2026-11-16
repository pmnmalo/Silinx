// UI: Browse KiCad Libraries… (#4285): the local server's KiCad libraries (its index and a package kept in its
// configuration folder, as after an earlier fetch: no network), each one's version, licence and size; the search; a
// package picked, what its symbol libraries hold; imported into the project's parts/ (its lines in the console, its
// parts in the Parts panel); a second import asks before replacing; Portuguese. No browser warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newCircuit } from '../../core/circuit.js';
import { createZip } from '../../core/zip.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const FIX = new URL('../fixtures/kicad/', import.meta.url);
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));

uiTest('Browse KiCad Libraries…: the server\'s libraries, a search, a package\'s contents, imported into parts/, replaced when confirmed; Portuguese', E, async (page) => {
  // the server's cache: its index (fresh) and the package by its SHA-256
  const zip = await createZip([{ path: 'symbols/ttl.kicad_sym', data: fs.readFileSync(new URL('project/parts/ttl.kicad_sym', FIX), 'utf8') },
    { path: 'footprints/imported.pretty/Module_1x04.kicad_mod', data: fs.readFileSync(new URL('project/parts/imported.pretty/Module_1x04.kicad_mod', FIX), 'utf8') }], { deflate: (d) => zlib.deflateRawSync(d) });
  const sha = createHash('sha256').update(zip).digest('hex'), dir = path.join(env.server.configDir, 'kicad');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'packages-v1.json'), fs.readFileSync(new URL('pcm/packages-v1.json', FIX), 'utf8').replace('SHA_OF_THE_ZIP', sha));
  fs.writeFileSync(path.join(dir, `${sha}.zip`), zip);
  await makeProject(env, { name: 'CircBrowse', top: '', files: { 'src/b.circ.json': JSON.stringify(newCircuit('b', 'vhdl'), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircBrowse');
  await page.eval(() => window.SilinxApp.openFile('src/b.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-browse-kicad`), [ED], { what: 'Browse KiCad Libraries…' });
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} .circ-lib-part[data-group="KiCad parts (project)"]`).length, ED), 0);
  await page.click(`${ED} .circ-browse-kicad`);
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay .kicad-lib').length === 4, [], { what: 'the libraries' });
  const libs = () => page.eval(() => [...document.querySelectorAll('.dlg-overlay .kicad-lib')].map((r) => [...r.cells].map((c) => c.textContent)));
  assert.deepEqual(await libs(), [['KiCad 74xx symbols', '9.0.0', 'CC-BY-SA-4.0', '1.2 MB'], ['KiCad 4xxx symbols', '9.0.0', 'CC-BY-SA-4.0', '0.35 MB'],
    ['Alpha footprints', '0.3', 'CC0-1.0', '0.00 MB'], ['Example logic parts', '1.2.0', 'CC-BY-4.0', '0.00 MB']]);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .dlg-buttons .primary').disabled), true, 'none picked: no Import');
  await page.click('.dlg-overlay input[data-field=kicad-search]');
  await page.type('test author');
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay .kicad-lib').length === 1, [], { what: 'the search' });
  await page.click('.dlg-overlay .kicad-lib[data-library="org.example.logic-parts"]');
  await page.waitFor(() => document.querySelector('.dlg-overlay .kicad-content-lib'), [], { what: 'its contents' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .kicad-content-lib')].map((l) => [l.dataset.lib, l.querySelector('input').checked, l.textContent])),
    [['ttl.kicad_sym', true, 'ttl.kicad_sym: 7 part(s), 4 as ICs of the library (7400, 4011), 3 drawn only; 3 symbol(s) no part']]);
  assert.ok((await lines(page)).includes('Example logic parts 1.2.0 (CC-BY-4.0): kept from before, 1 symbol library, 1 footprint(s)'));
  await page.click('.dlg-overlay .dlg-buttons .primary');
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent.startsWith('parts/ttl.kicad_sym written:')), [], { what: 'imported' });
  assert.deepEqual((await lines(page)).slice(-2), ['parts/ttl.kicad_sym written: 7 part(s), 4 of them as ICs of the library (7400, 4011), 3 drawn only; 3 symbol(s) no part', '1 footprint(s) written: parts/imported.pretty']);
  assert.match(await readWs(env, 'CircBrowse', 'parts/ttl.kicad_sym'), /"Silinx\.Source" "org\.example\.logic-parts 1\.2\.0 \(KiCad PCM\)"/);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-lib-part[data-group="KiCad parts (project)"]`).length === 7, [ED], { what: 'the panel with its parts' });
  // again: it asks before replacing; No: nothing written
  await page.click(`${ED} .circ-browse-kicad`);
  await page.waitFor(() => document.querySelector('.dlg-overlay .kicad-lib[data-library="org.example.logic-parts"]'), [], { what: 'the dialog again' });
  await page.click('.dlg-overlay .kicad-lib[data-library="org.example.logic-parts"]');
  await page.waitFor(() => document.querySelector('.dlg-overlay .kicad-content-lib') && !document.querySelector('.dlg-overlay .dlg-buttons .primary').disabled, [], { what: 'its contents again' });
  await page.click('.dlg-overlay .dlg-buttons .primary');
  await page.waitFor(() => /the project has it already\. Replace the files of the library\?$/.test(document.querySelector('.dlg-overlay .dlg-body')?.textContent || ''), [], { what: 'the question' });
  await page.click('.dlg-overlay .dlg-buttons .btn', { text: 'No' });
  // Import KiCad Part… with a package's .zip picked: its libraries, what each one holds; imported as another project's
  const tmpZip = path.join(env.server.configDir, '..', 'pkg.zip');
  fs.writeFileSync(tmpZip, await createZip([{ path: 'metadata.json', data: JSON.stringify({ identifier: 'org.example.zipped', license: 'CC0-1.0', versions: [{ version: '2.0' }] }) },
    { path: 'symbols/zipped.kicad_sym', data: fs.readFileSync(new URL('project/parts/ttl.kicad_sym', FIX), 'utf8') }], { deflate: (d) => zlib.deflateRawSync(d) }));
  await page.click(`${ED} .circ-import-kicad`);
  await page.waitFor(() => document.querySelector('.dlg-overlay input[data-field=kicad-file]'), [], { what: 'Import KiCad Part' });
  await page.setFiles('.dlg-overlay input[data-field=kicad-file]', [tmpZip]);
  await page.waitFor(() => document.querySelector('.dlg-overlay .kicad-content-lib'), [], { what: 'the zip\'s libraries' });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay [data-field=kicad-what]').textContent), 'pkg.zip: 1 symbol library, 0 footprint(s)');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .kicad-content-lib')].map((r) => r.textContent)), ['zipped.kicad_sym: 6 part(s), 4 as ICs of the library (7400, 4011), 2 drawn only; 4 symbol(s) no part']);
  await page.click('.dlg-overlay .dlg-buttons .primary');
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent.startsWith('parts/zipped.kicad_sym written:')), [], { what: 'the zip imported' });
  assert.match(await readWs(env, 'CircBrowse', 'parts/zipped.kicad_sym'), /"Silinx\.Source" "org\.example\.zipped 2\.0"/);
  fs.rmSync(tmpZip);
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-browse-kicad`).textContent === 'Explorar bibliotecas KiCad…', [ED], { what: 'Portuguese' });
  await page.click(`${ED} .circ-browse-kicad`);
  await page.waitFor(() => document.querySelector('.dlg-overlay .dlg-title span')?.textContent === 'Explorar bibliotecas KiCad', [], { what: 'the dialog in Portuguese' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .kicad-libraries th')].map((t) => t.textContent)), ['Biblioteca', 'Versão', 'Licença', 'Tamanho']);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay input[data-field=kicad-search]').placeholder), 'Procurar bibliotecas…');
  await page.click('.dlg-overlay .dlg-buttons .btn:not(.primary)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
