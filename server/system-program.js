// Silinx - a System's nodes programmed on their boards (#5489's part 3, #5447, docs/SYSTEMS.md): the System row's Program
// All and a node's Program Node (POST /projects/:p/program-system with { node, chosen }), and the MCP's program_board
// with node. The build plan (server/system-plan.js) and the boards matched by their USB id (server/usb-devices.js), or
// the board the user picks (`chosen`), give the steps (core/system-program.js), in the plan's order: the FPGA nodes
// first, each node's bitstream over JTAG by the board's programmer (server/programmer.js programJob, its board picked by
// its serial number where the tool can), then the Arduinos, each .hex by arduino-cli upload (avrdude) on its board's
// serial port; a CircuitPython node's program copied to the Pico's CIRCUITPY drive (server/circuitpy-copy.js, #5697).
// Only on the user's action, a trusted project's; a node refused or failed is said, the next goes on.
import * as P from './projects.js';
import { createJob, getJob, runCommand } from './jobs.js';
import { loadConfig } from './toolchain.js';
import { isTrusted, untrustedMessage } from '../core/trust.js';
import { planOf, projectSystemOf } from './system-plan.js';
import { listUsbDevices } from './usb-devices.js';
import { matchBoards } from '../core/system-usb.js';
import { programSteps, stepLine, toolBoard } from '../core/system-program.js';
import { nodeBoard } from '../core/system-node.js';
import { AVR_FQBN } from '../core/avr-compile.js';

const running = new Map();   // project -> job id

/** The steps of Program All (`node` '*') or of a node's Program (its id), with the boards chosen by hand (`chosen`: { id:
 *  a serial number or a port }): { sys, steps, devices }; the project's System's. */
export async function programPlan(name, { node = '*', chosen = {} } = {}) {
  const sys = await projectSystemOf(name);
  const plan = await planOf(name, sys.model, sys.files);
  if (node !== '*' && !plan.nodes.some(e => e.id === node)) throw new P.HttpError(400, `no node '${node}' to program in the System of '${name}' (${plan.nodes.map(e => e.id).join(', ') || 'none'})`);
  if (!plan.nodes.length) throw new P.HttpError(400, `the System of '${name}' has no FPGA or microcontroller node to program`);
  const devices = await listUsbDevices();
  return { sys, devices, steps: programSteps(plan, matchBoards(sys.model, devices), devices, { node, chosen }) };
}

// an FPGA node's bitstream over JTAG, on its board
async function programFpga(j, name, n, s) {
  const { programJob, resolveOptions } = await import('./programmer.js');
  const board = nodeBoard(n);
  const tool = resolveOptions({}, await loadConfig(), n.board).tool;
  const pick = toolBoard(tool, s.device);
  if (!pick) j.log(`NOTE: ${n.id}: ${tool} cannot pick a board by its serial number: it programs the first ${board.name} it finds.`);
  await programJob(j, { board: n.board, bitfile: P.safeJoin(P.projectDir(name), s.image), expectDevice: board.device, ...(pick || {}) });
}

// an Arduino's .hex by arduino-cli upload (avrdude) on its board's serial port, verified
async function uploadMcu(j, name, n, s) {
  const { detectAvrCompiler } = await import('./avr-compile.js');
  const tool = await detectAvrCompiler();
  if (!tool.available) throw new Error(`its upload needs arduino-cli on the local server: ${tool.reason}`);
  const args = ['upload', '--fqbn', AVR_FQBN[n.board], '--port', s.device.port, '--input-file', P.safeJoin(P.projectDir(name), s.image), '--verify'];
  const text = [];
  const quiet = { get cancelled() { return j.cancelled; }, procs: j.procs, log: () => {} };
  const code = await runCommand(quiet, tool.path, args, { echo: false, onLine: l => text.push(l) });
  j.checkCancelled();
  if (code !== 0) throw new Error(`arduino-cli upload failed (exit code ${code}): ${text.filter(l => l.trim()).slice(-3).join(' ').slice(0, 300) || 'no message'}`);
}

// a CircuitPython node's program as code.py, and its folder's other .py files, onto the Pico's CIRCUITPY drive (#5697)
async function copyCircuitpy(j, name, n, s) {
  const { circuitpyDrives, copyToDrive, copyHint } = await import('./circuitpy-copy.js');
  const { relInNode } = await import('../core/system-layout.js');
  // (another code.py of its folder not written over its program)
  const others = (s.sources || []).filter(f => f !== s.image && relInNode(f, n.id) !== 'code.py');
  const drives = circuitpyDrives();
  if (drives.length !== 1) throw new Error(`${drives.length ? `${drives.length} CIRCUITPY drives mounted (${drives.join(', ')}): connect only the node's Pico` : 'no CIRCUITPY drive mounted'}: ${copyHint(s.image, others)}`);
  const files = [];
  for (const f of others) files.push({ name: relInNode(f, n.id), data: await P.readFileBytes(name, f) });
  const wrote = copyToDrive(drives[0], { program: { data: await P.readFileBytes(name, s.image) }, files });
  j.log(`System node ${s.id}: ${wrote.join(', ')} written on ${drives[0]}: CircuitPython runs code.py again.`);
}

/**
 * A job programming the System of the project `name`: every node (`node` '*', Program All) or the node `node`, on its
 * board (`chosen`: the boards picked by hand). Its result: { programmed: [ids], failed: [ids], refused: [ids] }; the
 * job fails when a node failed or was refused.
 */
export async function startSystemProgram(name, { node = '*', chosen = {} } = {}) {
  const pj = await P.readProject(name);
  if (!isTrusted(pj)) throw new P.HttpError(403, untrustedMessage(name, 'programming the boards', pj));
  const { sys, steps } = await programPlan(name, { node, chosen });
  const was = getJob(running.get(name.toLowerCase()));
  if (was?.status === 'running') throw new P.HttpError(409, `the boards of '${name}' are already being programmed (job ${was.id}); wait for it or cancel it`);
  const job = createJob('program', async j => {
    j.log('Program plan (the FPGA nodes first, then the microcontrollers):');
    for (const s of steps) j.log(`  ${stepLine(s)}`);
    const programmed = [], failed = [], refused = [];
    for (const s of steps) {
      if (s.refused) { refused.push(s.id); j.log(`ERROR: System node ${s.id}: not programmed: ${s.refused}`); continue; }
      if (s.warning) j.log(`WARNING: System node ${s.id}: ${s.warning}`);
      const n = sys.model.nodes.find(x => x.id === s.id);
      j.log(`System node ${s.id}: programming ${s.image}.`);
      try {
        if (s.kind === 'fpga') await programFpga(j, name, n, s);
        else if (s.programmer === 'circuitpy') await copyCircuitpy(j, name, n, s);
        else await uploadMcu(j, name, n, s);
        programmed.push(s.id);
        j.log(`System node ${s.id}: programmed.`);
      } catch (e) {
        if (e?.name === 'JobCancelled') throw e;
        failed.push(s.id);
        j.log(`ERROR: System node ${s.id}: ${e.message}`);
      }
    }
    j.log(`Program: ${programmed.length} node(s) programmed${programmed.length ? ` (${programmed.join(', ')})` : ''}, ${failed.length} failed${failed.length ? ` (${failed.join(', ')})` : ''}, ${refused.length} not programmed${refused.length ? ` (${refused.join(', ')})` : ''}.`);
    if (failed.length || refused.length) throw new Error(`the System node(s) ${[...failed, ...refused].join(', ')} not programmed`);
    return { programmed, failed, refused };
  }, { meta: { project: name, node } });
  running.set(name.toLowerCase(), job.id);
  return job;
}
