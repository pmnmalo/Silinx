// UI: the browser edition asks for the board's USB at the click itself (#4593). Chrome shows its WebUSB chooser
// (navigator.usb.requestDevice) only while the click's activation lasts (a few seconds): Program FPGA asked for it after
// its awaits (the pins, the bitstream, the project's file, getDevices, and the implementation the click may start first),
// so Chrome threw a SecurityError and showed nothing, which users of Chrome on Windows reported. The site built
// (test/ui/site-lib.js), navigator.usb a mock stricter than Chrome (the chooser only from a trusted click's handler, before
// any await), the board a Basys2 that Digilent Adept's driver holds on Windows (listed, but WebUSB cannot open it:
// "Access denied."):
//   - Program FPGA (a .bit chosen from the disk): the chooser asked for in the click, with the Adept's filter; the board
//     that cannot be opened in the console, with its next step (WinUSB with Zadig);
//   - the chooser closed with no board: "no board chosen", with its next step;
//   - a board granted before (getDevices): no chooser, the job takes it;
//   - Initialize Chain (Scan) and Back up PROM: the chooser in their click too.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest } from './harness.js';
import { buildSite } from './site-lib.js';

let env, site;
before(async () => {
  env = await setupUi({ server: false });
  if (env.skip) return;
  site = await buildSite(env.tmp);
});
after(async () => { site?.close?.(); await env?.teardown?.(); });
const E = () => (site?.skip ? { skip: site.skip } : env);

async function boot(page) {
  await page.goto(site.url);
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx.devices, [], { what: 'site boot' });
}
async function newProject(page, name, template, board) {
  await page.menu('File', 'New Project…');
  await page.waitDialog('New Project Wizard');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', name);
  await page.fill('.dlg-overlay .wiz-main select', template, { index: 0 });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main select', board, { index: 0 });
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((n) => window.Silinx.project?.name === n && window.Silinx.project.top, [name]);
}
// the synchronous part of a click's handler marked (window.__inClick): the listeners added from now on (iMPACT's buttons,
// mounted after this) wrapped, so that code run after an await, even a resolved promise's, is outside the click
const markClicks = (page) => page.eval(() => {
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, ...rest) {
    if (!/^(click|dblclick)$/.test(type) || typeof fn !== 'function') return add.call(this, type, fn, ...rest);
    return add.call(this, type, function (e) {
      const was = window.__inClick;
      window.__inClick = e.isTrusted;
      try { return fn.call(this, e); } finally { window.__inClick = was; }
    }, ...rest);
  };
});
// navigator.usb as Chrome's, stricter: the chooser only from a click's handler before any await (else Chrome's
// SecurityError and no chooser); `granted` a board granted before; the chooser's answer `choose` (the board, or 'cancel')
const mockUsb = (page, { granted = false, choose = 'board' } = {}) => page.eval((granted, choose) => {
  const real = (window.__realUsb ||= navigator.usb || null);
  const calls = (window.__usbCalls = []);
  const board = { vendorId: 0x1443, productId: 0x0007, productName: 'Basys2', configuration: null,
    open: async () => { throw new DOMException('Access denied.', 'SecurityError'); }, close: async () => {} };
  const usb = {
    getDevices: async () => (granted ? [board] : []),
    requestDevice(opts) {
      const inClick = !!window.__inClick;
      calls.push({ inClick, filters: opts.filters });
      if (!inClick) return Promise.reject(new DOMException('Failed to execute \'requestDevice\' on \'USB\': Must be handling a user gesture to show a permission request.', 'SecurityError'));
      return choose === 'cancel' ? Promise.reject(new DOMException('No device selected.', 'NotFoundError')) : Promise.resolve(board);
    },
    addEventListener() {},
  };
  Object.defineProperty(navigator, 'usb', { value: usb, configurable: true });
  // (the page's list of the devices granted before read again, as when a board is plugged in)
  real?.dispatchEvent(new Event('connect'));
}, granted, choose);
const problems = (text) => text.split('\n').filter((l) => /WARNING|ERROR|failed/.test(l));
const ADEPT = [{ vendorId: 0x1443 }];
const OPENED = 'the board cannot be opened (Access denied.): another program may be using it (Digilent Adept, iMPACT, the Silinx application); on Windows, Digilent Adept\'s or FTDI\'s driver holds the board unless it has the WinUSB driver: give it WinUSB with Zadig (zadig.akeo.ie) to program it from the browser (Adept then no longer sees it until its driver is put back)';
const NOT_CHOSEN = 'no board chosen: connect the board\'s USB cable, switch it on and choose it in the browser\'s list (on Windows, a board missing from the list: see Configure Target Device\'s help, the WinUSB driver)';

