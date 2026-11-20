// The Collaboration tab's messages go to the console's Design filter (#4632): every collaboration module (git, GitHub,
// live sharing, the relay, Share Project…'s links and short links) writes through web/js/collab-log.js's collabLog, never
// the console's log (whose lines take the source of the last process run, or the application's: All only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

globalThis.addEventListener ??= () => {};
const M = await import('../web/js/messages.js');

const DIR = new URL('../web/js/', import.meta.url);
const read = f => readFileSync(new URL(f, DIR), 'utf8');
// the collaboration's modules, by their names: a new one is checked too
const COLLAB = /^(collab-.*|git(-.*)?|github-app|relay-.*|share-.*|short-links|link-copy)\.js$/;
// collab-runs.js: a shared project's runs mirrored to its followers keep their processes' sources (Implementation,
// Simulation…), as the owner's console shows them; collab-log.js: the helper itself; backup-reminder.js: the application's
// line about the browser's storage (#4971), its api.gitRemote only choosing its button's label (#5006)
const EXCEPT = new Set(['collab-runs.js', 'collab-log.js', 'backup-reminder.js']);
// (and every module that calls the collaboration's server, whatever its name, #4729: Merge Contribution's dialog)
const COLLAB_API = /\bapi\.(mergePreview|mergeContribution|undoMerge|git[A-Z]\w*|share[A-Z]\w*|relay[A-Z]\w*|shortLinks?\w*)\(/;
const modules = readdirSync(DIR).filter(f => f.endsWith('.js') && (COLLAB.test(f) || COLLAB_API.test(read(f))) && !EXCEPT.has(f)).sort();
// (the code without its comments and strings' insides would be safer, but no module names log in a comment's call form)
const CONSOLE_WRITERS = /(?<![\w.$])(log|logLine|logError|logWarning|logInfo)\(|\bapp\.log\b/;

test('the collaboration modules are found (git, sharing, relay, links)', () => {
  for (const f of ['git.js', 'git-branch.js', 'git-signin.js', 'git-clone-exists.js', 'collab-share.js', 'collab-follow.js',
    'collab-host.js', 'collab-meet.js', 'collab-leave.js', 'relay-setup.js', 'short-links.js', 'link-copy.js', 'share-how.js',
    'merge-dialog.js'])   // (found by the server's calls it makes, #4729)
    assert.ok(modules.includes(f), f);
});

test('every collaboration module writes to the console through collabLog only', () => {
  const bad = [], writers = [];
  for (const f of modules) {
    const src = read(f);
    src.split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*\*)/.test(line)) return;   // (a comment)
      if (CONSOLE_WRITERS.test(line)) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
    assert.doesNotMatch(src, /import \{[^}]*\b(log|logLine|logError|logWarning|logInfo)\b[^}]*\} from '\.\/console\.js'/, f);
    if (/\bcollabLog\(/.test(src)) {
      writers.push(f);
      assert.match(src, /^import \{ collabLog \} from '\.\/collab-log\.js';$/m, `${f} imports collabLog`);
    }
  }
  assert.deepEqual(bad, [], 'a collaboration message written past collabLog');
  // the modules that write messages (a new one adds itself here once it writes)
  assert.deepEqual(writers, ['collab-follow.js', 'collab-host.js', 'collab-leave.js', 'collab-meet.js', 'collab-share.js',
    'collab-try.js', 'collab-users.js', 'git-branch.js', 'git-clone-exists.js', 'git-repo-list.js', 'git-signin.js', 'git.js',
    'link-copy.js', 'merge-dialog.js', 'relay-setup.js', 'short-links.js']);
});

test("collabLog's source is the console's Design filter, and log() keeps a writer's source", () => {
  const helper = read('collab-log.js');
  const src = /export const COLLAB_SOURCE = '(\w+)';/.exec(helper)?.[1];
  assert.equal(src, 'check');
  assert.ok(M.SOURCES.includes(src));
  assert.equal(M.SOURCE_LABEL[src], 'Design');
  assert.match(helper, /log\(text, cls, \{ \.\.\.opts, src: COLLAB_SOURCE \}\)/);
  // (console.js's log marks the line: its source kept, whatever process ran last; messages.js keeps it)
  // (#4749: each line's source decided in log(), a writer's its own)
  assert.match(read('console.js'), /let source = src;\n\s+if \(!source\) \[source, lineCur\] = lineSource\(line, lineCur\);/);
  assert.match(read('console.js'), /'data-src': source, \.\.\.\(src \? \{ 'data-own-src': '' \} : \{\}\)/);
  assert.match(read('messages.js'), /ln\.dataset\.ownSrc === undefined/);
});
