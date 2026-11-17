// The MCP server's tools of Merge Contribution… (#4206, #2674; the merge: core/project-merge.js, core/merge-apply.js,
// on the server's projects: server/merge-projects.js), as the Project menu's: merge_preview (what the merge would do,
// the conflicts to choose), merge_contribution (the merge, every conflict chosen) and undo_merge. The contribution is a
// Silinx project's .zip or folder in the exchange folder, read through the import gate as import_project reads one; its
// names and texts are someone else's: the results that hold them are marked untrusted.
import fsp from 'node:fs/promises';
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT } from './mcp-util.js';
import { exchangePath, folderEntries } from './mcp-transfer.js';
import { contributionOf } from '../core/project-merge.js';
import { applyMerge, previewMerge, undoMerge, mergeLines } from '../core/merge-apply.js';
import { mergeStorage } from './merge-projects.js';
import { hunkLines } from '../core/git-messages.js';

const FROM = STR('The contribution: a Silinx project\'s .zip, or its folder, in the exchange folder (its name, a path in it, or an absolute path inside it).');
const RESOLVE = {
  type: 'object', additionalProperties: true,
  description: 'The conflicts\' choices, as merge_preview lists them: { "<file>": "mine" | "theirs" } for a whole file, { "<text file>": { "<hunk id>": "mine" | "theirs" | "both" | { "text": "…" } } } for a text file\'s hunks (both: mine\'s lines, then theirs\'; text: the hunk\'s lines written), { "<drawing>": { "<object id>": "mine" | "theirs" } } for a drawing\'s objects (or "mine" | "theirs" for the whole drawing), { "silinx.json": { "<field>": "mine" | "theirs" } } for the project\'s description.',
};

// the contribution, through the import gate (a zip's caps checked while it is read)
async function contribution(from) {
  const src = await exchangePath(from, 'from');
  let st;
  try { st = await fsp.stat(src); } catch { throw toolError(`no file or folder '${src}'`); }
  const { GateError, gateEntries, gateZip } = await import('../core/import-gate.js');
  let gated;
  try {
    if (st.isDirectory()) {
      const { silinxFolderSkips } = await import('../core/project-folder.js');
      gated = gateEntries(await folderEntries(src, silinxFolderSkips));
    } else if (/\.zip$/i.test(src)) {
      const { ZIP_LIMITS } = await import('../core/zip.js');
      if (st.size > ZIP_LIMITS.maxEntry) throw toolError(`the zip is larger than ${ZIP_LIMITS.maxEntry >> 20} MB, the most a merge takes`);
      const { NODE_CODEC } = await import('./impl-routes.js');
      gated = await gateZip(new Uint8Array(await fsp.readFile(src)), NODE_CODEC);
    } else throw toolError(`from: '${from}' is not a .zip or a folder`);
  } catch (e) { throw e instanceof GateError ? toolError(e.message) : e; }
  try { return { c: contributionOf(gated), refusals: gated.refusals }; } catch (e) { throw toolError(e.message); }
}
const UNTRUSTED = 'the contribution\'s files\' paths, its drawings\' objects, its text files\' lines and its description\'s values, and the warnings, which name them';
const label = from => String(from).split(/[\\/]/).filter(Boolean).pop();
const gateLines = refusals => refusals.map(x => `WARNING: Merge Contribution: ${x.path}: not merged: ${x.reason}.`);

// a comparison as the results say it: each file's state (but the same), the conflicts
function rows(cmp) {
  return cmp.files.filter(f => f.state !== 'same').map(f => ({ path: f.path, state: f.state, ...(f.generatedBy ? { generatedBy: f.generatedBy } : {}), ...(f.conflicts?.length ? { conflicts: f.conflicts } : {}),
    ...(f.hunks?.length ? { hunks: f.hunks } : {}), ...(f.rename ? { renamedFrom: f.rename.from, renamedBy: f.rename.side } : {}), ...(f.renamedTo ? { renamedTo: f.renamedTo } : {}) }));
}
const STATE = { theirs: 'changed there: taken', added: 'added there: taken', removed: 'removed there: removed', mine: 'changed here: kept', merged: 'changed on both sides, merged (a drawing by its objects, a text file by its lines)', conflict: 'changed on both sides: choose', generated: 'made again from its drawing', renamed: 'renamed' };
// a row's line: its state, its rename, its conflicts (a drawing's objects; a text file's hunks, on lines of their own)
const rowLines = f => [`  ${f.path}: ${STATE[f.state]}${f.renamedTo ? ` to ${f.renamedTo}` : ''}${f.renamedFrom ? ` (renamed from ${f.renamedFrom} ${f.renamedBy === 'theirs' ? 'there' : 'here'})` : ''}${f.conflicts ? ` (${f.conflicts.map(x => `${x.id}: mine ${x.mine}, theirs ${x.theirs}`).join('; ')})` : ''}`,
  ...(f.hunks ? hunkLines(f.path, f.hunks).map(l => `  ${l}`) : [])];

