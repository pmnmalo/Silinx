// UI: the Electronics / Engineering notation's bars drawn (#4058, web/js/overbar.js): a NOT a line over its group, a
// negation inside a negation a box inside a box, each bar above the one under it, where its text writes combining
// overlines (U+0305) that fonts draw on top of each other. A table's NAND and NOR forms (bars over bars), its results'
// and K-map's groups, a state diagram's transition table: the boxes read back as the text notation's /( … ) equal
// core/overline.js's reading of the text; their text and what is copied unchanged (the overlines kept, hidden). No warnings.
// A state diagram's arcs and an ASM chart's decisions (SVG, #4484): drawn without the overlines, each bar one line over
// exactly its letters (measured on the screen against the characters' cells, at two zooms), an outer bar above the inner, in the
// text's colour in both themes; the state's transition list in its Properties drawn with the boxes.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newTable, normalizeTable, analyzeOutput } from '../../core/logic.js';
import { showExpr } from '../../core/expr-notation.js';
import { overlineToSlash, OVERLINE, barRuns } from '../../core/overline.js';
import { showCondText } from '../../core/expr-notation.js';
import { fsmToAsm, normalizeFsm } from '../../core/fsm.js';

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

/** Each SVG text of `sel` with bars: its text drawn and as written, and each of its bars on the screen against the
 *  characters it is over (their cells, from getExtentOfChar through the text's screen matrix), as barRuns places them. */
const svgBars = (page, sel) => page.eval((s) => [...document.querySelectorAll(s)].filter((t) => t.dataset.written).map((text) => {
  const m = text.getScreenCTM();
  const parts = [...text.querySelectorAll('tspan')];
  const cells = (el) => [...el.textContent].map((_, i) => {
    const e = el.getExtentOfChar(i);
    const p = new DOMPoint(e.x, e.y).matrixTransform(m), q = new DOMPoint(e.x + e.width, e.y + e.height).matrixTransform(m);
    return { left: p.x, right: q.x, top: p.y, bottom: q.y };
  });
  const lines = [...(text.nextElementSibling?.matches('.ob-bars') ? text.nextElementSibling.querySelectorAll('line') : [])].map((l) => {
    const r = l.getBoundingClientRect();
    return { level: +l.dataset.level, left: r.left, right: r.right, y: r.top + r.height / 2, stroke: getComputedStyle(l).stroke, width: parseFloat(getComputedStyle(l).strokeWidth) };
  });
  return { drawn: text.textContent, written: text.dataset.written, parts: (parts.length ? parts : [text]).map((el) => ({ text: el.textContent, cells: cells(el) })), lines, fill: getComputedStyle(text).fill };
}), sel);

/** `d`'s bars against barRuns' reading of what it wrote (one line, with one tspan): each over exactly its characters. */
function checkBars(d, what) {
  assert.ok(!d.drawn.includes(OVERLINE), `${what}: no overline drawn (${d.drawn})`);
  const { plain, bars } = barRuns(d.written);
  assert.equal(d.parts.map((p) => p.text).join(''), plain, `${what}: drawn as the text without its overlines`);
  const { cells } = d.parts[0];
  assert.equal(d.lines.length, bars.length, `${what}: one line per bar`);
  const top = Math.min(...cells.map((c) => c.top)), bottom = Math.max(...cells.map((c) => c.bottom)), h = bottom - top;
  for (const [k, b] of bars.entries()) {
    const l = d.lines[k];
    assert.equal(l.level, b.level, what);
    assert.ok(Math.abs(l.left - cells[b.from].left) < 0.6 && Math.abs(l.right - cells[b.to].right) < 0.6,
      `${what}: bar ${k} over exactly its letters ${JSON.stringify([l.left, l.right, cells[b.from].left, cells[b.to].right])}`);
    // (over the letters, near the top of their cells; a deeper one above it)
    assert.ok(l.y > top - h * 0.6 && l.y < top + h * 0.2, `${what}: bar ${k} at the top of its letters (${l.y}, ${top}–${bottom})`);
    assert.equal(l.stroke, d.fill, `${what}: in the text's colour`);
    assert.ok(l.width > 0, what);
  }
  // (a bar with none under it at one height; a bar over others above them: an outer NOT's the highest)
  const free = d.lines.filter((a) => !d.lines.some((b) => b.level > a.level && b.left >= a.left - 0.6 && b.right <= a.right + 0.6));
  for (const a of free) assert.ok(Math.abs(a.y - free[0].y) < 0.01, `${what}: the innermost bars at one height`);
  for (const a of d.lines) for (const b of d.lines) {
    if (b.level > a.level && b.left >= a.left - 0.6 && b.right <= a.right + 0.6) assert.ok(a.y < b.y - 1, `${what}: a bar over a bar above it`);
  }
}

