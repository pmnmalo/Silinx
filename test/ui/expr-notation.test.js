// UI: the notation of the Boolean expressions shown (#3915): Electronics / Engineering when none is set; chosen in the
// Settings (Settings ▸ Boolean Notation; View ▸ Boolean Notation in the ISE style interface), kept in the browser; the
// truth table's results and K-map groups in it (the map shown, #4057), its ⋮ menu a notation of its own (#3939, saved with it; the Settings' by default); a state diagram's transition table in
// it, its arcs' conditions too (#4417: drawn in it, its Properties box and its edit in place text, never an overbar
// kept), drawn again when it changes; the menu in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { showKmap } from './tt-helpers.js';
import { normalizeFsm, fsmToAsm } from '../../core/fsm.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const T = '.doc:not([hidden]) .tt-editor';
const ED = '.doc:not([hidden]) .fsm-editor';
const B = '̅';

const table = JSON.stringify({ version: 1, name: 'm', inputs: ['a', 'b', 'c'], outputs: ['f'], table: { f: '01X10X10' }, exprs: {}, notes: '', form: 'sop', lang: 'vhdl' }, null, 2);
const fsm = JSON.stringify({
  name: 'nt', lang: 'vhdl', inputs: [{ name: 'a', width: 1 }, { name: 'b', width: 1 }], outputs: [{ name: 'z', width: 1, default: '0' }],
  states: [{ id: 's', name: 'S', x: 100, y: 100 }, { id: 'u', name: 'U', x: 300, y: 100, outputs: { z: '1' } }],
  transitions: [{ id: 't1', from: 's', to: 'u', cond: 'a && !b' }, { id: 't2', from: 'u', to: 's', cond: '!(a || b)' }], initial: 's',
}, null, 2);

// its ASM chart, its first decision as 15.27's conversions wrote it in the Engineering notation (an overbar, #4417)
const asm = (() => {
  const a = fsmToAsm(normalizeFsm(JSON.parse(fsm)));
  a.nodes.find((n) => n.id === 'd1').cond = `a.b${B}`;
  return JSON.stringify(a, null, 2);
})();

/** Settings ▸ Boolean Notation (View ▸ in the ISE style interface): its items [label, checked]; `pick` clicked. */
async function notationMenu(page, pick) {
  await page.closeMenus();
  const ise = await page.eval(() => document.documentElement.dataset.ui === 'ise');
  let items;
  if (ise) items = await page.openMenu((await page.eval(async () => (await import('/js/i18n.js')).getLanguage())) === 'pt' ? 'Ver' : 'View');
  else {
    await page.click('#settings-btn');
    await page.waitForSelector('body > .menu-popup .mi');
    items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup:not(.sub) > .mi .lbl')].map((l) => ({ label: l.textContent })));
  }
  const idx = items.findIndex((x) => /^(Boolean Notation|Notação Booleana)$/.test(x.label));
  assert.ok(idx >= 0, items.map((x) => x.label).join(' | '));
  await page.hover(await page.point(ise ? 'body > .menu-popup > .mi' : 'body > .menu-popup:not(.sub) > .mi', { index: idx }));
  await page.waitForSelector('.menu-popup.sub .mi');
  const subs = await page.eval(() => [...document.querySelectorAll('.menu-popup.sub .mi')].map((r) => [r.querySelector('.lbl').textContent, r.querySelector('.chk')?.textContent === '✓']));
  if (pick) await page.click('.menu-popup.sub .mi', { index: subs.findIndex(([l]) => l === pick) });
  else await page.closeMenus();
  return subs;
}

