// Silinx - a System's PIC24 node's firmware compiled by XC16 (#5482, roadmap #5479's phase 1, docs/SYSTEMS.md): its
// node's Compile Firmware (server/avr-compile.js's startFirmwareCompile, which hands a PIC24 node here; Build All's,
// server/system-build-all.js). XC16 is the user's, as ISE is (Silinx installs nothing, ships nothing of it), found in one
// of two places (detectXc16):
//   - installed on this computer: config.json's paths.xc16 (its bin folder), the PATH, /Applications/microchip/xc16/
//     <version>/bin (macOS's installer) or /opt/microchip/xc16/<version>/bin (Linux's);
//   - the Docker image silinx/xc16:2.10 (config.json's xc16.image) on the ISE machine, reached over ssh as ISE's image is
//     (server/ise.js: ssh.host, its build folder under ssh.remoteDir), the node's build folder uploaded and its out/
//     brought back.
// config.json's xc16.mode chooses: 'local', 'ssh', or neither (this computer's when it has one, else the ISE machine's).
// The node's C and assembly (core/xc16-compile.js) are copied into build/nodes/<id>/firmware/src/ and built there:
// xc16-gcc to out/<id>.elf, xc16-bin2hex to out/<id>.hex, which is written to the node's folder, the node's firmware (set
// to it when it had none), which the Board Emulator runs on silinx-pic24. XC16's errors and warnings are the job's ERROR
// and WARNING lines, by the project's file and line, as Check Syntax's.
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import * as P from './projects.js';
import { capture, runCommand } from './jobs.js';
import { loadConfig, which } from './toolchain.js';
import { runInImage } from './image-remote.js';
import { XC16_IMAGE, XC16_OPT, nodeProgram, pic24FileOf, xc16Commands, xc16Messages, xc16Script } from '../core/xc16-compile.js';
import { mcuBoard } from '../core/system-doc.js';
import { parseHex } from '../packages/silinx-pic24/src/hex.js';
import { takeBuildRecord, writeBuildRecord } from './system-plan.js';
import { pic24PlanSources } from '../core/system-plan.js';
import { syncNodeMain } from '../core/node-main-sync.js';
import { baseLang } from '../core/system-layout.js';

/** Where XC16's installers put it: <folder>/<version>/bin. */
const XC16_DIRS = ['/Applications/microchip/xc16', '/opt/microchip/xc16'];
const IMAGE = /^[A-Za-z0-9][\w.\/:@-]*$/;
const TOOLS = ['xc16-gcc', 'xc16-bin2hex'];
const verKey = v => (/(\d+)\.(\d+)/.exec(v) || [0, 0, 0]).slice(1).map(Number);
const newer = (a, b) => { const [x, y] = [verKey(a), verKey(b)]; return y[0] - x[0] || y[1] - x[1]; };
const hasTools = bin => TOOLS.every(t => which(path.join(bin, t)));

// XC16's bin folder on this computer: { bin } or { reason }
function localBin(cfg, dirs) {
  const explicit = cfg?.paths?.xc16;
  if (explicit) {
    const p = String(explicit), bin = /xc16-gcc(\.exe)?$/.test(p) ? path.dirname(p) : p;
    return hasTools(bin) ? { bin } : { reason: 'config.json\'s paths.xc16 is not a bin folder of XC16 (its xc16-gcc and xc16-bin2hex)' };
  }
  const onPath = which('xc16-gcc');
  if (onPath && hasTools(path.dirname(onPath))) return { bin: path.dirname(onPath) };
  for (const d of dirs) {
    let vs = [];
    try { vs = fss.readdirSync(d).sort(newer); } catch { continue; }
    for (const v of vs) if (hasTools(path.join(d, v, 'bin'))) return { bin: path.join(d, v, 'bin') };
  }
  return { reason: 'no XC16 installed here (MPLAB XC16: its bin folder on the PATH or in config.json\'s paths.xc16)' };
}

