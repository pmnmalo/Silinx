// The MCP's results as the console's typed messages (#4749, step 4; core/message.js): check_syntax's, simulate's,
// run_process's and follow_project's runs' `messages`, beside their other fields: each one's severity, source, tool,
// location and process as the interface's console makes it from the same line (#2674: the console's lineMessage of
// the line the MCP gives is the same message), its action by its label, its text in English.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';
import { lineMessage, makeMessage, messageData, diagLocation } from '../core/message.js';
import { runMessages, runsActivity, followedRuns } from '../core/collab-runs.js';
import { diagLine, diagMessage } from '../server/mcp-util.js';
import { processMessageList } from '../server/mcp-processes.js';

let tmp;
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
// (a message as the console makes it from its line: the interface's, its fields compared; location: its writer's, as
// the interface's Check Syntax gives its diagnostics', web/js/processes.js)
const consoleOf = (m, paths = [], location = null) => messageData(lineMessage(m.text, { cls: { error: 'err', warning: 'warn', info: 'info', ok: 'ok' }[m.severity] ?? '', source: m.source, process: m.process, paths, location }));
const pick = ({ severity, source, tool, location, process }) => ({ severity, source, tool, location, process });

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
const TB = `library ieee; use ieee.std_logic_1164.all;
entity tb is end;
architecture s of tb is
begin
  process begin
    wait for 10 ns;
    report "half way";
    assert false report "a is not 1" severity error;
    wait;
  end process;
end;
`;

