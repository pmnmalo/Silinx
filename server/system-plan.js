// Silinx - a System's build plan on the local server (#5489, roadmap #5479's phase 2, docs/SYSTEMS.md): the plan of
// core/system-plan.js from the project's files (their hashes, the images there, each node's record of its last build),
// for the System row's Build Plan (GET /projects/:p/build-plan), the MCP's check_system (plan) and Build All. A node's
// record, `built-from.json`, is written by its build (server/system-implement.js: build/nodes/<id>/; server/avr-compile.js:
// build/nodes/<id>/firmware/) once it succeeded, its sources' hashes taken before it started.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as P from './projects.js';
import { projectSystem } from '../core/project-system.js';
import { isSystemFile } from '../core/system-doc.js';
import { buildRecord, systemBuildPlan } from '../core/system-plan.js';

const RECORD = 'built-from.json';
/** Where a node's record is: its build's folder (an FPGA node's build/nodes/<id>/, a microcontroller's firmware/ in it). */
const recordPath = node => `build/nodes/${node.id}/${node.kind === 'fpga' ? '' : 'firmware/'}${RECORD}`;

/** The files' hashes (the project `name`'s paths `files`): { path: the first 16 hex digits of its SHA-256 }. */
async function fileHashes(name, files) {
  const out = {};
  for (const f of files) {
    const data = await fs.readFile(P.safeJoin(P.projectDir(name), f)).catch(() => null);
    Object.defineProperty(out, f, { value: data ? crypto.createHash('sha256').update(data).digest('hex').slice(0, 16) : null, enumerable: true });
  }
  return out;
}

/** The record of the node's build (its sources `sources`, hashed now): written by writeBuildRecord once it succeeded. */
export async function takeBuildRecord(name, node, sources) {
  return buildRecord(node, sources, await fileHashes(name, sources));
}

/** The node's record written (`record`: takeBuildRecord's), in its build's folder. */
export async function writeBuildRecord(name, node, record) {
  await fs.writeFile(P.safeJoin(P.projectDir(name), recordPath(node)), JSON.stringify(record, null, 2) + '\n');
}

async function readRecord(name, node) {
  const text = await fs.readFile(P.safeJoin(P.projectDir(name), recordPath(node)), 'utf8').catch(() => null);
  try { return text == null ? null : JSON.parse(text); } catch { return null; }
}

/** The project `name`'s System: { pj, files, file (its document's path), text, model }; the error when it has none. */
export async function projectSystemOf(name) {
  const pj = await P.readProject(name);
  const files = await P.fileTree(name);
  const file = files.find(isSystemFile);
  const text = file ? await P.readFile(name, file).catch(() => '') : '';
  const r = projectSystem(pj, { files, texts: file ? { [file]: text } : {} });
  if (r.error) throw new P.HttpError(400, `${r.system}: ${r.error}`);
  if (!r.model || r.implicit) throw new P.HttpError(400, `the project '${name}' has no System as its top: a build plan is a System's`);
  return { pj, files, file, text, model: r.model };
}

/** The plan of the System `model` of the project `name` (its files `files`): core/system-plan.js systemBuildPlan's. */
export async function planOf(name, model, files) {
  const first = systemBuildPlan(model, { files, exists: new Set(files) });
  const sources = [...new Set(first.nodes.flatMap(e => e.sources))];
  const hashes = await fileHashes(name, sources);
  const records = {}, exists = new Set(files);
  for (const n of model.nodes.filter(x => first.nodes.some(e => e.id === x.id))) {
    records[n.id] = await readRecord(name, n);
    const img = first.nodes.find(e => e.id === n.id).image;
    if (img && /^build\//.test(img) && await fs.stat(P.safeJoin(P.projectDir(name), img)).then(s => s.isFile(), () => false)) exists.add(img);
  }
  return systemBuildPlan(model, { files, hashes, records, exists });
}

/** The project `name`'s System's build plan. */
export async function readBuildPlan(name) {
  const { model, files } = await projectSystemOf(name);
  return planOf(name, model, files);
}
