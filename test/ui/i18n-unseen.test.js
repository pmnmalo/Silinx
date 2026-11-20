// UI: the texts the page's translation does not reach, in Portuguese (#4748): a schematic's title block (SVG, drawn
// with t()), SSim's wave window's header (a canvas), the browser's prompt of New Group (its
// question and its default name), a message written as a template literal (a command's console line). Both
// interfaces (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const setLang = (page, l) => page.eval(async (y) => { (await import('/js/i18n.js')).setLanguage(y); }, l);

uiTest('#4748 Portuguese: a schematic\'s title block, SSim\'s drawn header and its prompt, a template literal\'s console line', E, async (page) => {
  await makeProject(env, { name: 'PtUnseen', template: 'gates' });
  await page.openProject('PtUnseen');
  await setLang(page, 'pt');
  try {
    // a schematic's title block
    await page.eval(() => window.SilinxApp.openSch('src/gates.sch.json'));
    await page.waitFor(() => document.querySelector('.doc:not([hidden]) .titleblock .tb-l'), [], { what: 'the title block' });
    assert.deepEqual(await page.eval(() => [...document.querySelector('.doc:not([hidden]) .titleblock').querySelectorAll('.tb-l')].map((e) => e.textContent)), ['FOLHA', 'LINGUAGEM', 'Silinx']);
    // SSim: its wave window's header drawn in Portuguese; New Group's prompt and its group's name
    await page.eval(() => window.SilinxApp.runSimulation('tb_gates'));
    await page.waitFor(() => window.Silinx.active?.id === 'isim:tb_gates' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { what: 'SSim ran', timeout: 30000 });
    const drawn = await page.eval(() => {
      const c = document.querySelector('.doc:not([hidden]) .isim-names'), ctx = c.getContext('2d'), out = [];
      const f = ctx.fillText;
      ctx.fillText = function (s, ...a) { out.push(String(s)); return f.call(this, s, ...a); };
      try { window.Silinx.active.view.redraw(); } finally { ctx.fillText = f; }
      return out;
    });
    assert.deepEqual(drawn.slice(0, 2), ['Nome', 'Valor']);
    await page.eval(() => { window.__asked = []; window.__prompt = window.prompt; window.prompt = (m, d) => { window.__asked.push([m, d]); return d; }; });
    const nameAt = (row) => page.eval((r) => { const c = document.querySelector('.doc:not([hidden]) .isim-names').getBoundingClientRect(); return { x: c.left + 60, y: c.top + 30 + r * 20 + 10 }; }, row);
    await page.click(await nameAt(0));
    await page.rightClick(await nameAt(0));
    await page.click('.isim-menu-item', { text: 'Novo Grupo' });
    const asked = await page.eval(() => { window.prompt = window.__prompt; return { asked: window.__asked, group: window.Silinx.active.view.state.rows.find((r) => r.kind === 'group')?.name }; });
    assert.deepEqual(asked, { asked: [['Nome do grupo:', 'Novo Grupo']], group: 'Novo Grupo' });
    // a command's error written as a template literal: its console line in Portuguese
    await page.eval(() => import('/js/console.js').then((c) => c.logError('cannot open src/none.sch.json: Select the top module first')));
    await page.waitConsole(/^ERROR: não foi possível abrir src\/none\.sch\.json: Selecione primeiro o módulo de topo$/m);
  } finally { await setLang(page, 'en'); }
});
