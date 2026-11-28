// UI (#4687, parts 2 and 3b): a Zynq board's PS program compiled and run from the interface (Run PS Program: OpenOCD's
// stand-in, test/fixtures/openocd-stub). A Board project on the Zybo Z7: its PS row's
// process and its ps/ file's, Compile PS Program, run by the local server's arm-none-eabi-gcc (its stand-in,
// test/fixtures/arm-gcc-stub, config.json's path): its lines in the console, its warning by file and line; in
// Portuguese; the browser edition says a server is needed. A System project: a Zynq node's row has it (a Basys 2's has
// not), its run says the node. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';
import { ROOT } from '../server-helpers.js';

const STUB = path.join(ROOT, 'test/fixtures/arm-gcc-stub/arm-none-eabi-gcc');
const OCD = path.join(ROOT, 'test/fixtures/openocd-stub/openocd');
let env;
before(async () => {
  env = await setupUi();
  if (env?.server) fs.writeFileSync(path.join(env.server.configDir, 'config.json'), JSON.stringify({ mode: 'silinx', editor: 'off', paths: { 'arm-none-eabi-gcc': STUB, openocd: OCD } }));
});
after(async () => { await env?.teardown?.(); });
const E = () => env;
const procs = (page) => page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].map((l) => l.textContent.trim()).filter((t) => t !== 'Design Summary/Reports' && t !== 'Resumo do Projeto/Relatórios'));
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const MAIN = '#warning check the clock\nint main(void) { for (;;) { } }\n';
const ELF = (who, dir, elf) => `${who}: its PS program ${dir}/out/${elf}, 8 bytes loaded in the on-chip memory (16392 of its 192 KB used, its .bss and stack included), its entry 0x00000000.`;

uiTest('#4687 a Board project on the Zybo Z7: Compile PS Program from its PS row and its ps/ file; its warning by file and line; Portuguese; the browser edition', E, async (page) => {
  if (process.platform === 'win32') return;   // (the stand-in for arm-none-eabi-gcc is a script run by its #! line)
  await makeProject(env, { name: 'ZyboCc', template: 'empty', board: 'zybo-z7', files: { 'ps/main.c': MAIN } });
  const pj = await env.server.api('GET', '/api/projects/ZyboCc');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/ZyboCc', { ...pj, ps: 'ps/main.c' });
  await page.openProject('ZyboCc');
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'PS'), [], { what: 'the PS row' });
  await page.treeRow('#hier', 'PS', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Compile PS Program'), [], { what: 'its process' });
  assert.deepEqual(await procs(page), ['Compile PS Program', 'Run PS Program']);
  await page.treeRow('#procs', 'Compile PS Program', { exact: true, dbl: true });
  await page.waitConsole(/^Process "Compile PS Program" completed successfully$/m);
  const run = (await lines(page)).filter((l) => /PS program|^WARNING|^ERROR/.test(l));
  assert.deepEqual(run, [
    'The project: its PS program (1 C and assembly file(s) of ps/) for the Cortex-A9, by arm-none-eabi-gcc, with Silinx\'s startup code and Silinx\'s linker script (the on-chip memory), in build/ps/.',
    'WARNING: ps/main.c:1:2: #warning check the clock',
    ELF('The project', 'build/ps', 'ps.elf'),
  ]);
  assert.ok(fs.existsSync(path.join(env.server.workspace, 'ZyboCc/build/ps/out/ps.elf')));
  // Run PS Program: the ELF loaded over JTAG by OpenOCD (its stand-in), its lines in the console (#4687, part 3b)
  await page.treeRow('#procs', 'Run PS Program', { exact: true, dbl: true });
  await page.waitConsole(/^Process "Run PS Program" completed successfully$/m);
  assert.deepEqual((await lines(page)).filter((l) => /loaded over JTAG|runs on CPU 0|OpenOCD:/.test(l)), [
    'The project: its PS program build/ps/out/ps.elf (8 bytes) loaded over JTAG by OpenOCD 0.12.0, after ps7_init (26 register operations of the SLCR), CPU 0 started at 0x00000000; its script build/ps/run/run.tcl.',
    'WARNING: OpenOCD: zynq.cpu1: ran after reset and before halt ...',
    'The project: its PS program runs on CPU 0 (its UART on the board\'s USB serial port).',
  ]);
  // (its ps/ file's row: the same process)
  await page.treeRow('#hier', 'main.c', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Compile PS Program'), [], { what: 'the file\'s process' });
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Compilar o Programa do PS'), [], { what: 'Portuguese' });
  assert.deepEqual(await procs(page), ['Compilar o Programa do PS', 'Correr o Programa do PS']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the browser edition: a server needed, said
  await page.eval(async () => { (await import('/js/api.js')).api.standalone = true; });
  await page.treeRow('#procs', 'Compile PS Program', { exact: true, dbl: true });
  await page.waitConsole(/^ERROR: Compile PS Program: a Zynq's PS program is compiled by arm-none-eabi-gcc on the local server or its ISE machine \(the browser edition has no compiler\): run Silinx's server$/m);
  await page.treeRow('#procs', 'Run PS Program', { exact: true, dbl: true });
  await page.waitConsole(/^ERROR: Run PS Program: a Zynq's PS program is loaded and started by the local server's OpenOCD for now \(the browser edition has no compiler\): run Silinx's server$/m);
  await page.eval(async () => { delete (await import('/js/api.js')).api.standalone; });
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 300000 });

const SYS = JSON.stringify({ format: 'silinx-system', version: 2, name: 'zynq', nodes: [
  { id: 'zybo', kind: 'fpga', module: 'uart', board: 'zybo-z7', variant: '20', ps: 'zybo/ps/main.c', interfaces: [], x: 0, y: 0 },
  { id: 'b2', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', interfaces: [], x: 300, y: 0 },
], links: [] }, null, 2);

uiTest('#4687 a System\'s Zynq node: Compile PS Program in its row\'s processes (none on a Basys 2\'s); its run says the node; no warnings', E, async (page) => {
  if (process.platform === 'win32') return;
  await makeProject(env, { name: 'ZynqCc', template: 'uart', files: { 'zynq.sys.json': SYS, 'zybo/ps/main.c': 'int main(void) { for (;;) { } }\n' } });
  const pj = await env.server.api('GET', '/api/projects/ZynqCc');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/ZynqCc', { ...pj, profile: 'system', board: null, constraints: null, top: null });
  await page.openProject('ZynqCc');
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'b2'), [], { what: 'the nodes' });
  await page.treeRow('#hier', 'b2', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'View/Edit System'), [], { what: 'b2\'s processes' });
  assert.ok(!(await procs(page)).includes('Compile PS Program'));
  await page.treeRow('#hier', 'zybo', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Compile PS Program'), [], { what: 'zybo\'s Compile PS Program' });
  await page.treeRow('#procs', 'Compile PS Program', { exact: true, dbl: true });
  await page.waitConsole(/^Process "Compile PS Program \(System node zybo\)" completed successfully$/m);
  assert.deepEqual((await lines(page)).filter((l) => /PS program|^WARNING|^ERROR/.test(l)), [
    'System node zybo: its PS program (1 C and assembly file(s) of zybo/ps/) for the Cortex-A9, by arm-none-eabi-gcc, with Silinx\'s startup code and Silinx\'s linker script (the on-chip memory), in build/nodes/zybo/ps/.',
    ELF('System node zybo', 'build/nodes/zybo/ps', 'zybo.elf'),
  ]);
  // (the node's PS row: the same process)
  await page.treeRow('#hier', 'PS', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Compile PS Program'), [], { what: 'the PS row\'s process' });
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 300000 });
