// UI: the divider between a truth table and its expressions (#4099, web/js/tt-divider.js): dragged right then left, the table's column as
// wide as dragged, the expressions at least 200px; ← → with the keyboard 20px a press; remembered for the next table
// opened; its tip in Portuguese; left out of the print view. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newTable, normalizeTable } from '../../core/logic.js';
import { capturePrints, confirmPrint, printOn, printed } from './print-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const T = '.doc:not([hidden]) .tt-editor';

uiTest('#4099 Boolean algebra: the divider between the table and the expressions moved left and right, remembered', E, async (page) => {
  const table = (name) => JSON.stringify(normalizeTable({ ...newTable(name, ['a', 'b', 'c'], ['f']), table: { f: '00010111' } }), null, 2);
  await makeProject(env, { name: 'Divider', files: { 'src/t1.bool.json': table('t1'), 'src/t2.bool.json': table('t2') } });
  await page.openProject('Divider');
  const open = async (p) => {
    await page.eval((f) => window.SilinxApp.openTt(f), p);
    await page.waitFor((f, t) => window.Silinx.active?.id === `tt:${f}` && document.querySelector(`${t} .tt-split`), [p, T], { what: p });
  };
  await open('src/t1.bool.json');
  const geo = () => page.eval((t) => {
    const l = document.querySelector(`${t} .tt-left`), d = document.querySelector(`${t} .tt-split`), r = document.querySelector(`${t} .tt-right`);
    const b = (e) => e.getBoundingClientRect();
    return { left: Math.round(b(l).width), right: Math.round(b(r).width), body: Math.round(b(l.parentElement).width), between: [Math.round(b(l).right), Math.round(b(d).left), Math.round(b(d).right), Math.round(b(r).left)],
      x: Math.round(b(d).left + b(d).width / 2), y: Math.round(b(d).top + 40), cursor: getComputedStyle(d).cursor, role: d.getAttribute('role') };
  }, T);
  const g0 = await geo();
  // (right of the table's column, left of the expressions, over the column's border)
  const [lr, dl, dr, rl] = g0.between;
  assert.ok(dl >= lr - 3 && dl <= lr + 1 && dr <= rl + 2, JSON.stringify(g0));
  assert.deepEqual([g0.cursor, g0.role], ['col-resize', 'separator']);
  // dragged right by 120px: the table's column 120px wider
  await page.drag({ x: g0.x, y: g0.y }, { x: g0.x + 120, y: g0.y });
  const g1 = await geo();
  assert.ok(Math.abs(g1.left - (g0.left + 120)) <= 2, JSON.stringify([g0, g1]));
  // dragged far right: the expressions keep 200px
  await page.drag({ x: g1.x, y: g1.y }, { x: g1.x + 3000, y: g1.y });
  const g2 = await geo();
  assert.ok(g2.right >= 199 && g2.right <= g2.body, JSON.stringify(g2));
  // back left by 300px from the first width; the keyboard: → 20px wider, ← narrower
  const g2b = await geo();
  await page.drag({ x: g2b.x, y: g2b.y }, { x: g1.x - 100, y: g2b.y });
  const g3 = await geo();
  assert.ok(Math.abs(g3.left - (g1.left - 100)) <= 3, JSON.stringify([g1, g3]));
  await page.eval((t) => document.querySelector(`${t} .tt-split`).focus(), T);
  await page.key('ArrowRight');
  await page.key('ArrowRight');
  assert.ok(Math.abs((await geo()).left - (g3.left + 40)) <= 2);
  await page.key('ArrowLeft');
  const g4 = await geo();
  assert.ok(Math.abs(g4.left - (g3.left + 20)) <= 2, JSON.stringify([g3, g4]));
  // remembered: the next table opened as wide
  await open('src/t2.bool.json');
  assert.ok(Math.abs((await geo()).left - g4.left) <= 2, 'the next table as wide');
  // the print view leaves it out
  await capturePrints(page);
  assert.ok(await printOn(page));
  await page.click('#toolbar .tb-btn[data-cmd=print]');
  await confirmPrint(page);
  const html = await printed(page, 1), body = html.slice(html.indexOf('<main'));   // (its page, not its styles)
  assert.match(body, /class="tt-left/);
  assert.doesNotMatch(body, /class="tt-split/);
  // its tip in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor((t) => document.querySelector(`${t} .tt-split`)?.title === 'Arraste para redimensionar o painel (← → com o teclado)', [T], { what: 'the tip in Portuguese' });
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
