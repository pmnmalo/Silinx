// Project storage: one directory per project with a silinx.json descriptor.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import './build-channel.js';   // (the build's channel set, #5202: every server imports this module)
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { constraintsExtOf } from '../packages/silinx-fpga/src/parts.js';
import { boardConstraintsFile, ucfPort } from '../core/board-constraints.js';
import { resolveBoard } from './devices.js';
import { topForBoard } from '../core/board-generics.js';
import { realOf, nativeRealOf, hiddenName, within, readWithin, createWithin } from './paths.js';
import { topNameError } from './ident.js';
import { filePath, normalizePath } from '../core/import-gate.js';
import { foldName, sameNameIn, spelledAs } from '../core/fold-name.js';
import { fsFailure } from './fs-error.js';
import { mapLimit, filesOf } from './concurrent.js';
import { PROJECT_NAME_RE, projectNameError, sameProject } from '../core/project-name.js';
import { CODESIGN_KIND, boardRefusal, createRefusal } from '../core/project-kind.js';
import { newSystemFile } from '../core/system-doc.js';
import { newProjectJson, projectJsonText } from '../core/project-defaults.js';
import { renameProblem, renamedFile } from '../core/project-rename.js';
import { withFileLock } from './project-lock.js';
import { langOfPath } from '../core/file-kinds.js';
import { registerWritten, renameEntries, deleteEntries } from '../core/project-entries.js';
import { trashTime, expiredTrash } from '../core/trash.js';
import { formatVersion, downgradeRefusal } from '../core/doc-format.js';
import { noteWritten, noteRemoved, noteMoving } from './own-writes.js';
import { UNRECORDED } from '../core/trust.js';
import * as trustStore from './trust-store.js';
import * as backupStore from './backup-store.js';
import { parseDescription } from '../core/project-json.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EXAMPLES_DIR = path.join(HERE, '..', 'examples');
// the test designs (#1746): the designs Silinx is tested with, a category of New Project's templates apart from the
// examples (core/test-designs.js)
export const TEST_DESIGNS_DIR = path.join(HERE, '..', 'test-designs');

