// UI (#5451): a rotary encoder (KY-040) in the Circuit editor: the Parts panel's Inputs list it; drawn with its board, its
// header's pins (CLK, DT, SW, +, GND) and its knob; Try it: ↻ and ↺ turn it a detent (its quadrature on CLK and DT, each
// on a probe, back high at the detent; its knob's mark 18° on), its knob held down pushes its switch (SW pulled up, on a
// probe: low while held); Check; its Part info, in Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const CIRC = { format: 'silinx-circuit', version: 1, name: 'enc', lang: 'vhdl',
  // (its probes and its switch's pull-up under it, its knob clear)
  parts: [{ id: 'P1', type: 'supply', x: -4, y: 0 }, { id: 'ENC1', type: 'rotary-encoder', x: 0, y: 10 }, { id: 'R1', type: 'pull-up', x: 5, y: 17 },
    { id: 'PA', type: 'probe', x: 0, y: 15, label: 'A' }, { id: 'PB', type: 'probe', x: 1, y: 15, label: 'B' }, { id: 'PS', type: 'probe', x: 2, y: 15, label: 'S' }],
  wires: [{ id: 'g', points: [[4, 10], [-4, 1]], color: 'black' }, { id: 'a', points: [[0, 10], [0, 15]], color: 'blue' }, { id: 'b', points: [[1, 10], [1, 15]], color: 'blue' },
    { id: 's', points: [[2, 10], [2, 15]], color: 'blue' }, { id: 't', points: [[2, 15], [5, 17]], color: 'blue' }] };
const at = (page, sel) => page.eval((ed, s) => { const r = document.querySelector(`${ed} .circ-canvas [data-id=ENC1] ${s}`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ED, sel);
const probes = (page) => page.eval(() => Object.values(window.Silinx.active.circuitEditor.sim().probes()).join(''));
const mark = (page) => page.eval((ed) => document.querySelector(`${ed} .circ-canvas [data-id=ENC1] .circ-enc-mark`).getAttribute('transform'), ED);

uiTest('#5451 Circuit editor: a rotary encoder turned with ↻ and ↺ in Try it, its knob pushed; Check; its Part info in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircEnc', top: '', files: { 'src/enc.circ.json': JSON.stringify(CIRC, null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircEnc');
  await page.eval(() => window.SilinxApp.openFile('src/enc.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-canvas [data-id=ENC1]`), [ED], { what: 'the circuit editor' });
  await page.eval(() => window.Silinx.active.circuitEditor.fit());
  // the Parts panel's Inputs: the encoder after the keypad
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="rotary-encoder"]`)?.textContent, ED), 'Rotary encoder (KY-040)');
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .circ-canvas [data-id=ENC1] .circ-enc-pin`)].map((t) => t.textContent).join(' '), ED), 'CLK DT SW + GND');
  await page.click(`${ED} .circ-check`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /^Process "Check Circuit" completed successfully$/.test(l.textContent)), [], { what: 'Check' });
  // Try it: at its detent CLK, DT and SW high (pulled up)
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'trying it' });
  await page.waitFor(() => window.Silinx.active.circuitEditor.sim()?.probes().PS === '1', [], { what: 'the probes' });
  assert.equal(await probes(page), '111');
  assert.equal(await mark(page), 'rotate(0 40 88)');
  // ↻: a detent clockwise, CLK and DT high again, its knob 18° on; ↺ twice: -18°
  const cw = await at(page, '[data-input=enc-cw] circle');
  await page.mouse('mouseMoved', cw.x, cw.y); await page.mouse('mousePressed', cw.x, cw.y); await page.mouse('mouseReleased', cw.x, cw.y);
  await page.waitFor((ed) => /^rotate\(18 /.test(document.querySelector(`${ed} .circ-canvas [data-id=ENC1] .circ-enc-mark`).getAttribute('transform')), [ED], { what: 'turned clockwise' });
  assert.equal(await probes(page), '111');
  assert.deepEqual(await page.eval(() => window.Silinx.active.circuitEditor.sim().time), 4000000);
  const ccw = await at(page, '[data-input=enc-ccw] circle');
  for (let i = 0; i < 2; i++) { await page.mouse('mouseMoved', ccw.x, ccw.y); await page.mouse('mousePressed', ccw.x, ccw.y); await page.mouse('mouseReleased', ccw.x, ccw.y); }
  await page.waitFor((ed) => /^rotate\(-18 /.test(document.querySelector(`${ed} .circ-canvas [data-id=ENC1] .circ-enc-mark`).getAttribute('transform')), [ED], { what: 'turned back' });
  // its knob held down: SW low, drawn down; let go: high
  const knob = await at(page, '.circ-enc-knob circle');
  await page.mouse('mouseMoved', knob.x, knob.y); await page.mouse('mousePressed', knob.x, knob.y);
  await page.waitFor(() => window.Silinx.active.circuitEditor.sim().probes().PS === '0', [], { what: 'SW low while held' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-canvas [data-id=ENC1] .circ-enc-knob`).classList.contains('down'), ED), true);
  await page.mouse('mouseReleased', knob.x, knob.y);
  await page.waitFor(() => window.Silinx.active.circuitEditor.sim().probes().PS === '1', [], { what: 'SW high again' });
  await page.key('Escape');
  await page.waitFor((ed) => !document.querySelector(ed).classList.contains('circ-simulating'), [ED], { what: 'stopped' });
  // its Part info, in Portuguese
  await page.eval(() => window.Silinx.active.circuitEditor.select({ kind: 'part', id: 'ENC1' }));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-info .circ-note`), [ED], { what: 'ENC1 selected' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /^Um módulo codificador rotativo \(KY-040\)/.test(document.querySelector(`${ed} .circ-selection .circ-info .circ-note`)?.textContent), [ED], { what: 'Portuguese' });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="rotary-encoder"]`)?.textContent, ED), 'Codificador rotativo (KY-040)');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual((await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent))).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
