// UI (#5788): I/O Pin Planning's three views, Table, Board and Text, and its constraints file, one model: an edit in
// one view seen in the other two, by every path that left them apart: typing in the Text view (the Board Resources
// panel at once), the file saved by its text editor, changed outside the page, opened while its text editor has edits
// not saved yet, an autosave while the Text view is typed in, Undo in the table (the file's other lines too). Both
// interfaces; in Portuguese; the console's lines asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, writeWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'module top(input clk, input [1:0] sw, output [3:0] led);\n  assign led = {sw, sw};\nendmodule\n';
const UCF = 'NET "led<0>" LOC = "M5" ;\n';
const D = '.doc:not([hidden])';

async function project(page, name) {
  await makeProject(env, { name, top: 'top', board: 'basys2', constraints: 'constraints/top.ucf', files: { 'src/top.v': TOP, 'constraints/top.ucf': UCF } });
  await page.openProject(name);
  await page.showMessages();
}
async function openPins(page) {
  await page.eval(() => window.SilinxApp.openPinPlanner());
  await page.waitFor((d) => window.Silinx.active?.id === 'pins' && document.querySelectorAll(`${d} .pp-table tr`).length > 1, [D], { what: 'I/O Pin Planning' });
}
async function show(page, view) {
  await page.click(`${D} .pp-view[data-view=${view}]`);
  const ready = { table: '.pp-table tr', board: '.pp-board .pp-target', text: '.pp-text .cm-content' }[view];
  await page.waitFor((d, s) => document.querySelector(`${d} ${s}`)?.getClientRects().length > 0, [D, ready], { what: `the ${view} view` });
}
// what each view shows: the table's pins (its rows with a LOC), the board's parts with a bit on them (their title), the
// text; and the Board Resources panel's pins used
async function views(page) {
  await show(page, 'table');
  const table = await page.eval((d) => Object.fromEntries([...document.querySelectorAll(`${d} .pp-table tr`)].slice(1)
    .map((r) => [r.cells[0].textContent, r.cells[3].querySelector('input').value]).filter(([, l]) => l)), D);
  const used = await usedPins(page);
  await show(page, 'board');
  const board = await page.eval((d) => [...document.querySelectorAll(`${d} .pp-board .pp-on`)].map((e) => e.title.replace(/^.*\((\w+)\): (.*)$/, '$2 $1')).sort(), D);
  await show(page, 'text');
  return { table, used, board, text: await text(page) };
}
const usedPins = (page) => page.eval((d) => [...document.querySelectorAll(`${d} .pp-side .res.used`)].map((e) => e.lastChild.textContent).sort(), D);
const text = (page) => page.eval(() => window.Silinx.active.pinText().getValue());
// (the bits on the board's LEDs: led<0> M5, led<1> M11, led<2> P7, led<3> P6)
const want = (pins) => ({
  table: Object.fromEntries(pins.map(([n, l]) => [n, l])),
  used: pins.map(([, l]) => l).sort(),
  board: pins.map(([n, l]) => `${n} ${l}`).sort(),
});
const same = async (page, pins, re) => {
  const v = await views(page);
  assert.deepEqual({ table: v.table, used: v.used, board: v.board }, want(pins));
  if (re) assert.match(v.text, re);
  return v;
};
const appLines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent.trim()).filter(Boolean));
const noWarnings = async (page) => {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual((await appLines(page)).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
};
// a line typed at the end of the Text view's editor
async function typeLine(page, line) {
  await page.eval(() => { const ed = window.Silinx.active.pinText(); ed.focus(); ed.setCursor({ line: ed.getValue().split('\n').length - 1, ch: 0 }); });
  await page.type(line);
}

uiTest('#5788 typing in the Text view: the Board Resources panel at once, the table and the board; an autosave meanwhile keeps what is typed; in Portuguese', E, async (page) => {
  await project(page, 'PinSyncText');
  await openPins(page);
  await show(page, 'text');
  await typeLine(page, 'NET "led<1>" LOC = "M11" ;\n');
  // (the panel beside the text, before the view is left)
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) .pp-side .res.used')].length === 2, [], { what: 'Board Resources follows the text' });
  assert.deepEqual(await usedPins(page), ['M11', 'M5']);
  // a save while typing (the autosave's): what is typed meanwhile not set back to what was saved
  await page.eval(() => { window.__save = window.Silinx.active.save(); });
  await page.type('NET "led<2>" LOC = "P7" ;\n');
  await page.eval(() => window.__save);
  assert.match(await text(page), /NET "led<2>" LOC = "P7" ;\n$/, 'typed while saving: kept');
  await same(page, [['led<0>', 'M5'], ['led<1>', 'M11'], ['led<2>', 'P7']], /NET "led<1>" LOC = "M11" ;\nNET "led<2>" LOC = "P7" ;/);
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  // in Portuguese: the same
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((d) => document.querySelector(`${d} .pp-view[data-view=text]`)?.textContent === 'Texto', [D], { what: 'Portuguese' });
  await typeLine(page, 'NET "led<3>" LOC = "P6" ;\n');
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) .pp-side .res.used')].length === 4, [], { what: 'Board Resources follows the text' });
  await same(page, [['led<0>', 'M5'], ['led<1>', 'M11'], ['led<2>', 'P7'], ['led<3>', 'P6']]);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await noWarnings(page);
});

