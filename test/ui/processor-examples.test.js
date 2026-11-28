// UI: the processor boards' examples in New Project (#5874: core/examples.js PROCESSOR_EXAMPLES, web/js/processor-new.js):
// the Board card's Board Type chooses Start from's examples (FPGA's the FPGA boards', each processor's its own: the
// Explorer 16/32's the FPGA examples' designs, the others none yet); an example chosen, its summary; Finish: the project
// made and opened, its board, its program opened, the console's line; each of the Explorer's examples made; in
// Portuguese. Both interfaces, no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';
import { PROCESSOR_EXAMPLES } from '../../core/examples.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const L = {
  en: { next: 'Next >', finish: 'Finish', cancel: 'Cancel', file: 'File', item: 'New Project…' },
  pt: { next: 'Seguinte >', finish: 'Concluir', cancel: 'Cancelar', file: 'Ficheiro', item: 'Novo Projeto…' },
};
const warnings = async page => (await page.consoleText()).split('\n').filter(l => /WARNING|ERROR|AVISO|ERRO/.test(l));
const START = '.dlg-overlay .wiz-main select';
// Start from's options offered: their values, or their texts
const startFrom = (page, what = 'value') => page.eval((s, w) => [...document.querySelector(s).options].filter(o => !o.hidden).map(o => (w === 'value' ? o.value : o.textContent)), START, what);
const shownLabels = page => page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid > label')].filter(l => l.style.display !== 'none').map(l => l.textContent));
// New Project up to its name page, the Board card's Board Type `type`
async function toName(page, type, l = L.en) {
  await page.menu(l.file, l.item).catch(() => page.menu(l.file, L.en.item));
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .kind-cards'), [], { what: 'New Project' });
  await page.fill('.dlg-overlay .board-type', type);
  await page.dialogButton(l.next);
  await page.waitFor(s => !!document.querySelector(s), [START], { what: 'its name page' });
}
const cancel = async (page, l = L.en) => { await page.dialogButton(l.cancel); await page.waitNoDialog(); };
// the project `name` made from the Explorer 16/32's `example`, opened, its program's tab `tab` open
async function make(page, { name, example, tab, l = L.en }) {
  await toName(page, 'pic24', l);
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.fill(START, example);
  await page.dialogButton(l.next);
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay .wiz-main select').length > 6, [], { what: 'Project Settings' });
  const labels = await shownLabels(page);
  await page.dialogButton(l.next);
  const summary = await page.eval(() => document.querySelector('.dlg-overlay pre').textContent);
  await page.dialogButton(l.finish);
  await page.waitNoDialog();
  await page.waitFor(n => window.Silinx.project?.name === n && document.querySelector('#hier .row'), [name], { what: `${name} open` });
  await page.waitFor(t => [...document.querySelectorAll('.tab, .doc-tab')].some(x => x.textContent.includes(t)), [tab], { what: `its ${tab} open` });
  return { labels, summary, project: await page.eval(() => window.Silinx.project) };
}

uiTest('#5874 New Project: Start from\'s examples by Board Type: the FPGA\'s; the Explorer 16/32\'s the FPGA examples\' designs; the other processors\' none yet', E, async (page) => {
  await toName(page, 'fpga');
  const fpga = await startFrom(page);
  assert.ok(fpga.includes('gates') && fpga.includes('lock') && !fpga.some(v => /-pic24$/.test(v) || v === 'uart-avr'), fpga.join());
  await cancel(page);
  for (const [type, names] of Object.entries(PROCESSOR_EXAMPLES)) {
    await toName(page, type);
    assert.deepEqual(await startFrom(page), ['empty', ...names], type);
    assert.deepEqual(await startFrom(page, 'text'), ['Empty project', ...names.map(n => `Example: ${n}`)]);
    await cancel(page);
  }
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5874 New Project from clock-pic24: its summary, the project on the Explorer 16/32, its assembly opened, the console\'s line', E, async (page) => {
  const r = await make(page, { name: 'ClockEx', example: 'clock-pic24', tab: 'clock.asm' });
  assert.deepEqual(r.labels, ['Evaluation Development Board:']);
  assert.equal(r.summary, 'Project Navigator will create a new project with the following specifications.\n\n'
    + 'Project:\n  Project Name: ClockEx\n  Template:     clock-pic24\n  Mode:         Board\n\nBoard:\n  Board:        Explorer 16/32\n  Processor:    PIC24FJ1024GB610');
  assert.deepEqual([r.project.board, r.project.profile], ['explorer-1632', 'embedded']);
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].map(e => e.textContent).join() === 'ClockEx,pic,clock.hex,clock.asm', [], { what: 'its rows' });
  assert.ok((await page.consoleText()).includes('Board project \'ClockEx\' made from the example clock-pic24 for the Explorer 16/32: its firmware pic/clock.hex.'));
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5874 New Project from each of the Explorer 16/32\'s other examples: blinky, traffic, stopwatch, lock', E, async (page) => {
  for (const d of ['blinky', 'traffic', 'stopwatch', 'lock']) {
    const r = await make(page, { name: `${d}Ex`, example: `${d}-pic24`, tab: `${d}.asm` });
    assert.equal(r.project.board, 'explorer-1632', d);
    assert.ok((await page.consoleText()).includes(`Board project '${d}Ex' made from the example ${d}-pic24 for the Explorer 16/32: its firmware pic/${d}.hex.`), d);
  }
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5874 in Portuguese: Start from\'s examples, the summary\'s template, the console\'s line', E, async (page) => {
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await toName(page, 'pic24', L.pt);
    assert.deepEqual(await startFrom(page, 'text'), ['Projeto vazio', ...PROCESSOR_EXAMPLES.pic24.map(n => `Exemplo: ${n}`)]);
    await cancel(page, L.pt);
    const r = await make(page, { name: 'LockPt', example: 'lock-pic24', tab: 'lock.asm', l: L.pt });
    assert.ok(r.summary.includes('lock-pic24'), r.summary);
    await page.waitFor(() => /Projeto Placa 'LockPt' criado a partir do exemplo lock-pic24 para a Explorer 16\/32: o seu firmware pic\/lock\.hex\./.test(window.__console()), [], { what: 'its line' });
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  assert.deepEqual(await warnings(page), []);
});
