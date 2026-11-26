// UI (#5215): a circuit as a node of the System, in the uart-avr example's project with a circuit of its own (the Uno,
// labelled uno, an LED from its D8 to its GND). The System editor's Circuit tool places a circuit node, its circuit the
// project's .circ.json (its box's second line, its Properties' Circuit); saved: its check's lines; Check: the example's
// warning only (the Uno joins something); Try it: the Uno shows each byte the FPGA echoes on D8..D13, the LED on D8 lit and dark, its line in the
// console when the run stops. Portuguese; both interfaces; no other warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const BENCH = { format: 'silinx-circuit', version: 1, name: 'bench', lang: 'vhdl',
  parts: [{ id: 'A1', type: 'arduino-uno', x: 0, y: 0, label: 'uno' }, { id: 'D1', type: 'led', x: 9, y: -4, color: 'green' }],
  wires: [{ id: 'w1', points: [[9, 0], [9, -4]], color: 'blue' }, { id: 'w2', points: [[10, -4], [3, 0]], color: 'black' }] };
const consoleLines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent.trim()).filter(Boolean));
const HOT = 'WARNING: serial: uno\'s D1, a 5 V output, drives fpga\'s rx (pin J3), a 3.3 V input of the FPGA (LVCMOS33): a level shifter or a divider on the real boards';

