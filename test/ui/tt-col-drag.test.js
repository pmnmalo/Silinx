// UI: a truth table's columns reordered by their headers (#5863, web/js/tt-col-drag.js): an input's header dragged by the
// mouse (the rows sorted again in the new order, each row's outputs and don't cares kept; the Inputs box in the new order;
// the HDL generated with its ports in that order), an output's dragged by a finger (its column moved; the Outputs box), an
// input never dropped among the outputs; Alt+Shift+← / → on a focused header; the main toolbar's Undo and Redo; a
// read-only table refuses, in the console; a shared table pushes the change; the headers' tips in Portuguese. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { newTable, normalizeTable } from '../../core/logic.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const T = '.doc:not([hidden]) .tt-editor';
const ALT_SHIFT = 9;   // (CDP's modifier bits: Alt 1, Shift 8)

// f = a.c̅, X where a = 0 and c = 1; g = c
const TABLE = normalizeTable({ ...newTable('order', ['a', 'b', 'c'], ['f', 'g']), table: { f: '0X0X1010', g: '01010101' } });

uiTest('#5863 Boolean algebra: the columns reordered by dragging their headers, the keys, Undo / Redo', E, async (page) => {
  await makeProject(env, { name: 'ColOrder', files: { 'src/order.bool.json': JSON.stringify(TABLE, null, 2) } });
  await page.openProject('ColOrder');
  await page.eval((f) => window.SilinxApp.openTt(f), 'src/order.bool.json');
  await page.waitFor((t) => window.Silinx.active?.id === 'tt:src/order.bool.json' && document.querySelector(`${t} th.tt-col`), [T], { what: 'the table' });
  const state = () => page.eval((t) => {
    const q = (s) => document.querySelector(`${t} ${s}`);
    const m = window.Silinx.active.ttEditor.getModel();
    return { heads: [...document.querySelectorAll(`${t} th.tt-col`)].map((th) => `${th.dataset.kind[0]}${th.textContent}`), inputs: q('.tt-inputs').value, outputs: q('.tt-outputs').value,
      rows: [...document.querySelectorAll(`${t} .tt-table tbody tr`)].map((tr) => [...tr.children].slice(1).map((c) => c.textContent).join('')), table: m.table };
  }, T);
  const head = (name) => page.eval((t, n) => { const b = [...document.querySelectorAll(`${t} th.tt-col`)].find((th) => th.textContent === n).getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), w: b.width }; }, T, name);
  const s0 = await state();
  assert.deepEqual([s0.heads, s0.inputs, s0.outputs], [['ia', 'ib', 'ic', 'of', 'og'], 'a, b, c', 'f, g']);
  assert.deepEqual(s0.rows, ['00000', '001X1', '01000', '011X1', '10010', '10101', '11010', '11101']);

  // c dragged before a by the mouse: the rows in the order c a b, each one's f and g kept (f = a when c = 0; X when c = 1 and a = 0)
  const a = await head('a'), c = await head('c');
  await page.drag(c, { x: a.x - a.w / 2 + 2, y: a.y });
  const s1 = await state();
  assert.deepEqual([s1.heads, s1.inputs, s1.outputs], [['ic', 'ia', 'ib', 'of', 'og'], 'c, a, b', 'f, g']);
  assert.deepEqual(s1.rows, ['00000', '00100', '01010', '01110', '100X1', '101X1', '11001', '11101']);
  assert.deepEqual(s1.table, { f: '0011XX00', g: '00001111' });
  // saved, and its HDL's ports in the new order
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  assert.deepEqual(JSON.parse(await readWs(env, 'ColOrder', 'src/order.bool.json')).inputs, ['c', 'a', 'b']);
  const PORTS = /\bc, a, b : in\b/;
  await page.waitFor(async (re) => new RegExp(re).test(await (await fetch('/api/projects/ColOrder/file?path=src%2Forder.vhd')).text()), [PORTS.source], { what: 'the HDL\'s ports in the new order', timeout: 15000 });
  assert.match(await readWs(env, 'ColOrder', 'src/order.vhd'), PORTS);

  // an input dragged onto the outputs: it stays among the inputs (the last of them)
  const g = await head('g'), a1 = await head('a');
  await page.drag(a1, { x: g.x + g.w, y: g.y });
  assert.deepEqual((await state()).heads, ['ic', 'ib', 'ia', 'of', 'og']);
  assert.equal((await state()).inputs, 'c, b, a');

  // g dragged before f by a finger: its column moved, the rows the same; the Outputs box
  const sBefore = await state();
  const f = await head('f'), g1 = await head('g');
  await page.touchDrag(g1, { x: f.x - f.w / 2 + 2, y: f.y });
  const s2 = await state();
  assert.deepEqual([s2.heads, s2.outputs, s2.inputs], [['ic', 'ib', 'ia', 'og', 'of'], 'g, f', 'c, b, a']);
  assert.deepEqual(s2.table, sBefore.table);
  assert.deepEqual(s2.rows, sBefore.rows.map((r) => r.slice(0, 3) + r[4] + r[3]));
  // a press that does not move is a click: f selected
  await page.click(`${T} th.tt-out[data-i="1"]`);
  assert.equal(await page.eval((t) => document.querySelector(`${t} th.tt-out.sel`).textContent, T), 'f');

  // the keys: Alt+Shift+→ on the focused a (the last input: it stays), ← moves it before b, the focus kept
  await page.eval((t) => [...document.querySelectorAll(`${t} th.tt-col`)].find((th) => th.textContent === 'a').focus(), T);
  await page.key('ArrowRight', { modifiers: ALT_SHIFT });
  assert.equal((await state()).inputs, 'c, b, a');
  await page.key('ArrowLeft', { modifiers: ALT_SHIFT });
  assert.deepEqual([(await state()).inputs, await page.eval(() => document.activeElement.textContent)], ['c, a, b', 'a']);
  await page.key('ArrowLeft', { modifiers: ALT_SHIFT });
  const s3 = await state();
  assert.equal(s3.inputs, 'a, c, b');

  // the main toolbar's Undo and Redo: each move one step
  await page.click('#toolbar [data-cmd=undo]');
  assert.equal((await state()).inputs, 'c, a, b');
  await page.click('#toolbar [data-cmd=undo]');
  assert.equal((await state()).inputs, 'c, b, a');
  await page.click('#toolbar [data-cmd=redo]');
  await page.click('#toolbar [data-cmd=redo]');
  assert.deepEqual(await state(), s3);
  // back to a, b, c: the table it was
  await page.eval((t) => [...document.querySelectorAll(`${t} th.tt-col`)].find((th) => th.textContent === 'b').focus(), T);
  await page.key('ArrowLeft', { modifiers: ALT_SHIFT });
  await page.eval((t) => [...document.querySelectorAll(`${t} th.tt-col`)].find((th) => th.textContent === 'g').focus(), T);
  await page.key('ArrowRight', { modifiers: ALT_SHIFT });
  const s4 = await state();
  assert.deepEqual([s4.inputs, s4.outputs, s4.table, s4.rows], ['a, b, c', 'f, g', TABLE.table, s0.rows]);

  // the headers' tips, in English and in Portuguese
  const tips = () => page.eval((t) => [...document.querySelectorAll(`${t} th.tt-col`)].filter((th, i, all) => i === 0 || i === all.length - 1).map((th) => th.title), T);
  assert.deepEqual(await tips(), ['An input: the first is the most significant bit of a row\nDrag to move it, or Alt+Shift+← / →', 'Select this output\nDrag to move it, or Alt+Shift+← / →']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.eval((t) => { const th = document.querySelector(`${t} th.tt-col`); th.focus(); }, T);
    await page.key('ArrowRight', { modifiers: ALT_SHIFT });   // (drawn again: its tips in Portuguese)
    assert.deepEqual(await tips(), ['Uma entrada: a primeira é o bit mais significativo de cada linha\nArraste para o mover, ou Alt+Shift+← / →', 'Selecionar esta saída\nArraste para o mover, ou Alt+Shift+← / →']);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR|read only/);
  assert.deepEqual(page.console.filter((x) => x.type === 'warning' || x.type === 'warn' || x.type === 'error').map((x) => x.text), []);
});

