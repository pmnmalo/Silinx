// Project storage of the browser (single-file) edition, behind one interface (web/js/api-local.js):
// - browserStore: the projects in the browser's localStorage, one entry per project (#4725);
// - folderStore: the projects in a folder on the disk that the user picked (File System Access API,
//   Chrome / Edge: a FileSystemDirectoryHandle), each one a normal project folder in the full
//   application's format (silinx.json, src/, sim/, constraints/, build/… as server/projects.js
//   writes them), so the same folder opens in the full application and zips for a submission.
// projectOps(getStore, examples, { beforeMigrate }): the project operations of the API (list, create, open, save,
// read / write / rename / delete files, delete a project) on the store in use.
// No browser global is touched at import time: the unit tests run this in Node with an in-memory
// FileSystemDirectoryHandle (test/fixtures/fs-access-fake.js).

import { DEV_SITE } from './prefs.js';
import { constraintsExtOf } from '../../packages/silinx-fpga/src/parts.js';
import { topForBoard } from '../../core/board-generics.js';
import { resolveBoard } from '../../core/devices.js';
import { DEFAULT_DEVICE, newProjectJson, projectJsonText } from '../../core/project-defaults.js';
import { clone } from '../../core/util.js';   // (a relative path: Node imports this module too, as api-local.js)
import { PROJECT_NAME_RE, projectNameError, sameProject } from '../../core/project-name.js';
import { renameProblem, renamedFile } from '../../core/project-rename.js';
import { filePath, gateMessages, normalizePath, requireGated } from '../../core/import-gate.js';
import { markUntrusted } from '../../core/trust.js';
import * as trustRecords from './trust-records.js';
import { ANCESTOR_FILE, isProjectId, originOf } from '../../core/project-rev.js';
import { SYSTEM_KIND, DESIGN_KIND, boardRefusal, circuitExample, createRefusal, isDesignOnly, isSystemProject, newSystemKind } from '../../core/project-kind.js';
import { profileOf } from '../../core/project-profile.js';
import { newSystemFile } from '../../core/system-doc.js';
import { foldName, foldsToProjectFile, PROJECT_FILE, sameNameIn, spelledAs } from '../../core/fold-name.js';
import { langOfPath } from '../../core/file-kinds.js';
import { registerWritten, renameEntries, deleteEntries } from '../../core/project-entries.js';
import { expiredTrash } from '../../core/trash.js';
import { downgradeRefusal, migratingWrite } from '../../core/doc-format.js';

export const NAME_RE = PROJECT_NAME_RE;   // (core/project-name.js, #3538)
// the site's development edition (https://pmnmalo.github.io/Silinx/dev/, built from main): its
// own browser storage, so that a development build never touches the stable edition's projects
// (a workspace folder on the disk can still be opened by both); its settings too (web/js/prefs.js)
export { DEV_SITE };
// (one entry per project, #4725; before, every project in the one entry BROWSER_KEY, which is read and moved out)
const BROWSER_KEY = DEV_SITE ? 'silinx.dev.standalone.fs' : 'silinx.standalone.fs';
const BROWSER_PROJECT_PREFIX = DEV_SITE ? 'silinx.dev.standalone.project:' : 'silinx.standalone.project:';

const fail = msg => { throw new Error(msg); };
const langOf = langOfPath;   // (core/file-kinds.js, #4733)
/**
 * A project-relative path normalised: forward slashes, no empty or '.' segments. null when it would
 * leave the project (#483): not a string, empty, absolute ('/x', '\\\\host\\x', 'C:\\x'), a '..' segment,
 * or a control character in it: core/import-gate.js normalizePath's syntax, a backslash read as '/' (#4769). Every
 * operation of the stores and the imports go through it: the code does not rely on the platform (the File System
 * Access API's TypeError, the server's safeJoin).
 */
export function safePath(p) {
  return normalizePath(p, { names: false, backslashes: true }).path ?? null;
}
/** The path a store's operation is given, by the server's rule (core/import-gate.js filePath, #3598), or its error. */
export function cleanPath(p) { const r = filePath(p); return r.reason ? fail(r.message) : r.path; }
// (silinx.json is the project's description, not one of its files: never written, renamed or deleted as one; by its
// folded name, as a case-insensitive file system reads it: SILINX.JSON, ſilinx.json are the same file, #3034)
const isDescriptor = foldsToProjectFile;
const notDescriptor = p => (isDescriptor(p) ? fail(`${PROJECT_FILE} is the project's description`) : p);
// silinx.json's text, a new empty project's silinx.json: core/project-defaults.js's, as the local server's (#4766)
export { projectJsonText };
/** A new empty project's silinx.json (core/project-defaults.js newProjectJson, as the local server's, #4766). */
export const emptyProjectJson = (name, { device, board } = {}) => newProjectJson(name, { device, board });
const under = (k, dir) => k === dir || k.startsWith(`${dir}/`);
// the names in a project's folder ('' its root), from its files' paths: the paths spelled as the project spells its
// folders and files (core/fold-name.js spelledAs, as the local server does, #3536)
const namesOf = files => folder => [...new Set(Object.keys(files).filter(k => !folder || k.startsWith(`${folder}/`))
  .map(k => k.slice(folder ? folder.length + 1 : 0).split('/')[0]))];
const spelled = (p, path, opts) => spelledAs(path, namesOf(p.files), opts);
const plain = o => !!o && typeof o === 'object' && !Array.isArray(o);
const str = (v, dflt = '') => (typeof v === 'string' ? v : dflt);

/**
 * An imported project description (a zip's or a bundle's silinx.json) in the shape the app relies
 * on, as normalizeDoc / normalizeModel do for the drawings (#483): `files` an array of
 * { path, lang, role } with paths inside the project, strings for `top` / `simTop` / `constraints`,
 * the known `device` fields, objects for `stimuli` / `impl`. Anything else is dropped, and what the
 * user would miss (a file, the constraints) is said in `warnings`. Returns { json, warnings }.
 */
