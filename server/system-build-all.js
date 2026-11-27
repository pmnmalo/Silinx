// Silinx - a System built by its plan (#5489, roadmap #5479's phase 2, docs/SYSTEMS.md): the System row's Build All
// (POST /projects/:p/build with { node: '*' }) and the MCP's run_process build (node: its id, or *). The plan first
// (server/system-plan.js, one line a node), then each node it builds in its order, the FPGA nodes first: an FPGA node
// to its bitstream by the Silinx toolchain (server/system-implement.js implementOne), an Arduino node's sketch to its
// .hex by arduino-cli (server/avr-compile.js compileOne), a PIC24's C by XC16 (server/xc16-compile.js, #5482). Build All builds the nodes that are not up to date; a node's
// own Build builds it whatever its state. A node that fails is said and the next goes on; the job fails when one did.
import * as P from './projects.js';
import { createJob, getJob } from './jobs.js';
import { needsBuild, planLine, planLines } from '../core/system-plan.js';
import { isTrusted, untrustedMessage } from '../core/trust.js';
import { planOf, projectSystemOf } from './system-plan.js';

const running = new Map();   // project -> job id
const BITGEN = ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'];

// another build of the project running (its implementation, its firmware, its Build All): its message, or null
async function busy(name) {
  const { runningImplementation } = await import('./system-implement.js');
  const { runningFirmware } = await import('./avr-compile.js');
  const was = getJob(running.get(name.toLowerCase()));
  const j = was?.status === 'running' ? was : runningImplementation(name) || runningFirmware(name);
  return j ? `a build of '${name}' is already running (job ${j.id}); wait for it or cancel it` : null;
}

/**
 * A job building the System of the project `name`: every node not up to date (`node` '*', Build All) or the node `node`
 * (its id), in the plan's order. Its result: { built: [ids], failed: [ids], skipped: [ids] (up to date, or nothing to
 * build) }.
 */
export async function startSystemBuild(name, { node } = {}) {
  const sys = await projectSystemOf(name);
  const plan = await planOf(name, sys.model, sys.files);
  if (!plan.nodes.length) throw new P.HttpError(400, `the System of '${name}' has no FPGA or microcontroller node to build`);
  const one = node === '*' ? null : plan.nodes.find(e => e.id === node);
  if (node !== '*' && !one) throw new P.HttpError(400, `no node '${node}' to build in the System of '${name}' (${plan.nodes.map(e => e.id).join(', ')})`);
  if (one && !one.build) throw new P.HttpError(400, `${one.id}: nothing to build: ${planLine(one).slice(one.id.length + 2)}`);
  const chosen = plan.nodes.filter(e => (one ? e === one && needsBuild(e, true) : needsBuild(e)));
  const why = await busy(name);
  if (why) throw new P.HttpError(409, why);
  const job = createJob('build', async j => {
    for (const l of planLines(plan)) j.log(l);
    const built = [], failed = [];
    for (const e of chosen) {
      const n = sys.model.nodes.find(x => x.id === e.id);
      j.log(`System node ${e.id}: building (${e.state}).`);
      try {
        if (e.build === 'silinx') await (await import('./system-implement.js')).implementOne(j, name, sys.pj, n, BITGEN);
        else await compileFirmware(j, name, sys, n);
        built.push(e.id);
        j.log(`System node ${e.id}: built, ${e.image}.`);
      } catch (err) {
        if (err?.name === 'JobCancelled') throw err;
        failed.push(e.id);
        j.log(`ERROR: System node ${e.id}: ${err.message}`);
      }
    }
    const skipped = plan.nodes.filter(e => !chosen.includes(e)).map(e => e.id);
    j.log(`Build: ${built.length} node(s) built${built.length ? ` (${built.join(', ')})` : ''}, ${failed.length} failed${failed.length ? ` (${failed.join(', ')})` : ''}, ${skipped.length} left as they were${skipped.length ? ` (${skipped.join(', ')})` : ''}.`);
    if (failed.length) throw new Error(`the System node(s) ${failed.join(', ')} failed`);
    return { built, failed, skipped };
  }, { meta: { project: name, node } });
  running.set(name.toLowerCase(), job.id);
  return job;
}

// an Arduino node's sketch compiled (its .asm assembled, #5933), as its Compile Firmware: a trusted project's, arduino-cli found; a PIC24's C by
// XC16 (#5482: server/xc16-compile.js); its firmware set in the System document when it had none
async function compileFirmware(j, name, sys, n) {
  const { isPic24 } = await import('../core/xc16-compile.js');
  const pic = isPic24(n);
  if (!isTrusted(sys.pj)) throw new Error(untrustedMessage(name, pic ? 'XC16' : 'arduino-cli', sys.pj));
  const { detectAvrCompiler, compileOne, setMadeFirmwares } = await import('./avr-compile.js');
  let made;
  if (pic) {
    const { detectXc16, compilePic24 } = await import('./xc16-compile.js');
    const tool = await detectXc16();
    if (!tool.available) throw new Error(`its firmware needs XC16 on the local server or the ISE machine: ${tool.reason}`);
    made = await compilePic24(j, name, sys, n, tool);
  } else {
    // (an assembly program needs no arduino-cli: Silinx's AVR assembler, #5933)
    const { nodeAssembly } = await import('../core/avr-compile.js');
    const tool = nodeAssembly(n, sys.files) ? null : await detectAvrCompiler();
    if (tool && !tool.available) throw new Error(`its firmware needs arduino-cli on the local server: ${tool.reason}`);
    made = await compileOne(j, name, sys, n, tool?.path);
  }
  await setMadeFirmwares(j, name, sys, [made]);
}
