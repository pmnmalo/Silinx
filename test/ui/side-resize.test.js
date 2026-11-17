// UI: every side panel's width dragged (#4316, web/js/side-resize.js): the Schematic editor's Symbols (left) and
// Properties (right), the Circuit editor's Parts (left), the ASM and FSM editors' Properties (right): its handle over
// the panel's inner edge (col-resize, a separator); dragged wider and narrower, clamped to the minimum (160 px) and to
// the maximum (720 px, the canvas keeping 200 px); remembered when the document is opened again; ← → from the keyboard;
// a double-click gives the default width back; folded, no handle and the strip's width, expanded, the width kept; on a
// narrow screen (the panel over the canvas behind ☰) dragged too; the tip in Portuguese; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DOC = '.doc:not([hidden])';

const geo = (page, ed, side) => page.eval((d, ed, s) => {
  const root = document.querySelector(`${d} ${ed}`), el = root.querySelector(s), hd = el.nextElementSibling;
  const b = (e) => e.getBoundingClientRect(), sr = b(el), hr = b(hd);
  let canvas = 0;
  for (const c of el.parentElement.children) if (c !== el && !c.classList.contains('side-resize')) canvas = Math.max(canvas, c.offsetWidth);
  return { width: Math.round(sr.width), left: Math.round(sr.left), right: Math.round(sr.right), canvas, row: el.parentElement.clientWidth,
    handle: hd.classList.contains('side-resize') && !hd.hidden && hr.width > 0, hx: Math.round(hr.left + hr.width / 2), hy: Math.round(hr.top + hr.height / 2),
    cursor: getComputedStyle(hd).cursor, role: hd.getAttribute('role'), title: hd.title };
}, DOC, ed, side);
const stored = (page, key) => page.eval(async (k) => localStorage.getItem((await import('/js/prefs.js')).prefKey(k)), key);
const forget = (page, keys) => page.eval(async (ks) => { const { prefKey } = await import('/js/prefs.js'); for (const k of ks) localStorage.removeItem(prefKey(k)); }, keys);

/** One panel: `open` opens its document; `ed` the editor, `side` the panel, `toward` its side, `key` its width's key,
 *  `fold` its fold button. */
async function checkPanel(page, { open, ed, side, toward, key, fold }) {
  const what = `${ed} ${side}`;
  await open();
  const g0 = await geo(page, ed, side);
  assert.deepEqual([g0.handle, g0.cursor, g0.role, g0.title], [true, 'col-resize', 'separator', 'Drag to resize the panel (← → with the keyboard, a double-click: its default width)'], what);
  const edge = toward === 'left' ? g0.right : g0.left;
  assert.ok(Math.abs(g0.hx - edge) <= 2, `${what}: the handle over the inner edge ${JSON.stringify(g0)}`);
  const out = toward === 'left' ? 1 : -1;   // the way that widens the panel
  const dragBy = async (dx) => { const g = await geo(page, ed, side); await page.drag({ x: g.hx, y: g.hy }, { x: g.hx + dx, y: g.hy }); return geo(page, ed, side); };
  // wider by 80 px, the canvas narrower by as much
  const g1 = await dragBy(out * 80);
  assert.ok(Math.abs(g1.width - (g0.width + 80)) <= 2 && Math.abs(g1.canvas - (g0.canvas - 80)) <= 3, `${what}: ${JSON.stringify([g0, g1])}`);
  assert.equal(Number(await stored(page, key)), g1.width);
  // the minimum, then the maximum (or the canvas's room)
  assert.equal((await dragBy(-out * 2000)).width, 160, `${what}: the minimum`);
  const gMax = await dragBy(out * 3000);
  assert.ok(gMax.width <= 720 && gMax.canvas >= 198 && (gMax.width >= 718 || gMax.canvas <= 202), `${what}: the maximum ${JSON.stringify(gMax)}`);
  // back to 60 px wider than the default; the keyboard: 20 px a press
  await dragBy(-out * (gMax.width - (g0.width + 40)));
  await page.eval((d, ed, s) => document.querySelector(`${d} ${ed} ${s}`).nextElementSibling.focus(), DOC, ed, side);
  await page.key(toward === 'left' ? 'ArrowRight' : 'ArrowLeft');
  const g2 = await geo(page, ed, side);
  assert.ok(Math.abs(g2.width - (g0.width + 60)) <= 3, `${what}: ${JSON.stringify([g0, g2])}`);
  // remembered: the document closed and opened again
  await page.eval(() => window.SilinxApp.closeDoc(window.Silinx.active));
  await open();
  assert.equal((await geo(page, ed, side)).width, g2.width, `${what}: reopened`);
  // folded: the strip, no handle; expanded: the width kept
  await page.click(`${DOC} ${ed} ${fold}`);
  const gf = await geo(page, ed, side);
  assert.deepEqual([gf.width, gf.handle], [24, false], what);
  await page.click(`${DOC} ${ed} ${fold}`);
  const ge = await geo(page, ed, side);
  assert.deepEqual([ge.width, ge.handle], [g2.width, true], what);
  // a double-click: the default width again, nothing kept
  await page.dblclick({ x: ge.hx, y: ge.hy });
  assert.equal((await geo(page, ed, side)).width, g0.width, `${what}: the default again`);
  assert.equal(await stored(page, key), null);
  return g0;
}

