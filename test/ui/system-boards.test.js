// UI (#5489's part 2): a System's nodes matched to the connected boards by their USB id. The local server's listing is
// a stand-in (test/fixtures/usb-devices-stub, and arduino-cli's, test/fixtures/arduino-cli-stub: config.json's paths),
// its devices in the config folder. The uart-avr System's row has Connected Boards: its devices and each node's board in
// the console, exact; the System editor's USB serial of the Uno saved in the document, its USB id refused when it is not
// one (the console says why); Connected Boards again: the Uno's board with that serial missing, warned; in Portuguese;
// the browser edition says the local server lists them. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { ROOT } from '../server-helpers.js';

const STUB = path.join(ROOT, 'test/fixtures/usb-devices-stub/usb-devices');
const CLI = path.join(ROOT, 'test/fixtures/arduino-cli-stub/arduino-cli');
let env;
before(async () => {
  env = await setupUi();
  if (!env?.server) return;
  const dir = env.server.configDir;
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ mode: 'silinx', editor: 'off', paths: { 'usb-devices': STUB, 'arduino-cli': CLI } }));
  fs.writeFileSync(path.join(dir, 'usb-devices.json'), JSON.stringify([{ vendor: '1443', product: '0007', serial: 'D1', name: 'Digilent USB Device' }]));
  fs.writeFileSync(path.join(dir, 'arduino-ports.json'), JSON.stringify([{ port: { address: '/dev/cu.usbmodem101', properties: { vid: '0x2341', pid: '0x0043', serialNumber: 'A1' } } }]));
});
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .system-editor';
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const procs = (page) => page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].map((l) => l.textContent.trim()));
const setField = (page, sel, value) => page.eval((ed, sel, value) => {
  const el = document.querySelector(`${ed} .asm-side ${sel}`);
  el.value = value; el.dispatchEvent(new Event('change', { bubbles: true }));
}, ED, sel, value);
const runs = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].filter((l) => /^Process "Connected Boards" completed successfully/.test(l.textContent)).length);

uiTest('#5489 Connected Boards: the System\'s nodes and their boards by USB id; a node\'s USB serial set in the System editor; Portuguese; the browser edition', E, async (page) => {
  if (process.platform === 'win32') return;   // (the stand-ins are scripts run by their #! line)
  await makeProject(env, { name: 'SysBoards', template: 'uart-avr' });
  await page.openProject('SysBoards');
  await page.leftTab('design');
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'uart_avr'), [], { what: 'the System' });
  await page.treeRow('#hier', 'uart_avr', { exact: true });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Connected Boards'), [], { what: 'the System\'s processes' });
  assert.equal((await procs(page)).at(-2), 'Connected Boards');
  await page.treeRow('#procs', 'Connected Boards', { exact: true, dbl: true });
  await page.waitConsole(/^Process "Connected Boards" completed successfully$/m);
  let all = await lines(page);
  const found = ['Connected USB devices (2):', '  USB 1443:0007, serial D1 (Digilent USB Device)', '  USB 2341:0043, serial A1 (port /dev/cu.usbmodem101)',
    'The System\'s nodes:', '  fpga: USB 1443:0007, serial D1 (Digilent USB Device)', '  uno: USB 2341:0043, serial A1 (port /dev/cu.usbmodem101)'];
  assert.deepEqual(all.filter((l) => found.includes(l)), found, all.join('\n'));
  assert.deepEqual(all.filter((l) => /^(WARNING|ERROR)/.test(l)), [], 'no warning');
  // the System editor: the Uno's USB serial, saved; a USB id that is not one, refused
  await page.treeRow('#hier', 'uart_avr', { exact: true, dbl: true });
  await page.waitFor((ed) => !!document.querySelector(`${ed} .sys-node[data-id="uno"]`), [ED], { what: 'the System editor' });
  await page.click(`${ED} .sys-node[data-id="uno"] .sys-head`);
  await page.waitFor((ed) => !!document.querySelector(`${ed} .sys-usb-serial`), [ED], { what: 'the Uno\'s USB fields' });
  await setField(page, '.sys-usb-id', 'zz');
  await page.waitConsole(/uno: its USB vendor id 'zz' is not 4 hexadecimal digits/);
  await setField(page, '.sys-usb-serial', 'B2');
  const t0 = Date.now();
  let m;
  for (;;) {
    m = JSON.parse(await readWs(env, 'SysBoards', 'uart_avr.sys.json'));
    if (m.nodes.find((n) => n.id === 'uno').usb?.serial === 'B2' || Date.now() - t0 > 15000) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.deepEqual(m.nodes.find((n) => n.id === 'uno').usb, { serial: 'B2' });
  // Connected Boards again: its board missing, warned
  await page.treeRow('#hier', 'uart_avr', { exact: true });
  await page.treeRow('#procs', 'Connected Boards', { exact: true, dbl: true });
  await page.waitFor((n) => [...document.querySelectorAll('#console-log .ln')].filter((l) => /^Process "Connected Boards" completed successfully/.test(l.textContent)).length === n, [2], { what: 'the second run' });
  all = await lines(page);
  assert.ok(all.includes('WARNING: uno: no board connected for it (Arduino Uno, USB 2341:0043 or 2341:0001 or 2341:0243 or 2a03:0043 or 1a86:7523, serial B2)'), all.join('\n'));
  assert.ok(all.includes('Process "Connected Boards" completed successfully with 1 warning(s)'), all.join('\n'));
  assert.equal(await runs(page), 2);
  // Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Placas Ligadas'), [], { what: 'Portuguese' });
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  // the browser edition: the local server's, said
  await page.eval(async () => { (await import('/js/api.js')).api.standalone = true; });
  await page.treeRow('#procs', 'Connected Boards', { exact: true, dbl: true });
  await page.waitConsole(/^ERROR: Connected Boards: the local server lists the boards connected to its computer \(the browser edition sees only a board it was given, when it programs it\)$/m);
  await page.eval(async () => { delete (await import('/js/api.js')).api.standalone; });
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { timeout: 180000 });
