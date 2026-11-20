// UI: Trust Project (#2830, #4583): an imported project's refusals carry the Trust Project button in the console. The
// project imported (a zip): its line with the button when it opens, and again when the page is reloaded (reopened at
// start-up); Program FPGA refused, the server's refusal (a 403) in the console with its button, not in a dialog; the
// browser edition's refusal (its job's ERROR line left to the "… failed:" line, said once, #4597) with its button; the button
// asks first (No: nothing trusted, the button again enabled), Yes trusts it: every button of the project disabled, the
// line said, and Program FPGA then programs (the programmer stood in for). The Errors tab, which a refusal brings to the
// front, lists each refusal with its button too (#4589). In Portuguese: the button and the question.
// The warnings and errors asserted exactly. (The interface: SILINX_UI_INTERFACE.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { setupUi, uiTest } from './harness.js';
import { FILE, openImport } from './zip-helpers.js';
import { createZip } from '../../core/zip.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const NAME = 'Student';
const NOTICE = `Project "${NAME}" came from outside (imported): it is edited, checked, simulated and implemented with the Silinx toolchain; Xilinx ISE and programming a board or a PROM run only once you trust it.`;
const REFUSAL = `project '${NAME}' came from outside (imported): programming the board runs only once you trust it (Trust Project, in the console when the project opens)`;
const QUESTION = `Trust the project "${NAME}"? Xilinx ISE and programming a board or a PROM will run for it: trust only a project whose files you know.`;
const PROGRAM_FPGA = '#workspace > .doc:not([hidden]) .imp-fpga .btn.primary';

// the console's lines that carry a Trust Project button: their text, the button's label, enabled or not
const trustLines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln-trust')].map((b) => [b.parentElement.firstChild.textContent, b.textContent, !b.disabled]));
const problems = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)/.test(l));
const question = (page) => page.eval(() => { const d = document.querySelector('.dlg-overlay'); return d && [d.querySelector('.dlg-title span').textContent, d.querySelector('.msg-text').textContent, ...[...d.querySelectorAll('.dlg-buttons .btn')].map((b) => b.textContent)]; });
// the Errors tab's rows (#4589): the message, its Trust Project button's label and whether it is enabled (null: none)
const errorRows = (page) => page.eval(() => [...document.querySelectorAll('#console-errors .diag')].map((r) => { const b = r.querySelector('.ln-trust'); return [r.querySelector('span[data-no-i18n]').textContent, b ? b.textContent : null, b ? !b.disabled : null]; }));
const shownTab = (page) => page.eval(() => document.querySelector('#console-tabs .tab.active')?.dataset.page);
const clickLastTrust = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln-trust')].at(-1).click());

async function importZip(page) {
  const codec = { deflate: (d) => zlib.deflateRawSync(d), inflate: (d, l) => zlib.inflateRawSync(d, { maxOutputLength: l }) };
  const top = 'library ieee;\nuse ieee.std_logic_1164.all;\nentity top is port (a : in std_logic; y : out std_logic); end;\narchitecture rtl of top is begin y <= a; end;\n';
  // (a zip saying it is trusted: the import makes it untrusted all the same)
  const pj = { name: 'S', top: 'top', board: 'basys2-250', files: [{ path: 'src/top.vhd', lang: 'vhdl', role: 'design' }], device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, trusted: true };
  const file = path.join(env.tmp, 'student.zip');
  await fs.writeFile(file, await createZip([{ path: 'silinx.json', data: JSON.stringify(pj) }, { path: 'src/top.vhd', data: top }], codec));
  await openImport(page, 'silinx');
  await page.setFiles(FILE, [file]);
  await page.fill('.dlg-overlay input[type=text]', NAME);
  await page.dialogButton('Import');
  await page.waitFor((n) => window.Silinx.project?.name === n, [NAME], { timeout: 30000, what: 'the project imported' });
}
// iMPACT, its file one of the user's choice (no implementation asked first: refused before the file is read)
async function openImpact(page) {
  await page.eval(() => window.SilinxApp.openImpact());
  await page.waitFor((s) => !!document.querySelector(s), [PROGRAM_FPGA], { what: 'Program FPGA' });
  await page.eval(() => { const i = document.querySelector('#workspace > .doc:not([hidden]) .imp-fpga input[type=text]') || [...document.querySelectorAll('#workspace > .doc:not([hidden]) input[type=text]')].find((e) => /\.bit$/.test(e.value)); i.value = 'build/mine.bit'; i.dispatchEvent(new Event('input')); });
}

