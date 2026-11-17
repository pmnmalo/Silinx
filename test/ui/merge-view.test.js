// UI: the merge view of text files (#4214, web/js/merge-view.js), opened as a pull or a merge opens it: two files, one
// with two conflicts and a change taken from each side, one with a conflict at its end. The document's toolbar (the
// file, Previous / Next Conflict, the action, Cancel), its status line's counts, the sides and the result; the action
// refused while a conflict is left (said in the console, the conflict brought into view), Mine, Both and lines edited
// by hand; the choices given to the caller, the view closed; Cancel giving nothing. In Portuguese. Both interfaces;
// nothing written into the project, no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const L = (...l) => `${l.join('\n')}\n`;
const BASE = L('entity t is', '  port (a, b : in bit; y : out bit);', 'end t;', 'architecture rtl of t is', 'begin', '  y <= a and b;', 'end rtl;');
const FILES = [
  { path: 'src/t.vhd', base: BASE,
    mine: L('-- mine', 'entity t is', '  port (a, b : in bit; y : out bit);', 'end t; -- here', 'architecture rtl of t is', 'begin', '  y <= a or b;', 'end rtl;'),
    theirs: L('entity t is', '  port (a, b : in bit; y : out bit);', 'end entity t;', 'architecture rtl of t is', 'begin', '  y <= a xor b;', 'end rtl;') },
  { path: 'src/t.ucf', base: L('NET "a" LOC = "P11";'), mine: L('NET "a" LOC = "P11";', 'NET "b" LOC = "L3";'), theirs: L('NET "a" LOC = "P11";', 'NET "b" LOC = "K3";') },
];
// the view opened as a caller opens it; its result kept in window.__mergeResult
const openView = (page, action = 'Pull from GitHub') => page.eval(async (files, a) => {
  window.__mergeResult = undefined;
  const { openMergeView } = await import('/js/merge-view.js');
  openMergeView({ key: 'test', title: 'Merge (test)', files, labels: { mine: 'Mine (here)', theirs: 'Theirs (GitHub)' }, action: a }).then((r) => { window.__mergeResult = r; });
}, FILES, action);
const view = (page) => page.waitFor(() => document.querySelector('.merge-view:not([hidden]) .merge-choice') && {
  status: document.querySelector('.merge-view .doc-status').innerText.replace(/\s+/g, ' ').trim(),
  bar: [...document.querySelectorAll('.merge-bar button')].map((b) => b.textContent),
  heads: [...document.querySelectorAll('.merge-sides th')].map((t) => t.textContent),
  kinds: [...document.querySelectorAll('.merge-hunk')].map((r) => r.className.replace('merge-hunk merge-', '')),
  choices: [...document.querySelectorAll('.merge-choice')].map((c) => [c.dataset.id, c.querySelector('.merge-choice-name').textContent, c.classList.contains('resolved')]),
}, [], { what: 'the merge view' });
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
const lines = async (page, from) => (await page.consoleText()).slice(from).split('\n').map((l) => l.trim()).filter(Boolean);

