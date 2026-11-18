// UI (#4498): the AND-OR-INVERT gates 7451, 7454 (the 74LS54) and 7455 in the circuit editor, as every other gate IC: the
// Parts panel's row its symbol (its terms' ANDs into a NOR, in Settings ▸ Schematic Symbols' standard) and its tip; Show
// inside its gates as its datasheet's connection diagram (each term's AND turned toward the body's middle, the NOR facing
// its output pin), IEEE's shapes or IEC's boxes. The whole library: every IC's row has its tip and a symbol (but the
// latches': no symbol of the schematic's), in English and in Portuguese. Each circuit (the IC's bench: powered, its
// inputs on switches, its outputs on LEDs) checked with no errors and no warnings; no warnings on the page. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { icBench } from '../circuit-helpers.mjs';
import { checkCircuit } from '../../core/circuit-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const ED = '.doc:not([hidden]) .circuit-editor';
const AOI = { 7451: { terms: 4, nors: 2 }, 7454: { terms: 4, nors: 1 }, 7455: { terms: 2, nors: 1 } };
// (the latches: no latch among the schematic's symbols, #4505)
const NO_SYMBOL = ['7475', '7477', '74375', '74279', '74373', '74573'];

/** Settings ▸ Schematic Symbols (View ▸ in the ISE style interface), `pick` clicked. */
async function chooseSymbols(page, pick) {
  await page.closeMenus();
  const ise = await page.eval(() => document.documentElement.dataset.ui === 'ise');
  let items;
  if (ise) items = await page.openMenu('View');
  else {
    await page.click('#settings-btn');
    await page.waitForSelector('body > .menu-popup .mi');
    items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup:not(.sub) > .mi .lbl')].map((l) => ({ label: l.textContent })));
  }
  const idx = items.findIndex((x) => x.label === 'Schematic Symbols');
  assert.ok(idx >= 0, items.map((x) => x.label).join(' | '));
  await page.hover(await page.point(ise ? 'body > .menu-popup > .mi' : 'body > .menu-popup:not(.sub) > .mi', { index: idx }));
  await page.waitForSelector('.menu-popup.sub .mi');
  const subs = await page.eval(() => [...document.querySelectorAll('.menu-popup.sub .mi .lbl')].map((l) => l.textContent));
  await page.click('.menu-popup.sub .mi', { index: subs.indexOf(pick) });
}
// the library's ICs' rows: [type, tip, its preview's classes, its preview's gates by function]
const rows = (page) => page.eval(async (ed) => {
  const { PART_ORDER, partDef } = await import('/core/circuit-parts.js');
  return PART_ORDER.filter((t) => partDef(t).kind === 'ic').map((t) => {
    const b = document.querySelector(`${ed} .circ-lib-part[data-part="${t}"]`);
    const sv = b?.querySelector('svg');
    return [t, b?.getAttribute('title') ?? null, sv?.getAttribute('class') ?? null, sv ? [...sv.querySelectorAll('[data-fn]')].map((e) => `${e.tagName}:${e.dataset.fn}`).join(' ') : null];
  });
}, ED);
// an IC's inside: its IEEE shapes [fn, turned], its IEC boxes' qualifiers, its pins' names, its lines
const inside = (page) => page.eval((ed) => {
  const ic = document.querySelector(`${ed} [data-id=U1]`);
  return { shapes: [...ic.querySelectorAll('.circ-gate-ieee')].map((g) => [g.dataset.fn, g.dataset.rot ?? '0']).sort(),
    boxes: [...ic.querySelectorAll('.circ-gate-text')].map((t) => t.textContent).sort(),
    names: [...ic.querySelectorAll('.circ-pin-name')].map((t) => t.textContent).sort(), lines: ic.querySelectorAll('polyline.circ-gate-line').length };
}, ED);