uiTest('#4484 the Engineering notation\'s bars on a state diagram\'s arcs and an ASM chart\'s decisions: one line over each term', E, async (page) => {
  const fsm = {
    name: 'mul', lang: 'vhdl', inputs: [{ name: 'equal', width: 1 }, { name: 'a', width: 1 }, { name: 'b', width: 1 }], outputs: [{ name: 'inc', width: 1, default: '0' }],
    states: [{ id: 's', name: 'MUL2', x: 100, y: 100 }, { id: 'u', name: 'MUL3', x: 340, y: 100, outputs: { inc: '1' } }, { id: 'v', name: 'MUL4', x: 340, y: 300 }],
    transitions: [{ id: 't1', from: 's', to: 'u', cond: '!equal' }, { id: 't2', from: 'u', to: 'v', cond: '!(!a && b)' }, { id: 't3', from: 'v', to: 's', cond: '!a && !b' }], initial: 's',
  };
  const asm = fsmToAsm(normalizeFsm(fsm));
  await makeProject(env, { name: 'SvgBars', files: { 'src/mul.fsm.json': JSON.stringify(fsm, null, 2), 'src/mul.asm.json': JSON.stringify(asm, null, 2) } });
  await page.openProject('SvgBars');
  await page.eval(async () => (await import('/js/notation.js')).notationMenu().submenu[0].action());   // (Electronics / Engineering)
  const written = fsm.transitions.map((t) => showCondText(t.cond, 'engineering'));
  assert.ok(written.every((w) => w.includes(OVERLINE)) && written.some((w) => barRuns(w).bars.some((b) => b.level === 2)), 'the conditions: bars, one nested');
  try {
    // ---- the state diagram's arcs, at its fitted zoom and zoomed in, in both themes
    await page.eval(() => window.SilinxApp.openFsm('src/mul.fsm.json'));
    await page.waitFor(() => window.Silinx.active?.id === 'fsm:src/mul.fsm.json' && window.Silinx.active.fsmEditor?.fitted(), [], { what: 'the state diagram' });
    const nBars = written.reduce((n, w) => n + barRuns(w).bars.length, 0);
    await page.waitFor((ed, n) => document.querySelectorAll(`${ed} [data-trans] .ob-bars line`).length === n, [ED, nBars], { what: 'the arcs\' bars' });
    const arcs = async (what) => {
      const ds = await svgBars(page, `${ED} [data-trans] .fsm-label`);
      assert.deepEqual(ds.map((d) => d.written), written, what);
      for (const d of ds) checkBars(d, `${what}: ${d.written}`);
    };
    await arcs('fitted');
    const zoom = () => page.eval((ed) => document.querySelector(`${ed} .asm-zoom`).textContent, ED);
    const z0 = await zoom();
    await page.click(`${ED} [data-act=zin]`);
    await page.click(`${ED} [data-act=zin]`);
    await page.waitFor((ed, z) => document.querySelector(`${ed} .asm-zoom`).textContent !== z, [ED, z0], { what: 'zoomed in' });
    await new Promise((r) => setTimeout(r, 300));
    await new Promise((r) => setTimeout(r, 300));
    await arcs('zoomed in');
    await page.eval(async () => (await import('/js/silinx.js')).setTheme('dark'));
    await arcs('dark');
    await page.eval(async () => (await import('/js/silinx.js')).setTheme('light'));
    // the state's transition list (its Properties): the boxes of #4058, not the overlines drawn
    await page.click(`${ED} [data-state=u] .fsm-circle`);
    await page.waitFor((ed) => document.querySelector(`${ed} .fsm-tlist .fsm-tcond .ob`), [ED], { what: 'the transition list\'s bars' });
    const list = await drawn(page, `${ED} .fsm-tlist .fsm-tcond`);
    assert.deepEqual(list.map((d) => d.text), [written[1]]);
    assert.ok(list[0].slash === overlineToSlash(written[1]) && list[0].depth === 2 && list[0].above && list[0].hidden, JSON.stringify(list[0]));

    // ---- the ASM chart's decisions
    await page.eval(() => window.SilinxApp.openAsm('src/mul.asm.json'));
    const AE = '.doc:not([hidden]) .asm-editor';
    await page.waitFor((ae) => window.Silinx.active?.id === 'asm:src/mul.asm.json' && document.querySelector(`${ae} .asm-text + .ob-bars line`), [AE], { what: 'the ASM chart\'s bars' });
    const decisions = await svgBars(page, `${AE} .asm-text`);
    assert.deepEqual(decisions.map((d) => d.written).sort(), [...written].sort());
    for (const d of decisions) checkBars(d, `decision ${d.written}`);
    // another notation: no bars left
    await page.eval(async () => (await import('/js/notation.js')).notationMenu().submenu.find((x) => /^Text/.test(x.label))?.action());
    await page.waitFor((ae) => !document.querySelector(`${ae} .ob-bars`), [AE], { what: 'the bars gone' });
    assert.ok(await page.eval((ae) => [...document.querySelectorAll(`${ae} .asm-text`)].every((t) => !t.dataset.written), AE));
    // a text drawn while not laid out (a document's tab hidden): no bar yet, its bars once it is shown
    const hiddenText = await page.eval(async (w) => {
      const { drawSvgBarsIn } = await import('/js/overbar.js');
      const box = document.createElement('div');
      box.style.display = 'none';
      box.innerHTML = '<svg width="200" height="40"><text class="t" x="10" y="25" style="font: 14px monospace"></text></svg>';
      document.body.append(box);
      box.querySelector('.t').textContent = w;
      drawSvgBarsIn(box, '.t');
      const before = { lines: box.querySelectorAll('line').length, text: box.querySelector('.t').textContent };
      box.style.display = '';
      for (let i = 0; i < 50 && !box.querySelector('line'); i++) await new Promise((r) => requestAnimationFrame(r));
      const after = box.querySelectorAll('line').length;
      box.remove();
      return { before, after };
    }, written[1]);
    assert.deepEqual(hiddenText, { before: { lines: 0, text: barRuns(written[1]).plain }, after: barRuns(written[1]).bars.length });
  } finally {
    await page.eval(async () => (await import('/js/notation.js')).notationMenu().submenu.find((x) => /^Text/.test(x.label))?.action());
  }
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
