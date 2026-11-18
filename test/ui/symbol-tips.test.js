// UI (#4524): IEC 60617-12's symbols in the panels. With Settings ▸ Schematic Symbols set to IEC, the Schematic editor's
// Symbols panel draws each gate's qualifier in its thumbnail (& AND / NAND, ≥1 OR / NOR, =1 XOR / XNOR, 1 the inverter),
// inside its box and large enough to read, so the eight logic thumbnails all differ (their qualifier, their bubble); in
// IEEE, none. A row's tip is a card: its drawing larger (the qualifier in it), its name, what it does, how it is drawn in
// the standard chosen, then how to place it; the browser's own tip held back while it shows, given back after. The
// circuit editor's Parts panel the same: its gate ICs' qualifiers, an AND-OR-INVERT's, an MSI IC's general qualifier
// (CTR, X/Y, MUX), and their cards. In Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const SE = '.doc:not([hidden]) .sch-editor', CE = '.doc:not([hidden]) .circuit-editor';
const warnings = (page) => page.console.filter((m) => /^warn|^error/.test(m.type)).map((m) => m.text);
const LOGIC = ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR', 'INV'];

// the standard chosen, as Settings ▸ Schematic Symbols does
const standard = (page, id) => page.eval(async (k) => {
  const { symbolsMenu } = await import('/js/symbol-standard.js');
  symbolsMenu().submenu[k].action();
}, id === 'iec' ? 1 : 0);

// a panel's rows' thumbnails: [name, qualifiers, bubbles, each qualifier inside its box and its font's size]
const thumbs = (page, sel, names) => page.eval((s, ns) => ns.map((n) => {
  const row = [...document.querySelectorAll(s)].find((r) => (r.querySelector('.nm')?.textContent.trim() ?? r.dataset.part) === n || r.dataset.part === n);
  const svg = row.querySelector('svg'), qs = [...svg.querySelectorAll('.pv-q')];
  const boxes = [...svg.querySelectorAll('rect.gate, rect.box, path.gate')].map((b) => b.getBoundingClientRect());
  const inside = qs.every((q) => {
    const r = q.getBoundingClientRect();
    return boxes.some((b) => r.left >= b.left - 0.5 && r.right <= b.right + 0.5 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1);
  });
  return [n, qs.map((q) => q.textContent).join(' '), svg.querySelectorAll('circle.gate').length, inside, Math.min(99, ...qs.map((q) => parseFloat(getComputedStyle(q).fontSize)))];
}), sel, names);

// the card shown for a row (the mouse on it): its drawing's size and qualifiers, its lines; the row's title meanwhile
async function card(page, sel, opts) {
  // (a Symbols panel's row by its name: its text has its thumbnail's qualifier too)
  // (in the middle of its list: not under a group's heading, which stays at the top)
  await page.eval((q, t) => [...document.querySelectorAll(q)].find((e) => t == null || e.textContent.trim() === t).scrollIntoView({ block: 'center' }), opts.text != null ? `${sel} .nm` : sel, opts.text ?? null);
  await page.hover(await page.point(opts.text != null ? `${sel} .nm` : sel, opts));
  await page.waitFor(() => document.querySelector('.sym-tip'), [], { what: `the card of ${opts.text ?? sel}` });
  return page.eval((s, o) => {
    const c = document.querySelector('.sym-tip'), pv = c.querySelector('svg');
    const row = o.text != null ? [...document.querySelectorAll(s)].find((r) => r.querySelector('.nm')?.textContent.trim() === o.text) : document.querySelectorAll(s)[o.index ?? 0];
    const r = row.getBoundingClientRect(), k = c.getBoundingClientRect();
    return { w: pv.getBoundingClientRect().width, q: [...pv.querySelectorAll('.pv-q')].map((x) => x.textContent), name: c.querySelector('.sym-tip-name').textContent,
      lines: [...c.querySelectorAll('.sym-tip-line')].map((x) => x.textContent), how: c.querySelector('.sym-tip-how')?.textContent ?? '',
      title: row.getAttribute('title'), beside: k.left >= r.right || k.right <= r.left };
  }, sel, opts);
}
// the mouse away: the card gone, the row's title back
async function away(page, sel, opts) {
  await page.mouse('mouseMoved', 5, 5);
  await page.waitFor(() => !document.querySelector('.sym-tip'), [], { what: 'the card gone' });
  return page.eval((s, o) => [...document.querySelectorAll(s)].find((r) => (o.text != null ? r.querySelector('.nm')?.textContent.trim() === o.text : r.dataset.part === o.part)).getAttribute('title'), sel, opts);
}

