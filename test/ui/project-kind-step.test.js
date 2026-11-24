// UI: New Project asks the project's kind first (#5041, web/js/project-kind-step.js, core/project-kind.js): Digital Logic
// (the design and simulation project, #3780, #3891; no FPGA or HDL in its card, #5133), FPGA (the default) or System (#4702:
// test/ui/system-new-project.test.js); with no FPGA, no example to start from. A project with no
// FPGA made there shows nothing of HDL or FPGA: no VHDL / Verilog badges, no synthesis, implementation or bitstream
// process, task, menu item or toolbar button, no board, device or constraints. In English and in Portuguese, no
// warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const L = {
  en: { next: 'Next >', back: '< Back', finish: 'Finish', cancel: 'Cancel', file: 'File', item: 'New Project…' },
  pt: { next: 'Seguinte >', back: '< Anterior', finish: 'Concluir', cancel: 'Cancelar', file: 'Ficheiro', item: 'Novo Projeto…' },
};
const warnings = async page => (await page.consoleText()).split('\n').filter(l => /WARNING|ERROR/.test(l));
const h3 = page => page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent);
const shownLabels = page => page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid > label')].filter(l => l.style.display !== 'none').map(l => l.textContent));
// the kind page: its heading, its hint, its cards (name, words, a reason it cannot be chosen: none since #4702; chosen, disabled), its steps
const kindPage = page => page.eval(() => ({
  title: document.querySelector('.dlg-overlay .wiz-main h3').textContent,
  hint: document.querySelector('.dlg-overlay .wiz-main .hint').textContent,
  cards: [...document.querySelectorAll('.dlg-overlay .kind-card')].map(c => [c.dataset.kind, c.querySelector('.kind-name').textContent,
    c.querySelector('.kind-about').textContent, c.querySelector('.kind-not-yet')?.textContent ?? null, c.querySelector('input').checked, c.querySelector('input').disabled]),
  steps: [...document.querySelectorAll('.dlg-overlay .wiz-side .step')].map(s => s.textContent),
}));
// Digital Logic's card says nothing of FPGA or HDL (#5133: its students need not know what an FPGA is)
const designCardText = page => page.eval(() => document.querySelector('.dlg-overlay .kind-card[data-kind=design]').textContent);
const openWizard = async (page, l) => {
  await page.menu(l.file, l.item).catch(() => page.menu(l.file, L.en.item));
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .kind-cards'), [], { what: 'New Project\'s kind' });
};

const EN_CARDS = [
  ['design', 'Digital Logic', 'Digital logic for the introductory courses: schematics, truth tables, state machines and circuits on a breadboard, drawn and simulated.', null, false, false],
  ['fpga', 'FPGA', 'A design that runs on a board: HDL sources and drawings, simulated, synthesized, implemented and programmed on the FPGA, or emulated.', null, true, false],
  ['embedded', 'Embedded / SoC', 'FPGA boards and microcontrollers linked in one System, designed and simulated as one.', null, false, false],
  ['system', 'System', 'A system of FPGA and microcontroller nodes linked together, designed and simulated as one.', null, false, false],
];
const PT_CARDS = [
  ['design', 'Lógica Digital', 'Lógica digital para as disciplinas introdutórias: esquemáticos, tabelas de verdade, máquinas de estados e circuitos numa breadboard, desenhados e simulados.', null, false, false],
  ['fpga', 'FPGA', 'Um projeto que corre numa placa: fontes HDL e desenhos, simulados, sintetizados, implementados e programados na FPGA, ou emulados.', null, true, false],
  ['embedded', 'Embebido / SoC', 'Placas FPGA e microcontroladores ligados num Sistema, desenhados e simulados como um todo.', null, false, false],
  ['system', 'Sistema', 'Um sistema de nós de FPGA e de microcontrolador ligados entre si, desenhado e simulado como um todo.', null, false, false],
];

// what of HDL or FPGA the interface shows of the open project (none in a project with no FPGA): the Design pane's badges,
// the Files tab's HDL and constraints, the menus' items, the toolbar's buttons, the process tree, the tasks, the status line
const FLOW = /synthe|sintet|implement|programming file|ficheiro de programa|bitstream|translate|place ?& ?route|configure target|impact|i\/o pin|pinos de e\/s|constraints|restrições|board emulator|emulador|fpga view|vista da fpga|timing|temporiza|\bvhdl\b|\bverilog\b/i;
const fpgaShown = page => page.eval((src) => {
  const re = new RegExp(src, 'i');
  const S = window.SilinxApp.S;
  const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const items = S.menus.filter(m => ['Process', 'Tools', 'View', 'Processo', 'Ferramentas', 'Ver'].includes(m.label) || ['Process', 'Tools', 'View'].includes(m.id))
    .flatMap(m => m.items().filter(x => x && x !== '-').map(x => x.label));
  return {
    badges: [...document.querySelectorAll('#hier .badge')].map(b => b.textContent).filter(t => re.test(t)),
    files: [...document.querySelectorAll('#files-page tr[data-file]')].map(r => r.dataset.file).filter(f => /\.(vhdl?|v|ucf|xdc)$/.test(f)),
    menus: items.filter(t => re.test(t)),
    toolbar: [...document.querySelectorAll('#toolbar :is(.tb-btn, .m-step)')].filter(visible).map(b => b.title || b.textContent).filter(t => re.test(t)),
    procs: [...document.querySelectorAll('#procs .row .lbl')].filter(visible).map(e => e.textContent).filter(t => re.test(t)),
    tasks: [...document.querySelectorAll('.task-btn')].filter(visible).map(b => b.textContent.trim()).filter(t => re.test(t)),
    device: document.getElementById('status-device')?.textContent ?? '',
  };
}, FLOW.source);
const NOTHING = { badges: [], files: [], menus: [], toolbar: [], procs: [], tasks: [], device: '' };