uiTest('#4214 the merge view: the hunks side by side, a conflict chosen per hunk (Mine, Both, edited), the action refused until all are; Cancel', E, async (page) => {
  const from = (await page.consoleText()).length;
  await openView(page);
  let v = await view(page);
  assert.deepEqual(v.bar, ['Previous Conflict', 'Next Conflict', 'Pull from GitHub', 'Cancel']);
  assert.deepEqual(v.heads, ['Common Ancestor', 'Mine (here)', 'Theirs (GitHub)']);
  assert.deepEqual(v.kinds, ['mine', 'same', 'conflict', 'same', 'conflict', 'same']);
  assert.deepEqual(v.choices, [['h1', 'Conflict 1 of 2', false], ['h2', 'Conflict 2 of 2', false]]);
  assert.equal(v.status, 'File 1 of 2 0 of 3 conflict(s) resolved');
  assert.equal(await page.eval(() => document.querySelector('.merge-file-select').value), '0');
  assert.deepEqual(await lines(page, from), ['Merge: 3 conflict(s) in 2 file(s), the same lines changed on both sides: choose Mine, Theirs or Both for each, or edit its lines, then Pull from GitHub.']);
  // (the result: what each side's own change gives, a conflict's lines to choose)
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.merge-result > .merge-taken')].map((d) => d.innerText.trim())),
    ['-- mine', 'entity t is\n  port (a, b : in bit; y : out bit);', 'architecture rtl of t is\nbegin', 'end rtl;']);
  // the action with conflicts left: refused, said in the console, the first one in view
  await page.click('.merge-bar [data-cmd=apply]');
  await page.waitConsole(/^ERROR: Merge: 3 conflict\(s\) left to resolve \(src\/t\.vhd h1, src\/t\.vhd h2, src\/t\.ucf h1\): choose Mine, Theirs or Both, or edit its lines\.$/m);
  assert.equal(await page.eval(() => document.querySelector('.merge-choice.current')?.dataset.id), 'h1');
  assert.equal(await page.eval(() => window.__mergeResult), undefined);
  // Mine for the first, the second's lines edited by hand
  await page.click('.merge-choice[data-id=h1] .merge-pick-mine');
  assert.equal(await page.eval(() => document.querySelector('.merge-choice[data-id=h1] .merge-edit').value), 'end t; -- here');
  await page.click('.merge-choice[data-id=h2] .merge-pick-theirs');
  await page.click('.merge-choice[data-id=h2] .merge-edit');
  await page.eval(() => { const t = document.querySelector('.merge-choice[data-id=h2] .merge-edit'); t.value = '  y <= not (a and b);'; t.dispatchEvent(new Event('input')); });
  v = await view(page);
  assert.deepEqual(v.choices, [['h1', 'Conflict 1 of 2', true], ['h2', 'Conflict 2 of 2', true]]);
  assert.equal(await page.eval(() => document.querySelector('.merge-choice[data-id=h2] .merge-edited').textContent), 'Edited');
  assert.equal(v.status, 'File 1 of 2 2 of 3 conflict(s) resolved');
  // Next Conflict (after the second, in view): the other file's, Both
  await page.click('.merge-bar [data-cmd=next]');
  v = await view(page);
  assert.deepEqual(v.kinds, ['same', 'conflict']);
  assert.equal(await page.eval(() => document.querySelector('.merge-file-select').value), '1');
  await page.click('.merge-choice[data-id=h1] .merge-pick-both');
  assert.equal(await page.eval(() => document.querySelector('.merge-choice[data-id=h1] .merge-edit').value), 'NET "b" LOC = "L3";\nNET "b" LOC = "K3";');
  assert.equal((await view(page)).status, 'File 2 of 2 3 of 3 conflict(s) resolved');
  // (back to the first file: its choices kept)
  await page.eval(() => { const s = document.querySelector('.merge-file-select'); s.value = '0'; s.dispatchEvent(new Event('change')); });
  assert.deepEqual((await view(page)).choices.map((c) => c[2]), [true, true]);
  // the action: the choices given, the view closed, nothing written
  await page.click('.merge-bar [data-cmd=apply]');
  await page.waitFor(() => window.__mergeResult !== undefined && !document.querySelector('.merge-view'), [], { what: 'the view closed with its choices' });
  assert.deepEqual(await page.eval(() => window.__mergeResult), { 'src/t.vhd': { h1: 'mine', h2: { text: '  y <= not (a and b);' } }, 'src/t.ucf': { h1: 'both' } });
  // Cancel: nothing; the tab closed: nothing
  await openView(page, 'Merge');
  await view(page);
  await page.click('.merge-bar [data-cmd=cancel]');
  await page.waitFor(() => window.__mergeResult === null && !document.querySelector('.merge-view'), [], { what: 'Cancel' });
  await openView(page, 'Merge');
  await view(page);
  await page.eval(async () => { const app = await import('/js/app.js'); await app.closeDoc(app.S.docs.find((d) => d.merge)); });
  await page.waitFor(() => window.__mergeResult === null, [], { what: 'the tab closed' });
  assert.deepEqual(warnings(page), []);
});

uiTest('#4214 the merge view in Portuguese', E, async (page) => {
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    const from = (await page.consoleText()).length;
    await openView(page);
    await page.waitFor(() => document.querySelector('.merge-view .merge-bar [data-cmd=apply]')?.textContent === 'Receber do GitHub (Pull)', [], { what: 'translated' });
    const v = await view(page);
    assert.deepEqual(v.bar, ['Conflito Anterior', 'Conflito Seguinte', 'Receber do GitHub (Pull)', 'Cancelar']);
    assert.deepEqual(v.heads, ['Antepassado Comum', 'O meu (cá)', 'O deles (GitHub)']);
    assert.deepEqual(v.choices.map((c) => c[1]), ['Conflito 1 de 2', 'Conflito 2 de 2']);
    assert.equal(v.status, 'Ficheiro 1 de 2 0 de 3 conflito(s) resolvido(s)');
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.merge-pick')].slice(0, 3).map((b) => b.textContent)), ['O meu', 'O deles', 'Ambos']);
    assert.equal(await page.eval(() => document.querySelector('.merge-view h3').textContent), 'Resultado');
    assert.equal(await page.eval(() => document.querySelector('.merge-edit').placeholder), 'Escolha O meu, O deles ou Ambos, ou escreva aqui as linhas.');
    await page.click('.merge-bar [data-cmd=apply]');
    await page.waitConsole(/^ERROR: Junção: 3 conflito\(s\) por resolver \(src\/t\.vhd h1, src\/t\.vhd h2, src\/t\.ucf h1\): escolha O meu, O deles ou Ambos, ou edite as suas linhas\.$/m);
    assert.equal((await lines(page, from))[0], 'Junção: 3 conflito(s) em 2 ficheiro(s), as mesmas linhas alteradas dos dois lados: escolha O meu, O deles ou Ambos para cada um, ou edite as suas linhas, e depois Receber do GitHub (Pull).');
    await page.click('.merge-bar [data-cmd=cancel]');
    await page.waitFor(() => window.__mergeResult === null, [], { what: 'Cancel' });
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  assert.deepEqual(warnings(page), []);
});
