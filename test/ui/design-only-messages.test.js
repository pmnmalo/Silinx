// UI: no HDL in a design and simulation project's messages (#3891, after #3780): the console when the project opens and
// its drawings' HDL is made; a drawing with errors (its module not made again, never its HDL file named); Check Design's
// errors on the drawing (the Errors tab too), with no HDL line; Find in Project without the generated HDL; a drawing
// whose HDL file name is taken ([Not made], Make Module…); the exact warnings; no warnings otherwise. An FPGA project
// keeps them (test/ui/hdl-clash.test.js, test/ui/find-project.test.js…). Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, writeWs, ROOT } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const FSM = fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8');
const FIND = '.doc:not([hidden]) .fp';
// the console's lines, the application's own first one left out (its banner, the same for every project)
const lines = async (page) => (await page.consoleText()).split('\n').filter((l) => !/^Silinx \S+ Project Navigator — /.test(l));
const warnings = async (page) => (await lines(page)).filter((l) => /WARNING|ERROR/.test(l));
const hdlNamed = async (page) => (await lines(page)).filter((l) => /\.vhdl?\b|\.v\b|\bHDL\b|HDLCompiler|VHDL|Verilog/.test(l));

uiTest('#3891 a design project\'s console: no HDL when it opens; a drawing with errors, Check Design, its errors on the drawing; Find in Project', E, async (page) => {
  await makeProject(env, { name: 'DrawnMsg', kind: 'design', files: { 'src/traffic.fsm.json': FSM }, top: 'traffic' });
  await page.openProject('DrawnMsg');
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/traffic.vhd'] === 'src/traffic.fsm.json', [], { what: 'the drawing\'s HDL' });
  assert.deepEqual(await hdlNamed(page), []);
  // Check Design: its drawing checked, no HDL named
  await page.eval(async () => (await import('/js/processes.js')).checkSyntax('traffic'));
  await page.waitConsole(/Process "Check Design" completed successfully/);
  assert.ok((await lines(page)).includes('Checking top module <traffic>: 8 signals, 3 processes.'), (await lines(page)).join('\n'));
  assert.deepEqual([await hdlNamed(page), await warnings(page)], [[], []]);
  // the state diagram with an error (two states of one name): its module not made again, the drawing named
  const bad = JSON.parse(FSM);
  bad.states[1].name = bad.states[0].name;
  await page.eval(async (m) => (await import('/js/drawings.js')).syncHdlFromFsm('src/traffic.fsm.json', { ...m, generatedFile: 'src/traffic.vhd' }), bad);
  await page.waitConsole(/WARNING: src\/traffic\.fsm\.json: its module is not made again: the state diagram has errors: /);
  await page.eval(async () => (await import('/js/processes.js')).checkSyntax('traffic'));
  await page.waitConsole(/Process "Check Design" failed/);
  const errs = (await warnings(page)).filter((l) => /^ERROR/.test(l));
  assert.ok(errs.length >= 1 && errs.every((l) => l.startsWith('ERROR:Silinx - "src/traffic.fsm.json": ')), errs.join('\n'));
  assert.ok(errs.some((l) => l.includes('src/traffic.fsm.json: its module is not up to date: the state diagram has errors: ') && l.endsWith('Fix src/traffic.fsm.json.')), errs.join('\n'));
  // the Errors tab: the drawing, no line
  const tab = await page.eval(() => [...document.querySelectorAll('.diag .loc')].map((e) => e.textContent));
  assert.ok(tab.length && tab.every((t) => t === '"src/traffic.fsm.json"'), tab.join());
  assert.deepEqual(await hdlNamed(page), []);
  // Find in Project: the drawing, never its HDL
  page.eval(async () => (await import('/js/find-project.js')).openFindInProject()).catch(() => {});
  await page.waitFor(() => window.Silinx.active?.id === 'find', [], { what: 'Find in Project' });
  await page.eval((d) => { const f = document.querySelector(`${d} .fp-find`); f.value = 'traffic'; f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); }, FIND);
  await page.waitFor((d) => document.querySelector(`${d} .fp-status`)?.textContent, [FIND], { what: 'the results' });
  assert.deepEqual(await page.eval((d) => [...document.querySelectorAll(`${d} .fp-file .fp-path`)].map((e) => e.textContent), FIND), ['src/traffic.fsm.json']);
});

uiTest('#3891 a design project\'s drawing whose HDL file name is taken: [Not made], its tip, Make Module…, the warning without its HDL file; Portuguese', E, async (page) => {
  // (src/traffic.vhd in the folder, holding something else: the drawing's module not made)
  await makeProject(env, { name: 'DrawnClash', kind: 'design', files: { 'src/traffic.fsm.json': FSM }, top: 'traffic' });
  await writeWs(env, 'DrawnClash', 'src/traffic.vhd', '-- my notes\n');
  await page.openProject('DrawnClash');
  await page.waitFor(() => window.Silinx.hdlClash?.['src/traffic.fsm.json'], [], { what: 'the clash' });
  await page.waitConsole(/WARNING: src\/traffic\.fsm\.json: Not made/);
  const w = (await warnings(page)).filter((l) => /Not made/.test(l));
  assert.deepEqual(w, ['WARNING: src/traffic.fsm.json: Not made: another file of the project folder has its name. Make Module… (right-click) makes it under another name.']);
  const badge = await page.waitFor(() => { const b = [...document.querySelectorAll('#hier .badge')].find((x) => x.textContent === 'Not made'); return b ? b.title : null; }, [], { what: 'the badge' });
  assert.equal(badge, 'Not made: another file of the project folder has its name. Make Module… (right-click) makes it under another name.');
  const items = await page.eval(async () => (await import('/js/drawings.js')).clashItem('src/traffic.fsm.json')?.label);
  assert.equal(items, 'Make Module…');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor(() => [...document.querySelectorAll('#hier .badge')].some((x) => x.textContent === 'Não gerado' && x.title === 'Não gerado: outro ficheiro da pasta do projeto tem o seu nome. Gerar Módulo… (botão direito) gera-o com outro nome.'), [], { what: 'the badge in Portuguese' });
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});
