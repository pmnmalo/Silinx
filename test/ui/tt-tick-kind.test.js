// UI: a ticked result stays ticked when its SOP / POS is switched (#4092): the Karnaugh map's and Quine-McCluskey's, the
// output's HDL logic the form clicked (sop ↔ pos, qsop ↔ qpos); an unticked one stays unticked, the HDL logic unchanged.
// No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newTable, normalizeTable } from '../../core/logic.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const T = '.doc:not([hidden]) .tt-editor';

uiTest('#4092 Boolean algebra: switching a ticked result\'s SOP / POS keeps it ticked, its form the output\'s', E, async (page) => {
  const doc = normalizeTable({ ...newTable('mx', ['s', 'a', 'b'], ['y']), table: { y: '00110101' } });
  await makeProject(env, { name: 'TickKind', files: { 'src/mx.bool.json': JSON.stringify(doc, null, 2) } });
  await page.openProject('TickKind');
  await page.eval(() => window.SilinxApp.openTt('src/mx.bool.json'));
  await page.waitFor((t) => window.Silinx.active?.id === 'tt:src/mx.bool.json' && document.querySelector(`${t} .tt-results .tt-kmap-res .tt-hdl`), [T], { what: 'the truth table' });
  const form = () => page.eval(async () => (await import('/core/logic.js')).formOf(window.Silinx.active.ttEditor.getModel(), 'y'));
  const ticked = (cls) => page.eval((t, c) => document.querySelector(`${t} .tt-results > .${c} .tt-hdl`).checked, T, cls);
  const click = async (sel) => { await page.eval((t, s) => document.querySelector(`${t} .tt-results ${s}`).click(), T, sel); };
  // unticked (least gates ticked): its POS clicked, still unticked, the form unchanged
  assert.equal(await form(), 'gates');
  await click('.tt-kmap-res .tt-kind-pos');
  await page.waitFor((t) => document.querySelector(`${t} .tt-kmap-res .tt-kind-pos.active`), [T], { what: 'the K-map\'s POS' });
  assert.deepEqual([await ticked('tt-kmap-res'), await form()], [false, 'gates']);
  // the K-map's POS ticked, then its SOP clicked: ticked, the output's logic its SOP; back to POS
  await click('.tt-kmap-res .tt-hdl');
  await page.waitFor(async () => (await import('/core/logic.js')).formOf(window.Silinx.active.ttEditor.getModel(), 'y') === 'pos', [], { what: 'the POS ticked' });
  await click('.tt-kmap-res .tt-kind-sop');
  await page.waitFor(async () => (await import('/core/logic.js')).formOf(window.Silinx.active.ttEditor.getModel(), 'y') === 'sop', [], { what: 'the SOP, still ticked' });
  assert.deepEqual([await ticked('tt-kmap-res'), await page.eval((t) => !!document.querySelector(`${t} .tt-kmap-res .tt-kind-sop.active`), T)], [true, true]);
  await click('.tt-kmap-res .tt-kind-pos');
  await page.waitFor(async () => (await import('/core/logic.js')).formOf(window.Silinx.active.ttEditor.getModel(), 'y') === 'pos', [], { what: 'the POS again' });
  assert.equal(await ticked('tt-kmap-res'), true);
  // Quine-McCluskey's: ticked (its SOP), its POS clicked, ticked, qpos
  await click('.tt-qm .tt-hdl');
  await page.waitFor(async () => /^q(sop|pos)$/.test((await import('/core/logic.js')).formOf(window.Silinx.active.ttEditor.getModel(), 'y')), [], { what: 'Quine-McCluskey ticked' });
  const q = await form();
  await click(`.tt-qm .tt-kind-${q === 'qsop' ? 'pos' : 'sop'}`);
  await page.waitFor(async (w) => (await import('/core/logic.js')).formOf(window.Silinx.active.ttEditor.getModel(), 'y') === w, [q === 'qsop' ? 'qpos' : 'qsop'], { what: 'the other, still ticked' });
  assert.deepEqual([await ticked('tt-qm'), await ticked('tt-kmap-res')], [true, false]);
  // the table changed (its HDL logic), the K-map's switch left as it was
  assert.equal(await page.eval(() => !!window.Silinx.active.dirty), true);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
