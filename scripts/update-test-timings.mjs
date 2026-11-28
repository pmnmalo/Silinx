#!/usr/bin/env node
// test/timings.json from a run of CI (#573): each unit job on Linux uploads how long its files took
// (artifact unit-times-<part>, scripts/test-times-reporter.mjs), and each UI job its UI files' (artifact
// ui-times-<interface>-<part>, #912); this merges them, the files that no longer exist left out, a UI file's
// time the slower interface's, and writes the timings that scripts/test-shard.mjs balances the parts by.
// The usability tests run in a workflow of their own (usability.yml, artifacts usability-times-…, #5295): a run of
// either refreshes its own files' times and keeps the others' as they were.
//
//   node scripts/update-test-timings.mjs <run id>     (gh, logged in; or --from <folder> of the artifacts)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TIMINGS, readTimings, testFiles, unitFiles } from './test-shard.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The timings of the existing files from the parts' JSON objects, sorted by file; a file measured more
 *  than once (a UI file, in each interface) the longest. A file this run did not measure keeps its time of before
 *  (keep): the usability files and the others are measured by runs of their own (#5295), and a part cut off by its
 *  step's time limit measures only its first files (#5836). */
export function merge(parts, files, keep = {}) {
  const all = {};
  for (const p of parts) for (const [f, t] of Object.entries(p)) if (typeof t === 'number') all[f] = Math.max(all[f] ?? 0, t);
  for (const [f, t] of Object.entries(keep)) if (!(f in all) && typeof t === 'number') all[f] = t;
  return Object.fromEntries(files.filter(f => f in all).map(f => [f, all[f]]));
}

/** Every test-times.json under a folder (the downloaded artifacts); one that is not JSON (a part cut off by its step's
 *  time limit, its file never finished, #5836) left out, its path in `skipped`: its files keep their times. */
export function readParts(dir, skipped = []) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || e.name !== 'test-times.json') continue;
    const f = path.join(e.parentPath ?? e.path, e.name);
    try { out.push(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { skipped.push(path.relative(dir, f)); }
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  let dir;
  if (args[0] === '--from') dir = args[1];
  else if (/^\d+$/.test(args[0] ?? '')) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-test-times-'));
    execFileSync('gh', ['run', 'download', args[0], '--pattern', 'unit-times-*', '--pattern', 'ui-times-*',
      '--pattern', 'usability-times-*', '--dir', dir], { cwd: ROOT, stdio: 'inherit' });
  } else { console.error('usage: node scripts/update-test-timings.mjs <run id> | --from <folder>'); process.exit(2); }
  const skipped = [];
  const parts = readParts(dir, skipped);
  if (skipped.length) console.log(`left out, not JSON (a part cut off?): ${skipped.join(', ')}`);
  if (!parts.length) { console.error(`no test-times.json in ${dir}`); process.exit(1); }
  const files = [...unitFiles(ROOT), ...testFiles(ROOT, 'test/ui'), ...testFiles(ROOT, 'test/usability')].sort();
  const t = merge(parts, files, readTimings(ROOT));
  fs.writeFileSync(path.join(ROOT, TIMINGS), `${JSON.stringify(t, null, 2)}\n`);
  const missing = files.filter(f => !(f in t));
  console.log(`${TIMINGS}: ${Object.keys(t).length} files, ${Math.round(Object.values(t).reduce((a, b) => a + b, 0) / 60)} min in all${missing.length ? `; not measured: ${missing.join(', ')}` : ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
