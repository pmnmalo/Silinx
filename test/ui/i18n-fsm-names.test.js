// UI: the signals' and the states' names are never translated (#4964): a state diagram whose input is named up (in
// Portuguese 'crescente'), enable (habilitação), whose outputs are clock (relógio) and down (decrescente), whose states are
// Counter (Contador) and Top (Topo), keeps them as they are in Portuguese in its tables (the transition table's
// conditions and states, the state table's, the encoded table's headers and notes), its Try it panel, its Properties, its
// ASM chart and its Boolean Algebra tables; the interface's own labels around them translated. No warnings.
// (The interface: SILINX_UI_INTERFACE.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeFsm } from '../../core/fsm.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .fsm-editor';

// names that are words of the interface's dictionary
const M = normalizeFsm({
  name: 'cnt', type: 'moore', encoding: 'binary',
  inputs: [{ name: 'up', width: 1 }, { name: 'enable', width: 1 }],
  outputs: [{ name: 'clock', width: 1, default: '0' }, { name: 'down', width: 1, default: '0' }],
  states: [{ id: 'a', name: 'Counter', x: 120, y: 160, outputs: {} }, { id: 'b', name: 'Top', x: 320, y: 160, outputs: { clock: '1', down: '1' } }],
  transitions: [{ id: 't1', from: 'a', to: 'b', cond: 'up' }, { id: 't2', from: 'a', to: 'a', cond: '!up' },
    { id: 't3', from: 'b', to: 'a', cond: 'enable' }, { id: 't4', from: 'b', to: 'b', cond: '!enable' }],
  initial: 'a',
});
// the Portuguese of those names, never shown
const LEAK = /^\s*(crescente|decrescente|habilitação|relógio|Contador|Topo)\s*$/;   // (a text that is one of them: the labels' 'flancos de relógio' are the interface's)

/** The texts (and titles) under `sel` with a translated name: none. */
const leaks = (page, sel) => page.eval((s, re) => {
  const r = new RegExp(re), out = [];
  for (const root of document.querySelectorAll(s)) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.currentNode; n; n = w.nextNode()) {
      if (n.nodeType === 3 && r.test(n.nodeValue)) out.push(`${n.parentElement.tagName}.${n.parentElement.className}: ${n.nodeValue}`);
      if (n.nodeType === 1) for (const a of ['title', 'aria-label', 'placeholder']) if (r.test(n.getAttribute(a) || '')) out.push(`${n.tagName}[${a}]: ${n.getAttribute(a)}`);
    }
  }
  return out;
}, sel, LEAK.source);

