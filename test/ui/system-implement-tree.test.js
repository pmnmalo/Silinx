// UI (#5581's part 4): a System project's Implement. The Silinx interface's Implement task shows the System's tree where
// it said "No top module is set": its row's Build Plan, Connected Boards, Build All and Program All; a row per node of
// the plan, the FPGA nodes first, its plan's state its mark (✓ up to date or given, ! out of date) and its plan's line its
// tip: the FPGA's I/O Pin Planning (alone, #5642), Synthesize, Implement Design, Generate Programming File and Program Node, the Uno's
// firmware given (uno/hello.hex: no Compile Firmware) and Program Node; its bar's Build All and Program All the System's
// (each run said, the server's answer stubbed in the page); Build Plan in the console, one line a node; the uart-fpga-pic24
// example's PIC24: its firmware given and its Program Node disabled, its tip why (MPLAB IPE), said on a double-click;
// Portuguese. The ISE style: the PIC24's row's Program Node disabled, its tip. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rowItems, runRowItem } from './row-menu.js';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DEV = { commit: 'abc1234', date: '2026-10-24 12:00' };
const ISE = process.env.SILINX_UI_INTERFACE === 'ise';
// the tree's rows, indented by their depth, with their marks ([ok], [stale]: their status) and whether they are disabled
const rows = (page) => page.eval(() => {
  const depth = (li) => { let d = 0; for (let p = li.parentElement.closest('li'); p; p = p.parentElement.closest('li')) d++; return d; };
  return [...document.querySelectorAll('#procs li')].map((li) => {
    const r = li.querySelector(':scope > .row'), mark = r.querySelector('.status').dataset.status;
    return `${'  '.repeat(depth(li))}${r.querySelector('.lbl').textContent}${mark ? ` [${mark}]` : ''}${r.classList.contains('disabled') ? ' (off)' : ''}`;
  });
});
const tip = (page, label) => page.eval((l) => [...document.querySelectorAll('#procs .row')].find((r) => r.querySelector('.lbl').textContent === l)?.title ?? null, label);
const run = (page, label) => page.eval((l) => [...document.querySelectorAll('#procs .row')].find((r) => r.querySelector('.lbl').textContent === l).dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), label);
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const warnings = async (page) => (await lines(page)).filter((l) => /^(WARNING|ERROR)/.test(l));
const FPGA_TIP = 'fpga: out of date (its last build left no record of its sources); built by the Silinx toolchain to build/nodes/fpga/build/uart.bit, programmed over JTAG';
const UNO_TIP = 'uno: given (its firmware uno/hello.hex, no sketch to compile); its image uno/hello.hex, programmed by avrdude (arduino-cli upload)';
const PIC_TIP = 'pic: a PIC24 is not programmed by Silinx yet: load its pic/lcd_uart.hex with MPLAB IPE';
// (its Design Summary and its steps' reports under them, #5632)
const FPGA_ROWS = ['  fpga (Digilent Basys2)', '    Design Summary/Reports', '    I/O Pin Planning',
  '    Synthesize', '      View Synthesis Report', '    Implement Design', '      View Static Timing Report', '    Generate Programming File', '    Program Node'];

