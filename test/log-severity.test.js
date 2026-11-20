// A tool's log line's severity (#4730, core/log-severity.js): the one classifier of the console, the process's count of
// warnings and the MCP's run_process, over real lines of ISE (XST, MAP, PAR, BitGen), Yosys, nextpnr, Vivado and the
// compilers (GHDL-style "f:l:c:", iverilog's "f:l:"); the MCP's processMessages and the console's message parser agree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { severityOf } from '../core/log-severity.js';
import { processMessages } from '../server/mcp-processes.js';
import { MESSAGE_LINE } from '../web/js/tool-descriptors.js';

const ERRORS = [
  'ERROR:HDLCompiler:806 - "top.vhd" Line 12: Syntax error near "end".',
  'ERROR:Xst:2585 - Port <led> of instance <u1> does not exist in definition <counter>.',
  'ERROR:Pack:198 - NCD was not produced. All logic was removed from the design.',
  'ERROR:Place:1018 - A clock IOB / clock component pair have been found that are not placed at an optimal clock IOB',
  'INTERNAL_ERROR:Xst:cmain.c:3423:1.56 -  Process will terminate.',
  'FATAL_ERROR:PhysDesignRules:Utilities.c:612:1.8 - Process will terminate.',
  'FATAL: the device database could not be read',
  'ERROR: Module `counter\' referenced in module `top\' in cell `u1\' is not part of the design.',   // Yosys
  'ERROR: Unable to place cell \'led_OBUF\', no BELs remaining to implement cell type \'IOB\'',          // nextpnr
  'ERROR: [Synth 8-439] module \'counterx\' not found [/p/src/top.v:12]',                              // Vivado
  'top.vhd:12:5: error: no declaration for "cnt"',                                                    // GHDL-style
  'top.v:7: error: Unknown module type: counterx',                                                    // iverilog
  'Error: the simulation stopped at 120 ns',
];
const WARNINGS = [
  'WARNING:Xst:647 - Input <sw<7>> is never used. This port will be preserved and left unconnected if it belongs to a top-level block.',
  'WARNING:Xst:737 - Found 1-bit latch for signal <q>.',
  'WARNING:PhysDesignRules:367 - The signal <sw<7>_IBUF> is incomplete.',
  'WARNING:Par:288 - The signal sw<7>_IBUF has no load.',
  'WARNING: the constraints file names no pin for led<3>',                                           // Silinx
  'Warning: Replacing memory \\mem with list of registers. See top.v:14',                             // Yosys
  'Warning: Identifier `x\' is implicitly declared at top.v:9.',                                      // Yosys
  'Warning: No clocks found in design',                                                              // nextpnr
  'CRITICAL WARNING: [Constraints 18-619] A clock with name \'clk\' already exists',                  // Vivado
  'WARNING: [Synth 8-3331] design top has unconnected port sw[7]',                                   // Vivado
  'top.v:3: warning: Port 2 (b) of and expects 1 bits, got 2.',                                      // iverilog
  'top.vhd:4:10: warning: signal "x" is never read',                                                 // GHDL-style
];
const INFO = [
  '=== SILINX STEP synth ===',
  'Process "Synthesize - XST" completed successfully',
  'Number of errors   :    0',
  'Number of warnings :    0 (0 filtered)',
  'Total REAL time to Xst completion: 3.00 secs',
  'Found 4-bit up counter for signal <cnt>.',
  '   Number of Slices:                      12  out of   2448    0%',
  'Info: Max frequency for clock \'clk\': 102.3 MHz (PASS at 50.00 MHz)',   // nextpnr
  'INFO: [Synth 8-6157] synthesizing module \'top\'',                       // Vivado
  '3.1. Executing PROC_CLEAN pass (remove empty switches from decision trees).',   // Yosys
  'Found and reported 0 problems.',
  'NOERROR: not a message',
  '',
];

test('severityOf: the errors of every tool, INTERNAL_ERROR and FATAL_ERROR included (#4730)', () => {
  for (const l of ERRORS) assert.equal(severityOf(l), 'error', l);
});
test('severityOf: the warnings of every tool, Yosys\'s and nextpnr\'s "Warning:", a compiler\'s "f:l: warning:" (#4730)', () => {
  for (const l of WARNINGS) assert.equal(severityOf(l), 'warning', l);
});
test('severityOf: report lines, information and the steps\' markers are neither', () => {
  for (const l of INFO) assert.equal(severityOf(l), null, l);
  assert.equal(severityOf(undefined), null);
});

test('run_process counts what the console counts: processMessages lists each line severityOf classes, in order (#4730)', () => {
  const log = [...INFO.slice(0, 3), ERRORS[4], WARNINGS[5], INFO[3], WARNINGS[6], ERRORS[5], WARNINGS[8], WARNINGS[10]];
  assert.deepEqual(processMessages(log), {
    errors: [ERRORS[4], ERRORS[5]],
    warnings: [WARNINGS[5], WARNINGS[6], WARNINGS[8], WARNINGS[10]],
    locations: [],   // (no project's paths: test/message-location.test.js, #4746)
  });
  assert.deepEqual(processMessages([]), { errors: [], warnings: [], locations: [] });
});

test('the console\'s message parser reads ISE\'s INTERNAL_ERROR and FATAL_ERROR with their tool (#4730)', () => {
  const m = MESSAGE_LINE.exec('INTERNAL_ERROR:Xst:cmain.c:3423:1.56 - Process will terminate.');
  assert.equal(m[1], 'INTERNAL_ERROR');
  const f = MESSAGE_LINE.exec('FATAL_ERROR:Map - out of memory');
  assert.deepEqual([f[1], f[2], f[3]], ['FATAL_ERROR', 'Map', 'out of memory']);
});

test('one classifier: the console, the process\'s count of warnings and the MCP use severityOf, no regular expression of their own (#4730)', () => {
  const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  for (const p of ['web/js/console.js', 'web/js/implement.js', 'server/mcp-processes.js', 'server/mcp-collab.js']) {
    const src = read(p);
    assert.match(src, /import \{ severityOf \} from '(\/|\.\.\/)core\/log-severity\.js';/, p);
    assert.doesNotMatch(src, /\/\^\\s\*\(CRITICAL \)\?WARNING|\/\^ERROR\/|\\bERROR:\/i|\\bWARNING:\/i/, p);
  }
});
