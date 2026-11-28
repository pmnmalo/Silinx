// Silinx - Copyright 2026 Pedro Maló - AGPL-3.0-only
// A Zynq board's PS program loaded over JTAG and started by the local server (#4687, part 3b): Run PS Program, for the
// interface (POST /projects/:p/ps-run with { node }, none in a Board project) and the MCP's program_board (ps). OpenOCD is
// the user's (Silinx installs nothing): config.json's paths.openocd, else the PATH or Homebrew's folders. The program is
// the ELF Compile PS Program made (server/zynq-ps-compile.js: build/nodes/<id>/ps/out/<id>.elf, a Board project's
// build/ps/out/ps.elf), refused when missing or older than its sources; its plan (core/zynq-ps-load.js) checked before
// OpenOCD runs, its Tcl written from it (core/zynq-ps-openocd.js) in the build folder's run/ with the segments' files.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as P from './projects.js';
import { createJob, getJob, capture, runCommand } from './jobs.js';
import { loadConfig, which } from './toolchain.js';
import { psNodeOf } from './zynq-ps-compile.js';
import { psOfBoard } from '../core/zynq-ps.js';
import { nodePs, psClocksError } from '../core/zynq-ps-clocks.js';
import { psBuildDir, psElf, psProgram } from '../core/zynq-ps-compile.js';
import { psLoadPlan } from '../core/zynq-ps-load.js';
import { openocdMessages, psOpenocdScript } from '../core/zynq-ps-openocd.js';

const DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
const running = new Map();   // project -> job id

/** OpenOCD's path: config.json's paths.openocd (explicit), else the PATH's and the usual folders'; or null. */
function openocdPath(cfg) {
  const explicit = cfg?.paths?.openocd;
  if (explicit) return which(String(explicit)) ? String(explicit) : null;
  return which('openocd', DIRS);
}

/** Can a PS program be run here? { available, path, version, reason }. */
export async function detectOpenocd(cfg = null) {
  const bin = openocdPath(cfg ?? await loadConfig());
  if (!bin) return { available: false, path: null, version: null, reason: 'OpenOCD not found (install it: on the PATH or in config.json\'s paths.openocd; Silinx does not install it)' };
  const v = await capture(bin, ['--version'], { timeoutMs: 10000 });
  const version = /Open On-Chip Debugger\s+v?(\d+\.\d+(?:\.\d+)?)/.exec(`${v.out || ''}${v.err || ''}`)?.[1] || null;
  return { available: true, path: bin, version, reason: `OpenOCD ${version || ''} found`.replace('  ', ' ') };
}

// the program's ELF in its build folder, and why it cannot be run (missing, older than a source)
async function elfOf(name, node, files) {
  const prog = psProgram(node, files);
  if (prog.error) throw new P.HttpError(400, prog.error);
  const at = `${psBuildDir(node)}/${prog.elf}`;
  const abs = P.safeJoin(P.projectDir(name), at);
  const st = await fs.stat(abs).catch(() => null);
  if (!st) throw new P.HttpError(400, `no ${at} yet: compile the PS program first (Compile PS Program)`);
  for (const f of prog.sources) {
    const s = await fs.stat(P.safeJoin(P.projectDir(name), f)).catch(() => null);
    if (s && s.mtimeMs > st.mtimeMs) throw new P.HttpError(400, `${at} is older than ${f}: compile the PS program again (Compile PS Program)`);
  }
  return { at, bytes: new Uint8Array(await fs.readFile(abs)) };
}

/**
 * A job loading the PS program of the project `name` (a System's Zynq node's, `node`; a Board project's, none) over
 * JTAG and starting it, by OpenOCD. Refused, with its reason, before OpenOCD runs: an untrusted project, a node with no
 * processing system, no ELF or an old one, a plan out of its bounds, no OpenOCD.
 */
export async function startPsRun(name, { node } = {}) {
  const { files, node: n } = await psNodeOf(name, node, 'OpenOCD');
  const elf = await elfOf(name, n, files);
  const why = psClocksError(n.psClocks, psOfBoard(n.board, n.variant));
  if (why) throw new P.HttpError(400, `the PS program is not loaded: ${n.implicit ? 'the project' : n.id}: ${why}`);
  const plan = psLoadPlan({ elf: psElf(elf.bytes), ps: nodePs(n) });   // (its PS's clocks its own, #5896)
  if (plan.error) throw new P.HttpError(400, `the PS program is not loaded: ${plan.error}`);
  const script = psOpenocdScript(plan);
  if (script.error) throw new P.HttpError(400, script.error);
  const tool = await detectOpenocd();
  if (!tool.available) throw new P.HttpError(400, `Run PS Program needs OpenOCD on the local server: ${tool.reason}`);
  const key = name.toLowerCase();
  const was = running.get(key);
  if (was && getJob(was)?.status === 'running') throw new P.HttpError(409, `a PS program of '${name}' is already being run (job ${was}); wait for it or cancel it`);
  const who = n.implicit ? 'The project' : `System node ${n.id}`;
  const job = createJob('ps-run', async (j) => {
    const dir = P.safeJoin(P.projectDir(name), path.join(psBuildDir(n), 'run'));
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'run.tcl'), script.tcl);
    for (const f of script.files) await fs.writeFile(path.join(dir, f.name), f.bytes);
    const words = plan.blocks.reduce((s, b) => s + b.words.length, 0);
    j.log(`${who}: its PS program ${elf.at} (${words * 4} bytes) loaded over JTAG by OpenOCD${tool.version ? ` ${tool.version}` : ''}, after ps7_init (${plan.init.length} register operations of the SLCR), CPU 0 started at 0x${plan.entry.toString(16).padStart(8, '0')}; its script ${psBuildDir(n)}/run/run.tcl.`);
    const text = [];
    const quiet = { get cancelled() { return j.cancelled; }, procs: j.procs, log: (l) => text.push(String(l)) };
    const code = await runCommand(quiet, tool.path, ['-f', 'run.tcl'], { cwd: dir, echo: false, onLine: (l) => text.push(l) });
    j.checkCancelled();
    const { errors, warnings } = openocdMessages(text.join('\n'));
    for (const l of [...errors, ...warnings]) j.log(l);
    if (code !== 0) {
      if (!errors.length) j.log(`ERROR: OpenOCD failed (exit code ${code}): ${text.filter((l) => l.trim() && !/^\$ /.test(l)).slice(-3).join(' ').slice(0, 300) || 'no message'}`);
      throw new Error(`its PS program was not started (is the board connected and on, its boot jumper on JTAG?)`);
    }
    j.log(`${who}: its PS program runs on CPU 0 (its UART on the board's USB serial port).`);
    return { node: n.implicit ? null : n.id, elf: elf.at, bytes: words * 4, entry: plan.entry, warnings: warnings.length };
  }, { meta: { project: name, node: n.implicit ? null : n.id, toolchain: 'openocd' } });
  running.set(key, job.id);
  return job;
}
