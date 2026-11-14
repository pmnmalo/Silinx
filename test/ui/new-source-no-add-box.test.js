// UI: New Source's File Name and Location page has no "Add to project" checkbox (#3890): a new source is always added
// to the project, so a box always checked and disabled said nothing. Every type's page, in English and in Portuguese;
// the source made is in the project all the same.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { pickSourceType, waitNewSourcePage } from './new-source-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TYPES = ['Boolean Algebra', 'Module (HDL)', 'Schematic', 'Finite State Machine (FSM)', 'Algorithmic State Machine (ASM)', 'Petri Net',
  'Clock Manager (DCM / PLL)', 'Block Memory', 'Test Bench', 'Implementation Constraints File', 'Memory Initialization File (.mem)',
  'C Function (HLS)', 'C++ Function (HLS)'];

// the File Name and Location page now: its checkboxes, its labels, its text
const pageNow = (page) => page.eval(() => {
  const m = [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.wiz-main');
  return { boxes: m.querySelectorAll('input[type=checkbox]').length, labels: [...m.querySelectorAll('label')].map((l) => l.textContent.trim()), text: m.textContent };
});

uiTest('New Source: no Add to project checkbox on any type\'s File Name and Location page, in English and in Portuguese; the source made is in the project', E, async (page) => {
  await makeProject(env, { name: 'NsNoBox', board: 'basys2' });
  await page.openProject('NsNoBox');
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const missing = [];
  for (const t of TYPES) {
    await page.menu('Project', 'New Source…');
    await page.waitDialog('New Source');
    await pickSourceType(page, t);
    await page.dialogButton('Next >');
    await waitNewSourcePage(page, 'File Name and Location');
    for (const l of ['en', 'pt']) {
      await setLang(l);
      const s = await pageNow(page);
      assert.equal(s.boxes, 0, `${t} (${l}): no checkbox`);
      if (l === 'en') assert.deepEqual(s.labels, ['Source type:', 'File name:', 'Location:', 'Language:'], `${t}: only the fields' labels`);
      assert.doesNotMatch(s.text, /Add to project|Adicionar ao projeto/i, `${t} (${l}): no Add to project`);
    }
    await setLang('en');
    const en = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay .wiz-main')));
    await setLang('pt');
    const pt = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay .wiz-main')));
    for (const s of untranslated(en, pt)) missing.push(`${t}: ${s}`);
    await setLang('en');
    await page.dialogButton('Cancel');
    await page.waitNoDialog();
  }
  assert.deepEqual(missing, []);
  // a source made through the page: in the project (a drawing, by its HDL file)
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source');
  await pickSourceType(page, 'Boolean Algebra');
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'File Name and Location');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'ba1');
  await page.dialogButton('Next >');
  await waitNewSourcePage(page, 'Summary');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => (window.Silinx.fileTree || []).includes('src/ba1.bool.json'), [], { what: 'src/ba1.bool.json registered' });
  const pj = JSON.parse(await readWs(env, 'NsNoBox', 'silinx.json'));
  assert.ok(pj.files.some((f) => f.path === 'src/ba1.vhd' && f.role === 'design'), JSON.stringify(pj.files));
});
