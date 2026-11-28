// UI (#5449): a System terminal joined to a real board over Web Serial, a fake port in the page (navigator.serial). A
// System (an Arduino Uno and a serial terminal linked by UART, 19200 baud 7E1): the System Emulator's terminal's Real
// Board… asks for a port among the Uno's USB ids, opens it at the link's baud and frame, shows what the board sends (the
// simulation's text) and sends the line typed to the board; Disconnect gives it back to the emulation; the board
// unplugged said; a browser with no Web Serial said in the console. Portuguese; both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { avrAssemble, intelHex } from '../avr-asm.mjs';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const EMU = '.doc:not([hidden]) .sys-emu';
const SYS = JSON.stringify({ format: 'silinx-system', version: 2, name: 'ser', nodes: [
  { id: 'uno', kind: 'mcu', board: 'arduino-uno', firmware: 'uno/l.hex', interfaces: [{ name: 'Serial', kind: 'uart', baud: 19200, frame: '7E1' }], x: 0, y: 0 },
  { id: 'term', kind: 'terminal', interfaces: [{ name: 'serial', kind: 'uart', baud: 19200, frame: '7E1' }], x: 300, y: 0 },
], links: [{ id: 'console', kind: 'uart', a: 'term.serial', b: 'uno.Serial' }] }, null, 2);
const LOOP = ['loop:', 'rjmp loop'];
const lines = page => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map(l => l.textContent.trim()));

// a fake Web Serial in the page: window.__port (its open options, its writes; push(text) the board's bytes, lose())
const FAKE = () => {
  let ctl = null;
  const port = window.__port = { options: null, written: [], closed: 0, readable: null, writable: null, asked: null,
    async open(o) { port.options = o; port.readable = new ReadableStream({ start(c) { ctl = c; } }); port.writable = new WritableStream({ write(ch) { port.written.push(...ch); } }); },
    async close() { port.closed++; port.readable = null; },
    getInfo: () => ({ usbVendorId: 0x2341, usbProductId: 0x0043 }),
    push(text) { ctl.enqueue(new TextEncoder().encode(text)); },
    lose() { ctl.error(new Error('The device has been lost.')); } };
  Object.defineProperty(navigator, 'serial', { configurable: true, value: { async requestPort(o) { port.asked = o; return port; } } });
};

uiTest('#5449 a System terminal on a real board over Web Serial: its link\'s settings, the board\'s text, the line typed, Disconnect, unplugged; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'CoSer', template: 'uart', files: { 'ser.sys.json': SYS, 'uno/l.hex': intelHex(avrAssemble(LOOP)) } });
  const pj = await env.server.api('GET', '/api/projects/CoSer');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/CoSer', { ...pj, profile: 'system', board: null, constraints: null, top: null });
  await page.openProject('CoSer');
  await page.eval(() => window.SilinxApp.openFile('ser.sys.json'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .system-editor .sys-emu-btn'), [], { what: 'the System editor' });
  await page.click('.doc:not([hidden]) .system-editor .sys-emu-btn');
  await page.waitFor(e => document.querySelector(`${e} .sys-term-real`), [EMU], { what: 'the terminal', timeout: 60000 });
  assert.equal(await page.eval(e => document.querySelector(`${e} .sys-term-real`).textContent, EMU), 'Real Board…');
  // (no Web Serial: said in the console, nothing joined)
  await page.eval(() => Object.defineProperty(navigator, 'serial', { configurable: true, value: undefined }));
  await page.click(`${EMU} .sys-term-real`);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some(l => /Web Serial is not in this browser/.test(l.textContent)), [], { what: 'the refusal' });
  assert.ok((await lines(page)).includes('ERROR: Serial terminal term: Web Serial is not in this browser: a real board\'s serial port needs Chrome or Edge (not Safari, nor the iPad).'), (await lines(page)).join('\n'));
  // joined: the Uno's USB ids asked, the link's 19200 7E1
  await page.eval(FAKE);
  await page.click(`${EMU} .sys-term-real`);
  await page.waitFor(e => document.querySelector(`${e} .sys-term-real`)?.textContent === 'Disconnect', [EMU], { what: 'joined' });
  const port = await page.eval(() => ({ options: window.__port.options, asked: window.__port.asked }));
  assert.deepEqual(port.options, { baudRate: 19200, dataBits: 7, parity: 'even', stopBits: 1 });
  assert.deepEqual(port.asked.filters[0], { usbVendorId: 0x2341, usbProductId: 0x0043 });
  assert.equal(port.asked.filters.length, 5);
  assert.ok((await lines(page)).includes('Serial terminal term: joined to the real board of uno (USB 2341:0043, link console) at 19200 baud, 7E1, through Web Serial.'), (await lines(page)).join('\n'));
  // the board's text (its bytes as the simulation shows them), the line typed sent to it
  await page.eval(() => window.__port.push('Hello\r\nT=21\x01'));
  await page.waitFor(e => document.querySelector(`${e} .sys-term-out`)?.textContent === 'Hello\r\nT=21\\x01', [EMU], { what: 'the board\'s text' });
  await page.click(`${EMU} .sys-term-in`);
  await page.type('go');
  await page.key('Enter');
  await page.waitFor(() => window.__port.written.length === 3, [], { what: 'the line written' });
  assert.deepEqual(await page.eval(() => window.__port.written), [0x67, 0x6f, 0x0a]);
  // (Disconnect: the port closed, the terminal the emulation's again)
  await page.click(`${EMU} .sys-term-real`);
  await page.waitFor(e => document.querySelector(`${e} .sys-term-real`)?.textContent === 'Real Board…', [EMU], { what: 'disconnected' });
  assert.equal(await page.eval(() => window.__port.closed), 1);
  assert.ok((await lines(page)).includes('Serial terminal term: the real board\'s serial port closed: the terminal shows the emulation again.'));
  // (unplugged while joined: said)
  await page.click(`${EMU} .sys-term-real`);
  await page.waitFor(e => document.querySelector(`${e} .sys-term-real`)?.textContent === 'Disconnect', [EMU], { what: 'joined again' });
  await page.eval(() => window.__port.lose());
  await page.waitFor(e => document.querySelector(`${e} .sys-term-real`)?.textContent === 'Real Board…', [EMU], { what: 'lost' });
  assert.ok((await lines(page)).includes('ERROR: Serial terminal term: the real board\'s serial port was lost (The device has been lost.): the terminal shows the emulation again.'));
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(e => document.querySelector(`${e} .sys-term-real`)?.textContent === 'Placa Real…', [EMU], { what: 'Portuguese' });
  await page.click(`${EMU} .sys-term-real`);
  await page.waitFor(e => document.querySelector(`${e} .sys-term-real`)?.textContent === 'Desligar', [EMU], { what: 'Disconnect in Portuguese' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  const said = (await lines(page)).filter(l => /^(WARNING|ERROR)/.test(l));
  assert.deepEqual(said, [
    'ERROR: Serial terminal term: Web Serial is not in this browser: a real board\'s serial port needs Chrome or Edge (not Safari, nor the iPad).',
    'ERROR: Serial terminal term: the real board\'s serial port was lost (The device has been lost.): the terminal shows the emulation again.',
  ]);
  assert.deepEqual(page.console.filter(c => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map(c => c.text), []);
});
