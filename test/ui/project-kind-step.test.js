// UI: New Project asks the project's mode first (#5041, #5754: web/js/project-kind-step.js, core/project-mode.js), three cards
// with a drawing each: Circuit (the design and simulation project, #3780, #3891; no FPGA or HDL in its card, #5133), Board (the
// default: an FPGA project) or System (#4702:
// test/ui/system-new-project.test.js); with no FPGA, no example to start from. A project with no
// FPGA made there shows nothing of HDL or FPGA: no VHDL / Verilog badges, no synthesis, implementation or bitstream
// process, task, menu item or toolbar button, no board, device or constraints. In English and in Portuguese, no
// warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';
import { addTopDrawing } from './top-doc.js';

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
  cards: [...document.querySelectorAll('.dlg-overlay .kind-card')].map(c => [c.dataset.kind, c.dataset.mode, !!c.querySelector('.kind-art svg path, .kind-art svg rect'), c.querySelector('.kind-name').textContent,
    c.querySelector('.kind-about').textContent, c.querySelector('.kind-not-yet')?.textContent ?? null, c.querySelector('input').checked, c.querySelector('input').disabled]),
  steps: [...document.querySelectorAll('.dlg-overlay .wiz-side .step')].map(s => s.textContent),
}));
// Digital Logic's card says nothing of FPGA or HDL (#5133: its students need not know what an FPGA is)
// Start from's options offered (not hidden)
const startFrom = page => page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-main select option')].filter(o => !o.hidden && !o.disabled).map(o => o.value));
const designCardText = page => page.eval(() => document.querySelector('.dlg-overlay .kind-card[data-kind=design]').textContent);
const openWizard = async (page, l) => {
  await page.menu(l.file, l.item).catch(() => page.menu(l.file, L.en.item));
  await page.waitFor(() => !!document.querySelector('.dlg-overlay .kind-cards'), [], { what: 'New Project\'s kind' });
};

// (the three modes, #5754: Circuit, Board, System, each the kind it makes, its mode, its drawing)
const EN_CARDS = [
  ['design', 'circuit', true, 'Circuit', 'Elementary components with no board: gates, flip-flops, circuits on a breadboard, schematics, truth tables and state machines, drawn and simulated.', null, false, false],
  ['fpga', 'board', true, 'Board', 'One board, with its flow, its emulator and its programming: an FPGA\'s HDL and drawings synthesized and programmed, or a processor board\'s firmware built and run; or emulated.', null, true, false],
  ['system', 'system', true, 'System', 'Several devices linked (UART, SPI, Pmods): FPGA boards and microcontrollers in one System document, simulated as one.', null, false, false],
];
const PT_CARDS = [
  ['design', 'circuit', true, 'Circuito', 'Componentes elementares sem placa: portas, flip-flops, circuitos numa breadboard, esquemáticos, tabelas de verdade e máquinas de estados, desenhados e simulados.', null, false, false],
  ['fpga', 'board', true, 'Placa', 'Uma placa, com o seu fluxo, o seu emulador e a sua programação: o HDL e os desenhos de uma FPGA sintetizados e programados, ou o firmware de uma placa de processador compilado e executado; ou emulados.', null, true, false],
  ['system', 'system', true, 'Sistema', 'Vários dispositivos ligados (UART, SPI, Pmods): placas FPGA e microcontroladores num documento de Sistema, simulados como um todo.', null, false, false],
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

// a project with no FPGA made through the kind page (`l`: its language's buttons), a state diagram its top (added after it)
async function makeNoFpga(page, name, l) {
  await openWizard(page, l);
  await page.click('.dlg-overlay .kind-card[data-kind=design] input');
  await page.dialogButton(l.next);
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.dialogButton(l.next);
  await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === t, [l === L.en ? 'Project Settings' : 'Definições do Projeto'], { what: 'Project Settings' });
  await page.dialogButton(l.next);
  // (the summary says its mode, #5754)
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .wiz-main pre').textContent), /\n {2}Mode: {9}Circuit\n/);
  await page.dialogButton(l.finish);
  await page.waitNoDialog();
  // (an empty project of its mode, #5786: its top, a state diagram, added as New Source adds one)
  await page.waitFor((n) => window.Silinx.project?.name === n, [name], { what: `${name} open` });
  await addTopDrawing(env, name, 'fsm');
  await page.openProject(name);
  await page.waitFor((n) => window.Silinx.project?.name === n && window.Silinx.hdlToSch?.['src/top.vhd'] === 'src/top.fsm.json' && document.querySelector('#hier .row.top-mod'),
    [name], { what: `${name} open, its state diagram's HDL made` });
  const pj = await page.eval(() => window.Silinx.project);
  assert.deepEqual([pj.profile, pj.board, pj.constraints, pj.top], ['logic', null, null, 'top']);   // (its profile, #5907)
}
// the process tree of its top shown (the ISE style interface's: its Implementation view)
async function showProcesses(page, top = 'top') {
  if (await page.eval(() => document.documentElement.dataset.layout === 'tasks')) return;
  await page.setView('impl');
  await page.treeRow('#hier', top);
  await page.waitFor(() => document.querySelectorAll('#procs .row .lbl').length > 0, [], { what: 'the processes' });
}

