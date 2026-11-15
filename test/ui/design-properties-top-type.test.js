// UI: the Top-Level Source Type (#4105): Design Properties' a choice, saved (nothing made), no Top Module row, undone;
// its types Petri Net, Circuit, C and C++ too, a design project's the drawings' only; New Project's top made of the new
// types; in Portuguese; no warnings. Both interfaces. (New Project's Schematic, FSM, ASM and Boolean Algebra tops:
// test/ui/projects.test.js.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, readWs, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const FSM = fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8');
const TOP = 'Top-Level Source Type:';
const ALL = ['hdl', 'sch', 'fsm', 'asm', 'tt', 'petri', 'circuit', 'c', 'cpp'];
// a form's labels shown, and the Top-Level Source Type's value and options shown (value, text)
const form = (page, top = TOP) => page.eval((t) => {
  const labels = [...[...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('.form-grid > label')];
  const sel = labels.find(l => l.textContent === t)?.nextElementSibling;
  return { shown: labels.filter(l => l.style.display !== 'none').map(l => l.textContent), value: sel?.value, types: [...(sel?.options || [])].filter(o => !o.hidden).map(o => [o.value, o.textContent]) };
}, top);
const chooseTop = (page, v, top = TOP) => page.eval((t, x) => { const s = [...document.querySelectorAll('.dlg-overlay .form-grid > label')].find(l => l.textContent === t).nextElementSibling; s.value = x; s.dispatchEvent(new Event('change')); }, top, v);
const warnings = async page => (await page.consoleText()).split('\n').filter(l => /WARNING|ERROR/.test(l));

uiTest('#4105 Design Properties: the Top-Level Source Type a choice, saved, nothing made; no Top Module row; undone; a design project\'s drawings only', E, async (page) => {
  await makeProject(env, { name: 'TopType', board: 'basys2', files: { 'src/traffic.fsm.json': FSM }, top: 'traffic' });
  await page.openProject('TopType');
  await page.waitFor(() => window.Silinx.modules.some(m => m.name === 'traffic'), [], { what: 'its module' });
  const tree = await page.eval(() => [...window.Silinx.fileTree].sort());
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  let f = await form(page);
  assert.ok(!f.shown.some(l => /^Top Module/.test(l)), f.shown.join(' | '));
  assert.deepEqual([f.value, f.types.map(t => t[0])], ['hdl', ALL]);
  assert.deepEqual(f.types.slice(5).map(t => t[1]), ['Petri Net', 'Digital Electronic Circuit', 'C Function (HLS)', 'C++ Function (HLS)']);
  await chooseTop(page, 'petri');
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitConsole(/^Top-Level Source Type: Petri Net\.$/m);
  assert.equal(JSON.parse(await readWs(env, 'TopType', 'silinx.json')).topSourceType, 'petri');
  assert.deepEqual(await page.eval(() => [[...window.Silinx.fileTree].sort(), window.Silinx.project.top]), [tree, 'traffic']);
  // shown again; undone as any Design Properties
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  assert.equal((await form(page)).value, 'petri');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await page.menu('Edit', 'Undo Design Properties');
  await page.waitFor(() => (window.Silinx.project.topSourceType || 'hdl') === 'hdl', [], { what: 'undone' });
  // a design project: the drawings' types only; the kind "no FPGA" chosen hides the HDL's and C's at once
  await makeProject(env, { name: 'TopDrawn', kind: 'design', files: { 'src/traffic.fsm.json': FSM }, top: 'traffic' });
  await page.openProject('TopDrawn');
  await page.waitFor(() => document.documentElement.dataset.projectKind === 'design', [], { what: 'the design project' });
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  f = await form(page);
  assert.deepEqual([f.value, f.types.map(t => t[0])], ['sch', ['sch', 'fsm', 'asm', 'tt', 'petri', 'circuit']]);
  await chooseTop(page, 'circuit');
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitConsole(/^Top-Level Source Type: Digital Electronic Circuit\.$/m);
  assert.equal(JSON.parse(await readWs(env, 'TopDrawn', 'silinx.json')).topSourceType, 'circuit');
  assert.deepEqual(await warnings(page), []);
});

uiTest('#4105 New Project: a Petri Net, a Circuit, a C function as the top; Portuguese', E, async (page) => {
  for (const [type, file, what] of [['petri', 'src/top.pn.json', /"places"/], ['circuit', 'src/top.circ.json', /"format"/], ['c', 'src/top.c', /\btop\s*\(/]]) {
    const name = `NewTop_${type}`;
    await page.menu('File', 'New Project…');
    await page.waitDialog('New Project Wizard');
    await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
    await page.dialogButton('Next >');
    await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Settings');
    await chooseTop(page, type);
    await page.dialogButton('Next >');
    await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Summary');
    await page.dialogButton('Finish');
    await page.waitNoDialog();
    await page.waitFor((n, p) => window.Silinx.project?.name === n && (window.Silinx.fileTree || []).includes(p), [name, file], { what: `${name}: ${file}` });
    assert.match(await readWs(env, name, file), what);
    assert.equal(JSON.parse(await readWs(env, name, 'silinx.json')).topSourceType, type);
  }
  // in Portuguese: Design Properties' new types
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    page.eval(async () => (await import('/js/wizards.js')).projectProperties()).catch(() => {});
    await page.waitFor(() => !!document.querySelector('.dlg-overlay .form-grid'), [], { what: 'Design Properties' });
    const f = await form(page, 'Tipo de Fonte de Topo:');
    assert.deepEqual(f.types.slice(5).map(t => t[1]), ['Rede de Petri', 'Circuito Eletrónico Digital', 'Função C (HLS)', 'Função C++ (HLS)']);
    await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].pop().click());
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});
