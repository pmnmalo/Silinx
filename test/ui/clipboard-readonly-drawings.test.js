// UI: a read-only drawing's selection copied and pasted into an editable drawing of its kind (#5733, #5736): the ASM
// chart, the state diagram, the Petri net and the circuit, each read-only as a drawing a newer Silinx saved (#4756) is:
// its selection copied by Edit ▸ Copy, the toolbar's Copy and Ctrl+C; Cut, Paste and Delete refused there; the text of
// its side panel's fields copied (read only, not disabled), a read-only register map's too; nothing said in the console but the
// newer Silinx's warning when it opens.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newModel } from '../../core/asm.js';
import { newFsm } from '../../core/fsm.js';
import { newPetri } from '../../core/petri.js';
import { newTable } from '../../core/logic.js';
import { halfAdder } from '../circuit-helpers.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const D = '.doc:not([hidden])';
const CTRL = 2;   // (CDP modifier bit)

const editItems = async (page) => {
  const items = await page.openMenu('Edit');
  await page.closeMenus();
  return Object.fromEntries(items.filter((i) => i.label).map((i) => [i.label, !i.disabled]));
};
const logText = (page) => page.eval(() => document.getElementById('console-log').textContent);
// the centre of an element once the view is fitted: the same twice in a row (#894)
async function settled(page, sel) {
  const at = () => page.eval((x) => { const r = document.querySelector(x).getBoundingClientRect(); return `${r.left + r.width / 2},${r.top + r.height / 2}`; }, sel);
  let p0 = null;
  for (let i = 0; i < 20; i++) { const p1 = await at(); if (p1 === p0) break; p0 = p1; await new Promise((r) => setTimeout(r, 100)); }
  const [x, y] = p0.split(',').map(Number);
  return { x, y };
}
// a read-only field of the side panel under root with text (its text fields read only, not disabled, #5736): selected,
// Edit ▸ Copy; what the clipboard holds then
async function copyField(page, root) {
  const v = await page.eval((r) => {
    const fs = [...document.querySelectorAll(`${r} :is(input[type=text], textarea)`)].filter((e) => e.getClientRects().length);
    if (fs.some((e) => e.disabled || !e.readOnly)) return `not locked as read only: ${fs.filter((e) => e.disabled || !e.readOnly).map((e) => e.outerHTML).join(' ')}`;
    const x = fs.find((e) => e.value);
    if (!x) return null;
    x.focus(); x.select();
    return x.value;
  }, root);
  assert.ok(v && !v.startsWith('not locked'), v ?? 'a text field');
  assert.equal((await editItems(page)).Copy, true, 'Copy');
  await page.menu('Edit', 'Copy');
  assert.equal(await page.eval(async () => (await import('/js/clipboard.js')).readClip('text')), v);
}
const clickOn = (sel) => async (page) => page.click(await settled(page, `${D} ${sel}`));

// each kind: its files, how it opens, its editor, how one of its objects is selected, how many objects it has
const KINDS = [
  { kind: 'ASM chart', ext: 'asm', open: 'openAsm', editor: 'asmEditor', root: '.asm-editor', shown: '[data-node]',
    doc: (n) => newModel(n, 'vhdl'), empty: (n) => ({ ...newModel(n, 'vhdl'), nodes: [], edges: [], initial: '' }),
    select: async (page) => page.key('a', { modifiers: CTRL }), list: 'nodes' },
  { kind: 'state diagram', ext: 'fsm', open: 'openFsm', editor: 'fsmEditor', root: '.fsm-editor', shown: '[data-state=s2] .fsm-circle',
    doc: (n) => newFsm(n, 'vhdl'), empty: (n) => ({ ...newFsm(n, 'vhdl'), states: [], transitions: [] }),
    select: clickOn('[data-state=s2] .fsm-circle'), list: 'states' },
  { kind: 'Petri net', ext: 'pn', open: 'openPetri', editor: 'petriEditor', root: '.petri-editor', shown: '[data-id=p2] circle',
    doc: (n) => newPetri(n, 'vhdl'), empty: (n) => ({ ...newPetri(n, 'vhdl'), places: [], transitions: [], arcs: [] }),
    select: clickOn('[data-id=p2] circle'), list: 'places' },
  { kind: 'circuit', ext: 'circ', open: 'openFile', editor: 'circuitEditor', root: '.circuit-editor', shown: '[data-id=D1]',
    doc: (n) => ({ ...halfAdder(), name: n }), empty: (n) => ({ ...halfAdder(), name: n, parts: halfAdder().parts.slice(0, 1), wires: [] }),
    select: clickOn('[data-id=D1]'), list: 'parts' },
];

