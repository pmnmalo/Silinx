// The PIC24 emulator package's npm publishing (#5509): .github/workflows/silinx-pic24-release.yml, from the package's
// own tag silinx-pic24-v*, as silinx-fpga-release.yml publishes silinx-fpga (#1681,
// test/silinx-fpga-release-workflow.test.js checks every step of that one): the same jobs, steps, permissions and
// pinned actions and npm, line for line, only the package's name changed; its CI run started by the same tag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { jobsOf, jobPermissions } from './workflows-lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const yml = read('.github/workflows/silinx-pic24-release.yml');
const fpga = read('.github/workflows/silinx-fpga-release.yml');
// the workflow without its header's comments (the lines before name:)
const body = (y) => y.slice(y.indexOf('\nname: ') + 1);

test('#5509 silinx-pic24 release: silinx-fpga\'s workflow, line for line, for silinx-pic24', () => {
  assert.match(yml, /^# Publishes the PIC24 emulator's package, silinx-pic24 /);
  assert.equal(body(yml), body(fpga).replaceAll('silinx-fpga', 'silinx-pic24'));
  assert.doesNotMatch(yml, /silinx-fpga(?!-release\.yml)/, 'nothing of silinx-fpga but the name of the workflow it mirrors');
  // what that means, said again here: its own tag, the two jobs' permissions, the version step, the tarball published
  assert.match(yml, /\non:\n {2}push:\n {4}tags: \['silinx-pic24-v\*'\]\npermissions:\n/);
  const jobs = jobsOf(yml);
  assert.deepEqual(Object.keys(jobs), ['build', 'publish']);
  assert.deepEqual(jobPermissions(yml, jobs.build), { actions: 'read', contents: 'read' });
  assert.deepEqual(jobPermissions(yml, jobs.publish), { 'id-token': 'write' });
  assert.match(jobs.build, /V="\$\{GITHUB_REF_NAME#silinx-pic24-v\}"/);
  assert.match(jobs.build, /node scripts\/sync-version\.mjs --package silinx-pic24\n/);
  assert.match(jobs.build, /npm pack -w silinx-pic24 --ignore-scripts --pack-destination out/);
  assert.match(jobs.publish, /npm publish \.\/out\/silinx-pic24-\*\.tgz --provenance --access public --ignore-scripts --loglevel verbose\n/);
  assert.doesNotMatch(yml, /secrets\.|NODE_AUTH_TOKEN|_authToken|npmrc/i);
  // CI runs on its tag too; the IDE's tags (v followed by a digit) are not its
  assert.match(read('.github/workflows/ci.yml'), /\n {4}tags: \['v\*', 'silinx-fpga-v\*', 'silinx-pic24-v\*'\]\n/);
  assert.ok(!/^v/.test('silinx-pic24-v0.1.0'));
});

test('#5509 silinx-pic24 release: the package is publishable, its version with its changelog section', () => {
  const pkg = JSON.parse(read('packages/silinx-pic24/package.json'));
  assert.equal(pkg.private, undefined);
  assert.deepEqual(pkg.publishConfig, { access: 'public', provenance: true });
  assert.equal(pkg.name, 'silinx-pic24');
  // what the workflow's version step runs, here: the version read as it reads it, and sync-version --package's verdict
  const r = spawnSync(process.execPath, ['-p', "require('./packages/silinx-pic24/package.json').version"], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.stdout.trim(), pkg.version);
  const s = spawnSync(process.execPath, ['scripts/sync-version.mjs', '--package', 'silinx-pic24'], { cwd: ROOT, encoding: 'utf8' });
  const changelog = read('packages/silinx-pic24/CHANGELOG.md');
  if (changelog.includes(`\n## ${pkg.version}\n`)) assert.equal(s.status, fs.readdirSync(path.join(ROOT, 'packages/silinx-pic24/changes')).some(f => f !== 'README.md') ? 1 : 0);
  else assert.ok(s.stderr.includes(`packages/silinx-pic24/CHANGELOG.md has no "## ${pkg.version}" section`), s.stderr);
});

test('#5509 silinx-pic24 release: npm pack holds its sources, LICENSE, README.md and package.json only', () => {
  const r = spawnSync('npm', ['pack', '--dry-run', '--json', '-w', 'silinx-pic24', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  assert.equal(r.status, 0, r.stderr);
  const [{ files }] = JSON.parse(r.stdout);
  const names = files.map(f => f.path).sort();
  const src = fs.readdirSync(path.join(ROOT, 'packages/silinx-pic24/src')).map(f => `src/${f}`);
  assert.deepEqual(names, ['LICENSE', 'README.md', 'package.json', ...src].sort());
});
