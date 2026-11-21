// The Errors / Warnings tabs' entries of the processes whose runs the UI tests do not reach (#4728): an implementation's
// job error said once (jobLog, "Process failed: <error>" its one entry, "see log" none), the user's own Stop
// information, not a warning; the elaboration errors given to setDiagnostics not listed again from their console
// lines; the constraints' quiet check not listing the open editors' problems twice; a summary "generated with errors"
// no entry; Rename Project's refusal information. (The console's runs themselves: test/ui/errors-tab-runs.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../web/js/${f}`, import.meta.url), 'utf8');

test('implement.js: the job\'s error said once, its failure one entry, the user\'s Stop information', () => {
  const src = read('implement.js');
  assert.match(src, /^import \{ jobLog \} from '\.\/job-log\.js';$/m);
  assert.match(src, /const jl = jobLog\(track\.line\);\n\s+const res = await followJob\(job, jl\.line\);\n\s+jl\.end\(res\);/);
  assert.match(src, /log\(`\\nProcess failed: \$\{res\.error \|\| 'see log'\}`, 'err', \{ diag: !!res\.error \}\)/);
  assert.match(src, /log\('\\nProcess stopped by the user\.', 'info'\)/);
  assert.match(src, /log\('Stopping…', 'info'\)/);
  assert.doesNotMatch(src, /stopped by the user\.', 'warn'/);
  // (the quiet constraints' check: the console's, the simulation's (#4746) and the editors' entries left to
  // setDiagnostics, which keeps them)
  assert.match(src, /S\.diags\.filter\(d => d\.source !== 'console' && d\.source !== 'sim' && d\.source !== 'editor' && d\.tool !== 'ConstraintSystem'\)/);
});

test('viewers.js: the elaboration errors listed by setDiagnostics only; "generated with errors" no entry', () => {
  const src = read('viewers.js');
  assert.match(src, /\$\{d\.message\}`, 'err', \{ diag: false \}\);/);
  assert.match(src, /more error\(s\) in the Errors tab\.`, 'err', \{ diag: false \}\);/);
  assert.match(src, /generated with errors \(see Errors tab\)\.`, 'err', \{ diag: false \}\)/);
});

test('console.js: a run\'s header drops its previous entries; its result and SILINX FAILED no entries', () => {
  const src = read('console.js');
  assert.match(src, /S\.diags = S\.diags\.filter\(d => !\(d\.source === 'console' && d\.run === run\)\);/);   // (dropRun, #4749)
  assert.match(src, /if \(RUN_SUMMARY\.test\(line\)\) return;/);
  assert.match(src, /else if \(\/=== SILINX FAILED\/\.test\(line\)\) return;/);
  assert.match(read('project-rename.js'), /if \(no\) \{ logInfo\(`Rename Project: \$\{no\}\.`\); return; \}/);
});
