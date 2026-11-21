// A job's lines with the time each was written (#5035, server/jobs.js): `times` beside `lines`, one each, a line split
// in several sharing its time, in order; the MCP's run_process gives the run's start and end and each line's time to a
// shared project's followers (server/mcp-processes.js, server/mcp-collab.js sharedRun).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createJob, getJob } from '../server/jobs.js';

test('#5035 a job\'s lines each with its time, a line split in several sharing it, in order', async () => {
  const before = Date.now();
  const job = createJob('test-times', async (j) => {
    j.log('first');
    j.log('second\nthird');
    await new Promise((r) => setTimeout(r, 15));
    j.log('fourth');
  });
  while (getJob(job.id).status === 'running') await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(job.lines, ['first', 'second', 'third', 'fourth']);
  assert.equal(job.times.length, job.lines.length);
  assert.ok(job.times.every((t) => Number.isSafeInteger(t) && t >= before && t <= Date.now()), String(job.times));
  assert.equal(job.times[1], job.times[2], 'a line split: its parts share its time');
  assert.ok(job.times[3] - job.times[0] >= 10, 'later lines, later times');
  assert.ok(job.times.every((t, i) => i === 0 || t >= job.times[i - 1]), 'in order');
});

test('#5035 run_process: the run\'s start and end; a shared project\'s followers get each line\'s time', () => {
  const read = (f) => fs.readFileSync(new URL(`../server/${f}`, import.meta.url), 'utf8');
  const proc = read('mcp-processes.js');
  assert.match(proc, /times: job\.times\.slice\(\), startedAt: job\.startedAt, endedAt:/);
  assert.match(proc, /data: \{ project: name, process: proc, toolchain: tc, ok, startedAt, endedAt,/);
  assert.match(proc, /sharedRun\(name, \{ steps: PROCESSES\[proc\], ok, warnings, lines, times \}\)/);
  assert.match(read('mcp-collab.js'), /lines\.map\(\(l, i\) => \[redact\(l, secrets\), [^\n]*?'impl', times\[i\] \|\| Date\.now\(\)\]\)/);
});
