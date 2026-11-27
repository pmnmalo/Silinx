// UI (#5933): an Arduino node's assembly program (its folder's .asm, no sketch) built by Compile Firmware with Silinx's AVR
// assembler, no arduino-cli (config.json's path to it a missing file): the uart-avr example's uno node assembled from its
// row, its lines in the console, its .hex the example's, byte for byte, no warning; an error and a warning: their exact
// lines, by file and line, the Errors and Warnings tabs' rows; the browser edition assembles it in the page (its .hex
// written, the node's firmware set when it had none); a sketch there still said to need the server, in Portuguese too.
// Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => {
  env = await setupUi();
  if (env?.server) fs.writeFileSync(path.join(env.server.configDir, 'config.json'), JSON.stringify({ mode: 'silinx', editor: 'off', paths: { 'arduino-cli': '/nowhere/arduino-cli' } }));
});
after(async () => { await env?.teardown?.(); });
const E = () => env;
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const said = async (page) => (await lines(page)).filter((l) => /^(WARNING|ERROR)/.test(l));
const compile = (page) => page.treeRow('#procs', 'Compile Firmware', { exact: true, dbl: true });
// (the console keeps every run's lines: the n-th time a line is written)
const nth = (page, text, n) => page.waitFor((t, k) => [...document.querySelectorAll('#console-log .ln')].filter((l) => l.textContent === t).length >= k, [text, n], { what: `${text} (${n})`, timeout: 60000 });
const DONE = 'Process "Compile Firmware (System node uno)" completed successfully';

uiTest('#5933 an Arduino node\'s .asm assembled by Compile Firmware, no arduino-cli: its .hex, its errors and warnings by line; the browser edition; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'AsmFw', template: 'uart-avr' });
  const dir = path.join(env.server.workspace, 'AsmFw');
  const shipped = fs.readFileSync(path.join(dir, 'uno/hello.hex'), 'utf8');
  fs.rmSync(path.join(dir, 'uno/hello.hex'));
  await page.openProject('AsmFw');
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'uno'), [], { what: 'the nodes' });
  await page.treeRow('#hier', 'uno', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Compile Firmware'), [], { what: 'the node\'s processes' });
  await compile(page);
  await page.waitConsole(/^Process "Compile Firmware \(System node uno\)" completed successfully$/m, { timeout: 60000 });
  const all = await lines(page);
  for (const l of ['System node uno: its program uno/hello.asm for arduino-uno, by Silinx\'s AVR assembler.', 'System node uno: its firmware uno/hello.hex, 148 bytes of the flash.']) assert.ok(all.includes(l), all.join('\n'));
  assert.equal(fs.readFileSync(path.join(dir, 'uno/hello.hex'), 'utf8'), shipped);
  assert.deepEqual(await said(page), [], 'no warning');
  // an error and a warning: their lines, by file and line, the Errors and Warnings tabs' rows
  fs.writeFileSync(path.join(dir, 'uno/hello.asm'), 'ld r26, X+\nfrob r1\nrjmp PC\n');
  await compile(page);
  await page.waitConsole(/^Process failed: the System node\(s\) uno failed$/m, { timeout: 60000 });
  assert.deepEqual(await said(page), [
    'ERROR: uno/hello.asm:2: no instruction frob',
    'WARNING: uno/hello.asm:1: ld with r26, a byte of the pointer X+ it changes: the result is undefined',
    'ERROR: System node uno: uno: its program did not assemble (1 error(s), 1 warning(s))',
    'ERROR: the System node(s) uno failed',
  ]);
  await page.eval(() => new Promise((r) => setTimeout(r, 120)));   // (the tabs drawn at most every 50 ms)
  assert.deepEqual(await page.eval(() => window.Silinx.diags.filter((d) => d.file).map((d) => `${d.severity} ${d.file}:${d.line}`)), ['error uno/hello.asm:2', 'warning uno/hello.asm:1']);
  // the browser edition: assembled in the page, its .hex written
  fs.writeFileSync(path.join(dir, 'uno/hello.asm'), 'loop: rjmp loop\n');
  await page.eval(async () => { (await import('/js/api.js')).api.standalone = true; });
  try {
    await page.eval(async () => { await (await import('/js/project.js')).reloadProject(); });
    await compile(page);
    await nth(page, DONE, 2);
    assert.ok((await lines(page)).includes('System node uno: its firmware uno/hello.hex, 2 bytes of the flash.'));
    assert.equal(fs.readFileSync(path.join(dir, 'uno/hello.hex'), 'utf8'), ':02000000FFCF30\n:00000001FF\n');
    // a sketch beside it: the server's, said; in Portuguese too
    fs.writeFileSync(path.join(dir, 'uno/hello.ino'), 'void setup() {}\nvoid loop() {}\n');
    await page.eval(async () => { await (await import('/js/project.js')).reloadProject(); });
    await compile(page);
    await page.waitConsole(/^ERROR: Compile Firmware: a node's sketch is compiled by the local server's arduino-cli \(the browser edition assembles an \.asm only\): give the node a \.hex made elsewhere, the Arduino IDE's Export Compiled Binary$/m);
    // (the language changed with the server's api: the page redrawn as it is)
    await page.eval(async () => { const { api } = await import('/js/api.js'); delete api.standalone; (await import('/js/i18n.js')).setLanguage('pt'); api.standalone = true; });
    await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Compilar Firmware'), [], { what: 'Portuguese' });
    await page.treeRow('#procs', 'Compilar Firmware', { exact: true, dbl: true });
    await page.waitConsole(/^ERROR: .+: o sketch de um nó é compilado pelo arduino-cli do servidor local \(a edição do browser só assembla um \.asm\): dê ao nó um \.hex feito noutro lado, o Export Compiled Binary do Arduino IDE$/m);
  } finally {
    await page.eval(async () => { delete (await import('/js/api.js')).api.standalone; (await import('/js/i18n.js')).setLanguage('en'); });
  }
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
