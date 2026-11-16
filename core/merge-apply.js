// Merge Contribution… applied to a project (#4206; the merge itself: core/project-merge.js), on a storage given by the
// caller (the server's projects, the browser's store), as core/git-rest.js takes its own:
//   projects: { read(name) -> { json, files }, write(name, path, text), remove(name, path), saveJson(name, json),
//               regenerate(name, drawing), kept(name, rev) -> snapshot | null, markMerged(name),
//               backup: { get(name), set(name, data | null) } }
// The ancestor: the contribution's own (its ANCESTOR_FILE, checked: its origin's), else the project's snapshot of the
// contribution's origin; none (no origin, another project's, not kept): a two-way merge, said. A merge is one step:
// before it writes, what the project was is kept (backup), and Undo Merge puts it back, unless the project changed
// since. A merge that takes any of the contribution's files makes the project untrusted (madeBy 'merge'). Isomorphic.
//   await findAncestor(projects, name, base, contribution) -> { ancestor, source ('carried' | 'kept' | null), warnings }
//   await previewMerge(projects, name, contribution) -> { comparison, source, warnings, left }
//   await applyMerge(projects, name, contribution, resolve) -> { written, removed, taken, regenerated, untrusted, ... }
//   await undoMerge(projects, name) -> { restored, removed }
//   mergeLines(name, from, result) -> [line]                  what a merge says, in the console and the MCP's results
import { originOf, parseSnapshot, projectRev } from './project-rev.js';
import { compareProjects, mergeProjects, openConflicts } from './project-merge.js';
import { untrustedNotice } from './trust.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

/** The common ancestor of the project (its silinx.json `base`) and a contribution (contributionOf's). */
async function findAncestor(projects, name, base, contribution) {
  const o = originOf(contribution.json);
  if (!o) return { ancestor: null, source: null, warnings: ['the contribution names no origin (a copy made before Silinx recorded it, or no copy of this project): a two-way merge, each file that differs is a choice'] };
  if (o.id !== base.id) return { ancestor: null, source: null, warnings: ['the contribution is a copy of another project (its origin is not this project): a two-way merge, each file that differs is a choice'] };
  const warnings = [];
  if (contribution.ancestorText != null) {
    try {
      const s = await parseSnapshot(contribution.ancestorText);
      if (s.rev === o.rev && s.id === o.id) return { ancestor: s, source: 'carried', warnings };
      warnings.push('the ancestor the contribution carries is not its origin\'s: not used');
    } catch (e) { warnings.push(`${e.message}: not used`); }
  }
  const kept = await projects.kept(name, o.rev);
  if (kept) return { ancestor: kept, source: 'kept', warnings };
  warnings.push(`the contribution's ancestor (the copy given out ${o.at ? `on ${o.at.slice(0, 10)}` : 'before'}) is not kept: a two-way merge, each file that differs is a choice`);
  return { ancestor: null, source: null, warnings };
}

/** The contribution compared with the project: { comparison, source, warnings, left (the conflicts to resolve) }. */
export async function previewMerge(projects, name, contribution) {
  const mine = await projects.read(name);
  const a = await findAncestor(projects, name, mine.json, contribution);
  const comparison = compareProjects({ ancestor: a.ancestor, mine, theirs: { json: contribution.json, files: contribution.files } });
  return { comparison, source: a.source, warnings: [...contribution.skipped.map(p => `${p}: not merged (not a project file)`), ...a.warnings], left: openConflicts(comparison) };
}

/** The contribution merged into the project, every conflict resolved (resolve: openConflicts's): what was written,
 *  removed, taken and made again; the project as it was kept for Undo Merge. */
export async function applyMerge(projects, name, contribution, resolve = {}) {
  const p = await previewMerge(projects, name, contribution);
  const m = await mergeProjects(p.comparison, resolve);
  const mine = p.comparison.mine;
  const changes = Object.keys(m.write).length + m.remove.length + (m.taken.includes('silinx.json') ? 1 : 0);
  if (!changes) return { ...p, written: [], removed: [], taken: [], regenerated: [], untrusted: false, unchanged: true };
  // (what the project was, for Undo Merge)
  await projects.backup.set(name, { at: new Date().toISOString(), json: mine.json, files: mine.files });
  for (const [path, text] of Object.entries(m.write)) await projects.write(name, path, text);
  for (const path of m.remove) await projects.remove(name, path);
  if (m.taken.includes('silinx.json')) await projects.saveJson(name, { ...m.json, name: mine.json.name, ...(mine.json.id ? { id: mine.json.id } : {}), ...(mine.json.origin ? { origin: mine.json.origin } : {}) });
  const regenerated = [];
  for (const d of m.regenerate) { const r = await projects.regenerate(name, d); for (const f of [r?.written, r?.removed]) if (f) regenerated.push(f); }
  const untrusted = m.taken.length > 0;
  if (untrusted) await projects.markMerged(name);
  const after = await projects.read(name);
  const b = await projects.backup.get(name);
  await projects.backup.set(name, { ...b, after: await projectRev(after.json, after.files) });
  return { ...p, written: Object.keys(m.write), removed: m.remove, taken: m.taken, regenerated, untrusted, unchanged: false };
}

/** The last merge undone: the project as it was before it (its files and its description; untrusted still, if the
 *  merge made it so: Trust Project is the user's); refused when there is none, or the project changed since. */
export async function undoMerge(projects, name) {
  const b = await projects.backup.get(name);
  if (!b?.files || !b.json) throw fail(`project '${name}': no merge to undo`, 404);
  const now = await projects.read(name);
  if (b.after && await projectRev(now.json, now.files) !== b.after) throw fail(`project '${name}' changed since the merge: Undo Merge would lose those changes (it is not undone)`, 409);
  const restored = [], removed = [];
  for (const [path, text] of Object.entries(b.files)) if (now.files[path] !== text) { await projects.write(name, path, text); restored.push(path); }
  for (const path of Object.keys(now.files)) if (!(path in b.files)) { await projects.remove(name, path); removed.push(path); }
  await projects.saveJson(name, b.json);   // (a project the merge made untrusted stays so: only the user trusts it)
  await projects.backup.set(name, null);
  return { restored: restored.sort(), removed: removed.sort() };
}

/** The merge's lines for the console and the MCP: what was found (the ancestor), and what was done. */
export function mergeLines(name, from, r) {
  const how = r.source === 'carried' ? 'three-way, through the ancestor the contribution carries' : r.source === 'kept' ? 'three-way, through the project\'s snapshot of the contribution\'s origin' : 'two-way (no common ancestor)';
  const lines = r.warnings.map(w => `WARNING: Merge Contribution: ${w}.`);
  if (r.unchanged) return [...lines, `Merged ${from} into '${name}' (${how}): nothing to take, the project is as it was.`];
  const n = (k, what) => (r[k].length ? [`${r[k].length} ${what}`] : []);
  const done = [...n('written', 'file(s) written'), ...n('removed', 'removed'), ...n('regenerated', 'HDL file(s) made again from their drawings')];
  lines.push(`Merged ${from} into '${name}' (${how}): ${done.join(', ') || 'its description merged'}.`);
  if (r.untrusted) lines.push(untrustedNotice(name, { madeBy: 'merge' }));
  return lines;
}
