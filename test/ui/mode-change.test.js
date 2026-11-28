// UI: Project ▸ Change Mode… (#5755, web/js/mode-change-ui.js on core/mode-change.js, as the MCP's set_design_properties mode): the three
// modes as New Project's cards, the project's checked; what a change does said as it is chosen (up: nothing lost; down: a
// warning with each loss); blinky Board → System (its files in fpga/, its System document) → Board (the System document
// said lost, a WARNING in the console); a Circuit project given a board (its constraints written from the board's pins);
// in Portuguese. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const warnings = async page => (await page.consoleText()).split('\n').filter(l => /WARNING|ERROR/.test(l));
const there = (p, f) => fs.existsSync(path.join(env.server.workspace, p, f));
// (a file of the workspace waited for: written after the project is opened again)
async function until(ok, what) {
  for (let i = 0; i < 100; i++) { if (await ok()) return; await new Promise(r => setTimeout(r, 100)); }
  assert.fail(`timed out: ${what}`);
}
// the dialog: its cards (mode, checked), its note (its lines), whether its Change Mode is enabled
const dlg = page => page.eval(() => ({
  cards: [...document.querySelectorAll('.dlg-overlay .kind-card')].map(c => [c.dataset.mode, c.querySelector('.kind-name').textContent, c.querySelector('input').checked]),
  note: [...document.querySelectorAll('.dlg-overlay .mode-note > div, .dlg-overlay .mode-note li')].map(e => e.textContent),
  down: document.querySelector('.dlg-overlay .mode-note').classList.contains('mode-down'),
  ok: !document.querySelector('.dlg-overlay .dlg-buttons .btn.primary').disabled,
}));
const open = async (page, item = 'Change Mode…', menu = 'Project') => { await page.menu(menu, item); await page.waitFor(() => !!document.querySelector('.dlg-overlay .mode-note'), [], { what: 'Change Mode' }); };
const pick = (page, mode) => page.click(`.dlg-overlay .kind-card[data-mode=${mode}] input`);

uiTest('#5755 Change Mode: blinky Board → System, its files in fpga/, nothing lost; back to Board, its System document said lost', E, async (page) => {
  await makeProject(env, { name: 'ModeB', template: 'blinky' });
  await page.openProject('ModeB');
  await open(page);
  assert.deepEqual(await dlg(page), { cards: [['circuit', 'Circuit', false], ['board', 'Board', true], ['system', 'System', false]], note: [], down: false, ok: false });
  await pick(page, 'system');
  assert.deepEqual(await dlg(page), { cards: [['circuit', 'Circuit', false], ['board', 'Board', false], ['system', 'System', true]],
    note: ['Nothing is lost:', 'its board the System\'s first node, fpga (basys2)', 'its files moved into the node\'s folder, fpga/ (constraints, sim, src)', 'its System document ModeB.sys.json written'], down: false, ok: true });
  await page.dialogButton('Change Mode');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.profile === 'system', [], { what: 'a System project' });
  assert.deepEqual([there('ModeB', 'fpga/src/top.vhd'), there('ModeB', 'src'), there('ModeB', 'ModeB.sys.json')], [true, false, true]);
  assert.deepEqual(await warnings(page), []);
  // (down: the System document said lost before and after, a WARNING; the board, top and constraints back)
  await open(page);
  await pick(page, 'board');
  assert.deepEqual((await dlg(page)).note, ['Going down loses (nothing is deleted from the disk):', 'its System document ModeB.sys.json (it stays in the folder, out of the flow)']);
  assert.equal((await dlg(page)).down, true);
  await page.dialogButton('Change Mode');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.board === 'basys2' && window.Silinx.project.profile === 'fpga', [], { what: 'a Board project again' });   // (its profile written, #5907)
  const pj = await page.eval(() => window.Silinx.project);
  assert.deepEqual([pj.top, pj.constraints], ['top', 'fpga/constraints/top.ucf']);
  await page.waitFor(() => /lost: its System document/.test(window.__console()), [], { what: 'its warning' });
  assert.deepEqual((await warnings(page)).map(l => l.replace(/^.*?(lost:)/, '$1')), ['lost: its System document ModeB.sys.json (it stays in the folder, out of the flow)']);
});

uiTest('#5755 Change Mode: a Circuit project given a board, its constraints from the board\'s pins, no warning', E, async (page) => {
  await makeProject(env, { name: 'ModeC', kind: 'design', files: { 'src/traffic.fsm.json': fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8') }, top: 'traffic' });
  await page.openProject('ModeC');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/traffic.vhd'], [], { what: 'its HDL' });
  await open(page);
  assert.deepEqual((await dlg(page)).cards.map(c => c[2]), [true, false, false]);
  await pick(page, 'board');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .mode-board').style.display), '');
  await page.fill('.dlg-overlay .mode-board select', 'basys2');
  assert.deepEqual(await dlg(page), { cards: [['circuit', 'Circuit', false], ['board', 'Board', true], ['system', 'System', false]],
    note: ['Nothing is lost:', 'its board basys2', 'its constraints file constraints/top.ucf, to be written'], down: false, ok: true });
  await page.dialogButton('Change Mode');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.board === 'basys2' && window.Silinx.project.profile === 'fpga', [], { what: 'a Board project' });
  await until(() => there('ModeC', 'constraints/top.ucf'), 'its constraints written');
  await page.waitFor(() => /Board now/.test(window.__console()), [], { what: 'its line' });
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5755 Change Mode in Portuguese: its title, its words, its cards, its note', E, async (page) => {
  await makeProject(env, { name: 'ModeP', template: 'blinky' });
  await page.openProject('ModeP');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await open(page, 'Mudar o Modo…', 'Projeto').catch(() => open(page, 'Mudar o Modo…', 'Project'));
    assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .dlg-title span').textContent), 'Mudar o Modo');
    assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .dlg-body > div > .hint').textContent), 'Escolha o modo do projeto.');
    await pick(page, 'circuit');
    const d = await dlg(page);
    assert.deepEqual([d.cards.map(c => c[1]), d.note[0], d.note.at(-1)], [['Circuito', 'Placa', 'Sistema'], 'Descer perde (nada é apagado do disco):', 'a sua implementação, emulação e programação']);
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  assert.deepEqual(await warnings(page), []);
});
