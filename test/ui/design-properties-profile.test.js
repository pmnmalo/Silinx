// UI (#5440, roadmap #5416's phase 4): Design Properties' Project Kind is the project's profile. An FPGA project widened
// to Embedded / SoC: the note says what it allows, nothing converted (the board fields hidden), OK, its console line, its
// board and top kept; a System project's Design Properties its profile only: narrowed to FPGA refused, its node named
// (OK disabled), to Embedded / SoC done. The interface's messages the MCP's (core/project-profile.js). Portuguese; no
// warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const BLINK = 'library ieee;\nuse ieee.std_logic_1164.all;\nentity blink is port (sw : in std_logic; led : out std_logic); end blink;\narchitecture r of blink is begin led <= sw; end r;\n';
const sel = (label) => [...document.querySelectorAll('.dlg-overlay .form-grid > label')].find((l) => l.textContent === label)?.nextElementSibling;
const choose = (page, label, v) => page.eval((f, l, x) => { const s = eval(`(${f})`)(l); s.value = x; s.dispatchEvent(new Event('change')); }, sel.toString(), label, v);
const shown = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid > label')].filter((l) => l.style.display !== 'none').map((l) => l.textContent));
const note = (page) => page.eval(() => {
  const n = document.querySelector('.dlg-overlay .kind-note');
  const ok = [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].find((b) => b.classList.contains('primary'));
  return { text: n.style.display === 'none' ? null : n.textContent, refused: n.classList.contains('kind-refused'), ok: !ok.disabled };
});
const warnings = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((l) => /^(WARNING|ERROR)/.test(l)));

uiTest('#5440 Design Properties: an FPGA project widened to Embedded / SoC, nothing converted; a System project narrowed refused, its node named; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'Prof', board: 'basys2', top: 'blink', files: { 'src/blink.vhd': BLINK } });
  await page.openProject('Prof');
  await page.waitFor(() => window.Silinx.modules.some((m) => m.name === 'blink'), [], { what: 'its module' });
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  await choose(page, 'Project Kind:', 'embedded');
  assert.deepEqual(await note(page), { text: 'Its System may have design, circuit, fpga, mcu nodes: nothing converted, nothing deleted.', refused: false, ok: true });
  assert.ok(!(await shown(page)).includes('Evaluation Development Board:'), 'the board fields hidden');
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitConsole(/^Prof: Embedded \/ SoC now: its System may have design, circuit, fpga, mcu nodes \(nothing converted, nothing deleted\)\.$/m);
  assert.deepEqual(await page.eval(() => { const p = window.Silinx.project; return [p.profile, p.kind ?? null, p.board, p.top]; }), ['embedded', null, 'basys2', 'blink']);
  // a System project (the uart-avr example: an Arduino node): its Design Properties its profile only
  await makeProject(env, { name: 'ProfSys', template: 'uart-avr' });
  await page.openProject('ProfSys');
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  assert.deepEqual(await shown(page), ['Name:', 'Project Kind:']);
  assert.equal(await page.eval((f) => eval(`(${f})`)('Project Kind:').value, sel.toString()), 'system');
  await choose(page, 'Project Kind:', 'fpga');
  assert.deepEqual(await note(page), { text: 'the project \'ProfSys\' cannot be FPGA: its node uno (mcu) is not allowed (FPGA allows design, circuit, fpga)', refused: true, ok: false });
  await choose(page, 'Project Kind:', 'embedded');
  assert.deepEqual(await note(page), { text: 'Its System may have design, circuit, fpga, mcu nodes: nothing converted, nothing deleted.', refused: false, ok: true });
  // in Portuguese: the note, the refusal, the labels
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor(() => document.querySelector('.dlg-overlay .kind-note')?.textContent.startsWith('O seu Sistema'), [], { what: 'the note in Portuguese' });
  assert.equal((await note(page)).text, 'O seu Sistema pode ter nós design, circuit, fpga, mcu: nada é convertido nem apagado.');
  assert.deepEqual(await page.eval((f) => [...eval(`(${f})`)('Tipo de Projeto:').options].map((o) => o.textContent), sel.toString()), ['Lógica Digital', 'FPGA', 'Embebido / SoC', 'Sistema']);
  await choose(page, 'Tipo de Projeto:', 'fpga');
  assert.equal((await note(page)).text, 'o projeto \'ProfSys\' não pode ser FPGA: o seu nó uno (mcu) não é permitido (FPGA permite design, circuit, fpga)');
  await choose(page, 'Tipo de Projeto:', 'embedded');
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitConsole(/^ProfSys: agora Embebido \/ SoC: o seu Sistema pode ter nós design, circuit, fpga, mcu \(nada convertido, nada apagado\)\.$/m);
  assert.equal(await page.eval(() => window.Silinx.project.profile), 'embedded');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(await warnings(page), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
});
