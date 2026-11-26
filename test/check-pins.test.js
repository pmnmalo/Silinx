// The sources pinned outside npm against their upstream (scripts/check-pins.mjs, #352): the pins found in
// the repository, ls-remote's output, the comparison of each kind of pin, the issue's text and what is done
// with it; the whole check with the network replaced (no network in the tests); the monthly workflow; the pins declared
// next to the code that uses them (#5649): their generic kinds, how they are read, each checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { collectPins, parseLsRemote, compareTags, latestReleaseTag, yowaspTag, checkYosysTests, checkCommit, checkMcc, issueBody, issueAction, checkAll, TITLE, LABELS, parseReleaseUrl, compareVersions, checkRelease,
  collectDeclared, commentPins, pinError, sameCommit, tagShape, checkTag, checkWatched, checkSha256, checkNpm, checkReported, gitUrl } from '../scripts/check-pins.mjs';
import { YOSYS_TESTS_PIN } from '../scripts/fetch-yosys-tests.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), D = 'd'.repeat(40);

test('check-pins: every pin of the repository (Yosys\'s test designs, each corpus source, the MCC year)', () => {
  const pins = collectPins(ROOT);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/designs-corpus/manifest.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const y = pins.find(p => p.kind === 'yosys-tests');
  assert.deepEqual([y.repo, y.tag, y.commit, y.yowasp], ['YosysHQ/yosys', YOSYS_TESTS_PIN.tag, YOSYS_TESTS_PIN.commit, pkg.dependencies['@yowasp/yosys']]);
  const commits = pins.filter(p => p.kind === 'commit');
  assert.equal(commits.length, Object.keys(manifest.sources).length);
  for (const p of commits) {
    const src = manifest.sources[p.name.replace('design corpus: ', '')];
    assert.equal(p.repo, src.repo);
    assert.match(p.commit, /^[0-9a-f]{40}$/);
    assert.ok(p.used.includes(src.licenceFile), p.name);
    assert.ok(p.used.every(f => !f.startsWith('local:')), p.name);
  }
  // a design's files are its source's used files
  const serv = commits.find(p => p.repo === 'olofk/serv');
  for (const d of manifest.designs.filter(x => x.source === 'serv')) for (const f of d.files.filter(x => !x.startsWith('local:'))) assert.ok(serv.used.includes(f), f);
  const mcc = pins.find(p => p.kind === 'mcc');
  assert.equal(mcc.year, 2026);
  assert.ok(mcc.models.length >= 2);
  // no package pinned by a release's URL: the Spartan-6 nextpnr's was (#2934), on npm since #3357 by its exact version
  // in both package.json files, as the Spartan-3E's (Dependabot's)
  const releases = pins.filter(p => p.kind === 'release');
  assert.deepEqual(releases, []);
  const fpga = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/silinx-fpga/package.json'), 'utf8'));
  for (const d of [pkg.dependencies, fpga.dependencies]) {
    for (const n of ['@silinx/nextpnr-himbaechel-spartan3e', '@silinx/nextpnr-himbaechel-spartan6']) assert.match(d[n], /^\d+\.\d+\.\d+$/, n);
  }
  assert.equal(pkg.dependencies['@silinx/nextpnr-himbaechel-spartan6'], fpga.dependencies['@silinx/nextpnr-himbaechel-spartan6']);
  assert.equal(pins.length, 2 + commits.length + releases.length);
  assert.ok(pins.every(p => !p.declared), 'the declared pins are collectDeclared\'s');
});

test('check-pins: a package pinned by a release\'s URL: the tag, its prefix and version; other specs are not', () => {
  assert.deepEqual(parseReleaseUrl('https://github.com/pmnmalo/nextpnr-spartan/releases/download/spartan6-v0.1.3/silinx-nextpnr-himbaechel-spartan6-0.1.3.tgz'),
    { repo: 'pmnmalo/nextpnr-spartan', tag: 'spartan6-v0.1.3', prefix: 'spartan6-v', version: '0.1.3' });
  assert.deepEqual(parseReleaseUrl('https://github.com/o/r.js/releases/download/v2.10.0/r.tgz'), { repo: 'o/r.js', tag: 'v2.10.0', prefix: 'v', version: '2.10.0' });
  for (const spec of ['1.0.0', '^0.11.0', 'github:o/r#v1.0.0', 'https://github.com/o/r/archive/v1.0.0.tar.gz', 'https://github.com/o/r/releases/download/latest/r.tgz',
    'https://github.com/o/r/releases/download/v1.0/r.tgz', 'https://example.com/o/r/releases/download/v1.0.0/r.tgz', undefined]) assert.equal(parseReleaseUrl(spec), null, String(spec));
});

