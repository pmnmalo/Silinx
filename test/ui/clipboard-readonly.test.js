// UI: a copy from a read-only document pasted into another (#5732, #5733): the HDL generated from a drawing copied by
// its context menu's Copy, pasted into another HDL file by Edit ▸ Paste and by that file's context menu's Paste (no
// "Use Ctrl+V to paste"); a read-only schematic's selection copied by Edit ▸ Copy and Ctrl+C, pasted into another
// schematic; Cut, Paste and Delete still refused in the read-only ones; nothing said in the console.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc, normalizeDoc, symbolPins } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const CTRL = 2;   // (CDP modifier bit)

const INV = `library ieee; use ieee.std_logic_1164.all;
entity inv is port (a : in std_logic; y : out std_logic); end inv;
architecture rtl of inv is begin y <= not a; end rtl;
`;
const B = '-- b\n';
// a ── U1 ── y
function one(name) {
  const doc = normalizeDoc({ ...newDoc(name, 'vhdl'),
    symbols: [{ id: 'S1', type: 'inv', x: 200, y: 100, name: 'U1' }],
    ports: [{ id: 'P1', name: 'a', dir: 'in', width: 1, x: 120, y: 110 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 340, y: 110 }] });
  const pin = (n) => { const p = symbolPins(doc.symbols[0]).find((q) => q.name === n); return { x: p.x, y: p.y }; };
  doc.wires.push({ id: 'W1', points: [{ x: 120, y: 110 }, pin('I')] }, { id: 'W2', points: [pin('O'), { x: 340, y: 110 }] });
  return doc;
}
const editItems = async (page) => {
  const items = await page.openMenu('Edit');
  await page.closeMenus();
  return Object.fromEntries(items.filter((i) => i.label).map((i) => [i.label, !i.disabled]));
};
const logText = (page) => page.eval(() => document.getElementById('console-log').textContent);
// the text editor's context menu, opened on its cursor (a selection's first characters: kept): its items ([label,
// enabled]), or one of them clicked
async function contextMenu(page, click = null) {
  const at = await page.eval(() => { const v = window.Silinx.active.editor.view, s = v.state.selection.main; const c = v.coordsAtPos(s.empty ? s.head : s.from + 2); return { x: c.left + 1, y: (c.top + c.bottom) / 2 }; });
  await page.rightClick(at);
  await page.waitFor(() => !!document.querySelector('body > .menu-popup'));
  const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup > .mi')].map((r) => [r.querySelector('.lbl').textContent, !r.classList.contains('disabled')]));
  if (click == null) { await page.closeMenus(); return items; }
  const i = items.findIndex(([l]) => l === click);
  assert.ok(i >= 0 && items[i][1], `${click} in the context menu, enabled: ${JSON.stringify(items)}`);
  await page.click('body > .menu-popup > .mi', { index: i });
  return items;
}

uiTest('#5732 the HDL generated from a drawing: copied by its context menu, pasted into another HDL file', E, async (page) => {
  await makeProject(env, { name: 'RoClipHdl', files: { 'src/inv.vhd': INV, 'src/a.sch.json': JSON.stringify(one('a')), 'src/b.vhd': B } });
  await page.openProject('RoClipHdl');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/a.vhd'] === 'src/a.sch.json', [], { what: 'the drawing\'s HDL' });
  await page.eval(() => window.SilinxApp.openFile('src/a.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/a.vhd' && window.Silinx.active.editor?.view.state.readOnly, [], { what: 'read-only' });
  const log0 = await logText(page);
  // (its first line, so that the file pasted into ends on an empty line)
  const copied = await page.eval(() => { const e = window.Silinx.active.editor; e.focus(); e.view.dispatch({ selection: { anchor: 0, head: e.view.state.doc.line(1).to + 1 } }); return e.getSelection(); });
  assert.match(copied, /^-- .+\n$/);
  // read-only: Copy only (Cut, Paste and Delete refused); its context menu has no Cut nor Paste
  const m = await editItems(page);
  assert.deepEqual([m.Cut, m.Copy, m.Paste, m.Delete], [false, true, false, false]);
  const items = await contextMenu(page, 'Copy');
  assert.deepEqual(items.filter(([l]) => ['Cut', 'Copy', 'Paste'].includes(l)), [['Copy', true]]);
  // another HDL file: Edit ▸ Paste at its end (in every browser: the app's own copy), then its context menu's Paste
  await page.eval(() => window.SilinxApp.openFile('src/b.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/b.vhd' && window.Silinx.active.editor);
  await page.eval(() => { const e = window.Silinx.active.editor; e.focus(); e.view.dispatch({ selection: { anchor: e.view.state.doc.length } }); });
  assert.equal((await editItems(page)).Paste, true, 'something to paste');
  await page.menu('Edit', 'Paste');
  await page.waitFor((t) => window.Silinx.active.editor.getValue() === t, [B + copied], { what: 'pasted by Edit ▸ Paste' });
  await contextMenu(page, 'Paste');
  await page.waitFor((t) => window.Silinx.active.editor.getValue() === t, [B + copied + copied], { what: 'pasted by the context menu' });
  assert.equal(await logText(page), log0, 'nothing said ("Use Ctrl+V to paste" no more)');
});

