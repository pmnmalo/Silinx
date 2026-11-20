// UI (#4764): a side panel's sections do not fold (the Schematic editor's sheet and selection: plain sections with their
// heading, no <details>); an exercise or a results file opened while another project opens meanwhile is not opened in
// it (#1231); the toolbar's steps follow the project without a 1-second polling that wrote their labels again (in
// Portuguese, translated again every second): idle, the toolbar does not change. Both interfaces; no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { newDoc } from '../../core/schdoc.js';
import { setupUi, uiTest, makeProject, tick } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const TOP = 'entity top is end;\narchitecture a of top is begin end;\n';
const noProblems = (page) => assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);

uiTest('#4764 the Schematic editor\'s Properties: plain sections with their heading, none folding', E, async (page) => {
  await makeProject(env, { name: 'PlainSecs', top: '', files: { 'src/s.sch.json': JSON.stringify(newDoc('s')) } });
  await page.openProject('PlainSecs');
  await page.eval(() => window.SilinxApp.openFile('src/s.sch.json'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .sch-editor .se-sec'), [], { what: 'the sheet\'s properties' });
  const secs = await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .sch-editor .se-sec')].map((s) => [s.tagName, s.querySelector('.se-sec-title')?.textContent]));
  assert.deepEqual(secs, [['DIV', 'HDL kept with the schematic']]);
  assert.equal(await page.eval(() => document.querySelectorAll('.doc:not([hidden]) .sch-editor details').length), 0);
  noProblems(page);
});

uiTest('#4764 an exercise and a results file read while another project opens: not opened in it', E, async (page) => {
  const EX = JSON.stringify({ title: 'Ex', statement: '', top: 'top', tests: [] });
  await makeProject(env, { name: 'GuardA', top: 'top', files: { 'src/top.vhd': TOP, 'a.exercise.json': EX, 'r.results.json': '[]' } });
  await makeProject(env, { name: 'GuardB', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('GuardA');
  // (the file's reading held until the other project is open)
  await page.eval(async () => {
    const { api } = await import('/js/api.js');
    const read = api.readFile;
    window.__held = [];
    api.readFile = (...a) => new Promise((ok, ko) => window.__held.push(() => read.apply(api, a).then(ok, ko)));
    window.__restore = () => { api.readFile = read; };
    const ex = await import('/js/exercise-view.js'), res = await import('/js/grade-results-view.js');
    window.__opened = Promise.all([ex.openExercise('a.exercise.json'), res.openResultsFile('r.results.json')]);
  });
  await page.waitFor(() => window.__held.length === 2, [], { what: 'the two reads started' });
  await page.eval(() => window.__restore());
  await page.openProject('GuardB');
  assert.deepEqual(await page.eval(async () => { for (const f of window.__held) f(); return (await window.__opened).map((d) => d ?? null); }), [null, null]);
  assert.deepEqual(await page.eval(() => [window.Silinx.project.name, window.Silinx.docs.map((d) => d.id).filter((id) => /^(exercise|results):/.test(id))]), ['GuardB', []]);
  noProblems(page);
});

uiTest('#4764 the toolbar\'s steps: no polling; idle, nothing of the toolbar changes; they follow a project closed', E, async (page) => {
  await makeProject(env, { name: 'Steps', top: 'top', files: { 'src/top.vhd': TOP } });
  await page.openProject('Steps');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await tick(300);
  // idle for 2.5 s: no change of the toolbar (the polling wrote its steps' labels every second, the translator then
  // writing them again)
  const changes = await page.eval(() => new Promise((ok) => {
    let n = 0;
    const o = new MutationObserver((l) => { n += l.length; });
    o.observe(document.getElementById('toolbar'), { subtree: true, childList: true, attributes: true, characterData: true });
    setTimeout(() => { o.disconnect(); ok(n); }, 2500);
  }));
  assert.equal(changes, 0);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  // the steps follow the project closed at once (not a second later): each as its own state says
  const steps = () => page.eval(() => [...document.querySelectorAll('#toolbar .m-step')].map((b) => [b.dataset.step, b.disabled, !b._enabled()]));
  const before = await steps();
  await page.eval(() => window.SilinxApp.closeProject());
  await page.waitFor(() => [...document.querySelectorAll('#toolbar .m-step')].every((b) => b.disabled === !b._enabled()), [], { what: 'the steps as their state', timeout: 400 });
  const after = await steps();
  if (before.length) assert.notDeepEqual(after.map((x) => x[1]), before.map((x) => x[1]), 'the steps changed with the project closed');
  noProblems(page);
});
