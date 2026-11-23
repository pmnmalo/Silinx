// A document opened from the keyboard takes the keyboard (#5300): a file of the command palette (Ctrl+K), the Design
// tree's row of a file with no module yet, a drawing's row (a state diagram, a truth table) opened by Enter; their
// editor's text or drawing focused, as a module's HDL is. A double-click (the mouse) leaves the focus where it is. No
// line in the console. In both interfaces (SILINX_UI_INTERFACE=ise).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const MOD = process.platform === 'darwin' ? 4 : 2;

const COUNTER = `library ieee;
use ieee.std_logic_1164.all;

entity counter is
  port (clk : in std_logic; q : out std_logic);
end counter;

architecture rtl of counter is
begin
  q <= clk;
end rtl;
`;

/** Where the keyboard is: the editor (its text, its drawing) that holds the focus, else the focused element's tag. */
const focus = (page) => page.eval(() => {
  const a = document.activeElement;
  const ed = a?.closest('.doc:not([hidden]) :is(.cm-editor, .fsm-editor, .tt-editor)');
  return ed ? ed.classList[0] === 'cm-editor' ? 'text' : ed.matches('.fsm-editor') ? 'fsm' : 'tt' : (a === document.body ? 'page' : a?.closest('#hier .tree') ? 'tree' : a?.tagName.toLowerCase());
});

/** The command palette (Ctrl+K), `text` typed, ↓ to the file `path`, Enter. */
async function palette(page, text, path) {
  await page.key('k', { modifiers: MOD });
  await page.waitFor(() => document.activeElement?.matches('.pal-input'), [], { what: 'the command palette' });
  await page.type(text);
  await page.waitFor((p) => [...document.querySelectorAll('.pal-file .pal-label')].some((e) => e.textContent === p), [path], { what: `${path} in the palette` });
  for (let k = 0; k < 20 && await page.eval((p) => document.querySelector('.pal-item.sel .pal-label')?.textContent !== p, path); k++) await page.key('ArrowDown');
  await page.key('Enter');
  await page.waitFor(() => !document.querySelector('.pal-overlay'), [], { what: 'the palette closed' });
}

/** The Design tree focused, its row `label` selected (a click), Enter. */
async function enterOn(page, label) {
  await page.treeRow('#hier', label);
  const row = await page.eval((l) => {
    const r = [...document.querySelectorAll('#hier .row')].find((x) => { const t = x.querySelector('.lbl')?.textContent; return t === l || t?.startsWith(`${l} - `); });
    r.click();
    document.querySelector('#hier .tree').focus();
    return r.querySelector('.lbl').textContent;
  }, label);
  assert.equal(await page.eval(() => document.querySelector('#hier .row.sel .lbl').textContent), row);
  await page.key('Enter');
}

uiTest('#5300 a file opened from the command palette, or by Enter on the Design tree\'s row of a file with no module or of a drawing, has the keyboard in its editor; a double-click leaves it', E, async (page) => {
  await makeProject(env, { name: 'OpenFocus', template: 'traffic', files: { 'src/counter.vhd': COUNTER, 'src/empty.vhd': '' } });
  await page.openProject('OpenFocus');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((e) => e.textContent === 'empty.vhd'), [], { what: 'the empty file\'s row' });
  const n0 = (await page.consoleText()).length;
  // the palette: Ctrl+K, the file's name, Enter (the keyboard on the page before)
  await page.eval(() => document.activeElement?.blur());
  await palette(page, 'counter.vhd', 'src/counter.vhd');
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/counter.vhd', [], { what: 'the file opened' });
  await page.waitFor(() => !!document.activeElement?.closest('.doc:not([hidden]) .cm-editor'), [], { what: 'the keyboard in the editor', timeout: 3000 }).catch(() => {});
  assert.equal(await focus(page), 'text', 'the palette\'s file');
  // Enter on the Design tree's rows: a file with no module, a state diagram's module, a truth table's
  for (const [label, id, want] of [['empty.vhd', 'file:src/empty.vhd', 'text'], ['u_fsm', 'fsm:src/traffic.fsm.json', 'fsm'], ['u_lamps', 'tt:src/lamps.bool.json', 'tt']]) {
    await enterOn(page, label);
    await page.waitFor((i) => window.Silinx.active?.id === i, [id], { what: `${label} opened` });
    await page.waitFor(() => !document.activeElement?.closest('#hier'), [], { what: `the keyboard out of the tree (${label})`, timeout: 3000 }).catch(() => {});
    assert.equal(await focus(page), want, label);
  }
  // a double-click on a row (the mouse): its document in front, the focus left in the tree
  await page.eval(() => {
    const r = [...document.querySelectorAll('#hier .row')].find((x) => x.querySelector('.lbl')?.textContent === 'empty.vhd');
    r.click();
    document.querySelector('#hier .tree').focus();
    r.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/empty.vhd', [], { what: 'the empty file in front' });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await focus(page), 'tree', 'a double-click');
  // no line in the console
  assert.equal((await page.consoleText()).slice(n0).trim(), '');
});