uiTest('#4524 IEC thumbnails with their qualifiers, all distinct; the tips\' cards in the Symbols and Parts panels; Portuguese', E, async (page) => {
  const doc = newDoc('tips', 'vhdl');
  await makeProject(env, { name: 'Tips', top: '', files: { 'src/tips.sch.json': JSON.stringify(doc), 'src/half_adder.circ.json': JSON.stringify(halfAdder(), null, 2) } });
  await page.setViewport(1440, 900);
  await page.openProject('Tips');
  await standard(page, 'iec');
  try {
    await page.eval(() => window.SilinxApp.openFile('src/tips.sch.json'));
    await page.waitFor((ed) => document.querySelector(`${ed} .se-symrow`), [SE], { what: 'the Symbols panel' });
    const ROW = `${SE} .se-symrow`;
    // ---- the Symbols panel in IEC: each logic thumbnail its qualifier, in its box, 8 px or more; all seven different
    const iec = await thumbs(page, ROW, LOGIC);
    assert.deepEqual(iec.map(([n, q, b, inside]) => [n, q, b, inside]), [['AND', '&', 0, true], ['OR', '≥1', 0, true], ['NAND', '&', 1, true],
      ['NOR', '≥1', 1, true], ['XOR', '=1', 0, true], ['XNOR', '=1', 1, true], ['INV', '1', 1, true]]);
    for (const [n, , , , size] of iec) assert.ok(size >= 8, `${n}: ${size} px`);
    assert.equal(new Set(iec.map(([, q, b]) => `${q}/${b}`)).size, LOGIC.length);
    // the card: the drawing 2.5 times larger with its qualifier, the name, the function, the look, how to place it
    const tip = await page.eval((s) => [...document.querySelectorAll(s)].find((r) => r.querySelector('.nm').textContent === 'NOR').title, ROW);
    const nor = await card(page, ROW, { text: 'NOR' });
    assert.deepEqual(nor, { w: 135, q: ['≥1'], name: 'NOR', lines: ['NOR: OR with an inverted output, 1 when all of its inputs are 0', 'IEC 60617-12: a box with ≥1, a bubble on its output'],
      how: tip, title: null, beside: true });
    assert.equal(await away(page, ROW, { text: 'NOR' }), tip);
    const and = await card(page, ROW, { text: 'AND' });
    assert.deepEqual([and.q, and.lines], [['&'], ['AND: 1 when all of its inputs are 1', 'IEC 60617-12: a box with &']]);
    await away(page, ROW, { text: 'AND' });
    // (a click on a row: the card gone, the title back; placing as before)
    await page.hover(await page.point(`${ROW} .nm`, { text: 'XOR' }));
    await page.waitFor(() => document.querySelector('.sym-tip'), [], { what: 'the card' });
    await page.click(`${ROW} .nm`, { text: 'XOR' });
    await page.waitFor(() => !document.querySelector('.sym-tip'), [], { what: 'the card gone at the click' });
    await new Promise((r) => setTimeout(r, 700));   // (not back while the mouse stays on the row, the panel drawn again under it)
    assert.equal(await page.eval(() => document.querySelector('.sym-tip')), null);
    assert.ok(await page.eval((s) => [...document.querySelectorAll(s)].find((r) => r.querySelector('.nm').textContent === 'XOR').title, ROW));
    await page.key('Escape');
    // ---- IEEE: no qualifiers, the distinctive shapes' looks
    await standard(page, 'ieee');
    await page.waitFor((s) => !document.querySelector(`${s} .se-pv .pv-q`), [ROW], { what: 'the IEEE thumbnails' });
    assert.deepEqual((await card(page, ROW, { text: 'XNOR' })).lines, ['XNOR: XOR with an inverted output, 1 when an even number of its inputs are 1',
      "IEEE Std 91-1984: the OR's shield with a second back, a bubble on its output"]);
    await away(page, ROW, { text: 'XNOR' });
    await standard(page, 'iec');
    await page.waitFor((s) => document.querySelector(`${s} .se-pv .pv-q`), [ROW], { what: 'the IEC thumbnails again' });

    // ---- the circuit editor's Parts panel in IEC: the gate ICs', an AND-OR-INVERT's, the MSI ICs' qualifiers
    await page.eval(() => window.SilinxApp.openFile('src/half_adder.circ.json'));
    await page.waitFor((ed) => document.querySelector(`${ed} .circ-lib-part[data-part="7400"] .pv-q`), [CE], { what: 'the Parts panel' });
    const PART = `${CE} .circ-lib-part`;
    const parts = await thumbs(page, PART, ['7400', '7402', '7486', '7404', '7408', '7432', '7451', '74161', '74138', '74151', '7447', '4021', '74147']);
    // (each MSI IC's qualifier its card's too, #4531: a MUX8's smaller, BCD/7SEG and HPRI/BIN on two lines, at their '/')
    assert.deepEqual(parts.map(([n, q, , inside]) => [n, q, inside]), [['7400', '&', true], ['7402', '≥1', true], ['7486', '=1', true], ['7404', '1', true],
      ['7408', '&', true], ['7432', '≥1', true], ['7451', '& & ≥1', true], ['74161', 'CTR', true], ['74138', 'X/Y', true], ['74151', 'MUX', true], ['7447', 'BCD/ 7SEG', true],
      ['4021', 'SRG', true], ['74147', 'HPRI/ BIN', true]]);
    for (const [n, , , , size] of parts.slice(9)) assert.ok(size >= 4, `${n}: ${size} px`);
    for (const [n, , , , size] of parts.slice(0, 6)) assert.ok(size >= 8, `${n}: ${size} px`);
    const sel = `${PART}[data-part="7402"]`;
    const c02 = await card(page, sel, {});
    assert.deepEqual([c02.w, c02.q, c02.lines, c02.title, c02.beside], [135, ['≥1'], ['NOR: OR with an inverted output, 1 when all of its inputs are 0',
      'IEC 60617-12: a box with ≥1, a bubble on its output'], null, true]);
    assert.match(c02.how, /: click it, then the drawing \(Esc: done\)$/);
    assert.match(await away(page, PART, { part: '7402' }), /: click it, then the drawing \(Esc: done\)$/);
    const c161 = await card(page, `${PART}[data-part="74161"]`, {});
    assert.deepEqual([c161.q, c161.lines], [['CTR'], ['IEC 60617-12: a box with CTR']]);
    await away(page, PART, { part: '74161' });
    const c151 = await card(page, `${PART}[data-part="74151"]`, {});
    assert.deepEqual([c151.w, c151.q, c151.lines], [135, ['MUX'], ['IEC 60617-12: a box with MUX']]);
    await away(page, PART, { part: '74151' });
    const c147 = await card(page, `${PART}[data-part="74147"]`, {});
    assert.deepEqual([c147.q, c147.lines], [['HPRI/BIN'], ['IEC 60617-12: a box with HPRI/BIN']]);
    await away(page, PART, { part: '74147' });
    // (a breadboard: its drawing, no lines)
    const bb = await card(page, `${PART}[data-part="breadboard-half"]`, {});
    assert.deepEqual([bb.q, bb.lines], [[], []]);
    await away(page, PART, { part: 'breadboard-half' });

    // ---- Portuguese
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    try {
      const pt = await card(page, `${PART}[data-part="7402"]`, {});
      assert.deepEqual(pt.lines, ['NOR: OR com a saída invertida, 1 quando todas as suas entradas são 0', 'IEC 60617-12: uma caixa com ≥1, uma bolha na saída']);
      assert.match(pt.how, /clique nela/);
      await away(page, PART, { part: '7402' });
      await page.eval(() => window.SilinxApp.openFile('src/tips.sch.json'));
      await page.waitFor((ed) => document.querySelector(`${ed} .se-symrow`), [SE], { what: 'the Symbols panel' });
      assert.deepEqual((await card(page, ROW, { text: 'INV' })).lines, ['Inversor (NOT): a sua entrada invertida', 'IEC 60617-12: uma caixa com 1, uma bolha na saída']);
      await away(page, ROW, { text: 'INV' });
    } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  } finally { await standard(page, 'ieee'); }
  assert.deepEqual(warnings(page), []);
});
