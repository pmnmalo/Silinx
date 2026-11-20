// The console's typed message (#4749, core/message.js): its fields and their values, a field out of its values its
// default, the console's classes and their severities; the
// sources are the console's filters' (web/js/messages.js: test/messages.test.js) and the application's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMessage, severityOfClass, SEVERITIES, MESSAGE_SOURCES } from '../core/message.js';

test('#4749 a message: its fields, a field out of its values its default', () => {
  const run = () => true;
  assert.deepEqual(makeMessage({ text: 'ERROR:HDLCompiler:806 - "top.vhd" Line 12: Syntax error', severity: 'error', source: 'impl',
    location: { file: 'src/top.vhd', line: 12, col: 5 }, action: { label: 'Trust Project', run }, process: 'Synthesize - XST', run: 'Started : "Synthesize - XST"' }),
  { text: 'ERROR:HDLCompiler:806 - "top.vhd" Line 12: Syntax error', severity: 'error', source: 'impl', location: { file: 'src/top.vhd', line: 12, col: 5 },
    action: { label: 'Trust Project', run }, process: 'Synthesize - XST', run: 'Started : "Synthesize - XST"' });
  assert.deepEqual(makeMessage(), { text: '', severity: 'text', source: 'app', location: null, action: null, process: null, run: null });
  // (out of their values: their defaults)
  const m = makeMessage({ text: 7, severity: 'fatal', source: 'x', location: { file: 'a.vhd', line: 0 }, action: { run }, process: '', run: 3 });
  assert.deepEqual(m, { text: '7', severity: 'text', source: 'app', location: null, action: null, process: null, run: null });
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

