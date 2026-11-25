// UI (#5489's part 3, #5447): a System's nodes programmed on their boards from the Design pane, never a real board: djtgcfg
// a stand-in written here (config.json's paths.djtgcfg, its arguments logged), arduino-cli's and the USB listing's
// stand-ins (test/fixtures/arduino-cli-stub, test/fixtures/usb-devices-stub), the boards in the config folder. The
// uart-avr example with its FPGA node's bitstream: the System's row has Program All, the FPGA's and the Uno's rows Program
// Node; two Unos connected: Program All asks which board the Uno is (Choose the Board), the FPGA programmed by djtgcfg on
// its board by its serial number, then the Uno on the board picked; Program Node of the Uno, Skip: not programmed, said;
// in Portuguese; the browser edition says the local server programs them. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';
import { ROOT, makeBit } from '../server-helpers.js';

const USB = path.join(ROOT, 'test/fixtures/usb-devices-stub/usb-devices');
const CLI = path.join(ROOT, 'test/fixtures/arduino-cli-stub/arduino-cli');
let env, dir;
before(async () => {
  env = await setupUi();
  if (!env?.server) return;
  dir = env.server.configDir;
  const djtg = path.join(dir, 'djtgcfg');
  fs.writeFileSync(djtg, `#!/bin/sh\necho "djtgcfg $*" >> "${path.join(dir, 'prog.log')}"\necho "Programming device. Do not touch your board. This may take a few minutes..."\necho "Programming succeeded."\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ mode: 'silinx', editor: 'off', paths: { djtgcfg: djtg, 'usb-devices': USB, 'arduino-cli': CLI } }));
  fs.writeFileSync(path.join(dir, 'usb-devices.json'), JSON.stringify([{ vendor: '1443', product: '0007', serial: 'D1', name: 'Digilent USB Device' }]));
  const port = (s, a) => ({ port: { address: a, properties: { vid: '0x2341', pid: '0x0043', serialNumber: s } } });
  fs.writeFileSync(path.join(dir, 'arduino-ports.json'), JSON.stringify([port('A1', '/dev/cu.usbmodem101'), port('B2', '/dev/cu.usbmodem102')]));
});
after(async () => { await env?.teardown?.(); });
const E = () => env;
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const procs = (page) => page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].map((l) => l.textContent.trim()).filter((t) => t !== 'Design Summary/Reports' && t !== 'Resumo do Projeto/Relatórios'));
const dlg = (page) => page.waitFor(() => document.querySelector('.dlg .dlg-title span')?.textContent === 'Choose the Board', [], { what: 'Choose the Board' });
const press = (page, label) => page.eval((label) => [...document.querySelectorAll('.dlg .dlg-buttons button')].find((b) => b.textContent === label).click(), label);

uiTest('#5489 Program All and Program Node: the FPGA, then the Uno on the board picked; Skip; Portuguese; the browser edition', E, async (page) => {
  if (process.platform === 'win32') return;   // (the stand-ins are scripts run by their #! line)
  await makeProject(env, { name: 'SysProg', template: 'uart-avr' });
  const bit = path.join(env.server.workspace, 'SysProg/build/nodes/fpga/build');
  fs.mkdirSync(bit, { recursive: true });
  fs.writeFileSync(path.join(bit, 'uart.bit'), makeBit({ design: 'uart.ncd;UserID=0xFFFFFFFF' }));
  await page.openProject('SysProg');
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'uart_avr'), [], { what: 'the System' });
  for (const [row, last] of [['fpga', 'Program Node'], ['uno', 'Program Node'], ['uart_avr', 'Program All']]) {
    await page.treeRow('#hier', row, { exact: true });
    await page.waitFor((last) => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === last), [last], { what: `${row}'s processes` });
    assert.equal((await procs(page)).at(-1), last, row);
  }
  // Program All: the Uno's board asked, the second picked
  await page.treeRow('#procs', 'Program All', { exact: true, dbl: true });
  await dlg(page);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg .sys-pick-board option')].map((o) => o.textContent)),
    ['USB 1443:0007, serial D1 (Digilent USB Device)', 'USB 2341:0043, serial A1 (port /dev/cu.usbmodem101)', 'USB 2341:0043, serial B2 (port /dev/cu.usbmodem102)']);
  await page.eval(() => { const s = document.querySelector('.dlg .sys-pick-board'); s.value = 'B2'; });
  await press(page, 'Program');
  await page.waitConsole(/^Process "Program All" completed successfully$/m, { timeout: 60000 });
  let all = await lines(page);
  const order = ['System node fpga: programming build/nodes/fpga/build/uart.bit.', 'System node fpga: programmed.', 'System node uno: programming uno/hello.hex.', 'System node uno: programmed.',
    'Program: 2 node(s) programmed (fpga, uno), 0 failed, 0 not programmed.'];
  assert.deepEqual(all.filter((l) => order.includes(l)), order, all.join('\n'));
  assert.deepEqual(all.filter((l) => /^(WARNING|ERROR)/.test(l)), [
    'WARNING: System node fpga: out of date (its last build left no record of its sources): its last build is programmed',
    'WARNING: System node uno: its board chosen by hand: USB 2341:0043, serial B2 (port /dev/cu.usbmodem102)']);
  assert.match(fs.readFileSync(path.join(dir, 'prog.log'), 'utf8'), /^djtgcfg prog -d SN:D1 -i 0 -f .*uart\.bit$/m);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'uploads.json'), 'utf8')).at(-1)[4], '/dev/cu.usbmodem102');
  // Program Node of the Uno, Skip: not programmed
  await page.treeRow('#hier', 'uno', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Program Node'), [], { what: 'the Uno\'s processes' });
  await page.treeRow('#procs', 'Program Node', { exact: true, dbl: true });
  await dlg(page);
  await press(page, 'Skip');
  await page.waitConsole(/^Process failed: the System node\(s\) uno not programmed$/m, { timeout: 30000 });
  all = await lines(page);
  assert.ok(all.includes('ERROR: System node uno: not programmed: 2 connected boards could be it (USB 2341:0043, serial A1 (port /dev/cu.usbmodem101); USB 2341:0043, serial B2 (port /dev/cu.usbmodem102)): give it its board\'s serial number'), all.join('\n'));
  // Portuguese
  await page.treeRow('#hier', 'uart_avr', { exact: true });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Programar Tudo'), [], { what: 'Portuguese' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  // the browser edition: the local server's, said
  await page.eval(async () => { (await import('/js/api.js')).api.standalone = true; });
  await page.treeRow('#procs', 'Program All', { exact: true, dbl: true });
  await page.waitConsole(/^ERROR: Program All: a System's boards are programmed by the local server for now \(the browser edition programs an FPGA project's board\)$/m);
  await page.eval(async () => { delete (await import('/js/api.js')).api.standalone; });
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