uiTest('#5733 a read-only schematic: its selection copied by Edit ▸ Copy and Ctrl+C, pasted into another schematic', E, async (page) => {
  await makeProject(env, { name: 'RoClipSch', files: {
    'src/inv.vhd': INV, 'src/ro.sch.json': JSON.stringify({ ...one('ro'), version: 99 }), 'src/b.sch.json': JSON.stringify(newDoc('b', 'vhdl')),
  } });
  await page.openProject('RoClipSch');
  await page.eval(() => window.SilinxApp.openSch('src/ro.sch.json'));
  await page.waitFor((ed) => !!document.querySelector('[data-newer-notice]') && document.querySelectorAll(`${ed} svg .sym`).length === 1, [ED], { what: 'read-only, drawn' });
  const log0 = await logText(page);
  // Ctrl+A: Copy only (Cut, Paste and Delete refused)
  await page.eval((ed) => document.querySelector(ed).focus(), ED);
  await page.key('a', { modifiers: CTRL });
  const m = await editItems(page);
  assert.deepEqual([m.Cut, m.Copy, m.Paste, m.Delete], [false, true, false, false]);
  await page.menu('Edit', 'Copy');
  // another schematic: pasted, renamed nothing
  await page.eval(() => window.SilinxApp.openSch('src/b.sch.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/b.sch.json');
  assert.equal((await editItems(page)).Paste, true, 'something to paste');
  await page.menu('Edit', 'Paste');
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 1, [ED], { what: 'pasted into b' });
  let d = await page.eval(() => window.Silinx.active.schEditor.getDoc());
  assert.deepEqual([d.symbols.map((s) => s.name), d.ports.map((p) => p.name).sort(), d.wires.length], [['U1'], ['a', 'y'], 2]);
  // Ctrl+C in the read-only one, Ctrl+V in b: a second copy
  await page.eval(() => window.SilinxApp.openSch('src/ro.sch.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/ro.sch.json');
  await page.eval((ed) => document.querySelector(ed).focus(), ED);
  await page.key('a', { modifiers: CTRL });
  await page.key('c', { modifiers: CTRL });
  // (Ctrl+X and Delete there: nothing removed)
  await page.key('x', { modifiers: CTRL });
  await page.key('Delete');
  assert.equal((await page.eval(() => window.Silinx.active.schEditor.getDoc())).symbols.length, 1);
  await page.eval(() => window.SilinxApp.openSch('src/b.sch.json'));
  await page.waitFor(() => window.Silinx.active?.id === 'sch:src/b.sch.json');
  await page.eval((ed) => document.querySelector(ed).focus(), ED);
  await page.key('v', { modifiers: CTRL });
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'pasted with Ctrl+V' });
  d = await page.eval(() => window.Silinx.active.schEditor.getDoc());
  assert.deepEqual(d.symbols.map((s) => s.name).sort(), ['U1', 'inst_1']);
  assert.equal(await logText(page), log0, 'nothing said');
});