before(async () => {
  tmp = await scratchEnv('silinx-mcp-messages-');
  await ok('new_project', { name: 'w' });
  await ok('write_file', { project: 'w', path: 'src/top.vhd', text: LATCH });
  await ok('write_file', { project: 'w', path: 'sim/tb.vhd', text: TB });
  await ok('set_top', { project: 'w', top: 'top', sim_top: 'tb' });
  await ok('new_project', { name: 'e' });
  await ok('write_file', { project: 'e', path: 'src/bad.v', text: BAD });
  await ok('set_top', { project: 'e', top: 'bad' });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('#4749 check_syntax: its messages, the check\'s, each with its location, then its result', async () => {
  const r = await ok('check_syntax', { project: 'w' });
  const ms = r.data.messages;
  // (the latch's warning, the lines the text gives, in order)
  assert.deepEqual(ms.map((m) => m.text), r.text.split('\n'));
  assert.ok(ms.length >= 2);
  for (const m of ms.slice(0, -1)) {
    assert.equal(m.source, 'check');
    assert.equal(m.process, 'Check Syntax');
    assert.equal(m.severity, 'warning');
    assert.equal(m.location.file, 'src/top.vhd');
    assert.equal(m.action, null);
    assert.equal(m.run, null);
  }
  assert.deepEqual(r.data.warnings.map((w) => [w.file, w.line, w.tool]), ms.slice(0, -1).map((m) => [m.location.file, m.location.line, m.tool]));
  assert.deepEqual(pick(ms.at(-1)), { severity: 'ok', source: 'check', tool: null, location: null, process: 'Check Syntax' });
  assert.match(ms.at(-1).text, /^Process "Check Syntax" of <top> completed successfully with \d+ warning\(s\)/);
  // (the console's message of each line: the same)
  for (const m of ms) assert.deepEqual(pick(consoleOf(m, [], m.location)), pick(m), m.text);
  // (its line's own location: the column the diagnostic's)
  assert.deepEqual(ms.slice(0, -1).map((m) => m.location), r.data.warnings.map((w) => ({ file: w.file, line: w.line, ...(w.col ? { col: w.col } : {}) })));
});

test('#4749 check_syntax: a failure\'s messages, its errors and its result errors', async () => {
  const r = await ok('check_syntax', { project: 'e' });
  const ms = r.data.messages;
  assert.equal(r.data.ok, false);
  assert.deepEqual(ms.map((m) => m.severity), [...r.data.errors.map(() => 'error'), ...r.data.warnings.map(() => 'warning'), 'error']);
  assert.ok(r.data.errors.length >= 1);
  assert.deepEqual(ms[0].location, { file: 'src/bad.v', line: r.data.errors[0].line, ...(r.data.errors[0].col ? { col: r.data.errors[0].col } : {}) });
  assert.match(ms.at(-1).text, /^Process "Check Syntax" of <bad> failed \(\d+ error\(s\), 0 warning\(s\)\)\.$/);
  for (const m of ms) assert.deepEqual(pick(consoleOf(m, [], m.location)), pick(m), m.text);
});

test('#4749 simulate: its messages, the simulation\'s, the design\'s with their file and line', async () => {
  const r = await ok('simulate', { project: 'w', time_ns: 100 });
  const ms = r.data.messages;
  assert.ok(ms.every((m) => m.source === 'sim' && m.process === 'Simulate Behavioral Model' && m.action === null), JSON.stringify(ms));
  const said = ms.filter((m) => /half way|a is not 1/.test(m.text));
  assert.deepEqual(said.map((m) => [m.text, m.severity, m.location]), [
    ['[10.000 ns] NOTE: half way', 'info', { file: 'sim/tb.vhd', line: 7 }],
    ['[10.000 ns] ERROR: a is not 1', 'error', { file: 'sim/tb.vhd', line: 8 }],
  ]);
  // (its stop: an error, the design failed; the log as before)
  assert.deepEqual([ms.at(-1).text, ms.at(-1).severity], ['Simulation of <tb> stopped at 100 ns.', 'error']);
  assert.equal(r.data.failed, true);
  assert.deepEqual(r.data.log.map((l) => l.text), ['half way', 'a is not 1']);
});

test('#4749 run_process\'s messages: its errors\' and warnings\' lines as the console makes them, then its result', () => {
  const errors = ['ERROR:HDLCompiler:806 - "/work/w/src/top.vhd" Line 6: Syntax error near "end".'];
  const warnings = ['WARNING:Xst:737 - Found 1-bit latch for signal <y>.', 'CRITICAL WARNING: [Synth 8-327] inferring latch for variable y [/work/w/src/top.vhd:6]'];
  const head = 'Process "synthesize" of <top> failed (1 error(s), 2 warning(s)) (Silinx toolchain).';
  const ms = processMessageList({ errors, warnings, head, ok: false, process: 'synthesize', paths: ['src/top.vhd'] });
  assert.deepEqual(ms, [
    { text: errors[0], severity: 'error', source: 'impl', tool: 'HDLCompiler:806', location: { file: 'src/top.vhd', line: 6 }, action: null, process: 'synthesize', run: null },
    { text: warnings[0], severity: 'warning', source: 'impl', tool: 'Xst:737', location: null, action: null, process: 'synthesize', run: null },
    { text: warnings[1], severity: 'warning', source: 'impl', tool: null, location: { file: 'src/top.vhd', line: 6 }, action: null, process: 'synthesize', run: null },
    { text: head, severity: 'error', source: 'impl', tool: null, location: null, action: null, process: 'synthesize', run: null },
  ]);
  assert.equal(processMessageList({ errors: [], warnings: [], head: 'done', ok: true, process: 'implement' })[0].severity, 'ok');
  for (const m of ms) assert.deepEqual(consoleOf(m, ['src/top.vhd']), m, m.text);
});

test('#4749 follow_project\'s runs as messages: each line\'s source the owner\'s, its location a file of the project', () => {
  const r = followedRuns(runsActivity({ id: 1, lines: [['Started : "Synthesize - XST".', 'hdr', 'impl'], ['ERROR:Xst:2585 - "src/top.vhd" Line 3: no port', 'err', 'impl'], ['WARNING: the clock', 'warn', 'sim'], ['a line', '', 'bogus']] }));
  assert.deepEqual(runMessages(r, ['src/top.vhd']).map(pick), [
    { severity: 'header', source: 'impl', tool: null, location: null, process: null },
    { severity: 'error', source: 'impl', tool: 'Xst:2585', location: { file: 'src/top.vhd', line: 3 }, process: null },
    { severity: 'warning', source: 'sim', tool: null, location: null, process: null },
    { severity: 'text', source: 'app', tool: null, location: null, process: null },   // (an unknown source the application's)
  ]);
  assert.deepEqual(runMessages(null), []);
});

test('#4749 a message as data: its action by its label; a check\'s message the console\'s of its line', () => {
  const run = () => true;
  assert.deepEqual(messageData(makeMessage({ text: 'x', action: { label: 'Trust Project', trust: 'p', run } })).action, 'Trust Project');
  assert.equal(messageData(makeMessage({ text: 'x' })).action, null);
  assert.equal(JSON.stringify(messageData(makeMessage({ text: 'x', action: { label: 'Keep a Copy', run } }))), JSON.stringify({ severity: 'text', source: 'app', text: 'x', tool: null, location: null, action: 'Keep a Copy', process: null, run: null }));
  const d = { severity: 'warning', tool: 'HDLCompiler', file: 'src/top.vhd', line: 4, col: 2, message: 'unused signal s' };
  const m = diagMessage(d, { process: 'Check Syntax' });
  assert.equal(m.text, diagLine(d));
  assert.deepEqual(pick(m), { severity: 'warning', source: 'check', tool: 'HDLCompiler', location: { file: 'src/top.vhd', line: 4, col: 2 }, process: 'Check Syntax' });
  // (the console reads the line's location without its column: the interface's Check Syntax gives the diagnostic's)
  assert.deepEqual(consoleOf(m, ['src/top.vhd']).location, { file: 'src/top.vhd', line: 4 });
  assert.deepEqual(diagLocation(d), { file: 'src/top.vhd', line: 4, col: 2 });
  assert.equal(diagLocation({ file: 'a.v', line: 0 }), null);
  assert.equal(diagLocation(null), null);
  assert.equal(diagMessage({ ...d, severity: 'error' }).severity, 'error');
  assert.equal(diagMessage({ ...d, severity: 'info' }).severity, 'info');
  assert.equal(diagMessage({ ...d, line: 0 }).location, null);
});
