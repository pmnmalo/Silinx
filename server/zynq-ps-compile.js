// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A Zynq board's PS program compiled by the local server (#4687, part 1): Compile PS Program, for the MCP's run_process
// (process ps, node) and the interface. arm-none-eabi-gcc is the user's (Arm GNU Toolchain; Silinx installs nothing,
// ships nothing of it): config.json's paths['arm-none-eabi-gcc'], else the PATH, Homebrew's folders or Arm's macOS
// installer's (/Applications/ArmGNUToolchain/<version>/arm-none-eabi/bin). The program's sources (core/zynq-ps-compile.js:
// the node's ps/, a Board project's at its root) are copied into its build folder's src/ (build/nodes/<id>/ps/, a Board
// project's build/ps/), Silinx's startup code and linker script into its silinx/ (when the user has none), and linked
// there to out/<id>.elf (a Board project's out/ps.elf), checked to be in the on-chip memory, where #4687's next part loads
// it over JTAG. The compiler's errors and warnings are the job's ERROR and WARNING lines, by the project's file and line.
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import * as P from './projects.js';
import { createJob, getJob, capture, runCommand } from './jobs.js';
import { loadConfig, which } from './toolchain.js';
import { projectSystem } from '../core/project-system.js';
import { isSystemFile } from '../core/system-doc.js';
import { isTrusted, untrustedMessage } from '../core/trust.js';
import { psOfBoard } from '../core/zynq-ps.js';
import { PS_LINKER_SCRIPT, PS_STARTUP, OCM, psBuildDir, psCommand, psElf, psFileOf, psMessages, psProgram } from '../core/zynq-ps-compile.js';

const GCC = 'arm-none-eabi-gcc';
// (where Homebrew puts it, besides PATH: a server started from the Dock has a short PATH; Arm's macOS installer's)
const DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
const ARM_APPS = '/Applications/ArmGNUToolchain';
const running = new Map();   // project -> job id

/** arm-none-eabi-gcc's path: config.json's paths['arm-none-eabi-gcc'] (explicit), else the PATH's, the usual folders'
 *  or Arm's installer's newest; or null. `apps`: where Arm's macOS installer puts it. */
export function armGccPath(cfg, { apps = ARM_APPS } = {}) {
  const explicit = cfg?.paths?.[GCC];
  if (explicit) return which(String(explicit)) ? String(explicit) : null;
  let installed = [];
  try { installed = fss.readdirSync(apps).sort().reverse().map((v) => path.join(apps, v, 'arm-none-eabi', 'bin')); } catch { /* none */ }
  return which(GCC, [...DIRS, ...installed]);
}

/** Can a PS program be compiled here? { available, path, version, reason }. */
export async function detectArmGcc(cfg = null, opts = {}) {
  const bin = armGccPath(cfg ?? await loadConfig(), opts);
  if (!bin) return { available: false, path: null, version: null, reason: `${GCC} not found (the Arm GNU Toolchain: on the PATH or in config.json's paths['${GCC}'])` };
  const v = await capture(bin, ['--version'], { timeoutMs: 10000 });
  const version = /\)\s*(\d+\.\d+(?:\.\d+)?)/.exec(v.out || '')?.[1] || /(\d+\.\d+\.\d+)/.exec(v.out || '')?.[1] || null;
  if (v.code !== 0 && v.code != null) return { available: false, path: bin, version: null, reason: `${bin} did not run (${GCC} --version: exit code ${v.code})` };
  return { available: true, path: bin, version, reason: `${GCC} ${version || ''} found`.replace('  ', ' ') };
}

// the project's node whose PS program is compiled: a System's FPGA node on a Zynq board (`node`, its id), a Board
// project's implicit node (no `node`)
async function psNodeOf(name, node) {
  const pj = await P.readProject(name);
  // (a compiler run on the project's own text, its includes read from this computer: a trusted project's only, as ISE's, #2830)
  if (!isTrusted(pj)) throw new P.HttpError(403, untrustedMessage(name, GCC, pj));
  const files = await P.fileTree(name);
  const file = files.find(isSystemFile);
  const text = file ? await P.readFile(name, file).catch(() => '') : '';
  const r = projectSystem(pj, { files, texts: file ? { [file]: text } : {} });
  if (r.error) throw new P.HttpError(400, `${r.system}: ${r.error}`);
  if (!r.model) throw new P.HttpError(400, `the project '${name}' has no System nor board: a PS program is a Zynq board's`);
  const zynq = r.model.nodes.filter((n) => n.kind === 'fpga' && psOfBoard(n.board, n.variant));
  if (r.implicit) {
    if (node != null && node !== '') throw new P.HttpError(400, `node: the project '${name}' is a Board project (no System): its PS program is compiled with no node`);
    if (!zynq.length) throw new P.HttpError(400, `the project '${name}' is not on a Zynq board (the Zybo Z7, the Arty Z7): its board ${pj.board || '(none)'} has no processing system`);
    return { files, node: zynq[0] };
  }
  if (node == null || node === '') throw new P.HttpError(400, `node: the System node whose PS program is compiled (its Zynq nodes: ${zynq.map((n) => n.id).join(', ') || 'none'})`);
  const n = r.model.nodes.find((x) => x.id === node);
  if (!n) throw new P.HttpError(400, `no node '${node}' in the System of '${name}' (its Zynq nodes: ${zynq.map((x) => x.id).join(', ') || 'none'})`);
  if (!zynq.includes(n)) throw new P.HttpError(400, `${n.id}: not an FPGA node on a Zynq board (the Zybo Z7, the Arty Z7): no processing system`);
  return { files, node: n };
}

