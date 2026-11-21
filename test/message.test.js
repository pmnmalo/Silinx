// The console's typed message (#4749, core/message.js): its fields and their values, a field out of its values its
// default, the console's classes and their severities; the
// sources are the console's filters' (web/js/messages.js: test/messages.test.js) and the application's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMessage, severityOfClass, consoleTime, SEVERITIES, MESSAGE_SOURCES } from '../core/message.js';

test('#4749 a message: its fields, a field out of its values its default', () => {
  const run = () => true;
  assert.deepEqual(makeMessage({ text: 'ERROR:HDLCompiler:806 - "top.vhd" Line 12: Syntax error', severity: 'error', source: 'impl',
    location: { file: 'src/top.vhd', line: 12, col: 5 }, action: { label: 'Trust Project', run }, process: 'Synthesize - XST', run: 'Started : "Synthesize - XST"', time: 1763700000000 }),
  { text: 'ERROR:HDLCompiler:806 - "top.vhd" Line 12: Syntax error', severity: 'error', source: 'impl', location: { file: 'src/top.vhd', line: 12, col: 5 },
    action: { label: 'Trust Project', run }, process: 'Synthesize - XST', run: 'Started : "Synthesize - XST"', time: 1763700000000 });
  assert.deepEqual(makeMessage(), { text: '', severity: 'text', source: 'app', location: null, action: null, process: null, run: null, time: null });
  // (out of their values: their defaults)
  const m = makeMessage({ text: 7, severity: 'fatal', source: 'x', location: { file: 'a.vhd', line: 0 }, action: { run }, process: '', run: 3, time: -1 });
  assert.deepEqual(m, { text: '7', severity: 'text', source: 'app', location: null, action: null, process: null, run: null, time: null });
  assert.equal(makeMessage({ time: NaN }).time, null);
  assert.equal(makeMessage({ time: '5' }).time, null);
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


test('#5035 a message\'s time as the console shows it: the hour of today, the day and month too of another day', () => {
  // (the computer's local time: built from local fields, whatever the time zone the tests run in)
  const at = (y, mo, d, h, mi, se) => new Date(y, mo - 1, d, h, mi, se).getTime();
  const now = at(2026, 11, 21, 14, 3, 30);
  assert.equal(consoleTime(at(2026, 11, 21, 14, 3, 27), now), '14:03:27');
  assert.equal(consoleTime(at(2026, 11, 21, 0, 0, 0), now), '00:00:00');
  assert.equal(consoleTime(at(2026, 11, 20, 23, 58, 1), now), '20/11 23:58:01');   // (yesterday, a minute before midnight)
  assert.equal(consoleTime(at(2025, 11, 21, 14, 3, 27), now), '21/11 14:03:27');   // (the same day and month a year before)
  assert.equal(consoleTime(at(2026, 1, 5, 9, 7, 3), now), '05/01 09:07:03');
  assert.equal(consoleTime(at(2026, 11, 22, 0, 0, 1), now), '22/11 00:00:01');     // (a follower's owner already in tomorrow)
  for (const bad of [null, undefined, NaN, Infinity, '14:00']) assert.equal(consoleTime(bad, now), '', String(bad));
  assert.match(consoleTime(Date.now()), /^\d\d:\d\d:\d\d$/);   // (now: today's)
});
