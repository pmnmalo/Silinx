// The processes a shared project's owner runs, as its followers follow them (#4002, part 2: core/collab-runs.js): the
// `runs` value (the marks, the run's lines kept from its end within the limits, the Design Summary), the `reports`
// value (a report too large left out, a path of no report's refused), both taken back as untrusted input; the owner's
// computer's names redacted; the runs in words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUN_LIMITS, runSecrets, redact, runsActivity, followedRuns, reportsActivity, followedReports, reportPath, runLines } from '../core/collab-runs.js';

test('redact: the ISE host reached over SSH and the home folder of the configuration replaced, longest first; nothing without them', () => {
  const s = runSecrets({ config: { ssh: { user: 'ana', host: 'ise.example.org' } }, configPath: '/Users/ana/Library/Application Support/Silinx/config.json' });
  assert.deepEqual(s, [['ise.example.org', '<ISE host>'], ['ana@ise.example.org', '<ISE host>'], ['/Users/ana', '~']].sort((a, b) => b[0].length - a[0].length));
  assert.equal(redact('ssh ana@ise.example.org: /Users/ana/ws/p/build/top.syr on ise.example.org', s), 'ssh <ISE host>: ~/ws/p/build/top.syr on <ISE host>');
  assert.deepEqual(runSecrets({ configPath: 'C:\\Users\\Rui\\AppData\\silinx\\config.json' }), [['C:\\Users\\Rui', '~']]);
  assert.deepEqual(runSecrets({ configPath: '/home/rui/.config/silinx/config.json' }), [['/home/rui', '~']]);
  assert.deepEqual(runSecrets(null), []);
  assert.equal(redact('nothing to hide', []), 'nothing to hide');
});

test('runs: the marks of the processes (others left out), the lines kept from the run\'s end, the summary when small enough', () => {
  const lines = Array.from({ length: 30 }, (_, i) => [`line ${i}`, i % 2 ? 'warn' : '']);
  const v = runsActivity({ id: 3, status: { synth: 'ok', map: 'warn', 'sim-run': 'running', impl: null, Bad: 'ok', par: 'great' }, lines, summary: { top: 'top' } }, { ...RUN_LIMITS, lines: 10 });
  assert.equal(v.id, 3);
  assert.deepEqual(v.status, { synth: 'ok', map: 'warn', 'sim-run': 'running' });
  assert.equal(v.from, 20);
  assert.deepEqual(v.lines, lines.slice(20));
  assert.deepEqual(v.summary, { top: 'top' });
  // (the bytes' limit, a line's length, a class of no line's)
  const b = runsActivity({ lines: [['x'.repeat(50), 'hdr'], ['y'.repeat(5000), 'bogus'], ['z', 'ok']] }, { ...RUN_LIMITS, line: 100, linesBytes: 120 });
  assert.deepEqual(b.lines, [['y'.repeat(100), ''], ['z', 'ok']]);
  assert.equal(b.from, 1);
  assert.equal(runsActivity({ summary: { big: 'x'.repeat(RUN_LIMITS.summary) } }).summary, null, 'a summary too large: none');
  assert.deepEqual(runsActivity({}), { id: 0, status: {}, from: 0, lines: [], summary: null });
});

test('runs taken back: what is not one left out; not one at all: null', () => {
  assert.deepEqual(followedRuns({ id: 2, status: { synth: 'ok', x: 'nope', 'A': 'ok' }, from: 5, lines: [['a', 'err'], 'b', [7, ''], ['c', '<script>']], summary: [1] }),
    { id: 2, status: { synth: 'ok' }, from: 5, lines: [['a', 'err'], ['c', '']], summary: null });
  for (const bad of [null, 'x', [], { id: -1 }, { id: 1.5 }, { status: {} }]) assert.equal(followedRuns(bad), null, JSON.stringify(bad));
  assert.deepEqual(followedRuns({ id: 0, from: -3 }), { id: 0, status: {}, from: 0, lines: [], summary: null });
  const v = runsActivity({ id: 1, status: { synth: 'ok' }, lines: [['Started : "Synthesize".', 'hdr']], summary: { top: 't' } });
  assert.deepEqual(followedRuns(v), v, 'the owner\'s value taken as it is');
});

test('reports: a report of the build by its path, one too large or past the total left out (null); a path of no report\'s refused', () => {
  for (const p of ['build/top.syr', 'build/open/top_stat.txt', 'build/a-b/c.d.e']) assert.equal(reportPath(p), true, p);
  for (const p of ['src/top.vhd', 'build/../x', 'build/.hidden', 'build/', 'build', '/build/x', 'build/a/b/c/d/e', 7, null]) assert.equal(reportPath(p), false, String(p));
  const v = reportsActivity([['build/a.syr', 'a'.repeat(10)], ['build/b.par', 'b'.repeat(30)], ['build/c.twr', 'c'.repeat(15)], ['src/x.vhd', 'x'], ['build/d.bgn', 5]], { ...RUN_LIMITS, report: 20, reports: 30 });
  assert.deepEqual(v, { files: { 'build/a.syr': 'a'.repeat(10), 'build/b.par': null, 'build/c.twr': 'c'.repeat(15) } });
  assert.deepEqual(followedReports(v), v);
  assert.deepEqual(followedReports({ files: { 'build/x.syr': 'ok', '../etc': 'no', 'build/y': 3, 'build/z': null } }), { files: { 'build/x.syr': 'ok', 'build/z': null } });
  for (const bad of [null, {}, { files: [] }, { files: 'x' }]) assert.equal(followedReports(bad), null);
});

test('the runs in words: the marks, the end of the log', () => {
  const v = runsActivity({ id: 1, status: { synth: 'ok', map: 'err' }, lines: Array.from({ length: 12 }, (_, i) => [`l${i}`, '']) });
  assert.deepEqual(runLines(v, 2), ['Their processes: synth ok, map err.', 'The end of their last run\'s log:', '  l10', '  l11']);
  assert.deepEqual(runLines(runsActivity({})), []);
  assert.deepEqual(runLines(null), []);
});
