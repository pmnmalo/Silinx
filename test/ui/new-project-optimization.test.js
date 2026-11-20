// UI (#4828): a new project's Optimization is Fast. File ▸ New Project…, an empty project: its silinx.json stores Optimization
// Goal Speed at Effort Normal, and Process Properties shows Fast; in Portuguese, Rápido. No warning in the console.
// Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the Optimization's select of Process Properties: its label, the option shown
const optimization = (page) => page.eval(() => {
  const l = [...document.querySelectorAll('.dlg-overlay label')].find((x) => /^(Optimization|Otimização):$/.test(x.textContent));
  const s = l.nextElementSibling;
  return [l.textContent, s.value, s.selectedOptions[0].text];
});
const processProperties = async (page, title) => {
  page.eval(async () => (await import('/js/wizards.js')).implProperties()).catch(() => {});
  await page.waitDialog(title);
};

uiTest('#4828 New Project: an empty project\'s Optimization Fast (Speed, Normal), as Process Properties shows; Portuguese; no warnings', E, async (page) => {
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'NewFast');
  // its three pages, each waited for by its heading: Create New Project, Project Settings, Project Summary
  const heading = (t) => page.waitFor((x) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === x, [t], { what: `the page ${t}` });
  await heading('Create New Project');
  await page.dialogButton('Next >');
  await heading('Project Settings');
  await page.dialogButton('Next >');
  await heading('Project Summary');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n, ['NewFast'], { what: 'the new project open' });
  const impl = JSON.parse(await readWs(env, 'NewFast', 'silinx.json')).impl;
  assert.deepEqual(impl, { optMode: 'Speed', optLevel: 1, startupClk: 'JtagClk' });
  await processProperties(page, 'Process Properties - Synthesis / Implementation / Bitstream');
  assert.deepEqual(await optimization(page), ['Optimization:', 'fast', 'Fast']);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await processProperties(page, 'Propriedades do Processo - Síntese / Implementação / Bitstream');
    assert.deepEqual(await optimization(page), ['Otimização:', 'fast', 'Rápido']);
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /WARNING|ERROR/.test(l)), []);
});
