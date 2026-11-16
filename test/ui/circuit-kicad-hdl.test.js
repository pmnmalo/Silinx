// UI: a KiCad part modelled by a module of the project (#4283): its tip in the Parts panel, its body on the canvas, its
// Part info (its HDL module), Check's warning (its module found in the project: no error); Import KiCad Part…'s HDL
// module column (what the symbol is then); Portuguese. No browser warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newCircuit } from '../../core/circuit.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const T = 'parts/m.kicad_sym#INV';
const pin = (t, n, name) => `(pin ${t} line (name "${name}") (number "${n}"))`;
const sym = (name, props) => `(symbol "${name}" ${Object.entries(props).map(([k, v]) => `(property "${k}" "${v}")`).join(' ')} (symbol "${name}_1_1" ${pin('input', 1, 'A')} ${pin('output', 2, 'Y')}))`;
const LIB = (props) => `(kicad_symbol_lib (version 20251024) ${sym('INV', { Value: 'TEST-INV', Footprint: 'PinHeader_1x02_P2.54mm_Vertical', ...props })})`;
const VHD = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity test_inv is\n  port (\n    a : in std_logic;\n    y : out std_logic\n  );\nend entity test_inv;\n\narchitecture rtl of test_inv is\nbegin\n  y <= not a;\nend architecture rtl;\n';
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const centre = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);

uiTest('Circuit editor: a KiCad part modelled by a module of the project: its tip, body, Part info, Check; Import\'s HDL module; Portuguese', E, async (page) => {
  const m = newCircuit('mc', 'vhdl');
  m.parts.push({ id: 'U1', type: T, x: 40, y: 20 });
  await makeProject(env, { name: 'CircHdl', top: '', files: { 'src/mc.circ.json': JSON.stringify(m, null, 2), 'src/test_inv.vhd': VHD, 'parts/m.kicad_sym': LIB({ 'Silinx.HDL': 'test_inv' }) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircHdl');
  await page.eval(() => window.SilinxApp.openFile('src/mc.circ.json'));
  await page.waitFor((ed, t) => document.querySelector(`${ed} .circ-lib-part[data-part="${t}"]`), [ED, T], { what: 'its row' });
  assert.equal(await page.eval((ed, t) => document.querySelector(`${ed} .circ-lib-part[data-part="${t}"]`).title, ED, T), 'TEST-INV, by its module test_inv: click it, then the drawing (Esc: done)');
  assert.equal(await page.eval((ed) => document.querySelectorAll(`${ed} [data-id=U1] .circ-model-body`).length, ED), 1);
  // Check: its warning only (its module is the project's)
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /Try it does not run it/.test(l.textContent)), [], { what: 'Check' });
  assert.deepEqual((await lines(page)).filter((l) => /^(ERROR|WARNING): U1 /.test(l)), ['WARNING: U1 (TEST-INV) is simulated by its module test_inv in the HDL only: Try it does not run it']);
  // its Part info
  await page.click(await centre(page, `${ED} [data-id=U1] .circ-model-body`));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-info`), [ED], { what: 'U1 selected' });
  const info = await page.eval((ed) => { const b = document.querySelector(`${ed} .circ-selection .circ-info`); return [b.querySelector('.circ-note').textContent, [...b.querySelectorAll('.circ-info-rows tr')].map((r) => [r.cells[0].textContent, r.cells[1].textContent])]; }, ED);
  assert.deepEqual(info, ['Simulated by the project\'s module test_inv in the HDL (Try it does not run it).',
    [['KiCad symbol', 'INV (parts/m.kicad_sym)'], ['Part number', 'TEST-INV'], ['HDL module', 'test_inv'], ['Footprint', 'PinHeader_1x02_P2.54mm_Vertical']]]);
  // Import KiCad Part…: a symbol given an HDL module, what it is then
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-kicad-hdl-ui-')), file = path.join(dir, 'other.kicad_sym');
  fs.writeFileSync(file, LIB({}));
  await page.click(`${ED} .circ-import-kicad`);
  await page.setFiles('.dlg-overlay input[data-field=kicad-file]', [file]);
  await page.waitFor(() => document.querySelector('.dlg-overlay tr[data-symbol=INV] .kicad-status')?.textContent, [], { what: 'its symbol' });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay tr[data-symbol=INV] .kicad-status').textContent), 'Drawn only (not simulated)');
  await page.eval(() => { const i = document.querySelector('.dlg-overlay tr[data-symbol=INV] .kicad-hdl'); i.value = 'test_inv'; i.dispatchEvent(new Event('change')); });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay tr[data-symbol=INV] .kicad-status').textContent), 'By its module test_inv');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .kicad-symbols th')].map((t) => t.textContent)), ['Symbol', 'Part number', 'Model', 'Family', 'Footprint', 'HDL module', 'It is']);
  await page.click('.dlg-overlay .dlg-buttons .btn:not(.primary)');
  fs.rmSync(dir, { recursive: true, force: true });
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed, t) => document.querySelector(`${ed} .circ-lib-part[data-part="${t}"]`)?.title.startsWith('TEST-INV, pelo seu módulo test_inv'), [ED, T], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-selection .circ-note`).textContent, ED), 'Simulada pelo módulo test_inv do projeto no HDL (o Experimentar não o corre).');
  assert.ok(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-selection .circ-info-rows th`)].some((t) => t.textContent === 'Módulo HDL'), ED));
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
