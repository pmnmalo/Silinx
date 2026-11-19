// UI: the browser edition in a browser with no WebUSB (Firefox, Safari: navigator.usb taken away in Chrome) programming
// an imported project (#4592, #4583, #4589): Program FPGA says first why this browser cannot program a board, then the
// project's trust refusal with its Trust Project button, in the Console and in the Errors tab (the WebUSB line has none);
// trusted (from the Errors tab, asked first), Program FPGA says at once that the browser cannot program, before any
// bitstream is asked for. The errors asserted exactly, no warning. (The interface: SILINX_UI_INTERFACE.)
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { setupUi, uiTest } from './harness.js';
import { buildSite } from './site-lib.js';
import { FILE, openImport } from './zip-helpers.js';
import { createZip } from '../../core/zip.js';
import { NO_WEBUSB } from '../../core/webusb-support.js';

let env, site;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  site = await buildSite(env.tmp);
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

const NAME = 'Student';
const REFUSAL = `project '${NAME}' came from outside (imported): programming the board runs only once you trust it (Trust Project, in the console when the project opens)`;
const PROGRAM_FPGA = '#workspace > .doc:not([hidden]) .imp-fpga .btn.primary';

// the Errors tab's rows: the message, and whether it has an enabled Trust Project button (null: none)
const errorRows = (page) => page.eval(() => [...document.querySelectorAll('#console-errors .diag')].map((r) => { const b = r.querySelector('.ln-trust'); return [r.querySelector('span[data-no-i18n]').textContent, b ? !b.disabled : null]; }));
const problems = async (page) => (await page.consoleText()).split('\n').filter((l) => /^(WARNING|ERROR)/.test(l));

async function importZip(page) {
  const codec = { deflate: (d) => zlib.deflateRawSync(d), inflate: (d, l) => zlib.inflateRawSync(d, { maxOutputLength: l }) };
  const top = 'library ieee;\nuse ieee.std_logic_1164.all;\nentity top is port (a : in std_logic; y : out std_logic); end;\narchitecture rtl of top is begin y <= a; end;\n';
  const pj = { name: 'S', top: 'top', board: 'basys2-250', files: [{ path: 'src/top.vhd', lang: 'vhdl', role: 'design' }], device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' } };
  const file = path.join(env.tmp, 'student-site.zip');
  await fs.writeFile(file, await createZip([{ path: 'silinx.json', data: JSON.stringify(pj) }, { path: 'src/top.vhd', data: top }], codec));
  await openImport(page, 'silinx');
  await page.setFiles(FILE, [file]);
  await page.fill('.dlg-overlay input[type=text]', NAME);
  await page.dialogButton('Import');
  await page.waitFor((n) => window.Silinx.project?.name === n, [NAME], { timeout: 30000, what: 'the project imported' });
}

uiTest('#4592 browser edition, no WebUSB: Program says so first, then the trust refusal with its button; trusted, the WebUSB reason at once', E, async (page) => {
  await page.goto(site.url);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'site boot' });
  await page.eval(() => Object.defineProperty(navigator, 'usb', { value: undefined, configurable: true }));
  await importZip(page);
  await page.eval(() => window.SilinxApp.openImpact());
  await page.waitFor((s) => !!document.querySelector(s), [PROGRAM_FPGA], { what: 'Program FPGA' });
  await page.click(PROGRAM_FPGA);
  await page.waitConsole(/Programming FPGA \(SRAM\) failed: project 'Student'/);
  // (the job's error, its last line, said once by the "… failed:" line, #4597)
  const refused = [`ERROR: ${NO_WEBUSB}`, `ERROR: Programming FPGA (SRAM) failed: ${REFUSAL} Trust Project`];
  assert.deepEqual((await page.consoleText()).split('\n').slice(-2), refused);
  await page.waitFor(() => document.querySelectorAll('#console-errors .diag').length === 2, [], { what: 'the Errors tab' });
  assert.deepEqual(await errorRows(page), [[NO_WEBUSB, null], [`Programming FPGA (SRAM) failed: ${REFUSAL}`, true]]);
  // trusted from the Errors tab (asked first)
  await page.eval(() => document.querySelector('#console-errors .ln-trust').click());
  await page.waitDialog('Trust Project');
  await page.dialogButton('Yes');
  await page.waitNoDialog();
  await page.waitConsole(/^Project "Student" trusted: Xilinx ISE and programming a board or a PROM may run for it\.$/m);
  assert.deepEqual((await errorRows(page)).map((r) => r[1]), [null, false]);
  // Program FPGA again: the browser's reason at once (no bitstream asked for, no implementation offered)
  await page.click(PROGRAM_FPGA);
  await page.waitConsole(new RegExp(`Programming FPGA \\(SRAM\\) failed: programming from the browser needs Chrome or Edge`));
  assert.equal(await page.eval(() => !!document.querySelector('.dlg-overlay')), false);
  assert.deepEqual((await page.consoleText()).split('\n').slice(-2), ['Programming FPGA (SRAM)...', `ERROR: Programming FPGA (SRAM) failed: ${NO_WEBUSB}`]);
  assert.deepEqual(await problems(page), [...refused, `ERROR: Programming FPGA (SRAM) failed: ${NO_WEBUSB}`]);
  // no warning (the Warnings tab), no error of the page's scripts (Firefox's own notices are not the app's)
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
  assert.deepEqual(page.console.filter((c) => c.type === 'error').map((c) => c.text), []);
}, { url: () => 'about:blank', timeout: 180000 });