test('check-pins: a release pin against its repository\'s tags of the same prefix (numerically; other prefixes, candidates ignored)', () => {
  const pin = { kind: 'release', name: 'p', file: 'package.json', repo: 'o/r', tag: 'spartan6-v0.1.3', prefix: 'spartan6-v', version: '0.1.3' };
  const tags = (...t) => Object.fromEntries(t.map(x => [`refs/tags/${x}`, A]));
  assert.equal(compareVersions('0.1.10', '0.1.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.9.9', '1.0.0'), -1);
  const cur = checkRelease(pin, tags('spartan6-v0.1.2', 'spartan6-v0.1.3', 'spartan3e-v9.0.0', 'spartan6-v0.2.0-rc1'));
  assert.deepEqual([cur.behind, cur.current, cur.latest, cur.notes], [false, 'spartan6-v0.1.3', 'spartan6-v0.1.3', []]);
  const newer = checkRelease(pin, tags('spartan6-v0.1.3', 'spartan6-v0.1.10', 'spartan6-v0.1.9'));
  assert.deepEqual([newer.behind, newer.latest], [true, 'spartan6-v0.1.10']);
  assert.match(newer.notes[0], /nextpnr update.*package\.json.*#2935/);
  const body = issueBody([newer], '2026-12-01');
  assert.match(body, /\| p \(\[o\/r\]\(https:\/\/github\.com\/o\/r\)\) \| package\.json \| spartan6-v0\.1\.3 \| spartan6-v0\.1\.10 \|/);
  assert.match(body, /- the packages pinned by a release: the release's URL in the package\.json/);
  const none = checkRelease(pin, tags('spartan3e-v1.0.0'));
  assert.deepEqual([none.behind, none.latest, none.notes], [false, '?', ['no spartan6-v* tag in o/r']]);
});

test('check-pins: the release pins of a repository: one per package and URL, the files that pin it alike together', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pins-'));
  try {
    const url = v => `https://github.com/o/r/releases/download/x-v${v}/x-${v}.tgz`;
    const write = (f, j) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), JSON.stringify(j)); };
    write('package.json', { dependencies: { x: url('1.0.0'), y: url('2.0.0'), z: '1.2.3' } });
    write('packages/silinx-fpga/package.json', { dependencies: { x: url('1.0.0') }, optionalDependencies: { y: url('2.1.0') } });
    write('test/designs-corpus/manifest.json', { sources: {}, designs: [] });
    write('test/diagram-corpus/mcc.json', { nets: [{ url: 'https://mcc.lip6.fr/2024/a.tgz', instance: 'a' }] });
    const rel = collectPins(root, { testsPin: { tag: 'v0.1', commit: A } }).filter(p => p.kind === 'release');
    assert.deepEqual(rel.map(p => [p.name, p.version, p.file]), [['x', '1.0.0', 'package.json, packages/silinx-fpga/package.json'], ['y', '2.0.0', 'package.json'], ['y', '2.1.0', 'packages/silinx-fpga/package.json']]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('check-pins: ls-remote\'s output, an annotated tag by its commit', () => {
  const refs = parseLsRemote(`${A}\tHEAD\n${B}\trefs/tags/v0.70\n${C}\trefs/tags/v0.70^{}\n${D}\trefs/tags/v0.9\nnot a line\n`);
  assert.deepEqual(refs, { HEAD: A, 'refs/tags/v0.70': C, 'refs/tags/v0.9': D });
  // the peeled line first: the tag object's line does not replace it
  assert.deepEqual(parseLsRemote(`${C}\trefs/tags/x^{}\n${B}\trefs/tags/x\n`), { 'refs/tags/x': C });
  assert.deepEqual(parseLsRemote(''), {});
});

test('check-pins: release tags compared as numbers, the latest without release candidates', () => {
  assert.equal(compareTags('v0.68', 'v0.70'), -1);
  assert.equal(compareTags('v0.9', 'v0.10'), -1);
  assert.equal(compareTags('v0.70', 'v0.70.0'), 0);
  assert.equal(compareTags('v1.0', 'v0.99'), 1);
  const refs = { 'refs/tags/v0.9': A, 'refs/tags/v0.70': A, 'refs/tags/v0.71-rc1': A, 'refs/tags/yosys-0.72': A, 'refs/tags/v0.69.1': A, HEAD: A };
  assert.equal(latestReleaseTag(refs), 'v0.70');
  assert.equal(latestReleaseTag({ HEAD: A }), null);
  assert.equal(yowaspTag('0.68.1207'), 'v0.68');
  assert.equal(yowaspTag('^0.70.1258'), 'v0.70');
  assert.equal(yowaspTag(null), null);
});

test('check-pins: Yosys\'s test designs: behind a newer Yosys, out of step with YoWASP, the wrong commit', () => {
  const pin = { kind: 'yosys-tests', name: 'Yosys\'s test designs', tag: 'v0.68', commit: A, yowasp: '0.68.1207' };
  const current = checkYosysTests(pin, { 'refs/tags/v0.68': A, 'refs/tags/v0.67': B });
  assert.deepEqual([current.behind, current.latest, current.notes], [false, 'v0.68', []]);
  const newer = checkYosysTests(pin, { 'refs/tags/v0.68': A, 'refs/tags/v0.70': B });
  assert.equal(newer.behind, true);
  assert.equal(newer.latest, 'v0.70');
  assert.match(newer.notes.join(), /follow the Yosys of @yowasp\/yosys \(v0\.68\)/);
  // YoWASP updated, the test designs not: out of step, even with no newer Yosys
  const step = checkYosysTests({ ...pin, yowasp: '0.70.1258' }, { 'refs/tags/v0.68': A, 'refs/tags/v0.70': B, });
  assert.equal(step.behind, true);
  assert.match(step.notes[0], /out of step: @yowasp\/yosys 0\.70\.1258 runs Yosys v0\.70, the test designs are v0\.68's/);
  const wrong = checkYosysTests(pin, { 'refs/tags/v0.68': C });
  assert.equal(wrong.behind, true);
  assert.match(wrong.notes[0], /the commit pinned \(aaaaaaa\) is not v0\.68's \(ccccccc\)/);
});

test('check-pins: a commit pin against its repository\'s head: commits behind, the used files changed', () => {
  const pin = { kind: 'commit', name: 'design corpus: x', repo: 'o/x', commit: A, used: ['LICENSE', 'rtl/a.v', 'rtl/b.v'] };
  assert.deepEqual(checkCommit(pin, A), { pin, current: 'aaaaaaa', latest: 'aaaaaaa', behind: false, notes: [] });
  const moved = checkCommit(pin, B, { ahead_by: 3, files: ['README.md', 'rtl/b.v'] });
  assert.equal(moved.behind, true);
  assert.deepEqual(moved.notes, ['3 commits behind', 'files the designs use changed: `rtl/b.v`']);
  assert.deepEqual(checkCommit(pin, B, { ahead_by: 1, files: ['docs/x.md'] }).notes, ['1 commit behind', 'none of the files the designs use changed']);
  // without GitHub's comparison: behind, nothing more known
  assert.deepEqual(checkCommit(pin, B).notes, []);
  const unread = checkCommit(pin, null);
  assert.equal(unread.behind, false);
  assert.match(unread.notes[0], /could not be read/);
});

test('check-pins: the MCC models against the latest contest', () => {
  const pin = { kind: 'mcc', name: 'MCC', year: 2024 };
  assert.equal(checkMcc(pin, []).behind, false);
  const r = checkMcc(pin, [2026, 2025]);
  assert.deepEqual([r.behind, r.current, r.latest], [true, '2024', '2026']);
  assert.match(r.notes[0], /MCC 2026 \(https:\/\/mcc\.lip6\.fr\/2026\/models\.php\)/);
});

test('check-pins: the issue\'s text lists what is behind, how to update it, what could not be checked', () => {
  const checks = [
    checkYosysTests({ kind: 'yosys-tests', name: 'Yosys\'s test designs', file: 'scripts/fetch-yosys-tests.mjs', repo: 'YosysHQ/yosys', tag: 'v0.68', commit: A, yowasp: '0.68.1' }, { 'refs/tags/v0.68': A, 'refs/tags/v0.70': B }),
    checkCommit({ kind: 'commit', name: 'design corpus: x', file: 'test/designs-corpus/manifest.json', repo: 'o/x', commit: A, used: [] }, A),
    checkCommit({ kind: 'commit', name: 'design corpus: y', file: 'test/designs-corpus/manifest.json', repo: 'o/y', commit: A, used: ['a.v'] }, B, { ahead_by: 2, files: ['a.v'] }),
    checkCommit({ kind: 'commit', name: 'design corpus: z', file: 'test/designs-corpus/manifest.json', repo: 'o/z', commit: A, used: [] }, null),
  ];
  const body = issueBody(checks, '2026-11-01');
  assert.match(body, /checked 2026-11-01 by \.github\/workflows\/pins\.yml/);
  assert.match(body, /\| Yosys's test designs \(\[YosysHQ\/yosys\]\(https:\/\/github\.com\/YosysHQ\/yosys\)\) \| scripts\/fetch-yosys-tests\.mjs \| v0\.68 \| v0\.70 \|/);
  assert.match(body, /\| design corpus: y \(\[o\/y\]\(https:\/\/github\.com\/o\/y\)\) \| test\/designs-corpus\/manifest\.json \| aaaaaaa \| bbbbbbb \| 2 commits behind; files the designs use changed: `a\.v` \|/);
  assert.ok(!body.includes('design corpus: x'), 'a current pin is not listed');
  assert.match(body, /Not checked:\n\n- design corpus: z: the head of the repository could not be read/);
  assert.match(body, /- Yosys's test designs: with the Yosys update/);
  assert.match(body, /- the design corpus: test\/designs-corpus\/manifest\.json \(the commit\)/);
  assert.ok(!/the MCC models:/.test(body));
});

test('check-pins: the issue opened, updated, closed or left alone; its title and labels', () => {
  assert.equal(issueAction(null, 2), 'open');
  assert.equal(issueAction({ number: 9 }, 1), 'update');
  assert.equal(issueAction({ number: 9 }, 0), 'close');
  assert.equal(issueAction(null, 0), 'none');
  assert.equal(TITLE, 'Pinned sources: newer versions available');
  assert.deepEqual(LABELS, ['enhancement', 'tests & CI']);
});

test('check-pins: the whole check with the network replaced; a pin that cannot be read is not behind', async () => {
  const pins = [
    { kind: 'yosys-tests', name: 'Y', repo: 'YosysHQ/yosys', tag: 'v0.68', commit: A, yowasp: '0.68.1' },
    { kind: 'commit', name: 'c1', repo: 'o/one', commit: A, used: ['f.v'] },
    { kind: 'commit', name: 'c2', repo: 'o/two', commit: A, used: ['f.v'] },
    { kind: 'commit', name: 'c3', repo: 'o/missing', commit: A, used: [] },
    { kind: 'mcc', name: 'M', year: 2024 },
    { kind: 'release', name: 'R', file: 'package.json', repo: 'o/rel', tag: 'x-v1.0.0', prefix: 'x-v', version: '1.0.0' },
  ];
  const asked = [];
  const net = {
    lsRemote: async (url, ...refs) => {
      asked.push([url, ...refs].join(' '));
      if (url.includes('yosys')) return { 'refs/tags/v0.68': A, 'refs/tags/v0.69': B };
      if (url.includes('one')) return { HEAD: A };
      if (url.includes('two')) return { HEAD: C };
      if (url.includes('rel')) return { 'refs/tags/x-v1.0.0': A, 'refs/tags/x-v1.1.0': B };
      throw new Error('fatal: repository not found\nmore');
    },
    compare: async (repo, base, head) => { assert.deepEqual([repo, base, head], ['o/two', A, C]); return { ahead_by: 5, files: ['f.v'] }; },
    exists: async url => url.endsWith('/2025/models.php'),
  };
  const r = await checkAll(pins, net);
  assert.deepEqual(r.map(c => [c.pin.name, c.behind, c.latest]), [['Y', true, 'v0.69'], ['c1', false, 'aaaaaaa'], ['c2', true, 'ccccccc'], ['c3', false, '?'], ['M', true, '2025'], ['R', true, 'x-v1.1.0']]);
  assert.deepEqual(r[2].notes, ['5 commits behind', 'files the designs use changed: `f.v`']);
  assert.deepEqual(r[3].notes, ['could not be checked: fatal: repository not found']);
  assert.deepEqual(asked.slice(0, 2), ['https://github.com/YosysHQ/yosys.git refs/tags/v*', 'https://github.com/o/one.git HEAD']);
  assert.equal(asked.at(-1), 'https://github.com/o/rel.git refs/tags/x-v*');
});

test('check-pins: the monthly workflow on GitHub\'s runner, by hand too, may write issues', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/pins.yml'), 'utf8');
  assert.match(yml, /\n  schedule:\n    - cron: '\d+ \d+ 1 \* \*'/);
  assert.match(yml, /\n  workflow_dispatch:\n/);
  assert.match(yml, /runs-on: ubuntu-latest/);
  assert.ok(!yml.includes('self-hosted'));
  assert.match(yml, /issues: write/);
  assert.match(yml, /run: node scripts\/check-pins\.mjs\n\s+env:\n\s+GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
});

test('check-pins: the pins declared in the repository, each read with what its kind needs, none in error (#5649)', async () => {
  const { pins, errors } = await collectDeclared(ROOT);
  assert.deepEqual(errors, []);
  assert.ok(pins.every(p => p.declared && !pinError(p)));
  const by = name => pins.find(p => p.name === name) || assert.fail(`no pin ${name}`);
  // the KiCad catalogue's libraries: SparkFun's and the Arduino modules' tags, KiCad's own within its 9, its files' SHA-256
  assert.deepEqual([by('KiCad catalogue: SparkFun\'s KiCad libraries').repo, by('KiCad catalogue: SparkFun\'s KiCad libraries').file], ['sparkfun/SparkFun-KiCad-Libraries', 'scripts/kicad-catalogue.mjs']);
  assert.match(by('KiCad catalogue: the KiCad Library for Arduino Modules').tag, /^v\d+\.\d+\.\d+$/);
  for (const n of ['KiCad\'s symbol libraries', 'KiCad catalogue: KiCad\'s footprints']) assert.deepEqual([by(n).kind, by(n).series], ['tag', '9.'], n);
  const shas = pins.filter(p => p.kind === 'sha256');
  assert.deepEqual(shas.map(p => p.url.split('/').pop()), ['74xx.kicad_sym', '4xxx.kicad_sym', 'eecircuit-engine-1.9.0.tgz']);
  // ngspice's engine, downloaded on first use (#5386): its version on npm
  assert.deepEqual(pins.filter(p => p.kind === 'npm').map(p => [p.package, p.version, p.file]), [['eecircuit-engine', '1.9.0', 'server/ngspice.js']]);
  // the ported code and data (light8080's is the corpus's), Digilent's XDCs (core/boards.js's comment: its constant's commit)
  assert.deepEqual(['ported: prjxray', 'ported: prjxray-db', 'ported: apicula'].map(n => by(n).kind), ['commit', 'commit', 'tag']);
  assert.ok(!pins.some(p => /light8080|SparkFun/.test(p.name) && p.file === 'scripts/third-party.mjs'));
  const xdc = by('Digilent\'s master XDCs (the 7-series\' boards)');
  assert.ok(fs.readFileSync(path.join(ROOT, 'core/boards.js'), 'utf8').includes(`digilent-xdc/blob/${xdc.commit}/`));
  assert.ok(fs.readFileSync(path.join(ROOT, 'scripts/install-adepttool.sh'), 'utf8').includes(`COMMIT="${by('adepttool').commit}"`));
  // the ESP32 node's MicroPython build (#5658): MicroPython's tag and emsdk's, each with its commit, read from the script's lines
  const build = fs.readFileSync(path.join(ROOT, 'scripts/micropython-wasm/build.sh'), 'utf8');
  for (const [n, repo, v] of [['MicroPython (the ESP32 node\'s JSPI build)', 'micropython/micropython', 'MICROPYTHON'], ['emsdk (the ESP32 node\'s MicroPython build)', 'emscripten-core/emsdk', 'EMSDK']]) {
    assert.deepEqual([by(n).kind, by(n).repo, by(n).file], ['tag', repo, 'scripts/micropython-wasm/build.sh'], n);
    assert.ok(build.includes(`${v}_TAG="${by(n).tag}" ${v}_COMMIT="${by(n).commit}"`), n);
  }
  // nextpnr-spartan's SILINX_REF: read from the fork's workflows, behind when the files of its chip databases changed
  const chipdbs = pins.filter(p => p.remote);
  assert.deepEqual(chipdbs.map(p => p.remote.url.split('/').pop()), ['spartan3e.yml', 'spartan6.yml']);
  for (const p of chipdbs) assert.deepEqual([p.repo, p.branch, p.watch[0]], ['pmnmalo/Silinx', 'main', 'packages/silinx-fpga/devices']);
  // reported only: the Docker images' bases and the tools whose installers are not public
  assert.deepEqual(pins.filter(p => p.kind === 'reported').map(p => p.current.split('@')[0]).sort(),
    ['silinx/xc16:2.10', 'ubuntu:14.04', 'ubuntu:22.04', 'xilinx/vitis-hls:2025.2']);
});

test('check-pins: a declared pin\'s kinds and what each needs; a tag\'s shape; abbreviated commits', () => {
  assert.equal(pinError({ kind: 'tag', name: 't', repo: 'o/r', tag: 'v1.2.3' }), '');
  assert.equal(pinError({ kind: 'tag', name: 't', repo: 'https://gitlab.com/o/r.git', tag: '9.0.0', commit: 'abcdef1' }), '');
  assert.equal(pinError({ kind: 'commit', name: 'c', repo: 'o/r', commit: A, branch: 'main', watch: ['src'] }), '');
  assert.equal(pinError({ kind: 'commit', name: 'c', repo: 'o/r', remote: { url: 'https://x/y', match: 'R: (\\w+)' } }), '');
  assert.equal(pinError({ kind: 'sha256', name: 's', url: 'https://x/f.bin', sha256: 'A'.repeat(64) }), '');
  assert.equal(pinError({ kind: 'reported', name: 'r', current: 'img:1' }), '');
  assert.equal(pinError({ kind: 'npm', name: 'n', package: '@scope/pkg', version: '1.9.0' }), '');
  assert.equal(pinError(null), 'not an object');
  assert.equal(pinError({ kind: 'tag', repo: 'o/r', tag: 'v1' }), 'no name');
  assert.match(pinError({ kind: 'pypi', name: 'p' }), /^p: no kind "pypi" \(tag, commit, sha256, npm, reported\)$/);
  for (const bad of [{ kind: 'tag', repo: 'o/r', tag: 'latest' }, { kind: 'commit', repo: 'o/r', commit: 'main' },
    { kind: 'commit', repo: 'https://gitlab.com/o/r.git', commit: A, watch: ['src'] }, { kind: 'commit', repo: 'o/r', commit: A, watch: [] },
    { kind: 'sha256', url: 'http://x/f', sha256: 'a'.repeat(64) }, { kind: 'sha256', url: 'https://x/f', sha256: 'a'.repeat(63) }, { kind: 'reported', current: '' },
    { kind: 'npm', package: 'a b', version: '1.0.0' }, { kind: 'npm', package: 'p', version: 'latest' }]) {
    assert.match(pinError({ name: 'x', ...bad }), /^x: not what a \w+ pin needs$/, JSON.stringify(bad));
  }
  assert.deepEqual(tagShape('v10.0.0'), { prefix: 'v', version: '10.0.0' });
  assert.deepEqual(tagShape('0.32'), { prefix: '', version: '0.32' });
  assert.deepEqual(tagShape('spartan6-v0.5.2'), { prefix: 'spartan6-v', version: '0.5.2' });
  assert.equal(tagShape('latest'), null);
  assert.ok(sameCommit('0a0adde', `0a0adde${'f'.repeat(33)}`) && sameCommit(A, A.toUpperCase()));
  assert.ok(!sameCommit('0a0add', '0a0add') && !sameCommit(A, B) && !sameCommit(null, A));
  assert.equal(compareVersions('0.36', '0.32.1'), 1);
  assert.equal(gitUrl('o/r'), 'https://github.com/o/r.git');
  assert.equal(gitUrl('https://gitlab.com/o/r.git'), 'https://gitlab.com/o/r.git');
});

test('check-pins: the declarations read: a module\'s PINNED, a comment\'s pin and its match; the errors of each', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pins-'));
  try {
    const write = (f, t) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), t); };
    write('scripts/a.mjs', "const TAG = 'v1.4.0';\nexport const PINNED = [{ kind: 'tag', name: 'lib a', repo: 'o/a', tag: TAG }];\n");
    write('scripts/bad.mjs', "export const PINNED = [{ kind: 'tag', name: 'lib b', repo: 'o/b' }];\n");
    write('scripts/throws.mjs', "export const PINNED = [];\nthrow new Error('no import');\n");
    write('scripts/install.sh', '#!/bin/sh\n# pinned: {"kind": "commit", "name": "tool", "repo": "o/tool", "match": "^COMMIT=(?<commit>[0-9a-f]{40})$"}\nCOMMIT=' + A + '\n');
    write('docker/x/Dockerfile', '# pinned: {"kind": "reported", "name": "base", "match": "^FROM (?<current>\\\\S+)", "note": "by hand"}\nFROM ubuntu:24.04\n');
    write('core/notes.md', '<!-- pinned: {"kind": "sha256", "name": "rom", "url": "https://x/rom.bin", "sha256": "' + 'c'.repeat(64) + '"} -->\n');
    write('scripts/broken.sh', '# pinned: {"kind": "commit", name: "x"}\n# pinned: {"kind": "commit", "name": "lost", "repo": "o/l", "match": "^REF=([0-9a-f]{40})"}\n');
    write('test/skipped.mjs', "export const PINNED = [{ kind: 'reported', name: 'a test', current: 'x' }];\n");
    write('core/data.json', '# pinned: {"kind": "reported", "name": "json", "current": "x"}\n');
    const files = ['scripts/a.mjs', 'scripts/bad.mjs', 'scripts/throws.mjs', 'scripts/install.sh', 'docker/x/Dockerfile', 'core/notes.md', 'scripts/broken.sh', 'test/skipped.mjs', 'core/data.json', 'scripts/gone.mjs'];
    const { pins, errors } = await collectDeclared(root, { files });
    assert.deepEqual(pins.map(p => [p.file, p.kind, p.name, p.tag || p.commit || p.current || p.sha256.slice(0, 4)]), [
      ['scripts/a.mjs', 'tag', 'lib a', 'v1.4.0'], ['scripts/install.sh', 'commit', 'tool', A], ['docker/x/Dockerfile', 'reported', 'base', 'ubuntu:24.04'], ['core/notes.md', 'sha256', 'rom', 'cccc']]);
    assert.ok(pins.every(p => p.declared && !('match' in p)));
    assert.deepEqual(errors.map(e => e.replace(/ \(.*$|: Expected .*$|: Unexpected .*$/, '')), [
      'scripts/bad.mjs: lib b: not what a tag pin needs', 'scripts/throws.mjs: no import', 'scripts/broken.sh: a pin that is not JSON', 'scripts/broken.sh: lost: its match finds nothing']);
    assert.deepEqual(commentPins('// pinned: {"kind": "reported", "name": "n", "current": "1"}\n  # pinned: {"kind": "reported", "name": "m", "current": "2"}\nx // pinned: {"kind": "reported", "name": "o", "current": "3"}', 'f.js').pins.map(p => p.name), ['n', 'm']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('check-pins: a tag pin: behind a newer tag of its shape (in its series), current, the wrong commit, a tag gone', () => {
  const tags = (...t) => Object.fromEntries(t.map(x => [`refs/tags/${x}`, A]));
  const pin = { kind: 'tag', name: 'lib', repo: 'o/lib', tag: 'v4.2.0', declared: true };
  const cur = checkTag(pin, tags('v4.1.0', 'v4.2.0', 'v4.2.1-beta', 'v5.0.0-rc1', 'release-9', 'w9.0.0'));
  assert.deepEqual([cur.behind, cur.current, cur.latest, cur.notes], [false, 'v4.2.0', 'v4.2.0', []]);
  const newer = checkTag(pin, tags('v4.2.0', 'v4.10.0', 'v4.9.0'));
  assert.deepEqual([newer.behind, newer.latest, newer.notes], [true, 'v4.10.0', []]);
  // within its series: KiCad 9's, not 10's
  const kicad = { kind: 'tag', name: 'k', repo: 'https://gitlab.com/k/s.git', tag: '9.0.0', series: '9.' };
  assert.deepEqual([checkTag(kicad, tags('9.0.0', '10.0.8')).behind, checkTag(kicad, tags('9.0.0', '10.0.8')).latest], [false, '9.0.0']);
  assert.deepEqual([checkTag(kicad, tags('9.0.0', '9.0.10', '10.0.8')).behind, checkTag(kicad, tags('9.0.0', '9.0.10')).latest], [true, '9.0.10']);
  assert.deepEqual([checkTag({ ...kicad, tag: '0.32', series: undefined }, tags('0.32', '0.36', 'v1.0')).latest], ['0.36']);
  // the tag's commit pinned too: the wrong one is behind even with no newer tag
  const withCommit = { ...pin, commit: B.slice(0, 7) };
  assert.equal(checkTag(withCommit, { 'refs/tags/v4.2.0': B }).behind, false);
  const wrong = checkTag(withCommit, { 'refs/tags/v4.2.0': C });
  assert.deepEqual([wrong.behind, wrong.notes], [true, ['the commit pinned (bbbbbbb) is not v4.2.0\'s (ccccccc)']]);
  const gone = checkTag(pin, tags('v4.1.0'));
  assert.deepEqual([gone.behind, gone.notes], [true, ['the tag pinned, v4.2.0, is not in o/lib']]);
  const none = checkTag(pin, {});
  assert.deepEqual([none.behind, none.latest, none.notes], [false, '?', ['the tag pinned, v4.2.0, is not in o/lib', 'no v* tag in o/lib']]);
});

test('check-pins: a watched commit, a file\'s SHA-256, an npm package\'s version, a reported pin', () => {
  const pin = { kind: 'commit', name: 'w', repo: 'o/w', commit: A, watch: ['src', 'data'] };
  assert.deepEqual(checkWatched(pin, B, []), { pin, current: 'aaaaaaa', latest: 'bbbbbbb', behind: false, notes: [] });
  assert.deepEqual(checkWatched(pin, B, ['data']).notes, ['changed since: `data`']);
  assert.equal(checkWatched(pin, null, []).latest, '?');
  const sha = { kind: 'sha256', name: 's', url: 'https://x/rom.bin', sha256: 'AB'.repeat(32) };
  assert.deepEqual([checkSha256(sha, 'ab'.repeat(32)).behind, checkSha256(sha, 'ab'.repeat(32)).notes], [false, []]);
  const changed = checkSha256(sha, 'cd'.repeat(32));
  assert.deepEqual([changed.behind, changed.current, changed.latest, changed.notes], [true, 'ABABABABABAB', 'cdcdcdcdcdcd', ['the file served at https://x/rom.bin changed: not the SHA-256 pinned']]);
  // an npm package's version (#5386): behind when npm has a newer one
  const npm = { kind: 'npm', name: 'n', package: 'eecircuit-engine', version: '1.9.0' };
  assert.deepEqual(checkNpm(npm, '1.9.0'), { pin: npm, current: '1.9.0', latest: '1.9.0', behind: false, notes: [] });
  assert.deepEqual([checkNpm(npm, '1.10.0').behind, checkNpm(npm, '1.8.2').behind], [true, false]);
  assert.deepEqual(checkNpm(npm, undefined).notes, ['no latest version of eecircuit-engine on npm']);
  assert.deepEqual(checkReported({ kind: 'reported', name: 'r', current: 'img:1', note: 'by hand' }), { pin: { kind: 'reported', name: 'r', current: 'img:1', note: 'by hand' }, current: 'img:1', latest: '—', behind: false, reported: true, notes: ['by hand'] });
});

test('check-pins: the declared pins checked with the network replaced: behind, current, a remote commit, a network error; the issue', async () => {
  const d = (p, file = 'scripts/x.mjs') => ({ ...p, file, declared: true });
  const pins = [
    d({ kind: 'tag', name: 'T behind', repo: 'o/t', tag: 'v1.0.0', update: 'the tag in scripts/x.mjs' }),
    d({ kind: 'tag', name: 'T wrong', repo: 'https://gitlab.com/o/w.git', tag: '2.0', commit: A }),
    d({ kind: 'commit', name: 'C current', repo: 'o/c', commit: A.slice(0, 7) }),
    d({ kind: 'commit', name: 'C moved', repo: 'o/m', commit: A }),
    d({ kind: 'commit', name: 'R', repo: 'o/silinx', branch: 'main', remote: { url: 'https://raw/fork/ci.yml', match: '^  REF: ([0-9a-f]{40})' }, watch: ['dev', 'tim', 'old'] }),
    d({ kind: 'sha256', name: 'S changed', url: 'https://x/rom.bin', sha256: 'a'.repeat(64) }),
    d({ kind: 'sha256', name: 'S offline', url: 'https://down/rom.bin', sha256: 'a'.repeat(64) }),
    d({ kind: 'reported', name: 'image', current: 'img:2.10', note: 'by hand' }, 'docker/Dockerfile'),
  ];
  const asked = [];
  const net = {
    lsRemote: async (url, ...refs) => {
      asked.push([url, ...refs].join(' '));
      if (url.endsWith('/o/t.git')) return { 'refs/tags/v1.0.0': A, 'refs/tags/v1.1.0': B };
      if (url.endsWith('/o/w.git')) return { 'refs/tags/2.0': C };
      if (url.endsWith('/o/c.git')) return { HEAD: A };
      if (url.endsWith('/o/m.git')) return { HEAD: B };
      if (url.endsWith('/o/silinx.git')) return { 'refs/heads/main': D };
      throw new Error('unexpected');
    },
    compare: async (repo, base, head) => {
      asked.push(`compare ${repo} ${base.slice(0, 1)}...${head.slice(0, 1)}`);
      return { ahead_by: head === C ? 0 : 7, files: ['x'] };
    },
    text: async url => { assert.equal(url, 'https://raw/fork/ci.yml'); return `env:\n  REF: ${B}\n`; },
    lastCommit: async (repo, branch, p) => { assert.deepEqual([repo, branch], ['o/silinx', 'main']); return { dev: D, tim: C, old: B }[p]; },
    sha256: async url => { if (url.includes('down')) throw new Error('fetch failed\nstack'); return 'f'.repeat(64); },
    exists: async () => assert.fail('no MCC pin'),
  };
  const r = await checkAll(pins, net);
  assert.deepEqual(r.map(c => [c.pin.name, c.behind, c.current, c.latest]), [
    ['T behind', true, 'v1.0.0', 'v1.1.0'], ['T wrong', true, '2.0', '2.0'], ['C current', false, 'aaaaaaa', 'aaaaaaa'], ['C moved', true, 'aaaaaaa', 'bbbbbbb'],
    ['R', true, 'bbbbbbb', 'ddddddd'], ['S changed', true, 'aaaaaaaaaaaa', 'ffffffffffff'], ['S offline', false, 'aaaaaaaaaaaa', '?'], ['image', false, 'img:2.10', '—']]);
  assert.deepEqual(r[3].notes, ['7 commits behind']);
  // the remote's commit read, then each watched path's last commit compared with it: tim's came before, old's is the pin
  assert.deepEqual(r[4].notes, ['changed since: `dev`']);
  assert.ok(asked.includes('compare o/silinx b...d') && asked.includes('compare o/silinx b...c') && !asked.some(a => a.endsWith('b...b')));
  assert.deepEqual(r[6].notes, ['could not be checked: fetch failed']);
  assert.deepEqual(asked.slice(0, 2), ['https://github.com/o/t.git refs/tags/*', 'https://gitlab.com/o/w.git refs/tags/*']);
  const body = issueBody(r, '2026-12-01');
  assert.match(body, /\| T behind \(\[o\/t\]\(https:\/\/github\.com\/o\/t\)\) \| scripts\/x\.mjs \| v1\.0\.0 \| v1\.1\.0 \|  \|/);
  assert.match(body, /\| T wrong \(\[gitlab\.com\/o\/w\]\(https:\/\/gitlab\.com\/o\/w\)\) \| scripts\/x\.mjs \| 2\.0 \| 2\.0 \| the commit pinned \(aaaaaaa\) is not 2\.0's \(ccccccc\) \|/);
  assert.match(body, /- T behind: the tag in scripts\/x\.mjs\n- T wrong: the tag \(and its commit\) where it is declared/);
  assert.match(body, /- S changed: the file looked at, its new SHA-256 where it is declared/);
  assert.match(body, /Not checked:\n\n- S offline: could not be checked: fetch failed\n/);
  assert.match(body, /Reported only \(not checkable from here: look at them by hand\):\n\n- image \(docker\/Dockerfile\): img:2\.10: by hand\n/);
  assert.ok(!body.includes('| C current') && !body.includes('| image'));
  assert.ok(!/the design corpus:|the packages pinned by a release:/.test(body));
});

test('check-pins: the workflow\'s comment and CLAUDE.md name the declared pins (#5649)', () => {
  assert.match(fs.readFileSync(path.join(ROOT, '.github/workflows/pins.yml'), 'utf8'), /# .*declared next to the code that uses them/);
  assert.match(fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8'), /A new source pinned outside\s+npm [\s\S]*declared next to the code[\s\S]*so `pins\.yml`\s+follows it \(#5649\)/);
});