for (const K of KINDS) {
  uiTest(`#5733 a read-only ${K.kind}: its selection copied (Edit ▸ Copy, the toolbar, Ctrl+C), pasted into another`, E, async (page) => {
    const name = `RoClip_${K.ext}`, ro = `src/ro.${K.ext}.json`, ok = `src/ok.${K.ext}.json`;
    await makeProject(env, { name, top: '', files: { [ro]: JSON.stringify({ ...K.doc('ro'), version: 99 }), [ok]: JSON.stringify(K.empty('ok')) } });
    await page.openProject(name);
    const open = (p) => page.eval((f, p) => (f === 'openFile' ? window.SilinxApp.openFile(p) : import('/js/drawings.js').then((m) => m[f](p))), K.open, p);
    const model = () => page.eval((e) => window.Silinx.active[e].getModel(), K.editor);
    const count = (m) => m[K.list].length;
    await open(ro);
    await page.waitFor((s) => !!document.querySelector('[data-newer-notice]') && !!document.querySelector(s), [`${D} ${K.shown}`], { what: 'read-only, drawn' });
    const log0 = await logText(page);
    const n0 = count(await model());
    await copyField(page, `${D} .asm-side`);
    await page.eval((x) => document.querySelector(x).focus(), `${D} ${K.root}`);
    await K.select(page);
    await page.waitFor((e) => window.Silinx.active[e].canCopy(), [K.editor], { what: 'selected' });
    const m = await editItems(page);
    assert.deepEqual([m.Cut, m.Copy, m.Paste, m.Delete], [false, true, false, false], 'read-only: Copy only');
    // Edit ▸ Copy, then Edit ▸ Paste into the editable one
    await page.menu('Edit', 'Copy');
    await open(ok);
    await page.waitFor((id) => window.Silinx.active?.id?.endsWith(id), [ok]);
    const e0 = count(await model());
    assert.equal((await editItems(page)).Paste, true, 'something to paste');
    await page.menu('Edit', 'Paste');
    await page.waitFor((e, n, l) => window.Silinx.active[e].getModel()[l].length > n, [K.editor, e0, K.list], { what: 'pasted by Edit ▸ Paste' });
    const e1 = count(await model());
    // the toolbar's Copy and Ctrl+C in the read-only one (Ctrl+X, Delete: nothing removed), Ctrl+V in the other
    for (const how of ['toolbar', 'keys']) {
      await open(ro);
      await page.waitFor((id) => window.Silinx.active?.id?.endsWith(id), [ro]);
      await page.eval((x) => document.querySelector(x).focus(), `${D} ${K.root}`);
      if (how === 'toolbar') {
        await page.eval(async () => (await import('/js/menus.js')).refreshSteps());
        await page.click('#toolbar .tb-btn[data-cmd=copy]');
      } else {
        await page.key('c', { modifiers: CTRL });
        await page.key('x', { modifiers: CTRL });
        await page.key('Delete');
      }
      assert.equal(count(await model()), n0, 'nothing removed from the read-only one');
      await open(ok);
      await page.waitFor((id) => window.Silinx.active?.id?.endsWith(id), [ok]);
      const before = count(await model());
      await page.eval((x) => document.querySelector(x).focus(), `${D} ${K.root}`);
      await page.key('v', { modifiers: CTRL });
      await page.waitFor((e, n, l) => window.Silinx.active[e].getModel()[l].length > n, [K.editor, before, K.list], { what: `pasted after the ${how}' copy` });
    }
    assert.ok(e1 > e0);
    assert.equal(await logText(page), log0, 'nothing said');
  });
}

uiTest('#5736 a read-only register map (a followed project\'s): its fields\' text copied', E, async (page) => {
  await makeProject(env, { name: 'RoClip_regs', top: '' });
  await page.openProject('RoClip_regs');
  // (mounted read only, as a followed project's map is: drawings-regs.js)
  await page.eval(async () => {
    const [{ mountRegmapEditor }, { newRegmap }] = await Promise.all([import('/js/regmap-editor.js'), import('/core/regmap.js')]);
    const host = Object.assign(document.createElement('div'), { id: 'ro-regs' });
    host.style.cssText = 'position: fixed; inset: 40px; z-index: 50; background: #fff';
    document.body.append(host);
    mountRegmapEditor(host, { model: newRegmap('ro'), readOnly: true });
  });
  const log0 = await logText(page);
  await copyField(page, '#ro-regs .regs-table');
  assert.equal(await logText(page), log0, 'nothing said');
  await page.eval(() => document.getElementById('ro-regs').remove());
});

uiTest('#5736 a read-only truth table (a newer Silinx\'s): its fields\' text copied', E, async (page) => {
  await makeProject(env, { name: 'RoClip_tt', top: '', files: { 'src/ro.tt.json': JSON.stringify({ ...newTable('ro', ['a', 'b'], ['f']), exprs: { f: 'a and b' }, version: 99 }) } });
  await page.openProject('RoClip_tt');
  await page.eval(() => window.SilinxApp.openTt('src/ro.tt.json'));
  await page.waitFor(() => !!document.querySelector('.doc:not([hidden]) .tt-editor [data-newer-notice]'), [], { what: 'read-only' });
  const log0 = await logText(page);
  await copyField(page, `${D} .tt-editor`);
  assert.equal(await logText(page), log0, 'nothing said');
});
