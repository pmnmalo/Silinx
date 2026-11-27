// UI: a GateMate device in the interface (#2431): the picker with its parts and the synthesis locked, the processes of its
// toolchain only (its Post-Synthesis model, no Configure Target Device: its board openFPGALoader's, outside Silinx; Emulate,
// #3704), its constraints CCF (read, written, checked), Generate Programming File to its .bit (gmpack) in the server's real flow
// and the Design Summary's programming file and reports, in English and Portuguese; the evaluation board's pins written as a CCF
// by Update Constraints.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BLINKY = 'module blinky(input clk, output reg [1:0] led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23:22]; end\nendmodule\n';
const DEVICE = { family: 'gatemate', part: 'ccgm1a1', package: 'fbga324', speed: '' };
const PINS = 'NET "clk" Loc = "IO_SB_A8";\nNET "led[0]" Loc = "IO_EB_B1";\nNET "led[1]" Loc = "IO_EB_B2";\n# create_clock -period 100.000 [get_ports {clk}]\n';

uiTest('#2431 Design Properties: the GateMate, its CCGM1A1 and CCGM1A2, its synthesis locked', E, async (page) => {
  await makeProject(env, { name: 'GmPick', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, files: { 'src/blinky.v': BLINKY }, top: 'blinky' });
  await page.openProject('GmPick');
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  const state = await page.eval(() => {
    const sel = (l) => [...document.querySelectorAll('.dlg-overlay label')].find((x) => x.textContent === l).nextElementSibling;
    const fam = sel('Family:'); fam.value = 'gatemate'; fam.dispatchEvent(new Event('change'));
    return { part: sel('Device:').value, parts: [...sel('Device:').options].map((o) => o.value), pkg: sel('Package:').value, synth: sel('Synthesis Tool:').value,
      synthOff: sel('Synthesis Tool:').disabled, family: fam.selectedOptions[0].textContent, last: [...fam.options].at(-1).textContent };
  });
  assert.deepEqual(state, { part: 'ccgm1a1', parts: ['ccgm1a1', 'ccgm1a2'], pkg: 'fbga324', synth: 'silinx', synthOff: true, family: 'GateMate', last: 'Cyclone V (experimental)' });
  await page.dialogButton('Cancel');
});

