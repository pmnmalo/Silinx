// web/js/job-log.js (#4597): a job's lines for the console, its error said once. A failed job's last line, its error as
// the job logs it ("ERROR: <error>", server/jobs.js and the browser edition's), is left to the operation's "… failed:"
// line; every other line is shown, in order: a tool's output, an ERROR line that is not the job's error (held back
// only until the next line), a job that ends well or with no error, a job followed no further (end with no result).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobLog } from '../web/js/job-log.js';

const run = (lines, result) => {
  const out = [];
  const jl = jobLog(l => out.push(l));
  for (const l of lines) jl.line(l);
  jl.end(result);
  return out;
};

test('a failed job: its last line, its error, left to the operation\'s line', () => {
  assert.deepEqual(run(['ERROR: no WebUSB'], { status: 'error', error: 'no WebUSB' }), []);
  assert.deepEqual(run(['Scanning...', 'djtgcfg: cable not found', 'ERROR: djtgcfg exited 1'], { status: 'error', error: 'djtgcfg exited 1' }),
    ['Scanning...', 'djtgcfg: cable not found']);
});

test('every other line shown, in order', () => {
  // an ERROR line of the tool's, then more lines: shown where it came
  assert.deepEqual(run(['a', 'ERROR: the tool said so', 'b', 'ERROR: failed'], { status: 'error', error: 'failed' }), ['a', 'ERROR: the tool said so', 'b']);
  // two ERROR lines in a row: the first shown when the second comes
  assert.deepEqual(run(['ERROR: one', 'ERROR: two'], { status: 'error', error: 'two' }), ['ERROR: one']);
  // the last ERROR line not the job's error: shown
  assert.deepEqual(run(['ERROR: the tool\'s'], { status: 'error', error: 'something else' }), ['ERROR: the tool\'s']);
  // a job that ended well, or with no error said: every line
  assert.deepEqual(run(['ok', 'ERROR: x'], { status: 'ok', error: null }), ['ok', 'ERROR: x']);
  assert.deepEqual(run(['ERROR: x'], { status: 'error' }), ['ERROR: x']);
  // followed no further (followJob threw): what was held shown
  assert.deepEqual(run(['ERROR: x'], undefined), ['ERROR: x']);
  // "ERROR:" with no space (an ISE-style message) is a line as any other
  assert.deepEqual(run(['ERROR:Silinx - x'], { status: 'error', error: 'Silinx - x' }), ['ERROR:Silinx - x']);
  assert.deepEqual(run([], { status: 'error', error: 'x' }), []);
});
