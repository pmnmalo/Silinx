// UI: a circuit's schematic in the Design pane (#4069, as a Boolean algebra's): its row's badges [Circuit] [Schematic]
// [VHDL]; the Schematic badge opens it read-only, generated from the circuit (its gates and its I/O markers a, b, s, c),
// its banner's link to the circuit; it follows the circuit (an LED's label made twice: out of sync, its errors; undone:
// in sync again); in Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const SCH = '.doc:not([hidden]) .sch-editor';
const row = () => [...[...document.querySelectorAll('#hier li')].find((li) => li.querySelector(':scope > .row .lbl')?.textContent === 'half_adder').querySelector(':scope > .row').querySelectorAll('.badge')];
const banner = (page) => page.eval((s) => document.querySelector(`${s} .se-banner`)?.textContent, SCH);

uiTest('#4069 a circuit\'s schematic: its Design row\'s badge, read-only, generated from it, following it; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircSch', top: '', files: { 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircSch');
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((r) => { const li = [...document.querySelectorAll('#hier .lbl')].find((e) => e.textContent === 'half_adder'); return li && li.closest('.row').querySelectorAll('.badge').length === 3; }, [], { what: 'its badges' });
  assert.deepEqual(await page.eval(`(${row})().map((b) => [b.textContent, b.title])`),
    [['Circuit', 'Base: its HDL is generated from it'], ['Schematic', 'Generated from the circuit, in its HDL logic form'], ['VHDL', 'Generated from the circuit']]);
  await page.eval(`(${row})()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await page.waitFor(() => window.Silinx.active?.id === 'circsch:src/half_adder.circ.json', [], { what: 'the schematic opened' });
  await page.waitFor((s) => document.querySelector(`${s} .se-banner`), [SCH], { what: 'its banner' });
  assert.equal(await banner(page), 'Read-only, generated from half_adder.circ.json');
  const look = await page.eval((s) => ({ ro: document.querySelector(s).classList.contains('read-only'), ports: [...window.Silinx.active.viewer.getDoc().ports].map((p) => p.name).sort(), gates: window.Silinx.active.viewer.getDoc().symbols.some((x) => x.type === 'xor2') }), SCH);
  assert.deepEqual(look, { ro: true, ports: ['a', 'b', 'c', 's'], gates: true });
  // the circuit changed: D2's label made s (D1's): out of sync, its error; undone: in sync again
  // (an edit of the circuit's own: D2 selected, its Label field set; Undo takes it back)
  const label = (v) => page.eval((v) => {
    const d = window.Silinx.docs.find((x) => x.id === 'circ:src/half_adder.circ.json');
    d.circuitEditor.select({ kind: 'part', id: 'D2' });
    const inp = d.el.querySelector('.circ-label-in'); inp.value = v; inp.dispatchEvent(new Event('change'));
  }, v);
  await label('s');
  await page.waitFor((s) => /not in sync/.test(document.querySelector(`${s} .se-banner`)?.textContent || ''), [SCH], { what: 'out of sync' });
  assert.equal(await banner(page), 'Read-only, not in sync with half_adder.circ.json — the circuit has errors: D2: its label \'s\' is D1\'s too');
  await label('c');
  await page.waitFor((s) => document.querySelector(`${s} .se-banner`)?.textContent === 'Read-only, generated from half_adder.circ.json', [SCH], { what: 'in sync again' });
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((s) => /^Só de leitura, gerado a partir de/.test(document.querySelector(`${s} .se-banner`)?.textContent || ''), [SCH], { what: 'Portuguese' });
  assert.equal(await page.eval(`(${row})()[1].title`), 'Gerado a partir do circuito, na sua forma da lógica do HDL');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