export function normalizeProjectJson(saved, name) {
  const warnings = [];
  const base = emptyProjectJson(name);
  if (!plain(saved)) return { json: base, warnings: [`${PROJECT_FILE} is not a project description: an empty project`] };
  const json = { ...base, name };
  const dev = plain(saved.device) ? saved.device : {};
  json.device = { family: str(dev.family, DEFAULT_DEVICE.family), part: str(dev.part, DEFAULT_DEVICE.part), package: str(dev.package, DEFAULT_DEVICE.package), speed: str(dev.speed, DEFAULT_DEVICE.speed) };
  json.board = typeof saved.board === 'string' ? saved.board : null;
  json.top = str(saved.top); json.simTop = str(saved.simTop);
  const seen = new Set();
  json.files = [];
  for (const f of Array.isArray(saved.files) ? saved.files : []) {
    const path = plain(f) ? safePath(f.path) : null;
    if (!path || isDescriptor(path)) { warnings.push(`${PROJECT_FILE}: file path outside the project dropped (${plain(f) ? f.path : JSON.stringify(f)})`); continue; }
    if (seen.has(path)) continue;
    seen.add(path);
    const lang = ['vhdl', 'verilog', 'ucf', 'text'].includes(f.lang) ? f.lang : langOf(path);
    json.files.push({ path, lang, role: f.role === 'sim' ? 'sim' : 'design' });
  }
  if (saved.constraints == null || saved.constraints === '') json.constraints = null;
  else {
    json.constraints = safePath(saved.constraints);
    if (!json.constraints) warnings.push(`${PROJECT_FILE}: constraints path outside the project dropped (${typeof saved.constraints === 'string' ? saved.constraints : JSON.stringify(saved.constraints)})`);
  }
  const excluded = (Array.isArray(saved.excluded) ? saved.excluded : []).map(safePath).filter(Boolean);
  if (excluded.length) json.excluded = excluded;
  json.stimuli = plain(saved.stimuli) ? saved.stimuli : {};
  // (a project read, made before the Optimization or saying none: Fast, Speed at Normal, #2470; a new one Fast too, #4828)
  json.impl = { ...base.impl, optMode: 'Speed', optLevel: 1, ...(plain(saved.impl) ? saved.impl : {}) };
  if (saved.preferredLanguage === 'vhdl' || saved.preferredLanguage === 'verilog') json.preferredLanguage = saved.preferredLanguage;
  if (plain(saved.sourceLanguage)) json.sourceLanguage = saved.sourceLanguage;
  if (typeof saved.synthTool === 'string') json.synthTool = saved.synthTool;
  if (isDesignOnly(saved)) Object.assign(json, { kind: DESIGN_KIND, board: null });   // (a design and simulation project, #3780)
  // (a System project, #4702: its profile, #5440; one of before #5440, kind system)
  if (isSystemProject(saved)) Object.assign(json, saved.kind === SYSTEM_KIND ? { kind: SYSTEM_KIND, board: null } : { profile: profileOf(saved), ...(saved.top ? {} : { board: null }) });
  if (saved.trusted === false) json.trusted = false;   // (a project from outside, #2830: never made trusted by its description)
  // (its id and the origin of a copy, #4205)
  if (isProjectId(saved.id)) json.id = saved.id;
  if (originOf(saved)) json.origin = originOf(saved);
  return { json: clone(json), warnings };
}

/**
 * A zip's entries as the import gate let them through (core/import-gate.js gateZip / gateEntries, #2830) as a
 * project (#483): a .xise (an ISE project, read by `xiseProject(name, text, files)`) or a silinx.json (a Silinx
 * export) at its root; every other file keeps its path, skipped with a warning when it would leave the project;
 * build/ is never imported. Returns { json, files, warnings, missing, ancestor } (missing: the files silinx.json lists
 * that the zip has not; the gate's refusals first in the warnings; ancestor: the text of a copy's ANCESTOR_FILE, or
 * null, #4205), not stored.
 */