uiTest('#5581 a System\'s Implement: its tree, each node\'s plan state its mark, its bar\'s Build All and Program All, Build Plan; a PIC24\'s Program Node off, said why; Portuguese; the ISE style\'s', E, async (page) => {
  await makeProject(env, { name: 'SysImplTree', template: 'uart-avr' });
  // (its Uno's firmware given: its .asm, which Silinx assembles (#5933, test/ui/system-firmware-asm), left out)
  fs.rmSync(path.join(env.server.workspace, 'SysImplTree/uno/hello.asm'));
  await makeProject(env, { name: 'SysImplPic', template: 'uart-fpga-pic24' });
  // (the FPGA node built before, its build's record lost: out of date)
  const built = path.join(env.server.workspace, 'SysImplTree/build/nodes/fpga');
  fs.mkdirSync(path.join(built, 'build'), { recursive: true });
  fs.writeFileSync(path.join(built, 'build/uart.bit'), 'not a bitstream');
  fs.writeFileSync(path.join(built, 'built-from.json'), '{}');
  await page.setViewport(1680, 1050);
  if (ISE) {
    // the ISE style: the PIC24's row in the Design pane, its Program Node disabled, its tip why
    await page.openProject('SysImplPic');
    await page.waitFor(() => [...document.querySelectorAll('#hier .row .lbl')].some((l) => l.textContent.trim() === 'pic'), [], { what: 'the node' });
    await page.treeRow('#hier', 'pic', { exact: true });
    await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Program Node'), [], { what: 'its Program Node' });
    assert.ok((await rows(page)).includes('Program Node (off)'), (await rows(page)).join('\n'));
    assert.equal(await tip(page, 'Program Node'), PIC_TIP);
    await run(page, 'Program Node');
    await page.waitConsole(/^INFO: pic: a PIC24 is not programmed by Silinx yet/m);
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    await page.treeRow('#hier', 'pic', { exact: true });
    await page.waitFor(() => [...document.querySelectorAll('#procs .row .lbl')].some((l) => l.textContent.trim() === 'Programar Nó'), [], { what: 'Portuguese' });
    assert.equal(await tip(page, 'Programar Nó'), 'pic: um PIC24 ainda não é programado pelo Silinx: carregue o seu pic/lcd_uart.hex com o MPLAB IPE');
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  } else {
    await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
    await page.reload();
    await page.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await page.openProject('SysImplTree');
    await page.click('#task-switch .task-btn[data-task="impl"]');
    // its tree, once its plan is read: the FPGA node first, out of date; the Uno's firmware given
    await page.waitFor(() => [...document.querySelectorAll('#procs .row .status')].some((s) => s.dataset.status), [], { what: 'the marks' });
    assert.deepEqual(await rows(page), ['uart_avr (System)', '  Build Plan', '  Connected Boards', '  Build All', '  Program All',
      ...FPGA_ROWS.map((r, i) => (i ? r : `${r} [stale]`)), '  uno (Arduino Uno) [ok]', '    Firmware: hello.hex (off)', '    Program Node']);
    assert.deepEqual([await tip(page, 'fpga (Digilent Basys2)'), await tip(page, 'uno (Arduino Uno)'), await tip(page, 'Firmware: hello.hex')],
      [FPGA_TIP, UNO_TIP, 'uno: its firmware uno/hello.hex, made outside Silinx: nothing to build']);
    assert.equal(await page.eval(() => document.querySelector('#procs .task-no-top')), null, 'no "No top module is set"');
    // its System's row's menu: Build All and Program All (a bar above the tree before #5939)
    assert.deepEqual(await rowItems(page, '#procs', 'uart_avr (System)'), ['Build All', 'Program All']);
    // (each run said: the server's answer stubbed, the runs themselves are test/ui/system-build-all's and system-program's)
    await page.eval(async () => { const { api } = await import('/js/api.js'); api.buildSystem = async () => { throw new Error('stubbed'); }; api.programPlan = async () => { throw new Error('stubbed'); }; });
    await runRowItem(page, '#procs', 'uart_avr (System)', 'Build All');
    await page.waitConsole(/^Process "Build All" failed: stubbed$/m);
    await runRowItem(page, '#procs', 'uart_avr (System)', 'Program All');
    await page.waitConsole(/^ERROR: Program All: stubbed$/m);
    // Build Plan: one line a node, the FPGA first
    await run(page, 'Build Plan');
    await page.waitConsole(/^Process "Build Plan" completed successfully$/m);
    const all = await lines(page), at = all.lastIndexOf('Build plan (the FPGA nodes first, then the microcontrollers):');
    assert.deepEqual(all.slice(at + 1, at + 3), [`  ${FPGA_TIP}`, `  ${UNO_TIP}`]);
    assert.deepEqual(await warnings(page), ['ERROR: Program All: stubbed']);
    // the PIC24's: its firmware given, its Program Node disabled, said why on a double-click
    await page.openProject('SysImplPic');
    await page.click('#task-switch .task-btn[data-task="impl"]');
    // (its rows drawn from the System at once, its marks once its plan is read: the PIC24's given firmware)
    await page.waitFor(() => [...document.querySelectorAll('#procs .row')].some((r) => r.querySelector('.lbl').textContent === 'pic (Explorer 16/32)' && r.querySelector('.status').dataset.status), [], { what: 'the PIC24\'s plan read' });
    const pic = await rows(page);
    assert.deepEqual(pic.slice(pic.findIndex((r) => r.startsWith('  pic '))), ['  pic (Explorer 16/32) [ok]', '    Firmware: lcd_uart.hex (off)', '    Program Node (off)']);
    assert.equal(await tip(page, 'Program Node'), '', 'the FPGA\'s Program Node first, enabled');
    assert.equal(await page.eval(() => [...document.querySelectorAll('#procs .row')].filter((r) => r.querySelector('.lbl').textContent === 'Program Node')[1].title), PIC_TIP);
    await page.eval(() => [...document.querySelectorAll('#procs .row')].filter((r) => r.querySelector('.lbl').textContent === 'Program Node')[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    await page.waitConsole(/^INFO: pic: a PIC24 is not programmed by Silinx yet: load its pic\/lcd_uart\.hex with MPLAB IPE$/m);
    // Portuguese
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    await page.waitFor(() => document.querySelector('#procs .lbl')?.textContent === 'uart_fpga_pic24 (Sistema)', [], { what: 'Portuguese' });
    const pt = await rows(page);
    assert.deepEqual(pt.slice(0, 5), ['uart_fpga_pic24 (Sistema)', '  Plano de Construção', '  Placas Ligadas', '  Construir Tudo', '  Programar Tudo']);
    assert.deepEqual(pt.slice(pt.findIndex((r) => r.startsWith('  pic '))), ['  pic (Explorer 16/32) [ok]', '    Programa (firmware): lcd_uart.hex (off)', '    Programar Nó (off)']);
    assert.equal(await page.eval(() => [...document.querySelectorAll('#procs .row')].filter((r) => r.querySelector('.lbl').textContent === 'Programar Nó')[1].title),
      'pic: um PIC24 ainda não é programado pelo Silinx: carregue o seu pic/lcd_uart.hex com o MPLAB IPE');
    assert.deepEqual(await rowItems(page, '#procs', 'uart_fpga_pic24 (Sistema)'), ['Construir Tudo', 'Programar Tudo']);
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  assert.deepEqual(page.console.filter((c) => c.type === 'error' || c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { build: DEV, timeout: 240000 });