/**
 * Can a PIC24 node's firmware be compiled, and where? { available, via ('local' | 'ssh' | null), bin, root (XC16's
 * install folder, this computer's), version (this computer's XC16's, or null), image (the ISE machine's, or null),
 * reason, local: { available, reason }, remote: { available, reason } }: which one is used, and why the other is not.
 * `dirs`: where the installers put XC16 (XC16_DIRS).
 */
export async function detectXc16(cfg = null, { dirs = XC16_DIRS } = {}) {
  cfg ??= await loadConfig();
  const mode = ['local', 'ssh'].includes(cfg.xc16?.mode) ? cfg.xc16.mode : 'auto';
  const image = cfg.xc16?.image || XC16_IMAGE;
  let local = { available: false, reason: 'not used (config.json\'s xc16.mode is ssh)' }, bin = null, root = null, version = null;
  if (mode !== 'ssh') {
    const l = localBin(cfg, dirs);
    if (l.bin) {
      bin = l.bin; root = path.dirname(bin);
      const v = await capture(path.join(bin, 'xc16-gcc'), ['--version'], { timeoutMs: 10000 });
      version = /Microchip v?(\d+\.\d+)/.exec(v.out || '')?.[1] || /\bv(\d+\.\d+)\b/.exec(bin)?.[1] || null;
      const gld = path.join(root, 'support', 'PIC24F', 'gld', 'p24FJ1024GB610.gld');
      local = fss.existsSync(gld) ? { available: true, reason: `XC16 ${version || ''} installed here`.replace('  ', ' ') }
        : { available: false, reason: `XC16 ${version || ''} installed here, without the PIC24FJ1024GB610's linker script (its PIC24F support)`.replace('  ', ' ') };
    } else local = { available: false, reason: l.reason };
  }
  let remote;
  if (mode === 'local') remote = { available: false, reason: 'not used (config.json\'s xc16.mode is local)' };
  else if (!IMAGE.test(image)) remote = { available: false, reason: 'config.json\'s xc16.image is not an image\'s name' };
  else if (!cfg.ssh?.host) remote = { available: false, reason: 'no ISE machine (no ssh host in the toolchain settings)' };
  else if (!which('ssh')) remote = { available: false, reason: 'ssh not found' };
  else remote = { available: true, reason: `the image ${image} on the ISE machine, over ssh` };
  const both = { local, remote };
  if (local.available) return { available: true, via: 'local', bin, root, version, image: null, reason: `${local.reason}${remote.available ? ' (the ISE machine\'s image not used)' : ''}`, ...both };
  // (the image's version its tag's: silinx/xc16:2.10)
  if (remote.available) return { available: true, via: 'ssh', bin: null, root: null, version: /:v?(\d+\.\d+)$/.exec(image)?.[1] || null, image, reason: `XC16 in ${remote.reason} (${local.reason})`, ...both };
  return { available: false, via: null, bin: null, root: null, version, image: null, reason: `${local.reason}; ${remote.reason}`, ...both };
}

// the node's sources copied into its build folder's src/ (its .hex and the compiler's outputs, out/, made there)
async function buildDir(name, node, prog) {
  const root = P.safeJoin(P.projectDir(name), path.join('build', 'nodes', node.id, 'firmware'));
  await fs.rm(root, { recursive: true, force: true });
  for (const f of prog.sources) {
    const to = P.safeJoin(root, path.join('src', f.slice(node.id.length + 1)));
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(P.safeJoin(P.projectDir(name), f), to);
  }
  await fs.mkdir(path.join(root, 'out'), { recursive: true });
  return root;
}

// XC16 on this computer: its commands run in the build folder, one after another; the first exit code that is not 0
async function runLocal(quiet, root, cmds, onLine) {
  for (const [cmd, args] of cmds) {
    const code = await runCommand(quiet, cmd, args, { cwd: root, echo: false, onLine });
    if (code !== 0) return code;
  }
  return 0;
}

