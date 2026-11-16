// UI: a drawing's HDL language chosen in its Source Properties only (#4240): no editor's ⋮ menu has an HDL Language
// any more (#4063 put it there; the Boolean algebra lost it in #4159, the circuit in #4168): the schematic's, the Boolean
// algebra's, the state diagram's, the ASM chart's, the Petri net's and the circuit's menus keep their own choices only.
// A schematic, a state diagram and a circuit in Verilog by their Source Properties (their .v made, their .vhd gone, the
// project's sourceLanguage), then back to the Project Preferred Language; the circuit's Properties without their HDL
// language; the dialog in Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newFsm } from '../../core/fsm.js';
import { newModel } from '../../core/asm.js';
import { newPetri } from '../../core/petri.js';
import { newDoc } from '../../core/schdoc.js';
import { newTable } from '../../core/logic.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DOC = '.doc:not([hidden])';
const FILES = { 'src/s.sch.json': newDoc('s', 'vhdl'), 'src/t.bool.json': newTable('t'), 'src/m.fsm.json': newFsm('m'), 'src/c.asm.json': newModel('c'),
  'src/n.pn.json': newPetri('n'), 'src/half_adder.circ.json': halfAdder() };
// the open document's ⋮ menu: its choices' titles and every item's text
const menu = (page) => page.eval((doc) => {
  const m = document.querySelector(`${doc} :is(.tb-more-menu, .se-more-menu)`);
  return { titles: [...m.querySelectorAll('.tb-menu-title')].map((t) => t.textContent), items: [...m.querySelectorAll('button')].map((b) => b.textContent.replace(/^✓/, '')) };
}, DOC);
const open = async (page, f) => {
  await page.eval((p) => window.SilinxApp.openFile(p), f);
  await page.waitFor((doc) => document.querySelector(`${doc} :is(.tb-more-btn, [data-act=more])`), [DOC], { what: f });
};
// Source Properties of an HDL file a drawing generates: its Language chosen ('' the Project Preferred Language)
async function sourceLanguage(page, file, lang) {
  // (its HDL linked to it, and the project read again to the end: a dialog opened while it is read works on the
  // project before it, as test/ui/source-properties.test.js waits)
  await page.waitFor((h) => window.Silinx.hdlToSch?.[h], [file], { what: `${file} linked`, timeout: 15000 });
  await page.eval(async () => { let c; do { c = window.Silinx.reloadChain; await c; } while (c !== window.Silinx.reloadChain); });
  await page.eval((f) => { import('/js/wizards.js').then((w) => w.sourceProperties(f)); }, file);
  await page.waitDialog(`Source Properties - ${file}`);
  await page.eval((l) => { const e = document.querySelector('.dlg-overlay .form-grid select'); e.value = l; e.dispatchEvent(new Event('change')); }, lang);
  await page.dialogButton('OK');
  await page.waitNoDialog();
}

uiTest('#4240 no HDL Language in any drawing\'s ⋮ menu; a schematic, a state diagram and a circuit in Verilog and back by Source Properties; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'DrawLang', top: '', files: Object.fromEntries(Object.entries(FILES).map(([f, m]) => [f, JSON.stringify(m, null, 2)])) });
  await page.setViewport(1440, 900);
  await page.openProject('DrawLang');
  for (const f of Object.keys(FILES)) {
    await open(page, f);
    // (no HDL Language title nor its items; the Boolean algebra's Notation lists VHDL and Verilog: its own choice)
    const m = await menu(page);
    assert.ok(!m.titles.includes('HDL Language') && !m.items.includes('Preferred Language'), `${f}: ${JSON.stringify(m)}`);
    if (!f.endsWith('.bool.json')) assert.deepEqual(m.items.filter((x) => /^(VHDL|Verilog)$/.test(x)), [], f);
  }
  // (the Boolean algebra's Notation lists VHDL and Verilog: its own choice, kept)
  await open(page, 'src/t.bool.json');
  assert.deepEqual((await menu(page)).titles, ['Notation']);
  // the circuit's Properties: no HDL language
  await open(page, 'src/half_adder.circ.json');
  assert.equal(await page.eval((doc) => [...document.querySelectorAll(`${doc} .circ-circuit .asm-field span`)].map((s) => s.textContent).join(','), DOC), 'Name');
  // each in Verilog by its Source Properties, then back to the Project Preferred Language
  for (const [drawing, base, re] of [['src/s.sch.json', 'src/s', /^module s/m], ['src/m.fsm.json', 'src/m', /^module m/m], ['src/half_adder.circ.json', 'src/half_adder', /^module half_adder/m]]) {
    await page.waitFor((f) => window.Silinx.fileTree.includes(f), [`${base}.vhd`], { what: `${base}.vhd` });
    await sourceLanguage(page, `${base}.vhd`, 'verilog');
    await page.waitFor((d) => window.Silinx.project.sourceLanguage?.[d] === 'verilog', [drawing], { what: `${drawing}: its own language` });
    await page.waitFor((b) => window.Silinx.fileTree.includes(`${b}.v`) && !window.Silinx.fileTree.includes(`${b}.vhd`), [base], { what: `${base}.v` });
    assert.match(await readWs(env, 'DrawLang', `${base}.v`), re, drawing);
    await sourceLanguage(page, `${base}.v`, '');
    await page.waitFor((b) => !window.Silinx.project.sourceLanguage && window.Silinx.fileTree.includes(`${b}.vhd`) && !window.Silinx.fileTree.includes(`${b}.v`), [base], { what: `${base}: the Preferred Language again` });
  }
  assert.equal(JSON.parse(await readWs(env, 'DrawLang', 'src/half_adder.circ.json')).lang, 'vhdl');
  // in Portuguese: Source Properties' Language; the state diagram's menu without it
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  try {
    await page.waitFor((h) => window.Silinx.hdlToSch?.[h], ['src/m.vhd'], { what: 'src/m.vhd linked' });
    await page.eval(() => { import('/js/wizards.js').then((w) => w.sourceProperties('src/m.vhd')); });
    await page.waitFor(() => [...document.querySelectorAll('.dlg-overlay option')].map((o) => o.textContent).join() === 'Linguagem Preferida do Projeto,VHDL,Verilog', [], { what: 'in Portuguese' });
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
    await open(page, 'src/m.fsm.json');
    assert.ok(!(await menu(page)).titles.includes('Linguagem HDL'));
  } finally { await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); }); }
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 180000 });