export const MERGE_TOOLS = [
  {
    name: 'merge_preview', title: 'Merge Contribution: preview',
    description: 'What Merge Contribution… would do with a contribution (another person\'s copy of the project: a Silinx .zip or folder in the exchange folder): how its ancestor was found (three-way, or two-way), each file\'s state (taken, kept, removed, merged, a conflict) and the conflicts to choose (a file\'s, a drawing\'s objects\', silinx.json\'s fields), for merge_contribution\'s resolve. Changes nothing.',
    inputSchema: { type: 'object', properties: { project: PROJECT, from: FROM }, required: ['project', 'from'], additionalProperties: false },
    annotations: { readOnlyHint: true },
    async run({ project: name, from }) {
      await readProject(name);
      const { c, refusals } = await contribution(from);
      const p = await previewMerge(mergeStorage(P), name, c);
      const list = rows(p.comparison);
      const lines = [...gateLines(refusals), ...p.warnings.map(w => `WARNING: Merge Contribution: ${w}.`),
        `Merge of ${label(from)} into '${name}': ${p.source ? 'three-way' : 'two-way'}, ${list.length} file(s) differ, ${p.left.length} conflict(s) to choose.`,
        ...list.flatMap(rowLines),
        ...p.comparison.project.conflicts.map(x => `  silinx.json ${x.field}: mine ${JSON.stringify(x.mine)}, theirs ${JSON.stringify(x.theirs)}`)];
      return { text: lines.join('\n'), untrusted: UNTRUSTED, data: { project: name, threeWay: !!p.source, ancestor: p.source, files: list, project_conflicts: p.comparison.project.conflicts, left: p.left, warnings: p.warnings } };
    },
  },
  {
    name: 'merge_contribution', title: 'Merge Contribution',
    description: 'Merge a contribution (another person\'s copy of the project: a Silinx .zip or folder in the exchange folder) into the project, as the Project menu\'s Merge Contribution… does: what only one side changed taken, a drawing both changed merged by its objects and its HDL made again, a text file both changed merged by its lines (a file renamed on one side merged as a rename), every conflict chosen in resolve (a text file\'s per hunk, or whole) (merge_preview lists them; one left: nothing merged). The project as it was is kept for undo_merge; a merge that takes the contribution\'s files makes the project untrusted (only the user trusts it, in the interface).',
    inputSchema: { type: 'object', properties: { project: PROJECT, from: FROM, resolve: RESOLVE }, required: ['project', 'from'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },   // (it replaces and removes files: undo_merge puts them back)
    async run({ project: name, from, resolve = {} }) {
      await readProject(name);
      const { c, refusals } = await contribution(from);
      let r;
      try { r = await applyMerge(mergeStorage(P), name, c, resolve); } catch (e) { throw toolError(e.message); }
      const lines = [...gateLines(refusals), ...mergeLines(name, label(from), r)];
      return { text: lines.join('\n'), untrusted: UNTRUSTED, data: { project: name, ancestor: r.source, written: r.written, removed: r.removed, regenerated: r.regenerated, taken: r.taken, madeUntrusted: r.untrusted, warnings: r.warnings } };
    },
  },
  {
    name: 'undo_merge', title: 'Undo Merge',
    description: 'Put the project back as it was before its last merge (merge_contribution, or Merge Contribution… in the interface), as the Project menu\'s Undo Merge does; refused when there is none, or when the project changed since. A project the merge made untrusted stays so.',
    inputSchema: { type: 'object', properties: { project: PROJECT }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true },
    async run({ project: name }) {
      await readProject(name);
      let r;
      try { r = await undoMerge(mergeStorage(P), name); } catch (e) { throw toolError(e.message); }
      return { text: `Undid the last merge of '${name}': ${r.restored.length} file(s) put back, ${r.removed.length} removed.`, data: { project: name, ...r } };
    },
  },
];
