// A stand-in for GitHub's command line (#4653, server/git-repos.js), run as `node test/fake-gh.mjs api <path>`: the user's
// repositories of FAKE_GH_REPOS (a JSON file: GitHub's objects), a page of them as GitHub's API gives it; FAKE_GH_MODE
// (or the file's { "mode": … }, which a running server's tests rewrite) 'signed-out': gh's answer when it is not signed
// in; 'broken': a failure of another kind.
import fs from 'node:fs';

const [, , cmd, p = ''] = process.argv;
const data = JSON.parse(fs.readFileSync(process.env.FAKE_GH_REPOS, 'utf8'));
const mode = process.env.FAKE_GH_MODE || data.mode || '';
if (mode === 'signed-out') {
  process.stderr.write('To get started with GitHub CLI, please run:  gh auth login\nAlternatively, populate the GH_TOKEN environment variable with a GitHub API authentication token.\n');
  process.exit(4);
}
if (mode === 'broken' || cmd !== 'api') {
  process.stderr.write('HTTP 502: Bad Gateway (https://api.github.com/user/repos)\n');
  process.exit(1);
}
const url = new URL(p, 'https://api.github.com/');
const all = Array.isArray(data) ? data : [];
const per = Number(url.searchParams.get('per_page') || 30), page = Number(url.searchParams.get('page') || 1);
process.stdout.write(JSON.stringify(all.slice((page - 1) * per, page * per)));
