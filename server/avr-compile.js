// Silinx - a System's Arduino node's firmware compiled by the local server (#5503, roadmap #4695's phase 5,
// docs/SYSTEMS.md): its node's Compile Firmware, for the interface (POST /projects/:p/firmware with { node }) and the
// MCP's run_process (process firmware, node). arduino-cli, which the user installs with its Arduino AVR core (Silinx
// installs nothing), compiles the node's sketch (its folder's .ino, C and C++: core/avr-compile.js; the one its drawings
// make, core/node-main-sync.js, made again first) for its board, in a
// folder of its own, build/nodes/<id>/firmware/; its .hex is written to the node's folder, the node's firmware (set to it
// when it had none), which the Board Emulator runs on avr8js. The compiler's errors and warnings are the job's ERROR and
// WARNING lines, by the project's file and line, as Check Syntax's.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { createJob, getJob, capture, runCommand } from './jobs.js';
import { loadConfig, which } from './toolchain.js';
import { projectSystem } from '../core/project-system.js';
import { isSystemFile, readSystem, writeSystem } from '../core/system-doc.js';
import { changeNode } from '../core/system-edit.js';
import { AVR_CORE, AVR_FQBN, compilerMessages, firmwareRefusal, nodeSketch, sketchFileOf } from '../core/avr-compile.js';
import { readFirmware } from '../core/avr-firmware.js';
import { syncNodeMain } from '../core/node-main-sync.js';
import { baseLang } from '../core/system-layout.js';
import { isTrusted, untrustedMessage } from '../core/trust.js';
import { takeBuildRecord, writeBuildRecord } from './system-plan.js';
import { sketchSources } from '../core/system-plan.js';

const running = new Map();   // project -> job id
/** The firmware compile of the project `name` running, its job, or null (one build of a project at a time, #5489). */
export const runningFirmware = name => { const j = getJob(running.get(name.toLowerCase())); return j?.status === 'running' ? j : null; };
// (where Homebrew and the installers put it, besides PATH: a server started from the Dock has a short PATH)
const DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];

/** arduino-cli's path: config.json's paths['arduino-cli'] (explicit), else PATH's and the usual folders'; or null. */
export function arduinoCliPath(cfg) {
  const explicit = cfg?.paths?.['arduino-cli'];
  if (explicit) return which(String(explicit)) ? String(explicit) : null;
  return which('arduino-cli', DIRS);
}

/**
 * Can an Arduino node's firmware be compiled here? { available, path, version, core (its Arduino AVR core's version,
 * or null), reason }: arduino-cli found and its core installed, or why not.
 */
export async function detectAvrCompiler(cfg = null) {
  const bin = arduinoCliPath(cfg ?? await loadConfig());
  if (!bin) return { available: false, path: null, version: null, core: null, reason: 'arduino-cli not found (install it and its Arduino AVR core: arduino-cli core install arduino:avr)' };
  const v = await capture(bin, ['version'], { timeoutMs: 10000 });
  const version = /Version:\s*([\w.\-]+)/.exec(v.out || '')?.[1] || null;
  const c = await capture(bin, ['core', 'list', '--format', 'json'], { timeoutMs: 20000 });
  let core = null;
  try {
    const j = JSON.parse(c.out.slice(c.out.indexOf('{')));
    const p = (j.platforms || j || []).find?.(x => x.id === AVR_CORE);
    core = p ? (p.installed_version || p.installed || p.version || '?') : null;
  } catch { /* not JSON: none */ }
  if (!core) return { available: false, path: bin, version, core: null, reason: `arduino-cli ${version || ''} found, without its Arduino AVR core (arduino-cli core install ${AVR_CORE})`.replace('  ', ' ') };
  return { available: true, path: bin, version, core, reason: `arduino-cli ${version || ''} with the Arduino AVR core ${core}`.replace('  ', ' ') };
}

// the project's System, its document's path and text
async function systemOf(name) {
  const pj = await P.readProject(name);
  // (a compiler run on the project's own text, its includes read from this computer: a trusted project's only, as ISE's, #2830)
  if (!isTrusted(pj)) throw new P.HttpError(403, untrustedMessage(name, 'arduino-cli', pj));
  const files = await P.fileTree(name);
  const file = files.find(isSystemFile);
  const text = file ? await P.readFile(name, file).catch(() => '') : '';
  const r = projectSystem(pj, { files, texts: file ? { [file]: text } : {} });
  if (r.error) throw new P.HttpError(400, `${r.system}: ${r.error}`);
  if (!r.model || r.implicit) throw new P.HttpError(400, `the project '${name}' has no System as its top: a firmware is compiled for a System's microcontroller node`);
  return { files, file, text, nodes: r.model.nodes };
}

// the node's folder made a sketch in build/nodes/<id>/firmware/<name>/ (arduino-cli's: its folder named as its main .ino)
async function sketchDir(name, node, sketch) {
  const root = P.safeJoin(P.projectDir(name), path.join('build', 'nodes', node.id, 'firmware'));
  await fs.rm(root, { recursive: true, force: true });
  const dir = path.join(root, sketch.name);
  for (const f of sketch.sources) {
    const to = P.safeJoin(dir, f.slice(node.id.length + 1));
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(P.safeJoin(P.projectDir(name), f), to);
  }
  return { root, dir };
}

/** One node's firmware compiled (the System `sys`: systemOf's; arduino-cli `bin`): its lines logged, its .hex written; its
 *  result (Build All's too, server/system-build-all.js). */