/** The template folders of a kind (examples or test designs): the names of those that have a silinx.json. */
export function templateNames(dir) {
  let ents = [];
  try { ents = fsSync.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return ents.filter(d => d.isDirectory() && fsSync.existsSync(path.join(dir, d.name, PROJECT_FILE))).map(d => d.name);
}

export const PROJECT_FILE = 'silinx.json';

/** An example's description and files: { project, files: { path: text } } (silinx.json apart; #2826: a link to it
 *  opens the project of that name as it is when it has the same files). */
export function exampleFiles(name) {
  const dir = path.join(EXAMPLES_DIR, String(name));
  if (!/^[a-z0-9_-]+$/i.test(String(name)) || !fsSync.existsSync(path.join(dir, PROJECT_FILE))) throw new HttpError(404, `unknown example '${name}'`);
  const files = {};
  const walk = sub => {
    for (const d of fsSync.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${d.name}` : d.name;
      if (d.isDirectory()) walk(rel);
      else if (d.isFile() && rel !== PROJECT_FILE) files[rel] = fsSync.readFileSync(path.join(dir, rel), 'utf8');
    }
  };
  walk('');
  return { project: parseDescription(fsSync.readFileSync(path.join(dir, PROJECT_FILE), 'utf8')), files };
}

export function workspaceDir() {
  return process.env.SILINX_WORKSPACE || path.join(os.homedir(), 'Silinx-projects');
}

const projectFile = async dir => path.join(dir, PROJECT_FILE);

const NAME_RE = PROJECT_NAME_RE;   // (core/project-name.js: the page's, the stores', the MCP's, #3538)

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
// a file system error on `full` (in the project's folder `dir`) as an HttpError with the project's path (#3537), any
// other error as it is
const fsHttpError = async (e, dir, full) => { const f = await fsFailure(e, dir, full); return f ? new HttpError(f.status, f.message) : e; };

// (the name's rule keeps the folder in the workspace; the check after it says so where CodeQL's js/path-injection sees
// it, as safeJoin's: a resolved path that starts with its root's, #3648)
export function projectDir(name) {
  const bad = projectNameError(name);
  if (bad) throw new HttpError(400, bad);
  const ws = path.resolve(workspaceDir()), dir = path.resolve(ws, name);
  if (!dir.startsWith(ws + path.sep)) throw new HttpError(400, `invalid project name '${name}'`);
  return dir;
}

// Resolve a project-relative path, refusing anything that escapes the project folder (by a symbolic link too, #1234).
export function safeJoin(dir, rel) {
  if (!rel || typeof rel !== 'string') throw new HttpError(400, 'missing path');
  const root = path.resolve(dir), full = path.resolve(root, rel);
  if (full === root) return root;
  if (!full.startsWith(root + path.sep) || !within(dir, full)) throw new HttpError(400, 'path escapes project');
  return full;
}

// (core/file-kinds.js's one rule, as the browser edition's: a GateMate's .ccf a constraints file too, #4766)
export const langOf = langOfPath;

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }

// when a project last changed (ms): its newest file, the build's outputs and hidden folders aside (#1156); its folders
// read and its files statted a few at a time, not one after another (#4775)
async function lastChange(dir) {
  const files = await filesOf(dir, { skip: name => name.startsWith('.') || name === 'build' });
  const times = await mapLimit(files, STATS, async rel => (await fs.stat(path.join(dir, rel)).catch(() => null))?.mtimeMs || 0);
  return Math.round(Math.max(0, ...times));
}
const STATS = 32;   // (the file-system calls waiting at once)

export async function listProjects() {
  const ws = workspaceDir();
  await fs.mkdir(ws, { recursive: true });
  // (a folder whose name is no project's is none, whatever it holds: no route opens it, #3522)
  const ents = (await fs.readdir(ws, { withFileTypes: true })).filter(ent => ent.isDirectory() && !ent.name.startsWith('.') && NAME_RE.test(ent.name));
  // (the projects looked at a few at a time, #4775)
  const out = await mapLimit(ents, 4, async ent => {
    const dir = path.join(ws, ent.name);
    let text;
    try { text = await fs.readFile(await projectFile(dir), 'utf8'); } catch { return null; }   // (not a project)
    // a silinx.json that is no description (a merge's conflict marks, an editor's mistake, #4755): the project listed,
    // damaged, with why, its name taken; never hidden as if it were none
    let pj;
    try { pj = parseDescription(text); if (!pj || typeof pj !== 'object' || Array.isArray(pj)) throw new SyntaxError('not an object'); }
    catch (e) { return { name: ent.name, damaged: damagedText(e), modified: await lastChange(dir) }; }
    return { name: ent.name, device: pj.device, top: pj.top, board: pj.board, ...(pj.kind ? { kind: pj.kind } : {}), modified: await lastChange(dir) };
  });
  return out.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

// a project cloned from a repository (#3195, server/git.js): untrusted until the user trusts it (#2830), its mark kept in
// .git, not in silinx.json, which stays the repository's (a clone shows no change). An untrusted project put in a
// repository keeps its mark there too (keepTrustInRepo), so that what git checks out (a pull, a merge) never trusts
// it: the project's own repository's .git/silinx-trust.json, or the workspace's .git/silinx-trust/<project>.json (a
// repository of several projects). A mark that cannot be read is an untrusted one.
export const CLONE_TRUST = path.join('.git', 'silinx-trust.json');
const trustMarks = dir => [path.join(dir, CLONE_TRUST), path.join(path.dirname(dir), '.git', 'silinx-trust', `${path.basename(dir)}.json`)];
// (read without holding the server's thread, #4775)
const cloneTrust = async dir => {
  for (const f of trustMarks(dir)) {
    let text;
    try { text = await fs.readFile(f, 'utf8'); } catch { continue; }
    try { const m = JSON.parse(text); return m && typeof m === 'object' ? m : { trusted: false }; } catch { return { trusted: false }; }
  }
  return null;
};

/** An untrusted project in a repository (root: 'project', its own, or 'workspace', server/git.js repoOf): its mark kept
 *  in the repository's .git, never in what git tracks. A trusted project: nothing (false); fromOutside: one that a pull
 *  brought, untrusted whatever its silinx.json says. */
export async function keepTrustInRepo(name, root, { fromOutside = false } = {}) {
  const pj = await readProject(name);
  if (pj.trusted !== false && !fromOutside) return false;
  const f = trustMarks(projectDir(name))[root === 'workspace' ? 1 : 0];
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, JSON.stringify({ trusted: false, ...(pj.madeBy === 'mcp' ? { madeBy: 'mcp' } : {}) }) + '\n');
  return true;
}

// the revision of a description (#4726): its file's text hashed, an HTTP entity tag. A page writes its description back
// only over the one it read (If-Match), so that a change made meanwhile (the MCP server's, another tab's) is not lost
const descriptionEtag = text => `"${crypto.createHash('sha256').update(text).digest('base64url').slice(0, 27)}"`;
const etags = new WeakMap();   // a description read or written -> its revision
/** The revision of a description readProject read or writeProject wrote (undefined for any other object). */
export const etagOf = pj => etags.get(pj);

// The trust records (#4735, server/trust-store.js): the first time, the workspace's projects trusted until then (their
// silinx.json and their repository's mark) recorded, once
let migrating = null;
async function migrateTrust() {
  const list = [];
  for (const n of await fs.readdir(workspaceDir()).catch(() => [])) {
    const dir = path.join(workspaceDir(), n);
    if (n.startsWith('.') || projectNameError(n)) continue;
    let pj;
    try { pj = parseDescription(await fs.readFile(path.join(dir, PROJECT_FILE), 'utf8')); } catch { continue; }
    if (pj?.trusted !== false && !await cloneTrust(dir)) list.push({ dir, id: typeof pj?.id === 'string' ? pj.id : null });
  }
  await trustStore.migrate(list);
}
async function recordedTrust(dir, id) {
  if (!trustStore.hasRecords()) { migrating ||= migrateTrust().finally(() => { migrating = null; }); await migrating; }
  return trustStore.isRecorded(dir, typeof id === 'string' ? id : null);
}
// a project whose silinx.json is no description (#4755): why, as the lists show it, and the message of what reads it
const damagedText = e => `its ${PROJECT_FILE} cannot be read: ${e.message}`;
const damagedMessage = (name, e) => `the project '${name}' is damaged: ${damagedText(e)} (correct it in a text editor, or delete the project)`;

export async function readProject(name) {
  const dir = projectDir(name);
  let pj, text;
  try { text = await fs.readFile(await projectFile(dir), 'utf8'); }
  catch { throw new HttpError(404, `project '${name}' not found`); }
  try { pj = parseDescription(text); if (!pj || typeof pj !== 'object' || Array.isArray(pj)) throw new SyntaxError('not an object'); }
  catch (e) { throw new HttpError(422, damagedMessage(name, e)); }
  etags.set(pj, descriptionEtag(text));
  const ct = await cloneTrust(dir);
  if (ct) Object.assign(pj, { trusted: false }, ct.madeBy ? { madeBy: ct.madeBy } : {});
  // (#4735: and a record of its folder outside it, server/trust-store.js; none: untrusted, said as one Silinx did not make)
  if (pj.trusted !== false && !await recordedTrust(dir, pj.id)) Object.assign(pj, { trusted: false, madeBy: UNRECORDED });
  pj.name = name;
  pj.files ||= [];
  return pj;
}

// Per-project mutex: every read-modify-write of silinx.json runs under it, so concurrent requests
// (API, CLI, several browser tabs) cannot lose each other's updates; and across processes (the MCP server's, the CLI's,
// another server's: a lock file, #4726), once this process's turn came.
const locks = new Map();
// two projects' locks (a rename's: its old name's and its new one's) taken in one order, their names', whoever asks:
// A to B and B to A at once wait for each other, never for ever (#4755)
function withProjectLocks(names, fn) {
  const keys = [...new Set(names.map(n => String(n).toLowerCase()))].sort();
  return keys.reduceRight((run, key) => () => withProjectLock(key, run), fn)();
}
// inside a project's lock: its silinx.json still there (a write after Delete Project or Rename Project never makes its
// folder again, #4755)
async function requireProject(name) {
  if (!await exists(await projectFile(projectDir(name)))) throw new HttpError(404, `project '${name}' not found`);
}
// Re-entered (#4757): a sequence of writes that holds the project's lock (lockProject: a merge, its undo) calls
// writeFile, writeProject… under it, which take it again: they run at once, as the holder's, never wait for it. What
// the holder started and that runs after it released the lock waits as any other
const holding = new AsyncLocalStorage();   // -> { key, held, parent }: the locks the current call holds
const holds = key => { for (let h = holding.getStore(); h; h = h.parent) if (h.key === key && h.held) return true; return false; };
function withProjectLock(name, fn) {
  name = String(name).toLowerCase();   // case-insensitive file systems: Foo and foo are one folder
  if (holds(name)) return Promise.resolve().then(fn);
  const prev = locks.get(name) || Promise.resolve();
  const run = prev.then(() => withFileLock(workspaceDir(), name, () => {
    const h = { key: name, held: true, parent: holding.getStore() };
    return holding.run(h, async () => fn()).finally(() => { h.held = false; });
  }));
  const tail = run.catch(() => {});
  locks.set(name, tail);
  tail.then(() => { if (locks.get(name) === tail) locks.delete(name); });
  return run;
}

/** fn() run holding the project's lock, whatever it writes through this module under it (a merge and its undo, #4757):
 *  no other request, tab or process writes the project meanwhile. */
export const lockProject = (name, fn) => withProjectLock(name, fn);

// Windows refuses to rename a file, or over one, that another operation has open at that moment (a concurrent
// read of it, a scan of a file just written: EPERM / EACCES / EBUSY), where other systems rename it: retried a few
// times, briefly (#4569: a file moved into the .trash, renamed, a project deleted, too)
export async function renameOver(from, to, { tries = 10, wait = 15 } = {}) {
  for (let k = 0; ; k++) {
    try { return await fs.rename(from, to); } catch (e) {
      if (k >= tries - 1 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e;
      await new Promise(r => setTimeout(r, wait * (k + 1)));
    }
  }
}

/** A file written atomically (a hidden temp file beside it, then renamed over it): a concurrent reader (a watcher,
 *  another process, a shared project's followers, #3183) or a crash never sees it half-written or empty. */
// dir: the project's folder, the temporary file checked to be in it once open (#4744)
// a file written whole and flushed to the disk (#4758): renamed in only once its text is there, so that a crash (a
// power cut) leaves the file before or the file after, never an empty or truncated one
async function writeSynced(file, data) {
  const fh = await fs.open(file, 'wx');
  try { await fh.writeFile(data); await fh.sync(); } finally { await fh.close(); }
}

export async function writeAtomic(full, text, dir = null) {
  const tmp = path.join(path.dirname(full), `.${path.basename(full)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);   // hidden: not listed
  try {
    if (dir) await createWithin(dir, tmp, text);
    else await writeSynced(tmp, text);
    noteWritten(full, text);   // (this server's own: not told to the page that asked, #4726)
    await renameOver(tmp, full);
  } catch (e) { await fs.rm(tmp, { force: true }).catch(() => {}); throw e; }
}

// Atomic write (temp file + rename): a concurrent reader never sees a half-written silinx.json.
// The top and simulation top must be identifiers (#1431): build/<top>.bit and the like are paths of the project.
async function writeProjectUnlocked(name, pj) {
  const dir = projectDir(name);
  const badTop = topNameError(pj);
  if (badTop) throw new HttpError(400, badTop);
  const clean = JSON.parse(projectJsonText(name, pj));   // (core/project-defaults.js, as the browser edition's, #4766)
  const ct = await cloneTrust(dir);
  if (ct) { delete clean.trusted; delete clean.madeBy; }   // (a clone's: in .git, #3195)
  // (#4735: a project with no trust record: untrusted by the record's absence, nothing of it written)
  const unrecorded = clean.madeBy === UNRECORDED;
  if (unrecorded) { delete clean.trusted; delete clean.madeBy; }
  const file = path.join(dir, PROJECT_FILE);
  const tmp = path.join(dir, `.${PROJECT_FILE}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
  const text = JSON.stringify(clean, null, 2) + '\n';
  try {
    await writeSynced(tmp, text);
    noteWritten(file, text);
    await renameOver(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
  const out = ct ? { ...clean, trusted: false, ...(ct.madeBy ? { madeBy: ct.madeBy } : {}) }
    : unrecorded ? { ...clean, trusted: false, madeBy: UNRECORDED } : clean;
  etags.set(out, descriptionEtag(text));
  return out;
}

/** The page's description written whole. ifMatch (#4726): only over the revision it read, else a 412 whose `project`
 *  and `etag` are the current ones (the page merges its change into it and writes again). */
export function writeProject(name, pj, { ifMatch = null } = {}) {
  projectDir(name);
  return withProjectLock(name, async () => {
    // a project from outside stays so until the user trusts it (trustProject, #2830): a description written whole (the
    // interface's) does not make it trusted
    let cur = null;
    try { cur = await readProject(name); } catch (e) { if (e.status !== 404) throw e; /* a new project */ }
    if (ifMatch && cur && etagOf(cur) !== ifMatch) {
      throw Object.assign(new HttpError(412, `the project '${name}' was changed meanwhile (by another tab or process)`), { project: cur, etag: etagOf(cur) });
    }
    // (and who made it, the MCP server: its messages, #2981)
    const kept = cur?.trusted === false ? { ...pj, trusted: false, ...(cur.madeBy ? { madeBy: cur.madeBy } : {}) } : pj;
    // its id and origin are the copies' record (#4205), never the interface's to change: a project's current ones kept
    if (!cur) return writeProjectUnlocked(name, kept);
    const { id, origin, ...rest } = kept;   // eslint-disable-line no-unused-vars
    return writeProjectUnlocked(name, { ...rest, ...(cur.id !== undefined ? { id: cur.id } : {}), ...(cur.origin !== undefined ? { origin: cur.origin } : {}) });
  });
}

/** The user trusts a project from outside (#2830): Xilinx ISE and programming may run for it. */
export async function trustProject(name) {
  const out = await updateProject(name, pj => { const { trusted, madeBy, ...rest } = pj; return rest; });   // eslint-disable-line no-unused-vars
  for (const f of trustMarks(projectDir(name))) await fs.rm(f, { force: true });
  await trustStore.record(projectDir(name), out.id);   // (#4735: its record, outside it)
  return out;
}

/** Read silinx.json, let `fn(pj)` change it (or return a new object), write it back, all under the project lock. */
export function updateProject(name, fn) {
  projectDir(name);
  return withProjectLock(name, async () => {
    const pj = await readProject(name);
    const next = (await fn(pj)) ?? pj;
    return writeProjectUnlocked(name, next);
  });
}

async function walk(dir, base = '') {
  const out = [];
  for (const ent of await fs.readdir(path.join(dir, base), { withFileTypes: true })) {
    if (ent.name.startsWith('.') || (base === '' && ent.name === 'build')) continue;
    const rel = base ? `${base}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...await walk(dir, rel));
    // a symbolic link is not a project file (it may lead out of the project: an export would take
    // the file it points to)
    else if (ent.isFile()) out.push(rel);
  }
  return out;
}

export async function fileTree(name) {
  return (await walk(projectDir(name))).filter(f => f !== PROJECT_FILE).sort();
}


async function copyDir(src, dst, { skipRoot = null } = {}) {
  await fs.mkdir(dst, { recursive: true });
  for (const ent of await fs.readdir(src, { withFileTypes: true })) {
    if (ent.name.startsWith('.') || ent.name === skipRoot) continue;   // hidden files (a Mac's .DS_Store): not part of a project
    const s = path.join(src, ent.name), d = path.join(dst, ent.name);
    if (ent.isDirectory()) await copyDir(s, d); else await fs.copyFile(s, d);
  }
}

// fromOutside: an import's project, trusted: false from its first write, so an import that fails halfway leaves no
// trusted project (#2956, core/trust.js); the user's own (neither an import's nor the MCP's) recorded as trusted (#4735)
// madeBy 'mcp': a project the MCP server makes, untrusted too, its messages saying so (#2981)
// kind 'design': a design and simulation project (#3780, core/project-kind.js): an empty one, no board, no constraints
export async function createProject({ name, template = 'empty', device, board, kind = null, fromOutside = false, madeBy = null }) {
  // (a design project starts empty, a co-design one empty or from a co-design example: core/project-kind.js, #4702)
  const refused = createRefusal(kind, template);
  if (refused) throw new HttpError(400, refused);
  const dir = projectDir(name);
  // (one in another case too: the same folder on a case-insensitive file system, #3538)
  const other = sameProject(await fs.readdir(workspaceDir()).catch(() => []), name);
  if (other || await exists(dir)) throw new HttpError(409, `project '${other ?? name}' already exists`);
  if (template && template !== 'empty') {
    // an example, else a test design (#1746)
    const ok = /^[a-z0-9_-]+$/i.test(template);
    const src = [EXAMPLES_DIR, TEST_DESIGNS_DIR].map(d => path.join(d, template)).find(d => ok && fsSync.existsSync(path.join(d, PROJECT_FILE)));
    if (!src) throw new HttpError(400, `unknown template '${template}'`);
    // (its files without its silinx.json, written once below, already marked when the project is untrusted: never on
    // disk as a trusted project's in between, #3413)
    const pj = { ...parseDescription(await fs.readFile(path.join(src, PROJECT_FILE), 'utf8')), name };
    const noBoard = boardRefusal(pj, { board, device });   // (a co-design example, #4702)
    if (noBoard) throw new HttpError(400, noBoard);
    pj.files ||= [];
    await copyDir(src, dir, { skipRoot: PROJECT_FILE });
    const was = `${pj.board}|${pj.device?.part}|${pj.device?.package}`, fromBoard = pj.board;
    if (device) pj.device = device;
    if (board !== undefined) pj.board = board;
    // another board than the example's: its clock and its buttons' and switches' levels as the top's generics (#3710)
    if (pj.board && pj.board !== fromBoard) await boardGenerics(dir, pj);
    // a device whose constraints are of another format (the 7-series' XDC, #3142): the example's file replaced by the board's
    const ext = constraintsExtOf(pj.device);
    if (pj.constraints && !pj.constraints.toLowerCase().endsWith(ext)) {
      await fs.rm(safeJoin(dir, pj.constraints), { force: true });
      pj.constraints = pj.constraints.replace(/\.[^./]*$/, '') + ext;
    }
    if (fromOutside) pj.trusted = false;
    if (madeBy === 'mcp') Object.assign(pj, { trusted: false, madeBy });
    await recordMade(dir, { fromOutside, madeBy });
    const out = await writeProject(name, pj);
    // another board or device than the example's: its pins are the chosen board's (#36)
    if (pj.board && `${pj.board}|${pj.device?.part}|${pj.device?.package}` !== was) await boardConstraints(dir, pj);
    return out;
  }
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.mkdir(path.join(dir, 'sim'), { recursive: true });
  if (!kind) await fs.mkdir(path.join(dir, 'constraints'), { recursive: true });
  // (core/project-defaults.js, as the browser edition's, #4766; Optimization Fast, #4828)
  const json = { ...newProjectJson(name, { device, board, kind }), ...(fromOutside ? { trusted: false } : {}), ...(madeBy === 'mcp' ? { trusted: false, madeBy } : {}) };
  await recordMade(dir, { fromOutside, madeBy });
  // (a co-design project: its System document, its top, #4702)
  if (kind === CODESIGN_KIND) { const f = newSystemFile(name); await fs.writeFile(path.join(dir, f.path), f.text); }
  return writeProject(name, json);
}

// (#4735: a project the user makes, recorded as trusted before its silinx.json is written; an import's and the MCP
// server's never)
async function recordMade(dir, { fromOutside, madeBy }) {
  if (fromOutside || madeBy === 'mcp') return;
  if (!trustStore.hasRecords()) await recordedTrust(dir, null);   // (the migration first: this project is not yet one)
  await trustStore.record(dir, null);
}

/** Writes the board's values (its clock, CLK_HZ; its buttons' and switches' levels, BTN_LOW, SW_LOW; its digit enables'
 *  level, AN_LOW, #3884) as the defaults of the generics of a project's top that has them (core/board-generics.js,
 *  #3710): topForBoard's result and the board's name, or null (nothing changed). */
export async function boardGenerics(dir, pj) {
  const r = resolveBoard(pj.board, { part: pj.device?.part });
  if (!r || !pj.top) return;
  const sources = [];
  for (const f of pj.files || []) {
    if (f.role === 'sim' || !/^(vhdl|verilog)$/.test(f.lang)) continue;
    try { sources.push({ path: f.path, lang: f.lang, text: await fs.readFile(safeJoin(dir, f.path), 'utf8') }); } catch { /* missing (or outside the project): skipped */ }
  }
  const top = topForBoard(sources, pj.top, r);
  if (top) await writeAtomic(safeJoin(dir, top.path), top.text);
  return top ? { ...top, board: r.board.name } : null;
}

/** Writes a project's UCF from its board's pin table (ports matched by name: clk, led, sw, btn,
 *  seg, an…), as Update Constraints does in the interface. */
export async function boardConstraints(dir, pj) {
  const r = resolveBoard(pj.board, { part: pj.device?.part });
  if (!r || !pj.top) return;
  // (a constraints path that names the project's description or a hidden file, from a hand-made silinx.json: not
  // written, #3411)
  if (pj.constraints) {
    const n = normalizePath(pj.constraints);
    const reason = n.reason || (isProjectFile(n.path) ? `${PROJECT_FILE}, the project's description` : null);
    if (reason) throw new HttpError(400, `the constraints file '${pj.constraints}' is not written: ${reason}`);
  }
  const sources = [];
  for (const f of pj.files || []) {
    if (f.role === 'sim' || !/^(vhdl|verilog)$/.test(f.lang)) continue;
    try { sources.push({ path: f.path, lang: f.lang, text: await fs.readFile(safeJoin(dir, f.path), 'utf8') }); } catch { /* missing (or outside the project): skipped */ }
  }
  // the HDL of its drawings and C sources too (a test design's top is one, #1746)
  try {
    const { viewSources } = await import('./ise.js');
    for (const v of await viewSources(pj, dir, sources)) if (v.text) sources.push({ path: v.path, lang: v.lang, text: v.text });
  } catch { /* none */ }
  let design;
  try { design = elaborate(compile([...primitiveSources(sources), ...sources]), pj.top); } catch { return; }
  if (!design?.top) return;
  // (core/board-constraints.js: the interface's Update Constraints, the ports no board name matches by direction, #4732)
  const { text } = boardConstraintsFile(pj.top, design.top.ports.map(ucfPort), { ...r.board, device: r.device, resources: r.resources });
  // (the project's own paths, as every other: inside its folder, #479; its folder made, as a test design has none, #1746)
  const file = safeJoin(dir, pj.constraints || `constraints/top${constraintsExtOf(r.device)}`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeAtomic(file, text);
}

export async function deleteProject(name) {
  const dir = projectDir(name);
  // (under its lock: a write in progress ends first, and one after it finds no project, #4755)
  await withProjectLock(name, async () => {
    // (a project's folder only: one with its silinx.json, never another folder of the workspace's)
    if (!await exists(dir) || !await exists(await projectFile(dir))) throw new HttpError(404, 'not found');
    const trash = path.join(workspaceDir(), '.trash');
    await fs.mkdir(trash, { recursive: true });
    const key = trustStore.folderKey(dir);
    const at = path.join(trash, `${path.basename(dir)}-${Date.now()}`);
    await renameOver(dir, at);
    await fs.rm(trustMarks(dir)[1], { force: true });   // (the workspace repository's mark, #2830)
    await trustStore.forget(key);   // (#4735: its trust record: restored from the .trash, it is untrusted)
    await backupStore.forget(key);   // (#4971: its back-ups' record)
    // (its build's outputs not kept: a run makes them again, #4758)
    await fs.rm(path.join(at, 'build'), { recursive: true, force: true }).catch(() => {});
  });
  await emptyTrash();   // (what was deleted long ago, #4758)
}

/** The workspace's .trash emptied of what was deleted more than TRASH_DAYS days ago (core/trash.js, #4758); a Rename
 *  Project's hidden folder that a crash left (.rename-<name>-<time>, an hour old: the project whole) moved into it, to
 *  be moved back by hand. Its failures are not the caller's (a file another program holds: left for the next time). */
export async function emptyTrash(now = Date.now()) {
  const ws = workspaceDir(), trash = path.join(ws, '.trash');
  for (const ent of await fs.readdir(ws).catch(() => [])) {
    const t = ent.startsWith('.rename-') ? trashTime(ent) : null;
    if (t === null || now - t < 60 * 60 * 1000) continue;
    await fs.mkdir(trash, { recursive: true }).catch(() => {});
    await renameOver(path.join(ws, ent), path.join(trash, ent.slice('.rename-'.length))).catch(() => {});
  }
  for (const ent of await fs.readdir(trash).catch(() => [])) {
    if (expiredTrash(ent, now)) await fs.rm(path.join(trash, ent), { recursive: true, force: true }).catch(() => {});
  }
}

/** A failure made in the middle of a rename, by the tests (#4641, #4760): failAt 'moved' (after the folder moved), 'mark'
 *  (after the trust mark), 'files' (after a <name>.xise), 'json' (after its silinx.json); failUndo: the moves back fail. */
export const RENAME_TESTING = { failAt: null, failUndo: false };

/** Rename Project… (#4641): the project's folder moved to its new name in one rename (a change of case alone through a
 *  hidden name, as a case-insensitive file system has one folder for both), its .git with it (its remote kept); then its
 *  silinx.json's name, a <name>.xise kept in it (Synchronize with ISE) and an untrusted project's mark in the workspace's
 *  repository (#2830). A failure on the way moves all of it back: the old project as it was. -> { name } */
export async function renameProject(from, to) {
  const dir = projectDir(from);
  if (!await exists(dir) || !await exists(await projectFile(dir))) throw new HttpError(404, `project '${from}' not found`);
  const problem = renameProblem(from, to, await fs.readdir(workspaceDir()).catch(() => []));
  if (problem) throw new HttpError(problem.status, problem.message);
  const dst = projectDir(to), caseOnly = from.toLowerCase() === to.toLowerCase();
  const key = trustStore.folderKey(dir);   // (#4735: its trust record, moved last)
  const run = async () => {
    await requireProject(from);   // (deleted or renamed meanwhile)
    if (!caseOnly && await exists(dst)) throw new HttpError(409, `a project named '${to}' already exists: choose another name`);
    const undo = [];
    // (each undone step named by its place in the workspace, for a failure to undo it, #4760)
    const rel = p => path.relative(workspaceDir(), p).split(path.sep).join('/');
    const back = (a, b) => RENAME_TESTING.failUndo ? Promise.reject(Object.assign(new Error('undo failed (test)'), { code: 'EPERM' })) : renameOver(b, a);
    const move = async (a, b) => { await renameOver(a, b); undo.unshift({ what: `${rel(b)} → ${rel(a)}`, run: () => back(a, b) }); };
    const failAt = at => { if (RENAME_TESTING.failAt === at) throw new Error('rename failed (test)'); };
    try {
      if (caseOnly) {
        const tmp = path.join(workspaceDir(), `.rename-${to}-${Date.now()}`);
        await move(dir, tmp);
        await move(tmp, dst);
      } else await move(dir, dst);
      failAt('moved');
      const [mark, newMark] = [trustMarks(dir)[1], trustMarks(dst)[1]];
      if (await exists(mark)) await move(mark, newMark);
      failAt('mark');
      for (const f of await fs.readdir(dst)) {
        const n = renamedFile(f, from, to);
        if (n && !await exists(path.join(dst, n))) await move(path.join(dst, f), path.join(dst, n));
      }
      failAt('files');
      const file = path.join(dst, PROJECT_FILE), text = await fs.readFile(file, 'utf8');
      await writeAtomic(file, JSON.stringify({ ...parseDescription(text), name: to }, null, 2) + '\n');
      undo.unshift({ what: `${rel(file)}'s name`, run: () => writeAtomic(file, text) });
      failAt('json');
      await trustStore.move(key, dst);
      await backupStore.move(key, dst);   // (#4971)
    } catch (e) {
      // (an undo that failed said, with what it left, never swallowed, #4760: its file system's code, not its paths)
      const left = [];
      for (const u of undo) await u.run().catch(x => left.push(`${u.what} (${x.code || 'failed'})`));
      if (left.length) throw new HttpError(500, `could not rename the project '${from}' to '${to}' (${e.status ? e.message : e.code || e.message}), and putting it back failed too: ${left.join(', ')}. Look at the workspace's folders '${from}' and '${to}'.`);
      throw e;
    }
    return { name: to };
  };
  return withProjectLocks([from, to], run);
}

// project-relative path normalised to forward slashes, without './' or a trailing '/'
export const relKey = (dir, full) => path.relative(dir, full).split(path.sep).join('/');
// a name as a case-insensitive file system may read it (core/fold-name.js, shared with the browser, #3034)
export { foldName };
// (whatever its case: on a case-insensitive file system SILINX.JSON is the same file)
export const isProjectFile = key => foldName(key) === PROJECT_FILE;
// a path of the project that is its silinx.json, by its name or as the very same file on disk (#2956)
export async function isProjectFileAt(dir, full) {
  if (isProjectFile(relKey(dir, full))) return true;
  try {
    // (as bigint: Windows's 64-bit file ids are past a Number's precision, two files of a folder alike, #3878)
    const [a, b] = await Promise.all([fs.stat(full, { bigint: true }), fs.stat(path.join(dir, PROJECT_FILE), { bigint: true })]);
    return a.dev === b.dev && a.ino === b.ino;
  } catch { return false; }
}

// A hidden file or folder (.git/hooks, .vscode, .env) is no part of a project (#3036): no file route reads, writes, renames
// or deletes one (#3354), by its name or once its symbolic links are followed; a short (8.3) name, or a path the system
// names a hidden one, too (paths.js hiddenName, nativeRealOf). verb: what the route does ('read', 'written'…)
export function refuseHidden(dir, rel0, full, verb) {
  const hidden = [relKey(dir, full), relKey(realOf(dir), realOf(full)), relKey(nativeRealOf(dir), nativeRealOf(full))].flatMap(k => k.split('/')).find(hiddenName);
  if (hidden) throw new HttpError(400, `'${rel0}': not ${verb}: hidden file or folder ('${hidden}')`);
}

// a folder that holds a hidden file or folder (a clone's .git, with its trust mark, #2830) is neither renamed nor deleted
// with it: the first one found, its path in the project; its symbolic links not followed (a rename or a delete moves or
// removes a link, not what it names); a Mac's .DS_Store (Finder's settings of the folder) apart
async function refuseHiddenInside(dir, rel0, full, verb) {
  const find = async d => {
    let ents;
    try { ents = await fs.readdir(d, { withFileTypes: true }); } catch { return null; }
    for (const e of ents) {
      if (e.name === '.DS_Store' && !e.isDirectory()) continue;
      if (hiddenName(e.name)) return path.join(d, e.name);
      const f = e.isDirectory() && await find(path.join(d, e.name));
      if (f) return f;
    }
    return null;
  };
  const found = await find(full);
  if (found) throw new HttpError(400, `'${rel0}': not ${verb}: the folder holds a hidden file or folder ('${relKey(dir, found)}')`);
}

// A path of the project with its folders and its file spelled as on disk (#3536: SRC/a.vhd is src/a.vhd when the
// project has src, on every system, as a case-insensitive file system reads it) -> its full path. last: false, the
// last name kept as asked (a rename's new name).
const namesIn = dir => async folder => { try { return await fs.readdir(path.join(dir, ...folder.split('/'))); } catch { return []; } };
export async function spelledJoin(dir, rel, { last = true } = {}) {
  // (the path by the browser store's rule: src/../x.v and src\y.v refused, not resolved by the system, #3598)
  const shape = filePath(rel);
  if (shape.reason) throw new HttpError(400, shape.message);
  const key = relKey(dir, safeJoin(dir, rel));
  return key ? safeJoin(dir, await spelledAs(key, namesIn(dir), { last })) : dir;
}

export async function readFile(name, rel) {
  const dir = projectDir(name);
  const full = await spelledJoin(dir, rel);
  refuseHidden(dir, rel, full, 'read');
  // (the file opened checked too: its path's links may change once checked, #4744)
  try { return await readWithin(dir, full, 'utf8'); }
  catch (e) { throw e.status === 400 ? new HttpError(400, e.message) : new HttpError(404, `file '${rel}' not found`); }
}

/** A file's bytes (a firmware's .elf, #5198), by readFile's checks and messages: a Uint8Array. */
export async function readFileBytes(name, rel) {
  const dir = projectDir(name);
  const full = await spelledJoin(dir, rel);
  refuseHidden(dir, rel, full, 'read');
  try { return new Uint8Array(await readWithin(dir, full)); }
  catch (e) { throw e.status === 400 ? new HttpError(400, e.message) : new HttpError(404, `file '${rel}' not found`); }
}

export async function writeFile(name, rel0, text) {
  const dir = projectDir(name);
  const full = await spelledJoin(dir, rel0);
  if (typeof text !== 'string') throw new HttpError(400, 'text: the whole text of the file');
  // the path as the project lists it (./src/a.vhd and src//a.vhd are src/a.vhd, #1229); silinx.json is the
  // project's description, written by the project's own routes (as the browser store refuses it)
  const rel = relKey(dir, full);
  if (!rel) throw new HttpError(400, 'missing path');
  if (await isProjectFileAt(dir, full)) throw new HttpError(400, `${PROJECT_FILE} is the project's description`);
  // no hidden file (refuseHidden); build/ is written here too (the browser's open synthesis saves its netlists in build/open/)
  refuseHidden(dir, rel0, full, 'written');
  // a name by the import gate's rules (#3414: no backslash, stream, trailing dot or space, invisible character…), as
  // Rename's; build/'s own files by the rest of their path
  const inBuild = /^build\//.test(rel);
  const gated = normalizePath(inBuild ? `b${rel.slice(5)}` : rel);   // (build/x as b/x: its own name checked)
  if (gated.reason) throw new HttpError(400, `'${rel0}': not written: ${gated.reason}`);
  // (onto a folder, or through a file: the project's path in the message, #3537)
  // (under the project's lock, the project still there: a write after Delete Project or Rename Project is refused,
  // never makes its folder again, #4755)
  await withProjectLock(name, async () => {
    await requireProject(name);
    if ((await fs.stat(full).catch(() => null))?.isDirectory()) throw new HttpError(400, `'${rel}' is a folder, not a file`);
    // (a drawing a newer Silinx saved never written over in an older format: what it added would be lost, #4756)
    if (formatVersion(rel) !== null) {
      const refused = downgradeRefusal(rel, await fs.readFile(full, 'utf8').catch(() => null), text);
      if (refused) throw new HttpError(409, refused);
    }
    try {
      await fs.mkdir(path.dirname(full), { recursive: true });
      await writeAtomic(full, text, dir);   // (a reader, or a crash, never sees a half-written / empty file)
    } catch (e) { throw await fsHttpError(e, dir, full); }
    // Register HDL files automatically (not the generated ones in build/, e.g. the netlists of the open
    // synthesis); a file written again is back in the project (not excluded).
    // (core/project-entries.js registerWritten, as the browser edition's store, #4733; written only when it changes)
    const pj = await readProject(name);
    if (registerWritten(pj, rel)) await writeProjectUnlocked(name, pj);
  });
}



/** Move/rename a project file (or folder), keeping the project's file list and constraints path. */
// checkName: the new name by the import gate's rules for a name (the interface's Rename and MCP rename_file alike,
// #2973); false only to put a file back at the name it had (a rename undone)
export async function renameFile(name, from, to, { checkName = true } = {}) {
  const dir = projectDir(name);
  const src = await spelledJoin(dir, from), dst = await spelledJoin(dir, to, { last: false });
  if (src === dir || dst === dir) throw new HttpError(400, 'cannot rename the project folder itself');
  const fromKey = relKey(dir, src), toKey = relKey(dir, dst);
  if (await isProjectFileAt(dir, src) || await isProjectFileAt(dir, dst)) throw new HttpError(400, `${PROJECT_FILE} cannot be renamed`);
  refuseHidden(dir, from, src, 'renamed');
  const gated = checkName ? normalizePath(toKey) : {};
  if (gated.reason) throw new HttpError(400, `'${to}': not renamed: ${gated.reason}`);
  refuseHidden(dir, to, dst, 'renamed');   // (through a symbolic link too)
  return withProjectLock(name, async () => {
    await requireProject(name);   // (deleted or renamed meanwhile: its folder never made again, #4755)
    let st;
    try { st = await fs.stat(src); } catch { throw new HttpError(404, `file '${from}' not found`); }
    const isDir = st.isDirectory();
    if (isDir) await refuseHiddenInside(dir, from, src, 'renamed');
    if (isDir && src !== dst && (dst + path.sep).startsWith(src + path.sep)) throw new HttpError(400, `cannot move '${from}' into itself`);
    // (a name the folder has in another case is taken too, but the file's own: a rename of its case, #3536)
    const taken = sameNameIn(path.basename(dst), await namesIn(dir)(relKey(dir, path.dirname(dst))));
    if (taken && path.join(path.dirname(dst), taken) !== src) throw new HttpError(409, `'${to}' already exists`);
    try {
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await noteMoving(src, dst);
      await renameOver(src, dst);
    } catch (e) { throw await fsHttpError(e, dir, dst); }
    // (core/project-entries.js renameEntries, as the browser edition's, #4766)
    const pj = renameEntries(await readProject(name), fromKey, toKey);
    return writeProjectUnlocked(name, pj);
  });
}

/** Delete a project file or folder (recursively) and unregister the files it contained. trash (the user's Delete File /
 *  Delete Folder, the MCP's delete_file, #3364): moved to the workspace's .trash folder, .trash/<project>-<time>/<path>,
 *  as a deleted project is, from where it can be moved back -> { trashed: its path in the workspace, else null }.
 *  mustExist (the route's, the MCP's, #3537): nothing at that path is a 404, else nothing to do. */
export async function deleteFile(name, rel, { trash = false, mustExist = false } = {}) {
  const dir = projectDir(name);
  const full = await spelledJoin(dir, rel);
  if (full === dir) throw new HttpError(400, 'cannot delete the project folder itself (delete the project instead)');
  const key = relKey(dir, full);
  if (await isProjectFileAt(dir, full)) throw new HttpError(400, `${PROJECT_FILE} cannot be deleted`);
  refuseHidden(dir, rel, full, 'deleted');
  let trashed = null;
  await withProjectLock(name, async () => {
    await requireProject(name);   // (deleted or renamed meanwhile, #4755)
    await refuseHiddenInside(dir, rel, full, 'deleted');
    const there = await fs.lstat(full).then(() => true, () => false);
    if (mustExist && !there) throw new HttpError(404, `no file or folder '${key}' in the project '${name}'`);
    noteRemoved(full);
    try {
      if (trash && there) trashed = await toTrash(dir, full, key);
      else await fs.rm(full, { recursive: true, force: true });
    } catch (e) { throw await fsHttpError(e, dir, full); }
    // (core/project-entries.js deleteEntries, as the browser edition's, #4766: the constraints file deleted, none)
    const pj = await readProject(name);
    if (deleteEntries(pj, key)) await writeProjectUnlocked(name, pj);
  });
  return { trashed };
}
// a project's file or folder into the workspace's .trash, at .trash/<project>-<time>/<its path> -> that path (the
// workspace's, with '/'); dir: the project's folder (projectDir's)
async function toTrash(dir, full, key) {
  const trash = path.join(workspaceDir(), '.trash'), stamp = `${path.basename(dir)}-${Date.now()}`;
  let base = path.join(trash, stamp);
  for (let i = 2; await exists(base); i++) base = path.join(trash, `${stamp}-${i}`);
  const at = path.join(base, ...key.split('/'));
  await fs.mkdir(path.dirname(at), { recursive: true });
  await renameOver(full, at);
  await emptyTrash();   // (what was deleted long ago, #4758)
  return relKey(workspaceDir(), at);
}

export async function readSources(name) {
  const pj = await readProject(name);
  const out = [];
  for (const f of pj.files) {
    try { out.push({ ...f, text: await readFile(name, f.path) }); }
    catch { out.push({ ...f, text: '', missing: true }); }
  }
  return out;
}
