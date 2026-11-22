// UI: the interface's Check Syntax and the MCP's check_syntax give the same messages (#4749, step 4; #2674): each
// diagnostic's line in the console holds the message the MCP's result lists (its text, severity, source, tool,
// location with its column, process), its result's line too, on a design with warnings (a latch) and on one with an
// error; in Portuguese the console's lines and the MCP's messages stay the same English text. Both interfaces
// (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env, handle;
before(async () => {
  env = await setupUi();
  if (env.server?.workspace) {
    process.env.SILINX_WORKSPACE = env.server.workspace;
    ({ handle } = await import('../../server/mcp.js'));
  }
});
after(async () => { await env?.teardown?.(); });
const E = () => env;
let id = 0;
const mcp = async (name, args) => {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  assert.equal(r.isError, false, r.content[0].text);
  return r.structuredContent;
};

const LATCH = `library ieee; use ieee.std_logic_1164.all;
entity top is port (a, en : in std_logic; y : out std_logic); end;
architecture rtl of top is
begin
  process(a, en) begin
    if en = '1' then y <= a; end if;
  end process;
end;
`;
const BAD = 'module bad(input a, output y);\n  assign y = a &;\nendmodule\n';
const fields = ({ text, severity, source, tool, location, process }) => ({ text, severity, source, tool, location, process });
// the interface's Check Syntax run: its run's lines' messages, from its first diagnostic to its result
async function uiCheck(page, mod) {
  await page.eval(() => import('/js/console.js').then((c) => c.clearConsole()));
  await page.eval((m) => import('/js/processes.js').then((p) => p.checkSyntax(m)), mod);
  return page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.message)
    .filter((m) => m.source === 'check' && /^(ERROR|WARNING|INFO):|^Process "/.test(m.text.trim()))
    .map(({ text, severity, source, tool, location, process }) => ({ text: text.trim(), severity, source, tool, location, process })));
}

uiTest('#4749 Check Syntax\'s console messages are check_syntax\'s: warnings, an error, their results; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'MsgLatch', top: 'top', files: { 'src/top.vhd': LATCH } });
  await makeProject(env, { name: 'MsgBad', top: 'bad', files: { 'src/bad.v': BAD } });
  for (const [project, mod] of [['MsgLatch', 'top'], ['MsgBad', 'bad']]) {
    await page.openProject(project);
    const ui = await uiCheck(page, mod);
    const m = (await mcp('check_syntax', { project })).messages.map(fields);
    // (the MCP's result line names its top, `of <top>`, and counts the signals: the interface's says neither)
    const result = (x) => x.text.replace(/ of <\w+>/, '').replace(/ \(\d+ signals?, \d+ process(?:es)?\)/, '').replace(/\.$/, '');
    assert.deepEqual(ui.slice(0, -1), m.slice(0, -1), project);
    assert.deepEqual({ ...ui.at(-1), text: result(ui.at(-1)) }, { ...m.at(-1), text: result(m.at(-1)) }, project);
    assert.ok(m.length >= 2, project);
    assert.ok(m.slice(0, -1).every((x) => x.location?.col > 0), project);   // (each with its column)
  }
  // Portuguese: the same messages, their texts in English
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    const ui = await uiCheck(page, 'bad');
    const m = (await mcp('check_syntax', { project: 'MsgBad' })).messages.map(fields);
    assert.deepEqual(ui.slice(0, -1), m.slice(0, -1));
    assert.match(ui[0].text, /^ERROR:/);
  } finally {
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  }
});
