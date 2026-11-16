// UI: a project's KiCad parts in the circuit editor (#4281, #4280): its parts/ folder's symbols in the Parts panel's
// "KiCad parts (project)" (a 74HC00 drawn as its IC's gate, a module drawn only), placed on the canvas, their Part
// info (their KiCad symbol, part number, datasheet, source, licence); Check's warning of the part drawn only; Import
// KiCad Part…: a library picked, its symbols and what each one is as its Model is set, imported (its lines in the
// console, its file in parts/ with the Silinx properties); Portuguese. No browser warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newCircuit } from '../../core/circuit.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const FIX = new URL('../fixtures/kicad/project/parts/', import.meta.url);
const T = (s) => `parts/ttl.kicad_sym#${s}`;
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const info = (page) => page.eval((ed) => {
  const b = document.querySelector(`${ed} .circ-selection .circ-info`);
  return { about: b.querySelector('.circ-note')?.textContent ?? null, rows: [...b.querySelectorAll('.circ-info-rows tr')].map((r) => [r.querySelector('th').textContent, r.querySelector('td').textContent]) };
}, ED);
const centre = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
// (a library to import: a 74LS08, and a symbol whose part number is the 7404's but its pins are not)
const pin = (t, n, name = '') => `(pin ${t} line (name "${name}") (number "${n}"))`;
const AND = '(symbol "AND" (property "Value" "74LS08") (property "Description" "quad AND") (property "ki_fp_filters" "DIP*W7.62mm*") '
  + `${[[1, 2, 3], [4, 5, 6], [9, 10, 8], [12, 13, 11]].map(([a, b, y], i) => `(symbol "AND_${i + 1}_1" ${pin('input', a)} ${pin('input', b)} ${pin('output', y)})`).join(' ')} (symbol "AND_5_0" ${pin('power_in', 14, 'VCC')} ${pin('power_in', 7, 'GND')}))`;
const ODD = `(symbol "ODD" (property "Value" "TEST-ODD") (property "Footprint" "PinHeader_1x02_P2.54mm_Vertical") (symbol "ODD_1_1" ${pin('input', 1, 'A')} ${pin('output', 2, 'Y')}))`;
const LIB = `(kicad_symbol_lib\n\t(version 20251024)\n\t(generator "t")\n\t${AND}\n\t${ODD}\n)\n`;

