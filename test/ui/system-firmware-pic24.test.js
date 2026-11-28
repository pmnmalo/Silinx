// UI (#5482): a System's PIC24 node's firmware compiled from the Design pane, by XC16 on the local server (a stand-in for
// it: test/fixtures/xc16-stub, config.json's paths.xc16): the uart-pic24 example's pic node, given a C program, has
// Compile Firmware (its Program Node still MPLAB IPE's, disabled); run, its lines in the console, its .hex the node's
// firmware, no warning; a program with a warning and an error: their exact lines in the console, by file and line, in the
// Errors and Warnings tabs' rows; in Portuguese; the browser edition says XC16 compiles it, in Portuguese too. Both
// interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';
import { ROOT } from '../server-helpers.js';

const STUB = path.join(ROOT, 'test/fixtures/xc16-stub/v2.10/bin');
const LCD_HEX = fs.readFileSync(path.join(ROOT, 'examples/uart-pic24/pic/lcd_uart.hex'), 'utf8');
let env;
before(async () => {
  env = await setupUi();
  if (env?.server) fs.writeFileSync(path.join(env.server.configDir, 'config.json'), JSON.stringify({ mode: 'silinx', editor: 'off', paths: { xc16: STUB } }));
});
after(async () => { await env?.teardown?.(); });
const E = () => env;
const procs = (page) => page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].map((l) => l.textContent.trim()).filter((t) => t !== 'Design Summary/Reports' && t !== 'Resumo do Projeto/Relatórios'));
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const said = async (page) => (await lines(page)).filter((l) => /^(WARNING|ERROR)/.test(l));

uiTest('#5482 a PIC24 node\'s Compile Firmware from its row: XC16, its .hex the node\'s firmware, its errors and warnings in the console; Portuguese; the browser edition', E, async (page) => {
  if (process.platform === 'win32') return;   // (the stand-in for XC16 is a script run by its #! line)
  await makeProject(env, { name: 'PicFw', template: 'uart-pic24' });
  const dir = path.join(env.server.workspace, 'PicFw');
  fs.writeFileSync(path.join(dir, 'pic/main.c'), '#include <xc.h>\n\nint main(void) {\n  for (;;);\n}\n');
  fs.writeFileSync(path.join(dir, 'pic/lcd_uart.hex'), ':00000001FF\n');
  await page.openProject('PicFw');
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'pic'), [], { what: 'the nodes' });
  await page.treeRow('#hier', 'pic', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Compile Firmware'), [], { what: 'the node\'s processes' });
  assert.deepEqual(await procs(page), ['View/Edit System', 'Compile Firmware', 'Program Node', 'Simulate Node', 'Emulate Node']);
  await page.treeRow('#procs', 'Compile Firmware', { exact: true, dbl: true });
  await page.waitConsole(/^Process "Compile Firmware \(System node pic\)" completed successfully$/m, { timeout: 60000 });
  const all = await lines(page);
  for (const l of ['System node pic: its program (1 C and assembly file(s) of pic/) for the PIC24FJ1024GB610 (Explorer 16/32), by XC16 2.10 on this computer, -O1 (XC16\'s free licence: -O0 to -O2), in build/nodes/pic/firmware/.',
    'System node pic: its firmware pic/lcd_uart.hex, 392 program word(s).']) assert.ok(all.includes(l), all.join('\n'));
  assert.equal(fs.readFileSync(path.join(dir, 'pic/lcd_uart.hex'), 'utf8'), LCD_HEX);
  assert.deepEqual(await said(page), [], 'no warning');
  // a warning and an error: their lines, by file and line, the Errors and Warnings tabs' rows
  fs.writeFileSync(path.join(dir, 'pic/main.c'), '#warning check the baud\nint main(void) {\n  #error no main yet\n}\n');
  await page.treeRow('#procs', 'Compile Firmware', { exact: true, dbl: true });
  await page.waitConsole(/^Process failed: the System node\(s\) pic failed$/m, { timeout: 60000 });
  assert.deepEqual(await said(page), [
    'ERROR: pic/main.c:3:4: #error no main yet',
    'WARNING: pic/main.c:1:2: #warning check the baud',
    'ERROR: System node pic: pic: its program did not compile (1 error(s), 1 warning(s))',
    'ERROR: the System node(s) pic failed',
  ]);
  await page.eval(() => new Promise((r) => setTimeout(r, 120)));   // (the tabs drawn at most every 50 ms)
  assert.deepEqual(await page.eval(() => window.Silinx.diags.filter((d) => d.file).map((d) => `${d.severity} ${d.file}:${d.line}`)), ['error pic/main.c:3', 'warning pic/main.c:1']);
  // (its Errors tab's row opens the C at its line)
  await page.eval(() => [...document.querySelectorAll('#console-errors .diag')].find((d) => /main\.c:3/.test(d.textContent)).click());
  await page.waitFor(() => window.Silinx.active?.path === 'pic/main.c' && window.Silinx.active.editor?.getCursor().line === 2, [], { what: 'main.c at line 3' });
  // Portuguese; the browser edition: no compiler, said (in Portuguese too)
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Compilar Firmware'), [], { what: 'Portuguese' });
  await page.eval(async () => { (await import('/js/api.js')).api.standalone = true; });
  await page.treeRow('#procs', 'Compilar Firmware', { exact: true, dbl: true });
  await page.waitConsole(/^ERROR: Compile Firmware: o programa \(firmware\) de um nó PIC24 é compilado pelo XC16, no servidor local ou na sua máquina do ISE \(a edição do browser não tem compilador\): dê ao nó o \.hex que o MPLAB X construiu$/m);
  // (the language changed in the server's edition: the collaboration tab redrawn with its calls)
  await page.eval(async () => { delete (await import('/js/api.js')).api.standalone; (await import('/js/i18n.js')).setLanguage('en'); (await import('/js/api.js')).api.standalone = true; });
  await page.treeRow('#procs', 'Compile Firmware', { exact: true, dbl: true });
  await page.waitConsole(/^ERROR: Compile Firmware: a PIC24 node's firmware is compiled by XC16, on the local server or its ISE machine \(the browser edition has no compiler\): give the node the \.hex MPLAB X built$/m);
  await page.eval(async () => { delete (await import('/js/api.js')).api.standalone; });
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });

