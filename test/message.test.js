// The console's typed message (#4749, core/message.js): its fields and their values, a field out of its values its
// default, the console's classes and their severities; the
// sources are the console's filters' (web/js/messages.js: test/messages.test.js) and the application's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMessage, severityOfClass, lineMessage, entryOf, SEVERITIES, MESSAGE_SOURCES } from '../core/message.js';

test('#4749 a message: its fields, a field out of its values its default', () => {
  const run = () => true;
  assert.deepEqual(makeMessage({ text: 'ERROR:HDLCompiler:806 - "top.vhd" Line 12: Syntax error', severity: 'error', source: 'impl',
    location: { file: 'src/top.vhd', line: 12, col: 5 }, action: { label: 'Trust Project', run }, process: 'Synthesize - XST', run: 'Started : "Synthesize - XST"' }),
  { text: 'ERROR:HDLCompiler:806 - "top.vhd" Line 12: Syntax error', severity: 'error', source: 'impl', tool: null, location: { file: 'src/top.vhd', line: 12, col: 5 },
    action: { label: 'Trust Project', run }, process: 'Synthesize - XST', run: 'Started : "Synthesize - XST"' });
  assert.deepEqual(makeMessage(), { text: '', severity: 'text', source: 'app', tool: null, location: null, action: null, process: null, run: null });
  // (out of their values: their defaults)
  const m = makeMessage({ text: 7, severity: 'fatal', source: 'x', tool: 5, location: { file: 'a.vhd', line: 0 }, action: { run }, process: '', run: 3 });
  assert.deepEqual(m, { text: '7', severity: 'text', source: 'app', tool: null, location: null, action: null, process: null, run: null });
  assert.equal(makeMessage({ location: { file: '', line: 3 } }).location, null);
  assert.deepEqual(makeMessage({ location: { file: 'a.v', line: 3, col: 0 } }).location, { file: 'a.v', line: 3 });
});

test('#4749 the console\'s classes and their severities; the sources the filters\' and the application\'s', () => {
  const pairs = [['err', 'error'], ['warn', 'warning'], ['info', 'info'], ['ok', 'ok'], ['hdr', 'header'], ['', 'text']];
  for (const [c, s] of pairs) assert.equal(severityOfClass(c), s, c);
  assert.equal(severityOfClass('bogus'), 'text');
  assert.equal(severityOfClass(undefined), 'text');
  assert.deepEqual([...SEVERITIES].sort(), pairs.map(([, s]) => s).sort());
  assert.deepEqual(MESSAGE_SOURCES, ['check', 'sim', 'emu', 'impl', 'app']);   // (the filters' own: test/messages.test.js)
});


const PATHS = ['src/top.vhd', 'src/counter.v'];

test('#4749 lineMessage: a tool\'s line, its severity its prefix\'s, its tool, its location from its text', () => {
  const m = lineMessage('ERROR:HDLCompiler:806 - "/work/proj/src/top.vhd" Line 12: Syntax error near "end".', { cls: 'err', source: 'impl', paths: PATHS, process: 'Synthesize - XST', run: 'Started : "Synthesize - XST"' });
  assert.deepEqual(m, { text: 'ERROR:HDLCompiler:806 - "/work/proj/src/top.vhd" Line 12: Syntax error near "end".', severity: 'error', source: 'impl', tool: 'HDLCompiler:806',
    location: { file: 'src/top.vhd', line: 12 }, action: null, process: 'Synthesize - XST', run: 'Started : "Synthesize - XST"' });
  // (a compiler's form, its column; a warning's prefix written as an error: a warning; none: the class's)
  assert.deepEqual(lineMessage('WARNING: counter.v:7:3: unused wire w', { cls: 'err', paths: PATHS }).location, { file: 'src/counter.v', line: 7, col: 3 });
  assert.equal(lineMessage('WARNING: counter.v:7:3: unused wire w', { cls: 'err', paths: PATHS }).severity, 'warning');
  assert.equal(lineMessage('CRITICAL WARNING:Vivado 12-1 - x', { cls: 'err' }).severity, 'warning');
  assert.equal(lineMessage('FATAL_ERROR:Map - out of memory', { cls: 'warn' }).severity, 'error');
  assert.equal(lineMessage('ERROR: no tool', { cls: 'info' }).severity, 'info');   // (an information's line: never an entry)
  assert.equal(lineMessage('Process "Synthesize - XST" failed', { cls: 'err' }).tool, null);
  // (a file the project has not, or none given: no location; a writer's own: kept, whatever the text names)
  assert.equal(lineMessage('ERROR: other.vhd:3: x', { cls: 'err', paths: PATHS }).location, null);
  assert.equal(lineMessage('ERROR: top.vhd:3: x', { cls: 'err' }).location, null);
  assert.deepEqual(lineMessage('ERROR: top.vhd:3: x', { cls: 'err', paths: PATHS, location: { file: 'src/counter.v', line: 9 } }).location, { file: 'src/counter.v', line: 9 });
  assert.equal(lineMessage(42).text, '42');
});

test('#4749 entryOf: an error\'s or a warning\'s entry made from its message; the others none', () => {
  const run = () => true, action = { label: 'Trust Project', trust: 'p', run };
  const e = entryOf(lineMessage('ERROR:HDLCompiler:806 - "src/top.vhd" Line 12: Syntax error', { cls: 'err', source: 'impl', paths: PATHS, run: 'r1', action }));
  assert.deepEqual(e, { severity: 'error', tool: 'HDLCompiler:806', message: '"src/top.vhd" Line 12: Syntax error', file: 'src/top.vhd', line: 12, inText: true, src: 'impl', run: 'r1', action });
  // (no tool: Silinx's; a writer's location, not in the text; a column)
  assert.deepEqual(entryOf(lineMessage('  an assertion failed ', { cls: 'warn', source: 'sim', location: { file: 'src/counter.v', line: 4, col: 2 } })),
    { severity: 'warning', tool: 'Silinx', message: 'an assertion failed', file: 'src/counter.v', line: 4, col: 2, inText: false, src: 'sim', run: null, action: null });
  assert.equal(entryOf(lineMessage('WARNING: plain', { cls: 'warn' })).message, 'plain');
  assert.equal(entryOf(lineMessage('ERROR:Par - ', { cls: 'err' })), null);   // (an empty message)
  // (the scripts' marker; an information, a header, a line: none)
  assert.equal(entryOf(lineMessage('=== SILINX FAILED map', { cls: 'err' })), null);
  for (const cls of ['info', 'ok', 'hdr', '']) assert.equal(entryOf(lineMessage('ERROR: x', { cls })), null, cls);
});
