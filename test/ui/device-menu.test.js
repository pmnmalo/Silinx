// UI (#5878, #5939): a device's row's menu (web/js/device-menu.js), the same in the Design pane and in the Tasks
// interface's Implement, Emulate and Simulate trees: New Source…, Import Source…, I/O Pin Planning (a device with pins to
// plan), Check Design, Design Properties…; the project's row's Check Design (a System's Check System); Emulate's device
// row's [I/O Pins] (a System's FPGA node's, an Arduino's none), opening I/O Pin Planning beside the top's process. An FPGA
// project, a Circuit project, a System. In Portuguese. No warnings. Both interfaces (the trees of the tasks: the Silinx
// interface's).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const tasks = (page) => page.eval(() => document.documentElement.dataset.layout === 'tasks');
const importLabel = async (page) => `${(await tasks(page)) ? 'Import Source' : 'Add Copy of Source'}…`;
// the menu of the row labelled `label` under `host` (its name's), closed: its items
async function rowMenu(page, host, label) {
  await page.rightClick(`${host} .row .lbl`, { text: label });
  const m = await page.waitFor(() => { const x = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => `${i.textContent.trim()}${i.classList.contains('disabled') ? ' (disabled)' : ''}`); return x.length ? x : null; }, [], { what: `${label}'s menu` });
  await page.closeMenus();
  return m;
}
// the item `item` of the menu of the row labelled `label` under `host`, run (the menu waited for: a node's comes after its
// module is loaded)
async function runItem(page, host, label, item) {
  await page.rightClick(`${host} .row .lbl`, { text: label });
  await page.waitFor((t) => [...document.querySelectorAll('body > .menu-popup .mi')].some((i) => i.textContent.trim() === t), [item], { what: item });
  await page.click('body > .menu-popup .mi', { text: item });
}
// the tags of the rows under `host`: [its label, [its tags' texts]]
const tagsOf = (page, host) => page.eval((h) => [...document.querySelectorAll(`${h} .row`)].filter((r) => r.querySelector('.row-tags')).map((r) => [r.querySelector('.lbl').textContent.trim(), [...r.querySelectorAll('.row-tag')].map((b) => b.textContent)]), host);
const go = async (page, t) => { await page.click(`#task-switch .task-btn[data-task="${t}"]`); await page.waitFor((x) => document.documentElement.dataset.task === x, [t]); };
const warnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((l) => /^(WARNING|ERROR)/.test(l)));

