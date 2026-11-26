#!/usr/bin/env node
// The sources Silinx pins outside npm against their upstream, monthly (#352, .github/workflows/pins.yml):
// Dependabot (.github/dependabot.yml) follows the npm packages and the GitHub Actions; these it cannot:
//   - Yosys's test designs (scripts/fetch-yosys-tests.mjs YOSYS_TESTS_PIN: a tag and its commit), against
//     Yosys's latest release tag; they follow the Yosys of @yowasp/yosys (package.json), so they are also
//     out of step when their tag is not that Yosys's
//   - the design corpus's repositories (test/designs-corpus/manifest.json: a commit each), against the
//     head of their default branch: how many commits behind, and which of the files the designs use changed
//   - the Model Checking Contest's models of the diagram corpus (test/diagram-corpus/mcc.json: a year's
//     archives), against the latest year of the contest
//   - the packages pinned by a GitHub release's tarball (package.json, packages/silinx-fpga/package.json: the
//     Spartan-6 nextpnr's was, https://github.com/pmnmalo/nextpnr-spartan/releases/download/spartan6-vX.Y.Z/…, #2934;
//     none since it is on npm, #3357), against the repository's latest tag of the same prefix (spartan6-v*)
//   - the pins declared next to the code that uses them (#5649), each one a pin of a generic kind:
//       tag       a repository's tag (`repo`: GitHub's owner/name or a git URL; `tag`), against its latest tag of the
//                 same shape (the same prefix, numbers only: no -rc, -beta), within `series` when given ('9.': KiCad 9's);
//                 with `commit`, the tag's commit checked too
//       commit    a commit (`repo`, `commit`) against the head of `branch` (its default one when none); with `watch`
//                 (paths of a GitHub repository), behind only when one of them changed since; with `remote` ({ url,
//                 match }), the commit read from another repository's file (nextpnr-spartan's SILINX_REF)
//       sha256    a file downloaded from `url`, its SHA-256 pinned (`sha256`), against the file served today
//       reported  what cannot be checked (`current`, `note`: an installer that is not public, a base image), listed
//     each with `name`, and `update` (how to update it) when it says more than its kind's way. A module declares
//     them as `export const PINNED = [ … ]` (core/, server/, scripts/, packages/; built from the constants its
//     code uses, the module importable without side effects); a shell script, a Dockerfile or a workflow as a
//     comment line, `# pinned: { … JSON … }`, whose "match" (a regular expression) reads the value from the same
//     file (its named groups: tag, commit, sha256, url, current). Declared today: the KiCad catalogue's libraries
//     (scripts/kicad-catalogue.mjs, core/kicad-pcm.js), the ported code and data (scripts/third-party.mjs:
//     prjxray, prjxray-db, Apicula), Digilent's master XDCs (core/boards.js), adepttool
//     (scripts/install-adepttool.sh), the Silinx commit nextpnr-spartan's chip databases are built from
//     (scripts/nextpnr-update-report.mjs), the Docker images' bases and tools (docker/ise/Dockerfile,
//     scripts/vitis-hls-image/Dockerfile, scripts/hls-vitis.mjs, core/xc16-compile.js: reported only)
// What is behind becomes one issue, "Pinned sources: newer versions available" (labels enhancement and
// tests & CI), opened or updated (its text replaced); none when all are current, and the issue is closed
// when they become so. As scripts/report-failure.mjs (#251), the issue is written by the workflow.
// Not checked: the VlogHammer generator (a port, test/corpus/vloghammer-gen.mjs), ISE 14.7 (its last version).
// The npm packages (YoWASP's tools and runtime, the nextpnr packages, Yosys) are Dependabot's.
//
//   node scripts/check-pins.mjs [--dry-run]
//   (in GitHub Actions: GITHUB_TOKEN with issues: write, GITHUB_REPOSITORY; without them, or with --dry-run,
//   it prints the issue it would write)
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { YOSYS_TESTS_PIN } from './fetch-yosys-tests.mjs';
import { ownIssue } from './github-text.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TITLE = 'Pinned sources: newer versions available';
export const LABELS = ['enhancement', 'tests & CI'];

// The package.json files whose dependencies may be pinned by a release's URL
const PACKAGE_FILES = ['package.json', 'packages/silinx-fpga/package.json'];

