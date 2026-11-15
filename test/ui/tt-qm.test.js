// UI: the truth table's Karnaugh map and Quine-McCluskey results (#3939): after the forms of least gates and delay, the
// K-map's simplified function in SOP or POS as clicked (its map, under it while its Show K-map is pressed, #4057: its groups
// the same), Quine-McCluskey's with its steps (shown by its Show Steps button, #4057) (the columns of the implicants, the chart, the essential primes, the cover), each with its tick box (forms sop / pos,
// qsop / qpos, the HDL module in it); more than 6 inputs: no Karnaugh map (the console says so), Quine-McCluskey's; 16
// inputs: the rows drawn as they scroll into view, a cell clicked at the bottom, the result not proven minimal (the
// console's warning); the exact console lines; Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newTable, normalizeTable, generateTableHdl } from '../../core/logic.js';
import { showKmap } from './tt-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const T = '.doc:not([hidden]) .tt-editor';
const ins = (n) => Array.from({ length: n }, (_, i) => `x${i}`);

const open = async (page, p) => {
  await page.eval((p) => window.SilinxApp.openTt(p), p);
  await page.waitFor((p) => window.Silinx.active?.id === `tt:${p}` && document.querySelector('.doc:not([hidden]) .tt-results .tt-qm'), [p], { what: p });
};
const ev = (page, fn, ...a) => page.eval(fn, T, ...a);
const click = (page, sel) => ev(page, (t, s) => { const e = document.querySelector(`${t} ${s}`); e.scrollIntoView({ block: 'center' }); e.click(); }, sel);
const expr = (page, row) => ev(page, (t, r) => document.querySelector(`${t} .tt-res.${r} .tt-expr`)?.textContent ?? null, row);
const kinds = (page, row) => ev(page, (t, r) => [...document.querySelectorAll(`${t} .tt-res.${r} .tt-kind`)].map((b) => `${b.textContent}${b.classList.contains('active') ? '*' : ''}`), row);
const ticked = (page) => ev(page, (t) => [...document.querySelectorAll(`${t} .tt-hdl`)].filter((c) => c.checked).map((c) => c.closest('[class^="tt-canon-"], .tt-res').classList[1]));
const consoleAfterOpen = async (page) => {
  const lines = (await page.consoleText()).split('\n');
  return lines.slice(lines.findIndex((l) => /^Project ".*" opened/.test(l)) + 1);
};
const moduleHas = (page, f, re) => page.waitFor(async (f, src) => new RegExp(src).test(await (await fetch(`/api/projects/TtQm/file?path=${encodeURIComponent(f)}`)).text()), [f, re.source], { what: `${f}: ${re}`, timeout: 15000 });

