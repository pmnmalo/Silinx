// UI: a System document changed meanwhile (#5915, core/text-tag.js): the System editor open, its .sys.json written by
// another writer (the MCP's edit_system, another tab), the editor's Save does not write over it: said in the console's
// errors, the file as the other writer left it, the document still to save; saved again, the user's own written; a
// save with nothing in between written at once; in Portuguese; in both interfaces (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const F = 'uart_avr.sys.json';
const errors = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(ERROR|ERRO)\b/.test(l));

uiTest('#5915 the System editor\'s Save over a .sys.json changed meanwhile: refused, said; saved again, written; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'SysTag', template: 'uart-avr' });
  const file = path.join(env.server.workspace, 'SysTag', F);
  await page.openProject('SysTag');
  await page.eval((f) => import('/js/system-open.js').then((m) => m.openSystem(f)), F);
  await page.waitFor(() => !!window.Silinx.active?.systemEditor, [], { what: 'the System editor' });
  const rename = (n) => page.eval((x) => { const d = window.Silinx.active, m = d.systemEditor.getModel(); m.name = x; d.systemEditor.setModel(m); window.SilinxApp.setDirty(d, true); return window.SilinxApp.saveAll(); }, n);
  // (nothing in between: written)
  await rename('mine1');
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved' });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).name, 'mine1');
  // another writer (edit_system's) meanwhile
  const theirs = `${JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), name: 'theirs' }, null, 2)}\n`;
  fs.writeFileSync(file, theirs);
  await rename('mine2');
  await page.waitConsole(/^ERROR: 'uart_avr\.sys\.json' was changed meanwhile \(by another window, tab or tool\): not written over; reopen it to see that change, or save again to keep yours$/m);
  assert.equal(fs.readFileSync(file, 'utf8'), theirs, 'not written over');
  assert.equal(await page.eval(() => window.Silinx.active.dirty), true, 'still to save');
  // saved again: the user's own
  await page.eval(() => window.SilinxApp.saveAll());
  await page.waitFor(() => !window.Silinx.active.dirty, [], { what: 'saved again' });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).name, 'mine2');
  assert.equal((await errors(page)).length, 1);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    fs.writeFileSync(file, theirs);
    await rename('mine3');
    await page.waitConsole(/^(ERROR|ERRO): 'uart_avr\.sys\.json' foi alterado entretanto \(por outra janela, separador ou ferramenta\): não escrito por cima; reabra-o para ver essa alteração, ou guarde de novo para manter a sua$/m);
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});
