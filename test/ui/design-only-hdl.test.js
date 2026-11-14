// UI: no HDL in a design and simulation project (#3891, after #3780): the Symbol Info of a schematic's symbol without its
// Equivalent HDL (nor the HDL in its note), a tab's menu and View without Show VHDL / Verilog Beside (a drawing's HDL, its
// translation), its other views kept; in Portuguese; no warnings. An FPGA project keeps them (test/ui/symbolinfo.test.js,
// test/ui/related-views.test.js). Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const FSM = fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8');
const ED = '.doc:not([hidden]) .sch-editor';
const DLG = `${ED} .se-symdoc`;

// a document's tab, by its title (a point on it)
const tab = (page, title) => page.eval((t) => {
  const el = [...document.querySelectorAll('#doc-tabs .tab')].find((x) => x.querySelector('.tlabel')?.textContent === t && x.getClientRects().length);
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 3, y: r.top + r.height / 2 };
}, title);
// its menu's Show … Beside entries (Mostrar … ao Lado), the menu closed after
const beside = async (page, title) => {
  await page.rightClick(await tab(page, title));
  const m = await page.waitFor(() => { const l = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.textContent.trim()); return l.length ? l : null; }, [], { what: 'the tab menu' });
  await page.closeMenus();
  await page.waitFor(() => !document.querySelector('body > .menu-popup'), [], { what: 'the menu closed' });
  return m.filter((l) => /^(Show .* Beside|Mostrar .* ao Lado)$/.test(l));
};
const viewMenu = (page) => page.eval(() => window.SilinxApp.S.menus.find((m) => m.label === 'View').items().filter((x) => /^Show .* Beside$/.test(x?.label || '')).map((x) => x.label));
// the Symbol Info of the placed symbol S1 (F1): its sections' titles, whether it has HDL, its note
const symbolInfo = async (page) => {
  await page.click(`${ED} g.sym[data-id="S1"] .hitbox`);
  await page.key('F1');
  await page.waitFor((d) => document.querySelector(d)?.dataset.type === 'mux4', [DLG], { what: 'the M4_1 datasheet' });
  const r = await page.eval((d) => {
    const b = document.querySelector(d);
    return { titles: [...b.querySelectorAll('.sd-main h3')].map((x) => x.textContent), hdl: !!b.querySelector('.sd-hdl, .sd-code, [data-lang]'), note: b.querySelector('.sd-side .sd-note')?.textContent };
  }, DLG);
  await page.click(`${DLG} [data-act=close]`);
  await page.waitFor((d) => !document.querySelector(d), [DLG]);
  return r;
};
const warnings = async (page) => (await page.consoleText()).split('\n').filter((l) => /WARNING|ERROR/.test(l));

uiTest('#3891 a design project: Symbol Info without Equivalent HDL, the tabs\' menus and View without Show VHDL / Verilog Beside; Portuguese; no warnings', E, async (page) => {
  const doc = newDoc('mux', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'mux4', x: 300, y: 300, rot: 0, mirror: false, name: 'U1', params: { width: 1, en: false, selBus: false } });
  await makeProject(env, { name: 'DrawnNoHdl', kind: 'design', files: { 'src/mux.sch.json': JSON.stringify(doc), 'src/traffic.fsm.json': FSM }, top: 'traffic' });
  await page.openProject('DrawnNoHdl');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/traffic.vhd'] === 'src/traffic.fsm.json' && document.documentElement.dataset.projectKind === 'design', [], { what: 'the design project' });

  // Symbol Info: its description, pins, parameters and truth table; no HDL
  await page.eval(() => window.SilinxApp.openSch('src/mux.sch.json'));
  await page.waitFor((sel) => window.Silinx.active?.id === 'sch:src/mux.sch.json' && document.querySelector(`${sel} g.sym[data-id="S1"]`), [ED], { what: 'the schematic' });
  assert.deepEqual(await symbolInfo(page), { titles: ['Description', 'Pins', 'Parameters and attributes', 'Truth table'], hdl: false,
    note: 'Change the parameters to see the tables update (the placed symbol is not changed).' });
  // a schematic's tab: no view beside (its HDL and its translation were its only ones)
  assert.deepEqual(await beside(page, 'mux.sch.json'), []);
  assert.deepEqual(await viewMenu(page), []);
  // a state diagram's: its ASM chart, no HDL
  await page.eval(() => window.SilinxApp.openFile('src/traffic.fsm.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/traffic.fsm.json', [], { what: 'the state diagram' });
  assert.deepEqual(await beside(page, 'traffic.fsm.json'), ['Show ASM Chart Beside']);
  assert.deepEqual(await viewMenu(page), ['Show ASM Chart Beside']);

  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    assert.deepEqual(await beside(page, 'traffic.fsm.json'), ['Mostrar o Fluxograma ASM ao Lado']);
    await page.eval(() => window.SilinxApp.openSch('src/mux.sch.json'));
    await page.waitFor(() => window.Silinx.active?.id === 'sch:src/mux.sch.json', [], { what: 'the schematic' });
    assert.deepEqual(await symbolInfo(page), { titles: ['Descrição', 'Pinos', 'Parâmetros e atributos', 'Tabela de verdade'], hdl: false,
      note: 'Altere os parâmetros para ver as tabelas atualizarem (o símbolo colocado não é alterado).' });
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  assert.deepEqual(await warnings(page), []);
});
