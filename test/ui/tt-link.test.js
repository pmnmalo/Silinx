// UI: the truth table editor's HDL link's banner (#4194, web/js/tt-link.js, moved from truthtable.js), mounted alone in
// the page: an HDL file not in sync, its banner and its file opened by a click; one in sync, no banner, its name in
// data-hdl; none linked; a design project's, never shown (#3891). No errors.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#4194 the truth table\'s HDL link: not in sync (its banner, its file opened), in sync, none, a design project\'s', E, async (page) => {
  const run = (info, design = false) => page.eval(async (i, d) => {
    const { renderTtLink } = await import('/js/tt-link.js');
    const el = document.createElement('div');
    const opened = [];
    if (d) document.documentElement.dataset.projectKind = 'design'; else delete document.documentElement.dataset.projectKind;
    renderTtLink(el, { linkInfo: () => i, onOpenFile: (f) => opened.push(f) });
    el.querySelector('a')?.click();
    delete document.documentElement.dataset.projectKind;
    return { text: el.textContent, hdl: el.dataset.hdl, cls: el.firstElementChild?.className ?? null, opened };
  }, info, design);
  assert.deepEqual(await run({ file: 'src/lamps.vhd', why: 'the table has errors' }), { text: 'Not in sync with lamps.vhd — the table has errors', hdl: '', cls: 'gen-banner out-of-sync', opened: ['src/lamps.vhd'] });
  assert.deepEqual(await run({ file: 'src/lamps.vhd', why: null }), { text: '', hdl: 'lamps.vhd', cls: null, opened: [] });
  assert.deepEqual(await run(null), { text: '', hdl: '', cls: null, opened: [] });
  assert.deepEqual(await run({ file: 'src/lamps.vhd', why: 'the table has errors' }, true), { text: '', hdl: '', cls: null, opened: [] });
  assert.deepEqual(page.errors, []);
});