const LOCK = (() => { const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/lock/src/lock.fsm.json'), 'utf8')); delete d.generatedFile; return d; })();
const badges = (page, label) => page.eval((l) => [...[...document.querySelectorAll('#hier .row')].find((r) => r.querySelector('.lbl')?.textContent.trim() === l).querySelectorAll('.badge')].map((b) => [b.textContent, b.title, b.classList.contains('warn')]), label);

uiTest('#5552 a drawing in a PIC24 node: its C on the PIC24\'s registers and the node\'s main.c made on opening, its row [FSM] [C]; Compile Firmware builds them; Portuguese', E, async (page) => {
  if (process.platform === 'win32') return;   // (the stand-in for XC16 is a script run by its #! line)
  await makeProject(env, { name: 'PicDraw', template: 'uart-pic24', files: { 'pic/lock.fsm.json': JSON.stringify(LOCK, null, 2) } });
  const dir = path.join(env.server.workspace, 'PicDraw');
  await page.openProject('PicDraw');
  await page.leftTab('design');
  await page.waitConsole(/^pic\/lock\.c generated from pic\/lock\.fsm\.json$/m);
  await page.waitConsole(/^pic\/main\.c generated from pic's drawings$/m);
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'lock'), [], { what: 'the drawing\'s row' });
  const c = fs.readFileSync(path.join(dir, 'pic/lock.c'), 'utf8');
  assert.match(c, /^\/\/ lock: a (Moore|Mealy) machine, generated by Silinx from the state diagram lock\.fsm\.json/);
  assert.ok(c.includes('#include <xc.h>') && !c.includes('Arduino'), 'the PIC24\'s C');
  assert.match(fs.readFileSync(path.join(dir, 'pic/main.c'), 'utf8'), /\n {2}lock_init\(\);\n[^]*\n {6}lock_tick\(\);\n/);
  assert.deepEqual(await badges(page, 'lock'), [['FSM', 'Open', false], ['C', 'Generated from the state diagram', false]]);
  // (Compile Firmware on the node's row: the drawing's C and main.c compiled)
  await page.treeRow('#hier', 'pic', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Compile Firmware'), [], { what: 'the node\'s processes' });
  await page.treeRow('#procs', 'Compile Firmware', { exact: true, dbl: true });
  await page.waitConsole(/^Process "Compile Firmware \(System node pic\)" completed successfully$/m, { timeout: 60000 });
  assert.ok((await lines(page)).includes('System node pic: its program (2 C and assembly file(s) of pic/) for the PIC24FJ1024GB610 (Explorer 16/32), by XC16 2.10 on this computer, -O1 (XC16\'s free licence: -O0 to -O2), in build/nodes/pic/firmware/.'));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'build/nodes/pic/firmware/xc16-gcc.json'), 'utf8')).filter((a) => a.startsWith('src/')), ['src/lock.c', 'src/main.c']);
  assert.deepEqual(await said(page), [], 'no warning');
  // Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor(() => [...document.querySelectorAll('#hier .badge')].some((b) => b.title === 'Gerado a partir do diagrama de estados'), [], { what: 'the badge in Portuguese' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  assert.deepEqual(page.console.filter((x) => x.type === 'error' || x.type === 'warning' || x.type === 'warn').map((x) => x.text), []);
}, { timeout: 180000 });