uiTest('#5863 Boolean algebra: a read-only table refuses to move its columns; a shared one pushes the move', E, async (page) => {
  await makeProject(env, { name: 'ColOrderRo', files: { 'src/order.bool.json': JSON.stringify(TABLE, null, 2) } });
  await page.openProject('ColOrderRo');
  const mount = (readOnly) => page.eval(async (m, ro) => {
    const { mountTtEditor } = await import('/js/truthtable.js');
    document.querySelector('#tt-test')?.remove();
    const host = Object.assign(document.createElement('div'), { id: 'tt-test' });
    host.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:600px;background:#fff;z-index:9999';
    document.body.append(host);
    window.__pushed = [];
    window.__ed = mountTtEditor(host, { model: m, readOnly: ro });
    if (!ro) window.__ed.setShared({ push: (x) => window.__pushed.push(x), undo() {}, redo() {}, canUndo: () => false, canRedo: () => false });
  }, TABLE, readOnly);
  const H = '#tt-test';
  const head = (n) => page.eval((h, x) => { const b = [...document.querySelectorAll(`${h} th.tt-col`)].find((th) => th.textContent === x).getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), w: b.width }; }, H, n);
  const inputs = () => page.eval(() => window.__ed.getModel().inputs.join(', '));

  await mount(true);
  const lines = async () => (await page.consoleText()).split('\n').filter((l) => /read only/.test(l));
  const a = await head('a'), c = await head('c');
  await page.drag(c, { x: a.x - a.w / 2 + 2, y: a.y });
  assert.equal(await inputs(), 'a, b, c');
  await page.eval((h) => document.querySelector(`${h} th.tt-col`).focus(), H);
  await page.key('ArrowRight', { modifiers: ALT_SHIFT });
  assert.equal(await inputs(), 'a, b, c');
  await page.showMessages();
  assert.deepEqual((await lines()).map((l) => l.replace(/^.*?order/, 'order')), ['order is read only: its columns are not moved.', 'order is read only: its columns are not moved.']);
  // its tips do not offer it
  assert.equal(await page.eval((h) => document.querySelector(`${h} th.tt-col`).title, H), 'An input: the first is the most significant bit of a row');

  // shared: the move pushed, the table's rows in the new order
  await mount(false);
  await page.eval((h) => document.querySelector(`${h} th.tt-col`).focus(), H);
  await page.key('ArrowRight', { modifiers: ALT_SHIFT });
  const pushed = await page.eval(() => window.__pushed.map((m) => ({ inputs: m.inputs, table: m.table })));
  assert.deepEqual(pushed, [{ inputs: ['b', 'a', 'c'], table: { f: '0X100X10', g: '01010101' } }]);
  await page.eval(() => { window.__ed.destroy(); document.querySelector('#tt-test').remove(); });
  assert.deepEqual(page.console.filter((x) => x.type === 'error').map((x) => x.text), []);
});
