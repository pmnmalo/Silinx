// A git branch's name, checked as git checks it (git check-ref-format --branch, #4213): the system's git's back end
// asks git too, the browser's (GitHub's REST API, core/git-rest-branch.js) has only this. Isomorphic.

export const BRANCH_HINT = 'A branch\'s name has letters, digits, -, _, . and /, no spaces (e.g. ana, or ana/traffic-lights).';

/** The name trimmed, or an Error (its hint, status 400): none, too long, or one git refuses (a space, .., a control
 *  character, ~ ^ : ? * [ \, @{, a part starting with . or ending with .lock, a leading -, an empty part), HEAD, or
 *  one naming GitHub's copy (origin/…). */
export function checkBranchName(branch, GitError = Error) {
  const b = String(branch ?? '').trim();
  const fail = msg => Object.assign(new GitError(msg), { hint: BRANCH_HINT, status: 400 });
  if (!b) throw fail('a branch needs a name');
  const parts = b.split('/');
  // eslint-disable-next-line no-control-regex
  if (b.length > 100 || /[\x00-\x20\x7f~^:?*[\\]|\.\.|@\{/.test(b) || b === '@' || b === 'HEAD' || b.startsWith('-') || b.endsWith('.')
    || parts.some(p => !p || p.startsWith('.') || p.endsWith('.lock')) || parts[0] === 'origin') throw fail(`'${b}' is not a valid branch name`);
  return b;
}
