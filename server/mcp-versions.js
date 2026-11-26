// The MCP's tools of a project's versions (#5740, phase 2 of #5743: core/versions.js on server/versions.js, as the
// version routes and the Project menu's Save Version… / Versions… do): save_version (one by hand, with a name),
// list_versions (the versions kept, newest first: what made each, its author, what it changed), version_diff (what
// differs between a version and the project now: its files; one file's change, #5741) and restore_version (the
// whole project, or one file, as a version had it: the project kept as a version first, so that a restore can be
// undone by restoring that one). The versions are kept in the project's hidden folder, never shared nor exported.
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT } from './mcp-util.js';
import { serverVersions, saveVersion, restoreServerVersion, versionBefore, diffServerVersion } from './versions.js';
import { mergeStorage } from './merge-projects.js';
import { fileDiff } from './mcp-file-diff.js';
import { versionLine } from '../core/versions.js';

const VERSION = { type: 'string', minLength: 1, maxLength: 20, description: 'The version\'s number (list_versions).' };
const AUTHOR = 'MCP';
const UNTRUSTED = 'the versions\' names and authors and the files\' paths (the project\'s hidden folder, which anyone may change)';

// the tools that replace or remove a project's files: a version of the project kept before each (as the interface's
// commands of the same names)
const RISKY = { remove_from_project: 'before-remove', delete_file: 'before-delete', convert_module: 'before-convert', convert_drawing: 'before-convert',
  import_source: 'before-import', merge_contribution: 'before-merge', git_pull: 'before-git', git_merge: 'before-git', git_switch: 'before-git' };

/** A version before a tool that replaces or removes files (server/mcp.js, before it runs): a warning line when none could
 *  be kept, else null (none needed, or kept). */
export async function versionBeforeTool(tool, args) {
  // (set_design_properties' mode, #5755: Change Mode's version)
  const reason = tool === 'set_design_properties' && args?.mode !== undefined ? 'before-mode' : RISKY[tool];
  if (!reason || typeof args?.project !== 'string') return null;
  try { await P.readProject(args.project); } catch { return null; }   // (no such project: the tool's own error)
  const v = await versionBefore(P, args.project, reason, { author: AUTHOR });
  return v?.error ? `WARNING: ${tool}: no version of '${args.project}' kept before it: ${v.error}.` : null;
}

export const VERSION_TOOLS = [
  {
    name: 'save_version', title: 'Save Version',
    description: 'Keep a version of the whole project as it is now (its text files and silinx.json), with a name, as the Project menu\'s Save Version… does: restore_version puts it back later. Versions are also made on their own: as the project is saved (at most one every 10 minutes) and before risky commands (a merge, a removal, a conversion, an import, a git pull or merge, a restore). Kept in the project\'s hidden folder: never shared, exported or committed; the older unnamed ones thinned out.',
    inputSchema: { type: 'object', properties: { project: PROJECT, name: { ...STR('The version\'s name (80 characters at most), e.g. "before the lab".'), maxLength: 200 } }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async run({ project: name, name: label = '' }) {
      await readProject(name);
      let r;
      try { r = await saveVersion(P, name, { reason: 'manual', label, author: AUTHOR }); } catch (e) { throw toolError(e.message); }
      const text = r.saved ? `Version ${r.version.id} of '${name}' saved${label ? '' : ' (no name)'}: ${versionLine(r.version)}` : `Version ${r.version.id} of '${name}' has it already: no version saved.`;
      return { text, data: { project: name, ...r }, untrusted: label ? UNTRUSTED : undefined };
    },
  },
  {
    name: 'list_versions', title: 'Versions',
    description: 'The versions of a project kept (newest first), as the Project menu\'s Versions… lists them: each one\'s number, time, author, name, what made it (saved on its own, saved by hand, before a risky command, restored) and the files it added (+), changed (~) and removed (-) against the version before. Changes nothing.',
    inputSchema: { type: 'object', properties: { project: PROJECT }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name }) {
      await readProject(name);
      const list = await serverVersions(P).list(name);
      const text = list.length ? [`${list.length} version(s) of '${name}', newest first:`, ...list.map(v => `  ${versionLine(v)}`)].join('\n') : `No versions of '${name}' yet (save_version keeps one).`;
      return { text, data: { project: name, versions: list }, untrusted: list.length ? UNTRUSTED : undefined };
    },
  },
  {
    name: 'version_diff', title: 'A version against now',
    description: 'What differs between a version (list_versions) and the project now, as the Versions… dialog shows it: the files changed since, added since and removed since (and silinx.json); with path, that file\'s change from the version to now: a drawing by its objects (added, removed, moved, changed: each by its id), any other file as a unified diff. Changes nothing.',
    inputSchema: { type: 'object', properties: { project: PROJECT, version: VERSION, path: STR('One file (its path): its change from the version to now.') }, required: ['project', 'version'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, version: id, path = null }) {
      await readProject(name);
      if (path) {
        let target;
        try { target = await serverVersions(P).read(name, id); } catch (e) { throw toolError(e.message); }
        const now = (await mergeStorage(P).read(name)).files;
        const a = target.files[path] ?? null, b = now[path] ?? null;
        if (a === null && b === null) throw toolError(`'${path}' is in neither version ${id} nor the project`);
        return fileDiff(path, a, b, { fromL: `version ${id}`, toL: 'now', data: { project: name, version: id, path } });
      }
      let r;
      try { r = await diffServerVersion(P, name, id); } catch (e) { throw toolError(e.message); }
      const WORD = { changed: 'changed since', added: 'added since', removed: 'removed since' };
      const lines = [...r.files.map(f => `  ${f.path}: ${WORD[f.state]}`), ...(r.json ? ['  silinx.json: changed since'] : [])];
      const text = lines.length ? [`'${name}' against version ${id}: ${lines.length} file(s) differ.`, ...lines].join('\n') : `'${name}' is as version ${id} has it.`;
      return { text, data: { project: name, ...r }, untrusted: r.files.length ? UNTRUSTED : undefined };
    },
  },
  {
    name: 'restore_version', title: 'Restore Version',
    description: 'Put the project back as a version had it (list_versions), as the Versions… dialog\'s Restore does: its text files written, those the version has not removed, its silinx.json (the project\'s own id, name and trust kept: a restore never trusts a project); with path, that file only. The project as it was is kept as a version first ("before a restore"): restore that one to undo it. The drawings\' HDL is made again.',
    inputSchema: { type: 'object', properties: { project: PROJECT, version: VERSION, path: STR('One file of the project to restore (its path), else the whole project.') }, required: ['project', 'version'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run({ project: name, version: id, path = null }) {
      await readProject(name);
      let r;
      try { r = await restoreServerVersion(P, name, id, { path, author: AUTHOR }); } catch (e) { throw toolError(e.message); }
      const what = path ? `${path} of '${name}'` : `'${name}'`;
      if (!r.version) return { text: `${what[0].toUpperCase()}${what.slice(1)} is as version ${id} has it already: nothing restored.`, data: { project: name, ...r } };
      const lines = [`Restored ${what} as version ${id} had it: ${r.written.length} file(s) written, ${r.removed.length} removed${r.json ? ', silinx.json written' : ''}; the project before it kept as version ${r.before.id}.`,
        ...r.written.map(p => `  written ${p}`), ...r.removed.map(p => `  removed ${p}`)];
      return { text: lines.join('\n'), data: { project: name, ...r }, untrusted: UNTRUSTED };
    },
  },
];
