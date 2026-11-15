// UI: a circuit wire's colour set in its Properties (#3898), through core/circuit-edit.js's setWireProps, the MCP server's
// edit_circuit's too (#4121): the wire drawn in it, saved, Edit ▸ Undo bringing the old one back. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const colour = (page) => page.eval((ed) => document.querySelector(`${ed} .circ-selection .circ-color-in`)?.value, ED);

uiTest('Circuit editor: a wire\'s Colour in its Properties, drawn, saved, undone (#3898, #4121)', E, async (page) => {
  await makeProject(env, { name: 'WireCol', top: '', files: { 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('WireCol');
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => window.Silinx.active?.id === 'circ:src/half_adder.circ.json' && document.querySelector(`${ed} [data-kind=wire][data-id=ws]`), [ED], { what: 'the circuit editor' });
  // the wire ws selected by a click on it: its Properties, its colour
  const was = halfAdder().wires.find((w) => w.id === 'ws').color;
  const on = await page.eval((ed) => {
    const p = document.querySelector(`${ed} [data-kind=wire][data-id=ws] path`), q = p.getPointAtLength(p.getTotalLength() / 2), m = p.getScreenCTM();
    return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f };
  }, ED);
  await page.click(on);
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection h3`)?.textContent === 'Wire ws', [ED], { what: 'the wire selected' });
  assert.equal(await colour(page), was);
  await page.fill(`${ED} .circ-selection .circ-color-in`, 'yellow');
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection .circ-color-in`)?.value === 'yellow' && window.Silinx.active?.dirty, [ED], { what: 'the colour set' });
  await page.eval(() => window.SilinxApp.saveAll());
  await page.waitFor(async () => !window.Silinx.active?.dirty, [], { what: 'saved' });
  const saved = JSON.parse(await readWs(env, 'WireCol', 'src/half_adder.circ.json'));
  assert.equal(saved.wires.find((w) => w.id === 'ws').color, 'yellow');
  assert.deepEqual(saved.wires.filter((w) => w.id !== 'ws').map((w) => w.color), halfAdder().wires.filter((w) => w.id !== 'ws').map((w) => w.color));
  // Edit ▸ Undo: the old colour back
  await page.menu('Edit', 'Undo');
  await page.waitFor((ed, c) => document.querySelector(`${ed} .circ-selection .circ-color-in`)?.value === c, [ED, was], { what: 'undone' });
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)/.test(l)), []);
});
