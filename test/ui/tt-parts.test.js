// UI: the parts of the truth table editor (#3218, #405: out of mountTtEditor in web/js/truthtable.js): the results
// (tt-results.js) of the majority function: their rows in order, each form's expression and cost (its gates by type, #4091) as
// core/logic.js computes them, the least gates' row (its expression beside its label), the captions (#4093),
// the table's notation changed in its ⋮ menu (#3939: the results and the Karnaugh map's legend rewritten), the K-map's
// POS clicked and ticked (the output's HDL logic, the table changed); the map under its result, shown by its Show K-map button
// (#4057: hidden when the table opens, each editor its own; in Portuguese). No warnings. The editor's whole use: test/ui/truthtable.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newTable, normalizeTable, analyzeOutput, formatExpr, outputForm, formCost } from '../../core/logic.js';
import { showKmap } from './tt-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const T = '.doc:not([hidden]) .tt-editor';

uiTest('#3218 #3939 truth table editor parts: the results, their notation and their tick boxes', E, async (page) => {
  const doc = normalizeTable({ ...newTable('maj', ['a', 'b', 'c'], ['f']), table: { f: '00010111' } });
  await makeProject(env, { name: 'TtParts', files: { 'src/maj.bool.json': JSON.stringify(doc, null, 2) } });
  await page.openProject('TtParts');
  await page.eval(() => window.SilinxApp.openTt('src/maj.bool.json'));
  await page.waitFor((t) => window.Silinx.active?.id === 'tt:src/maj.bool.json' && document.querySelector(`${t} .tt-results .tt-hdl`), [T], { what: 'the truth table' });
  const ev = (fn, ...a) => page.eval(fn, T, ...a);
  // ---- the Karnaugh map (#4057): hidden when the table opens, shown under its result by its Show K-map button, hidden again
  const kbtn = () => ev((t) => { const b = document.querySelector(`${t} .tt-results > .tt-kmap-res > button.tt-show.tt-kmap-on`);
    return [b.textContent, b.getAttribute('aria-pressed'), b.classList.contains('active'), document.querySelectorAll('svg.tt-kmap').length,
      document.querySelectorAll(`${t} .tt-results > .tt-kmap-res .tt-kmap-box svg.tt-kmap`).length, !!document.querySelector(`${t} .tt-cap-kmap, ${t} .tt-groups input[type=radio]`)]; });
  assert.deepEqual(await kbtn(), ['Show K-map', 'false', false, 0, 0, false]);
  await showKmap(page, T);
  assert.deepEqual(await kbtn(), ['Hide K-map', 'true', true, 1, 1, false]);
  assert.ok(await ev((t) => { const b = document.querySelector(`${t} .tt-kmap-res .tt-kmap-on`), box = document.querySelector(`${t} .tt-kmap-res .tt-kmap-box`);
    return !!(b.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING) && !!box.querySelector('.tt-groups .tt-kmap-order') && !!box.querySelector('.tt-legend'); }), 'the map, its options and legend below the button');
  await page.eval((t) => document.querySelector(`${t} .tt-kmap-res .tt-kmap-on`).click(), T);
  await page.waitFor(() => !document.querySelector('svg.tt-kmap'), [], { what: 'the map hidden' });
  assert.deepEqual(await kbtn(), ['Show K-map', 'false', false, 0, 0, false]);
  // in Portuguese: Mostrar Mapa K / Esconder Mapa K
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('pt');
  await page.waitFor((t) => document.querySelector(`${t} .tt-kmap-res .tt-kmap-on`)?.textContent === 'Mostrar Mapa K', [T], { what: 'Mostrar Mapa K' });
  // (the cost line and the Expressions caption, #4091, #4093)
  assert.deepEqual(await ev((t) => [document.querySelector(`${t} .tt-results > .tt-kmap-res .tt-cost`).textContent, document.querySelector(`${t} .tt-cap-results`).textContent]),
    ['3 termo(s), 6 literal(is); portas: 3 AND2, 1 OR3', 'Expressões']);
  await page.eval((t) => document.querySelector(`${t} .tt-kmap-res .tt-kmap-on`).click(), T);
  await page.waitFor((t) => document.querySelector(`${t} .tt-kmap-res .tt-kmap-on`)?.textContent === 'Esconder Mapa K' && document.querySelector(`${t} .tt-kmap-res svg.tt-kmap`), [T], { what: 'Esconder Mapa K' });
  await page.eval((t) => document.querySelector(`${t} .tt-kmap-res .tt-kmap-on`).click(), T);
  await page.waitFor((t) => document.querySelector(`${t} .tt-kmap-res .tt-kmap-on`)?.textContent === 'Mostrar Mapa K', [T], { what: 'Mostrar Mapa K again' });
  await setLang('en');
  await page.waitFor((t) => document.querySelector(`${t} .tt-kmap-res .tt-kmap-on`)?.textContent === 'Show K-map', [T], { what: 'English' });
  // ---- the rows: the circuit's two choices, the Karnaugh map's and Quine-McCluskey's (#3939), the canonical ones, the XOR form (cheaper: a.b + c.(a ⊕ b)), the NAND and NOR forms
  assert.deepEqual(await ev((t) => [...document.querySelectorAll(`${t} .tt-results > .tt-res`)].map((r) => r.className.replace(/^tt-res /, ''))),
    ['tt-gates', 'tt-delay', 'tt-kmap-res', 'tt-qm', 'tt-canon', 'tt-xor', 'tt-nand', 'tt-nor']);
  // ---- each form's expression, as core/logic.js computes it (slash notation by default); the K-map's and Quine-McCluskey's SOP
  const A = analyzeOutput(doc, 'f');
  const exprs = (notation) => ({
    gates: `f = ${formatExpr(outputForm(doc, 'f', 'gates').ast, notation)}`, delay: `f = ${formatExpr(outputForm(doc, 'f', 'delay').ast, notation)}`,
    'kmap-res': `f = ${formatExpr(A.sop.ast, notation)}`, qm: `f = ${formatExpr(A.qm.sop.ast, notation)}`,
    xor: `f = ${formatExpr(A.xor.ast, notation)}`, nand: `f = ${formatExpr(A.nand.ast, notation)}`, nor: `f = ${formatExpr(A.nor.ast, notation)}`,
  });
  const shown = () => ev((t) => Object.fromEntries(['gates', 'delay', 'kmap-res', 'qm', 'xor', 'nand', 'nor'].map((k) => [k, document.querySelector(`${t} .tt-results > .tt-${k} .tt-expr`).textContent])));
  assert.deepEqual(await shown(), exprs('slash'));
  assert.equal(await ev((t) => document.querySelector(`${t} .tt-canon-sop .tt-canon-list`).textContent), `f = ${A.sigma}`);
  // ---- each form's terms, literals and gates by type (#4091), as core/logic.js counts them; the majority's SOP checked by hand
  const best = (g) => outputForm(doc, 'f', g);
  const costs = () => ev((t) => Object.fromEntries(['gates', 'delay', 'kmap-res', 'qm', 'xor', 'nand', 'nor'].map((k) => [k, document.querySelector(`${t} .tt-results > .tt-${k} .tt-cost`).textContent])));
  assert.deepEqual(await costs(), {
    gates: formCost(best('gates').ast, best('gates').form).text, delay: formCost(best('delay').ast, best('delay').form).text,
    'kmap-res': formCost(A.sop.ast, 'sop').text, qm: formCost(A.qm.sop.ast, 'qsop').text,
    xor: formCost(A.xor.ast, 'xor').text, nand: formCost(A.nand.ast, 'nand').text, nor: formCost(A.nor.ast, 'nor').text });
  assert.deepEqual(Object.values(await costs()), ['3 term(s), 6 literal(s); gates: 3 AND2, 1 OR3', '3 term(s), 6 literal(s); gates: 3 AND2, 1 OR3', '3 term(s), 6 literal(s); gates: 3 AND2, 1 OR3',
    '3 term(s), 6 literal(s); gates: 3 AND2, 1 OR3', '2 term(s), 5 literal(s); gates: 2 AND2, 1 OR2, 1 XOR2', '3 term(s), 6 literal(s); gates: 3 NAND2, 1 NAND3', '3 term(s), 6 literal(s); gates: 3 NOR2, 1 NOR3']);
  // the least gates' and least delay's rows: the tick box, the label, its expression (no form's name, #4091); its cost, its circuit
  assert.deepEqual(await ev((t) => ['gates', 'delay'].map((g) => { const r = document.querySelector(`${t} .tt-results > .tt-${g}`), [line, ...rest] = r.children;
    return [[...line.childNodes].map((n) => n.nodeType === 3 ? n.textContent : n.matches('input.tt-hdl, label') ? 'tick' : n.className || n.tagName.toLowerCase()), line.textContent, r.querySelectorAll('.tt-best-form').length, rest.map((c) => c.className)]; })), [
    [['tick', 'b', ': ', 'tt-expr-box'], 'Least number of gates: f = b.c + a.c + a.b', 0, ['tt-cost', 'tt-circuit']],
    [['tick', 'b', ': ', 'tt-expr-box'], 'Least delay: f = b.c + a.c + a.b', 0, ['tt-cost', 'tt-circuit']]]);
  // the captions: no Expression over the function's field, the results' Expressions (#4093)
  assert.deepEqual(await ev((t) => [...document.querySelectorAll(`${t} .tt-caption`)].map((c) => `${c.className}: ${c.textContent}`)),
    ['tt-caption: Truth table', 'tt-caption tt-cap-notes: Notes', 'tt-caption tt-cap-results: Expressions']);
  // ---- the notation: the table's own, VHDL, from its toolbar's ⋮ menu (#3939): the results and the map's legend rewritten
  await page.eval((t) => document.querySelector(`${t} .tt-toolbar .tb-more-menu [data-value="vhdl"]`).click(), T);
  await page.waitFor((t, e) => document.querySelector(`${t} .tt-results > .tt-kmap-res .tt-expr`)?.textContent === e, [T, exprs('vhdl')['kmap-res']], { what: 'the VHDL notation' });
  assert.deepEqual(await shown(), exprs('vhdl'));
  assert.equal(await page.eval(() => window.Silinx.active.ttEditor.getModel().notation), 'vhdl');
  await showKmap(page, T);
  assert.ok((await ev((t) => document.querySelector(`${t} .tt-legend code`).textContent)).includes(' and '), 'the legend in VHDL');
  // ---- a tick box: the K-map's POS, the output's HDL logic; the table changed
  assert.deepEqual(await ev((t) => [...document.querySelectorAll(`${t} .tt-results .tt-hdl`)].filter((c) => c.checked).map((c) => c.closest('[class^="tt-canon-"], .tt-res').className)), ['tt-res tt-gates']);
  await page.eval((t) => document.querySelector(`${t} .tt-results > .tt-kmap-res .tt-kind-pos`).click(), T);
  await page.waitFor((t, e) => document.querySelector(`${t} .tt-results > .tt-kmap-res .tt-expr`)?.textContent === e, [T, `f = ${formatExpr(A.pos.ast, 'vhdl')}`], { what: 'the K-map\'s POS' });
  await page.eval((t) => document.querySelector(`${t} .tt-results > .tt-kmap-res .tt-hdl`).scrollIntoView({ block: 'center' }), T);
  await page.click(`${T} .tt-results > .tt-kmap-res .tt-hdl`);
  await page.waitFor((t) => document.querySelector(`${t} .tt-results > .tt-kmap-res .tt-hdl`)?.checked, [T], { what: 'the POS ticked' });
  assert.equal(await page.eval(async () => (await import('/core/logic.js')).formOf(window.Silinx.active.ttEditor.getModel(), 'f')), 'pos');
  assert.equal(await page.eval(() => !!window.Silinx.active.dirty), true);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});

