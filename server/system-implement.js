// Silinx - a System's FPGA nodes implemented, each on its own board (#5446, roadmap #4695's phase 3, docs/SYSTEMS.md):
// a node's Implement and Implement System (every FPGA node, one after another), for the interface (POST
// /projects/:p/implement with { node }) and the MCP's run_process (node). Each node is built as a project of its own
// (core/system-node.js nodeProject: its module the top, its board's device, its constraints made from its pins) in a
// folder of its own, build/nodes/<id>/ (the node's folder, <id>/, copied there, #5488; its own build/ inside), by the Silinx toolchain;
// the project's build/ and silinx.json are not touched.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { createJob, getJob } from './jobs.js';
import { runOpenImplementation, openSteps } from './open-flow.js';
import { openFamilyOf, deviceFamily } from '../packages/silinx-fpga/src/parts.js';
import { projectSystem } from '../core/project-system.js';
import { isSystemFile } from '../core/system-doc.js';
import { nodeConstraints, nodeProject, nodeRefusal } from '../core/system-node.js';
import { ucfPort } from '../core/board-constraints.js';
import { relInNode } from '../core/system-layout.js';

const running = new Map();   // project -> job id

/** The folder a node is built in (its own build/ inside). */
// (a second guard, #5446: its id an identifier already, nodeRefusal; the folder inside build/nodes/, never build/nodes/ itself)
function nodeDir(name, id) {
  const root = path.join(P.projectDir(name), 'build', 'nodes'), dir = P.safeJoin(root, String(id));
  if (path.resolve(dir) === path.resolve(root)) throw new P.HttpError(400, 'path escapes project');
  return dir;
}

// the project's System (its document read) and its FPGA nodes; the error when its top is no System
async function systemOf(name) {
  const pj = await P.readProject(name);
  const files = await P.fileTree(name);
  const system = files.find(isSystemFile);
  const texts = system ? { [system]: await P.readFile(name, system).catch(() => '') } : {};
  const r = projectSystem(pj, { files, texts });
  if (r.error) throw new P.HttpError(400, `${r.system}: ${r.error}`);
  if (!r.model || r.implicit) throw new P.HttpError(400, `the project '${name}' has no System as its top: implement it as an FPGA project`);
  return { pj, nodes: r.model.nodes.filter(n => n.kind === 'fpga') };
}

// the node's module's ports, as the constraints read them (its folder's sources only, #5488)
async function portsOf(name, pj, node) {
  const mod = node.module;
  const { compile, elaborate } = await import('../core/compile.js');
  const { primitiveSources } = await import('../core/unisim.js');
  const { viewSourcesOf } = await import('./mcp-util.js');
  const design = (await viewSourcesOf(name, pj, false)).filter(x => (x.role || 'design') === 'design' && relInNode(x.path, node.id) != null);
  const d = elaborate(compile([...primitiveSources(design), ...design]), mod);
  if (!d.top) throw new Error(`the module '${mod}' does not elaborate: ${(d.diags || []).find(x => x.severity === 'error')?.message || 'it has errors'}`);
  return d.top.ports.map(ucfPort);
}

// one node made ready in its folder (the project's files copied, its constraints written) and implemented
async function implementOne(job, name, pj, node, steps) {
  const why = nodeRefusal(node);
  if (why) throw new Error(why);
  const ports = await portsOf(name, pj, node);
  const c = nodeConstraints(node, ports);
  const dir = nodeDir(name, node.id), src = P.projectDir(name);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  // (the node's folder alone, #5488: its files at their paths, another node's not built with it)
  const own = P.safeJoin(src, node.id);
  if (await fs.stat(own).then(st => st.isDirectory(), () => false)) await fs.cp(own, P.safeJoin(dir, node.id), { recursive: true });
  await fs.writeFile(P.safeJoin(dir, c.path), c.text);
  const project = nodeProject(pj, node, c.path);
  job.log(`System node ${node.id}: its module ${node.module} on ${node.board}${node.variant ? ` (${node.variant})` : ''}, its constraints ${c.path} from its pins, built in build/nodes/${node.id}/.`);
  return runOpenImplementation(job, { project, projectDir: dir, steps: openSteps(steps, { family: openFamilyOf(deviceFamily(project.device)) }) });
}

/**
 * A job implementing the FPGA node `node` of the project `name` (its id), or every one of them (`node` '*': Implement
 * System), one after another, by the Silinx toolchain: its steps `steps` (the implement route's). A node that fails
 * is said and the next one goes on; the job fails when one did.
 */
export async function startNodeImplementation(name, { node, steps, toolchain } = {}) {
  if (toolchain && !['silinx', 'open'].includes(toolchain)) throw new P.HttpError(400, 'a System\'s FPGA node is implemented by the Silinx toolchain, for now');
  const { pj, nodes } = await systemOf(name);
  const chosen = node === '*' ? nodes : nodes.filter(n => n.id === node);
  if (node !== '*' && !chosen.length) throw new P.HttpError(400, `no FPGA node '${node}' in the System of '${name}' (${nodes.map(n => n.id).join(', ') || 'none'})`);
  if (!chosen.length) throw new P.HttpError(400, `the System of '${name}' has no FPGA node`);
  const key = name.toLowerCase();
  const was = running.get(key);
  if (was && getJob(was)?.status === 'running') throw new P.HttpError(409, `an implementation of '${name}' is already running (job ${was}); wait for it or cancel it`);
  const job = createJob('implement', async j => {
    const failed = [];
    for (const n of chosen) {
      try { await implementOne(j, name, pj, n, steps); j.log(`System node ${n.id}: done.`); }
      catch (e) { failed.push(n.id); j.log(`ERROR: System node ${n.id}: ${e.message}`); }
    }
    if (failed.length) throw new Error(`the System node(s) ${failed.join(', ')} failed`);
    return { nodes: chosen.map(n => n.id) };
  }, { meta: { project: name, node, steps, toolchain: 'silinx' } });
  running.set(key, job.id);
  return job;
}
