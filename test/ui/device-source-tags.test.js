// UI (#5873): the Design pane's [New] and [Import] on each device's row (web/js/design-system.js sourceTags), the buttons
// above the tree gone: New Source and Import Source for that device, its own types and files only (core/source-types.js),
// in its node's folder; no Implementation Constraints File in New Source. An FPGA project's device row, a Circuit
// project's Design row, a System's FPGA node and Arduino node, a PIC24's node (Import only: New Source says why). In
// Portuguese. The console's lines exact. Both interfaces (SILINX_UI_INTERFACE=ise).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const FPGA = ['Boolean Algebra', 'Digital Electronic Circuit', 'Module (HDL)', 'Schematic', 'Finite State Machine (FSM)', 'Algorithmic State Machine (ASM)', 'Petri Net',
  'Register Map', 'Clock Manager (DCM / PLL)', 'Block Memory', 'Test Bench', 'Memory Initialization File (.mem)', 'Guided Lab', 'C Function (HLS)', 'C++ Function (HLS)'];
const CIRCUIT = ['Boolean Algebra', 'Digital Electronic Circuit', 'Schematic', 'Finite State Machine (FSM)', 'Algorithmic State Machine (ASM)', 'Petri Net', 'Guided Lab'];
const AVR = ['Arduino Sketch', 'C Source', 'C++ Source', 'Assembly', 'Finite State Machine (FSM)', 'Algorithmic State Machine (ASM)', 'Petri Net', 'Boolean Algebra'];

// each row's tags: [its label, [its tags' texts], [their tips]]
const tags = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => r.querySelector('.row-tags'))
  .map((r) => [r.querySelector('.lbl').textContent.trim(), [...r.querySelectorAll('.row-tag')].map((b) => b.textContent), [...r.querySelectorAll('.row-tag')].map((b) => b.title)]));
const importTip = (page) => page.eval(() => (document.documentElement.dataset.layout === 'tasks' ? 'Import Source…' : 'Add Copy of Source…'));
const importTitle = (page) => page.eval(() => (document.documentElement.dataset.layout === 'tasks' ? 'Import Source' : 'Add Copy of Source'));
const clickTag = (page, label, tag) => page.eval((l, t) => [...document.querySelectorAll('#hier .row')].find((r) => r.querySelector('.lbl')?.textContent.trim() === l).querySelector(`.row-tag[data-tag=${t}]`).click(), label, tag);
const types = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .src-types .st')].map((r) => [...r.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')));   // (its label, not its icon's)
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((l) => /^(WARNING|ERROR|Created)/.test(l)));

// New Source opened by a row's [New]: its types; then its File Name and Location page's location and whether it asks a
// language; cancelled
async function newSourceOf(page, label) {
  await clickTag(page, label, 'new');
  await page.waitDialog('New Source');
  const list = await types(page);
  await page.dialogButton('Next >');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .form-grid'), [], { what: 'the File Name and Location page' });
  const at = await page.eval(() => { const g = document.querySelector('.dlg-overlay .form-grid'); return [g.querySelectorAll('input')[1].value, !!g.querySelector('select')]; });
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  return { list, at };
}
// Import Source opened by a row's [Import]: its title and the files it takes; cancelled
async function importOf(page, label) {
  await clickTag(page, label, 'import');
  const title = await page.waitFor(() => document.querySelector('.dlg-overlay .dlg-title span')?.textContent, [], { what: 'the dialog' });
  const accept = await page.eval(() => document.querySelector('.dlg-overlay input[type=file]').accept);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  return { title, accept };
}

uiTest('#5873 an FPGA project: [New] and [Import] on its device row, none above the tree; New Source without a constraints file; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TagsFpga', template: 'gates' });
  await page.openProject('TagsFpga');
  await page.leftTab('design');
  await page.waitFor(() => !!document.querySelector('#hier .row-tags'), [], { what: 'the tags' });
  assert.equal(await page.eval(() => document.getElementById('task-src-bar')), null);
  const tip = await importTip(page);
  const [[device, texts, tips], ...others] = await tags(page);
  assert.deepEqual([texts, tips, others], [['New', 'Import'], ['New Source…', tip], []]);
  assert.equal(await page.eval(() => document.querySelector('#hier .row-tags').closest('.row').dataset.key), 'device');
  assert.deepEqual(await newSourceOf(page, device), { list: FPGA, at: ['src', true] });
  assert.deepEqual(await importOf(page, device), { title: await importTitle(page), accept: '.v,.vhd,.vhdl,.ucf,.pcf,.lpf,.cst,.ccf,.xdc,.qsf,.mem,.hex,.json' });
  // the menu's New Source: the same types
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  assert.deepEqual(await types(page), FPGA);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor(() => document.querySelector('#hier .row-tag')?.textContent === 'Novo', [], { what: 'Portuguese' });
    assert.deepEqual((await tags(page)).map(([, t, ti]) => [t, ti]), [[['Novo', 'Importar'], ['Nova Fonte…', tip === 'Import Source…' ? 'Importar Fonte…' : 'Adicionar Cópia de Fonte…']]]);
    await clickTag(page, device, 'new');
    await page.waitDialog('Nova Fonte');
    const pt = await types(page);
    assert.equal(pt.length, FPGA.length);
    assert.ok(pt.includes('Módulo (HDL)') && !pt.some((t) => /Restri/.test(t)), pt.join());
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  assert.deepEqual(await lines(page), []);
});

