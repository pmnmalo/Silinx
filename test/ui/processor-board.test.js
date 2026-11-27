// UI: a Board project for a processor board alone (#5756, roadmap #5753: web/js/processor-new.js, core/processor-board.js):
// New Project's Board card, its board list's processor boards; a Pico chosen, the FPGA's fields hidden, its Python firmware
// shown; the summary; Finish: the project made and opened, its starter firmware open, the Design pane's top row its board
// (no System row), the board's processes (Emulate Node…), the console's line; an Arduino, its blink's source opened; in
// Portuguese. Both interfaces, no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const L = {
  en: { next: 'Next >', finish: 'Finish', cancel: 'Cancel', file: 'File', item: 'New Project…' },
  pt: { next: 'Seguinte >', finish: 'Concluir', cancel: 'Cancelar', file: 'Ficheiro', item: 'Novo Projeto…' },
};
const warnings = async page => (await page.consoleText()).split('\n').filter(l => /WARNING|ERROR/.test(l));
const shownLabels = page => page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid > label')].filter(l => l.style.display !== 'none').map(l => l.textContent));
// the Board card's Board Type: shown, its options (its value, its text)
const typeRow = page => page.eval(() => { const r = document.querySelector('.dlg-overlay .board-type-row'); return { shown: r.style.display !== 'none', label: r.firstChild.textContent, types: [...r.querySelectorAll('option')].map(o => [o.value, o.textContent]) }; });
const TYPES = [['fpga', 'FPGA'], ['avr', 'Arduino'], ['pic24', 'PIC24'], ['rp2040', 'Raspberry Pi Pico'], ['esp32', 'ESP32']];
// the board list's options offered on the settings page
const offered = async page => {
  await page.waitFor(() => [...document.querySelectorAll('.dlg-overlay .form-grid > label')].some(l => ['Evaluation Development Board:', 'Placa de Desenvolvimento:'].includes(l.textContent)), [], { what: 'Project Settings' });
  return page.eval(() => [...[...document.querySelectorAll('.dlg-overlay .form-grid > label')].find(l => ['Evaluation Development Board:', 'Placa de Desenvolvimento:'].includes(l.textContent)).nextElementSibling.options].filter(o => !o.hidden).map(o => o.value));
};
// New Project up to its settings page, the Board card's of the Board Type `type` (`l`: the language's buttons)
async function toSettings(page, name, l, type = 'fpga') {
  await page.menu(l.file, l.item).catch(() => page.menu(l.file, L.en.item));
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .kind-cards'), [], { what: 'New Project' });
  if (type !== 'fpga') await page.fill('.dlg-overlay .board-type', type);
  await page.dialogButton(l.next);
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.dialogButton(l.next);
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay .wiz-main select').length > 6, [], { what: 'Project Settings' });
}
const board = (page, id) => page.fill('.dlg-overlay .wiz-main select', id);