uiTest('#5878 #5939 an FPGA project: the device\'s menu in Design, Implement, Emulate and Simulate; Check Design in the project\'s; Emulate\'s [I/O Pins]; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'DevMenu', template: 'gates' });
  await page.openProject('DevMenu');
  await page.leftTab('design');
  const dev = await page.waitFor(() => document.querySelector('#hier .row[data-key="device"] .lbl')?.textContent, [], { what: 'the device\'s row' });
  const DEVICE = ['New Source…', await importLabel(page), 'I/O Pin Planning', 'Check Design', 'Design Properties…'];
  assert.deepEqual(await rowMenu(page, '#hier', dev), DEVICE);
  assert.ok((await rowMenu(page, '#hier', 'DevMenu')).includes('Check Design'), 'the project\'s Check Design');
  // its I/O Pin Planning: the top's, as the processes'
  await runItem(page, '#hier', dev, 'I/O Pin Planning');
  await page.waitFor(() => window.Silinx.active?.id === 'pins', [], { what: 'I/O Pin Planning' });
  await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('pins')));
  // (the Silinx interface: opened in Implement, Design's page hidden; back to it)
  if (await tasks(page)) await go(page, 'edit');
  await page.leftTab('design');
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    assert.deepEqual(await rowMenu(page, '#hier', dev), ['Nova Fonte…', (await tasks(page)) ? 'Importar Fonte…' : 'Adicionar Cópia de Fonte…', 'Planeamento de Pinos de E/S', 'Verificar Projeto', 'Propriedades do Projeto…']);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  if (await tasks(page)) {
    // the tasks' trees: the same device's menu, each task's own items first (its bar's before #5939: the project's its I/O Pin
    // Planning too), the project's with its Check Design; Emulate's device its [I/O Pins]
    const OWN = { impl: ['Program FPGA'], emu: ['Emulate'], sim: ['New Test Bench…', 'Import Test Bench…'] };
    for (const [t, host] of [['impl', '#procs'], ['emu', '#task-emu-panel'], ['sim', '#task-sim-panel']]) {
      await go(page, t);
      await page.waitFor((h, d) => [...document.querySelectorAll(`${h} .row .lbl`)].some((l) => l.textContent === d && l.getClientRects().length), [host, dev], { what: `${t}'s device` });
      assert.deepEqual(await rowMenu(page, host, dev), [...OWN[t], ...DEVICE], t);
      const pj = await rowMenu(page, host, 'DevMenu');
      assert.deepEqual(pj.slice(0, OWN[t].length + (t === 'sim' ? 0 : 1)), [...(t === 'sim' ? [] : ['I/O Pin Planning']), ...OWN[t]], `${t}: the project's own`);
      assert.ok(pj.includes('Check Design'), `${t}: the project's`);
      assert.deepEqual(await tagsOf(page, host), t === 'emu' ? [[dev, ['I/O Pins']]] : [], t);
    }
    // Emulate's [I/O Pins]: I/O Pin Planning, opened in Emulate; the top's process kept beside it
    await go(page, 'emu');
    assert.ok(await page.eval(() => [...document.querySelectorAll('#task-emu-panel .row .lbl')].some((l) => l.textContent === 'I/O Pin Planning')), 'the top\'s process');
    await page.click('#task-emu-panel .row-tag[data-tag=pins]');
    await page.waitFor(() => window.Silinx.active?.id === 'pins', [], { what: 'I/O Pin Planning from the tag' });
    assert.equal(await page.eval(() => window.Silinx.active.task), 'emu');
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    try {
      await page.waitFor(() => document.querySelector('#task-emu-panel .row-tag')?.title === 'Planeamento de Pinos de E/S', [], { what: 'the tag in Portuguese' });
      assert.equal(await page.eval(() => document.querySelector('#task-emu-panel .row-tag').textContent), 'Pinos de E/S');
    } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  }
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5878 #5939 a Circuit project: its Design row\'s menu, no I/O Pin Planning; Check Design', E, async (page) => {
  await makeProject(env, { name: 'DevCircuit', template: 'traffic-circuit' });
  await page.openProject('DevCircuit');
  await page.leftTab('design');
  await page.waitFor(() => !!document.querySelector('#hier .row[data-key="device"]'), [], { what: 'the Design row' });
  assert.deepEqual(await rowMenu(page, '#hier', 'Design'), ['New Source…', await importLabel(page), 'Check Design', 'Design Properties…']);
  // (Simulate's: no device row, the project's its New Test Bench…, no Import Test Bench…: no HDL, #3780)
  if (await tasks(page)) {
    await go(page, 'sim');
    await page.waitFor(() => [...document.querySelectorAll('#task-sim-panel .row .lbl')].some((l) => l.textContent === 'DevCircuit' && l.getClientRects().length), [], { what: 'Simulate\'s project' });
    assert.deepEqual((await rowMenu(page, '#task-sim-panel', 'DevCircuit'))[0], 'New Test Bench…');
    assert.ok(!(await rowMenu(page, '#task-sim-panel', 'DevCircuit')).includes('Import Test Bench…'));
  }
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5878 #5939 a System: each node\'s device items in its menu (an FPGA node\'s I/O Pin Planning, an Arduino\'s none); Check System in the project\'s; Emulate\'s [I/O Pins] on the FPGA node only', E, async (page) => {
  await makeProject(env, { name: 'DevSys', template: 'uart-avr' });
  await page.openProject('DevSys');
  await page.leftTab('design');
  await page.waitFor(() => document.querySelectorAll('#hier .row-tags').length === 2, [], { what: 'the nodes' });
  const imp = await importLabel(page), SYS = ['Open', 'Check System', 'Emulate System'];
  assert.deepEqual(await rowMenu(page, '#hier', 'fpga'), ['New Source…', imp, 'I/O Pin Planning', ...SYS]);
  assert.deepEqual(await rowMenu(page, '#hier', 'uno'), ['New Source…', imp, ...SYS]);
  assert.ok((await rowMenu(page, '#hier', 'DevSys')).includes('Check System'), 'the project\'s Check System');
  // the FPGA node's I/O Pin Planning: its own
  await runItem(page, '#hier', 'fpga', 'I/O Pin Planning');
  await page.waitFor(() => window.Silinx.active?.id === 'pins:fpga', [], { what: 'the node\'s I/O Pin Planning' });
  if (await tasks(page)) {
    await go(page, 'emu');
    await page.waitFor(() => [...document.querySelectorAll('#task-emu-panel .row .lbl')].some((l) => /^fpga /.test(l.textContent)), [], { what: 'Emulate\'s nodes' });
    const tags = await tagsOf(page, '#task-emu-panel');
    assert.deepEqual(tags.map(([l, t]) => [l.split(' ')[0], t]), [['fpga', ['I/O Pins']]]);
    const fpga = tags[0][0];
    assert.deepEqual(await rowMenu(page, '#task-emu-panel', fpga), ['New Source…', imp, 'I/O Pin Planning']);
    // (the System's row: Emulate System; Simulate's FPGA node its test benches', in its folder)
    assert.deepEqual(await rowMenu(page, '#task-emu-panel', 'uart_avr (System)'), ['Emulate System']);
    await go(page, 'sim');
    await page.waitFor(() => [...document.querySelectorAll('#task-sim-panel .row .lbl')].some((l) => /^fpga /.test(l.textContent) && l.getClientRects().length), [], { what: 'Simulate\'s nodes' });
    assert.deepEqual(await rowMenu(page, '#task-sim-panel', fpga), ['New Test Bench…', 'Import Test Bench…', 'New Source…', imp, 'I/O Pin Planning']);
    await runItem(page, '#task-sim-panel', fpga, 'Import Test Bench…');
    await page.waitFor(() => document.querySelector('.dlg-overlay .dlg-title span')?.textContent === 'Import Test Bench', [], { what: 'Import Test Bench' });
    await page.dialogButton('Cancel');
    await page.waitNoDialog();
  }
  assert.deepEqual(await warnings(page), []);
});