/** One PIC24 node's firmware compiled (the System `sys`: server/avr-compile.js systemOf's; XC16 `tool`: detectXc16's):
 *  its lines logged, its .hex written; its result, as an Arduino node's (Build All's too). */
export async function compilePic24(job, name, sys, node, tool) {
  // (the node's main.c made from its drawings made again first: a drawing deleted since no longer called, #5552)
  const main = await syncNodeMain(P, name, node, baseLang(node));
  for (const l of main?.messages ?? []) job.log(l);
  const files = main?.written || main?.removed ? await P.fileTree(name) : sys.files;
  const prog = nodeProgram(node, files);
  if (prog.error) throw new Error(prog.error);
  // (what its .hex is built from, for the System's build plan, #5489: its sources as they are now)
  const record = await takeBuildRecord(name, { ...node, firmware: node.firmware || prog.hex }, pic24PlanSources(files, node.id));
  const root = await buildDir(name, node, prog);
  const units = prog.units.map(f => `src/${f.slice(node.id.length + 1)}`);
  const b = mcuBoard(node.board);
  const where = tool.via === 'local' ? `XC16 ${tool.version || ''} on this computer`.replace('  ', ' ') : `XC16 in the image ${tool.image} on the ISE machine`;
  job.log(`System node ${node.id}: its program (${prog.units.length} C and assembly file(s) of ${node.id}/) for the ${b.mcu} (${b.name}), by ${where}, ${XC16_OPT} (XC16's free licence: -O0 to -O2), in build/nodes/${node.id}/firmware/.`);
  const text = [];
  // (its lines the console's once parsed: the job's own log not the compiler's raw output, which names the build folder)
  const quiet = { get cancelled() { return job.cancelled; }, procs: job.procs, log: l => text.push(String(l)) };
  const onLine = l => text.push(l);
  let code;
  if (tool.via === 'local') code = await runLocal(quiet, root, xc16Commands({ id: node.id, device: prog.device, units, bin: tool.bin, root: tool.root }), onLine);
  else {
    await fs.writeFile(path.join(root, 'build.sh'), xc16Script({ id: node.id, device: prog.device, units }));
    code = await runInImage(quiet, await loadConfig(), { remote: `${name}.${node.id}.xc16`, root, image: tool.image, who: node.id, tool: 'XC16' }, onLine, l => job.log(l));
  }
  job.checkCancelled();
  const { errors, warnings } = xc16Messages(text.join('\n'), p => pic24FileOf(p, root, node.id));
  for (const l of [...errors, ...warnings]) job.log(l);
  if (code !== 0) {
    if (tool.via === 'ssh' && text.some(l => /No such image|Unable to find image/i.test(l))) job.log(`ERROR: ${node.id}: the image ${tool.image} is not on the ISE machine (build it there from Microchip's XC16 installer)`);
    else if (!errors.length) job.log(`ERROR: ${node.id}: XC16 failed (exit code ${code}): ${text.filter(l => l.trim() && !/^\$ /.test(l)).slice(-3).join(' ').slice(0, 300) || 'no message'}`);
    throw new Error(`${node.id}: its program did not compile (${errors.length || 1} error(s), ${warnings.length} warning(s))`);
  }
  const hex = await fs.readFile(path.join(root, 'out', `${node.id}.hex`), 'utf8').catch(() => null);
  if (hex == null) throw new Error(`${node.id}: xc16-bin2hex made no out/${node.id}.hex`);
  let words;
  try { words = parseHex(hex).words; } catch (e) { throw new Error(`${node.id}: XC16's out/${node.id}.hex: ${e.message}`); }
  await P.writeFile(name, prog.hex, hex);
  await writeBuildRecord(name, node, record);
  job.log(`System node ${node.id}: its firmware ${prog.hex}, ${words} program word(s).`);
  return { node: node.id, hex: prog.hex, size: words, warnings: warnings.length, set: !node.firmware };
}
