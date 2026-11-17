// UI: the Simulation view's models are the project's tool's (#3707): a Basys 3 project lists Simulate Behavioral Model only
// (its flow makes no Post-… simulation model), an iCE40 one the Post-Synthesis and Post-Place & Route ones too (#2299), a
// Basys2 project the four Post-… ones; the Tasks interface's model choices (the task's bar's, SSim's toolbar's) the same. In
// Portuguese; both interfaces and the Tasks interface. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = `library ieee; use ieee.std_logic_1164.all;
entity sm is
  port (sw : in std_logic_vector(1 downto 0); led : out std_logic_vector(1 downto 0));
end sm;
architecture rtl of sm is
begin
  led <= sw;
end rtl;
`;
const UP5K = { family: 'ice40', part: 'ice40up5k', package: 'sg48', speed: '' };
const POST = ['Simulate Post-Synthesis Model', 'Simulate Post-Translate Model', 'Simulate Post-Map Model', 'Simulate Post-Place & Route Model'];
// (each project: its models' labels' indexes in POST)
const PROJECTS = [['SmIce', { device: UP5K }, [0, 3]], ['SmB3', { board: 'basys3' }, []], ['SmB2', { board: 'basys2' }, [0, 1, 2, 3]]];
const make = (name, o) => makeProject(env, { name, ...o, files: { 'src/sm.vhd': TOP }, top: 'sm' });
const noWarnings = async (page) => {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /WARNING|ERROR/.test(l)), []);
};
// the SSim Simulator group's processes of the module
const simProcs = async (page) => {
  await page.setView('sim');
  await page.treeRow('#hier', 'sm');
  return page.eval(() => [...document.querySelectorAll('#procs .row')].map((x) => x.textContent.trim().replace(/^▾/, '')));
};

uiTest('#3707 #2299 the Simulation view: no Simulate Post-… Model on a Basys 3 project, the Post-Synthesis and Post-Place & Route ones on an iCE40 one, the four on a Basys2 one; in Portuguese', E, async (page) => {
  for (const [name, o, models] of PROJECTS) {
    await make(name, o);
    await page.openProject(name);
    const labels = await simProcs(page);
    assert.ok(labels.includes('Simulate Behavioral Model'), `${name}: ${labels}`);
    assert.deepEqual(POST.filter((l) => labels.includes(l)), models.map((i) => POST[i]), `${name}: ${labels}`);
    // in Portuguese: the same rows
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    const pt = await simProcs(page);
    assert.ok(pt.includes('Simular Modelo Comportamental'), `${name}: ${pt}`);
    assert.equal(pt.includes('Simular Modelo Pós-Síntese'), models.includes(0), `${name}: ${pt}`);
    assert.ok(!pt.some((l) => /^Simulate /.test(l)), `${name}: ${pt}`);
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  await noWarnings(page);
});

uiTest('#3707 #2299 the Tasks interface: Simulate\'s model choices, the task\'s bar\'s and SSim\'s toolbar\'s, Behavioral only on a Basys 3 project, Post-Synthesis and Post-Place & Route on an iCE40 one; in Portuguese', E, async (page) => {
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await page.setViewport(1680, 1050);
  const options = (sel) => page.eval((s) => [...document.querySelectorAll(`${s} option`)].map((o) => o.textContent), sel);
  for (const [name, o, models] of PROJECTS) {
    await make(`${name}T`, o);
    await page.openProject(`${name}T`);
    await page.click('#task-switch .task-btn[data-task="sim"]');
    await page.waitFor(() => document.querySelector('#task-model'), [], { what: 'the model choice' });
    const want = ['Behavioral', ...models.map((i) => ['Post-Synthesis', 'Post-Translate', 'Post-Map', 'Post-Place & Route'][i])];
    await page.waitFor((w) => JSON.stringify([...document.querySelectorAll('#task-model option')].slice(1).map((x) => x.textContent)) === w, [JSON.stringify(want)], { what: `${name}'s models` });
    assert.deepEqual(await options('#task-model'), ['Select simulation model...', ...want], name);
    // SSim's toolbar's choice: the same models
    await page.eval(() => window.SilinxApp.runSimulation('sm'));
    await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim-toolbar .isim-model'), [], { what: 'SSim\'s model' });
    assert.deepEqual(await options('.doc:not([hidden]) .isim-toolbar .isim-model'), want, name);
    // in Portuguese
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim-toolbar .isim-model option')?.textContent === 'Comportamental', [], { what: 'Portuguese' });
    assert.equal((await options('.doc:not([hidden]) .isim-toolbar .isim-model')).length, want.length, name);
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  await page.eval(() => localStorage.removeItem('silinx.ui'));
  await noWarnings(page);
});
