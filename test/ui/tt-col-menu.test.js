// UI: a truth table column's right-click menu (#5869, web/js/tt-col-menu.js): an input's and an output's items; Rename…
// (its dialog, a name refused said in it), Duplicate (an output), Insert Before / After, Delete, Move Left / Right; each
// one step of the main toolbar's Undo, at once (not a project's command, app.js NOT_RECORDED); the Inputs and Outputs boxes follow; the last output not deleted (the console says
// why); a long press of a finger opens it; a read-only table has none; its items in Portuguese. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newTable, normalizeTable } from '../../core/logic.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const T = '.doc:not([hidden]) .tt-editor';
const TABLE = normalizeTable({ ...newTable('cols', ['a', 'b'], ['f']), table: { f: '0110' }, exprs: { f: 'a ^ b' } });

uiTest('#5869 Boolean algebra: a column header\'s right-click menu: Rename, Duplicate, Insert, Delete, Move; Undo', E, async (page) => {
  await makeProject(env, { name: 'ColMenu', files: { 'src/cols.bool.json': JSON.stringify(TABLE, null, 2) } });
  await page.openProject('ColMenu');
  await page.eval((f) => window.SilinxApp.openTt(f), 'src/cols.bool.json');
  await page.waitFor((t) => window.Silinx.active?.id === 'tt:src/cols.bool.json' && document.querySelector(`${t} th.tt-col`), [T], { what: 'the table' });
  const th = (name) => page.eval((t, n) => { const e = [...document.querySelectorAll(`${t} th.tt-col`)].find((x) => x.textContent === n); const b = e.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; }, T, name);
  const state = () => page.eval((t) => {
    const m = window.Silinx.active.ttEditor.getModel(), q = (s) => document.querySelector(`${t} ${s}`).value;
    return { inputs: q('.tt-inputs'), outputs: q('.tt-outputs'), table: m.table, exprs: m.exprs, sel: document.querySelector(`${t} th.tt-out.sel`)?.textContent };
  }, T);
  const items = () => page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi')].map((e) => `${e.querySelector('.lbl').textContent}${e.classList.contains('disabled') ? ' (disabled)' : ''}`));
  const menu = async (name) => { await page.rightClick(await th(name)); await page.waitFor(() => document.querySelector('body > .menu-popup'), [], { what: 'the menu' }); return items(); };
  const choose = async (name, item) => { const all = await menu(name); await page.click('body > .menu-popup > .mi', { index: all.findIndex((x) => x === item) }); };
  const undo = () => page.click('#toolbar [data-cmd=undo]');

  // the items of an input's and of an output's header
  assert.deepEqual(await menu('a'), ['Rename Input…', 'Insert Input Before', 'Insert Input After', 'Delete Input', 'Move Left (disabled)', 'Move Right']);
  assert.equal(await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi')][3].title), 'The rows where it is 0 are kept');
  await page.key('Escape');
  assert.deepEqual(await menu('f'), ['Rename Output…', 'Duplicate Output', 'Insert Output Before', 'Insert Output After', 'Delete Output', 'Move Left (disabled)', 'Move Right (disabled)']);
  await page.key('Escape');

  // Duplicate: f2 after f, its column and expression, selected
  await choose('f', 'Duplicate Output');
  let s = await state();
  assert.deepEqual([s.outputs, s.table, s.exprs, s.sel], ['f, f2', { f: '0110', f2: '0110' }, { f: 'a ^ b', f2: 'a ^ b' }, 'f2']);
  // Rename… of f2: refused (taken, reserved) in its dialog, then y
  await choose('f2', 'Rename Output…');
  await page.waitDialog('Rename Output');
  const type = (v) => page.eval((x) => { const i = [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.dlg-body input'); i.value = x; i.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const err = () => page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.tt-rename-err').textContent);
  await type('A');
  assert.equal(await err(), "The name 'A' is used already");
  await page.dialogButton('Rename');
  assert.equal(await page.eval(() => !!document.querySelector('.dlg-overlay')), true, 'the dialog stays open');
  await type('signal');
  assert.match(await err(), /signal/);
  await type('y');
  await page.dialogButton('Rename');
  await page.waitNoDialog();
  s = await state();
  assert.deepEqual([s.outputs, s.table.y, s.sel], ['f, y', '0110', 'y']);
  // Insert Input After a: b's rows doubled, the outputs independent of the new one, c
  await choose('a', 'Insert Input After');
  s = await state();
  assert.deepEqual([s.inputs, s.table], ['a, c, b', { f: '01011010', y: '01011010' }]);
  // Delete Input c: the rows where it is 0, the table it was
  await choose('c', 'Delete Input');
  assert.deepEqual((await state()).table, { f: '0110', y: '0110' });
  // Move Right of a: b, a (the rows sorted again)
  await choose('a', 'Move Right');
  assert.equal((await state()).inputs, 'b, a');
  // Delete Output y, then f is the last: refused, in the console
  await choose('y', 'Delete Output');
  assert.equal((await state()).outputs, 'f');
  await choose('f', 'Delete Output');
  assert.equal((await state()).outputs, 'f');
  await page.showMessages();
  assert.match(await page.consoleText(), /At least 1 output/);

  // Undo: each one step back (delete y, move, delete c, insert c, rename, duplicate)
  const steps = ['f, y|b, a', 'f, y|a, b', 'f, y|a, c, b', 'f, y|a, b', 'f, f2|a, b', 'f|a, b'];
  const boxes = () => page.eval((t) => `${document.querySelector(`${t} .tt-outputs`).value}|${document.querySelector(`${t} .tt-inputs`).value}`, T);
  for (const want of steps) {
    await undo();
    await page.waitFor((t, w) => `${document.querySelector(`${t} .tt-outputs`).value}|${document.querySelector(`${t} .tt-inputs`).value}` === w, [T, want], { what: `undone: ${want}`, timeout: 2000 }).catch(async (e) => { assert.equal(await boxes(), want, e.message); });
  }
  assert.deepEqual((await state()).table, TABLE.table);

  // a finger's long press: the menu
  const at = await th('b');
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] });
  await page.waitFor(() => document.querySelector('body > .menu-popup'), [], { what: 'the menu of a long press', timeout: 3000 });
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal((await items())[0], 'Rename Input…');
  await page.key('Escape');

  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    assert.deepEqual(await menu('a'), ['Mudar o Nome da Entrada…', 'Inserir Entrada Antes', 'Inserir Entrada Depois', 'Apagar Entrada', 'Mover para a Esquerda (disabled)', 'Mover para a Direita']);
    await page.key('Escape');
    assert.deepEqual(await menu('f'), ['Mudar o Nome da Saída…', 'Duplicar Saída', 'Inserir Saída Antes', 'Inserir Saída Depois', 'Apagar Saída', 'Mover para a Esquerda (disabled)', 'Mover para a Direita (disabled)']);
    await page.key('Escape');
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /WARNING|ERROR|error/i.test(l)).map((l) => l.replace(/^.*?At least/, 'At least')), ['At least 1 output']);
  assert.deepEqual(page.console.filter((x) => x.type === 'error' || x.type === 'warning' || x.type === 'warn').map((x) => x.text), []);
});

uiTest('#5869 Boolean algebra: a read-only table\'s column header has no menu', E, async (page) => {
  await makeProject(env, { name: 'ColMenuRo', files: {} });
  await page.openProject('ColMenuRo');
  const r = await page.eval(async (m) => {
    const { mountTtEditor } = await import('/js/truthtable.js');
    const host = Object.assign(document.createElement('div'), { id: 'tt-ro' });
    host.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:600px;background:#fff;z-index:9999';
    document.body.append(host);
    const ed = mountTtEditor(host, { model: m, readOnly: true });
    const th = host.querySelector('th.tt-col');
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    th.dispatchEvent(ev);
    const out = { menu: !!document.querySelector('body > .menu-popup'), prevented: ev.defaultPrevented, inputs: ed.getModel().inputs };
    ed.destroy(); host.remove();
    return out;
  }, TABLE);
  assert.deepEqual(r, { menu: false, prevented: true, inputs: ['a', 'b'] });
});