uiTest('#4498 the AND-OR-INVERT gates: their symbols in the Parts panel, their gates inside, both standards; every IC\'s row its tip and symbol; Portuguese', () => env, async (page) => {
  const files = {};
  for (const t of Object.keys(AOI)) {
    const m = icBench(t, { name: `aoi${t}` });
    // (each bench powered, every input on a switch and every output on an LED: nothing to report)
    assert.deepEqual(checkCircuit(m).map((x) => `${x.severity}: ${x.message}`), [], t);
    files[`src/aoi${t}.circ.json`] = JSON.stringify(m, null, 2);
  }
  await makeProject(env, { name: 'AoiPj', top: '', files });
  await page.setViewport(1440, 900);
  await page.openProject('AoiPj');
  await page.eval(() => { for (const k of ['silinx.circuit.inside', 'silinx.symbols']) try { localStorage.removeItem(k); } catch { /* none */ } });
  await page.eval(() => window.SilinxApp.openFile('src/aoi7451.circ.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-id=U1]`) && document.querySelector(`${ed} .circ-lib-part[data-part="7451"]`), [ED], { what: 'the circuit editor' });

  // the Parts panel: the three rows' tips and their symbols (IEEE: their ANDs' D, their NOR's shield)
  let all = await rows(page);
  const aoi = (t) => all.find((r) => r[0] === t);
  assert.deepEqual(['7451', '7454', '7455'].map((t) => aoi(t)[1]), ['Dual AND-OR-INVERT (3-3 and 2-2 inputs): click it, then the drawing (Esc: done)',
    '4-wide AND-OR-INVERT (2-3-3-2 inputs): click it, then the drawing (Esc: done)', '2-wide 4-input AND-OR-INVERT: click it, then the drawing (Esc: done)']);
  assert.deepEqual(['7451', '7454', '7455'].map((t) => [aoi(t)[2], aoi(t)[3]]), [
    ['circ-pv circ-pv-sym circ-pv-aoi', 'path:and path:and path:nor'], ['circ-pv circ-pv-sym circ-pv-aoi', 'path:and path:and path:and path:and path:nor'],
    ['circ-pv circ-pv-sym circ-pv-aoi', 'path:and path:and path:nor']]);
  // every IC of the library: its row, its tip (its title's), a symbol (but the latches')
  const titles = await page.eval(async () => { const { PART_ORDER, partDef } = await import('/core/circuit-parts.js'); return Object.fromEntries(PART_ORDER.filter((t) => partDef(t).kind === 'ic').map((t) => [t, partDef(t).title])); });
  assert.ok(all.length >= 115, `${all.length} ICs`);
  for (const [t, tip, cls] of all) {
    assert.equal(tip, `${titles[t]}: click it, then the drawing (Esc: done)`, t);
    assert.equal(/\bcirc-pv-sym\b/.test(cls), !NO_SYMBOL.includes(t), `${t}: ${cls}`);
  }

  // Show inside: each IC's terms' ANDs (turned up or down) and its NORs; only VCC and GND named
  await page.click(`${ED} .circ-inside`);
  for (const [t, { terms, nors }] of Object.entries(AOI)) {
    if (t !== '7451') {
      await page.eval((f) => window.SilinxApp.openFile(f), `src/aoi${t}.circ.json`);
      await page.waitFor((ed, n) => document.querySelector(`${ed} [data-id=U1] title`)?.textContent === `U1  SN74LS${n.slice(2)}`, [ED, t], { what: `the ${t}` });
    }
    await page.waitFor((ed, n) => document.querySelectorAll(`${ed} [data-id=U1] .circ-gate-ieee`).length === n, [ED, terms + nors], { what: `the ${t}'s gates` });
    const ins = await inside(page);
    assert.deepEqual(ins.shapes.map((s) => s[0]), [...Array(terms).fill('and'), ...Array(nors).fill('nor')], t);
    for (const [fn, rot] of ins.shapes) assert.ok(fn === 'and' ? ['90', '-90'].includes(rot) : rot === '0', `${t} ${fn} ${rot}`);
    assert.deepEqual(ins.names, ['GND', 'VCC'], t);
    // (a line an input, a line a term into its NOR, a line an output)
    assert.equal(ins.lines, { 7451: 10 + 4 + 2, 7454: 10 + 4 + 1, 7455: 8 + 2 + 1 }[t], t);
  }

  // IEC 60617-12: & boxes into ≥1 boxes, inside and in the Parts panel, at once
  await chooseSymbols(page, 'IEC 60617-12 (rectangular)');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} [data-id=U1] rect.circ-gate`).length === 3, [ED], { what: 'the 7455\'s boxes' });
  assert.deepEqual((await inside(page)).boxes, ['&', '&', '≥1']);
  all = await rows(page);
  assert.deepEqual(['7451', '7454', '7455'].map((t) => aoi(t)[3]), ['rect:and rect:and rect:nor', 'rect:and rect:and rect:and rect:and rect:nor', 'rect:and rect:and rect:nor']);
  await chooseSymbols(page, 'IEEE Std 91-1984 (distinctive shapes)');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} [data-id=U1] .circ-gate-ieee`).length === 3, [ED], { what: 'the shapes again' });

  // in Portuguese: the three rows' tips, and every IC's translated
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor((ed) => /clique nela/.test(document.querySelector(`${ed} .circ-lib-part[data-part="7451"]`).getAttribute('title')), [ED], { what: 'the tips in Portuguese' });
  all = await rows(page);
  assert.deepEqual(['7451', '7454', '7455'].map((t) => aoi(t)[1]), ['Duas portas AND-OR-INVERT (3-3 e 2-2 entradas): clique nela e depois no desenho (Esc: terminar)',
    'Uma porta AND-OR-INVERT de 4 termos (2-3-3-2 entradas): clique nela e depois no desenho (Esc: terminar)', 'Uma porta AND-OR-INVERT de 2 termos de 4 entradas: clique nela e depois no desenho (Esc: terminar)']);
  for (const [t, tip] of all) assert.match(tip, /: clique nela e depois no desenho \(Esc: terminar\)$/, t);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  await page.eval(() => { for (const k of ['silinx.circuit.inside', 'silinx.symbols']) try { localStorage.removeItem(k); } catch { /* none */ } });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 150000 });
