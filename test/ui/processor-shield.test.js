// UI: a processor board's shield (#5898, web/js/processor-shield-ui.js, core/processor-shield.js): a Pico's Board project's
// board row offers Add Shield; run, its circuit written and opened in the Circuit editor, the Pico drawn on it, the line in
// the console; the Design pane's top row still the board, the shield's row under it; Add Shield gone; Emulate Node runs
// the board with its shield (its circuit in the System Emulator). The Explorer 16/32 none. In Portuguese. Both
// interfaces, no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const warnings = async page => (await page.consoleText()).split('\n').filter(l => /^(WARNING|ERROR|AVISO|ERRO)/.test(l.trim()));
const procs = page => page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].map(l => l.textContent.trim()).filter(t => !/^(Design Summary\/Reports|Resumo do Projeto\/Relatórios)$/.test(t)));
const rows = page => page.eval(() => [...document.querySelectorAll('#hier .row .lbl')].map(e => e.textContent));
// a processor board's Board project made as New Project makes it, opened
async function made(page, name, board) {
  await page.eval(async (n, b) => (await import('/js/processor-new.js')).createProcessorProject(n, b, 'micropython'), name, board);
  await page.leftTab('design');
  await page.waitFor(n => window.Silinx.project?.name === n && document.querySelector('#hier .row'), [name], { what: `${name} open` });
}
// the board's row selected, its processes shown (`has` among them)
async function boardRow(page, node, has) {
  await page.treeRow('#hier', node, { exact: true });
  await page.waitFor(h => [...document.querySelectorAll('#procs .row .lbl')].some(l => l.textContent.trim() === h), [has], { what: `${node}'s processes` });
}

uiTest('#5898 a Pico\'s Board project: Add Shield, its circuit opened with the Pico drawn, the shield\'s row under the board; Emulate Node runs both', E, async (page) => {
  await made(page, 'PicoS', 'pico');
  await boardRow(page, 'pico', 'Add Shield');
  assert.deepEqual(await procs(page), ['View/Edit System', 'Program Node', 'Add Shield', 'Simulate Node', 'Emulate Node']);
  await page.treeRow('#procs', 'Add Shield', { exact: true, dbl: true });
  await page.waitFor(() => [...document.querySelectorAll('.tab, .doc-tab')].some(t => /shield\.circ\.json/.test(t.textContent)), [], { what: 'the shield open' });
  await page.waitConsole(/PicoS: a shield for its Raspberry Pi Pico, shield\/shield\.circ\.json: wire its buttons, switches, displays and LEDs to the board's pins; Emulate Node runs the board with it\./);
  // (the Pico drawn as a part of the circuit: its silkscreen)
  await page.waitFor(() => [...document.querySelectorAll('.circ-board-art text')].some(t => t.textContent === 'Raspberry Pi Pico'), [], { what: 'the Pico drawn' });
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some(e => e.textContent === 'shield'), [], { what: 'the shield\'s row' });
  // (the board's row, its program; the shield's node's row, its circuit's module and its file, as a System's circuit node in
  // its folder)
  assert.deepEqual(await rows(page), ['PicoS', 'pico', 'main.py', 'shield', 'shield', 'shield.circ.json']);
  // (no second shield)
  await boardRow(page, 'pico', 'Emulate Node');
  assert.ok(!(await procs(page)).includes('Add Shield'));
  // (Emulate Node: the board with its shield, the circuit drawn in the System Emulator)
  await page.treeRow('#procs', 'Emulate Node', { exact: true, dbl: true });
  await page.waitFor(() => !!document.querySelector('.sys-emu-circuit[data-node="shield"]'), [], { what: 'the shield emulated', timeout: 60000 });
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5898 the Explorer 16/32 has no Add Shield (its own buttons and display)', E, async (page) => {
  await made(page, 'ExpS', 'explorer-1632');
  await boardRow(page, 'pic', 'Emulate Node');
  assert.ok(!(await procs(page)).includes('Add Shield'));
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5898 in Portuguese: Add Shield, the console\'s line', E, async (page) => {
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await made(page, 'UnoPt', 'arduino-uno');
    await boardRow(page, 'uno', 'Adicionar Shield');
    await page.treeRow('#procs', 'Adicionar Shield', { exact: true, dbl: true });
    await page.waitFor(() => /UnoPt: um shield para a sua Arduino Uno, shield\/shield\.circ\.json: ligue os seus botões, interruptores, mostradores e LEDs aos pinos da placa; o Emular o Nó corre a placa com ele\./.test(window.__console()), [], { what: 'its line' });
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  assert.deepEqual(await warnings(page), []);
});
