// A few file-system calls at a time (#4775): a project's files statted together rather than one after another (the
// projects' listing, server/projects.js lastChange; the watcher, server/project-watch.js scan), with no more than
// `limit` of them waiting at once.
import fs from 'node:fs/promises';
import path from 'node:path';

/** fn(item) for every item, `limit` at a time; the results in the items' order. */
export async function mapLimit(items, limit, fn) {
  const list = [...items], out = new Array(list.length);
  let next = 0;
  const run = async () => { while (next < list.length) { const i = next++; out[i] = await fn(list[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, run));
  return out;
}

/** The files of a folder tree (paths relative to `root`, with '/'), the folders read `limit` at a time; skip(name,
 *  rel, isDir) leaves an entry (and a folder's contents) out. */
export async function filesOf(root, { skip = () => false, limit = 16 } = {}) {
  const files = [];
  let level = [''];
  while (level.length) {
    const found = await mapLimit(level, limit, async base => {
      const ents = await fs.readdir(path.join(root, base), { withFileTypes: true }).catch(() => []);
      return ents.map(e => ({ e, rel: base ? `${base}/${e.name}` : e.name }));
    });
    level = [];
    for (const { e, rel } of found.flat()) {
      if (skip(e.name, rel, e.isDirectory())) continue;
      if (e.isDirectory()) level.push(rel);
      else if (e.isFile()) files.push(rel);
    }
  }
  return files;
}