uiTest('#2431 a GateMate project: its processes, its constraints CCF, Generate Programming File to its .bit, the Design Summary; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'GmRun', board: 'gatemate-evb', device: DEVICE, files: { 'src/blinky.v': BLINKY, 'constraints/top.ccf': PINS }, top: 'blinky', constraints: 'constraints/top.ccf', synthTool: 'silinx' });
  await page.openProject('GmRun');
  const r = await page.eval(async () => {
    const { ccfDiagnostics, readPins, writePins, constraintsExt } = await import('/js/constraints-format.js');
    const device = { part: 'ccgm1a1', package: 'fbga324' }, ports = [{ name: 'clk', width: 1 }, { name: 'led', width: 2, msb: 1, lsb: 0 }];
    const read = readPins(device, 'NET "clk" Loc = "IO_SB_A8";\nPin_out "led[1]" Loc = "IO_EB_B2" | DRIVE=6;\n# create_clock -period 100.000 [get_ports {clk}]\n');
    return {
      ext: constraintsExt(device), assigned: read.assignments, period: read.clocks[0].period,
      written: writePins(device, { assignments: read.assignments, clocks: read.clocks, header: 'H' }),
      good: ccfDiagnostics('NET "clk" Loc = "IO_SB_A8";\nNET "led[0]" Loc = "IO_EB_B1";\nNET "led[1]" Loc = "IO_EB_B2";\n', ports, { device }),
      bad: ccfDiagnostics('NET "clk" Loc = "IO_SB_A8";\nLOCATE "x";\n', ports),
      pin: ccfDiagnostics('NET "clk" Loc = "A8";\n', ports.slice(0, 1), { device }),
      unknown: ccfDiagnostics('NET "nope" Loc = "IO_SB_A8";\n', ports),
    };
  });
  assert.equal(r.ext, '.ccf');
  assert.deepEqual(r.assigned, { clk: { loc: 'IO_SB_A8' }, 'led<1>': { loc: 'IO_EB_B2', drive: '6' } });
  assert.equal(r.period, 100);
  assert.equal(r.written, '# H\nNET "clk" Loc = "IO_SB_A8";\nNET "led[1]" Loc = "IO_EB_B2" | DRIVE=6;\n# create_clock -period 100.000 [get_ports {clk}]\n');
  assert.deepEqual(r.good, []);
  assert.deepEqual(r.bad, [{ severity: 'error', line: 2, message: 'LOCATE: not a CCF statement nextpnr-himbaechel-gatemate applies (NET, Pin_in, Pin_out, Pin_inout)' }]);
  assert.deepEqual(r.pin, [{ severity: 'error', line: 1, message: 'NET clk: A8 is not a GPIO of the fbga324 package (its GPIOs look like IO_SB_A8, IO_EB_B1)' }]);
  assert.deepEqual(r.unknown, [{ severity: 'warning', message: 'NET nope: the top has no such port', line: 1 }]);

  await page.setView('impl');
  await page.treeRow('#hier', 'blinky');
  const labels = await page.eval(() => [...document.querySelectorAll('#procs .row')].map((x) => x.textContent.trim().replace(/^▾/, '')));
  assert.ok(labels.includes('Implement Design') && labels.includes('Generate Programming File'), String(labels));
  for (const absent of ['Map', 'Configure Target Device', 'Generate Post-Place & Route Simulation Model', 'Emulate Post-Place & Route Model']) {
    assert.ok(!labels.includes(absent), `${absent}: ${labels}`);
  }
  // Emulate (#3704): the HDL on the board's pins, its RTL model, its Post-Synthesis model too (#2299)
  for (const present of ['Emulate', 'Emulate Behavioral Model (RTL)', 'Emulate Post-Synthesis Model', 'Generate Post-Place & Route Static Timing']) assert.ok(labels.includes(present), `${present}: ${labels}`);

  await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
  await page.waitConsole(/Process "Generate Programming File" (completed successfully|failed)/, { timeout: 120000 }).catch(async (e) => { throw new Error(`${e.message}\n${(await page.consoleText()).slice(-2500)}`); });
  const text = await page.consoleText();
  assert.deepEqual(text.split('\n').filter((l) => /WARNING|ERROR/.test(l)), []);
  const bytes = +/Bitstream: build\/blinky\.bit \((\d+) bytes, gmpack in /.exec(text)?.[1];
  assert.ok(bytes > 1000, text.slice(-2000));

  await page.eval(() => window.SilinxApp.openSummary());
  const summary = (caption) => page.waitFor((c) => {
    const t = [...document.querySelectorAll('.summary-table')].find((x) => x.querySelector('caption')?.textContent === c);
    return t ? [...t.querySelectorAll('tr')].map((tr) => [...tr.children].map((x) => x.textContent)) : null;
  }, [caption], { what: caption });
  assert.deepEqual(await summary('Detailed Reports'), [['Report Name', 'Status'], ['Synthesis Report (Yosys)', 'Current'], ['Routed Design (Peppercorn configuration)', 'Current'], ['Static Timing Report', 'Current']]);
  assert.deepEqual(await summary('Programming File'), [['Bitstream', `build/blinky.bit (${Math.round(bytes / 1024)} KB)`]]);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    assert.deepEqual((await summary('Relatórios Detalhados')).slice(1).map((x) => x[0]), ['Relatório de Síntese (Yosys)', 'Projeto Encaminhado (configuração Peppercorn)', 'Relatório de Temporização Estática']);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
});

uiTest('#2431 the evaluation board: its pins written as the project\'s constraints/top.ccf from the board', E, async (page) => {
  await makeProject(env, { name: 'GmEvb', board: 'gatemate-evb', device: DEVICE, top: 'top', constraints: 'constraints/top.ccf',
    files: { 'src/top.v': 'module top(input clk, input btn_n, output [1:0] led_n);\n  assign led_n = {2{btn_n ^ clk}};\nendmodule\n' } });
  await page.openProject('GmEvb');
  const r = await page.eval(async () => {
    const ok = await window.SilinxApp.regenerateUcf();
    const { api } = await import('/js/api.js');
    return { ok, text: await api.readFile('GmEvb', 'constraints/top.ccf'), constraints: window.Silinx.project.constraints };
  });
  assert.equal(r.ok, true);
  assert.equal(r.constraints, 'constraints/top.ccf');
  assert.equal(r.text, "# CCF for top 'top' on Cologne Chip GateMate FPGA Evaluation Board (ccgm1a1-fbga324), generated by Silinx\n\n"
    + 'NET "clk" Loc = "IO_SB_A8";\nNET "btn_n" Loc = "IO_EB_B0";\nNET "led_n[0]" Loc = "IO_EB_B1";\nNET "led_n[1]" Loc = "IO_EB_B2";\n# create_clock -period 100.000 [get_ports {clk}]\n');
});