export function projectFromZip(name, gated, { xiseProject, textOf }) {
  const entries = requireGated(gated, 'projectFromZip').map(f => ({ ...f, text: f.text ?? textOf(f) }));
  textOf = e => e.text;
  const xe = entries.filter(e => /\.xise$/i.test(e.path)).sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
  const pe = entries.find(e => /(^|\/)silinx\.json$/.test(e.path));
  // (a project file the import gate refused: why)
  const refused = gated.refusals.find(x => /(\.xise|(^|\/)silinx\.json)$/i.test(x.path));
  if (!xe && !pe) fail(refused ? `${refused.path}: not imported: ${refused.reason}` : 'the zip contains no .xise (ISE project) and no silinx.json');
  const root = (xe || pe).path.includes('/') ? (xe || pe).path.replace(/\/[^/]*$/, '') : '';
  const rel = p => (!root ? p : p.startsWith(root + '/') ? p.slice(root.length + 1) : null);
  const warnings = gateMessages(gated);
  const files = {};
  for (const e of entries) {
    const r = rel(e.path);
    if (r === null) continue;
    const k = safePath(r);
    if (!k) { warnings.push(`zip entry outside the project skipped (${r})`); continue; }
    if (/^build\//.test(k)) continue;
    files[k] = textOf(e);
  }
  const p = xe ? xiseProject(name, textOf(xe), files) : { json: emptyProjectJson(name), files: {}, warnings: [] };
  warnings.push(...p.warnings);
  // (an ISE project's sources are xiseProject's already; a Silinx export's files are all the zip's: the empty project's
  // default constraints path is not a file, and constraints/top.ucf, the pins, is one to keep, #2894)
  const known = new Set(xe ? p.json.files.map(f => f.path).concat(p.json.constraints) : []);
  for (const [k, v] of Object.entries(files)) if (!known.has(k) && !/\.xise$/i.test(k) && !isDescriptor(k) && !(pe && !xe && k === ANCESTOR_FILE)) p.files[k] = v;
  const missing = [];
  if (pe) {
    let saved = null;
    try { saved = JSON.parse(textOf(pe)); } catch { warnings.push(`${PROJECT_FILE} is not valid JSON: ignored`); }
    if (saved !== null) {
      const n = normalizeProjectJson(saved, name);
      warnings.push(...n.warnings);
      // an ISE project exported by Silinx: the settings ISE does not know about come from silinx.json
      p.json = xe ? { ...p.json, board: n.json.board ?? p.json.board, stimuli: n.json.stimuli, preferredLanguage: n.json.preferredLanguage, impl: { ...p.json.impl, ...n.json.impl } } : n.json;
      if (!xe) {
        for (const f of n.json.files) if (p.files[f.path] === undefined) missing.push(f.path);
        // (a constraints file not in the zip is missing, but the device's default, a new project's not written yet, #4288, #4356)
        const c = n.json.constraints;
        if (c && c !== `constraints/top${constraintsExtOf(n.json.device)}` && p.files[c] === undefined && !missing.includes(c)) missing.push(c);
      }
    }
  }
  // a project from outside: trusted only once the user says so (#2830, core/trust.js)
  // (a copy's ancestor, #4205: kept apart by the caller, never a project file)
  return { json: markUntrusted(p.json), files: p.files, warnings, missing, ancestor: pe && !xe ? files[ANCESTOR_FILE] ?? null : null };
}

/**
 * An old project bundle (a .silinx.json file: { format: 'silinx-bundle', project, files }, which the browser edition's
 * File ▸ Download Project Bundle made before #3548) as a Silinx zip's entries: its silinx.json and its text files, each
 * with its path, for the import gate and projectFromZip; null for a text that is not one.
 */
export function bundleEntries(text) {
  let b;
  try { b = JSON.parse(text); } catch { return null; }
  if (!plain(b) || b.format !== 'silinx-bundle') return null;
  const files = plain(b.files) ? Object.entries(b.files).filter(([path, data]) => typeof data === 'string' && !isDescriptor(path)) : [];
  // (none: false, not a project description, which projectFromZip says)
  return [{ path: PROJECT_FILE, data: JSON.stringify(b.project ?? false) }, ...files.map(([path, data]) => ({ path, data }))];
}

// ------------------------------------------------------------------ the browser's storage
const storageFull = e => new Error(`browser storage is full or unavailable (${e.message}); export your project (File > Export Project (.zip)…) to keep it`);
const unreadable = e => new Error(`the browser storage could not be read (${e.message})`);
/** The keys of a Storage (a localStorage), [] when it cannot say. */
export function storageKeys(st) {
  if (typeof st?.key !== 'function') return [];
  const out = [];
  for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k != null) out.push(k); }
  return out;
}
/**
 * Projects in localStorage (`storage`), one entry per project (#4725): BROWSER_PROJECT_PREFIX + name holds
 * { json, files: { path: text }, modified }. Nothing is cached: every operation reads its project's entry again and
 * writes it whole, so two tabs (two stores on one storage) keep each other's projects and changes. An entry that cannot
 * be read (the storage failing, its JSON damaged) is an error, never a project to write over; a write that fails
 * changes nothing. The projects of earlier versions, all in the one entry BROWSER_KEY, are moved out to their own
 * entries one by one (each written before it leaves the old entry); one that does not fit stays there, read as before.
 */
export function browserStore(storage = () => globalThis.localStorage) {
  const ls = () => (typeof storage === 'function' ? storage() : storage);
  const keyOf = name => BROWSER_PROJECT_PREFIX + name;
  const getItem = k => { try { return ls().getItem(k); } catch (e) { throw unreadable(e); } };
  const setItem = (k, v) => { try { ls().setItem(k, v); } catch (e) { throw storageFull(e); } };
  const parse = (name, text) => {
    let p;
    try { p = JSON.parse(text); } catch { p = null; }
    return plain(p) && plain(p.json) && plain(p.files) ? p : fail(`project '${name}' is damaged in the browser storage: not read (nor written over)`);
  };
  // the old entry's projects ({} when none; null when it cannot be read: left as it is)
  const legacy = () => {
    const t = getItem(BROWSER_KEY);
    if (t == null) return {};
    try { const v = JSON.parse(t); return plain(v) ? v : null; } catch { return null; }
  };
  // the old entry's projects moved to entries of their own, each written before it leaves the old entry (a project
  // with an entry already: the entry is the newer); one that does not fit stays
  const migrate = () => {
    const old = legacy();
    if (!old || !Object.keys(old).length) return;
    const left = { ...old };
    for (const [name, p] of Object.entries(old)) {
      try { if (getItem(keyOf(name)) == null) ls().setItem(keyOf(name), JSON.stringify(p)); } catch { continue; }
      delete left[name];
    }
    try { if (Object.keys(left).length) ls().setItem(BROWSER_KEY, JSON.stringify(left)); else ls().removeItem(BROWSER_KEY); } catch { /* moved again next time */ }
  };
  const read = name => {
    migrate();
    const t = getItem(keyOf(name));
    if (t != null) return parse(name, t);
    const old = legacy()?.[name];
    return old && plain(old.json) && plain(old.files) ? old : null;
  };
  const get = name => read(name) || fail(`project '${name}' not found`);
  // the project read again, changed, written whole (out of the old entry too when it was there)
  const change = (name, fn) => {
    const p = get(name);
    fn(p);
    p.modified = Date.now();
    setItem(keyOf(name), JSON.stringify(p));
    migrate();
  };
  const names = () => {
    migrate();
    const out = new Set(storageKeys(ls()).filter(k => k.startsWith(BROWSER_PROJECT_PREFIX)).map(k => k.slice(BROWSER_PROJECT_PREFIX.length)));
    for (const n of Object.keys(legacy() || {})) out.add(n);
    return [...out];
  };
  const store = {
    kind: 'browser', label: null,
    // (modified: when it last changed, ms, kept beside it; 0 for one saved before, #1156; a damaged one not listed)
    list: async () => names().flatMap(n => { try { const p = read(n); return p ? [{ ...p.json, name: n, modified: p.modified || 0 }] : []; } catch { return []; } })
      .sort((a, b) => a.name.localeCompare(b.name)),
    // (a damaged entry is there: its name taken)
    exists: async name => getItem(keyOf(name)) != null || !!legacy()?.[name],
    load: async name => get(name),
    create: async (name, json, files = {}) => {
      if (getItem(keyOf(name)) != null || legacy()?.[name]) fail(`project '${name}' already exists`);
      const p = { json: { ...clone(json), name }, files: Object.fromEntries(Object.entries(files).map(([k, v]) => [cleanPath(k), v])), modified: Date.now() };
      setItem(keyOf(name), JSON.stringify(p));
    },
    saveJson: async (name, json) => change(name, p => { p.json = { ...clone(json), name }; delete p.json.fileTree; }),
    writeFile: async (name, path, text) => change(name, p => { p.files[cleanPath(path)] = text; }),
    // a file, or a folder (everything under it)
    removePath: async (name, path) => change(name, p => {
      path = cleanPath(path);
      for (const k of Object.keys(p.files)) if (under(k, path)) delete p.files[k];
    }),
    renamePath: async (name, from, to) => change(name, p => {
      from = cleanPath(from); to = cleanPath(to);
      for (const k of Object.keys(p.files).filter(x => under(x, from))) { const v = p.files[k]; delete p.files[k]; p.files[to + k.slice(from.length)] = v; }
    }),
    deleteProject: async name => {
      get(name);
      try { ls().removeItem(keyOf(name)); } catch (e) { throw storageFull(e); }
      const old = legacy();
      if (old?.[name]) { delete old[name]; setItem(BROWSER_KEY, JSON.stringify(old)); }
    },
    // Rename Project… (#4641): its entry under the new name, the old one removed only once that is stored
    renameProject: async (from, to) => {
      const p = get(from);
      const files = Object.fromEntries(Object.entries(p.files).map(([k, v]) => [renamedFile(k, from, to) && !(renamedFile(k, from, to) in p.files) ? renamedFile(k, from, to) : k, v]));
      setItem(keyOf(to), JSON.stringify({ ...p, json: { ...p.json, name: to }, files, modified: Date.now() }));
      if (keyOf(from) !== keyOf(to)) await store.deleteProject(from).catch(() => {});
    },
    // the build's outputs stay in memory in this storage (too large for localStorage)
    writeBuild: async () => {},
    readBinary: async () => null,
    readText: async () => null,
  };
  return store;
}

