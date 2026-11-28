// The unit tests in parts of about the same time (#573), and the UI tests (#912): scripts/test-shard.mjs, the
// reporter of each file's time (scripts/test-times-reporter.mjs) and the timings refreshed from CI
// (scripts/update-test-timings.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testFiles, unitFiles, UNIT_DIRS, UNIT_TESTS, HEAVY, weights, balance, parseShard, readTimings, TIMINGS } from '../scripts/test-shard.mjs';
import { merge, readParts } from '../scripts/update-test-timings.mjs';
import { addFileTime } from '../scripts/test-times-reporter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-test-shard-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

test('test shard: i/n parsed, out of range refused', () => {
  assert.deepEqual(parseShard('1/4'), { i: 1, n: 4 });
  assert.deepEqual(parseShard('4/4'), { i: 4, n: 4 });
  for (const bad of ['0/4', '5/4', '1/0', '1', '', undefined, 'a/b', '1/4/2'])
    assert.throws(() => parseShard(bad), /^Error: the part as i\/n, 1 ≤ i ≤ n: /, String(bad));
});

test('test shard: a file not measured weighs the median of the measured ones; none measured: 1 each', () => {
  assert.deepEqual(weights(['a', 'b', 'c', 'd'], { a: 10, b: 2, c: 4, x: 99 }), { a: 10, b: 2, c: 4, d: 4 });
  assert.deepEqual(weights(['a', 'b'], { a: 3, b: 5 }), { a: 3, b: 5 });
  assert.deepEqual(weights(['a', 'b', 'c'], { a: 3, b: 5, c: 'x' }), { a: 3, b: 5, c: 3 }, 'a value that is not a time: the median');
  assert.deepEqual(weights(['a', 'b'], {}), { a: 1, b: 1 });
});

test('test shard: the heaviest first into the lightest part; every file in one part only; deterministic', () => {
  const w = { a: 16, b: 10, c: 9, d: 7, e: 6, f: 5, g: 3, h: 1 };
  const parts = balance(Object.keys(w).reverse(), w, 3);
  // a 16; b 10; c 9; d into c's (16); e into b's (16); f, g, h each into the first of the lightest
  assert.deepEqual(parts.map(p => p.files), [['a', 'f'], ['b', 'e', 'g'], ['c', 'd', 'h']]);
  assert.deepEqual(parts.map(p => p.time), [21, 19, 17]);
  assert.deepEqual(balance(Object.keys(w), w, 3), parts, 'the order given does not matter');
  // as many parts as files, more parts than files, one part
  assert.deepEqual(balance(['x', 'y'], { x: 1, y: 1 }, 2).map(p => p.files), [['x'], ['y']]);
  assert.deepEqual(balance(['x'], { x: 1 }, 3).map(p => p.files), [['x'], [], []]);
  assert.deepEqual(balance(['y', 'x'], { x: 1, y: 2 }, 1).map(p => p.files), [['x', 'y']]);
  for (const n of [0, 1.5, -1]) assert.throws(() => balance(['x'], { x: 1 }, n), /the number of parts must be a whole number from 1/);
});

// #3124: the toolchain's heaviest unit tests, on Linux only in CI (macOS and Windows: --light): test files that exist, sorted;
// about half the unit tests' time, none of the open flow's smoke test (blinky to a bitstream) nor a file over a part's time
test('test shard: the heaviest unit tests (HEAVY): existing files, about half the time, the smoke test left in', () => {
  const files = unitFiles(), t = readTimings();
  assert.deepEqual(HEAVY, [...new Set(HEAVY)].sort(), 'sorted, each once');
  for (const f of HEAVY) assert.ok(files.includes(f), `${f}: not a unit test file`);
  for (const f of ['test/open-flow.test.js', 'test/s6-devices.test.js', 'test/ice40.test.js', 'test/mcp-link.test.js']) assert.ok(!HEAVY.includes(f), f);
  const w = weights(files, t), sum = l => l.reduce((s, f) => s + w[f], 0);
  const share = sum(HEAVY) / sum(files);
  assert.ok(share > 0.4 && share < 0.7, `${Math.round(share * 100)}% of the time`);
  // every file within a fifteen minutes' budget but the few that hold one long test (#566, scripts/test-file-times.mjs)
  for (const f of ['test/open-flow.test.js', 'test/sim-model-par.test.js']) assert.ok(w[f] < 15 * 60, `${f}: ${w[f]} s, split it (#3124)`);
});

