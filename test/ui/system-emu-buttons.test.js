// UI (#5619): the System Emulator's Basys2 push-buttons as the Board Emulator's. It runs once ready, as the Board Emulator
// (it opened paused, and a button let go, held until the design saw a real press, stayed pressed); BTN0 clicked: lit, then
// let go (its input back to 0) once the design saw it, its message sent once; at 1/100 of real time the press lasts 100 ms
// of the user's time, not 100 ms of the board's (100 s). Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DEV = { commit: 'abc1234', date: '2026-10-24 12:00' };
const EMU = '.doc:not([hidden]) .sys-emu';
const state = (page) => page.eval(() => window.SilinxApp.findDoc('sysemu:uart_avr.sys.json').emulator.state());
// BTN0 clicked: pressed, let go 50 ms later; whether it is lit
const click = (page) => page.eval(async (e) => {
  const b = [...document.querySelectorAll(`${e} [data-node=fpga] .emu-btn`)].find((x) => /^BTN0:/.test(x.title));
  b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
  await new Promise((r) => setTimeout(r, 50));
  b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
  return b.classList.contains('on');
}, EMU);
const lit = (page) => page.eval((e) => [...document.querySelectorAll(`${e} [data-node=fpga] .emu-btn`)].find((x) => /^BTN0:/.test(x.title)).classList.contains('on'), EMU);
const term = (page) => page.eval((e) => document.querySelector(`${e} .sys-term-out`)?.textContent ?? '', EMU);

uiTest('#5619 the System Emulator\'s BTN0: running once ready; clicked, let go once the design saw it, its message sent once; at 1/100 of real time too', E, async (page) => {
  await makeProject(env, { name: 'SysButtons', template: 'uart-avr' });
  await page.setViewport(1680, 1050);
  await page.openProject('SysButtons');
  await page.waitFor(() => window.SilinxApp.S.project?.name === 'SysButtons' && window.SilinxApp.S.modules?.length, [], { what: 'the project' });
  // (the FPGA alone, its UART's other end a terminal: BTN0's message there)
  await page.eval(async () => (await import('/js/system-emu-open.js')).openSystemEmulator('uart_avr.sys.json', null, { nodes: ['fpga'] }));
  // running once ready, as the Board Emulator (before #5619: paused, until ▶ Run)
  await page.waitFor(() => window.SilinxApp.findDoc('sysemu:uart_avr.sys.json')?.emulator?.state()?.running === true, [], { what: 'running once ready', timeout: 60000 });
  assert.equal(await page.eval((e) => document.querySelector(`${e} .sysemu-run`).textContent, EMU), '⏸ Pause');
  // BTN0 clicked: lit while held, let go once the design saw a real press (100 ms of the board's time), its message once
  assert.equal(await click(page), true, 'lit while pressed');
  await page.waitFor((e) => ![...document.querySelectorAll(`${e} [data-node=fpga] .emu-btn`)].find((x) => /^BTN0:/.test(x.title)).classList.contains('on'), [EMU], { what: 'let go', timeout: 30000 });
  await page.waitFor((e) => document.querySelector(`${e} .sys-term-out`)?.textContent === 'Hello from Silinx!\r\n', [EMU], { what: 'its message', timeout: 60000 });
  const t = (await state(page)).now;
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(await term(page), 'Hello from Silinx!\r\n', 'its message once: the button not held');
  assert.ok((await state(page)).now > t, 'still running');
  // at 1/100 of real time: let go after 100 ms of the user's time (not 100 ms of the board's: 10 s)
  await page.eval((e) => { const s = document.querySelector(`${e} .sysemu-speed`); s.value = '0.01'; s.dispatchEvent(new Event('change')); }, EMU);
  assert.equal(await click(page), true);
  const t0 = Date.now();
  await page.waitFor(() => false === [...document.querySelectorAll('.doc:not([hidden]) .sys-emu [data-node=fpga] .emu-btn')].find((x) => /^BTN0:/.test(x.title)).classList.contains('on'), [], { what: 'let go at 1/100', timeout: 5000 });
  assert.ok(Date.now() - t0 < 4000, `let go in ${Date.now() - t0} ms`);
  assert.equal(await lit(page), false);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { build: DEV, timeout: 240000 });
