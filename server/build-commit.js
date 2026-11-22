// The commit a build is made from (#135, #5202): a release's (the commit tagged v<VERSION>, or no git: a release's
// archive) or a development build's. The single-file edition's (scripts/build-info.mjs re-exports it) and the local
// server's channel (server/build-channel.js).
import { execFileSync } from 'node:child_process';

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** null for the release's commit (or no git), else { commit, date } (the short hash, the commit's date and time, YYYY-MM-DD HH:MM). */
export function buildInfo(root, version, env = process.env) {
  // the release workflow (a pushed tag v<VERSION>, its shallow checkout)
  if (env.GITHUB_REF === `refs/tags/v${version}`) return null;
  let commit;
  try { commit = git(root, 'rev-parse', '--short=7', 'HEAD'); } catch { return null; }
  let tags = [];
  try { tags = git(root, 'tag', '--points-at', 'HEAD').split('\n'); } catch { /* none */ }
  if (tags.includes(`v${version}`)) return null;
  let date = null;
  try { date = git(root, 'log', '-1', '--date=format:%Y-%m-%d %H:%M', '--format=%cd', 'HEAD') || null; } catch { /* none */ }
  return { commit, date };
}