export async function compileOne(job, name, sys, node, bin) {
  // (the node's sketch made from its drawings made again first: a drawing deleted since no longer called, #5486)
  const main = await syncNodeMain(P, name, node, baseLang(node));
  for (const l of main?.messages ?? []) job.log(l);
  const files = main?.written || main?.removed ? await P.fileTree(name) : sys.files;
  const sketch = nodeSketch(node, files);
  if (sketch.error) throw new Error(sketch.error);
  // (what its .hex is built from, for the System's build plan, #5489: its sources as they are now)
  const record = await takeBuildRecord(name, { ...node, firmware: node.firmware || sketch.hex }, sketchSources(files, node.id));
  const { root, dir } = await sketchDir(name, node, sketch);
  const out = path.join(root, 'out');
  const fqbn = AVR_FQBN[node.board];
  job.log(`System node ${node.id}: its sketch ${sketch.main} (${sketch.sources.length} file(s) of ${node.id}/) for ${node.board} (${fqbn}), by arduino-cli, in build/nodes/${node.id}/firmware/.`);
  const text = [];
  // (its lines the console's once parsed: the job's own log not the compiler's raw output, which names the build folder)
  const quiet = { get cancelled() { return job.cancelled; }, procs: job.procs, log: () => {} };
  const code = await runCommand(quiet, bin, ['compile', '--fqbn', fqbn, '--warnings', 'default', '--build-path', path.join(root, 'build'), '--output-dir', out, dir],
    { echo: false, onLine: l => text.push(l) });
  job.checkCancelled();
  const { errors, warnings } = compilerMessages(text.join('\n'), p => sketchFileOf(p, dir, node.id));
  for (const l of [...errors, ...warnings]) job.log(l);
  if (code !== 0) {
    if (!errors.length) job.log(`ERROR: ${node.id}: arduino-cli failed (exit code ${code}): ${text.filter(l => l.trim()).slice(-3).join(' ').slice(0, 300) || 'no message'}`);
    throw new Error(`${node.id}: its sketch did not compile (${errors.length || 1} error(s), ${warnings.length} warning(s))`);
  }
  const hex = await fs.readFile(path.join(out, `${sketch.name}.ino.hex`), 'utf8').catch(() => null);
  if (hex == null) throw new Error(`${node.id}: arduino-cli made no ${sketch.name}.ino.hex`);
  const fw = readFirmware(sketch.hex, hex);
  if (fw.error) throw new Error(fw.error);
  await P.writeFile(name, sketch.hex, hex);
  await writeBuildRecord(name, node, record);
  job.log(`System node ${node.id}: its firmware ${sketch.hex}, ${fw.size} bytes of the flash.`);
  return { node: node.id, hex: sketch.hex, size: fw.size, warnings: warnings.length, set: !node.firmware };
}

/** The nodes of `made` (compileOne's results) that had no firmware get the one made: their System document written once. */
export async function setMadeFirmwares(j, name, sys, made) {
  const unset = made.filter(m => m.set);
  if (!unset.length || !sys.file || j.cancelled) return;
  // (read again: the document as it is now, an edit during the compile kept)
  let m = readSystem(await P.readFile(name, sys.file).catch(() => sys.text)).system;
  for (const u of m ? unset : []) { const r = changeNode(m, u.node, { firmware: u.hex }); if (!r.error) m = r.system; }
  if (m) {
    await P.writeFile(name, sys.file, writeSystem(m));
    for (const u of unset) j.log(`System node ${u.node}: its firmware set to ${u.hex} in ${sys.file}.`);
  }
}

/**
 * A job compiling the firmware of the microcontroller node `node` of the project `name` (its id), or of every one of
 * its Arduino nodes ('*'), one after another. A node that fails is said and the next one goes on; the job fails when one
 * did. The nodes with no firmware get the one made (their System document written).
 */
export async function startFirmwareCompile(name, { node } = {}) {
  const sys = await systemOf(name);
  const mcus = sys.nodes.filter(n => n.kind === 'mcu');
  const chosen = node === '*' ? mcus.filter(n => !firmwareRefusal(n)) : sys.nodes.filter(n => n.id === node);
  if (node !== '*' && !chosen.length) throw new P.HttpError(400, `no node '${node}' in the System of '${name}' (its microcontroller nodes: ${mcus.map(n => n.id).join(', ') || 'none'})`);
  if (!chosen.length) throw new P.HttpError(400, `the System of '${name}' has no Arduino node`);
  const why = node !== '*' && firmwareRefusal(chosen[0]);
  if (why) throw new P.HttpError(400, why);
  const tool = await detectAvrCompiler();
  if (!tool.available) throw new P.HttpError(400, `Compile Firmware needs arduino-cli on the local server: ${tool.reason}`);
  const key = name.toLowerCase();
  const was = running.get(key);
  if (was && getJob(was)?.status === 'running') throw new P.HttpError(409, `a firmware of '${name}' is already being compiled (job ${was}); wait for it or cancel it`);
  const job = createJob('firmware', async j => {
    const failed = [], made = [];
    for (const n of chosen) {
      try { made.push(await compileOne(j, name, sys, n, tool.path)); }
      catch (e) { if (e?.name === 'JobCancelled') throw e; failed.push(n.id); j.log(`ERROR: System node ${n.id}: ${e.message}`); }
    }
    await setMadeFirmwares(j, name, sys, made);
    if (failed.length) throw new Error(`the System node(s) ${failed.join(', ')} failed`);
    return { nodes: made };
  }, { meta: { project: name, node, toolchain: 'arduino' } });
  running.set(key, job.id);
  return job;
}