// ------------------------------------------------------------------ a folder on the disk
const notFound = e => e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError');
async function dirAt(root, parts, create = false) {
  let d = root;
  for (const p of parts) d = await d.getDirectoryHandle(p, { create });
  return d;
}
const split = path => { const parts = cleanPath(path).split('/'); return { parts, last: parts.pop() }; };
async function writeAt(root, path, data) {
  const { parts, last } = split(path);
  const fh = await (await dirAt(root, parts, true)).getFileHandle(last, { create: true });
  const w = await fh.createWritable();   // written to a temporary file, swapped in at close (atomic)
  try { await w.write(data); await w.close(); } catch (e) { await w.abort?.().catch(() => {}); throw e; }
}
async function entryAt(root, path) {
  const { parts, last } = split(path);
  let dir;
  try { dir = await dirAt(root, parts); } catch (e) { if (notFound(e)) return null; throw e; }
  try { return { dir, name: last, handle: await dir.getFileHandle(last) }; } catch (e) { if (!notFound(e)) throw e; }
  try { return { dir, name: last, handle: await dir.getDirectoryHandle(last) }; } catch (e) { if (!notFound(e)) throw e; }
  return null;
}
async function copyDir(src, dst, { skip = () => false } = {}) {
  for await (const [name, h] of src.entries()) {
    if (skip(name, h)) continue;
    if (h.kind === 'directory') await copyDir(h, await dst.getDirectoryHandle(name, { create: true }));
    else await writeAt(dst, name, new Uint8Array(await (await h.getFile()).arrayBuffer()));
  }
}
// the .trash's entries deleted more than TRASH_DAYS days ago removed (core/trash.js, as the server's, #4758); one that
// cannot be removed is left for the next time
async function emptyTrash(trash, now = Date.now()) {
  const old = [];
  for await (const [name] of trash.entries()) if (expiredTrash(name, now)) old.push(name);
  for (const name of old) await trash.removeEntry(name, { recursive: true }).catch(() => {});
}
// the project's files (server/projects.js fileTree: no hidden entries, no build/ at the top, no silinx.json)
async function walk(dir, base = '', out = {}) {
  for await (const [name, h] of dir.entries()) {
    if (name.startsWith('.') || (base === '' && name === 'build')) continue;
    const rel = base ? `${base}/${name}` : name;
    if (h.kind === 'directory') await walk(h, rel, out);
    else if (!isDescriptor(rel)) out[rel] = await (await h.getFile()).text();
  }
  return out;
}

