// UI: a drawing's HDL language in its editor's ⋮ menu (#4063): the schematic's, the state diagram's, the ASM chart's and
// the Petri net's, Preferred Language ✓ by default (the Boolean algebra's Notation only, #4159; the circuit's Wires and
// Wire crossings only, #4168); the state diagram in Verilog by its menu (its .v made, its .vhd gone, the project's
// sourceLanguage), then back to the Preferred Language; the circuit in Verilog and back by its Source Properties, its
// Properties without their HDL language; none in a design project; Portuguese. No warnings. Both interfaces.
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
// the open document's ⋮ menu: its HDL Language choice's items, [label, ✓]
const choice = (page) => page.eval((doc) => {
  const menu = document.querySelector(`${doc} :is(.tb-more-menu, .se-more-menu)`);
  const items = [...menu.querySelectorAll('.tb-menu-item[data-lang]')];
  const title = [...menu.querySelectorAll('.tb-menu-title')].map((t) => t.textContent);
  return { title, items: items.map((b) => [b.lastChild.textContent, b.getAttribute('aria-checked') === 'true']) };
}, DOC);
const open = async (page, f) => {
  await page.eval((p) => window.SilinxApp.openFile(p), f);
  await page.waitFor((doc) => document.querySelector(`${doc} :is(.tb-more-btn, [data-act=more])`), [DOC], { what: f });
};

uiTest('#4063 #4159 #4168 every drawing\'s ⋮ menu but the Boolean algebra\'s and the circuit\'s: its HDL language, Preferred Language by default; the state diagram in Verilog and back; the circuit by Source Properties; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'DrawLang', top: '', files: Object.fromEntries(Object.entries(FILES).map(([f, m]) => [f, JSON.stringify(m, null, 2)])) });
  await page.setViewport(1440, 900);
  await page.openProject('DrawLang');
  for (const f of Object.keys(FILES)) {
    await open(page, f);
    // (the Boolean algebra: its Notation, no HDL Language, #4159)
    if (f.endsWith('.bool.json')) { assert.deepEqual(await choice(page), { title: ['Notation'], items: [] }, f); continue; }
    // (the circuit: its Wires and Wire crossings, no HDL Language, #4168)
    if (f.endsWith('.circ.json')) { assert.deepEqual(await choice(page), { title: ['Wires', 'Wire crossings'], items: [] }, f); continue; }
    assert.deepEqual(await choice(page), { title: [...(f.endsWith('.fsm.json') ? ['Encoding', 'Coding Style'] : f.endsWith('.asm.json') ? ['Encoding'] : f.endsWith('.sch.json') ? ['Wires', 'Wire crossings'] : []), 'HDL Language'],
      items: [['Preferred Language', true], ['VHDL', false], ['Verilog', false]] }, f);
  }
  // the state diagram in Verilog by its ⋮ menu, then back
  await open(page, 'src/m.fsm.json');
  await page.waitFor(async () => (await (await fetch(`/api/projects/DrawLang/file?path=${encodeURIComponent('src/m.vhd')}`)).ok), [], { what: 'its VHDL' });
  await page.click(`${DOC} :is(.tb-more-btn, [data-act=more])`);
  await page.click(`${DOC} :is(.tb-more-menu, .se-more-menu) .tb-menu-item[data-lang][data-value=verilog]`);
  await page.waitFor(() => window.Silinx.project.sourceLanguage?.['src/m.fsm.json'] === 'verilog', [], { what: 'its own language' });
  await page.waitFor(() => window.Silinx.fileTree.includes('src/m.v') && !window.Silinx.fileTree.includes('src/m.vhd'), [], { what: 'its Verilog' });
  assert.match(await readWs(env, 'DrawLang', 'src/m.v'), /^module m/m);
  assert.deepEqual((await choice(page)).items, [['Preferred Language', false], ['VHDL', false], ['Verilog', true]]);
  await page.click(`${DOC} :is(.tb-more-btn, [data-act=more])`);
  await page.click(`${DOC} :is(.tb-more-menu, .se-more-menu) .tb-menu-item[data-lang][data-value=""]`);
  await page.waitFor(() => !window.Silinx.project.sourceLanguage && window.Silinx.fileTree.includes('src/m.vhd') && !window.Silinx.fileTree.includes('src/m.v'), [], { what: 'the Preferred Language again' });
  // the circuit: no HDL language in its Properties; in Verilog by its Source Properties, then back (#4168)
  await open(page, 'src/half_adder.circ.json');
  assert.equal(await page.eval((doc) => [...document.querySelectorAll(`${doc} .circ-circuit .asm-field span`)].map((s) => s.textContent).join(','), DOC), 'Name');
  await page.waitFor(async () => (await (await fetch(`/api/projects/DrawLang/file?path=${encodeURIComponent('src/half_adder.vhd')}`)).ok), [], { what: 'its VHDL' });
  const srcLang = async (file, lang) => {
    // (its HDL linked to it, and the project read again to the end: a dialog opened while it is read works on the
    // project before it, as test/ui/source-properties.test.js waits)
    await page.waitFor((h) => window.Silinx.hdlToSch?.[h], [file], { what: `${file} linked`, timeout: 15000 });
    await page.eval(async () => { let c; do { c = window.Silinx.reloadChain; await c; } while (c !== window.Silinx.reloadChain); });
    await page.eval((f) => { import('/js/wizards.js').then((w) => w.sourceProperties(f)); }, file);
    await page.waitDialog(`Source Properties - ${file}`);
    await page.eval((l) => { const e = document.querySelector('.dlg-overlay .form-grid select'); e.value = l; e.dispatchEvent(new Event('change')); }, lang);
    await page.dialogButton('OK');
    await page.waitNoDialog();
  };
  await srcLang('src/half_adder.vhd', 'verilog');
  await page.waitFor(() => window.Silinx.project.sourceLanguage?.['src/half_adder.circ.json'] === 'verilog', [], { what: 'its own language' });
  await page.waitFor(() => window.Silinx.fileTree.includes('src/half_adder.v') && !window.Silinx.fileTree.includes('src/half_adder.vhd'), [], { what: 'its Verilog' });
  assert.match(await readWs(env, 'DrawLang', 'src/half_adder.v'), /^module half_adder/m);
  assert.equal(JSON.parse(await readWs(env, 'DrawLang', 'src/half_adder.circ.json')).lang, 'verilog');
  await srcLang('src/half_adder.v', '');
  await page.waitFor(() => !window.Silinx.project.sourceLanguage && window.Silinx.fileTree.includes('src/half_adder.vhd') && !window.Silinx.fileTree.includes('src/half_adder.v'), [], { what: 'the Preferred Language again' });
  // (the state diagram's menu again, for the Portuguese)
  await open(page, 'src/m.fsm.json');
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((doc) => [...document.querySelectorAll(`${doc} .tb-menu-title`)].some((t) => t.textContent === 'Linguagem HDL'), [DOC], { what: 'Portuguese' });
  assert.deepEqual((await choice(page)).items.map((x) => x[0]), ['Linguagem Preferida', 'VHDL', 'Verilog']);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 180000 });

uiTest('#4063 a design project\'s drawings: no HDL language in their ⋮ menu', E, async (page) => {
  await makeProject(env, { name: 'DrawLangD', kind: 'design', top: '', files: { 'src/m.fsm.json': JSON.stringify(newFsm('m'), null, 2), 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('DrawLangD');
  for (const f of ['src/m.fsm.json', 'src/half_adder.circ.json']) {
    await open(page, f);
    assert.deepEqual((await choice(page)).items, [], f);
  }
}, { timeout: 120000 });
