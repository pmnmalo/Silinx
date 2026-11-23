// UI: SSim's lines mirrored in the main Console keep their tooltip, their location's file:line, when the language
// changes (#5240: the drawings' Check lines' handlers, web/js/tasks-check.js and editor-problems.js, set the title of
// every link line to "Show it in the drawing", the mirrored ones too). Both interfaces (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BLINK = 'module blink(input clk, output reg led);\n  always @(posedge clk) led <= ~led;\nendmodule\n';
const TB = [
  'library ieee; use ieee.std_logic_1164.all;',
  'entity tb_msg is end;',
  'architecture sim of tb_msg is',
  'begin',
  '  process begin',
  '    wait for 10 ns;',
  '    assert false report "a is not 1" severity error;',
  '    wait;',
  '  end process;',
  'end;',
].join('\n') + '\n';
const title = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].find((x) => /a is not 1/.test(x.textContent))?.title);

uiTest('#5240 a mirrored SSim line keeps its file:line tooltip in Portuguese and back', E, async (page) => {
  await makeProject(env, { name: 'MirrorTitle', top: 'blink', simTop: 'tb_msg', files: { 'src/blink.v': BLINK, 'sim/tb_msg.vhd': TB }, roles: { 'sim/tb_msg.vhd': 'sim' } });
  await page.openProject('MirrorTitle');
  await page.eval(() => window.SilinxApp.runSimulation('tb_msg'));
  await page.waitFor(() => window.Silinx.active?.id === 'isim:tb_msg' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { what: 'SSim ran', timeout: 30000 });
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln.mc-link')].some((l) => /a is not 1/.test(l.textContent)), [], { what: 'the assertion mirrored' });
  assert.equal(await title(page), 'sim/tb_msg.vhd:7');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    assert.equal(await title(page), 'sim/tb_msg.vhd:7');
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
  assert.equal(await title(page), 'sim/tb_msg.vhd:7');
});
