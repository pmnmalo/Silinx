// UI: Vivado ML Standard's other 7-series families (#3895): the Spartan-7, the Kintex-7 and the Zynq-7000 in the New Project
// wizard and Design Properties, marked experimental, their parts listed; their synthesis tool AMD Vivado alone, locked (no
// Silinx toolchain of theirs), the Artix-7's two choices kept; the project's processes Vivado's, no warning; in Portuguese.
// The Arty S7 and the Zybo Z7 (core/boards-vivado.js) among the boards, the Arty S7's pins as an XDC. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'module top(input clk, input [3:0] sw, output reg [7:0] led);\n  always @(posedge clk) led <= {sw, sw};\nendmodule\n';
const VIVADO = 'Vivado (VHDL/Verilog; AMD Vivado 2025.2)';

// the dialog's device fields by their labels (English or Portuguese); fam: a family to choose first, part: then a part
const pick = (page, { fam = null, part = null, labels }) => page.eval((fam, part, L) => {
  const sel = l => [...document.querySelectorAll('.dlg-overlay label')].find(x => x.textContent === l)?.nextElementSibling;
  const set = (s, v) => { s.value = v; s.dispatchEvent(new Event('change')); };
  if (fam) set(sel(L.family), fam);
  if (part) set(sel(L.device), part);
  const opts = s => [...s.options].map(o => o.textContent);
  return { families: opts(sel(L.family)), family: sel(L.family).selectedOptions[0]?.textContent, parts: opts(sel(L.device)), part: sel(L.device).value,
    packages: [...sel(L.pkg).options].map(o => o.value), speeds: opts(sel(L.speed)), synth: opts(sel(L.synth)), synthValue: sel(L.synth).value, synthOff: sel(L.synth).disabled };
}, fam, part, labels);
const EN = { family: 'Family:', device: 'Device:', pkg: 'Package:', speed: 'Speed:', synth: 'Synthesis Tool:' };
const PT = { family: 'Família:', device: 'Dispositivo:', pkg: 'Encapsulamento:', speed: 'Velocidade:', synth: 'Ferramenta de Síntese:' };
const warnings = async page => (await page.consoleText()).split('\n').filter(l => /WARNING|ERROR/.test(l));

uiTest('#3895 New Project: the Spartan-7, the Kintex-7 and the Zynq-7000, experimental; their parts; AMD Vivado alone, locked; the Artix-7\'s two tools', E, async (page) => {
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'S7New');
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Settings');
  const s7 = await pick(page, { fam: 'spartan7', part: 'xc7s50', labels: EN });
  for (const f of ['Artix-7 (experimental)', 'Spartan-7 (experimental)', 'Kintex-7 (experimental)', 'Zynq-7000 (experimental)', 'Spartan-3E', 'Virtex-6']) assert.ok(s7.families.includes(f), `${f}: ${s7.families}`);
  assert.ok(!s7.families.some(f => /Virtex-7/.test(f)), 'no Virtex-7: no free edition of Vivado has it');
  assert.deepEqual(s7.parts, ['XC7S6', 'XC7S15', 'XC7S25', 'XC7S50', 'XC7S75', 'XC7S100']);
  assert.deepEqual([s7.part, s7.packages, s7.speeds], ['xc7s50', ['csga324', 'ftgb196', 'fgga484'], ['-1', '-2']]);
  assert.deepEqual([s7.synth, s7.synthValue, s7.synthOff], [[VIVADO], 'vivado', true]);
  const z7 = await pick(page, { fam: 'zynq', labels: EN });
  assert.deepEqual(z7.parts, ['XC7Z007S', 'XC7Z012S', 'XC7Z014S', 'XC7Z015', 'XC7Z010', 'XC7Z020', 'XC7Z030']);
  assert.deepEqual([z7.synth, z7.synthValue, z7.synthOff], [[VIVADO], 'vivado', true]);
  const k7 = await pick(page, { fam: 'kintex7', labels: EN });
  assert.deepEqual([k7.parts, k7.synth, k7.synthOff], [['XC7K70T', 'XC7K160T'], [VIVADO], true]);
  // (the Artix-7: Vivado or the Silinx toolchain, #3146; the Spartan-3E: Silinx or XST)
  const a7 = await pick(page, { fam: 'artix7', labels: EN });
  assert.deepEqual([a7.synth, a7.synthValue, a7.synthOff], [[VIVADO, 'Silinx (VHDL/Verilog; no Vivado needed; on trial)'], 'vivado', false]);
  const s3 = await pick(page, { fam: 'spartan3e', labels: EN });
  assert.deepEqual([s3.synthValue, s3.synthOff], ['silinx', false]);
  await pick(page, { fam: 'spartan7', part: 'xc7s50', labels: EN });
  await page.dialogButton('Next >');
  await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Project Summary');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project?.name === 'S7New', [], { what: 'project S7New open' });
  const pj = await page.eval(() => window.Silinx.project);
  assert.deepEqual([pj.device, pj.synthTool], [{ family: 'spartan7', part: 'xc7s50', package: 'csga324', speed: '-1' }, 'vivado']);
  assert.deepEqual(await warnings(page), []);
});