// a project with no FPGA made through the kind page (`l`: its language's buttons), a state diagram its top
async function makeNoFpga(page, name, l) {
  await openWizard(page, l);
  await page.click('.dlg-overlay .kind-card[data-kind=design] input');
  await page.dialogButton(l.next);
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.dialogButton(l.next);
  await page.waitFor(() => document.querySelectorAll('.dlg-overlay .wiz-main select').length > 6, [], { what: 'Project Settings' });
  await page.fill('.dlg-overlay .wiz-main select', 'fsm', { index: 6 });
  await page.dialogButton(l.next);
  await page.dialogButton(l.finish);
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n && window.Silinx.hdlToSch?.['src/top.vhd'] === 'src/top.fsm.json' && document.querySelector('#hier .row.top-mod'),
    [name], { what: `${name} open, its state diagram's HDL made` });
  const pj = await page.eval(() => window.Silinx.project);
  assert.deepEqual([pj.kind, pj.board, pj.constraints, pj.top], ['design', null, null, 'top']);
}
// the process tree of its top shown (the ISE style interface's: its Implementation view)
async function showProcesses(page) {
  if (await page.eval(() => document.documentElement.dataset.layout === 'tasks')) return;
  await page.setView('impl');
  await page.treeRow('#hier', 'top');
  await page.waitFor(() => document.querySelectorAll('#procs .row .lbl').length > 0, [], { what: 'the processes' });
}

uiTest('#5041 #5133 #4702 New Project: the kind first, three cards (Digital Logic, FPGA, System); Digital Logic: no example; Back keeps it', E, async (page) => {
  await openWizard(page, L.en);
  assert.deepEqual(await kindPage(page), { title: 'Project Kind', hint: 'Choose the kind of project to create.', cards: EN_CARDS,
    steps: ['Project Kind', 'Create New Project', 'Project Settings', 'Project Summary'] });
  assert.doesNotMatch(await designCardText(page), /FPGA|HDL/);
  // (System: chosen by its card, #4702; the FPGA chosen back)
  await page.click('.dlg-overlay .kind-card[data-kind=system]');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .kind-card input:checked').value), 'system');
  await page.click('.dlg-overlay .kind-card[data-kind=fpga]');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .kind-card input:checked').value), 'fpga');
  // FPGA (the default): Start from as before
  await page.dialogButton('Next >');
  assert.equal(await h3(page), 'Create New Project');
  assert.deepEqual(await shownLabels(page), ['Name:', 'Location:', 'Start from:']);
  // back, Digital Logic: no example to start from; its kind kept going back and forth
  await page.dialogButton('< Back');
  await page.click('.dlg-overlay .kind-card[data-kind=design] input');
  await page.dialogButton('Next >');
  assert.deepEqual(await shownLabels(page), ['Name:', 'Location:']);
  await page.dialogButton('< Back');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .kind-card input:checked').value), 'design');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5041 a project with no FPGA made by New Project shows nothing of HDL or FPGA: no badges, no flow, no board, no constraints', E, async (page) => {
  await makeNoFpga(page, 'NoFpga', L.en);
  await showProcesses(page);
  assert.deepEqual(await fpgaShown(page), NOTHING);
  // (its drawing's rows: its kinds alone)
  assert.deepEqual(await page.eval(() => [...[...document.querySelectorAll('#hier .row')].find(r => r.querySelector('.lbl')?.textContent === 'top').querySelectorAll('.badge')].map(b => b.textContent)), ['FSM', 'Schematic']);
  assert.deepEqual(await warnings(page), []);
  // (the same state diagram in a project with an FPGA: its HDL badge, its flow, its device shown, what the check looks for)
  await makeProject(env, { name: 'WithFpga', board: 'basys2', files: { 'src/traffic.fsm.json': fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8') }, top: 'traffic' });
  await page.openProject('WithFpga');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/traffic.vhd'] === 'src/traffic.fsm.json', [], { what: 'its HDL' });
  await page.waitFor(() => [...document.querySelectorAll('#hier .badge')].some(b => b.textContent === 'VHDL'), [], { what: 'its VHDL badge' });
  if (!(await page.eval(() => document.documentElement.dataset.layout === 'tasks'))) { await page.setView('impl'); await page.treeRow('#hier', 'traffic'); }
  const fpga = await fpgaShown(page);
  assert.ok(fpga.badges.includes('VHDL') && fpga.files.includes('src/traffic.vhd') && fpga.menus.length && (fpga.procs.length || fpga.tasks.length) && fpga.device, JSON.stringify(fpga));
});

uiTest('#5041 #5133 in Portuguese: New Project\'s kind, its cards (Lógica Digital, FPGA); a project with no FPGA shows nothing of HDL or FPGA', E, async (page) => {
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await openWizard(page, L.pt);
    assert.deepEqual(await kindPage(page), { title: 'Tipo de Projeto', hint: 'Escolha o tipo de projeto a criar.', cards: PT_CARDS,
      steps: ['Tipo de Projeto', 'Criar Novo Projeto', 'Definições do Projeto', 'Resumo do Projeto'] });
    assert.doesNotMatch(await designCardText(page), /FPGA|HDL/);
    await page.dialogButton(L.pt.cancel);
    await page.waitNoDialog();
    await makeNoFpga(page, 'SemFpga', L.pt);
    await showProcesses(page);
    assert.deepEqual(await fpgaShown(page), NOTHING);
    assert.deepEqual(await warnings(page), []);
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});
