// UI: the Electronics / Engineering notation's bars drawn (#4058, web/js/overbar.js): a NOT a line over its group, a
// negation inside a negation a box inside a box, each bar above the one under it, where its text writes combining
// overlines (U+0305) that fonts draw on top of each other. A table's NAND and NOR forms (bars over bars), its results'
// and K-map's groups, a state diagram's transition table: the boxes read back as the text notation's /( … ) equal
// core/overline.js's reading of the text; their text and what is copied unchanged (the overlines kept, hidden). No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newTable, normalizeTable, analyzeOutput } from '../../core/logic.js';
import { showExpr } from '../../core/expr-notation.js';
import { overlineToSlash, OVERLINE } from '../../core/overline.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const T = '.doc:not([hidden]) .tt-editor';
const ED = '.doc:not([hidden]) .fsm-editor';

// the deepest bar of a text: the most overlines on one character
const depthOf = (s) => Math.max(0, ...[...s.matchAll(new RegExp(`${OVERLINE}+`, 'g'))].map((m) => m[0].length));

/** Each element of `sel` drawn: its text, its boxes read back as /( … ), its deepest box, whether every box's bar is
 *  above the bars inside it and over its group (its width the group's), whether a hidden mark holds every overline. */
const drawn = (page, sel) => page.eval((s) => [...document.querySelectorAll(s)].map((el) => {
  const read = (n) => [...n.childNodes].map((c) => (c.nodeType === 3 ? c.textContent : c.classList.contains('ob-mark') ? '' : c.classList.contains('ob') ? `/(${read(c)})` : read(c))).join('');
  const depth = (n) => Math.max(0, ...[...n.children].filter((c) => c.classList.contains('ob')).map((c) => 1 + depth(c)));
  let above = true;
  for (const ob of el.querySelectorAll('.ob')) {
    const r = ob.getBoundingClientRect();
    for (const inner of ob.querySelectorAll(':scope > .ob')) { const q = inner.getBoundingClientRect(); if (!(r.top < q.top && r.left <= q.left + 0.5 && r.right >= q.right - 0.5)) above = false; }
    if (getComputedStyle(ob).borderTopStyle !== 'solid' || parseFloat(getComputedStyle(ob).borderTopWidth) < 1) above = false;
  }
  const hidden = [...el.querySelectorAll('.ob-mark')].every((m) => getComputedStyle(m).display === 'none' && /^̅+$/.test(m.textContent));
  return { text: el.textContent, slash: read(el), depth: depth(el), above, hidden, drawn: el.classList.contains('ob-text') };
}), sel);

uiTest('#4058 Electronics / Engineering notation: the bars drawn, nested, the text unchanged', E, async (page) => {
  // a table in the notation of its own (its ⋮ menu's, #3939): the minority function (a̅·b̅ + a̅·c̅ + b̅·c̅), its NAND and NOR
  // forms bars over bars
  const doc = normalizeTable({ ...newTable('maj', ['a', 'b', 'c'], ['f']), table: { f: '11101000' }, notation: 'engineering' });
  const fsm = JSON.stringify({
    name: 'nt', lang: 'vhdl', inputs: [{ name: 'a', width: 1 }, { name: 'b', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
    states: [{ id: 's', name: 'S', x: 100, y: 100 }, { id: 'u', name: 'U', x: 300, y: 100, outputs: { z: '1' } }],
    transitions: [{ id: 't1', from: 's', to: 'u', cond: '!(a && !b)' }, { id: 't2', from: 'u', to: 's', cond: '!(a || b)' }], initial: 's',
  }, null, 2);
  await makeProject(env, { name: 'Bars', files: { 'src/maj.bool.json': JSON.stringify(doc, null, 2), 'src/nt.fsm.json': fsm } });
  await page.openProject('Bars');
  await page.eval(() => window.SilinxApp.openTt('src/maj.bool.json'));
  await page.waitFor((t) => window.Silinx.active?.id === 'tt:src/maj.bool.json' && document.querySelector(`${t} .tt-results .tt-nand .ob`), [T], { what: 'the truth table, its bars drawn' });
  const A = analyzeOutput(doc, 'f');
  for (const [cls, ast] of [['nand', A.nand.ast], ['nor', A.nor.ast], ['kmap-res', A.sop.ast]]) {
    const [d] = await drawn(page, `${T} .tt-results > .tt-${cls} .tt-expr`);
    const text = `f = ${showExpr(ast, 'engineering')}`;
    assert.equal(d.text, text, `${cls}: the text as core/expr-notation.js writes it`);
    assert.equal(d.drawn, text.includes(OVERLINE), `${cls}: drawn when it has a bar`);
    assert.equal(d.slash, overlineToSlash(text), `${cls}: the boxes read as the text's bars`);
    assert.equal(d.depth, depthOf(text), `${cls}: as deep as its bars`);
    assert.ok(d.above && d.hidden, `${cls}: each bar above the ones under it, the overlines hidden`);
  }
  assert.ok((await drawn(page, `${T} .tt-results > .tt-nand .tt-expr`))[0].depth >= 2, 'the NAND form: a bar over bars');
  // the K-map's groups (its legend, under its result once shown, #4057)
  await page.click(`${T} .tt-kmap-res .tt-kmap-on`);
  await page.waitFor((t) => document.querySelector(`${t} .tt-kmap-res .tt-legend code`), [T], { what: 'the K-map' });
  await page.waitFor((t) => document.querySelector(`${t} .tt-kmap-res .tt-legend code .ob`), [T], { what: 'the groups, their bars' });
  const groups = await drawn(page, `${T} .tt-legend code`);
  assert.equal(groups.length, 3);
  for (const d of groups) assert.ok(d.slash === overlineToSlash(d.text) && d.depth === depthOf(d.text) && d.above && d.hidden, JSON.stringify(d));
  // copied: the text as written, its overlines with it
  assert.equal(await page.eval((t) => {
    const code = document.querySelector(`${t} .tt-results > .tt-nor .tt-expr`);
    getSelection().selectAllChildren(code);
    const ev = new ClipboardEvent('copy', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
    code.dispatchEvent(ev);
    getSelection().removeAllRanges();
    return ev.clipboardData.getData('text/plain') === code.textContent && ev.defaultPrevented;
  }, T), true);
  // a state diagram's transition table, in the Settings' notation (#3915)
  await page.eval(async () => (await import('/js/notation.js')).notationMenu().submenu[0].action());   // (the first: Electronics / Engineering)
  await page.eval(() => window.SilinxApp.openFsm('src/nt.fsm.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/nt.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the state diagram' });
  await page.click(`${ED} .fsm-tab-btn`, { text: 'Tables' });
  await page.waitFor((ed) => document.querySelector(`${ed} .fsm-ttable td.mono .ob`), [ED], { what: 'the transition table, its bars drawn' });
  const conds = (await drawn(page, `${ED} .fsm-ttable td.ob-text`));
  assert.equal(conds.length, 2);
  for (const d of conds) assert.ok(d.slash === overlineToSlash(d.text) && d.depth === depthOf(d.text) && d.depth >= 1 && d.above && d.hidden, JSON.stringify(d));
  assert.equal(Math.max(...conds.map((d) => d.depth)), 2, 'NOT (a AND NOT b): two deep');
  await page.eval(async () => (await import('/js/notation.js')).notationMenu().submenu.find((x) => /^Text/.test(x.label))?.action());
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