uiTest('#3895 Design Properties: a Basys 3 project to the Zynq-7000\'s XC7Z020: Vivado alone, locked; its processes Vivado\'s, no warning', E, async (page) => {
  await makeProject(env, { name: 'Z7Props', board: 'basys3', files: { 'src/top.v': TOP }, top: 'top' });
  await page.openProject('Z7Props');
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  // (the Artix-7's project: Vivado or the Silinx toolchain offered)
  const before = await pick(page, { labels: EN });
  assert.deepEqual([before.synth.length, before.synthValue, before.synthOff], [2, 'vivado', false]);
  await page.eval(() => {
    const b = [...document.querySelectorAll('.dlg-overlay label')].find(x => x.textContent === 'Evaluation Development Board:').nextElementSibling;
    b.value = ''; b.dispatchEvent(new Event('change'));
  });
  const z = await pick(page, { fam: 'zynq', part: 'xc7z020', labels: EN });
  assert.deepEqual([z.family, z.part, z.packages, z.synth, z.synthValue, z.synthOff], ['Zynq-7000 (experimental)', 'xc7z020', ['clg400', 'clg484'], [VIVADO], 'vivado', true]);
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.project.device?.part === 'xc7z020', [], { what: 'the device set' });
  await page.waitConsole(/Device set to xc7z020-1-clg400\./);
  const pj = await page.eval(() => window.Silinx.project);
  assert.deepEqual([pj.device, pj.synthTool, pj.board ?? null], [{ family: 'zynq', part: 'xc7z020', package: 'clg400', speed: '-1' }, 'vivado', null]);
  const lines = (await page.consoleText()).split('\n').filter(l => /WARNING|ERROR|Device set/.test(l));
  assert.deepEqual(lines, ['Device set to xc7z020-1-clg400.']);   // (no "no flow" warning: AMD Vivado implements it)
  await page.setView('impl');
  await page.treeRow('#hier', 'top');
  const labels = await page.eval(() => [...document.querySelectorAll('#procs .row')].map(x => x.textContent.trim().replace(/^▾/, '')));
  for (const present of ['Synthesize - Vivado', 'Implement Design', 'Generate Programming File']) assert.ok(labels.includes(present), `${present}: ${labels}`);
  assert.ok(!labels.some(l => l.startsWith('Synthesize - Yosys')), String(labels));
});

uiTest('#3895 in Portuguese: the Spartan-7 in the New Project wizard, marked experimental, its synthesis tool Vivado alone', E, async (page) => {
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.menu('Ficheiro', 'Novo Projeto…');
    await page.waitDialog('Assistente de Novo Projeto');
    await page.fill('.dlg-overlay .wiz-main input[type=text]', 'S7Pt');
    await page.dialogButton('Seguinte >');
    await page.waitFor(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === 'Definições do Projeto');
    const r = await pick(page, { fam: 'spartan7', labels: PT });
    assert.deepEqual([r.family, r.parts[0], r.synth, r.synthOff], ['Spartan-7 (experimental)', 'XC7S6', [VIVADO], true]);
    // (the boards: the Arty S7 and the Zybo Z7 marked as the Basys 3)
    const boards = await page.eval(() => [...[...document.querySelectorAll('.dlg-overlay label')].find(x => x.textContent === 'Placa de Desenvolvimento:').nextElementSibling.options].map(o => o.textContent));
    for (const b of ['Digilent Arty S7 (experimental)', 'Digilent Zybo Z7 (experimental)']) assert.ok(boards.includes(b), `${b}: ${boards}`);
    const labels = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid > label')].map(l => l.textContent));
    for (const l of Object.values(PT)) assert.ok(labels.includes(l), `${l}: ${labels}`);
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});

uiTest('#3895 Design Properties: the Arty S7 and the Zybo Z7, experimental; the Arty S7 chosen: its XC7S50, Vivado locked, its pins as an XDC', E, async (page) => {
  await makeProject(env, { name: 'ArtyPick', board: 'basys3', files: { 'src/top.v': TOP }, top: 'top' });
  await page.openProject('ArtyPick');
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  const r = await page.eval(() => {
    const sel = l => [...document.querySelectorAll('.dlg-overlay label')].find(x => x.textContent === l).nextElementSibling;
    const b = sel('Evaluation Development Board:'), boards = [...b.options].map(o => o.textContent);
    b.value = 'arty-s7'; b.dispatchEvent(new Event('change'));
    return { boards, part: sel('Device:').value, pkg: sel('Package:').value, speed: sel('Speed:').value, synth: [...sel('Synthesis Tool:').options].map(o => o.value), synthOff: sel('Synthesis Tool:').disabled };
  });
  assert.deepEqual(r.boards.filter(b => /experimental/.test(b)), ['Digilent Basys 3 (experimental)', 'Digilent Nexys A7 (experimental)', 'Digilent Arty S7 (experimental)', 'Digilent Zybo Z7 (experimental)']);
  assert.deepEqual([r.part, r.pkg, r.speed, r.synth, r.synthOff], ['xc7s50', 'csga324', '-1', ['vivado'], true]);
  await page.dialogButton('OK');
  await page.waitDialog('Update Constraints');
  await page.dialogButton('Yes');
  await page.waitNoDialog();
  await page.waitConsole(/top\.xdc regenerated for Digilent Arty S7/);
  const lines = (await page.consoleText()).split('\n').filter(l => /WARNING|ERROR|Device set|regenerated/.test(l));
  assert.deepEqual(lines, ['Device set to xc7s50-1-csga324 (board arty-s7).', 'constraints/top.xdc regenerated for Digilent Arty S7: clk, sw, led']);
  const pj = await page.eval(() => window.Silinx.project);
  assert.deepEqual([pj.board, pj.device, pj.synthTool], ['arty-s7', { family: 'spartan7', part: 'xc7s50', package: 'csga324', speed: '-1' }, 'vivado']);
});