/** Projects in the folder `root` (a FileSystemDirectoryHandle): <root>/<name>/silinx.json + files. */
export function folderStore(root) {
  const cache = new Map();   // name -> { json, files } (read when first used, again when opened)
  const locks = new Map();   // one operation at a time per project (autosave, several calls)
  const locked = (name, fn) => {
    const key = name.toLowerCase();
    const run = (locks.get(key) || Promise.resolve()).then(fn);
    const tail = run.catch(() => {});
    locks.set(key, tail);
    tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
    return run;
  };
  const projectDir = async (name, create = false) => {
    if (projectNameError(name)) fail(projectNameError(name));
    try { return await root.getDirectoryHandle(name, { create }); } catch (e) { if (notFound(e)) fail(`project '${name}' not found`); throw e; }
  };
  const readJson = async dir => JSON.parse(await (await (await dir.getFileHandle(PROJECT_FILE)).getFile()).text());
  async function read(name) {
    const dir = await projectDir(name);
    let json;
    try { json = await readJson(dir); } catch { fail(`project '${name}' not found`); }
    json.name = name;
    // (#4735: trusted only with this browser's record of it, the folder's projects recorded once the first time)
    await trustRecords.migrateOnce(root.name, () => store.list());
    trustRecords.marked(root.name, name, json);
    if (!Array.isArray(json.files)) json.files = [];
    const p = { json, files: await walk(dir) };
    cache.set(name, p);
    return p;
  }
  const get = name => cache.get(name) || read(name);
  const store = {
    kind: 'folder', label: root.name, handle: root,
    list: async () => {
      const out = [];
      for await (const [name, h] of root.entries()) {
        if (h.kind !== 'directory' || name.startsWith('.') || !NAME_RE.test(name)) continue;
        // (modified: its project file's date, #1156)
        try { out.push({ ...await readJson(h), name, modified: (await (await h.getFileHandle(PROJECT_FILE)).getFile()).lastModified || 0 }); } catch { /* not a project */ }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
    exists: async name => { try { await root.getDirectoryHandle(name); return true; } catch (e) { if (notFound(e)) return false; throw e; } },
    // fresh: read again from the disk (the folder may have been changed by another program)
    load: (name, { fresh = false } = {}) => locked(name, () => (fresh ? read(name) : get(name))),
    // dirs: empty folders to make (a new empty project: src, sim, constraints, as the server does)
    create: (name, json, files = {}, { dirs = [] } = {}) => locked(name, async () => {
      if (await store.exists(name)) fail(`project '${name}' already exists`);
      const dir = await projectDir(name, true);
      for (const d of dirs) await dirAt(dir, d.split('/'), true);
      for (const [path, data] of Object.entries(files)) if (!isDescriptor(cleanPath(path))) await writeAt(dir, path, data);
      await writeAt(dir, PROJECT_FILE, projectJsonText(name, trustRecords.unmarked(json)));
      return read(name);
    }),
    saveJson: (name, json) => locked(name, async () => {
      const p = await get(name);
      await writeAt(await projectDir(name), PROJECT_FILE, projectJsonText(name, trustRecords.unmarked(json)));
      p.json = trustRecords.marked(root.name, name, JSON.parse(projectJsonText(name, trustRecords.unmarked(json))));
    }),
    writeFile: (name, path, text) => locked(name, async () => {
      const p = await get(name);
      await writeAt(await projectDir(name), path, text);
      p.files[path] = text;
    }),
    // (trash: copied to <folder>/.trash/<name>-<time>/<path> first, as the server does, #3364 -> that path)
    removePath: (name, path, { trash = false } = {}) => locked(name, async () => {
      const p = await get(name);
      const e = await entryAt(await projectDir(name), path);
      let trashed = null;
      if (e && trash) {
        const stamp = `${name}-${Date.now()}`, bin = await root.getDirectoryHandle('.trash', { create: true });
        let base = stamp;
        for (let i = 2; await bin.getDirectoryHandle(base).then(() => true, () => false); i++) base = `${stamp}-${i}`;
        const into = await bin.getDirectoryHandle(base, { create: true });
        if (e.handle.kind === 'directory') {
          const { parts, last } = split(path);
          await copyDir(e.handle, await (await dirAt(into, parts, true)).getDirectoryHandle(last, { create: true }));
        } else await writeAt(into, path, new Uint8Array(await (await e.handle.getFile()).arrayBuffer()));
        trashed = `.trash/${base}/${cleanPath(path)}`;
        await emptyTrash(bin);
      }
      if (e) await e.dir.removeEntry(e.name, { recursive: true });
      for (const k of Object.keys(p.files)) if (under(k, path)) delete p.files[k];
      return trashed;
    }),
    // a file or a folder (copied, then the original removed: a folder handle cannot be moved). A copy that fails is
    // removed, the original as it was; an original that is not removed: a file's copy removed (a file goes at once, so
    // the original is whole), a folder's copy kept, complete, and said (what is left of the original is, #4724)
    renamePath: (name, from, to) => locked(name, async () => {
      const p = await get(name);
      const dir = await projectDir(name);
      const e = await entryAt(dir, from) || fail(`file '${from}' not found`);
      const isDir = e.handle.kind === 'directory';
      if (isDir) {
        const { parts, last } = split(to);
        const parent = await dirAt(dir, parts, true);
        try { await copyDir(e.handle, await parent.getDirectoryHandle(last, { create: true })); } catch (err) {
          await parent.removeEntry(last, { recursive: true }).catch(() => {});
          throw err;
        }
      } else await writeAt(dir, to, new Uint8Array(await (await e.handle.getFile()).arrayBuffer()));
      try { await e.dir.removeEntry(e.name, { recursive: true }); } catch (err) {
        if (!isDir) { const c = await entryAt(dir, to); await c?.dir.removeEntry(c.name).catch(() => {}); throw err; }
        cache.delete(name);
        fail(`'${from}' was copied to '${to}', but '${from}' could not be removed entirely (${err.message}): the copy is complete, remove what is left of '${from}'`);
      }
      for (const k of Object.keys(p.files).filter(x => under(x, from))) { const v = p.files[k]; delete p.files[k]; p.files[to + k.slice(from.length)] = v; }
    }),
    // as the server: the project folder goes to <folder>/.trash/<name>-<time> (recoverable)
    deleteProject: name => locked(name, async () => {
      const dir = await projectDir(name);
      const trash = await root.getDirectoryHandle('.trash', { create: true });
      // (its build's outputs not kept, #4758: a run makes them again)
      await copyDir(dir, await trash.getDirectoryHandle(`${name}-${Date.now()}`, { create: true }), { skip: (n, h) => n === 'build' && h.kind === 'directory' });
      await root.removeEntry(name, { recursive: true });
      cache.delete(name);
      await emptyTrash(trash);
    }),
    // Rename Project… (#4641): its folder copied under the new name, then the old one removed (no move of a folder in the
    // File System Access API); a failure while copying removes the copy, the old project as it was. A complete copy is
    // never removed (#4724): the old folder's silinx.json goes first (a single file: the old project whole until it is
    // gone), then the rest; what is left of it when that fails is said, the new project kept. A change of case alone
    // (one folder on a case-insensitive disk) through a hidden copy, removed only once the project is whole again
    // under one of its names; kept, and named in the error, when it is the only complete copy.
    renameProject: (from, to) => locked(from, async () => {
      const src = await projectDir(from);
      if (projectNameError(to)) fail(projectNameError(to));
      const caseOnly = from.toLowerCase() === to.toLowerCase();
      // (fresh: a folder of its own, removed when the copy fails; else a restore over what is there, never removed)
      const copy = async (dir, name, json, { fresh = true } = {}) => {
        const dst = await root.getDirectoryHandle(name, { create: true });
        try {
          await copyDir(dir, dst);
          if (json) {
            await writeAt(dst, PROJECT_FILE, projectJsonText(to, json));
            const kept = [];
            for await (const [n, h] of dst.entries()) if (h.kind === 'file' && renamedFile(n, from, to)) kept.push([n, h]);
            for (const [n, h] of kept) {
              const r = renamedFile(n, from, to);
              if (await entryAt(dst, r)) continue;
              await writeAt(dst, r, new Uint8Array(await (await h.getFile()).arrayBuffer()));
              await dst.removeEntry(n);
            }
          }
        } catch (e) { if (fresh) await root.removeEntry(name, { recursive: true }).catch(() => {}); throw e; }
        return dst;
      };
      // the old folder removed: false when its silinx.json is still there (the old project whole), else true, or the
      // error that stopped the rest
      const removeOld = async () => {
        try { await src.removeEntry(PROJECT_FILE); } catch (e) { if (!notFound(e)) return { kept: e }; }
        try { await root.removeEntry(from, { recursive: true }); return {}; } catch (e) { return notFound(e) ? {} : { left: e }; }
      };
      const json = await readJson(src);
      cache.delete(from); cache.delete(to);
      if (!caseOnly) {
        if (await store.exists(to)) fail(`a project named '${to}' already exists: choose another name`);
        await copy(src, to, json);
        const r = await removeOld();
        if (r.kept) { await root.removeEntry(to, { recursive: true }).catch(() => {}); throw r.kept; }
        if (r.left) fail(`'${from}' was renamed '${to}', but its old folder could not be removed entirely (${r.left.message}): '${to}' is complete, remove what is left of the folder '${from}'`);
        return;
      }
      const tmp = `.rename-${to}-${Date.now()}`, held = await copy(src, tmp, json);
      const r = await removeOld();
      if (r.kept) { await root.removeEntry(tmp, { recursive: true }).catch(() => {}); throw r.kept; }
      // the project whole again under `to`, else under `from` (over what is left of it); the hidden copy removed only then
      let made = null, cause = r.left;
      for (const name of r.left ? [from, to] : [to, from]) {
        try { made = await copy(held, name, null, { fresh: false }); break; } catch (e) { cause ||= e; }
      }
      if (!made) fail(`Rename Project: '${from}' could not be made again (${cause.message}): its complete copy is the folder '${tmp}'`);
      // (a copy left under the other name, a folder of its own on a case-sensitive disk: removed)
      for (const name of [from, to]) {
        const h = await root.getDirectoryHandle(name).catch(() => null);
        if (h && !await h.isSameEntry(made)) await root.removeEntry(name, { recursive: true }).catch(() => {});
      }
      await root.removeEntry(tmp, { recursive: true }).catch(() => {});
      if (cause) fail(`'${from}' was not renamed: ${cause.message}`);
    }),
    // the build's outputs (build/…), as the full application writes them
    writeBuild: (name, path, data) => locked(name, async () => writeAt(await projectDir(name), path, data)),
    readBinary: async (name, path) => {
      const e = await entryAt(await projectDir(name), path);
      return e && e.handle.kind === 'file' ? new Uint8Array(await (await e.handle.getFile()).arrayBuffer()) : null;
    },
    // a file of the project as text, also in build/ (not among the project's files): null if none
    readText: async (name, path) => {
      const e = await entryAt(await projectDir(name), path);
      return e && e.handle.kind === 'file' ? (await e.handle.getFile()).text() : null;
    },
  };
  return store;
}

// ------------------------------------------------------------------ a build's results in build/
// The full application keeps them in the project's build/ folder (server/open-flow.js: reports.json,
// for the Design Summary; server/impl-routes.js: open/fpga-view.json, the FPGA view's model of
// open/routed.xdl). In a workspace folder the browser edition writes and reads back the same files,
// so a build is still there after a reload (in the browser's storage: this session only).
export const BUILD_REPORTS = 'build/reports.json';
export const BUILD_VIEW = 'build/open/fpga-view.json';
// the FPGA view's cache: the browser edition's key, or the full application's (open:<version>:…)
const viewKey = version => `browser:${version}`;
const viewUsable = (c, version) => !!c?.model?.available && (c.key === viewKey(version) || String(c.key).startsWith(`open:${version}:`));

/** Writes a build's results into the project's build/ folder (a store without one: nothing).
 *  report: build/reports.json; view: the FPGA view's model (null: the cache of an earlier one removed). */
export async function saveBuildResults(store, name, { report, view, modelVersion }) {
  if (store.kind !== 'folder') return;
  if (report) await store.writeBuild(name, BUILD_REPORTS, JSON.stringify(report, null, 2) + '\n');
  if (view) await store.writeBuild(name, BUILD_VIEW, JSON.stringify({ key: viewKey(modelVersion), model: view }));
  else await store.removePath(name, BUILD_VIEW);
}

/** The build's results read back from the project's build/ folder: { report, view } (null: none).
 *  The FPGA view only of the Silinx toolchain's routed design (reports.json of an ISE run: none)
 *  and of this model format (modelVersion: packages/silinx-fpga/src/xdl.js MODEL_VERSION). */
export async function readBuildResults(store, name, { modelVersion }) {
  const json = async path => { try { return JSON.parse(await store.readText(name, path)); } catch { return null; } };
  const report = await json(BUILD_REPORTS);
  if (!report || typeof report !== 'object') return { report: null, view: null };
  let view = null;
  if (report.source === 'open' && report.summary?.routed) {
    const c = await json(BUILD_VIEW);
    if (viewUsable(c, modelVersion)) view = c.model;
  }
  return { report, view };
}

// ------------------------------------------------------------------ the project operations
/** The API's project calls on the store `getStore()` returns (the one in use). */
export function projectOps(getStore, examples = {}, { beforeMigrate = null } = {}) {
  const S = () => getStore();
  // (#4735: a folder on the disk's projects: the user's own recorded as trusted, the migration first; none in the
  // browser's own storage, which nothing but Silinx writes)
  const folder = () => (S().kind === 'folder' ? S().label : null);
  const recordOwn = async name => {
    if (folder() === null) return;
    await trustRecords.migrateOnce(folder(), () => S().list());
    trustRecords.record(folder(), name);
  };
  const ops = {
    list: async () => (await S().list()).map(j => ({ name: j.name, device: j.device, top: j.top, board: j.board, modified: j.modified || 0 })),
    load: name => S().load(name),
    create: async ({ name, template = 'empty', device, board, kind = null }) => {
      if (projectNameError(name)) fail(projectNameError(name));
      // (a design and simulation project, #3780: empty, no board, no constraints; the server's rule and messages)
      // (a System project, #4702: empty with its System document, or a System example; core/project-kind.js)
      const refused = createRefusal(kind, template);
      if (refused) fail(refused);
      // (one in another case too: the same folder on a case-insensitive file system, #3538)
      const other = sameProject(await S().list(), name)?.name;
      if (other || await S().exists(name)) fail(`project '${other ?? name}' already exists`);
      if (template && template !== 'empty') {
        const ex = examples[template] || fail(`unknown template '${template}'`);
        const json = { ...clone(ex.json), name }, fromBoard = json.board;
        const noBoard = boardRefusal(json, { board, device });   // (a System example, #4702)
        if (noBoard) fail(noBoard);
        // (a Circuit example, #5757: a design project, no board, its constraints file left out, as the server's)
        if (kind === DESIGN_KIND) {
          const c = circuitExample(json), files = clone(ex.files);
          for (const f of c.drop) delete files[f];
          await recordOwn(name);
          await S().create(name, c.project, files);
          return clone(c.project);
        }
        if (device) json.device = device;
        if (board !== undefined) json.board = board;
        json.files ||= [];
        // a device whose constraints are of another format (the 7-series' XDC, #3142): the example's file left out, the
        // board's written when the project opens (implement.js boardUcf), as the server does
        const files = clone(ex.files), ext = constraintsExtOf(json.device);
        if (json.constraints && !json.constraints.toLowerCase().endsWith(ext)) {
          delete files[json.constraints];
          json.constraints = json.constraints.replace(/\.[^./]*$/, '') + ext;
        }
        // another board than the example's: its clock and its buttons' and switches' levels as the top's generics,
        // as the server does (core/board-generics.js, #3710)
        if (json.board && json.board !== fromBoard) {
          const design = json.files.filter(f => f.role !== 'sim' && /^(vhdl|verilog)$/.test(f.lang) && typeof files[f.path] === 'string');
          const top = topForBoard(design.map(f => ({ path: f.path, lang: f.lang, text: files[f.path] })), json.top, resolveBoard(json.board, { part: json.device?.part }));
          if (top) files[top.path] = top.text;
        }
        await recordOwn(name);
        await S().create(name, json, files);
        return clone(json);
      }
      const json = newProjectJson(name, { device, board, kind });   // (core/project-defaults.js, as the server's, #4766)
      await recordOwn(name);
      const sysFile = newSystemKind(kind) ? newSystemFile(name) : null;
      await S().create(name, json, sysFile ? { [sysFile.path]: sysFile.text } : {}, { dirs: kind ? ['src', 'sim'] : ['src', 'sim', 'constraints'] });
      return clone(json);
    },
    /** A whole project at once (imports, bundles, copies): its description normalised (what it drops
     *  is for the caller to say: normalizeProjectJson), every file's path inside the project. */
    put: async (name, json, files = {}) => {
      if (projectNameError(name)) fail(projectNameError(name));
      const clean = normalizeProjectJson(json, name).json;
      const out = {};
      for (const [k, v] of Object.entries(files)) { const p = cleanPath(k); if (!isDescriptor(p)) out[p] = v; }
      await S().create(name, clean, out);
      return clone(clean);
    },
    project: async name => {
      const p = await S().load(name, { fresh: true });
      return { ...clone(p.json), fileTree: Object.keys(p.files).sort() };
    },
    saveProject: async (name, pj) => {
      const cur = await S().load(name);
      const clean = { ...clone(pj), name };
      delete clean.fileTree;
      // a project from outside stays so until the user trusts it (trustProject, #2830), as the server's writeProject
      // (and who made it or changed it: its messages, #2981, #3355)
      if (cur.json?.trusted === false) Object.assign(clean, { trusted: false }, cur.json.madeBy ? { madeBy: cur.json.madeBy } : {});
      // (its id and origin, the copies' record, never the interface's to change: #4205)
      delete clean.id; delete clean.origin;
      if (cur.json?.id !== undefined) clean.id = cur.json.id;
      if (cur.json?.origin !== undefined) clean.origin = cur.json.origin;
      await S().saveJson(name, clean);
      return clone(clean);
    },
    // the user trusts a project from outside (#2830): Xilinx ISE and programming may run for it
    trustProject: async (name) => {
      const { trusted, madeBy, ...json } = (await S().load(name)).json;   // eslint-disable-line no-unused-vars
      if (folder() !== null) trustRecords.record(folder(), name, typeof json.id === 'string' ? json.id : null);
      await S().saveJson(name, json);
      return clone({ ...json, name });
    },
    readFile: async (name, path) => {
      const p = await S().load(name);
      const t = p.files[await spelled(p, cleanPath(path))];
      if (t === undefined) fail(`file '${path}' not found`);
      return t;
    },
    // a file's bytes (a firmware's .elf, #5198), as the local server's readFileBytes: a workspace folder's file; the
    // browser's storage keeps text only
    readFileBytes: async (name, path) => {
      const p = await S().load(name);
      const key = await spelled(p, cleanPath(path));
      if (p.files[key] === undefined) fail(`file '${path}' not found`);
      const b = await S().readBinary(name, key);
      if (!b) fail(`${key}: the browser's storage keeps text files only: an .elf needs a workspace folder (File ▸ Open Workspace Folder…), or give the firmware's .hex`);
      return b;
    },
    writeFile: async (name, path, text) => {
      const p = await S().load(name);
      // written again: back in the project
      path = notDescriptor(await spelled(p, cleanPath(path)));
      // (a name by the import gate's rules, as the local server's, #3414; build/'s files by the rest of their path)
      const gated = normalizePath(/^build\//.test(path) ? `b${path.slice(5)}` : path);   // (build/x as b/x)
      if (gated.reason) fail(`'${path}': not written: ${gated.reason}`);
      // (a drawing a newer Silinx saved never written over in an older format, as the local server's, #4756)
      const refused = downgradeRefusal(path, p.files[path] ?? null, text);
      if (refused) throw Object.assign(new Error(refused), { status: 409 });
      // (a document's first save in a newer format: a version of the project as it was first, as the local server's,
      // #5906; its error never stops the save)
      if (beforeMigrate && migratingWrite(path, p.files[path] ?? null, text)) await Promise.resolve().then(() => beforeMigrate(name)).catch(() => {});
      await S().writeFile(name, path, text);
      const json = clone(p.json);
      if (registerWritten(json, path)) await S().saveJson(name, json);   // (core/project-entries.js, as the server's, #4733)
      return { ok: true };
    },
    renameFile: async (name, from, to) => {
      const p = await S().load(name);
      from = notDescriptor(await spelled(p, cleanPath(from))); to = notDescriptor(await spelled(p, cleanPath(to), { last: false }));
      // the new name by the import gate's rules for a name, as the local server's Rename (#2973)
      const gated = normalizePath(to);
      if (gated.reason) fail(`'${to}': not renamed: ${gated.reason}`);
      const json = clone(p.json);
      // (a rename of its case through another name: a case-insensitive file system has the old name and the new one
      // as the same file, which a copy then a removal of the old would lose)
      const move = async () => {
        if (from === to) return;
        if (foldName(from) !== foldName(to)) return S().renamePath(name, from, to);
        const tmp = `${to}.renaming-${Date.now()}`;
        await S().renamePath(name, from, tmp);
        await S().renamePath(name, tmp, to);
      };
      const isDir = p.files[from] === undefined && Object.keys(p.files).some(k => k.startsWith(`${from}/`));
      if (p.files[from] === undefined && !isDir) fail(`file '${from}' not found`);
      if (isDir && to.startsWith(`${from}/`)) fail(`cannot move '${from}' into itself`);
      // a name the folder has in another case is taken too, but the file's own (a rename of its case, #3536)
      const { parts, last } = split(to), folder = parts.join('/');
      const taken = sameNameIn(last, namesOf(p.files)(folder));
      if (taken && (folder ? `${folder}/${taken}` : taken) !== from) fail(`'${to}' already exists`);
      // a file, or a folder (every file under it): the registrations, the constraints path, the files removed from the
      // project (#1228) and the sources' languages follow (core/project-entries.js renameEntries, as the server's, #4766)
      await move();
      renameEntries(json, from, to);
      await S().saveJson(name, json);
      return clone(json);
    },
    // (trash: into the folder's .trash, where the store keeps one, the folder's: keepsTrash, #3364)
    deleteFile: async (name, path, { trash = false } = {}) => {
      const p = await S().load(name);
      path = notDescriptor(await spelled(p, cleanPath(path)));
      const trashed = (await S().removePath(name, path, { trash })) || null;
      const json = clone(p.json);
      deleteEntries(json, path);   // (core/project-entries.js, as the server's, #4766)
      await S().saveJson(name, json);
      return { ok: true, ...(trashed ? { trashed } : {}) };
    },
    deleteProject: async name => { await S().deleteProject(name); if (folder() !== null) trustRecords.forget(folder(), name); return { ok: true }; },
    // Rename Project… (#4641): the server's checks and messages (core/project-rename.js)
    renameProject: async (from, to) => {
      if (!await S().exists(from)) fail(`project '${from}' not found`);
      const problem = renameProblem(from, to, (await S().list()).map(j => j.name));
      if (problem) fail(problem.message);
      if (folder() !== null) trustRecords.moveRecord(folder(), from, to);
      try { await S().renameProject(from, to); } catch (e) { if (folder() !== null) trustRecords.moveRecord(folder(), to, from); throw e; }
      return { name: to };
    },
    sources: async name => {
      const p = await S().load(name);
      return p.json.files.map(f => ({ ...f, text: p.files[f.path] ?? '', missing: p.files[f.path] === undefined }));
    },
  };
  return ops;
}

/** The projects of a listing ({ name, modified }) by when each was last used, the newest first (#1156): its last change
 *  or, when later, its last opening in this browser (opened: { name: ms }); then by name. Each gets `used` (ms, 0: never). */
export function byLastUsed(list, opened = {}) {
  return list.map(p => ({ ...p, used: Math.max(+p.modified || 0, +opened[p.name] || 0) }))
    .sort((a, b) => b.used - a.used || a.name.localeCompare(b.name));
}

/** Copies every project of store `from` into store `to`; one already there (same name) is not
 *  copied. Returns { copied: [names], skipped: [names] }. */
export async function copyProjects(from, to) {
  const copied = [], skipped = [];
  // (#4735: into a folder on the disk, a project trusted here recorded as trusted there, the folder's migration first)
  if (to.kind === 'folder') await trustRecords.migrateOnce(to.label, () => to.list());
  for (const j of await from.list()) {
    if (await to.exists(j.name)) { skipped.push(j.name); continue; }
    const p = await from.load(j.name);
    if (to.kind === 'folder' && p.json.trusted !== false) trustRecords.record(to.label, j.name, typeof p.json.id === 'string' ? p.json.id : null);
    await to.create(j.name, p.json, { ...p.files });
    copied.push(j.name);
  }
  return { copied, skipped };
}