uiTest('#3915 the Boolean notation: Engineering by default; chosen in the Settings; the truth table\'s results and groups, a state diagram\'s transition table in it; Portuguese', E, async (page) => {
  // none set: Electronics / Engineering (the tests' pages start with the text notation, test/ui/harness.js)
  assert.deepEqual(await page.eval(async () => {
    const n = await import('/js/notation.js');
    const was = localStorage.getItem(n.NOTATION_KEY);
    localStorage.removeItem(n.NOTATION_KEY);
    const r = n.getNotation();
    localStorage.setItem(n.NOTATION_KEY, was);
    return [was, r];
  }), ['slash', 'engineering']);

  await makeProject(env, { name: 'Notation', files: { 'src/m.bool.json': table, 'src/nt.fsm.json': fsm, 'src/nt.asm.json': asm } });
  await page.openProject('Notation');
  await page.eval(() => window.SilinxApp.openTt('src/m.bool.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'tt:src/m.bool.json' && document.querySelector('.doc:not([hidden]) .tt-editor .tt-canon'), [], { what: 'the truth table' });
  await showKmap(page, T);   // (its groups' legend, #4057)
  const shown = () => page.eval((t) => ({
    canon: document.querySelector(`${t} .tt-canon-sop .tt-expr`).textContent,
    groups: [...document.querySelectorAll(`${t} .tt-leg code`)].map((c) => c.textContent),
    menu: document.querySelector(`${t} .tt-toolbar .tb-more-menu [aria-checked="true"]`)?.dataset.value,
  }), T);
  assert.deepEqual(await shown(), { canon: 'f = /a./b.c + /a.b.c + a.b./c', groups: ['/a.c', 'b./c'], menu: '' });

  // ---- the Settings: Logic / Set theory, kept; the table drawn again
  assert.deepEqual(await notationMenu(page, 'Logic / Set theory'),
    [['Electronics / Engineering', false], ['Text only', true], ['Logic / Set theory', false], ['VHDL', false], ['Verilog', false]]);
  await page.waitFor((t) => document.querySelector(`${t} .tt-canon-sop .tt-expr`)?.textContent.includes('¬a'), [T], { what: 'the table in the logic notation' });
  assert.deepEqual(await shown(), { canon: 'f = ¬a ∧ ¬b ∧ c ∨ ¬a ∧ b ∧ c ∨ a ∧ b ∧ ¬c', groups: ['¬a ∧ c', 'b ∧ ¬c'], menu: '' });
  assert.equal(await page.eval(async () => localStorage.getItem((await import('/js/notation.js')).NOTATION_KEY)), 'logic');
  // ---- the table's own notation, in its ⋮ menu (#3939): this table's, saved with it; the Settings' unchanged
  await page.eval((t) => document.querySelector(`${t} .tt-toolbar .tb-more-menu [data-value="engineering"]`).click(), T);
  await page.waitFor((t, b) => document.querySelector(`${t} .tt-canon-sop .tt-expr`)?.textContent.includes(`a${b}.b${b}.c`), [T, B], { what: 'the engineering notation' });
  assert.deepEqual(await shown(), { canon: `f = a${B}.b${B}.c + a${B}.b.c + a.b.c${B}`, groups: [`a${B}.c`, `b.c${B}`], menu: 'engineering' });
  assert.deepEqual((await notationMenu(page)).filter(([, c]) => c), [['Logic / Set theory', true]]);
  assert.equal(await page.eval(() => window.Silinx.active.ttEditor.getModel().notation), 'engineering');
  // the Settings changed again: the table keeps its own
  await notationMenu(page, 'Text only');
  assert.deepEqual(await shown(), { canon: `f = a${B}.b${B}.c + a${B}.b.c + a.b.c${B}`, groups: [`a${B}.c`, `b.c${B}`], menu: 'engineering' });
  await notationMenu(page, 'Electronics / Engineering');

  // ---- the state diagram: its transition table and its arcs in the notation (#4417), its Properties box as typed
  await page.eval(() => window.SilinxApp.openFsm('src/nt.fsm.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/nt.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the state diagram' });
  await page.click(`${ED} .fsm-tab-btn`, { text: 'Tables' });
  await page.waitForSelector(`${ED} .fsm-ttable`);
  const conds = () => page.eval((ed) => [...document.querySelectorAll(`${ed} .fsm-ttable tr`)].slice(1).map((tr) => tr.children[2].textContent), ED);
  const arcs = () => page.eval((ed) => [...document.querySelectorAll(`${ed} [data-trans] .fsm-label`)].map((l) => l.textContent), ED);
  const model = () => page.eval(() => window.Silinx.active.fsmEditor.getModel().transitions.map((t) => t.cond));
  assert.deepEqual(await conds(), [`a.b${B}`, 'otherwise (stays)', `a${B} ${B}+${B} ${B}b${B}`, 'otherwise (stays)']);
  assert.deepEqual(await arcs(), [`a.b${B}`, `a${B} ${B}+${B} ${B}b${B}`]);
  // the Properties box: the text as typed, no overbar
  // (clicked again while the view still moves: its fit after the Tables opened)
  for (let i = 0; ; i++) {
    try { await page.click(`${ED} [data-trans=t1] .fsm-label`); } catch { /* not there yet */ }
    if (await page.eval((ed) => !!(document.querySelector(`${ed} [data-trans=t1].sel`) && document.querySelector(`${ed} .fsm-cond`)), ED)) break;
    assert.ok(i < 20, 't1 not selected');
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .fsm-cond`).value, ED), 'a && !b');
  // an overbar typed (pasted) in it: kept as the text only notation's NOT, drawn with its bar
  await page.fill(`${ED} .fsm-cond`, `a${B}.b`);
  await page.waitFor(() => window.Silinx.active.fsmEditor.getModel().transitions[0].cond === '/a.b', [], { what: 'the condition kept as text' });
  await page.waitFor((ed, b) => document.querySelector(`${ed} [data-trans=t1] .fsm-label`)?.textContent === `a${b}.b`, [ED, B], { what: 'the arc drawn again' });
  // in place: the text, then a condition typed kept as it is
  await page.dblclick(`${ED} [data-trans=t1] .fsm-label`);
  await page.waitForSelector(`${ED} .fsm-inline`);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .fsm-inline`).value, ED), '/a.b');
  await page.fill(`${ED} .fsm-inline`, 'a && !b');
  await page.key('Enter');
  await page.waitFor((ed) => !document.querySelector(`${ed} .fsm-inline`), [ED], { what: 'the text in place closed' });
  assert.deepEqual(await model(), ['a && !b', '!(a || b)']);
  await notationMenu(page, 'VHDL');
  await page.waitFor(async (ed) => document.querySelector(`${ed} .fsm-ttable tr:nth-child(2) td:nth-child(3)`)?.textContent === 'a and not b', [ED], { what: 'the table in VHDL' });
  assert.deepEqual(await conds(), ['a and not b', 'otherwise (stays)', 'not (a or b)', 'otherwise (stays)']);
  assert.deepEqual(await arcs(), ['a and not b', 'not (a or b)']);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .fsm-cond`)?.value, ED), 'a && !b');
  assert.deepEqual(await model(), ['a && !b', '!(a || b)']);

  // ---- the ASM chart: its decisions drawn in the notation, its Properties box text (the overbar it was saved with: /…)
  await page.eval(() => window.SilinxApp.openAsm('src/nt.asm.json'));
  const AE = '.doc:not([hidden]) .asm-editor';
  await page.waitFor((ae) => window.Silinx.active?.id === 'asm:src/nt.asm.json' && document.querySelector(`${ae} [data-node=d1]`), [AE], { what: 'the ASM chart' });
  const decisions = () => page.eval((ae) => ['d1', 'd5'].map((id) => document.querySelector(`${ae} [data-node=${id}] .asm-text`).textContent), AE);
  assert.deepEqual(await decisions(), ['a and not b', 'not (a or b)']);
  assert.deepEqual(await page.eval(() => window.Silinx.active.asmEditor.getModel().nodes.filter((n) => n.type === 'decision').map((n) => n.cond)), ['a./b', '!(a || b)']);
  await notationMenu(page, 'Electronics / Engineering');
  await page.waitFor((ae, b) => document.querySelector(`${ae} [data-node=d1] .asm-text`)?.textContent === `a.b${b}`, [AE, B], { what: 'the decisions in the Engineering notation' });
  assert.deepEqual(await decisions(), [`a.b${B}`, `a${B} ${B}+${B} ${B}b${B}`]);
  await page.click(`${AE} [data-node=d1]`);
  await page.waitFor((ae) => [...document.querySelectorAll(`${ae} .asm-input`)].some((i) => i.value === 'a./b'), [AE], { what: 'the decision\'s Properties, text' });
  assert.ok(await page.eval((ae, b) => [...document.querySelectorAll(`${ae} .asm-input`)].every((i) => !i.value.includes(b)), AE, B));
  await notationMenu(page, 'VHDL');

  // ---- in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    assert.deepEqual(await notationMenu(page), [['Eletrónica / Engenharia', false], ['Só texto', false], ['Lógica / Teoria de conjuntos', false], ['VHDL', true], ['Verilog', false]]);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
});

// an HDL module converted to a state diagram (its context menu in the Design pane): the conditions written in the
// Settings' notation (#3915 part 2), its text form (the Engineering one's: text only, no overbar kept, #4417), drawn in it
uiTest('#3915 Convert to State Diagram writes its conditions in the Boolean notation of the Settings, as text (#4417)', E, async (page) => {
  const { normalizeFsm, generateFsm, fsmFromHdl, parseCond, isOtherwise } = await import('../../core/fsm.js');
  const { showCond } = await import('../../core/expr-notation.js');
  const m = normalizeFsm(JSON.parse(fsm));
  const vhd = generateFsm(m, 'vhdl').code;
  await makeProject(env, { name: 'NotationConv', files: { 'src/nt.vhd': vhd } });
  await page.openProject('NotationConv');
  await notationMenu(page, 'Electronics / Engineering');
  await page.treeRow('#hier', 'nt', { right: true, exact: true });
  await page.waitForSelector('body > .menu-popup');
  await page.click('body > .menu-popup .mi', { text: 'Convert to State Diagram (FSM)…' });
  await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/nt.fsm.json', [], { what: 'the state diagram', timeout: 15000 });
  const conds = () => page.eval(async () => JSON.parse(await (await fetch('/api/projects/NotationConv/file?path=src%2Fnt.fsm.json')).text()).transitions.map((t) => t.cond));
  const plain = fsmFromHdl(vhd, { path: 'src/nt.vhd' }).model.transitions.map((t) => t.cond);
  const shown = (n) => plain.map((c) => (isOtherwise(c) ? c : showCond(parseCond(c).ast, n)));
  assert.deepEqual(await conds(), shown('slash'));
  assert.ok((await conds()).every((c) => !c.includes(B)) && (await conds()).some((c) => c.includes('/')), (await conds()).join(' | '));
  // (its labels on the drawing: in the notation, its bars)
  assert.ok(shown('engineering').some((c) => c.includes(B)));
  assert.deepEqual(await page.eval((ed) => [...document.querySelectorAll(`${ed} [data-trans] .fsm-label`)].map((l) => l.textContent), ED), shown('engineering'));
});
