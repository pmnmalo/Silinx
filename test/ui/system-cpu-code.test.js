// UI (#5486): a System's CPU node's C sources are its board's program, not Silinx HLS's: the interface's compile of the
// project (web/js/app.js compileProject, Check Syntax) leaves out the C in a microcontroller node's folder, so that its
// functions are no modules of the FPGA's design and its errors are not the FPGA's. The FPGA node's Check Syntax: no
// warning. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const SYS = JSON.stringify({ format: 'silinx-system', version: 1, name: 'lab', nodes: [
  { id: 'uno', kind: 'mcu', board: 'arduino-uno', lang: 'c', firmware: 'fw/hello.hex', interfaces: [{ name: 'Serial', kind: 'uart', baud: 9600, frame: '8N1' }], x: 0, y: 0 },
  { id: 'fpga', kind: 'fpga', module: 'uart', board: 'basys2', variant: '250', pins: { clk: 'B8', rx: 'J3', tx: 'A3' }, interfaces: [{ name: 'uart', kind: 'uart', tx: 'tx', rx: 'rx', baud: 9600, frame: '8N1' }], x: 300, y: 0 },
], links: [{ id: 'serial', kind: 'uart', a: 'uno.Serial', b: 'fpga.uart' }] }, null, 2);
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const rows = (page) => page.eval(() => [...document.querySelectorAll('#hier .row .lbl')].map((l) => l.textContent.trim()));

uiTest('#5486 a CPU node\'s C is not compiled by Silinx HLS: not a module of the design, its errors not the FPGA\'s', E, async (page) => {
  await makeProject(env, { name: 'CpuC', template: 'uart', files: {
    'lab.sys.json': SYS, 'fw/hello.hex': ':00000001FF\n',
    'uno/blink.c': 'int blink(int a) { return a ^ 1; }\n', 'uno/broken.c': 'int broken(int a) { return a +; }\n',
  } });
  const pj = await env.server.api('GET', '/api/projects/CpuC');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/CpuC', { ...pj, kind: 'system', board: null, constraints: null, top: null });
  await page.openProject('CpuC');
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'uno'), [], { what: 'the nodes' });
  const r = await rows(page);
  assert.ok(!r.includes('blink') && !r.includes('broken'), `no module of the CPU node's C: ${r.join(', ')}`);
  await page.treeRow('#hier', 'fpga', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Check Syntax'), [], { what: 'the FPGA node\'s processes' });
  await page.treeRow('#procs', 'Check Syntax', { exact: true, dbl: true });
  await page.waitConsole(/^Process "Check Syntax" completed successfully$/m);
  assert.deepEqual((await lines(page)).filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.ok(!(await lines(page)).some((l) => /broken\.c/.test(l)), 'uno/broken.c\'s errors are not the FPGA\'s');
});