uiTest('#4316 every side panel resizable: dragged, clamped, remembered, the keyboard, folded, reset by a double-click; narrow; Portuguese', E, async (page) => {
  await page.setViewport(1440, 900);
  const KEYS = ['silinx.sch.symbols.width', 'silinx.sch.props.width', 'silinx.circuit.parts.width', 'silinx.asm.props.width', 'silinx.fsm.props.width',
    'silinx.sch.symbols.folded', 'silinx.sch.props.folded', 'silinx.circuit.parts.folded', 'silinx.asm.props.folded', 'silinx.fsm.props.folded', 'silinx.narrow.props'];
  const opener = (path, ed, side) => async () => {
    await page.eval((p) => window.SilinxApp.openFile(p), path);
    await page.waitFor((d, ed, s) => document.querySelector(`${d} ${ed} ${s}`)?.nextElementSibling?.classList.contains('side-resize') && document.querySelector(`${d} ${ed} ${s}`).offsetWidth > 0, [DOC, ed, side], { what: path });
  };
  await makeProject(env, { name: 'ResizeSch', template: 'gates' });
  await page.openProject('ResizeSch');
  await forget(page, KEYS);
  const sch = (side) => ({ open: opener('src/gates.sch.json', '.sch-editor', side), ed: '.sch-editor', side });
  await checkPanel(page, { ...sch('.se-left'), toward: 'left', key: 'silinx.sch.symbols.width', fold: '.se-fold[data-fold=symbols]' });
  await checkPanel(page, { ...sch('.se-right'), toward: 'right', key: 'silinx.sch.props.width', fold: '.se-fold[data-fold=props]' });
  // each panel its own width: the Symbols' left as it was when Properties changed
  await makeProject(env, { name: 'ResizeCirc', template: 'breadboard' });
  await page.openProject('ResizeCirc');
  await checkPanel(page, { open: opener('src/breadboard.circ.json', '.circuit-editor', '.circ-parts-side'), ed: '.circuit-editor', side: '.circ-parts-side', toward: 'left', key: 'silinx.circuit.parts.width', fold: '.circ-parts-side .asm-fold' });
  await makeProject(env, { name: 'ResizeAsm', template: 'blinky' });
  await page.openProject('ResizeAsm');
  const asm = { open: opener('src/speed_ctrl.asm.json', '.asm-editor', '.asm-side'), ed: '.asm-editor', side: '.asm-side', toward: 'right', key: 'silinx.asm.props.width', fold: '.asm-side .asm-fold' };
  const a0 = await checkPanel(page, asm);
  await makeProject(env, { name: 'ResizeFsm', template: 'traffic' });
  await page.openProject('ResizeFsm');
  await checkPanel(page, { open: opener('src/traffic.fsm.json', '.asm-editor', '.asm-side'), ed: '.asm-editor', side: '.asm-side', toward: 'right', key: 'silinx.fsm.props.width', fold: '.asm-side .asm-fold' });

  // a narrow screen: the ASM's Properties over the canvas behind ☰ Properties, its handle dragged too, at most 90 % (and 720 px)
  await page.openProject('ResizeAsm');
  await asm.open();
  await page.setViewport(900, 800);
  try {
    await page.waitFor((d) => document.querySelector(`${d} .asm-editor .narrow-only`)?.getClientRects().length, [DOC], { what: 'the ☰ Properties button' });
    await page.eval(async () => (await import('/js/narrow.js')).setDrawer(false, { remember: false }));   // (the drawer over the toolbar)
    if (!(await page.eval((d) => document.querySelector(`${d} .asm-editor`).classList.contains('side-open'), DOC))) await page.click(`${DOC} .asm-editor .narrow-only`);
    await page.waitFor((d) => { const h = document.querySelector(`${d} .asm-editor .asm-side`).nextElementSibling; return !h.hidden && h.getBoundingClientRect().width > 0; }, [DOC], { what: 'the narrow panel\'s handle' });
    const n0 = await geo(page, '.asm-editor', '.asm-side');
    assert.ok(Math.abs(n0.hx - n0.left) <= 2, JSON.stringify(n0));
    await page.drag({ x: n0.hx, y: n0.hy }, { x: n0.hx - 60, y: n0.hy });
    const n1 = await geo(page, '.asm-editor', '.asm-side');
    assert.ok(Math.abs(n1.width - (n0.width + 60)) <= 2, JSON.stringify([n0, n1]));
    await page.drag({ x: n1.hx, y: n1.hy }, { x: 5, y: n1.hy });
    const n2 = await geo(page, '.asm-editor', '.asm-side');
    assert.ok(Math.abs(n2.width - Math.min(720, n2.row * 0.9)) <= 2, JSON.stringify(n2));   // (at most 90 % of the editor)
    await page.dblclick({ x: n2.hx, y: n2.hy });
    assert.equal((await geo(page, '.asm-editor', '.asm-side')).width, n0.width);
  } finally { await page.setViewport(1440, 900); }
  assert.equal((await geo(page, '.asm-editor', '.asm-side')).width, a0.width, 'the default width back on the desktop');

  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor((d) => document.querySelector(`${d} .asm-editor .asm-side`).nextElementSibling.title === 'Arraste para redimensionar o painel (← → com o teclado; um duplo clique: a sua largura inicial)', [DOC], { what: 'the tip in Portuguese' });
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
