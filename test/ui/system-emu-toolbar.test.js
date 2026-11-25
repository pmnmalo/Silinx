// UI (#5613): the System Emulator's toolbar, the Board Emulator's controls that a System has, as docs/UI-GUIDELINES.md
// lays a toolbar out: its first line (no bar above it), Run / Pause, Step (one clock cycle of its one FPGA node: 20 ns on
// the Basys2), Power cycle (back to time 0), its rate against real time (1/100: about 20 ms in 2 s), its ⋮ menu at its
// right end (When hidden: Pause, Keep running), no Undo / Redo / Print; its status line its last line: the time and its
// FPGA node's model. Portuguese. No warnings. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DEV = { commit: 'abc1234', date: '2026-10-24 12:00' };
const EMU = '.doc:not([hidden]) .sys-emu';
const emu = (page) => page.eval(() => window.SilinxApp.findDoc('sysemu:uart_avr.sys.json').emulator.state()?.now ?? null);
const status = (page) => page.eval((e) => [...document.querySelectorAll(`${e} .doc-status > *`)].map((x) => x.textContent).filter(Boolean), EMU);

uiTest('#5613 the System Emulator\'s toolbar: Run, Step (one FPGA clock), Power cycle, its rate, its ⋮ menu; its status line the time and the FPGA node\'s model; the guidelines\' layout; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'SysEmuBar', template: 'uart-avr' });
  await page.setViewport(1680, 1050);
  await page.openProject('SysEmuBar');
  await page.waitFor(() => window.SilinxApp.S.project?.name === 'SysEmuBar' && window.SilinxApp.S.modules?.length, [], { what: 'the project' });
  await page.eval(async () => (await import('/js/system-emulate-ui.js')).emulateSystem());
  await page.waitFor((e) => document.querySelector(`${e} [data-node=fpga] .emu-pcb`), [EMU], { what: 'the boards', timeout: 60000 });
  await page.waitFor((e) => document.querySelector(`${e} .doc-status`)?.textContent.includes('t = 0 ms'), [EMU], { what: 'ready' });
  // its layout: the toolbar its first line, the status line its last; the ⋮ menu at its right end; no Undo, Redo, Print
  assert.deepEqual(await page.eval((e) => { const r = document.querySelector(e); return [r.firstElementChild.classList.contains('asm-toolbar'), r.lastElementChild.classList.contains('doc-status')]; }, EMU), [true, true]);
  assert.deepEqual(await page.eval((e) => [...document.querySelectorAll(`${e} .asm-toolbar button`)].filter((b) => b.getClientRects().length).map((b) => b.textContent.trim() || b.getAttribute('aria-label')), EMU),
    ['▶ Run', '⏭ Step', '⟲ Power cycle', 'When hidden']);
  assert.equal(await page.eval((e) => { const bar = document.querySelector(`${e} .asm-toolbar`); return bar.lastElementChild.lastElementChild.contains(bar.querySelector('.tb-more-btn')); }, EMU), true, 'the ⋮ menu at its right end');
  assert.deepEqual(await page.eval((e) => [...document.querySelector(`${e} .sysemu-speed`).options].map((o) => o.textContent), EMU), ['Real time', '1/10 of real time', '1/100 of real time', '1/1000 of real time']);
  // Step: one clock cycle of its one FPGA node (the Basys2's 50 MHz: 20 ns), twice
  await page.click(`${EMU} .sysemu-step`);
  await page.waitFor(() => window.SilinxApp.findDoc('sysemu:uart_avr.sys.json').emulator.state()?.now === 20000, [], { what: 'one step' });
  await page.click(`${EMU} .sysemu-step`);
  await page.waitFor(() => window.SilinxApp.findDoc('sysemu:uart_avr.sys.json').emulator.state()?.now === 40000, [], { what: 'two steps' });
  assert.deepEqual(await status(page), ['t = 0 ms', 'fpga: Behavioral (RTL)']);   // (40 ns: 0.000 ms)
  // its rate: 1/100 of real time, run for 2 s: about 20 ms
  await page.eval((e) => { const s = document.querySelector(`${e} .sysemu-speed`); s.value = '0.01'; s.dispatchEvent(new Event('change')); }, EMU);
  await page.click(`${EMU} .sysemu-run`);
  await new Promise((r) => setTimeout(r, 2000));
  await page.click(`${EMU} .sysemu-run`);
  const t = await emu(page);
  assert.ok(t > 10e9 && t < 30e9, `about 20 ms at 1/100: ${t / 1e9} ms`);
  // Power cycle: from time 0 again
  await page.click(`${EMU} .sysemu-restart`);
  await page.waitFor(() => window.SilinxApp.findDoc('sysemu:uart_avr.sys.json').emulator.state()?.now === 0, [], { what: 'power-cycled', timeout: 60000 });
  // its ⋮ menu: When hidden, Pause or Keep running
  await page.click(`${EMU} .tb-more-btn`);
  assert.deepEqual(await page.eval((e) => [...document.querySelectorAll(`${e} .tb-more-menu [role^=menuitem]`)].map((b) => b.textContent.replace(/^✓\s*/, '').trim()), EMU), ['Pause', 'Keep running']);
  await page.key('Escape');
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((e) => document.querySelector(`${e} .sysemu-step`)?.textContent === '⏭ Passo', [EMU], { what: 'Portuguese' });
  assert.deepEqual(await page.eval((e) => [document.querySelector(`${e} .sysemu-restart`).textContent, [...document.querySelector(`${e} .sysemu-speed`).options].map((o) => o.textContent)], EMU),
    ['⟲ Desligar/ligar', ['Tempo real', '1/10 do tempo real', '1/100 do tempo real', '1/1000 do tempo real']]);
  assert.ok((await status(page)).includes('fpga: Comportamental (RTL)'), (await status(page)).join());
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent).filter((l) => /^(WARNING|ERROR)/.test(l))), []);
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { build: DEV, timeout: 240000 });