uiTest('#4057 the Karnaugh map shown in one table, the other\'s still hidden (its view is its own, #3074)', E, async (page) => {
  const mk = (name, f) => JSON.stringify(normalizeTable({ ...newTable(name, ['a', 'b'], ['f']), table: { f } }), null, 2);
  await makeProject(env, { name: 'TtParts2', files: { 'src/t1.bool.json': mk('t1', '0110'), 'src/t2.bool.json': mk('t2', '0001') } });
  await page.openProject('TtParts2');
  const open = async (p) => {
    await page.eval((x) => window.SilinxApp.openTt(x), p);
    await page.waitFor((t, x) => window.Silinx.active?.id === `tt:${x}` && document.querySelector(`${t} .tt-kmap-res .tt-kmap-on`), [T, p], { what: p });
  };
  const state = () => page.eval((t) => [document.querySelector(`${t} .tt-kmap-on`).getAttribute('aria-pressed'), !!document.querySelector(`${t} svg.tt-kmap`)], T);
  await open('src/t1.bool.json');
  await showKmap(page, T);
  await open('src/t2.bool.json');
  assert.deepEqual(await state(), ['false', false], 'the second table\'s map hidden');
  await open('src/t1.bool.json');
  assert.deepEqual(await state(), ['true', true], 'the first\'s still shown');
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