uiTest('#4964 the signals and the states named up, enable, clock, Counter…: untranslated in a state diagram\'s tables, Try it, ASM chart', E, async (page) => {
  await makeProject(env, { name: 'FsmNames', files: { 'src/cnt.fsm.json': JSON.stringify(M, null, 2) } });
  await page.openProject('FsmNames');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.eval(() => window.SilinxApp.openFsm('src/cnt.fsm.json'));
    await page.waitFor((ed) => window.Silinx.active?.id === 'fsm:src/cnt.fsm.json' && document.querySelector(ed), [ED], { what: 'state diagram editor' });
    // the tables
    await page.click(`${ED} .fsm-tab-btn`, { text: 'Tabelas' });
    await page.waitForSelector(`${ED} .fsm-etable`);
    assert.deepEqual(await leaks(page, ED), []);
    // the transition table: the states and the conditions as they are (in the tests' notation, /up)
    assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-ttable tr`)].slice(1).map((r) => [...r.children].map((c) => c.textContent).join('|')), ED),
      ['Counter|0|up|Top|1|', 'Counter|0|/up|Counter|0|', 'Top|1|enable|Counter|0|clock=1, down=1', 'Top|1|/enable|Top|1|clock=1, down=1']);
    // the encoded table's headers: the inputs' names, its labels translated
    assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-etable tr`)].slice(0, 2).map((r) => [...r.children].map((c) => c.textContent).join('|')), ED),
      ['Estado presente|Entradas|Estado seguinte|Saídas|', 'q0|up|enable|d0|clock|down']);
    assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-etable .fsm-note`)].map((c) => c.textContent), ED),
      ['Counter → Counter', 'Counter → Counter', 'Counter → Top', 'Counter → Top', 'Top → Top', 'Top → Counter', 'Top → Top', 'Top → Counter']);
    // its Boolean Algebra (the truth tables and Karnaugh maps of the next state and of the outputs): the inputs' and outputs' names
    await page.click(`${ED} .fsm-mktt`);
    await page.waitFor(() => window.Silinx.active?.id === 'tt:src/cnt_next.bool.json' && document.querySelector('.doc:not([hidden]) .tt-table'), [], { what: 'the truth table', timeout: 15000 });
    assert.deepEqual(await page.eval(() => [...document.querySelector('.doc:not([hidden]) .tt-table tr').children].map((c) => c.textContent)).then((r) => r.filter((x) => /up|enable/.test(x))), ['up', 'enable']);
    assert.deepEqual(await leaks(page, '.doc:not([hidden])'), []);
    await page.eval(() => window.SilinxApp.openFsm('src/cnt.fsm.json'));
    await page.waitFor((ed) => window.Silinx.active?.id === 'fsm:src/cnt.fsm.json' && document.querySelector(ed), [ED], { what: 'the diagram again' });
    // Try it: the state, the inputs, the outputs
    await page.click(`${ED} .fsm-tab-btn`, { text: 'Experimentar' });
    await page.waitForSelector(`${ED} .fsm-sim`);
    assert.equal(await page.eval((ed) => document.querySelector(`${ed} .fsm-sim-state`).textContent, ED), 'Counter');
    // (up = 1, a clock edge: Top, and the trace's rows)
    await page.click(`${ED} .fsm-bit[data-input=up]`);
    await page.click(`${ED} .fsm-sim-step`);
    await page.waitFor((ed) => document.querySelector(`${ed} .fsm-sim-state`)?.textContent === 'Top' && document.querySelector(`${ed} .fsm-trace`), [ED], { what: 'Top, the trace' });
    assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-trace tr`)].map((r) => [...r.children].map((c) => c.textContent).join('|')), ED),
      ['Ciclo|Estado|Entradas|Saídas|Estado seguinte', '0|Counter|up=1 enable=0|clock=0 down=0|Top']);
    assert.deepEqual(await leaks(page, ED), []);
    await page.click(`${ED} .fsm-tab-btn`, { text: 'Experimentar' });
    // a state's and a transition's Properties
    for (const sel of ['[data-state=b] .fsm-circle', '[data-trans=t1] .fsm-label']) {
      await page.click(`${ED} ${sel}`);
      assert.deepEqual(await leaks(page, ED), [], sel);
    }
    // its ASM chart
    await page.click(`${ED} .tb-more-btn`);
    await page.click(`${ED} .asm-btn`, { text: 'Converter para fluxograma ASM' });
    await page.waitFor(() => window.Silinx.active?.id === 'asm:src/cnt_asm.asm.json', [], { what: 'ASM chart opened', timeout: 15000 });
    await page.waitForSelector('.doc:not([hidden]) .asm-editor');
    assert.deepEqual(await leaks(page, '.doc:not([hidden])'), []);
    // its Try it: the state, the trace
    const P = '.doc:not([hidden]) .asm-editor .asm-simpanel';
    await page.click('.doc:not([hidden]) .asm-editor .asm-sim-btn');
    await page.waitFor((p) => !document.querySelector(p).hidden, [P], { what: 'the panel' });
    await page.click(`${P} .fsm-bit[data-input=up]`);
    await page.click(`${P} .asm-sim-step`);
    await page.waitFor((p) => document.querySelector(`${p} .fsm-sim-state`)?.textContent === 'Top' && document.querySelector(`${p} .fsm-trace`), [P], { what: 'Top, the trace' });
    assert.deepEqual(await leaks(page, '.doc:not([hidden])'), []);
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
