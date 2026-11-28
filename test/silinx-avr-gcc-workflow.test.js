// @silinx/avr-gcc's build and npm publishing (#5934): .github/workflows/silinx-avr-gcc.yml. On a pull request that changes
// the package's build (or the workflow): the build, its oracle against Arduino's native toolchain and the package's tests,
// no publishing. On the package's own tag silinx-avr-gcc-v*: the same, the tagged commit on main and its version the tag's
// with its changelog, then npm's trusted publishing with provenance, the OIDC token the publish job's only (#2644), npm
// pinned by its tarball's integrity as silinx-pic24-release.yml pins it (#3049), the actions pinned by their commits as
// there. And the build script declares its pinned sources (#5649: scripts/check-pins.mjs reads them).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobsOf, jobPermissions } from './workflows-lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const yml = read('.github/workflows/silinx-avr-gcc.yml');
const pic = read('.github/workflows/silinx-pic24-release.yml');

test('#5934 silinx-avr-gcc: built on its pull requests, published from its tag only, no token', () => {
  assert.match(yml, /\non:\n {2}pull_request:\n {4}paths: \[packages\/silinx-avr-gcc\/build\/\*\*, \.github\/workflows\/silinx-avr-gcc\.yml\]\n {2}push:\n {4}tags: \['silinx-avr-gcc-v\*'\]\n {2}workflow_dispatch: +#[^\n]*\npermissions:\n {2}contents: read\n/);
  const jobs = jobsOf(yml);
  assert.deepEqual(Object.keys(jobs), ['build', 'publish']);
  assert.deepEqual(jobPermissions(yml, jobs.build), { contents: 'read' });
  assert.deepEqual(jobPermissions(yml, jobs.publish), { 'id-token': 'write' });
  assert.match(jobs.publish, /\n {4}if: startsWith\(github\.ref, 'refs\/tags\/silinx-avr-gcc-v'\)\n/);
  for (const step of ['packages/silinx-avr-gcc/build/build.sh "$RUNNER_TEMP/work" packages/silinx-avr-gcc/dist',
    'node packages/silinx-avr-gcc/build/oracle.mjs packages/silinx-avr-gcc/dist "$RUNNER_TEMP/work/toolchain" "$RUNNER_TEMP/work/core"',
    'node --test test/silinx-avr-gcc*.test.js', 'npm pack -w @silinx/avr-gcc --ignore-scripts --pack-destination out', 'git merge-base --is-ancestor "$GITHUB_SHA" origin/main',
    'V="${GITHUB_REF_NAME#silinx-avr-gcc-v}"', 'node scripts/sync-version.mjs --package silinx-avr-gcc']) assert.ok(jobs.build.includes(step), step);
  assert.match(jobs.publish, /npm publish \.\/out\/silinx-avr-gcc-\*\.tgz --provenance --access public --ignore-scripts --loglevel verbose\n/);
  assert.doesNotMatch(yml, /secrets\.|NODE_AUTH_TOKEN|_authToken|npmrc/i);
  // npm and the actions pinned as silinx-pic24's release pins them
  for (const pin of [/NPM_TARBALL: \S+/, /NPM_INTEGRITY: \S+/]) assert.equal(yml.match(pin)[0], pic.match(pin)[0]);
  for (const [, action, sha] of yml.matchAll(/uses: ([\w-]+\/[\w-]+)@([0-9a-f]{40})/g)) assert.ok(pic.includes(`uses: ${action}@${sha}`), `${action}@${sha} as silinx-pic24's`);
  assert.doesNotMatch(yml, /uses: [\w-]+\/[\w-]+@(?![0-9a-f]{40})/, 'every action pinned by its commit');
});

test('#5934 the build script\'s pinned sources: each one declared, its value read from the script, a SHA-256 for every download', () => {
  const sh = read('packages/silinx-avr-gcc/build/build.sh');
  const pins = [...sh.matchAll(/^# pinned: (\{.*\})$/gm)].map((m) => JSON.parse(m[1]));
  assert.deepEqual(pins.map((p) => p.kind), ['tag', 'sha256', 'sha256', 'sha256', 'sha256', 'sha256', 'sha256']);
  for (const p of pins) {
    const m = new RegExp(p.match, 'm').exec(sh);
    assert.ok(m, `${p.name}: its value in the script`);
    if (p.kind === 'sha256') assert.match(m.groups.sha256, /^[0-9a-f]{64}$/);
    else assert.match(m.groups.commit, /^[0-9a-f]{40}$/);
  }
  // every URL the script downloads has its SHA-256 beside it
  for (const [, name] of sh.matchAll(/^(\w+)_URL="/gm)) assert.match(sh, new RegExp(`^${name}_URL="[^"]+" +${name}_SHA256="[0-9a-f]{64}"$`, 'm'), name);
});
