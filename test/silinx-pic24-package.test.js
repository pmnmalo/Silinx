// The PIC24 emulator's package, silinx-pic24 (#5480, the roadmap #5479's phase 1): an npm workspace of this
// repository, packages/silinx-pic24/, published on npm from its own tags (#5509), MIT (the rest of Silinx is
// AGPL-3.0-only). It imports nothing of the IDE (core/, web/, server/) and no npm package: its modules import one
// another only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'packages', 'silinx-pic24');
const read = (f) => fs.readFileSync(f, 'utf8');
const pkg = JSON.parse(read(path.join(DIR, 'package.json')));
const root = JSON.parse(read(path.join(ROOT, 'package.json')));
const lock = JSON.parse(read(path.join(ROOT, 'package-lock.json')));

test('#5480 silinx-pic24: a workspace package, published (#5509), MIT, its own version, no dependency, its entry', () => {
  assert.deepEqual(root.workspaces, ['packages/*']);
  assert.equal(pkg.name, 'silinx-pic24');
  assert.equal(pkg.private, undefined, 'published on npm (#5509)');
  assert.deepEqual(pkg.files, ['src', 'LICENSE', 'README.md']);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.author, 'Pedro Maló');
  assert.match(pkg.version, /^0\.\d+\.\d+$/, 'its own semver, 0.x');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.peerDependencies, undefined);
  assert.deepEqual(pkg.exports, { '.': './src/index.js' });
  assert.deepEqual(lock.packages['node_modules/silinx-pic24'], { resolved: 'packages/silinx-pic24', link: true });
  assert.deepEqual(lock.packages['packages/silinx-pic24'], { version: pkg.version, license: 'MIT' });
});

test('#5480 silinx-pic24: its LICENSE is MIT, Copyright 2026 Pedro Maló; its README, changelog and fragments; NOTICE names it', () => {
  const lic = read(path.join(DIR, 'LICENSE'));
  assert.ok(lic.startsWith('MIT License\n\nCopyright 2026 Pedro Maló\n\nPermission is hereby granted, free of charge,'));
  assert.match(lic, /THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND/);
  assert.match(read(path.join(DIR, 'README.md')), /^# silinx-pic24\n[\s\S]*Licence: MIT \(\[LICENSE\]\(LICENSE\)\)\.\n$/);
  assert.match(read(path.join(DIR, 'CHANGELOG.md')), /^# Changelog\n\nWhat changed in each version of silinx-pic24/);
  assert.match(read(path.join(DIR, 'changes', 'README.md')), /^# silinx-pic24's changelog fragments\n/);
  assert.match(read(path.join(ROOT, 'NOTICE')), /silinx-pic24 \(packages\/silinx-pic24[^)]*\), is Copyright 2026\s+Pedro Maló too, under the MIT License/);
  // the IDE stays AGPL-3.0-only
  assert.equal(root.license, 'AGPL-3.0-only');
});

const sources = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? sources(`${dir}/${e.name}`) : /\.m?js$/.test(e.name) ? [`${dir}/${e.name}`] : []));

test('#5480 silinx-pic24\'s modules import one another only: nothing of core/, web/, server/, no npm package, no node:', () => {
  const bad = [], files = sources('packages/silinx-pic24/src');
  assert.ok(files.includes('packages/silinx-pic24/src/index.js'));
  for (const f of files) {
    for (const [, a, b] of read(path.join(ROOT, f)).matchAll(/^\s*(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/gm)) {
      const spec = a || b, target = path.posix.normalize(path.posix.join(path.posix.dirname(f), spec));
      if (!spec.startsWith('./') || !target.startsWith('packages/silinx-pic24/src/') || !fs.existsSync(path.join(ROOT, target))) bad.push(`${f}: ${spec}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('#5480 silinx-pic24\'s entry exports the core', async () => {
  const api = await import('../packages/silinx-pic24/src/index.js');
  assert.equal(typeof api.CPU, 'function');
  assert.equal(api.device.DEVID, 0x601d);
  const cpu = new api.CPU([0x200050]);   // MOV #5, W0
  assert.equal(cpu.step(), 1);
  assert.equal(cpu.W(0), 5);
});