uiTest('#5041 #5133 #4702 #5754 #5757 New Project: the mode first, three cards with a drawing each (Circuit, Board, System); Circuit: its examples alone; Back keeps it', E, async (page) => {
  await openWizard(page, L.en);
  assert.deepEqual(await kindPage(page), { title: 'Project Mode', hint: 'Choose the mode of the project.', cards: EN_CARDS,
    steps: ['Project Mode', 'Create New Project', 'Project Settings', 'Project Summary'] });
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
  // back, Circuit: its examples alone to start from (#5757: the drawings-only ones); its kind kept going back and forth
  await page.dialogButton('< Back');
  await page.click('.dlg-overlay .kind-card[data-kind=design] input');
  await page.dialogButton('Next >');
  assert.deepEqual(await shownLabels(page), ['Name:', 'Location:', 'Start from:']);
  assert.deepEqual(await startFrom(page), ['empty', 'gates', 'breadboard', 'traffic-circuit', 'blinky-circuit', 'stopwatch-circuit', 'lock-circuit']);   // (the Circuit versions, #5779)
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

uiTest('#5041 #5133 #5754 in Portuguese: New Project\'s mode, its cards (Circuito, Placa, Sistema); a project with no FPGA shows nothing of HDL or FPGA', E, async (page) => {
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await openWizard(page, L.pt);
    assert.deepEqual(await kindPage(page), { title: 'Modo do Projeto', hint: 'Escolha o modo do projeto.', cards: PT_CARDS,
      steps: ['Modo do Projeto', 'Criar Novo Projeto', 'Definições do Projeto', 'Resumo do Projeto'] });
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

uiTest('#5757 New Project: a Circuit project from the gates example, no board, no constraints, nothing of HDL or FPGA shown', E, async (page) => {
  await openWizard(page, L.en);
  await page.click('.dlg-overlay .kind-card[data-kind=design] input');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'GatesC');
  await page.fill('.dlg-overlay .wiz-main select', 'gates');
  await page.dialogButton('Next >');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'GatesC' && document.querySelector('#hier .row.top-mod'), [], { what: 'GatesC open' });
  const pj = await page.eval(() => window.Silinx.project);
  assert.deepEqual([pj.profile, pj.board, pj.constraints, pj.top, pj.topSourceType], ['logic', null, null, 'gates', undefined]);   // (its top type the example's own: none)
  await showProcesses(page, 'gates');
  assert.deepEqual(await fpgaShown(page), NOTHING);
  assert.deepEqual(await warnings(page), []);
});

// (#5779: a Circuit version of an example, made by New Project ▸ Circuit; in Portuguese its Start from's option)
async function circuitExample(page, name, l, example) {
  await openWizard(page, l);
  await page.click('.dlg-overlay .kind-card[data-kind=design] input');
  await page.dialogButton(l.next);
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.fill('.dlg-overlay .wiz-main select', example);
  await page.dialogButton(l.next);
  await page.dialogButton(l.next);
  await page.dialogButton(l.finish);
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n && document.querySelector('#hier .row.top-mod'), [name], { what: `${name} open` });
}

uiTest('#5779 New Project ▸ Circuit ▸ traffic-circuit: a Circuit project, its drawings its rows, nothing of HDL or FPGA shown, no warning', E, async (page) => {
  await circuitExample(page, 'CrossingC', L.en, 'traffic-circuit');
  const pj = await page.eval(() => window.Silinx.project);
  assert.deepEqual([pj.profile, pj.board, pj.constraints, pj.top, pj.simTop], ['logic', null, null, 'crossing', 'tb_crossing']);
  // (its top a schematic, its controller a state diagram, its lamps a truth table, its timer the palette's counter)
  await page.waitFor(() => ['crossing', 'fsm - traffic', 'lights - lamps'].every(t => [...document.querySelectorAll('#hier .row .lbl')].some(e => e.textContent === t)), [], { what: 'its rows' });
  await showProcesses(page, 'crossing');
  assert.deepEqual(await fpgaShown(page), NOTHING);
  assert.deepEqual(await warnings(page), []);
});

uiTest('#5779 in Portuguese: New Project ▸ Circuito ▸ lock-circuit, its Start from\'s option translated; no warning', E, async (page) => {
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await openWizard(page, L.pt);
    await page.click('.dlg-overlay .kind-card[data-kind=design] input');
    await page.dialogButton(L.pt.next);
    assert.ok(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .wiz-main select option')].some(o => o.value === 'lock-circuit' && !o.hidden && /^Exemplo: lock-circuit$/.test(o.textContent))));
    await page.dialogButton(L.pt.cancel);
    await page.waitNoDialog();
    await circuitExample(page, 'CofreC', L.pt, 'lock-circuit');
    assert.equal(await page.eval(() => window.Silinx.project.top), 'safe');
    assert.deepEqual(await warnings(page), []);
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});