// the parts of the repository's files by its timings: within a fifth of each other, or the longest file's time
function assertBalanced(files, t, n) {
  const w = weights(files, t);
  const parts = balance(files, w, n);
  assert.deepEqual(parts.flatMap(p => p.files).sort(), files, 'every file once');
  const longest = Math.max(...Object.values(w));
  const [lo, hi] = [Math.min(...parts.map(p => p.time)), Math.max(...parts.map(p => p.time))];
  assert.ok(hi <= Math.max(lo * 1.2, longest + lo * 0.2), `parts ${parts.map(p => Math.round(p.time)).join(' / ')} s`);
}

test('test shard: the repository\'s timings — measured files that exist, in seconds; the unit tests\' parts (five on Linux, three but the heaviest on macOS and Windows) and each interface\'s three UI parts within a fifth of each other or one file long', () => {
  // the unit tests: the IDE's and the toolchain package's (#1680)
  const files = unitFiles(), uiFiles = testFiles(ROOT, 'test/ui');
  assert.deepEqual(UNIT_DIRS, ['test', 'packages/silinx-fpga/test']);
  assert.ok(files.length > 100 && files.every(f => UNIT_TESTS.test(f)), String(files.length));
  assert.deepEqual(files, [...testFiles(), ...testFiles(ROOT, 'packages/silinx-fpga/test')].sort());
  assert.ok(files.includes('packages/silinx-fpga/test/fpga-hard.test.js') && files.includes('test/flow-ide.test.js'));
  assert.ok(!files.includes('packages/silinx-fpga/test/fpga-sim.js'), 'test files only');
  assert.ok(uiFiles.length > 50 && uiFiles.every(f => /^test\/ui\/[\w.-]+\.test\.js$/.test(f)), String(uiFiles.length));
  assert.ok(!uiFiles.includes('test/ui/harness.js'), 'test files only');
  for (const l of [files, uiFiles]) assert.deepEqual(l, [...l].sort());
  const t = readTimings();
  const keys = Object.keys(t);
  for (const [l, what] of [[files, 'unit'], [uiFiles, 'UI']]) {
    const n = l.filter(f => f in t).length;
    assert.ok(n >= l.length * 0.8, `${n} of ${l.length} ${what} files measured (node scripts/update-test-timings.mjs <run id>)`);
  }
  const usFiles = testFiles(ROOT, 'test/usability');
  for (const f of keys) {
    assert.ok(files.includes(f) || uiFiles.includes(f) || usFiles.includes(f), `${TIMINGS}: ${f} is not a test file any more`);
    assert.ok(typeof t[f] === 'number' && t[f] >= 0, `${f}: ${t[f]}`);
  }
  assert.deepEqual(keys, [...keys].sort(), 'sorted (a refresh changes only the times)');
  assertBalanced(files, t, 6);   // (CI's six parts on Linux)
  assertBalanced(files.filter(f => !HEAVY.includes(f)), t, 3);
  assertBalanced(uiFiles, t, 5);   // (CI's five parts per interface, #5836; four since #4463)
  // a UI file not measured weighs the UI files' median, not the unit files'
  const w = weights([...uiFiles, 'test/ui/new.test.js'], t);
  const ui = uiFiles.map(f => t[f]).filter(v => v != null).sort((a, b) => a - b);
  assert.equal(w['test/ui/new.test.js'], ui[Math.floor((ui.length - 1) / 2)]);
});