/** A GitHub release asset's URL: { repo, tag, prefix, version } ('spartan6-v0.1.3': prefix 'spartan6-v'), or null. */
export function parseReleaseUrl(url) {
  const m = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/releases\/download\/((.*?v)(\d+\.\d+\.\d+))\/[^/]+$/.exec(String(url || ''));
  return m ? { repo: m[1], tag: m[2], prefix: m[3], version: m[4] } : null;
}

/** The pins of the repository at `root`: [{ kind, name, file, … }] (kind: yosys-tests, commit, mcc, release). */
export function collectPins(root = ROOT, { testsPin = YOSYS_TESTS_PIN } = {}) {
  const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  const pkg = read('package.json');
  const pins = [{ kind: 'yosys-tests', name: 'Yosys\'s test designs', file: 'scripts/fetch-yosys-tests.mjs', repo: 'YosysHQ/yosys', tag: testsPin.tag, commit: testsPin.commit,
    yowasp: pkg.dependencies?.['@yowasp/yosys'] ?? null }];
  const manifest = read('test/designs-corpus/manifest.json');
  for (const [name, src] of Object.entries(manifest.sources)) {
    const used = new Set([src.licenceFile]);
    for (const d of manifest.designs.filter(x => x.source === name)) for (const f of [...d.files, ...(d.testbench?.files || [])]) if (!f.startsWith('local:')) used.add(f);
    pins.push({ kind: 'commit', name: `design corpus: ${name}`, file: 'test/designs-corpus/manifest.json', repo: src.repo, commit: src.commit, used: [...used].sort() });
  }
  const mcc = read('test/diagram-corpus/mcc.json');
  const years = [...new Set(mcc.nets.map(n => +(/mcc\.lip6\.fr\/(\d{4})\//.exec(n.url) || [])[1]).filter(Boolean))];
  pins.push({ kind: 'mcc', name: 'diagram corpus: Model Checking Contest models', file: 'test/diagram-corpus/mcc.json', year: Math.max(...years), models: mcc.nets.map(n => n.instance) });
  // (one pin per package and URL: the files that pin it the same way listed together)
  const releases = new Map();
  for (const file of PACKAGE_FILES) {
    if (!fs.existsSync(path.join(root, file))) continue;
    const json = read(file);
    for (const [name, spec] of Object.entries({ ...json.dependencies, ...json.optionalDependencies })) {
      const rel = parseReleaseUrl(spec);
      if (!rel) continue;
      const key = `${name} ${spec}`;
      if (releases.has(key)) releases.get(key).files.push(file);
      else releases.set(key, { kind: 'release', name, files: [file], ...rel });
    }
  }
  for (const pin of releases.values()) pins.push({ ...pin, file: pin.files.join(', ') });
  return pins;
}

/** `git ls-remote` output as { ref: commit }; an annotated tag's commit (its ^{} line) over the tag object's. */
export function parseLsRemote(text) {
  const out = {};
  for (const line of String(text).split('\n')) {
    const m = /^([0-9a-f]{40})\s+(\S+)$/.exec(line.trim());
    if (!m) continue;
    const peeled = m[2].endsWith('^{}');
    const ref = peeled ? m[2].slice(0, -3) : m[2];
    if (peeled || !(ref in out)) out[ref] = m[1];
  }
  return out;
}

const tagNumbers = t => (/^v(\d+)\.(\d+)(?:\.(\d+))?$/.exec(t) || []).slice(1).map(x => +(x ?? 0));

/** -1 / 0 / 1: release tags 'v0.68' < 'v0.70' < 'v0.70.1' (numerically, not as text). */
export function compareTags(a, b) {
  const x = tagNumbers(a), y = tagNumbers(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0) ? -1 : 1;
  return 0;
}

/** The latest release tag of refs ({ 'refs/tags/v0.70': sha, … }): vX.Y or vX.Y.Z only (no -rc, -dev). */
export function latestReleaseTag(refs) {
  const tags = Object.keys(refs).filter(r => r.startsWith('refs/tags/')).map(r => r.slice(10)).filter(t => tagNumbers(t).length);
  return tags.sort(compareTags).at(-1) ?? null;
}

/** The Yosys tag a YoWASP version runs: '0.70.1258' → 'v0.70'. */
export function yowaspTag(version) {
  const m = /(\d+)\.(\d+)\./.exec(String(version || ''));
  return m ? `v${m[1]}.${m[2]}` : null;
}

/** Yosys's test designs: { pin, behind, current, latest, notes: [] }. refs: Yosys's ls-remote of its tags. */
export function checkYosysTests(pin, refs) {
  const latest = latestReleaseTag(refs);
  const notes = [];
  const follow = yowaspTag(pin.yowasp);
  if (follow && follow !== pin.tag) notes.push(`out of step: @yowasp/yosys ${pin.yowasp} runs Yosys ${follow}, the test designs are ${pin.tag}'s`);
  const tagCommit = refs[`refs/tags/${pin.tag}`];
  if (tagCommit && tagCommit !== pin.commit) notes.push(`the commit pinned (${pin.commit.slice(0, 7)}) is not ${pin.tag}'s (${tagCommit.slice(0, 7)})`);
  // (out of step or the wrong commit: to look at even when no newer Yosys exists)
  const wrong = notes.length > 0;
  const newer = !!latest && compareTags(latest, pin.tag) > 0;
  if (newer) notes.push(`they follow the Yosys of @yowasp/yosys${follow ? ` (${follow})` : ''}: pinned again with a Yosys update (a "yosys update" pull request)`);
  return { pin, current: pin.tag, latest: latest ?? '?', behind: newer || wrong, notes };
}

/**
 * A commit pin against its repository's head: { pin, behind, current, latest, notes }. compare: GitHub's
 * comparison of the two ({ ahead_by, files: [path] }) or null (not available: only the commits differ).
 */
export function checkCommit(pin, head, compare = null) {
  const notes = [];
  if (!head) return { pin, current: pin.commit.slice(0, 7), latest: '?', behind: false, notes: ['the head of the repository could not be read'] };
  if (sameCommit(head, pin.commit)) return { pin, current: pin.commit.slice(0, 7), latest: head.slice(0, 7), behind: false, notes };
  if (compare) {
    notes.push(`${compare.ahead_by} commit${compare.ahead_by === 1 ? '' : 's'} behind`);
    // (a corpus source's: the files its designs use)
    if (pin.used) {
      const changed = new Set(compare.files || []);
      const used = pin.used.filter(f => changed.has(f));
      notes.push(used.length ? `files the designs use changed: ${used.map(f => `\`${f}\``).join(', ')}` : 'none of the files the designs use changed');
    }
  }
  return { pin, current: pin.commit.slice(0, 7), latest: head.slice(0, 7), behind: true, notes };
}

/** The MCC models: { pin, behind, current, latest, notes }. years: the contest years that exist (any order). */
export function checkMcc(pin, years) {
  const latest = Math.max(pin.year, ...years);
  return { pin, current: String(pin.year), latest: String(latest), behind: latest > pin.year,
    notes: latest > pin.year ? [`the models of MCC ${latest} (https://mcc.lip6.fr/${latest}/models.php): their archives' SHA-256 and expected values change with them`] : [] };
}

/** -1 / 0 / 1: versions X.Y.Z (any number of parts) compared as numbers. */
export function compareVersions(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length, 3); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1;
  return 0;
}

/** A release pin against its repository's tags of the same prefix (refs: their ls-remote): { pin, behind, current, latest, notes }. */
export function checkRelease(pin, refs) {
  const versions = Object.keys(refs).filter(r => r.startsWith(`refs/tags/${pin.prefix}`)).map(r => r.slice(10 + pin.prefix.length)).filter(v => /^\d+\.\d+\.\d+$/.test(v));
  const latest = versions.sort(compareVersions).at(-1);
  if (!latest) return { pin, current: pin.tag, latest: '?', behind: false, notes: [`no ${pin.prefix}* tag in ${pin.repo}`] };
  const behind = compareVersions(latest, pin.version) > 0;
  return { pin, current: pin.tag, latest: `${pin.prefix}${latest}`, behind,
    notes: behind ? [`a "nextpnr update" pull request: the URL's tag and file name in ${pin.file}, \`npm install\`; its comparison reviewed (#2935)`] : [] };
}

/** Two commits the same, one of them abbreviated (7 hexadecimal digits at least). */
export function sameCommit(a, b) {
  const x = String(a || '').toLowerCase(), y = String(b || '').toLowerCase();
  return Math.min(x.length, y.length) >= 7 && (x.startsWith(y) || y.startsWith(x));
}

/** A tag's shape: { prefix, version } ('v10.0.0': 'v', '10.0.0'; '0.32': '', '0.32'), or null. */
export function tagShape(tag) {
  const m = /^(.*?)(\d+(?:\.\d+)*)$/.exec(String(tag || ''));
  return m ? { prefix: m[1], version: m[2] } : null;
}

/**
 * A tag pin against its repository's tags (refs: their ls-remote): the latest of the same shape, within the pin's
 * series; with a commit pinned, the tag's own commit too. { pin, behind, current, latest, notes }.
 */
export function checkTag(pin, refs) {
  const shape = tagShape(pin.tag);
  const notes = [];
  const versions = Object.keys(refs).filter(r => r.startsWith(`refs/tags/${shape.prefix}`)).map(r => r.slice(10 + shape.prefix.length))
    .filter(v => /^\d+(\.\d+)*$/.test(v) && (!pin.series || v.startsWith(pin.series)));
  const latest = versions.sort(compareVersions).at(-1);
  const own = refs[`refs/tags/${pin.tag}`];
  if (!own) notes.push(`the tag pinned, ${pin.tag}, is not in ${pin.repo}`);
  else if (pin.commit && !sameCommit(own, pin.commit)) notes.push(`the commit pinned (${pin.commit.slice(0, 7)}) is not ${pin.tag}'s (${own.slice(0, 7)})`);
  // (a missing tag or the wrong commit: to look at even when no newer tag exists)
  const newer = !!latest && compareVersions(latest, shape.version) > 0;
  if (!latest) notes.push(`no ${shape.prefix}${pin.series || ''}* tag in ${pin.repo}`);
  return { pin, current: pin.tag, latest: latest ? `${shape.prefix}${latest}` : '?', behind: newer || (!!latest && notes.length > 0), notes };
}

/** A commit pin whose `watch` paths are followed: behind when one of them changed after it (changed: those paths). */
export function checkWatched(pin, head, changed) {
  if (!head) return checkCommit(pin, null);
  const behind = changed.length > 0;
  return { pin, current: pin.commit.slice(0, 7), latest: head.slice(0, 7), behind,
    notes: behind ? [`changed since: ${changed.map(f => `\`${f}\``).join(', ')}`] : [] };
}

/** A file's SHA-256 pinned against the one of the file served today (sha256: its hexadecimal SHA-256). */
export function checkSha256(pin, sha256) {
  const changed = sha256.toLowerCase() !== pin.sha256.toLowerCase();
  return { pin, current: pin.sha256.slice(0, 12), latest: sha256.slice(0, 12), behind: changed,
    notes: changed ? [`the file served at ${pin.url} changed: not the SHA-256 pinned`] : [] };
}

/** A pin that cannot be checked: listed as it is. */
export const checkReported = pin => ({ pin, current: pin.current, latest: '—', behind: false, reported: true, notes: pin.note ? [pin.note] : [] });

const KINDS = {
  tag: p => typeof p.repo === 'string' && !!tagShape(p.tag) && (p.commit === undefined || /^[0-9a-f]{7,40}$/.test(p.commit)),
  commit: p => typeof p.repo === 'string' && (/^[0-9a-f]{7,40}$/.test(p.commit || '') || (!!p.remote?.url && !!p.remote?.match))
    && (p.watch === undefined || (Array.isArray(p.watch) && p.watch.length > 0 && /^[\w.-]+\/[\w.-]+$/.test(p.repo))),
  sha256: p => /^https:\/\//.test(p.url || '') && /^[0-9a-f]{64}$/i.test(p.sha256 || ''),
  reported: p => typeof p.current === 'string' && !!p.current,
};

/** A declared pin's error ('' when it is a pin of a known kind with what its kind needs). */
export function pinError(p) {
  if (!p || typeof p !== 'object') return 'not an object';
  if (typeof p.name !== 'string' || !p.name) return 'no name';
  if (!KINDS[p.kind]) return `${p.name}: no kind ${JSON.stringify(p.kind)} (${Object.keys(KINDS).join(', ')})`;
  return KINDS[p.kind](p) ? '' : `${p.name}: not what a ${p.kind} pin needs`;
}

// Where pins are declared, and the files read for them
const DECLARING = ['core', 'server', 'scripts', 'packages', 'docker'];
const DECLARING_FILE = /\.(m?js|sh|ps1|py|ya?ml|md|txt)$|(^|\/)Dockerfile$/;
const COMMENT_PIN = /^[ \t]*(?:#|\/\/|<!--)[ \t]*pinned: (\{.*\})[ \t]*(?:-->)?[ \t]*$/gm;

/** A file's comment pins (`# pinned: {…}`, its "match" read in the same text): { pins, errors }. */
export function commentPins(text, file) {
  const pins = [], errors = [];
  for (const [, json] of String(text).matchAll(COMMENT_PIN)) {
    let p;
    try { p = JSON.parse(json); } catch (e) { errors.push(`${file}: a pin that is not JSON: ${e.message}`); continue; }
    const { match, ...pin } = p;
    if (match) {
      const m = new RegExp(match, 'm').exec(text);
      if (!m) { errors.push(`${file}: ${pin.name || 'a pin'}: its match finds nothing`); continue; }
      for (const k of ['tag', 'commit', 'sha256', 'url', 'current']) if (m.groups?.[k] !== undefined) pin[k] = m.groups[k];
    }
    const err = pinError(pin);
    if (err) errors.push(`${file}: ${err}`);
    else pins.push({ ...pin, file, declared: true });
  }
  return { pins, errors };
}

/**
 * The pins declared in the repository at `root` (#5649): the modules' PINNED and the files' comment pins.
 * files: the paths to read (default: git's tracked files of the declaring folders). { pins, errors }.
 */
export async function collectDeclared(root = ROOT, { files } = {}) {
  files ??= execFileSync('git', ['ls-files', '--', ...DECLARING], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n');
  const pins = [], errors = [];
  for (const file of files.filter(f => DECLARING_FILE.test(f) && !/(^|\/)(test|node_modules)\//.test(f))) {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    if (/\.m?js$/.test(file) && /^export const PINNED\b/m.test(text)) {
      try {
        const list = (await import(pathToFileURL(abs).href)).PINNED;
        if (!Array.isArray(list)) throw new Error('PINNED is not an array');
        for (const p of list) { const err = pinError(p); if (err) errors.push(`${file}: ${err}`); else pins.push({ ...p, file, declared: true }); }
      } catch (e) { errors.push(`${file}: ${e.message.split('\n')[0]}`); }
    }
    const c = commentPins(text, file);
    pins.push(...c.pins);
    errors.push(...c.errors);
  }
  return { pins, errors };
}

/** A repository's git URL: GitHub's owner/name, or the URL given. */
export const gitUrl = repo => (repo.includes('://') ? repo : `https://github.com/${repo}.git`);
const repoLink = repo => (repo.includes('://') ? repo.replace(/\.git$/, '') : `https://github.com/${repo}`);
const repoLabel = repo => repo.replace(/^https:\/\//, '').replace(/\.git$/, '');

const HOW = {
  'yosys-tests': 'with the Yosys update: `YOSYS_TESTS_PIN` (the tag and its commit), `npm run test:corpus -- --update`, test/corpus/README.md',
  commit: 'test/designs-corpus/manifest.json (the commit), then `npm run fetch:designs` and `npm run test:designs`; review the changes, `--update` records them',
  mcc: 'test/diagram-corpus/mcc.json (url, sha256, file, expected: the contest\'s consensus), `npm run fetch:diagrams`, `npm run test:diagrams`',
  release: 'the release\'s URL in the package.json (its tag and its file name), `npm install`, then the package\'s tests and the comparison of its pull request',
};
// (a declared pin's way, when it gives none of its own)
const DECLARED_HOW = {
  tag: 'the tag (and its commit) where it is declared, then the tests of the code that reads it',
  commit: 'the commit where it is declared, then the tests of the code that reads it',
  sha256: 'the file looked at, its new SHA-256 where it is declared, then the tests of the code that reads it',
};
const KIND_NAMES = { commit: 'the design corpus', mcc: 'the MCC models', 'yosys-tests': 'Yosys\'s test designs', release: 'the packages pinned by a release' };

/** The issue's text for the checks that are behind (and those that could not be read). */
export function issueBody(checks, date) {
  const behind = checks.filter(c => c.behind);
  const L = [`Sources pinned outside npm with newer versions upstream (checked ${date} by .github/workflows/pins.yml, scripts/check-pins.mjs). `
    + 'npm packages and GitHub Actions: Dependabot\'s pull requests.', '',
  '| source | file | pinned | latest | notes |', '|---|---|---|---|---|'];
  for (const c of behind) L.push(`| ${c.pin.name}${c.pin.repo ? ` ([${repoLabel(c.pin.repo)}](${repoLink(c.pin.repo)}))` : ''} | ${c.pin.file} | ${c.current} | ${c.latest} | ${c.notes.join('; ')} |`);
  L.push('', 'To update (each a change of its own, reviewed: new sources can change the results):', '');
  for (const kind of [...new Set(behind.filter(c => !c.pin.declared).map(c => c.pin.kind))]) L.push(`- ${KIND_NAMES[kind]}: ${HOW[kind]}`);
  for (const c of behind.filter(x => x.pin.declared)) L.push(`- ${c.pin.name}: ${c.pin.update || DECLARED_HOW[c.pin.kind]}`);
  const unread = checks.filter(c => !c.behind && !c.reported && c.notes.length);
  if (unread.length) L.push('', 'Not checked:', '', ...unread.map(c => `- ${c.pin.name}: ${c.notes.join('; ')}`));
  const reported = checks.filter(c => c.reported);
  if (reported.length) L.push('', 'Reported only (not checkable from here: look at them by hand):', '', ...reported.map(c => `- ${c.pin.name} (${c.pin.file}): ${c.current}${c.notes.length ? `: ${c.notes.join('; ')}` : ''}`));
  L.push('', '(Written by the workflow: the next month\'s check replaces this text, and closes the issue when all are current.)');
  return L.join('\n');
}

/** What to do with the issue: 'open' | 'update' | 'close' | 'none'. */
export function issueAction(open, behindCount) {
  if (behindCount) return open ? 'update' : 'open';
  return open ? 'close' : 'none';
}

const run = promisify(execFile);
const lsRemote = async (repoUrl, ...refs) => parseLsRemote((await run('git', ['ls-remote', repoUrl, ...refs], { maxBuffer: 64 << 20, timeout: 120000 })).stdout);

/** A declared commit pin's commit: its own, or read from its remote file. */
async function resolveCommit(pin, net) {
  if (!pin.remote) return pin;
  const m = new RegExp(pin.remote.match, 'm').exec(await net.text(pin.remote.url));
  const commit = m?.groups?.commit ?? m?.[1];
  if (!commit || !/^[0-9a-f]{7,40}$/.test(commit)) throw new Error(`no commit in ${pin.remote.url}`);
  return { ...pin, commit };
}

/** A declared commit pin checked: against its branch's head, its watched paths when it has some. */
async function checkDeclaredCommit(declared, net) {
  const pin = await resolveCommit(declared, net);
  const ref = pin.branch ? `refs/heads/${pin.branch}` : 'HEAD';
  const head = (await net.lsRemote(gitUrl(pin.repo), ref))[ref] ?? null;
  if (!pin.watch) {
    let cmp = null;
    if (head && !sameCommit(head, pin.commit) && !pin.repo.includes('://')) { try { cmp = await net.compare(pin.repo, pin.commit, head); } catch (e) { console.error(`${pin.repo}: ${e.message}`); } }
    return checkCommit(pin, head, cmp && { ahead_by: cmp.ahead_by, files: [] });
  }
  const changed = [];
  for (const p of pin.watch) {
    const last = await net.lastCommit(pin.repo, pin.branch || 'HEAD', p);
    if (last && !sameCommit(last, pin.commit) && (await net.compare(pin.repo, pin.commit, last)).ahead_by > 0) changed.push(p);
  }
  return checkWatched(pin, head, changed);
}

/**
 * Every pin checked; net: { lsRemote(url, …refs), compare(repo, base, head), exists(url), text(url), sha256(url),
 * lastCommit(repo, branch, path) } (injected in the tests).
 */
export async function checkAll(pins, net) {
  const out = [];
  for (const pin of pins) {
    try {
      if (pin.declared) {
        if (pin.kind === 'tag') out.push(checkTag(pin, await net.lsRemote(gitUrl(pin.repo), 'refs/tags/*')));
        else if (pin.kind === 'commit') out.push(await checkDeclaredCommit(pin, net));
        else if (pin.kind === 'sha256') out.push(checkSha256(pin, await net.sha256(pin.url)));
        else if (pin.kind === 'reported') out.push(checkReported(pin));
      } else if (pin.kind === 'yosys-tests') out.push(checkYosysTests(pin, await net.lsRemote(`https://github.com/${pin.repo}.git`, 'refs/tags/v*')));
      else if (pin.kind === 'commit') {
        const head = (await net.lsRemote(`https://github.com/${pin.repo}.git`, 'HEAD')).HEAD ?? null;
        let cmp = null;
        if (head && head !== pin.commit) { try { cmp = await net.compare(pin.repo, pin.commit, head); } catch (e) { console.error(`${pin.repo}: ${e.message}`); } }
        out.push(checkCommit(pin, head, cmp));
      } else if (pin.kind === 'mcc') {
        const years = [];
        for (let y = pin.year + 1; y <= new Date().getUTCFullYear(); y++) if (await net.exists(`https://mcc.lip6.fr/${y}/models.php`)) years.push(y);
        out.push(checkMcc(pin, years));
      } else if (pin.kind === 'release') out.push(checkRelease(pin, await net.lsRemote(`https://github.com/${pin.repo}.git`, `refs/tags/${pin.prefix}*`)));
    } catch (e) {
      out.push({ pin, current: pin.tag || pin.commit?.slice(0, 7) || pin.sha256?.slice(0, 12) || (pin.remote ? '?' : String(pin.year)), latest: '?', behind: false, notes: [`could not be checked: ${e.message.split('\n')[0]}`] });
    }
  }
  return out;
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env;
  const gh = async (url, opts = {}) => {
    const r = await fetch(url.startsWith('http') ? url : `https://api.github.com/${url}`, { ...opts, headers: { Accept: 'application/vnd.github+json', ...(token && { Authorization: `Bearer ${token}` }), ...(opts.body && { 'Content-Type': 'application/json' }) } });
    if (!r.ok) throw new Error(`GitHub API ${url}: ${r.status} ${r.statusText}`);
    return r.json();
  };
  const net = {
    lsRemote,
    compare: async (r, base, head) => { const c = await gh(`repos/${r}/compare/${base}...${head}`); return { ahead_by: c.ahead_by, files: (c.files || []).map(f => f.filename) }; },
    // (a year without a contest is a redirect to the site's error page: not followed)
    exists: async url => { try { return (await fetch(url, { method: 'HEAD', redirect: 'manual' })).status === 200; } catch { return false; } },
    text: async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r.text(); },
    sha256: async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'); },
    lastCommit: async (r, branch, p) => (await gh(`repos/${r}/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(p)}&per_page=1`))[0]?.sha ?? null,
  };
  const declared = await collectDeclared();
  const checks = await checkAll([...collectPins(), ...declared.pins], net);
  // (a declaration that cannot be read: in the issue's "Not checked")
  for (const e of declared.errors) checks.push({ pin: { name: 'a pin declaration', kind: 'error' }, current: '?', latest: '?', behind: false, notes: [e] });
  for (const c of checks) console.log(`${c.behind ? 'BEHIND ' : 'current'} ${c.pin.name}: ${c.current} (latest ${c.latest})${c.notes.length ? `: ${c.notes.join('; ')}` : ''}`);
  const behind = checks.filter(c => c.behind);
  const body = issueBody(checks, new Date().toISOString().slice(0, 10));
  if (dry || !token || !repo) { console.log(`\n${behind.length ? `the issue "${TITLE}":\n\n${body}` : 'all current: no issue'}`); return; }
  const open = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await gh(`repos/${repo}/issues?state=open&per_page=100&page=${page}`);
    open.push(...batch.filter(i => !i.pull_request));
    if (batch.length < 100) break;
  }
  // (the bot's own issue only: one of the same title by anyone else is not taken, #3417)
  const issue = ownIssue(open, TITLE);
  const action = issueAction(issue, behind.length);
  if (action === 'open') console.log(`opened #${(await gh(`repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: TITLE, body, labels: LABELS }) })).number}`);
  else if (action === 'update') { await gh(`repos/${repo}/issues/${issue.number}`, { method: 'PATCH', body: JSON.stringify({ body }) }); console.log(`updated #${issue.number}`); }
  else if (action === 'close') {
    await gh(`repos/${repo}/issues/${issue.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `All pinned sources are current (${new Date().toISOString().slice(0, 10)}, scripts/check-pins.mjs).` }) });
    await gh(`repos/${repo}/issues/${issue.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
    console.log(`closed #${issue.number}`);
  } else console.log('all current: no issue');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