uiTest('#5215 a circuit node: placed with the project\'s circuit, its Properties (its SPI clock, #5384), checked, tried (the LED on the Uno\'s D8); Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CoCirc', template: 'uart-avr', files: { 'circuit/bench.circ.json': JSON.stringify(BENCH, null, 2) } });
  await page.openProject('CoCirc');
  await page.eval(() => window.SilinxApp.openFile('uart_avr.sys.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-add-circuit`), [ED], { what: 'the System editor' });
  // the Circuit tool, a click on the canvas: a circuit node with the project's circuit
  const canvas = await page.eval((ed) => { const r = document.querySelector(`${ed} .sys-canvas`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, ED);
  await page.click(`${ED} .sys-add-circuit`);
  await page.click({ x: canvas.x + canvas.w * 0.45, y: canvas.y + canvas.h * 0.8 });
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-node[data-id="circuit"]`), [ED], { what: 'the circuit node' });
  assert.deepEqual((await page.eval(() => window.Silinx.active.systemEditor.getModel().nodes.at(-1))).circuit, 'circuit/bench.circ.json');
  // saved now (else 800 ms after the edit, its check's lines then, docs/SYSTEMS.md: any time later on a slow runner)
  await page.eval(() => window.SilinxApp.saveAll());
  await page.waitFor(() => !window.SilinxApp.findDoc('sys:uart_avr.sys.json').dirty && [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent.trim() === 'Process "Check System" completed successfully with 1 warning(s)'), [], { what: 'saved, checked' });
  assert.equal(await page.eval((ed) => [...document.querySelectorAll(`${ed} .sys-node[data-id="circuit"] text`)].map((t) => t.textContent).join(' | '), ED), 'circuit | bench.circ.json | no interface');
  // its Properties: its circuit
  await page.click(`${ED} .sys-node[data-id="circuit"] .sys-head`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-selection h3`)?.textContent === 'Circuit circuit', [ED], { what: 'its properties' });
  assert.deepEqual(await page.eval((ed) => { const s = document.querySelector(`${ed} .sys-circuit`); return [s.value, [...s.options].map((o) => o.value)]; }, ED), ['circuit/bench.circ.json', ['', 'circuit/bench.circ.json']]);
  // its SPI clock (#5384): empty (3.125 MHz, its SPI parts'), set, then emptied again (this circuit has no SPI part)
  const spi = (ed) => { const i = document.querySelector(`${ed} .sys-spi-hz`); return [i.value, i.placeholder, i.closest('.asm-field').querySelector('.asm-label').textContent]; };
  assert.deepEqual(await page.eval(spi, ED), ['', '3125000', 'SPI clock (Hz)']);
  const setSpi = (v) => page.eval((ed, x) => { const i = document.querySelector(`${ed} .sys-spi-hz`); i.value = x; i.dispatchEvent(new Event('change')); }, ED, v);
  await setSpi('1000000');
  await page.waitFor(() => window.Silinx.active.systemEditor.getModel().nodes.at(-1).spiHz === 1e6, [], { what: 'its SPI clock set' });
  await setSpi('');
  await page.waitFor(() => !('spiHz' in window.Silinx.active.systemEditor.getModel().nodes.at(-1)), [], { what: 'its SPI clock emptied' });
  // (the edits saved, and checked again: the example's warning once more)
  const DONE = 'Process "Check System" completed successfully with 1 warning(s)';
  const checks = () => page.eval((d) => [...document.querySelectorAll('#console-log .ln')].filter((l) => l.textContent.trim() === d).length, DONE);
  await page.eval(() => window.SilinxApp.saveAll());
  await page.waitFor((d) => !window.SilinxApp.findDoc('sys:uart_avr.sys.json').dirty && [...document.querySelectorAll('#console-log .ln')].filter((l) => l.textContent.trim() === d).length >= 2, [DONE], { what: 'its SPI clock saved, checked' });
  // (no check still to come: its count the same for 1.5 s)
  await page.waitFor((d) => { const n = [...document.querySelectorAll('#console-log .ln')].filter((l) => l.textContent.trim() === d).length, w = window.__checks; if (!w || w.n !== n) { window.__checks = { n, t: Date.now() }; return false; } return Date.now() - w.t > 1500; }, [DONE], { timeout: 15000, what: 'no check pending' });
  const before = await checks();
  // Check: the example's warning only (the Uno reached by the circuit)
  await page.click(`${ED} .sys-check`);
  await page.waitFor((d, n) => [...document.querySelectorAll('#console-log .ln')].filter((l) => l.textContent.trim() === d).length === n + 1, [DONE, before], { what: 'Check' });
  const run = await page.eval(() => { const ls = [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent.trim()).filter(Boolean); const i = ls.lastIndexOf('Started : "Check System" of uart_avr.sys.json.'); return ls.slice(i, i + 3); });
  assert.deepEqual(run, ['Started : "Check System" of uart_avr.sys.json.', HOT, 'Process "Check System" completed successfully with 1 warning(s)']);
  // Try it, 100 ms: the LED on D8 (the bit 0 of each byte the FPGA echoes) lit and dark; its line when the run stops
  await page.click(`${ED} .sys-sim-btn`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-sim-panel:not([hidden]) .sys-run-for`), [ED], { what: 'the simulation view' });
  await page.click(`${ED} .sys-run-for`);
  await page.waitFor(() => { const s = window.Silinx.active.systemEditor.sim?.state(); return s && !s.running && s.now >= 100e9; }, [], { what: '100 ms run', timeout: 90000 });
  const s = await page.eval(() => window.Silinx.active.systemEditor.sim.state());
  assert.ok(s.circuits.circuit.D1.times >= 2, JSON.stringify(s.circuits));
  assert.deepEqual([s.warnings, s.errors], [[], []]);
  assert.deepEqual(s.traffic.filter((t) => t.link === 'circuit').map((t) => [t.wire, t.from, t.to]), [['circuit_A1_D8', 'uno.D8', 'circuit.A1:D8'], ['circuit_A1_D8_back', 'circuit.A1:D8', 'uno.D8']]);
  const lines = await consoleLines(page);
  assert.ok(lines.some((l) => /^Simulate System: circuit circuit: D1 (on|off), lit \d+ time\(s\)$/.test(l)), lines.join('\n'));
  assert.deepEqual(lines.filter((l) => /^(WARNING|ERROR)/.test(l)), Array(before + 1).fill(HOT), 'each save, then Check');
  // in Portuguese: the tool, its tip, the Properties
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-add-circuit`)?.textContent === 'Circuito', [ED], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((ed) => [document.querySelector(`${ed} .sys-add-circuit`).title, document.querySelector(`${ed} .sys-selection h3`)?.textContent], ED),
    ['Clique na tela para acrescentar um nó circuito: um circuito do projeto entre as placas, as suas placas os nós que as suas etiquetas nomeiam', 'Circuito circuit']);
  await page.click(`${ED} .sys-node[data-id="circuit"] .sys-head`);
  await page.waitFor((ed) => document.querySelector(`${ed} .sys-spi-hz`)?.closest('.asm-field').querySelector('.asm-label').textContent === 'Relógio SPI (Hz)', [ED], { what: 'its SPI clock in Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
}, { timeout: 180000 });
