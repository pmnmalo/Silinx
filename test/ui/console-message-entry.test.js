// UI: the Errors / Warnings tabs' entries made from the console's messages (#4749, step 3): a line's message holds its
// tool, its location (the file and line its text names, or its writer's own) and its action, and its entry is made
// from it (the console reading nothing back from the line): the location its row's link, the action its button (an
// untrusted project's refusal, its line and the "… failed:" line after it, each entry with its Trust Project button,
// in Portuguese too); SSim's lines mirrored in the console keep their messages' locations, each of them a link. Both
// interfaces (SILINX_UI_INTERFACE).
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
const settled = (page) => page.eval(() => new Promise((r) => setTimeout(r, 120)));   // (the tabs drawn at most every 50 ms)
const rows = (page, tab = 'errors') => page.eval((t) => [...document.querySelectorAll(`#console-${t} .diag`)].map((d) => d.textContent), tab);
const lastMessages = (page, n) => page.eval((k) => [...document.querySelectorAll('#console-log .ln')].slice(-k).map((l) => {
  const { action, ...m } = l.message;
  return { ...m, action: action && { label: action.label, trust: action.trust ?? null } };
}), n);
const REFUSAL = (name) => `project '${name}' came from outside (imported): programming a board runs only once you trust it (Trust Project, in the console when the project opens)`;

uiTest('#4749 an entry made from its line\'s message: its tool, its location (the text\'s, or the writer\'s), its action', E, async (page) => {
  await makeProject(env, { name: 'MsgEntry', top: 'blink', files: { 'src/blink.v': BLINK } });
  await page.openProject('MsgEntry');
  await page.eval(() => document.querySelector('#mc-filters .filt[data-src=all]')?.click());
  await page.eval((refusal) => import('/js/console.js').then((c) => {
    c.clearConsole();
    c.logLine('ERROR:HDLCompiler:806 - "/work/MsgEntry/src/blink.v" Line 2: Syntax error near "<=".');
    c.log('WARNING: the clock is not constrained', 'warn', { location: { file: 'src/blink.v', line: 1 } });
    c.log(`ERROR: ${refusal}`, 'err');
    c.log(`Process failed: ${refusal}`, 'err');
  }), REFUSAL('MsgEntry'));
  await settled(page);
  // the lines' messages: the tool, the location (the text's: the project's path), the action (the refusal's, shared
  // by the line after it)
  const trust = { label: 'Trust Project', trust: 'MsgEntry' };
  assert.deepEqual((await lastMessages(page, 4)).map(({ severity, tool, location, action }) => ({ severity, tool, location, action })), [
    { severity: 'error', tool: 'HDLCompiler:806', location: { file: 'src/blink.v', line: 2 }, action: null },
    { severity: 'warning', tool: null, location: { file: 'src/blink.v', line: 1 }, action: null },
    { severity: 'error', tool: null, location: null, action: trust },
    { severity: 'error', tool: null, location: null, action: trust },
  ]);
  // (one button on the console's lines: the line after it shares it)
  assert.equal(await page.eval(() => document.querySelectorAll('#console-log .ln-trust').length), 1);
  // the entries: the text's location in it, the writer's its link, the refusals' their buttons
  assert.deepEqual(await rows(page), [
    'ERROR:HDLCompiler:806 - "/work/MsgEntry/src/blink.v" Line 2: Syntax error near "<=".',
    `ERROR:Silinx - ${REFUSAL('MsgEntry')}Trust Project`,
    `ERROR:Silinx - Process failed: ${REFUSAL('MsgEntry')}Trust Project`,
  ]);
  assert.deepEqual(await rows(page, 'warnings'), ['WARNING:Silinx - "src/blink.v" Line 1: the clock is not constrained']);
  assert.deepEqual(await page.eval(() => window.Silinx.diags.map((d) => [d.severity, d.tool, d.file, d.line, !!d.inText])),
    [['error', 'HDLCompiler:806', 'src/blink.v', 2, true], ['warning', 'Silinx', 'src/blink.v', 1, false], ['error', 'Silinx', null, 0, false], ['error', 'Silinx', null, 0, false]]);
  assert.equal(await page.eval(() => document.querySelectorAll('#console-errors .diag .ln-trust').length), 2);
  // the writer's location clicked: the file at its line
  await page.eval(() => [...document.querySelectorAll('#console-warnings .diag')][0].click());
  await page.waitFor(() => window.Silinx.active?.path === 'src/blink.v' && window.Silinx.active.editor?.getCursor().line === 0, [], { what: 'blink.v at line 1' });
  // Portuguese: the entries' buttons translated, their messages in English
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor(() => document.querySelector('#console-errors .ln-trust')?.textContent === 'Confiar no Projeto', [], { what: 'in Portuguese' });
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-errors .diag .ln-trust')].map((b) => b.textContent)), ['Confiar no Projeto', 'Confiar no Projeto']);
    assert.deepEqual(await page.eval(() => window.Silinx.diags.map((d) => d.action?.label ?? null)), [null, null, 'Trust Project', 'Trust Project']);
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});

uiTest('#4749 SSim\'s lines in the console: each its message\'s source and location, a link', E, async (page) => {
  await makeProject(env, { name: 'MsgSim', top: 'blink', simTop: 'tb_msg', files: { 'src/blink.v': BLINK, 'sim/tb_msg.vhd': TB }, roles: { 'sim/tb_msg.vhd': 'sim' } });
  await page.openProject('MsgSim');
  await page.eval(() => window.SilinxApp.runSimulation('tb_msg'));
  await page.waitFor(() => window.Silinx.active?.id === 'isim:tb_msg' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { what: 'SSim ran', timeout: 30000 });
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln')].some((l) => /a is not 1/.test(l.textContent)), [], { what: 'the assertion mirrored' });
  const line = await page.eval(() => {
    const l = [...document.querySelectorAll('#console-log .ln')].find((x) => /a is not 1/.test(x.textContent));
    return { source: l.message.source, severity: l.message.severity, location: l.message.location, link: l.classList.contains('mc-link'), title: l.title, src: l.dataset.src };
  });
  assert.deepEqual(line, { source: 'sim', severity: 'error', location: { file: 'sim/tb_msg.vhd', line: 7 }, link: true, title: 'sim/tb_msg.vhd:7', src: 'sim' });
  // (its entry the simulator's own, once: the mirrored line none)
  await settled(page);
  assert.deepEqual(await page.eval(() => window.Silinx.diags.filter((d) => /a is not 1/.test(d.message)).map((d) => [d.tool, d.file, d.line])), [['SSim', 'sim/tb_msg.vhd', 7]]);
});