uiTest('#5788 the constraints file saved by its text editor, and opened with edits of its editor not saved yet: the three views follow it', E, async (page) => {
  await project(page, 'PinSyncFile');
  await openPins(page);
  await same(page, [['led<0>', 'M5']]);
  // the file's text editor: a line added, saved (its autosave)
  await page.eval(() => window.SilinxApp.openFile('constraints/top.ucf'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:constraints/top.ucf' && window.Silinx.active.editor, [], { what: 'the file\'s editor' });
  await page.eval(() => { const d = window.Silinx.active; d.editor.setValue(`${d.editor.getValue()}NET "led<1>" LOC = "M11" ;\n`); window.SilinxApp.setDirty(d, true); });
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'the file saved' });
  await page.eval(() => window.SilinxApp.activateDoc(window.Silinx.docs.find((d) => d.id === 'pins')));
  await same(page, [['led<0>', 'M5'], ['led<1>', 'M11']], /NET "led<1>" LOC = "M11" ;/);
  assert.equal(await page.eval(() => window.Silinx.active.dirty), false, 'nothing of its own to save');
  // closed; the file's editor edited, not saved yet; opened again: its editor's text
  await page.eval(async () => {
    await window.SilinxApp.closeDoc(window.Silinx.docs.find((d) => d.id === 'pins'));
    const f = window.Silinx.docs.find((d) => d.id === 'file:constraints/top.ucf');
    window.SilinxApp.activateDoc(f);
    f.editor.setValue('NET "led<2>" LOC = "P7" ;\n');
    window.SilinxApp.setDirty(f, true);
  });
  await openPins(page);
  await same(page, [['led<2>', 'P7']], /^NET "led<2>" LOC = "P7" ;\n$/);
  await noWarnings(page);
});

uiTest('#5788 the constraints file changed outside the page (the MCP server, another program): the three views follow it', E, async (page) => {
  await project(page, 'PinSyncDisk');
  await openPins(page);
  await same(page, [['led<0>', 'M5']]);
  await writeWs(env, 'PinSyncDisk', 'constraints/top.ucf', 'NET "led<3>" LOC = "P6" ;\nNET "led<1>" LOC = "M11" ;\n');
  await page.waitFor(() => /constraints\/top\.ucf reloaded: changed outside Silinx\./.test(window.__console()), [], { what: 'reloaded', timeout: 20000 });
  await same(page, [['led<1>', 'M11'], ['led<3>', 'P6']], /^NET "led<3>" LOC = "P6" ;\nNET "led<1>" LOC = "M11" ;\n$/);
  assert.deepEqual((await appLines(page)).filter((l) => /outside Silinx/.test(l)), ['Changed outside Silinx: constraints/top.ucf.', 'constraints/top.ucf reloaded: changed outside Silinx.']);
  assert.equal(await page.eval(() => window.Silinx.active.dirty), false);
  await noWarnings(page);
});

uiTest('#5788 Undo in the table: the file\'s other lines typed in the Text view undone with the pins', E, async (page) => {
  await project(page, 'PinSyncUndo');
  await openPins(page);
  await show(page, 'text');
  await typeLine(page, 'NET "led<1>" LOC = "M11" ;\nCONFIG PROHIBIT = "P12" ;\n');
  await show(page, 'table');
  await page.eval(() => window.Silinx.active.pinPlanner.undo());
  await same(page, [['led<0>', 'M5']]);
  assert.doesNotMatch(await text(page), /PROHIBIT|"M11"/, 'the other line undone too');
  await show(page, 'table');
  await page.eval(() => window.Silinx.active.pinPlanner.redo());
  const v = await same(page, [['led<0>', 'M5'], ['led<1>', 'M11']]);
  assert.match(v.text, /CONFIG PROHIBIT = "P12"/, 'and redone');
  await noWarnings(page);
});
