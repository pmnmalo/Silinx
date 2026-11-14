// UI: the logic probe and the waveforms of a circuit (#3900): a probe shows its tip's level while trying it (H, L);
// Waveforms opens the Try it in SSim, the waveform viewer of every simulation (web/js/circuit-waves.js): the circuit's
// HDL run by the session's replay, the probe's net among its waves, its changes those of the session; in Portuguese.
// No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newCircuit } from '../../core/circuit.js';
import * as E from '../../core/circuit-edit.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const ED = '.doc:not([hidden]) .circuit-editor';

// a 7404 on f5, its 1A from the switch a, its 1Y watched by the probe y
function inverter() {
  let m = newCircuit('inv');
  for (const [f, a] of [['addPart', { type: '7404', at: 'BB1.f5' }], ['addWire', { from: 'U1.14', to: 'BB1.tp5' }], ['addWire', { from: 'U1.7', to: 'BB1.bn11' }],
    ['addWire', { from: 'BB1.tn2', to: 'BB1.bn2', via: [[-2, -3], [-2, 14]] }], ['addPart', { type: 'logic-switch', at: [-6, 9], label: 'a' }], ['addWire', { from: 'S1.out', to: 'U1.1' }],
    ['addPart', { type: 'probe', at: [6, 20], label: 'y' }], ['addWire', { from: 'U1.2', to: 'LP1.tip' }]]) {
    const r = E[f](m, a);
    if (r.error) throw new Error(`${f}: ${r.error}`);
    m = r.model;
  }
  return m;
}
const probeText = (page) => page.eval((ed) => document.querySelector(`${ed} [data-id=LP1] .circ-probe-text`).textContent, ED);

uiTest('Circuit editor: a logic probe shows its level; Waveforms opens the Try it in SSim, the probe\'s net among its waves; Portuguese', () => env, async (page) => {
  await makeProject(env, { name: 'WavePj', top: '', files: { 'src/inv.circ.json': JSON.stringify(inverter(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('WavePj');
  await page.eval(() => window.SilinxApp.openFile('src/inv.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=LP1]`), [ED], { what: 'the probe drawn' });
  assert.equal(await probeText(page), '', 'not trying it: no level');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-waves`).disabled, ED), true, 'Waveforms: nothing tried yet');
  await page.click(`${ED} .circ-sim-btn`);
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=LP1] .circ-probe-text`)?.textContent === 'H', [ED], { what: 'H: the inverter\'s 1' });
  const sw = await page.eval((ed) => { const r = document.querySelector(`${ed} [data-id=S1] .circ-sw-body`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, ED);
  await page.click(sw);
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=LP1] .circ-probe-text`).textContent === 'L', [ED], { what: 'L once a is on' });
  await page.click(sw);
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=LP1] .circ-probe-text`).textContent === 'H', [ED], { what: 'H again' });
  // Waveforms: SSim, the session replayed
  await page.click(`${ED} .circ-waves`);
  await page.waitFor(() => window.Silinx.active?.id === 'circwave:src/inv.circ.json' && window.Silinx.active.view?.getState().rows.length && !window.Silinx.active.view.state?.running, [], { what: 'the waveforms in SSim', timeout: 30000 });
  await page.waitFor(() => window.Silinx.active.view.state.rows.some((r) => r.sig.path === 'inv_tryit.dut.n4' && r.sig.wave?.t.length >= 4), [], { what: 'the probe\'s net run' });
  const v = await page.eval(() => {
    const d = window.Silinx.active, st = d.view.state;
    return { title: d.title, rows: st.rows.map((r) => r.sig.path), y: st.rows.find((r) => r.sig.path === 'inv_tryit.dut.n4').sig.wave.t.map((t) => t / 1000) };
  });
  assert.equal(v.title, 'Waveforms (inv)');
  assert.ok(v.rows.includes('inv_tryit.dut.n4') && v.rows.includes('inv_tryit.a'), JSON.stringify(v.rows));
  assert.deepEqual(v.y, [0, 10, 20, 30], 'X, then the session\'s three levels');
  assert.match(await page.consoleText(), /inv\.circ\.json: Try it replayed in the waveform viewer: 2 input change\(s\), 1020 ns, the probes y\./);
  // in Portuguese: the editor's button
  await page.eval(() => window.SilinxApp.openFile('src/inv.circ.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'circ:src/inv.circ.json', [], { what: 'the circuit in front again' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-waves`)?.textContent.trim() === '〰 Formas de onda', [ED], { what: 'Waveforms in Portuguese' }).catch(async (e) => { throw new Error(`${e.message}: ${await page.eval((ed) => document.querySelector(`${ed} .circ-waves`)?.outerHTML.slice(-120), ED)}`); });
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="probe"]`).textContent, ED), 'Sonda lógica');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