// the program's sources copied into its build folder's src/, Silinx's startup and linker script into silinx/
async function buildDir(name, node, prog) {
  const root = P.safeJoin(P.projectDir(name), psBuildDir(node));
  await fs.rm(root, { recursive: true, force: true });
  for (const f of prog.sources) {
    const to = P.safeJoin(root, path.join('src', f.slice(prog.dir.length + 1)));
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(P.safeJoin(P.projectDir(name), f), to);
  }
  await fs.mkdir(path.join(root, 'silinx'), { recursive: true });
  await fs.writeFile(path.join(root, 'silinx', 'startup.S'), PS_STARTUP);
  await fs.writeFile(path.join(root, 'silinx', 'ps.ld'), PS_LINKER_SCRIPT);
  await fs.mkdir(path.join(root, 'out'), { recursive: true });
  return root;
}

/** One node's PS program compiled (`gcc`: arm-none-eabi-gcc's path): its lines logged; its result { node, elf (its
 *  path in the project), entry, size, memsz, warnings }. */
async function compilePs(job, name, files, node, gcc) {
  const prog = psProgram(node, files);
  if (prog.error) throw new Error(prog.error);
  const root = await buildDir(name, node, prog);
  const units = prog.units.map((f) => `src/${f.slice(prog.dir.length + 1)}`);
  const who = node.implicit ? 'The project' : `System node ${node.id}`;
  job.log(`${who}: its PS program (${prog.units.length} C and assembly file(s) of ${prog.dir}/) for the Cortex-A9, by ${GCC}, with ${prog.startup ? `its ${prog.startup}` : 'Silinx\'s startup code'} and ${prog.script ? `its ${prog.script}` : 'Silinx\'s linker script (the on-chip memory)'}, in ${psBuildDir(node)}/.`);
  const text = [];
  // (its lines the console's once parsed: the job's own log not the compiler's raw output, which names the build folder)
  const quiet = { get cancelled() { return job.cancelled; }, procs: job.procs, log: (l) => text.push(String(l)) };
  const [cmd, args] = psCommand({ gcc, prog, units });
  const code = await runCommand(quiet, cmd, args, { cwd: root, echo: false, onLine: (l) => text.push(l) });
  job.checkCancelled();
  const { errors, warnings } = psMessages(text.join('\n'), (p) => psFileOf(p, root, prog));
  for (const l of [...errors, ...warnings]) job.log(l);
  if (code !== 0) {
    if (!errors.length) job.log(`ERROR: ${GCC} failed (exit code ${code}): ${text.filter((l) => l.trim() && !/^\$ /.test(l)).slice(-3).join(' ').slice(0, 300) || 'no message'}`);
    throw new Error(`its PS program did not compile (${errors.length || 1} error(s), ${warnings.length} warning(s))`);
  }
  const bytes = await fs.readFile(path.join(root, prog.elf)).catch(() => null);
  if (!bytes) throw new Error(`${GCC} made no ${prog.elf}`);
  const elf = psElf(new Uint8Array(bytes));
  if (elf.error) throw new Error(elf.error);
  const at = `${psBuildDir(node)}/${prog.elf}`;
  job.log(`${who}: its PS program ${at}, ${elf.size} bytes loaded in the on-chip memory (${elf.memsz} of its ${(OCM.end - OCM.start) / 1024} KB used, its .bss and stack included), its entry 0x${elf.entry.toString(16).padStart(8, '0')}.`);
  return { node: node.implicit ? null : node.id, elf: at, entry: elf.entry, size: elf.size, memsz: elf.memsz, warnings: warnings.length };
}

/**
 * A job compiling the PS program of the project `name`: a System's Zynq node's (`node`, its id), a Board project's on a
 * Zynq board (no node). Refused, with its reason, before it starts: an untrusted project, a node with no processing
 * system, no compiler.
 */
export async function startPsCompile(name, { node } = {}) {
  const { files, node: n } = await psNodeOf(name, node);
  const prog = psProgram(n, files);
  if (prog.error) throw new P.HttpError(400, prog.error);
  const tool = await detectArmGcc();
  if (!tool.available) throw new P.HttpError(400, `Compile PS Program needs ${GCC} on the local server: ${tool.reason}`);
  const key = name.toLowerCase();
  const was = running.get(key);
  if (was && getJob(was)?.status === 'running') throw new P.HttpError(409, `a PS program of '${name}' is already being compiled (job ${was}); wait for it or cancel it`);
  const job = createJob('ps', (j) => compilePs(j, name, files, n, tool.path), { meta: { project: name, node: n.implicit ? null : n.id, toolchain: GCC } });
  running.set(key, job.id);
  return job;
}