uiTest('#4593 browser edition: the WebUSB chooser asked for in the click itself (Program FPGA, Scan, the PROM); its failures in the console with what to do', E, async (page) => {
  await boot(page);
  await newProject(page, 'WebUsbClick', 'blinky', 'basys2');
  // a .bit for the Basys2-250 (its header: the part, the date)
  const f = (k, v) => [k.charCodeAt(0), 0, v.length + 1, ...Buffer.from(v), 0];
  const bit = path.join(env.tmp, 'b2.bit');
  await fs.writeFile(bit, Buffer.from([0, 9, 0x0f, 0xf0, 0x0f, 0xf0, 0x0f, 0xf0, 0x0f, 0xf0, 0, 0, 1, ...f('a', 'top;UserID=0XFFFFFFFF'), ...f('b', '3s250ecp132'), ...f('c', '2026/11/19'), ...f('d', '12:00:00'), 0x65, 0, 0, 0, 4, 0xff, 0xff, 0xff, 0xff]));
  await markClicks(page);
  await page.eval(() => window.SilinxApp.openImpact());
  await page.waitFor(() => !!document.querySelector('.doc:not([hidden]) .impact-chain'), [], { what: 'iMPACT' });
  await page.setFiles('.doc:not([hidden]) input[type=file][accept=".bit"]', [bit]);
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) input[type=text]')].some((i) => i.value === 'b2.bit'), [], { what: 'b2.bit chosen' });
  const program = async (title, click, done) => {
    const from = (await page.consoleText()).length;
    await click();
    await page.waitFor((s, fl, n) => new RegExp(s, fl).test(window.__console().slice(n)), [done.source, done.flags, from], { what: `${title}: ${done}` });
    return problems((await page.consoleText()).slice(from));
  };
  const programFpga = () => program('Program FPGA', () => page.click('.doc:not([hidden]) .btn.primary', { text: 'Program FPGA' }), /Programming FPGA \(SRAM\) failed/);
  const calls = () => page.eval(() => window.__usbCalls);

  // no board granted yet: the chooser in the click (the old code asked after its awaits: Chrome's SecurityError, no chooser)
  await mockUsb(page);
  assert.deepEqual(await programFpga(), [`ERROR: ${OPENED}`, `ERROR: Programming FPGA (SRAM) failed: ${OPENED}`]);
  assert.deepEqual(await calls(), [{ inClick: true, filters: ADEPT }]);
  // the chooser closed with no board
  await mockUsb(page, { choose: 'cancel' });
  assert.deepEqual(await programFpga(), [`ERROR: ${NOT_CHOSEN}`, `ERROR: Programming FPGA (SRAM) failed: ${NOT_CHOSEN}`]);
  assert.deepEqual(await calls(), [{ inClick: true, filters: ADEPT }]);
  // a board granted before: no chooser, the job takes it
  await mockUsb(page, { granted: true });
  await page.eval(() => new Promise((r) => setTimeout(r, 100)));   // (the page's getDevices answered)
  assert.deepEqual(await programFpga(), [`ERROR: ${OPENED}`, `ERROR: Programming FPGA (SRAM) failed: ${OPENED}`]);
  assert.deepEqual(await calls(), []);
  // Initialize Chain (Scan), and the PROM's Back up PROM: the chooser in their click too
  await mockUsb(page);
  assert.deepEqual(await program('Scan', () => page.click('.doc:not([hidden]) .btn', { text: 'Initialize Chain (Scan)' }), /Scanning JTAG chain failed/),
    [`ERROR: ${OPENED}`, `ERROR: Scanning JTAG chain failed: ${OPENED}`]);
  assert.deepEqual(await calls(), [{ inClick: true, filters: ADEPT }]);
  await page.click('.doc:not([hidden]) .impact-dev', { text: 'XCF02S' });   // (the chain's PROM selected: its operations)
  await mockUsb(page);
  assert.deepEqual(await program('Back up PROM', () => page.click('.doc:not([hidden]) .btn', { text: 'Back up PROM' }), /Backing up \w+ failed/),
    [`ERROR: ${OPENED}`, `ERROR: Backing up XCF02S failed: ${OPENED}`]);
  assert.deepEqual(await calls(), [{ inClick: true, filters: ADEPT }]);
}, { url: () => 'about:blank', timeout: 120000 });