uiTest('#5756 New Project: the Board card\'s Board Type; a Raspberry Pi Pico alone, its fields, its summary; its Board project opened, its board the top row', E, async (page) => {
  // (the Board card's Board Type: shown while Board is chosen, FPGA first; hidden for Circuit)
  await page.menu('File', 'New Project…');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .kind-cards'), [], { what: 'New Project' });
  assert.deepEqual(await typeRow(page), { shown: true, label: 'Board Type:', types: TYPES });
  await page.click('.dlg-overlay .kind-card[data-mode=circuit] input');
  assert.equal((await typeRow(page)).shown, false);
  await page.click('.dlg-overlay .kind-card[data-mode=board] input');
  assert.equal((await typeRow(page)).shown, true);
  // (FPGA: the FPGA boards, no processor's)
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'PicoB');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay .wiz-main select').length > 6, [], { what: 'Project Settings' });
  assert.ok((await offered(page)).includes('basys2') && !(await offered(page)).some(v => ['pico', 'arduino-uno'].includes(v)));
  // (back to the Board Type, Raspberry Pi Pico: the Picos alone, the first chosen; the FPGA's fields hidden; its examples,
  // #5874: test/ui/processor-examples.test.js)
  await page.dialogButton('< Back');
  await page.dialogButton('< Back');
  await page.fill('.dlg-overlay .board-type', 'rp2040');
  await page.dialogButton('Next >');
  assert.deepEqual(await page.eval(() => [...document.querySelector('.dlg-overlay .wiz-main select').options].filter(o => !o.hidden).map(o => o.value)), ['empty', 'blinky-pico', 'counter-pico', 'echo-pico']);
  await page.dialogButton('Next >');
  assert.deepEqual(await offered(page), ['pico', 'pico-w']);
  assert.deepEqual(await shownLabels(page), ['Evaluation Development Board:', 'Python Firmware:']);
  await page.dialogButton('Next >');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay pre').textContent), 'Project Navigator will create a new project with the following specifications.\n\n'
    + 'Project:\n  Project Name: PicoB\n  Mode:         Board\n\nBoard:\n  Board:        Raspberry Pi Pico\n  Processor:    RP2040\n\nFirmware:\n  Starter:      pico/main.py\n  Python:       MicroPython');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'PicoB' && document.querySelector('#hier .row'), [], { what: 'PicoB open' });
  const pj = await page.eval(() => window.Silinx.project);
  assert.deepEqual([pj.board, pj.profile, pj.top], ['pico', 'embedded', '']);
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].map(e => e.textContent).join() === 'PicoB,pico,main.py', [], { what: 'its rows' });
  // (its firmware open; its board's row: its processes)
  await page.waitFor(() => [...document.querySelectorAll('.tab, .doc-tab')].some(t => /main\.py/.test(t.textContent)), [], { what: 'its main.py open' });
  await page.treeRow('#hier', 'pico');
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some(e => e.textContent === 'Emulate Node'), [], { what: 'its processes' });
  assert.ok((await page.consoleText()).includes('Board project \'PicoB\' made for the Raspberry Pi Pico: its firmware pico/main.py, which blinks its LED.'));
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5756 New Project: an Arduino Uno alone (the Arduino type: its two boards), its blink\'s source opened; an ESP32\'s type its one board', E, async (page) => {
  await toSettings(page, 'UnoB', L.en, 'avr');
  assert.deepEqual(await offered(page), ['arduino-uno', 'arduino-nano']);
  assert.deepEqual(await shownLabels(page), ['Evaluation Development Board:']);
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'UnoB' && [...document.querySelectorAll('#hier .row .lbl')].some(e => e.textContent === 'uno'), [], { what: 'UnoB open' });
  await page.waitFor(() => [...document.querySelectorAll('.tab, .doc-tab')].some(t => /blink\.asm/.test(t.textContent)), [], { what: 'its blink.asm open' });
  assert.deepEqual(await warnings(page), []);
  // (an ESP32's: its one board)
  await page.menu('File', 'New Project…');
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .kind-cards'), [], { what: 'New Project' });
  await page.fill('.dlg-overlay .board-type', 'esp32');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'EspB');
  await page.dialogButton('Next >');
  assert.deepEqual(await offered(page), ['esp32-devkitc']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
});

uiTest('#5756 in Portuguese: the Board Type, the Python firmware\'s label, the console\'s line', E, async (page) => {
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.menu(L.pt.file, L.pt.item).catch(() => page.menu(L.pt.file, L.en.item));
    await page.waitFor(() => !!document.querySelector('.dlg-overlay .kind-cards'), [], { what: 'Novo Projeto' });
    assert.deepEqual(await typeRow(page), { shown: true, label: 'Tipo de Placa:', types: TYPES });
    await page.dialogButton(L.pt.cancel);
    await page.waitNoDialog();
    await toSettings(page, 'PicoPt', L.pt, 'rp2040');
    assert.deepEqual(await shownLabels(page), ['Placa de Desenvolvimento:', 'Firmware Python:']);
    // (a Pico W: MicroPython alone, no firmware to choose)
    await board(page, 'pico-w');
    assert.deepEqual(await shownLabels(page), ['Placa de Desenvolvimento:']);
    await page.dialogButton(L.pt.next);
    await page.dialogButton(L.pt.finish);
    await page.waitNoDialog();
    await page.waitFor(() => window.Silinx.project?.name === 'PicoPt', [], { what: 'PicoPt open' });
    await page.waitFor(() => /Projeto Placa 'PicoPt' criado para a Raspberry Pi Pico W: o seu firmware picow\/main\.py, que faz piscar o seu LED\./.test(window.__console()), [], { what: 'its line' });
    assert.ok((await page.consoleText()).includes('Projeto "PicoPt" aberto (a placa Raspberry Pi Pico W).'));
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  assert.deepEqual(await warnings(page), []);
});
