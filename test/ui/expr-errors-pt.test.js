// UI: a drawing's condition that does not parse, its Check's error in Portuguese with the parser's reason translated
// too (#5196: core/asm-expr.js's errors had no Portuguese: "transição start: guarda 'go &': unexpected end of
// expression"): a Petri net's guard, a state diagram's transition, an ASM chart's decision; the Errors tab's row, exact, and no
// warning. Both interfaces (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newModel } from '../../core/asm.js';
import { newFsm } from '../../core/fsm.js';
import { newPetri } from '../../core/petri.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const json = (m) => JSON.stringify(m, null, 2);
const tab = (page, id) => page.eval((i) => [...document.querySelectorAll(`#${i} .diag`)].map((r) => r.textContent), id);

// the drawing opened, its error listed (the only problem), then in Portuguese: its row (its file then the message)
async function inPortuguese(page, name, file, en, pt) {
  await page.openProject(name);
  await page.eval((f) => window.SilinxApp.openFile(f), file);
  await page.waitFor((m) => [...document.querySelectorAll('#console-errors .diag')].some((r) => r.textContent.endsWith(m)), [en], { what: 'the error in English' });
  assert.deepEqual(await tab(page, 'console-warnings'), []);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor((m) => [...document.querySelectorAll('#console-errors .diag')].some((r) => r.textContent.endsWith(m)), [pt], { what: 'the error in Portuguese' });
    assert.deepEqual((await tab(page, 'console-errors')).map((r) => r.split(`"${file}": `)[1]), [pt]);
    assert.deepEqual(await tab(page, 'console-warnings'), []);
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
}

uiTest('#5196 a Petri net\'s guard that does not parse: its error in Portuguese, the reason too', E, async (page) => {
  const m = newPetri('ctl');
  m.transitions[0].guard = 'go &';
  await makeProject(env, { name: 'ExprPtPn', top: '', files: { 'src/ctl.pn.json': json(m) } });
  await inPortuguese(page, 'ExprPtPn', 'src/ctl.pn.json', "transition start: guard 'go &': unexpected end of expression",
    "transição start: guarda 'go &': fim inesperado da expressão");
});

uiTest('#5196 a state diagram\'s condition that does not parse: its error in Portuguese, the reason and its column too', E, async (page) => {
  const m = newFsm('ctl');
  m.transitions[0].cond = 'x &';
  await makeProject(env, { name: 'ExprPtFsm', top: '', files: { 'src/ctl.fsm.json': json(m) } });
  await inPortuguese(page, 'ExprPtFsm', 'src/ctl.fsm.json', "Transition S0 → S1: the condition 'x &' is not valid (column 4: unexpected end of expression)",
    "Transição S0 → S1: a condição 'x &' não é válida (coluna 4: fim inesperado da expressão)");
});

uiTest('#5196 an ASM chart\'s decision that does not parse: its error in Portuguese, the reason too', E, async (page) => {
  const m = newModel('ctl', 'vhdl');
  m.nodes.find((n) => n.id === 'd1').cond = 'start &';
  await makeProject(env, { name: 'ExprPtAsm', top: '', files: { 'src/ctl.asm.json': json(m) } });
  await inPortuguese(page, 'ExprPtAsm', 'src/ctl.asm.json', "Decision 'start &': unexpected end of expression",
    "Decisão 'start &': fim inesperado da expressão");
});