uiTest('Circuit editor: a project\'s KiCad parts in the Parts panel, placed, their Part info, Check; Import KiCad Part…; Portuguese', E, async (page) => {
  const m = newCircuit('kc', 'vhdl');
  m.parts.push({ id: 'U1', type: T('74HC00'), x: 40, y: 20 }, { id: 'M1', type: T('SENSOR'), x: 40, y: 30 });
  await makeProject(env, { name: 'CircKicad', top: '', files: { 'src/kc.circ.json': JSON.stringify(m, null, 2), 'parts/ttl.kicad_sym': fs.readFileSync(new URL('ttl.kicad_sym', FIX), 'utf8'),
    'parts/imported.pretty/Module_1x04.kicad_mod': fs.readFileSync(new URL('imported.pretty/Module_1x04.kicad_mod', FIX), 'utf8') } });
  await page.setViewport(1440, 900);
  await page.openProject('CircKicad');
  await page.eval(() => window.SilinxApp.openFile('src/kc.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part[data-group="KiCad parts (project)"]`), [ED], { what: 'the project\'s KiCad parts' });
  // the panel: its group last, each part's name its number and description, a 74HC00 drawn as its IC's gate, a module drawn
  const group = await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-lib-part[data-group="KiCad parts (project)"]`)].map((b) => [b.dataset.part, b.querySelector('.nm').textContent, b.title, b.querySelector('svg').classList.contains('circ-pv-sym')]), ED);
  assert.deepEqual(group, [
    [T('74LS00'), 'SN74LS00N quad 2-input NAND gate', 'SN74LS00N, as the 7400: click it, then the drawing (Esc: done)', true],
    [T('74HC00'), '74HC00 quad 2-input NAND gate, HCMOS', '74HC00, as the 7400: click it, then the drawing (Esc: done)', true],
    [T('MYNAND'), 'MYNAND', 'MYNAND, as the 7400: click it, then the drawing (Esc: done)', true],
    [T('CD4011'), 'CD4011BE quad 2-input NAND gate, CMOS', 'CD4011BE, as the 4011: click it, then the drawing (Esc: done)', true],
    [T('74LS04'), '74LS04', '74LS04, drawn only (not simulated): click it, then the drawing (Esc: done)', false],
    [T('SENSOR'), 'TEST-SENSOR a sensor module', 'TEST-SENSOR, drawn only (not simulated): click it, then the drawing (Esc: done)', false],
    [T('MODULE'), 'TEST-MODULE', 'TEST-MODULE, drawn only (not simulated): click it, then the drawing (Esc: done)', false]]);
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-lib-title > span:first-child`)].slice(-2).map((x) => x.textContent), ED), ['KiCad parts (project)', 'KiCad catalogue'], 'the project\'s, then the KiCad catalogue (#4305)');
  // the search finds them by their part number
  await page.click(`${ED} .circ-search`);
  await page.type('hcmos');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-lib-part`).length === 1, [ED], { what: 'the search' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part`).dataset.part, ED), T('74HC00'));
  await page.eval((ed) => { const s = document.querySelector(`${ed} .circ-search`); s.value = ''; s.dispatchEvent(new Event('input')); }, ED);
  // on the canvas: the 74HC00 an IC named by its number, the sensor's body dashed, named too
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-canvas .circ-ic-text`)].map((t) => t.textContent), ED), ['U1  74HC00', 'M1  TEST-SENSOR']);
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} [data-id=M1] .circ-drawn-body`).length, ED), 1);
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .doc-status .ds-f`)].map((f) => f.textContent), ED), ['2 IC(s) · 0 input(s) · 0 display(s) · 2 wire(s)']);
  // Check: the IC unpowered, the module drawn only
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /drawn only/.test(l.textContent)), [], { what: 'Check' });
  const checked = (await lines(page)).filter((l) => /^(ERROR|WARNING): (U1|M1) /.test(l));
  assert.deepEqual(checked, ["ERROR: U1 (74HC00) is not powered: its VCC (pin 14) is not on the supply's + and its GND (pin 7) is not on the supply's −",
    'WARNING: M1 (TEST-SENSOR) is drawn only: it is not simulated and its pins drive nothing']);
  // their Part info
  await page.click(await centre(page, `${ED} [data-id=U1] .circ-ic-body`));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection h3`)?.textContent === 'U1: Quad 2-input NAND', [ED], { what: 'U1 selected' });
  const u1 = await info(page);
  assert.equal(u1.about, 'Behaves as the 7400 of the library (by its part number).');
  assert.deepEqual(u1.rows.filter(([k]) => ['Chip', 'KiCad symbol', 'Part number', 'Datasheet'].includes(k)), [['Chip', 'SN74LS00'], ['KiCad symbol', `74HC00 (parts/ttl.kicad_sym)`], ['Part number', '74HC00'], ['Datasheet', 'https://example.org/74hc00.pdf']]);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-info a`)?.rel, ED), 'noopener noreferrer');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-pinout .circ-lib-title`).textContent, ED), '74HC00: pinout');
  await page.click(await centre(page, `${ED} [data-id=M1] .circ-drawn-body`));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection h3`)?.textContent === 'M1: TEST-SENSOR', [ED], { what: 'M1 selected' });
  const m1 = await info(page);
  assert.equal(m1.about, 'Drawn only: not simulated, its pins drive nothing.');
  assert.deepEqual(m1.rows, [['KiCad symbol', 'SENSOR (parts/ttl.kicad_sym)'], ['Part number', 'TEST-SENSOR'], ['Footprint', 'Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical']]);

  // Import KiCad Part…: a library picked, its symbols and what each one is
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-kicad-ui-')), file = path.join(dir, 'more.kicad_sym');
  fs.writeFileSync(file, LIB);
  await page.click(`${ED} .circ-import-kicad`);
  await page.waitFor(() => document.querySelector('.dlg-overlay input[data-field=kicad-file]'), [], { what: 'the dialog' });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .dlg-buttons .primary').disabled), true, 'nothing picked: no Import');
  await page.setFiles('.dlg-overlay input[data-field=kicad-file]', [file]);
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay .kicad-symbols tr[data-symbol]').length === 2, [], { what: 'its symbols' });
  const table = () => page.eval(() => [...document.querySelectorAll('.dlg-overlay .kicad-symbols tr[data-symbol]')].map((r) => [r.dataset.symbol, r.cells[1].textContent, r.querySelector('.kicad-status').textContent, r.querySelector('.kicad-status').title]));
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay [data-field=kicad-what]').textContent), '2 symbol(s): parts/more.kicad_sym');
  assert.deepEqual(await table(), [['AND', '74LS08', 'As the 7408 (by its part number)', ''], ['ODD', 'TEST-ODD', 'Drawn only (not simulated)', '']]);
  // a Model set: what it is follows (the pins of TEST-ODD are not a 7404's)
  await page.eval(() => { const s = document.querySelector('.dlg-overlay tr[data-symbol=ODD] select'); s.value = '7404'; s.dispatchEvent(new Event('change')); });
  assert.deepEqual((await table())[1], ['ODD', 'TEST-ODD', 'Not a part', "its Silinx.Model is 7404 but its pin 3 is missing (the 7404's 2A)"]);
  await page.eval(() => { const s = document.querySelector('.dlg-overlay tr[data-symbol=ODD] select'); s.value = ''; s.dispatchEvent(new Event('change')); });
  await page.eval(() => { for (const [k, v] of [['source', 'a test library'], ['licence', 'CC-BY-4.0']]) { const i = document.querySelector(`.dlg-overlay input[data-field=${k}]`); i.value = v; } });
  await page.click('.dlg-overlay .dlg-buttons .primary');
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent.startsWith('parts/more.kicad_sym written')), [], { what: 'imported' });
  const said = (await lines(page)).slice(-3);
  assert.deepEqual(said, ['parts/more.kicad_sym written (its symbols\' Silinx properties set)', 'parts/more.kicad_sym#AND: behaves as the 7408 (by its part number)', 'parts/more.kicad_sym#ODD: drawn only: not simulated']);
  const written = await readWs(env, 'CircKicad', 'parts/more.kicad_sym');
  assert.equal(written.split('\n').filter((l) => l.includes('"Silinx.Licence" "CC-BY-4.0"')).length, 2);
  assert.equal(written.replace(/\n\t\t\(property "Silinx\.(?:Source|Licence)" "[^"]*" \(at 0 0 0\) \(effects \(font \(size 1\.27 1\.27\)\) \(hide yes\)\)\)/g, ''), LIB, 'KiCad\'s text as it was, but the properties added');
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="parts/more.kicad_sym#AND"]`), [ED], { what: 'the panel with them' });
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-import-kicad`).textContent === 'Importar peça KiCad…', [ED], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-lib-title > span:first-child`)].at(-2).textContent, ED), 'Peças KiCad (projeto)');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="${'parts/ttl.kicad_sym#SENSOR'}"]`).title, ED), 'TEST-SENSOR, só desenhada (não simulada): clique nela e depois no desenho (Esc: terminar)');
  const pt = await info(page);
  assert.deepEqual([pt.about, pt.rows.map(([k]) => k)], ['Só desenhada: não é simulada, os seus pinos não conduzem nada.', ['Símbolo KiCad', 'Referência', 'Footprint']]);
  await page.click(`${ED} .circ-import-kicad`);
  await page.waitFor(() => document.querySelector('.dlg-overlay .dlg-title span')?.textContent === 'Importar peça KiCad', [], { what: 'the dialog in Portuguese' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid label')].map((l) => l.textContent)), ['Ficheiro:', 'ou uma pasta:', 'Origem:', 'Autor:', 'Licença:']);
  await page.click('.dlg-overlay .dlg-buttons .btn:not(.primary)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
