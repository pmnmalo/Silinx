// UI: how the circuit editor draws (#4060, #4064): Show inside (the toolbar's, remembered) draws the breadboard's strips
// and the ICs' gates (the half adder's 7486 and 7408: 4 each); the ⋮ menu's Curved wires (an edit: saved in the
// circuit, Undo takes it back) and the choice Wire crossings (#4101): Hop-overs (by default: the wire wc hops over ws) or
// Plain crossings (remembered); in Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .circuit-editor';
const count = (page, sel) => page.eval((ed, s) => document.querySelectorAll(`${ed} ${s}`).length, ED, sel);
const wireD = (page, id) => page.eval((ed, w) => document.querySelector(`${ed} [data-id=${w}] .circ-wire`).getAttribute('d'), ED, id);
// a ⋮ menu's item by its label (its ✓ aside)
const menuItem = async (page, label) => page.click(await page.eval((ed, l) => {
  const r = [...document.querySelectorAll(`${ed} .tb-more-menu .tb-menu-item`)].find((b) => b.lastChild.textContent === l).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, ED, label));
// the menu's entries: its title's and its items' labels (* the ticked ones), their roles
const entries = (page) => page.eval((ed) => [...document.querySelectorAll(`${ed} .tb-more-menu .tb-menu-title, ${ed} .tb-more-menu .tb-menu-item`)]
  .map((e) => e.classList.contains('tb-menu-title') ? `${e.textContent}:` : `${e.getAttribute('aria-checked') === 'true' ? '*' : ''}${e.lastChild.textContent} ${e.getAttribute('role')}`), ED);

uiTest('Circuit editor: Show inside draws the strips and the gates; ⋮ Curved wires (undone) and Wire crossings: Hop-overs, Plain crossings; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CircLook', top: '', files: { 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('CircLook');
  await page.eval(() => { for (const k of ['inside', 'hops']) try { localStorage.removeItem(`silinx.circuit.${k}`); } catch { /* none */ } });
  await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=BB1]`), [ED], { what: 'the circuit editor' });
  // Show inside: off by default; on, the board's 64 strips (30 columns' two, 4 rails) and the 8 gates, the ICs' names in their tips
  assert.deepEqual([await count(page, '.circ-strip'), await count(page, '.circ-gate'), await count(page, '.circ-ic-text')], [0, 0, 2]);
  await page.click(`${ED} .circ-inside`);
  await page.waitFor((ed) => document.querySelectorAll(`${ed} .circ-gate`).length === 8, [ED], { what: 'the gates inside' });
  assert.deepEqual([await count(page, '.circ-strip'), await count(page, '.circ-gate-text'), await count(page, '.circ-ic-text')], [64, 8, 0]);
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} [data-id=U1] .circ-gate-text`)].map((t) => t.textContent), ED), ['=1', '=1', '=1', '=1']);
  assert.equal(await page.eval(() => localStorage.getItem('silinx.circuit.inside')), '1', 'remembered');
  await page.click(`${ED} .circ-inside`);
  assert.equal(await count(page, '.circ-gate'), 0);
  // Hop-overs, by default: wc (drawn after ws) hops over it, the first wire over none
  assert.match(await wireD(page, 'wc'), / A5,5 0 0 1 /);
  assert.doesNotMatch(await wireD(page, 'w1'), / A/, 'the first wire drawn hops over none');
  assert.deepEqual(await entries(page), ['Curved wires menuitemcheckbox', 'Wire crossings:', '*Hop-overs menuitemradio', 'Plain crossings menuitemradio']);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .tb-more-menu .tb-menu-title`).title, ED), 'How two wires that cross without connecting are drawn');
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .tb-more-menu [data-value]`)].map((b) => [b.dataset.value, b.title]), ED),
    [['hops', 'Draw a small arc where two wires cross without connecting'], ['plain', 'Draw two wires that cross without connecting straight across each other (a connection has its dot)']]);
  assert.equal(await page.eval(() => localStorage.getItem('silinx.circuit.hops')), null, 'nothing stored');
  // Plain crossings: no hop, its ✓, remembered; Hop-overs again: the hop back
  await page.click(`${ED} .circ-toolbar .tb-more-btn`);
  await menuItem(page, 'Plain crossings');
  assert.doesNotMatch(await wireD(page, 'wc'), / A/);
  assert.deepEqual(await entries(page), ['Curved wires menuitemcheckbox', 'Wire crossings:', 'Hop-overs menuitemradio', '*Plain crossings menuitemradio']);
  assert.equal(await page.eval(() => localStorage.getItem('silinx.circuit.hops')), '0');
  await page.click(`${ED} .circ-toolbar .tb-more-btn`);
  await menuItem(page, 'Hop-overs');
  assert.match(await wireD(page, 'wc'), / A5,5 0 0 1 /);
  assert.deepEqual(await entries(page), ['Curved wires menuitemcheckbox', 'Wire crossings:', '*Hop-overs menuitemradio', 'Plain crossings menuitemradio']);
  assert.equal(await page.eval(() => localStorage.getItem('silinx.circuit.hops')), '1');
  await page.click(`${ED} .circ-toolbar .tb-more-btn`);
  await menuItem(page, 'Plain crossings');
  assert.equal(await page.eval(() => localStorage.getItem('silinx.circuit.hops')), '0');
  // Curved wires: an edit (the document dirty, its wireStyle), the bent wires curves; Undo: straight again, its ✓ gone
  await page.click(`${ED} .circ-toolbar .tb-more-btn`);
  await menuItem(page, 'Curved wires');
  await page.waitFor((ed) => / C/.test(document.querySelector(`${ed} [data-id=ws] .circ-wire`).getAttribute('d')), [ED], { what: 'curved' });
  assert.equal(await page.eval(() => window.Silinx.active.circuitEditor.getModel().wireStyle), 'curved');
  assert.equal(await page.eval(() => window.Silinx.active.dirty), true);
  await page.menu('Edit', 'Undo');
  await page.waitFor((ed) => !/ C/.test(document.querySelector(`${ed} [data-id=ws] .circ-wire`).getAttribute('d')), [ED], { what: 'straight again' });
  assert.equal(await page.eval((ed) => [...document.querySelectorAll(`${ed} .tb-more-menu .tb-menu-item`)].find((b) => b.textContent.includes('Curved')).getAttribute('aria-checked'), ED), 'false');
  // in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => document.querySelector(`${ed} .circ-inside span`).textContent === 'Mostrar o interior', [ED], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .tb-more-menu .tb-menu-item`)].map((b) => [b.textContent.replace(/^✓/, ''), b.title]), ED),
    [['Fios curvos', 'Desenhar os fios como curvas suaves pelas suas dobras, como fios de ligação (as ligações as mesmas)'], ['Saltos', 'Desenhar um pequeno arco onde dois fios se cruzam sem se ligarem'],
      ['Cruzamentos simples', 'Desenhar dois fios que se cruzam sem se ligarem a direito, um sobre o outro (uma ligação tem o seu ponto)']]);
  assert.deepEqual(await page.eval((ed) => { const t = document.querySelector(`${ed} .tb-more-menu .tb-menu-title`); return [t.textContent, t.title]; }, ED),
    ['Cruzamentos de fios', 'Como se desenham dois fios que se cruzam sem se ligarem']);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .circ-toolbar .tb-more-btn`).title, ED), 'Fios');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
