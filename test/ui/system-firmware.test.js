// UI (#5503): a System's Arduino node's firmware compiled from the Design pane, by the local server's arduino-cli (a
// stand-in for it: test/fixtures/arduino-cli-stub, config.json's path): the uart-avr example's uno node's row has
// Compile Firmware; run, its lines in the console, its .hex in the node's folder, no warning; a sketch with a warning
// and an error: their exact lines in the console, by file and line, in the Errors and Warnings tabs' rows; in
// Portuguese; the browser edition says the local server compiles it. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';
import { ROOT } from '../server-helpers.js';

const STUB = path.join(ROOT, 'test/fixtures/arduino-cli-stub/arduino-cli');
let env;
before(async () => {
  env = await setupUi();
  if (env?.server) fs.writeFileSync(path.join(env.server.configDir, 'config.json'), JSON.stringify({ mode: 'silinx', editor: 'off', paths: { 'arduino-cli': STUB } }));
});
after(async () => { await env?.teardown?.(); });
const E = () => env;
const procs = (page) => page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].map((l) => l.textContent.trim()).filter((t) => t !== 'Design Summary/Reports' && t !== 'Resumo do Projeto/Relatórios'));
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const said = async (page) => (await lines(page)).filter((l) => /^(WARNING|ERROR)/.test(l));

uiTest('#5503 an Arduino node\'s Compile Firmware from its row: its .hex in its folder, its errors and warnings in the console; Portuguese; the browser edition', E, async (page) => {
  if (process.platform === 'win32') return;   // (the stand-in for arduino-cli is a script run by its #! line)
  await makeProject(env, { name: 'NodeFw', template: 'uart-avr' });
  const dir = path.join(env.server.workspace, 'NodeFw');
  fs.writeFileSync(path.join(dir, 'uno/hello.ino'), 'void setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {}\n');
  await page.openProject('NodeFw');
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'uno'), [], { what: 'the nodes' });
  await page.treeRow('#hier', 'uno', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Compile Firmware'), [], { what: 'the node\'s processes' });
  assert.deepEqual(await procs(page), ['View/Edit System', 'Compile Firmware', 'Program Node', 'Simulate Node', 'Emulate Node']);
  await page.treeRow('#procs', 'Compile Firmware', { exact: true, dbl: true });
  await page.waitConsole(/^Process "Compile Firmware \(System node uno\)" completed successfully$/m, { timeout: 60000 });
  const all = await lines(page);
  for (const l of ['System node uno: its sketch uno/hello.ino (1 file(s) of uno/) for arduino-uno (arduino:avr:uno), by arduino-cli, in build/nodes/uno/firmware/.',
    'System node uno: its firmware uno/hello.hex, 2 bytes of the flash.']) assert.ok(all.includes(l), all.join('\n'));
  assert.equal(fs.readFileSync(path.join(dir, 'uno/hello.hex'), 'utf8'), ':02000000FFCF30\n:00000001FF\n');
  assert.deepEqual(await said(page), [], 'no warning');
  // a warning and an error: their lines, by file and line, the Errors and Warnings tabs' rows
  fs.writeFileSync(path.join(dir, 'uno/hello.ino'), '#warning check the baud\nvoid setup() {\n  #error no setup yet\n}\n');
  await page.treeRow('#procs', 'Compile Firmware', { exact: true, dbl: true });
  await page.waitConsole(/^Process failed: the System node\(s\) uno failed$/m, { timeout: 60000 });
  assert.deepEqual(await said(page), [
    'ERROR: uno/hello.ino:3:4: #error no setup yet',
    'WARNING: uno/hello.ino:1:2: #warning check the baud',
    'ERROR: System node uno: uno: its sketch did not compile (1 error(s), 1 warning(s))',
    'ERROR: the System node(s) uno failed',
  ]);
  await page.eval(() => new Promise((r) => setTimeout(r, 120)));   // (the tabs drawn at most every 50 ms)
  assert.deepEqual(await page.eval(() => window.Silinx.diags.filter((d) => d.file).map((d) => `${d.severity} ${d.file}:${d.line}`)), ['error uno/hello.ino:3', 'warning uno/hello.ino:1']);
  // (its Errors tab's row opens the sketch at its line)
  await page.eval(() => [...document.querySelectorAll('#console-errors .diag')].find((d) => /hello\.ino:3/.test(d.textContent)).click());
  await page.waitFor(() => window.Silinx.active?.path === 'uno/hello.ino' && window.Silinx.active.editor?.getCursor().line === 2, [], { what: 'hello.ino at line 3' });
  // Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Compilar Firmware'), [], { what: 'Portuguese' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  // the browser edition: no compiler, said
  await page.eval(async () => { (await import('/js/api.js')).api.standalone = true; });
  await page.treeRow('#procs', 'Compile Firmware', { exact: true, dbl: true });
  await page.waitConsole(/^ERROR: Compile Firmware: a node's sketch is compiled by the local server's arduino-cli \(the browser edition assembles an \.asm only\): give the node a \.hex made elsewhere, the Arduino IDE's Export Compiled Binary$/m);
  await page.eval(async () => { delete (await import('/js/api.js')).api.standalone; });
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