uiTest('#4583 an imported project\'s refusals carry the Trust Project button: on open, on reload, Program FPGA\'s; asked, then trusted; Portuguese', E, async (page) => {
  await importZip(page);
  await page.waitConsole(/came from outside \(imported\): it is edited/);
  assert.deepEqual(await trustLines(page), [[NOTICE, 'Trust Project', true]]);
  // reloaded: reopened at start-up, its line and button said again
  await page.reload();
  await page.waitFor((n) => window.SilinxApp && window.Silinx.project?.name === n && document.querySelector('#console-log .ln-trust')
    && !('restoring' in document.documentElement.dataset) && !('starting' in document.documentElement.dataset), [NAME], { what: 'reopened at start-up, its documents back' });
  assert.deepEqual(await trustLines(page), [[NOTICE, 'Trust Project', true]]);
  // Program FPGA (the local server's): refused, in the console with its button; no dialog
  await openImpact(page);
  await page.click(PROGRAM_FPGA);
  await page.waitConsole(/Programming FPGA \(SRAM\) failed: project/);
  assert.equal(await question(page), null);
  // the Errors tab, brought to the front (what the user sees, #4589): the refusal's row with its button too
  await page.waitFor(() => document.querySelector('#console-errors .diag .ln-trust'), [], { what: 'the Errors tab\'s button' });
  assert.equal(await shownTab(page), 'errors');
  assert.deepEqual(await errorRows(page), [[`Programming FPGA (SRAM) failed: ${REFUSAL}`, 'Trust Project', true]]);
  assert.deepEqual(await trustLines(page), [[NOTICE, 'Trust Project', true], [`ERROR: Programming FPGA (SRAM) failed: ${REFUSAL}`, 'Trust Project', true]]);
  // the browser edition's refusal (web/js/api-local.js usbJob): its job's last line, its error, left to the "… failed:"
  // line (#4597): one line, its button
  await page.eval(async (msg) => {
    const { api } = await import('/js/api.js');
    const job = api.job;
    window.__programmed = [];
    window.__trusted = false;
    api.program = async (b) => { if (window.__trusted) window.__programmed.push(b.bitfile); return { job: 'program-stand-in' }; };
    api.job = (id, since) => (id !== 'program-stand-in' ? job(id, since) : Promise.resolve(window.__trusted ? { status: 'ok', lines: ['(the programmer)'] } : { status: 'error', lines: [`ERROR: ${msg}`], error: msg }));
  }, REFUSAL);
  await page.click(PROGRAM_FPGA);
  await page.waitFor(() => document.querySelectorAll('#console-log .ln-trust').length === 3 && document.querySelector('#console-log').lastElementChild.textContent.includes('failed:'), [], { what: 'the job refused' });
  const lines = (await page.consoleText()).split('\n');
  assert.deepEqual(lines.slice(-3), ['', 'Programming FPGA (SRAM)...', `ERROR: Programming FPGA (SRAM) failed: ${REFUSAL} Trust Project`]);
  assert.deepEqual((await trustLines(page)).at(-1), [`ERROR: Programming FPGA (SRAM) failed: ${REFUSAL}`, 'Trust Project', true]);
  // the Errors tab: the refusal, with its button (said twice: listed once, #4728)
  await page.waitFor(() => document.querySelectorAll('#console-errors .diag .ln-trust').length === 1, [], { what: 'the refusal listed' });
  assert.deepEqual(await errorRows(page), [[`Programming FPGA (SRAM) failed: ${REFUSAL}`, 'Trust Project', true]]);
  // Portuguese: the buttons, the question; No trusts nothing, the button enabled again
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#console-errors .ln-trust').textContent === 'Confiar no Projeto', [], { what: 'in Portuguese' });
  assert.equal(await page.eval(() => [...document.querySelectorAll('#console-errors .ln-trust')].map((b) => b.textContent).join()), 'Confiar no Projeto');
  await page.openProject(NAME);
  await page.waitFor(() => document.querySelectorAll('#console-log .ln-trust').length === 4, [], { what: 'the line said again' });
  assert.equal(await page.eval(() => [...document.querySelectorAll('#console-log .ln-trust')].at(-1).textContent), 'Confiar no Projeto');
  await clickLastTrust(page);
  await page.waitDialog('Confiar no Projeto');
  assert.deepEqual(await question(page), ['Confiar no Projeto', `Confiar no projeto "${NAME}"? O Xilinx ISE e a programação de uma placa ou de uma PROM passam a correr para ele: confie apenas num projeto cujos ficheiros conhece.`, 'Sim', 'Não']);
  await page.dialogButton('Não');
  await page.waitNoDialog();
  await page.waitFor(() => !document.querySelectorAll('#console-log .ln-trust')[3].disabled, [], { what: 'the button enabled again' });
  assert.equal((await env.server.api('GET', `/api/projects/${NAME}`)).trusted, false);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // refused again (the Errors tab, emptied by the project opened again, lists it), Yes from the Errors tab's button:
  // trusted; every button of the project disabled, the Errors tab's too
  await openImpact(page);
  await page.click(PROGRAM_FPGA);
  await page.waitFor(() => document.querySelectorAll('#console-errors .diag .ln-trust').length === 1, [], { what: 'refused again' });
  assert.deepEqual(await errorRows(page), [[`Programming FPGA (SRAM) failed: ${REFUSAL}`, 'Trust Project', true]]);
  await page.eval(() => document.querySelector('#console-errors .ln-trust').click());
  await page.waitDialog('Trust Project');
  assert.deepEqual(await question(page), ['Trust Project', QUESTION, 'Yes', 'No']);
  await page.dialogButton('Yes');
  await page.waitNoDialog();
  await page.waitConsole(new RegExp(`^Project "${NAME}" trusted: Xilinx ISE and programming a board or a PROM may run for it\\.$`, 'm'));
  assert.deepEqual((await trustLines(page)).map((l) => l[2]), [false, false, false, false, false]);
  assert.deepEqual((await errorRows(page)).map((r) => r[2]), [false]);
  assert.equal('trusted' in await env.server.api('GET', `/api/projects/${NAME}`), false);
  assert.equal(await page.eval(() => 'trusted' in window.Silinx.project), false);
  // the process again: it runs
  await page.eval(() => { window.__trusted = true; });
  await openImpact(page);
  await page.click(PROGRAM_FPGA);
  await page.waitFor(() => window.__programmed.length === 1, [], { what: 'programmed' });
  // opened again: no line, no button
  await page.openProject(NAME);
  assert.equal(await page.eval(() => document.querySelectorAll('#console-log .ln-trust').length), 5);
  // the errors: the three refusals, each said once, nothing else; no warning
  assert.deepEqual(await problems(page), Array(3).fill(`ERROR: Programming FPGA (SRAM) failed: ${REFUSAL} Trust Project`));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
}, { timeout: 120000 });
