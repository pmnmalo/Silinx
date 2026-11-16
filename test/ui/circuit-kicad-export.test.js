// UI: the circuit editor's ⋮ KiCad exports (#4282): Export ICs as KiCad Symbols… (this circuit's ICs: a .kicad_sym
// downloaded, read back as those ICs), Export Parts as KiCad Package… (an author missing: its error in the console, the
// dialog open; then a .zip downloaded, read back the same: the project's parts and the library's ICs); Portuguese.
// Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { setupUi, uiTest, makeProject, waitDownload } from './harness.js';
import { halfAdder } from '../circuit-helpers.mjs';
import { kicadPartsOf } from '../../core/circuit-kicad.js';
import { readPcmPackage } from '../../core/kicad-pcm.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const LIB = fs.readFileSync(new URL('../fixtures/kicad/project/parts/ttl.kicad_sym', import.meta.url), 'utf8');
const menu = async (page, cls) => { await page.click(`${ED} .tb-more-btn`); await page.click(`${ED} .tb-more-menu .${cls}`); };
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));

uiTest('Circuit editor ⋮: Export ICs as KiCad Symbols…, Export Parts as KiCad Package…, read back; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircExport', top: '', files: { 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2), 'parts/ttl.kicad_sym': LIB } });
  await page.setViewport(1440, 900);
  await page.openProject('CircExport');
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part`), [ED], { what: 'the circuit editor' });
  // the menu's KiCad section
  await page.click(`${ED} .tb-more-btn`);
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .tb-more-menu .circ-export-ics, ${ed} .tb-more-menu .circ-export-pkg`)].map((b) => b.textContent), ED), ['Export ICs as KiCad Symbols…', 'Export Parts as KiCad Package…']);
  await page.click(`${ED} .tb-more-btn`);
  // this circuit's ICs: the 7486 and the 7408
  await menu(page, 'circ-export-ics');
  await page.waitFor(() => document.querySelector('.dlg-overlay [data-field=ics-circuit]'), [], { what: 'the dialog' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .kicad-ics-choice')].map((l) => l.textContent)), ['All the library\'s ICs (48)', 'This circuit\'s ICs (2)']);
  await page.click('.dlg-overlay [data-field=ics-circuit]');
  await page.click('.dlg-overlay .dlg-buttons .primary');
  const sym = fs.readFileSync(await waitDownload(page, 'silinx-ics.kicad_sym'), 'utf8');
  assert.deepEqual(kicadPartsOf({ 'parts/x.kicad_sym': sym }).defs.map((d) => d.behaves), ['7486', '7408']);
  assert.ok((await lines(page)).includes('silinx-ics.kicad_sym written: 2 IC(s) of the library as KiCad symbols (7486, 7408)'));
  // the package: no author, refused (the dialog stays); then exported
  await menu(page, 'circ-export-pkg');
  await page.waitFor(() => document.querySelector('.dlg-overlay [data-field=identifier]'), [], { what: 'the package dialog' });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay [data-field=identifier]').value), 'org.example.circexport');
  await page.click('.dlg-overlay .dlg-buttons .primary');
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent === 'ERROR: Export Parts as KiCad Package: author: missing'), [], { what: 'its error' });
  assert.ok(await page.eval(() => !!document.querySelector('.dlg-overlay [data-field=author]')), 'the dialog open');
  await page.eval(() => { document.querySelector('.dlg-overlay [data-field=author]').value = 'A Teacher'; document.querySelector('.dlg-overlay [data-field=with-ics]').checked = true; });
  await page.click('.dlg-overlay .dlg-buttons .primary');
  const zip = new Uint8Array(fs.readFileSync(await waitDownload(page, 'circexport-kicad.zip')));
  const pkg = await readPcmPackage(zip, { inflate: (d, limit) => zlib.inflateRawSync(d, { maxOutputLength: Math.max(1, limit) }) });
  assert.deepEqual(pkg.symbols.map((s) => s.name).sort(), ['Silinx.kicad_sym', 'ttl.kicad_sym']);
  assert.equal(pkg.symbols.find((s) => s.name === 'ttl.kicad_sym').text, LIB);
  assert.deepEqual([pkg.metadata.identifier, pkg.metadata.author, pkg.metadata.license, pkg.metadata.versions[0].version], ['org.example.circexport', { name: 'A Teacher' }, 'CC-BY-SA-4.0', '1.0.0']);
  assert.ok((await lines(page)).includes('circexport-kicad.zip written: the KiCad package org.example.circexport 1.0.0 of 1 file(s) of CircExport\'s parts/ and 48 IC(s) of the library'));
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.click(`${ED} .tb-more-btn`);
  await page.waitFor((ed) => document.querySelector(`${ed} .tb-more-menu .circ-export-ics`)?.textContent === 'Exportar CIs como símbolos KiCad…', [ED], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .tb-more-menu .circ-export-pkg`).textContent, ED), 'Exportar peças como pacote KiCad…');
  await page.click(`${ED} .tb-more-menu .circ-export-pkg`);
  await page.waitFor(() => document.querySelector('.dlg-overlay .dlg-title span')?.textContent === 'Exportar peças como pacote KiCad', [], { what: 'the dialog in Portuguese' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid label')].map((l) => l.textContent)), ['Identificador:', 'Nome:', 'Descrição:', 'Autor:', 'Licença:', 'Versão:']);
  await page.click('.dlg-overlay .dlg-buttons .btn:not(.primary)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
