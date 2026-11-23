// UI (#5357): the circuit editor's Try it mounted alone (web/js/circuit-try.js, moved from circuit-editor.js as it was):
// started on a circuit (a supply, a switch S1 lighting an LED), an input set and run, its message of a servo's period that
// is no servo's (once); stopped; toggled; its shared state; a circuit with errors not started. Both
// interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#5357 Try it mounted alone: started, an input set, its messages, stopped, toggled; its shared state; a circuit in error not started', E, async (page) => {
  const r = await page.eval(async () => {
    const { mountCircuitTry } = await import('/js/circuit-try.js');
    const { normalizeCircuit } = await import('/core/circuit.js');
    const said = [];
    let renders = 0;
    const m = normalizeCircuit({ name: 'c', parts: [{ id: 'P1', type: 'supply', x: -6, y: -10 }, { id: 'S1', type: 'logic-switch', x: 0, y: 0 }, { id: 'D1', type: 'led', x: 4, y: 0 },
      { id: 'M1', type: 'servo-sg90', x: 10, y: 0 }, { id: 'S2', type: 'logic-switch', x: 12, y: 4 }],
    wires: [{ id: 'a', points: [[0, 0], [4, 0]] }, { id: 'b', points: [[5, 0], [-6, -9]] }, { id: 'g', points: [[10, 0], [-6, -9]] }, { id: 'v', points: [[11, 0], [-6, -10]] }, { id: 's', points: [[12, 4], [12, 0]] }] });
    let model = m;
    const t = mountCircuitTry({ M: () => model, opts: {}, root: document.body, status: (msg, err) => said.push([msg, err]), render: () => { renders++; }, destroyed: () => false });
    const out = { before: t.sim() };
    t.startSim();
    out.dark = t.sim().leds().D1;
    t.setInput('S1', true);
    out.lit = t.sim().leds().D1;
    // (a servo's two pulses at the same time: a period that is no servo's, said once)
    t.setInput('S2', true); t.setInput('S2', false); t.setInput('S2', true); t.setInput('S2', false);
    out.state = t.tryState()?.kind;
    t.stopSim();
    out.stopped = t.sim();
    t.toggleSim(); out.toggled = !!t.sim(); t.toggleSim();
    // a circuit with an error: not started, said
    model = normalizeCircuit({ name: 'c', parts: [{ id: 'U1', type: '7400', x: 0, y: 0 }] });
    t.startSim();
    out.error = t.sim();
    return { ...out, said, renders: renders > 0 };
  });
  assert.deepEqual([r.before, r.dark, r.lit, r.state, r.stopped, r.toggled, r.error, r.renders], [null, 'off', 'on', 'circ', null, true, null, true]);
  assert.deepEqual(r.said, [['M1: its pulses 0 ms apart: a servo\'s come every 20 ms (10 to 30)', true],
    ['The circuit cannot be simulated: U1 (7400) is not powered: its VCC (pin 14) is not on the supply\'s + and its GND (pin 7) is not on the supply\'s −', true]]);
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
});