uiTest('#5873 a Circuit project: its Design row\'s [New] and [Import], its drawings and labs only, its drawings\' files', E, async (page) => {
  await makeProject(env, { name: 'TagsCircuit', template: 'traffic-circuit' });
  await page.openProject('TagsCircuit');
  await page.leftTab('design');
  await page.waitFor(() => !!document.querySelector('#hier .row-tags'), [], { what: 'the tags' });
  assert.deepEqual(await tags(page), [['Design', ['New', 'Import'], ['New Source…', await importTip(page)]]]);
  assert.deepEqual(await newSourceOf(page, 'Design'), { list: CIRCUIT, at: ['src', false] });
  assert.deepEqual((await importOf(page, 'Design')).accept, '.json');
  assert.deepEqual(await lines(page), []);
});

uiTest('#5873 a System: its FPGA node\'s and its Arduino\'s [New] and [Import], each its own types and files, in its folder; an Arduino Sketch made', E, async (page) => {
  await makeProject(env, { name: 'TagsSys', template: 'uart-avr' });
  await page.openProject('TagsSys');
  await page.leftTab('design');
  await page.waitFor(() => document.querySelectorAll('#hier .row-tags').length === 2, [], { what: 'the nodes\' tags' });
  const tip = await importTip(page);
  assert.deepEqual(await tags(page), [['uno', ['New', 'Import'], ['New Source…', tip]], ['fpga', ['New', 'Import'], ['New Source…', tip]]]);   // (the System's row none)
  assert.deepEqual(await newSourceOf(page, 'uno'), { list: AVR, at: ['uno', false] });
  assert.deepEqual(await newSourceOf(page, 'fpga'), { list: FPGA, at: ['fpga', true] });
  assert.deepEqual((await importOf(page, 'uno')).accept, '.ino,.c,.cpp,.h,.hpp,.asm,.hex,.json');
  assert.deepEqual((await importOf(page, 'fpga')).accept, '.v,.vhd,.vhdl,.ucf,.pcf,.lpf,.cst,.ccf,.xdc,.qsf,.mem,.hex,.json');
  // an Arduino Sketch in the Arduino's folder: Next, its name, Next (the summary), Finish
  await clickTag(page, 'uno', 'new');
  await page.waitDialog('New Source');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .form-grid input[type=text]', 'morse');
  await page.dialogButton('Next >');
  await page.waitFor(() => /Source Type: Arduino Sketch\nSource Name: morse\.ino/.test(document.querySelector('.dlg-overlay pre.code-box')?.textContent || ''), [], { what: 'the summary' });
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitConsole(/Created Arduino Sketch/);
  assert.equal(await env.server.api('GET', `/api/projects/TagsSys/file?path=${encodeURIComponent('uno/morse.ino')}`, undefined, { text: true }), '// morse.ino: an Arduino sketch.\n\nvoid setup() {\n}\n\nvoid loop() {\n}\n');
  assert.deepEqual(await lines(page), ['Created Arduino Sketch \'uno/morse.ino\'.']);
});

uiTest('#5873 a PIC24 node: [Import] only (its .hex); New Source on it says why it makes none', E, async (page) => {
  await makeProject(env, { name: 'TagsPic', template: 'uart-fpga-pic24' });
  await page.openProject('TagsPic');
  await page.leftTab('design');
  await page.waitFor(() => document.querySelectorAll('#hier .row-tags').length === 2, [], { what: 'the nodes\' tags' });
  const tip = await importTip(page);
  assert.deepEqual(await tags(page), [['pic', ['Import'], [tip]], ['fpga', ['New', 'Import'], ['New Source…', tip]]]);
  assert.deepEqual((await importOf(page, 'pic')).accept, '.hex');
  // the menu's New Source, the PIC24's row selected
  await page.treeRow('#hier', 'pic', { exact: true });
  await page.menu('Project', 'New Source…');
  await page.waitConsole(/takes no new source/);
  assert.equal(await page.eval(() => !!document.querySelector('.dlg-overlay')), false);
  assert.deepEqual(await lines(page), ['ERROR: New Source: A PIC24 takes no new source: Import Source copies its files.']);
});