test('test shard: the command line — the dry run lists the parts, a part runs its files with node --test, a bad part refused', (t) => {
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/test-shard.mjs'), ...a], { cwd: ROOT, encoding: 'utf8' });
  const dry = run('1/4', '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(dry.stderr, '', 'no warnings');
  const lines = dry.stdout.trim().split('\n');
  assert.equal(lines.length, 4);
  lines.forEach((l, k) => assert.match(l, new RegExp(`^${k + 1}/4: \\d+ files, ~\\d+ min$`)));
  assert.equal(lines.reduce((s, l) => s + Number(/: (\d+) files/.exec(l)[1]), 0), unitFiles().length);
  // --light (#3124): the parts of the unit tests but HEAVY
  const light = run('1/3', '--light', '--dry-run');
  assert.equal(light.status, 0, light.stderr);
  assert.equal(light.stderr, '', 'no warnings');
  const lightLines = light.stdout.trim().split('\n');
  assert.equal(lightLines.length, 3);
  assert.equal(lightLines.reduce((s, l) => s + Number(/: (\d+) files/.exec(l)[1]), 0), unitFiles().filter(f => !HEAVY.includes(f)).length);
  // the UI tests' parts (#912): every UI file in one of them
  const uiDry = run('2/4', '--ui', '--dry-run');
  assert.equal(uiDry.status, 0, uiDry.stderr);
  assert.equal(uiDry.stderr, '', 'no warnings');
  const uiLines = uiDry.stdout.trim().split('\n');
  assert.equal(uiLines.length, 4);
  uiLines.forEach((l, k) => assert.match(l, new RegExp(`^${k + 1}/4: \\d+ files, ~\\d+ min$`)));
  assert.equal(uiLines.reduce((s, l) => s + Number(/: (\d+) files/.exec(l)[1]), 0), testFiles(ROOT, 'test/ui').length);
  const bad = run('5/4');
  assert.equal(bad.status, 2);
  assert.equal(bad.stdout, '');
  assert.equal(bad.stderr, 'the part as i/n, 1 ≤ i ≤ n: 5/4\n');
  // a part's run: in a copy with three test files, one of which fails; its status is node --test's
  const dir = tmp(t);
  fs.mkdirSync(path.join(dir, 'scripts')); fs.mkdirSync(path.join(dir, 'test'));
  for (const f of ['test-shard.mjs', 'test-times-reporter.mjs']) fs.copyFileSync(path.join(ROOT, 'scripts', f), path.join(dir, 'scripts', f));
  fs.writeFileSync(path.join(dir, 'test', 'a.test.js'), "import { test } from 'node:test'; test('a', () => {});\n");
  fs.writeFileSync(path.join(dir, 'test', 'b.test.js'), "import { test } from 'node:test'; test('b', () => { throw new Error('b fails'); });\n");
  fs.writeFileSync(path.join(dir, 'test', 'c.test.js'), "import { test } from 'node:test'; test('c1', () => {}); test('c2', () => {});\n");
  fs.writeFileSync(path.join(dir, 'test', 'timings.json'), JSON.stringify({ 'test/a.test.js': 1, 'test/b.test.js': 5, 'test/c.test.js': 3 }));
  // (without NODE_TEST_CONTEXT, which this test's own runner sets: with it a node --test reports to its
  // parent runner and ends 0)
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const part = (i) => spawnSync(process.execPath, ['scripts/test-shard.mjs', `${i}/2`, '--test-reporter=tap', '--test-reporter-destination=stdout',
    '--test-reporter=./scripts/test-times-reporter.mjs', `--test-reporter-destination=times-${i}.json`], { cwd: dir, encoding: 'utf8', env });
  const p1 = part(1), p2 = part(2);
  assert.match(p1.stdout, /^unit tests, part 1\/2: 1 of 3 files, ~0 min measured\n/);
  assert.equal(p1.status, 1, 'b fails');
  assert.match(p1.stdout, /^not ok 1 - b$/m);
  assert.match(p2.stdout, /^unit tests, part 2\/2: 2 of 3 files, ~0 min measured\n/);
  assert.equal(p2.status, 0, p2.stdout);
  assert.match(p2.stdout, /^ok 1 - a$/m);
  assert.match(p2.stdout, /^ok \d - c2$/m);
  // each file's time, as the reporter writes it
  const times = [1, 2].map(i => JSON.parse(fs.readFileSync(path.join(dir, `times-${i}.json`), 'utf8')));
  assert.deepEqual(Object.keys(times[0]), ['test/b.test.js']);
  assert.deepEqual(Object.keys(times[1]), ['test/a.test.js', 'test/c.test.js']);
  for (const v of [...Object.values(times[0]), ...Object.values(times[1])]) assert.ok(typeof v === 'number' && v >= 0 && v < 30, String(v));
  // a UI part (#912): test/ui's files, the options before them (--test-concurrency=1: one file after the
  // other), each file's time though its tests are declared by a helper (as the UI tests' uiTest())
  fs.mkdirSync(path.join(dir, 'test', 'ui'));
  fs.writeFileSync(path.join(dir, 'test', 'ui', 'helper.js'), "import { test } from 'node:test';\nimport fs from 'node:fs';\n" +
    "export const slow = (name) => test(name, async () => { fs.appendFileSync('order.log', `start ${name}\\n`); await new Promise(r => setTimeout(r, 300)); fs.appendFileSync('order.log', `end ${name}\\n`); });\n");
  for (const n of ['x', 'y', 'z']) fs.writeFileSync(path.join(dir, 'test', 'ui', `${n}.test.js`), `import { slow } from './helper.js'; slow('${n}');\n`);
  const ui = spawnSync(process.execPath, ['scripts/test-shard.mjs', '1/1', '--ui', '--test-concurrency=1', '--test-reporter=tap', '--test-reporter-destination=stdout',
    '--test-reporter=./scripts/test-times-reporter.mjs', '--test-reporter-destination=times-ui.json'], { cwd: dir, encoding: 'utf8', env });
  assert.equal(ui.status, 0, ui.stdout + ui.stderr);
  assert.match(ui.stdout, /^UI tests, part 1\/1: 3 of 3 files, ~0 min measured\n/);
  assert.equal(fs.readFileSync(path.join(dir, 'order.log'), 'utf8'), 'start x\nend x\nstart y\nend y\nstart z\nend z\n', 'one file at a time');
  const uiTimes = JSON.parse(fs.readFileSync(path.join(dir, 'times-ui.json'), 'utf8'));
  assert.deepEqual(Object.keys(uiTimes), ['test/ui/x.test.js', 'test/ui/y.test.js', 'test/ui/z.test.js'], 'the test files, not the helper');
  for (const v of Object.values(uiTimes)) assert.ok(v >= 0.3 && v < 30, String(v));
  // a usability part (#5148): test/usability's files only (not its lib/ nor test/ui's), one at a time
  fs.mkdirSync(path.join(dir, 'test', 'usability', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'test', 'usability', 'lib', 'helper.js'), "export * from '../../ui/helper.js';\n");
  for (const n of ['u', 'v']) fs.writeFileSync(path.join(dir, 'test', 'usability', `${n}.test.js`), `import { slow } from './lib/helper.js'; slow('${n}');\n`);
  fs.rmSync(path.join(dir, 'order.log'));
  const us = spawnSync(process.execPath, ['scripts/test-shard.mjs', '1/1', '--usability', '--test-concurrency=1', '--test-reporter=tap', '--test-reporter-destination=stdout'],
    { cwd: dir, encoding: 'utf8', env });
  assert.equal(us.status, 0, us.stdout + us.stderr);
  assert.match(us.stdout, /^usability tests, part 1\/1: 2 of 2 files, ~0 min measured\n/);
  assert.equal(fs.readFileSync(path.join(dir, 'order.log'), 'utf8'), 'start u\nend u\nstart v\nend v\n', 'one file at a time');
  // the repository's: every file of test/usability in one of the parts
  const usDry = run('1/2', '--usability', '--dry-run');
  assert.equal(usDry.status, 0, usDry.stderr);
  assert.equal(usDry.stdout.trim().split('\n').reduce((x, l) => x + Number(/: (\d+) files/.exec(l)[1]), 0), testFiles(ROOT, 'test/usability').length);
});

// #5295: the weekly usability job's two parts a configuration (usability.yml): every file once, each part about the
// same time and well under the step's 15 minutes (a third part when they are not)
test('test shard: the usability tests\' two parts — every file once, measured or estimated, each part well under 15 minutes', () => {
  const files = testFiles(ROOT, 'test/usability'), t = readTimings();
  assert.ok(files.length >= 20 && files.every(f => /^test\/usability\/[\w.-]+\.test\.js$/.test(f)), String(files.length));
  const unmeasured = files.filter(f => !(f in t));
  assert.ok(unmeasured.length <= 3, `not in ${TIMINGS}: ${unmeasured.join(', ')} (node scripts/update-test-timings.mjs <a Usability run's id>)`);
  assertBalanced(files, t, 2);
  const parts = balance(files, weights(files, t), 2);
  for (const p of parts) assert.ok(p.time < 10 * 60, `a part of ${Math.round(p.time)} s: three parts in usability.yml`);
  // the workflow's parts are these: 2 a configuration, the files asked for by hand in one
  const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/usability.yml'), 'utf8');
  assert.match(yml, /^ {10}n=2; \[ -n "\$FILES" \] && n=1$/m);
  assert.match(yml, /scripts\/test-shard\.mjs "\$PART\/\$PARTS" --usability/);
  assert.match(yml, /name: usability-times-\$\{\{ matrix\.interface \}\}-\$\{\{ matrix\.lang \}\}-\$\{\{ matrix\.part \}\}$/m);
  // --dry-run --list: each part's files, every file once
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/test-shard.mjs'), '1/2', '--usability', '--dry-run', '--list'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split('\n');
  assert.deepEqual(lines.filter(l => !l.startsWith('  ')), parts.map((p, k) => `${k + 1}/2: ${p.files.length} files, ~${Math.round(p.time / 60)} min`));
  assert.deepEqual(lines.filter(l => l.startsWith('  ')).map(l => l.trim().split(' ')[0]).sort(), files);
});

test('test times reporter: each file\'s own summary (#912), the run\'s and the tests\' events ignored', () => {
  const times = {};
  const sum = (file, ms) => ({ type: 'test:summary', data: { file, duration_ms: ms, success: true, counts: {} } });
  for (const e of [sum(path.resolve('test/ui/a.test.js'), 1500), sum(path.resolve('test/b.test.js'), 200), sum(undefined, 9999),
    { type: 'test:pass', data: { file: path.resolve('test/ui/harness.js'), nesting: 0, details: { duration_ms: 9999 } } },
    { type: 'test:summary', data: { file: path.resolve('test/c.test.js') } }])
    addFileTime(times, e);
  assert.deepEqual(times, { 'test/ui/a.test.js': 1.5, 'test/b.test.js': 0.2 });
});

test('test timings: merged from the parts, the files that no longer exist left out; read from the downloaded artifacts', (t) => {
  assert.deepEqual(merge([{ 'test/b.test.js': 2 }, { 'test/a.test.js': 1.5, 'test/gone.test.js': 9, 'test/c.test.js': 'x' }], ['test/a.test.js', 'test/b.test.js', 'test/c.test.js']),
    { 'test/a.test.js': 1.5, 'test/b.test.js': 2 });
  // a UI file measured in each interface (#912): the longer time
  assert.deepEqual(merge([{ 'test/ui/u.test.js': 4 }, { 'test/ui/u.test.js': 6 }, { 'test/ui/u.test.js': 5 }], ['test/ui/u.test.js']), { 'test/ui/u.test.js': 6 });
  // the usability files are measured by a workflow of their own (#5295): a CI run keeps their times, a Usability
  // run the others'; a file measured replaces its time, one not measured keeps it (a part cut off, #5836), one that no
  // longer exists is left out
  const all = ['test/a.test.js', 'test/b.test.js', 'test/ui/u.test.js', 'test/usability/p.test.js', 'test/usability/q.test.js'];
  const before = { 'test/a.test.js': 1, 'test/b.test.js': 2, 'test/ui/u.test.js': 3, 'test/usability/p.test.js': 40, 'test/usability/q.test.js': 50, 'test/usability/gone.test.js': 9 };
  assert.deepEqual(merge([{ 'test/a.test.js': 1.5 }, { 'test/ui/u.test.js': 4 }], all, before),
    { 'test/a.test.js': 1.5, 'test/b.test.js': 2, 'test/ui/u.test.js': 4, 'test/usability/p.test.js': 40, 'test/usability/q.test.js': 50 });
  assert.deepEqual(merge([{ 'test/usability/p.test.js': 42 }, { 'test/usability/p.test.js': 45 }], all, before),
    { 'test/a.test.js': 1, 'test/b.test.js': 2, 'test/ui/u.test.js': 3, 'test/usability/p.test.js': 45, 'test/usability/q.test.js': 50 });
  const dir = tmp(t);
  for (const [k, v] of [['unit-times-1', { 'test/a.test.js': 1 }], ['ui-times-silinx-2', { 'test/b.test.js': 2 }]]) {
    fs.mkdirSync(path.join(dir, k));
    fs.writeFileSync(path.join(dir, k, 'test-times.json'), JSON.stringify(v));
  }
  fs.writeFileSync(path.join(dir, 'other.json'), '{}');
  // (#5836: a part cut off by its step's 40 minutes, its file empty or cut short: left out, said)
  for (const [k, v] of [['ui-times-ise-4', ''], ['ui-times-silinx-3', '{"test/ui/x.test.js": 1']]) {
    fs.mkdirSync(path.join(dir, k));
    fs.writeFileSync(path.join(dir, k, 'test-times.json'), v);
  }
  const skipped = [];
  assert.deepEqual(readParts(dir, skipped).sort((a, b) => Object.keys(a)[0].localeCompare(Object.keys(b)[0])), [{ 'test/a.test.js': 1 }, { 'test/b.test.js': 2 }]);
  assert.deepEqual(skipped.sort(), [path.join('ui-times-ise-4', 'test-times.json'), path.join('ui-times-silinx-3', 'test-times.json')]);
  // the command line without a run: its usage
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/update-test-timings.mjs')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.equal(r.stderr, 'usage: node scripts/update-test-timings.mjs <run id> | --from <folder>\n');
});
