// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A project's list of files (silinx.json's files, excluded and constraints) as Add to Project, Remove from Project and a
// file written change it, and the top modules a removal leaves missing (#4733): the interface (web/js/app.js,
// web/js/design.js), the MCP server (server/mcp-sources.js), the stores (server/projects.js, web/js/project-store.js)
// and the live share (core/collab-files.js) all go through these. Isomorphic module (browser + Node).

import { hdlLangOf, roleOfPath, isConstraintsFile } from './file-kinds.js';

/** An HDL source's entry as Add to Project makes it ({ path, lang, role }); null for another file. */
export function fileEntry(path) {
  const lang = hdlLangOf(path);
  return lang ? { path, lang, role: roleOfPath(path) } : null;
}

/** Add to Project of `path` (a file of the project folder), on `pj` (changed, and returned): no longer excluded, an HDL
 *  source listed, a constraints file (any family's format) the project's constraints when it has none. */
export function addToProject(pj, path) {
  pj.files ||= [];
  pj.excluded = (pj.excluded || []).filter(f => f !== path);
  const entry = fileEntry(path);
  if (entry && !pj.files.some(f => f.path === path)) pj.files.push(entry);
  if (isConstraintsFile(path) && !pj.constraints) pj.constraints = path;
  return pj;
}

/** Whether Add to Project of `path` would change `pj` (false: it is in the project already). */
export const addsToProject = (pj, path) => (pj.excluded || []).includes(path) || (!!fileEntry(path) && !(pj.files || []).some(f => f.path === path))
  || (isConstraintsFile(path) && !pj.constraints);

/** Remove from Project of `paths` on `pj` (changed, and returned): an HDL source leaves the list, another file is
 *  excluded; the constraints file removed leaves the project with none. The files stay in the project folder. */
export function removeFromProject(pj, paths) {
  pj.files ||= [];
  for (const f of paths.filter(Boolean)) {
    const listed = pj.files.some(x => x.path === f);
    if (listed) pj.files = pj.files.filter(x => x.path !== f);
    if (pj.constraints === f) pj.constraints = '';
    if (!listed) pj.excluded = [...new Set([...(pj.excluded || []), f])];
  }
  return pj;
}

/** A file written (`path`) on `pj` (changed): back in the project if it was excluded, an HDL source listed (not build/'s
 *  generated files). True when `pj` changed. */
export function registerWritten(pj, path) {
  let changed = false;
  if ((pj.excluded || []).includes(path)) { pj.excluded = pj.excluded.filter(f => f !== path); changed = true; }
  const entry = /^build\//.test(path) ? null : fileEntry(path);
  if (entry && !(pj.files ||= []).some(f => f.path === path)) { pj.files.push(entry); changed = true; }
  return changed;
}

/** A file or a folder of the project renamed (or moved) from `from` to `to` (paths of the project), on `pj` (changed, and
 *  returned; #4766, one for the server and the browser): a file's path maps exactly, a folder's every path under it; a
 *  listed source's language follows its new name when that is an HDL one (`.vh` too), else it is kept; the constraints
 *  path, the files removed from the project (#1228) and the sources' languages follow. */
export function renameEntries(pj, from, to) {
  const remap = p => (p === from ? to : typeof p === 'string' && p.startsWith(`${from}/`) ? to + p.slice(from.length) : null);
  pj.files = (pj.files || []).map(f => {
    const np = remap(f.path);
    return np === null ? f : { ...f, path: np, lang: hdlLangOf(np) || f.lang };
  });
  if (pj.constraints) pj.constraints = remap(pj.constraints) ?? pj.constraints;
  if (pj.excluded) pj.excluded = pj.excluded.map(p => remap(p) ?? p);
  if (pj.sourceLanguage) pj.sourceLanguage = Object.fromEntries(Object.entries(pj.sourceLanguage).map(([p, l]) => [remap(p) ?? p, l]));
  return pj;
}

/** A file or a folder of the project deleted (`path`), on `pj` (changed): what was in it leaves the list, the excluded
 *  files and the constraints (none when it was there, #1230; #4766, one for the server and the browser). True when
 *  `pj` changed. */
export function deleteEntries(pj, path) {
  const gone = p => p === path || (typeof p === 'string' && p.startsWith(`${path}/`));
  const before = JSON.stringify(pj);
  pj.files = (pj.files || []).filter(f => !gone(f.path));
  if (pj.constraints && gone(pj.constraints)) pj.constraints = null;
  if (pj.excluded) pj.excluded = pj.excluded.filter(p => !gone(p));
  return JSON.stringify(pj) !== before;
}

/** Set as Top's one rule (#4733, the interface's): any module of the view can be the top, even one with errors; a name
 *  no source of the view declares (`has(name)` false) is refused, with this message (null: set). */
export const topRefusal = (mod, sim, has) => (has(mod) ? null : `no entity or module '${mod}' in the project's ${sim ? 'simulation' : 'design'} sources`);

// an HDL text without its comments (a module named in a comment declares nothing)
const uncommented = text => String(text || '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(--|\/\/).*$/gm, ' ');

/** Whether a source's `text` declares the entity or module `name` (case-insensitive, outside comments). */
export function declares(text, name) {
  const word = String(name).replace(/[^\w$]/g, '');
  return !!word && new RegExp(`\\b(entity|module)\\s+${word}\\b`, 'i').test(uncommented(text));
}

/**
 * The tops (top, simTop) of project `pj` it no longer has, after a removal (#253): each becomes the one root of its view
 * left, else none. `has(name, sim)`: the module is still the project's (a source declares it, a C source's or a
 * drawing's module not made for now, #2995); `roots(sim)`: the roots of the view. `how`: the words naming Set as Top
 * where it is ({ another, set }). Returns { set: { top?, simTop? }, messages: [{ level: 'info' | 'warn', text }] }.
 */
export function missingTops(pj, { has, roots }, how = { another: 'Set as Top Module', set: 'a module\'s right-click menu: Set as Top Module' }) {
  const set = {}, messages = [];
  for (const sim of [false, true]) {
    const key = sim ? 'simTop' : 'top';
    const old = pj[key];
    if (!old || has(old, sim)) continue;
    const left = roots(sim) || [];
    set[key] = left.length === 1 ? left[0] : '';
    const what = `The top-level ${sim ? 'simulation ' : ''}module '${old}' is no longer in the project`;
    if (set[key]) messages.push({ level: 'info', text: `${what}: the top is now '${set[key]}' (another one: ${how.another}).` });
    else if (left.length) messages.push({ level: 'warn', text: `${what}: set the top module (${how.set}).` });
    else messages.push({ level: 'info', text: `${what}, nor any other module.` });
  }
  return { set, messages };
}
