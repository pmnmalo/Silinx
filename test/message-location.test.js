// A tool's message's file and line (#4746, core/message-location.js): ISE's, Vivado's, NgdBuild's and the compilers'
// forms, over real lines; what is no location (a time, an address, ISE's own C sources' "Xst:cmain.c:3423"); the
// project's path of the file a tool named; the MCP's run_process returning them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageLocation, projectPath } from '../core/message-location.js';
import { processMessages } from '../server/mcp-processes.js';

test('each tool\'s form: its file and line (and column) (#4746)', () => {
  const cases = [
    ['ERROR:HDLCompiler:806 - "/work/pj/src/top.vhd" Line 12: Syntax error near "end".', { file: '/work/pj/src/top.vhd', line: 12 }],
    ['WARNING:Xst:2211 - "top.v" line 7: Instantiating black box module <counterx>.', { file: 'top.v', line: 7 }],
    ['ERROR:HDLParsers:164 - "C:/pj/src/top.vhd" Line 30. parse error, unexpected END', { file: 'C:/pj/src/top.vhd', line: 30 }],
    ['ERROR: [Synth 8-439] module \'counterx\' not found [/p/src/top.v:12]', { file: '/p/src/top.v', line: 12 }],
    ['CRITICAL WARNING: [Constraints 18-619] A clock with name \'clk\' already exists [/p/src/basys3.xdc:3]', { file: '/p/src/basys3.xdc', line: 3 }],
    ['ERROR:ConstraintSystem:59 - Constraint <NET "led<9>" LOC = P12;> [top.ucf(3)]: NET "led<9>" not found.', { file: 'top.ucf', line: 3 }],
    ['top.vhd:12:5: error: no declaration for "cnt"', { file: 'top.vhd', line: 12, col: 5 }],
    ['src/top.v:7: error: Unknown module type: counterx', { file: 'src/top.v', line: 7 }],
    ['Warning: Replacing memory \\mem with list of registers. See top.v:14', { file: 'top.v', line: 14 }],
    ['ERROR: count.c:4: \'x\' undeclared', { file: 'count.c', line: 4 }],
    ['WARNING: the pin P12 of pins.lpf:9 is taken', { file: 'pins.lpf', line: 9 }],
  ];
  for (const [text, want] of cases) assert.deepEqual(messageLocation(text), want, text);
});

test('no location: a time, an address, a version, a line 0, nothing (#4746)', () => {
  for (const text of ['ERROR: the run stopped at 12:30', 'WARNING: cannot reach host:22', 'INFO: Release 14.7 - xst P.20131013',
    'ERROR: "top.vhd" Line 0: what', 'ERROR:Pack:198 - NCD was not produced.', '', 'top.vhd: error', 'top:12: error'])
    assert.equal(messageLocation(text), null, text);
  assert.equal(messageLocation(undefined), null);
  // (ISE's own source, after the tool's name: none)
  assert.equal(messageLocation('INTERNAL_ERROR:Xst:cmain.c:3423:1.56 - Process will terminate.'), null);
});

test('the project\'s path of the file a tool named: the same, a path ending with it, the only one of its name (#4746)', () => {
  const paths = ['src/top.vhd', 'src/counter.vhd', 'sim/tb_top.vhd', 'src/a/util.vhd', 'src/b/util.vhd', 'top.ucf'];
  assert.equal(projectPath('src/top.vhd', paths), 'src/top.vhd');
  assert.equal(projectPath('./src/top.vhd', paths), 'src/top.vhd');
  assert.equal(projectPath('/work/Silinx/pj/src/top.vhd', paths), 'src/top.vhd');
  assert.equal(projectPath('C:\\pj\\sim\\tb_top.vhd', paths), 'sim/tb_top.vhd');
  assert.equal(projectPath('counter.vhd', paths), 'src/counter.vhd');
  assert.equal(projectPath('/remote/build/top.ucf', paths), 'top.ucf');
  assert.equal(projectPath('/x/src/b/util.vhd', paths), 'src/b/util.vhd');   // (the longer path ending it)
  assert.equal(projectPath('util.vhd', paths), null);   // (two of that name: neither)
  assert.equal(projectPath('cmain.c', paths), null);
  assert.equal(projectPath('', paths), null);
  assert.equal(projectPath(null, paths), null);
  assert.equal(projectPath('top.vhd', []), null);
});

test('run_process\'s locations: the errors\' and warnings\' that name a file of the project, as the Errors tab (#4746)', () => {
  const lines = [
    'Started : "Synthesize - XST".',
    'ERROR:HDLCompiler:806 - "/remote/pj/src/top.vhd" Line 12: Syntax error near "end".',
    'WARNING:Xst:647 - Input <sw<7>> is never used.',
    'WARNING: [Synth 8-3331] design top has unconnected port sw[7] [/p/src/counter.vhd:9]',
    'INTERNAL_ERROR:Xst:cmain.c:3423:1.56 - Process will terminate.',
  ];
  assert.deepEqual(processMessages(lines, ['src/top.vhd', 'src/counter.vhd']).locations, [
    { severity: 'error', text: lines[1], file: 'src/top.vhd', line: 12 },
    { severity: 'warning', text: lines[3], file: 'src/counter.vhd', line: 9 },
  ]);
  assert.deepEqual(processMessages(lines).locations, []);   // (no project's paths: none)
});

test('#5933 an assembly program\'s messages: an AVR .asm\'s, a PIC24\'s .s and .S, by file and line', () => {
  assert.deepEqual(messageLocation('ERROR: uno/hello.asm:2: no instruction frob'), { file: 'uno/hello.asm', line: 2 });
  assert.deepEqual(messageLocation('WARNING: pic/main.s:14: a warning'), { file: 'pic/main.s', line: 14 });
  assert.deepEqual(messageLocation('ERROR: core/wiring_pulse.S:7:3: oops'), { file: 'core/wiring_pulse.S', line: 7, col: 3 });
  assert.equal(messageLocation('it took 12:30 s'), null);
});