uiTest('#3939 the K-map\'s and Quine-McCluskey\'s results: SOP or POS as clicked, the steps, the tick boxes; 7 and 16 inputs; the console; Portuguese', E, async (page) => {
  const cyc = normalizeTable({ ...newTable('cyc', ['a', 'b', 'c'], ['f']), table: { f: '11100111' }, generatedFile: 'src/cyc.vhd' });
  const seven = normalizeTable({ ...newTable('seven', ins(7), ['y']), table: { y: '0110'.repeat(32) } });
  let seed = 3, col = '';
  for (let i = 0; i < 2 ** 16; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; col += seed >> 16 & 1 ? '1' : '0'; }
  const big = normalizeTable({ ...newTable('big', ins(16), ['f']), table: { f: col } });
  await makeProject(env, { name: 'TtQm', files: {
    'src/cyc.bool.json': JSON.stringify(cyc, null, 2), 'src/cyc.vhd': generateTableHdl(cyc, 'vhdl', { source: 'cyc.bool.json' }).code,
    'src/seven.bool.json': JSON.stringify(seven, null, 2), 'src/big.bool.json': JSON.stringify(big),
  } });
  await page.openProject('TtQm');
  await open(page, 'src/cyc.bool.json');

  // ---- the order: least gates and delay, the Karnaugh map's, Quine-McCluskey's, then the others
  assert.deepEqual((await ev(page, (t) => [...document.querySelectorAll(`${t} .tt-results > .tt-res`)].map((r) => r.classList[1]))).slice(0, 5),
    ['tt-gates', 'tt-delay', 'tt-kmap-res', 'tt-qm', 'tt-canon']);
  // ---- the K-map's: SOP by default, POS clicked (its map, shown, #4057: its groups the 0s'), SOP clicked again (the map's groups the 1s')
  assert.deepEqual([await kinds(page, 'tt-kmap-res'), await expr(page, 'tt-kmap-res')], [['SOP*', 'POS'], 'f = /a./b + b./c + a.c']);
  await click(page, '.tt-kmap-res .tt-kind-pos');
  assert.deepEqual([await kinds(page, 'tt-kmap-res'), await expr(page, 'tt-kmap-res')], [['SOP', 'POS*'], 'f = (a + /b + /c).(/a + b + c)']);
  await showKmap(page, T);
  const legend = () => ev(page, (t) => [...document.querySelectorAll(`${t} .tt-kmap-res .tt-legend .tt-leg-cells`)].map((c) => c.textContent.trim()));
  assert.deepEqual(await legend(), ['M(3)', 'M(4)']);
  assert.equal(await ev(page, (t) => document.querySelectorAll(`${t} .tt-groups input[type=radio]`).length), 0, 'no SOP / POS radio buttons (#4057)');
  await click(page, '.tt-kmap-res .tt-kind-sop');
  await page.waitFor((t) => document.querySelector(`${t} .tt-kmap-res .tt-legend .tt-leg-cells`)?.textContent.includes('m('), [T], { what: 'the SOP groups' });
  assert.deepEqual(await kinds(page, 'tt-kmap-res'), ['SOP*', 'POS']);
  assert.deepEqual((await legend()).length, 3);
  // ---- Quine-McCluskey's: its SOP, its steps while its Show Steps button is pressed (#4057: a button, not a check box; the
  // columns, the chart, no essential prime, the cover)
  assert.deepEqual([await kinds(page, 'tt-qm'), await expr(page, 'tt-qm')], [['SOP*', 'POS'], 'f = /a./b + b./c + a.c']);
  assert.equal(await ev(page, (t) => document.querySelectorAll(`${t} .tt-qm-steps`).length), 0);
  const stepsBtn = () => ev(page, (t) => { const b = document.querySelector(`${t} .tt-qm .tt-qm-steps-on`);
    return [b.tagName, b.type, b.textContent, b.classList.contains('active'), b.getAttribute('aria-pressed'), !!b.querySelector('input'), document.querySelectorAll(`${t} .tt-qm-steps`).length]; });
  assert.deepEqual(await stepsBtn(), ['BUTTON', 'button', 'Show Steps', false, 'false', false, 0]);
  await click(page, '.tt-qm .tt-qm-steps-on');
  await page.waitFor((t) => document.querySelector(`${t} .tt-qm-steps`), [T], { what: 'the steps' });
  assert.deepEqual(await stepsBtn(), ['BUTTON', 'button', 'Hide Steps', true, 'true', false, 1]);
  const steps = () => ev(page, (t) => {
    const s = document.querySelector(`${t} .tt-qm-steps`);
    return { caps: [...s.querySelectorAll('.tt-qm-cap')].map((c) => c.textContent),
      cols: [...s.querySelectorAll('.tt-qm-col')].map((tb) => [...tb.querySelectorAll('tr')].slice(1).map((tr) => [...tr.children].map((c) => c.textContent).join(' '))),
      chart: [...s.querySelectorAll('.tt-qm-chart tr')].map((tr) => [...tr.children].map((c) => c.textContent).join('|')),
      lists: [...s.querySelectorAll('.tt-qm-list')].map((l) => l.textContent) };
  });
  assert.deepEqual(await steps(), {
    caps: ['Prime implicants, column by column', 'Prime implicant chart', 'Essential prime implicants', 'Cover: the essential prime implicants, then the fewest others that cover the rest (Petrick\'s method)'],
    cols: [['000 m(0) ✓', '001 m(1) ✓', '010 m(2) ✓', '101 m(5) ✓', '110 m(6) ✓', '111 m(7) ✓'], ['00- m(0, 1) ', '0-0 m(0, 2) ', '-01 m(1, 5) ', '-10 m(2, 6) ', '1-1 m(5, 7) ', '11- m(6, 7) ']],
    chart: ['|0|1|2|5|6|7', '00- /a./b|×|×||||', '0-0 /a./c|×||×|||', '-01 /b.c||×||×||', '-10 b./c|||×||×|', '1-1 a.c||||×||×', '11- a.b|||||×|×'],
    lists: ['None', 'f = /a./b + b./c + a.c'],
  });
  // its POS: the steps of the 0s
  await click(page, '.tt-qm .tt-kind-pos');
  assert.deepEqual([await kinds(page, 'tt-qm'), await expr(page, 'tt-qm'), (await steps()).caps[0], (await steps()).lists], [['SOP', 'POS*'], 'f = (a + /b + /c).(/a + b + c)', 'Prime implicants of the 0s, column by column', ['a + /b + /c, /a + b + c', 'f = (a + /b + /c).(/a + b + c)']]);
  // ---- its tick box: Quine-McCluskey's POS, the HDL module in it; SOP clicked: unticked (the HDL stays POS)
  assert.deepEqual(await ticked(page), ['tt-gates']);
  await click(page, '.tt-qm .tt-hdl');
  await page.waitFor((t) => document.querySelector(`${t} .tt-qm .tt-hdl`)?.checked, [T], { what: 'Quine-McCluskey ticked' });
  assert.equal(await page.eval(() => window.Silinx.active.ttEditor.getModel().forms?.f ?? window.Silinx.active.ttEditor.getModel().form), 'qpos');
  await moduleHas(page, 'src/cyc.vhd', /\(Quine-McCluskey POS, 6 literal\(s\), /);
  assert.match(await readWs(env, 'TtQm', 'src/cyc.vhd'), /f <= \(a or not b or not c\) and \(not a or b or c\);/);
  await click(page, '.tt-qm .tt-kind-sop');
  assert.deepEqual(await ticked(page), []);
  await click(page, '.tt-qm .tt-kind-pos');
  assert.deepEqual(await ticked(page), ['tt-qm']);
  // ---- Portuguese: the results' labels and the steps
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor((t) => document.querySelector(`${t} .tt-kmap-res b`)?.textContent === 'Mapa de Karnaugh', [T], { what: 'Portuguese' });
    assert.deepEqual(await ev(page, (t) => [document.querySelector(`${t} .tt-qm b`).textContent, document.querySelector(`${t} .tt-qm`).title, document.querySelector(`${t} .tt-qm-steps-on`).textContent, document.querySelector(`${t} .tt-kmap-on`).textContent,
      ...[...document.querySelectorAll(`${t} .tt-qm .tt-kind`)].map((b) => `${b.textContent}: ${b.title}`), ...[...document.querySelectorAll(`${t} .tt-qm-cap`)].map((c) => c.textContent)]), [
      'Quine-McCluskey', 'A função simplificada pelo algoritmo de Quine-McCluskey', 'Esconder Passos', 'Esconder Mapa K',
      'SdP: A função simplificada como soma de produtos (os seus 1s)', 'PdS: A função simplificada como produto de somas (os seus 0s)',
      'Implicantes primos dos 0s, coluna a coluna', 'Tabela de implicantes primos', 'Implicantes primos essenciais',
      'Cobertura: os implicantes primos essenciais, depois o menor número de outros que cobre o resto (método de Petrick)']);
    // the steps hidden: Mostrar Passos
    await click(page, '.tt-qm .tt-qm-steps-on');
    await page.waitFor((t) => !document.querySelector(`${t} .tt-qm-steps`) && document.querySelector(`${t} .tt-qm-steps-on`)?.textContent === 'Mostrar Passos', [T], { what: 'Mostrar Passos' });
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }

  // ---- 7 inputs: no Karnaugh map (no result of it, no button to show it; no caption of its own since #4057), Quine-McCluskey's; the console says so, once
  await open(page, 'src/seven.bool.json');
  assert.deepEqual(await ev(page, (t) => [!!document.querySelector(`${t} .tt-cap-kmap`), !!document.querySelector(`${t} svg.tt-kmap`), !!document.querySelector(`${t} .tt-kmap-res`), !!document.querySelector(`${t} .tt-kmap-on`)]), [false, false, false, false]);
  assert.equal(await expr(page, 'tt-qm'), 'y = /x5.x6 + x5./x6');
  assert.equal(await ev(page, (t) => document.querySelector(`${t} .tt-gates .tt-best-form`).textContent), 'Quine-McCluskey SOP');
  // ---- 16 inputs: 65536 rows, those in view drawn; the last one reached by scrolling and clicked
  await open(page, 'src/big.bool.json');
  const rows = () => ev(page, (t) => [...document.querySelectorAll(`${t} .tt-table tbody tr:not(.tt-spacer)`)].map((tr) => +tr.firstElementChild.textContent));
  const first = await rows();
  assert.ok(first.length < 200 && first[0] === 0, `${first.length} rows drawn`);
  assert.equal(await ev(page, (t) => document.querySelector(`${t} .tt-table-host`).classList.contains('tt-table-scroll')), true);
  await ev(page, (t) => { const h = document.querySelector(`${t} .tt-table-host`); h.scrollTop = h.scrollHeight; });
  await page.waitFor((t) => [...document.querySelectorAll(`${t} .tt-table tbody tr:not(.tt-spacer)`)].some((tr) => tr.firstElementChild.textContent === '65535'), [T], { what: 'the last row' });
  const last = await ev(page, (t) => document.querySelector(`${t} .tt-cell[data-row="65535"]`).textContent);
  await click(page, '.tt-cell[data-row="65535"]');
  await page.waitFor((t, v) => document.querySelector(`${t} .tt-cell[data-row="65535"]`)?.textContent === v, [T, last === '0' ? '1' : 'X'], { what: 'the last row changed' });
  assert.equal(await page.eval(() => window.Silinx.active.ttEditor.getModel().table.f.length), 65536);
  assert.match(await expr(page, 'tt-qm'), /^f = .+ \+ /);
  // its long expressions shown in part (the NAND form's tree would be megabytes), saying how many literals in all
  const more = await ev(page, (t) => [...document.querySelectorAll(`${t} .tt-res.tt-nand .tt-more, ${t} .tt-res.tt-qm .tt-more`)].map((m) => m.textContent));
  assert.equal(more.length, 2);
  for (const m of more) assert.match(m, /^ \(shown in part: \d+ literal\(s\) in all\)$/);
  assert.ok((await ev(page, (t) => document.querySelector(`${t} .tt-results`).textContent.length)) < 2e6);
  // ---- the console: the notes, each once (the 16-input table: not proven minimal, a warning, not again when a cell changes)
  const lines = (await consoleAfterOpen(page)).filter((l) => /Karnaugh|Quine-McCluskey/.test(l));
  assert.deepEqual(lines, [
    "seven: no Karnaugh map for more than 6 inputs (it has 7): the simplified function is Quine-McCluskey's.",
    "big: no Karnaugh map for more than 6 inputs (it has 16): the simplified function is Quine-McCluskey's.",
    "WARNING: big: f: Quine-McCluskey's SOP is not proven minimal (too many implicants: a cover heuristic).",   // (once, not at every change)
  ]);
});
