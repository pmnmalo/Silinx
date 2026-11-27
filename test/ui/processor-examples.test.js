// UI: the processor boards' examples in New Project (#5874: core/examples.js PROCESSOR_EXAMPLES, web/js/processor-new.js):
// the Board card's Board Type chooses Start from's examples (FPGA's the FPGA boards', each processor's its own); an
// example chosen, on another board of its type (an Arduino's on the Nano), its summary, no Python firmware to choose for
// a Pico's; Finish: the project made and opened, its board the chosen one, its program opened, the console's line; each
// type's example made; in Portuguese. Both interfaces, no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';
import { PROCESSOR_EXAMPLES } from '../../core/examples.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const L = {
  en: { next: 'Next >', finish: 'Finish', file: 'File', item: 'New Project…' },
  pt: { next: 'Seguinte >', finish: 'Concluir', file: 'Ficheiro', item: 'Novo Projeto…' },
};
const warnings = async page => (await page.consoleText()).split('\n').filter(l => /WARNING|ERROR|AVISO|ERRO/.test(l));
const START = '.dlg-overlay .wiz-main select';
// Start from's options offered: their values
const startFrom = page => page.eval(s => [...document.querySelector(s).options].filter(o => !o.hidden).map(o => o.value), START);
const shownLabels = page => page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid > label')].filter(l => l.style.display !== 'none').map(l => l.textContent));
// New Project up to its name page, the Board card's Board Type `type`
async function toName(page, type, l = L.en) {
  await page.menu(l.file, l.item).catch(() => page.menu(l.file, L.en.item));
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .kind-cards'), [], { what: 'New Project' });
  await page.fill('.dlg-overlay .board-type', type);
  await page.dialogButton(l.next);
  await page.waitFor(s => !!document.querySelector(s), [START], { what: 'its name page' });
}
// the project made from `example` (on `board`, or its type's first), opened, its program's tab `tab` open
async function make(page, { type, name, example, board = null, tab, l = L.en }) {
  await toName(page, type, l);
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.fill(START, example);
  await page.dialogButton(l.next);
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay .wiz-main select').length > 6, [], { what: 'Project Settings' });
  if (board) await page.fill('.dlg-overlay .wiz-main select', board);
  const labels = await shownLabels(page);
  await page.dialogButton(l.next);
  const summary = await page.eval(() => document.querySelector('.dlg-overlay pre').textContent);
  await page.dialogButton(l.finish);
  await page.waitNoDialog();
  await page.waitFor(n => window.Silinx.project?.name === n && document.querySelector('#hier .row'), [name], { what: `${name} open` });
  await page.waitFor(t => [...document.querySelectorAll('.tab, .doc-tab')].some(x => x.textContent.includes(t)), [tab], { what: `its ${tab} open` });
  return { labels, summary, project: await page.eval(() => window.Silinx.project) };
}

uiTest('#5874 New Project: Start from\'s examples by Board Type: the FPGA\'s, then each processor\'s own', E, async (page) => {
  await toName(page, 'fpga');
  const fpga = await startFrom(page);
  assert.ok(fpga.includes('gates') && fpga.includes('lock') && !fpga.some(v => /-(arduino|pic24|pico|esp32)$/.test(v) || v === 'uart-avr'), fpga.join());
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  for (const [type, names] of Object.entries(PROCESSOR_EXAMPLES)) {
    await toName(page, type);
    assert.deepEqual(await startFrom(page), ['empty', ...names], type);
    assert.deepEqual(await page.eval(s => [...document.querySelector(s).options].filter(o => !o.hidden).map(o => o.textContent), START), ['Empty project', ...names.map(n => `Example: ${n}`)]);
    await page.dialogButton('Cancel');
    await page.waitNoDialog();
  }
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5874 New Project from blinky-arduino on the Nano: its summary, the project on the Nano, its sketch opened, the console\'s line', E, async (page) => {
  const r = await make(page, { type: 'avr', name: 'BlinkNano', example: 'blinky-arduino', board: 'arduino-nano', tab: 'blink.ino' });
  assert.deepEqual(r.labels, ['Evaluation Development Board:']);
  assert.equal(r.summary, 'Project Navigator will create a new project with the following specifications.\n\n'
    + 'Project:\n  Project Name: BlinkNano\n  Template:     blinky-arduino\n  Mode:         Board\n\nBoard:\n  Board:        Arduino Nano\n  Processor:    ATmega328P');
  assert.deepEqual([r.project.board, r.project.profile], ['arduino-nano', 'embedded']);
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].map(e => e.textContent).join() === 'BlinkNano,uno,blink.hex,blink.ino', [], { what: 'its rows' });
  assert.ok((await page.consoleText()).includes('Board project \'BlinkNano\' made from the example blinky-arduino for the Arduino Nano: its firmware uno/blink.hex.'));
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5874 New Project from each other type\'s example: adc-pic24 (its assembly opened), echo-pico (no Python firmware to choose), counter-esp32', E, async (page) => {
  const pic = await make(page, { type: 'pic24', name: 'AdcEx', example: 'adc-pic24', tab: 'adc.asm' });
  assert.deepEqual([pic.project.board, pic.labels], ['explorer-1632', ['Evaluation Development Board:']]);
  const pico = await make(page, { type: 'rp2040', name: 'EchoEx', example: 'echo-pico', tab: 'main.py' });
  assert.deepEqual([pico.project.board, pico.labels, pico.project.system], ['pico', ['Evaluation Development Board:'], { simulate: { stimulus: 'echo.stim.json', ms: 600 } }]);
  assert.ok(!pico.summary.includes('Python:'), pico.summary);
  const esp = await make(page, { type: 'esp32', name: 'CountEx', example: 'counter-esp32', tab: 'main.py' });
  assert.equal(esp.project.board, 'esp32-devkitc');
  const text = await page.consoleText();
  for (const l of ['Board project \'AdcEx\' made from the example adc-pic24 for the Explorer 16/32: its firmware pic/adc.hex.', 'Board project \'EchoEx\' made from the example echo-pico for the Raspberry Pi Pico: its firmware pico/main.py.',
    'Board project \'CountEx\' made from the example counter-esp32 for the ESP32 DevKitC: its firmware esp32/main.py.']) assert.ok(text.includes(l), l);
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5874 in Portuguese: Start from\'s examples, the summary\'s template, the console\'s line', E, async (page) => {
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await toName(page, 'pic24', L.pt);
    assert.deepEqual(await page.eval(s => [...document.querySelector(s).options].filter(o => !o.hidden).map(o => o.textContent), START), ['Projeto vazio', ...PROCESSOR_EXAMPLES.pic24.map(n => `Exemplo: ${n}`)]);
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
    const r = await make(page, { type: 'pic24', name: 'ContaPt', example: 'counter-pic24', tab: 'counter.asm', l: L.pt });
    assert.ok(r.summary.includes('counter-pic24'), r.summary);
    await page.waitFor(() => /Projeto Placa 'ContaPt' criado a partir do exemplo counter-pic24 para a Explorer 16\/32: o seu firmware pic\/counter\.hex\./.test(window.__console()), [], { what: 'its line' });
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  assert.deepEqual(await warnings(page), []);
});
