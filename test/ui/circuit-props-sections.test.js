// UI: the circuit editor's Properties (#4303): nothing selected, the Circuit's section (its name); a part or a wire
// selected, its section only, the Circuit's hidden; nothing selected again, the Circuit's back; Portuguese. (One item is
// selected at a time: there is no selection of several.) No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
// the Properties' sections shown, each by its heading
const shown = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} .asm-side .asm-section`)].filter((s) => !s.hidden && s.offsetParent !== null && s.querySelector('h3'))
  .map((s) => s.querySelector('h3').textContent), ED);
const centre = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);

uiTest('Circuit editor: the Properties show the Circuit\'s section with nothing selected, only the selection\'s with a part or a wire; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircProps', top: '', files: { 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircProps');
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-kind=wire][data-id=ws]`), [ED], { what: 'the circuit editor' });
  assert.deepEqual(await shown(page), ['Circuit'], 'nothing selected');
  // a part
  await page.click(await centre(page, `${ED} [data-id=U1] .circ-ic-body`));
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection h3`)?.textContent.startsWith('U1: '), [ED], { what: 'U1 selected' });
  assert.deepEqual(await shown(page), ['U1: Quad 2-input XOR']);
  // a wire
  const on = await page.eval((ed) => {
    const p = document.querySelector(`${ed} [data-kind=wire][data-id=ws] path`), q = p.getPointAtLength(p.getTotalLength() / 2), m = p.getScreenCTM();
    return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f };
  }, ED);
  await page.click(on);
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection h3`)?.textContent === 'Wire ws', [ED], { what: 'the wire selected' });
  assert.deepEqual(await shown(page), ['Wire ws']);
  // nothing selected again: an empty place of the canvas
  const free = await page.eval((ed) => { const r = document.querySelector(`${ed} .circ-canvas`).getBoundingClientRect(); return { x: r.left + r.width * 0.75, y: r.top + 24 }; }, ED);
  assert.equal(await page.eval((p) => document.elementFromPoint(p.x, p.y)?.closest('[data-kind]') || null, free), null, 'an empty place');
  await page.click(free);
  await page.waitFor((ed) => !document.querySelector(`${ed} .circ-selection h3`), [ED], { what: 'nothing selected' });
  assert.deepEqual(await shown(page), ['Circuit']);
  // in Portuguese: the same, its headings translated
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-circuit h3`)?.textContent === 'Circuito', [ED], { what: 'Portuguese' });
  assert.deepEqual(await shown(page), ['Circuito']);
  await page.click(on);
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-selection h3`)?.textContent === 'Fio ws', [ED], { what: 'the wire selected, in Portuguese' });
  assert.deepEqual(await shown(page), ['Fio ws']);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)/.test(l)), []);
}, { timeout: 90000 });
