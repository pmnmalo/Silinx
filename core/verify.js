// Silinx - formal verification (#3177): the equivalence of a module with a reference module, in the browser (Yosys
// WASM) as on the server. Silinx's front end writes each of the two modules as the open synthesis's flat SystemVerilog
// (core/synth-verilog.js: VHDL and Verilog alike), and Yosys checks them (core/verify-abc.js, #3262): first a structural
// proof (the two modules' signals matched by name, each pair proved equal by induction: a module against a transformed
// copy of itself, whatever its size), else the two joined in a miter (the same inputs to both, their outputs compared)
// checked by ABC: a bounded model check cycle by cycle from the initial state (the shortest difference first), then a
// proof for every input sequence (pdr). A difference is a counterexample: the inputs of each clock cycle and both
// modules' outputs, which core/verify-bench.js makes a test bench of (the simulator replays it, the waveform viewer
// shows it). (verifyScript and readVerifyLog, Yosys's `sat -tempinduct`, are the assertions' engine, core/verify-assert.js.)
//
//   const r = await verifyEquivalence(sources, { top, reference, depth, timeLimit, run, onLine })
//   r: { status: 'proved' | 'bounded' | 'failed' | 'timeout' | 'error', errors, warnings, depth, method (a proof's:
//        'structural', 'pdr', 'reach' (every reachable state explored) or 'sat', a combinational miter's), induction (the proof's length, 'induction''s),
//        cycles: [{ in: { port: bits }, uut: { port: bits }, ref: { port: bits } }] (the counterexample), cycle (its
//        difference's, from 1), differs: [port], ports: [{ name, dir, width, uut, ref }] (core/testbench.js tbPorts'),
//        clocks: [port], log }; bounded: beyond (the clock cycle of a difference found after the depth); timeout (core/verify-limit.js, #3261): Yosys stopped after timeLimit seconds, checked (the
//        clock cycles it had checked with no difference by then)
//
// The model: every register takes its next value once per clock cycle (one clock: the designs of a course; their
// asynchronous resets as Yosys's async2sync makes them, the reset's value seen at once); a register with no initial
// value starts at 0, as the FPGA's do after configuration.
import { compile, elaborate } from './compile.js';
import { primitiveSources } from './unisim.js';
import { toVerilog, signedInt } from './synth-verilog.js';
import { tbPorts } from './testbench.js';
import { clocksOf } from './schematic.js';
import { VERIFY_TIME_LIMIT, timeLimitError, runWithin, timeoutText } from './verify-limit.js';
import { structuralScript, readStructural, abcScript, abcFiles, readAbc, readAbcStatus, replayWitness, BMC_CEX, PDR_CEX, SAT_CEX } from './verify-abc.js';

export const VERIFY_DEPTH = 20;
export const MAX_DEPTH = 1000;
export { VERIFY_TIME_LIMIT, MAX_TIME_LIMIT } from './verify-limit.js';
// the modules' names in Yosys (the miter's gold, the reference, and gate, the module verified)
const REF = 'silinx_ref', UUT = 'silinx_uut', MITER = 'silinx_miter';

/** The Yosys script of the equivalence check, at most `depth` clock cycles. */
export function verifyScript(depth = VERIFY_DEPTH) {
  return [
    `read_verilog -sv ${REF}.sv ${UUT}.sv`,
    // (memories as registers and logic: the SAT solver has no model of a memory; the asynchronous resets and the
    // latches as the solver sees them, cycle by cycle)
    'proc', 'memory', 'opt_clean', 'async2sync',
    `miter -equiv -flatten -make_outputs -make_assert ${REF} ${UUT} ${MITER}`,
    `hierarchy -top ${MITER}`, 'opt_clean',
    `sat -tempinduct -prove-asserts -set-init-zero -maxsteps ${depth} -show-inputs -show-outputs ${MITER}`,
  ].join('; ');
}

/** The Yosys script of the proof of module `top`'s assertions (read with -formal), at most `depth` clock cycles. */
export function assertScript(depth = VERIFY_DEPTH) {
  return [
    `read_verilog -sv -formal ${UUT}.sv`,
    // (a clocked assertion: its condition sampled at the edge, a register's worth later, as chformal lowers it)
    'proc', 'memory', 'opt_clean', 'async2sync', 'chformal -lower', `hierarchy -top ${UUT}`, 'opt_clean',
    `sat -tempinduct -prove-asserts -set-assumes -set-init-zero -maxsteps ${depth} -show-inputs -show-outputs ${UUT}`,
  ].join('; ');
}

// the elaborated module `name` of library `lib`, its ports as the test bench sees them, its clock ports
export function moduleOf(lib, name, what) {
  const unit = [...lib.modules.values()].find(m => m.kind !== 'package' && m.name.toLowerCase() === String(name).toLowerCase());
  if (!unit) return { error: `${what} '${name}' is not a module of the project` };
  const design = elaborate(lib, unit.name);
  const errs = design.diags.filter(d => d.severity === 'error');
  if (!design.top || errs.length) return { error: `${what} '${unit.name}' cannot be elaborated: ${errs.slice(0, 3).map(d => `${d.file}:${d.line} ${d.message}`).join('; ') || 'no top'}` };
  const ports = tbPorts(design);
  design.top.ports.forEach((p, i) => {
    const t = p.sig.t;
    // (a VHDL vector's type: std_logic_vector, or a subtype of it, has its mark; numeric_std's unsigned and signed none)
    if (unit.lang === 'vhdl' && ports[i].kind === 'slv' && !t.mark) ports[i].kind = t.s ? 'signed' : 'unsigned';
    // (an integer port of a negative range: its bits as a signed number's)
    ports[i].signedInt = signedInt(t);
  });
  const clockSigs = new Set();
  const visit = inst => { for (const pr of inst.procs || []) { try { for (const c of clocksOf(pr).clocks) clockSigs.add(c); } catch { /* not a clocked process */ } } (inst.children || []).forEach(visit); };
  visit(design.top);
  for (const pr of design.procs || []) { try { for (const c of clocksOf(pr).clocks) clockSigs.add(c); } catch { /* not a clocked process */ } }
  const clocks = design.top.ports.filter(p => clockSigs.has(p.sig)).map(p => p.name);
  return { unit, design, ports, clocks };
}

/** The differences between the ports of the module verified and of its reference (messages), [] when they match. */
function portDifferences(uut, ref) {
  const out = [];
  const byName = new Map(ref.ports.map(p => [p.name.toLowerCase(), p]));
  for (const p of uut.ports) {
    const q = byName.get(p.name.toLowerCase());
    if (!q) out.push(`port ${p.name} of '${uut.unit.name}' is not a port of '${ref.unit.name}'`);
    else if (q.name !== p.name) out.push(`port ${p.name} of '${uut.unit.name}' is ${q.name} in '${ref.unit.name}' (the names must be written alike)`);
    else if (q.dir !== p.dir) out.push(`port ${p.name} is an ${p.dir === 'in' ? 'input' : p.dir === 'out' ? 'output' : 'inout'} of '${uut.unit.name}' and an ${q.dir === 'in' ? 'input' : q.dir === 'out' ? 'output' : 'inout'} of '${ref.unit.name}'`);
    else if (q.width !== p.width) out.push(`port ${p.name} has ${p.width} bit(s) in '${uut.unit.name}' and ${q.width} in '${ref.unit.name}'`);
  }
  const mine = new Set(uut.ports.map(p => p.name.toLowerCase()));
  for (const q of ref.ports) if (!mine.has(q.name.toLowerCase())) out.push(`port ${q.name} of '${ref.unit.name}' is not a port of '${uut.unit.name}'`);
  for (const m of [uut, ref]) for (const p of m.ports) {
    if (p.dir === 'inout') out.push(`port ${p.name} of '${m.unit.name}' is bidirectional: Verify compares inputs and outputs only`);
    else if (p.kind === 'other') out.push(`port ${p.name} of '${m.unit.name}' is of a type Verify cannot drive (bits, vectors and integers only)`);
  }
  return out;
}

/**
 * Yosys's log of the check read: { status, induction, cycles, cycle, differs, warnings }. The counterexample is the
 * table printed after "model found for base case" (the induction steps' tables before it are of states not reached).
 */
export function readVerifyLog(lines, outputs = [], { inputs = null } = {}) {
  const warnings = lines.filter(l => /^Warning: /.test(l)).map(l => l.replace(/^Warning: /, ''));
  const proved = lines.findIndex(l => /^Induction step proven: SUCCESS!/.test(l));
  const failed = lines.findIndex(l => /model found for base case: FAIL!/.test(l));
  if (proved >= 0 && failed < 0) {
    // (the length of the induction: its last "Trying induction with length N")
    const tries = lines.slice(0, proved).map(l => /^\*\* Trying induction with length (\d+) \*\*/.exec(l)).filter(Boolean);
    return { status: 'proved', induction: tries.length ? +tries[tries.length - 1][1] : 1, warnings };
  }
  if (failed < 0) return { status: lines.some(l => /^Reached maximum number of time steps/.test(l)) ? 'bounded' : 'error', warnings };
  const cycles = [];
  for (const l of lines.slice(failed + 1)) {
    const m = /^\s+(\d+)\s+\\(\S+)\s+\S+\s+\S+\s+([01xz]+)\s*$/i.exec(l);
    if (!m) { if (cycles.length && !/^\s+-+/.test(l) && !/^\s+Time\s/.test(l)) break; continue; }
    const k = +m[1] - 1, [, , sig, bits] = m;
    const c = cycles[k] || (cycles[k] = { in: {}, uut: {}, ref: {}, trigger: false });
    const at = /^(in|gold|gate)_(.*)$/.exec(sig);
    // (a module's own assertions, inputs: its ports, inputs and outputs, by their names)
    if (inputs) c[inputs.includes(sig) ? 'in' : 'uut'][sig] = bits.toLowerCase();
    else if (sig === 'trigger') c.trigger = bits === '1';
    else if (at) c[{ in: 'in', gold: 'ref', gate: 'uut' }[at[1]]][at[2]] = bits.toLowerCase();
  }
  for (let k = 0; k < cycles.length; k++) cycles[k] ||= { in: {}, uut: {}, ref: {}, trigger: false };
  if (inputs) return { status: 'failed', cycles: cycles.map(({ trigger, ...c }) => c), cycle: cycles.length, differs: [], warnings };
  const at = cycles.findIndex(c => c.trigger);
  const cycle = at >= 0 ? at + 1 : cycles.length;
  const last = cycles[cycle - 1] || { uut: {}, ref: {} };
  const differs = (outputs.length ? outputs : Object.keys(last.uut)).filter(n => last.uut[n] !== last.ref[n]);
  return { status: 'failed', cycles: cycles.slice(0, cycle).map(({ trigger, ...c }) => c), cycle, differs, warnings };
}

/**
 * Verify that module `top` of the sources ([{ path, text, lang }]: the design's and the simulation's) gives the outputs
 * of module `reference` for every input sequence: proved (by induction), bounded (no difference in the first `depth`
 * clock cycles) or failed (the counterexample). run(args, files, onLine): Yosys's (packages/silinx-fpga/src/
 * synth-open-node.js yosysNode, web/js/yosys-client.js yosysBrowser). referenceSources: the reference's own sources,
 * compiled apart (an exercise's reference design, whose modules have the submission's names: automatic grading, #3217).
 */
export async function verifyEquivalence(sources, { top, reference, referenceSources = null, depth = VERIFY_DEPTH, timeLimit = VERIFY_TIME_LIMIT, run, onLine = () => {} } = {}) {
  const error = (...errors) => ({ status: 'error', errors, warnings: [], depth });
  if (!top) return error('no module to verify');
  if (!reference) return error(`no reference module for '${top}'`);
  if (!(Number.isInteger(depth) && depth >= 1 && depth <= MAX_DEPTH)) return error(`the depth must be a number of clock cycles from 1 to ${MAX_DEPTH}`);
  if (timeLimitError(timeLimit)) return error(timeLimitError(timeLimit));
  const lib = compile([...primitiveSources(sources), ...sources]);
  const libErrs = lib.errors.filter(e => e.severity === 'error');
  if (libErrs.length) return error(...libErrs.slice(0, 5).map(e => `${e.file}:${e.line} ${e.message}`));
  let refLib = lib;
  if (referenceSources) {
    refLib = compile([...primitiveSources(referenceSources), ...referenceSources]);
    const refErrs = refLib.errors.filter(e => e.severity === 'error');
    if (refErrs.length) return error(...refErrs.slice(0, 5).map(e => `the reference: ${e.file}:${e.line} ${e.message}`));
  }
  const uut = moduleOf(lib, top, 'the module');
  const ref = moduleOf(refLib, reference, 'the reference');
  if (uut.error || ref.error) return error(...[uut.error, ref.error].filter(Boolean));
  if (uut.unit === ref.unit) return error(`'${uut.unit.name}' cannot be its own reference`);
  const diffs = portDifferences(uut, ref);
  if (diffs.length) return error(`'${uut.unit.name}' and its reference '${ref.unit.name}' must have the same ports: ${diffs.join('; ')}`);
  const files = {};
  const warnings = [];
  for (const [m, name] of [[ref, REF], [uut, UUT]]) {
    try {
      const v = toVerilog(m.design, { name });
      files[`${name}.sv`] = v.text;
      warnings.push(...v.warnings.map(w => `${m.unit.name}: ${w.message ?? w}`));
    } catch (e) { return error(`'${m.unit.name}' cannot be verified: ${e.message}`); }
  }
  const refBy = new Map(ref.ports.map(p => [p.name, p]));
  const ports = uut.ports.map(p => ({ name: p.name, dir: p.dir, width: p.width, uut: p, ref: refBy.get(p.name) }));
  const outputs = ports.filter(p => p.dir === 'out').map(p => p.name);
  const lines = [];
  let r;
  try { r = await checkMiter(run, files, { depth, timeLimit, outputs, onLine: l => { lines.push(l); onLine(l); } }); }
  catch (e) { return { ...error(e.message), log: lines }; }
  if (r.status === 'error') return { ...error(r.message), log: lines };
  const clocks = [...new Set([...uut.clocks, ...ref.clocks])];
  return { ...r, errors: [], warnings: [...warnings, ...r.warnings], depth, top: uut.unit.name, reference: ref.unit.name,
    lang: uut.unit.lang, ports, clocks, log: lines };
}

/**
 * The two modules' check (files: silinx_ref.sv, silinx_uut.sv) within timeLimit seconds: the structural proof (half of
 * the time at most), then ABC's. { status, method, cycles, cycle, differs } | { status: 'timeout', timeLimit, checked }
 * | { status: 'error', message }, with warnings: Yosys's of the structural proof's run, which reads the two modules as
 * the other does (ABC's run's own are of its netlists for ABC: an input bit write_aiger calls undriven).
 */
async function checkMiter(run, files, opts) {
  const s = [];
  const r = await checkMiterIn(run, files, s, opts);
  return { ...r, warnings: s.filter(l => /^Warning: /.test(l)).map(l => l.replace(/^Warning: /, '')) };
}

async function checkMiterIn(run, files, s, { depth, timeLimit, outputs, onLine }) {
  const t0 = Date.now();
  const left = () => timeLimit - (Date.now() - t0) / 1000;
  // (a structural proof that fails, or that Yosys refuses: ABC's check decides)
  const st = await runWithin(run, ['-p', structuralScript()], files, l => { s.push(l); onLine(l); }, timeLimit / 2).catch(() => ({ timedOut: false }));
  if (!st.timedOut && readStructural(s).proved) return { status: 'proved', method: 'structural' };
  const a = [];
  // (bmc3 and pdr each given 40% of the time left, Yosys's own work before them the rest)
  const w = await runWithin(run, ['-p', abcScript(depth, left() * 0.4)], { ...files, ...abcFiles() }, l => { a.push(l); onLine(l); }, Math.max(left(), 0.001));
  if (w.timedOut) return { status: 'timeout', timeLimit, checked: 0 };
  // (ABC's results from its log; YoWASP's Yosys 0.71 loses ABC's output: from its status files, #5604)
  const r = a.some(l => l.startsWith('ABC: ')) ? readAbc(a) : readAbcStatus(w.files) ?? readAbc(a);
  if (r.latches === null) return { status: 'error', message: 'Yosys gave no result (its log has neither a proof nor a counterexample)' };
  const failed = (frame, cex) => {
    const cycles = replayWitness(w.files, cex);
    const cycle = frame + 1;
    if (!cycles || cycles.length < cycle || !cycles[frame].trigger) return { status: 'error', message: 'ABC\'s counterexample could not be replayed' };
    const last = cycles[frame];
    return { status: 'failed', cycles: cycles.slice(0, cycle).map(({ trigger, ...c }) => c), cycle, differs: outputs.filter(n => last.uut[n] !== last.ref[n]) };
  };
  if (r.latches === 0) return r.sat === 'proved' ? { status: 'proved', method: 'sat' } : r.sat ? failed(0, SAT_CEX) : { status: 'timeout', timeLimit, checked: 0 };
  if (r.bmc.frame !== undefined) return failed(r.bmc.frame, BMC_CEX);
  if (r.bmc.reached) return { status: 'proved', method: 'reach' };
  if (r.pdr === 'proved') return { status: 'proved', method: 'pdr' };
  if (r.pdr && r.pdr.frame < depth && r.bmc.checked < r.pdr.frame) return failed(r.pdr.frame, PDR_CEX);
  // (a difference pdr found after the depth: bounded, its clock cycle said)
  if (r.bmc.checked >= depth) return { status: 'bounded', ...(r.pdr ? { beyond: r.pdr.frame + 1 } : {}) };
  return { status: 'timeout', timeLimit, checked: r.bmc.checked };
}

/** How a proof was made, for its messages: "by induction over 2 clock cycle(s)", "signal by signal by induction…". */
export function provedBy(r) {
  return { structural: 'signal by signal by induction, the signals matched by name', pdr: 'by an inductive invariant, ABC\'s pdr',
    reach: 'every reachable state explored, ABC\'s bmc3', sat: 'by ABC\'s SAT solver' }[r.method] ?? `by induction over ${r.induction} clock cycle(s)`;
}

export const VERIFY_PROCESS = 'Verify Equivalence';

/**
 * The console's messages of a check (the interface's and the MCP tool's alike): [{ text, kind: 'hdr' | 'info' | 'ok' |
 * 'warn' | 'err' }], the process's start and end lines among them. bench: the counterexample's test bench's path, when
 * one was written.
 */
export function verifyMessages(r, { top = r.top, reference = r.reference, bench = null } = {}) {
  const M = [{ text: `\nStarted : "${VERIFY_PROCESS}".\n`, kind: 'hdr' }];
  const end = (ok, warn) => M.push(ok ? { text: `\nProcess "${VERIFY_PROCESS}" completed successfully${warn ? ` with ${warn} warning(s)` : ''}`, kind: 'ok' }
    : { text: `\nProcess "${VERIFY_PROCESS}" failed`, kind: 'err' });
  if (r.status === 'error') {
    for (const e of r.errors) M.push({ text: `ERROR:Verify - ${e}`, kind: 'err' });
    end(false);
    return M;
  }
  M.push({ text: `Verifying '${top}' against its reference '${reference}': a structural proof (Yosys's equivalence passes), else ABC's check over at most ${r.depth} clock cycle(s), then its proof (pdr).`, kind: 'info' });
  const warns = r.warnings.map(w => ({ text: `WARNING:Verify - ${w}`, kind: 'warn' }));
  M.push(...warns);
  if (r.status === 'proved') {
    M.push({ text: `Proved: '${top}' gives the outputs of '${reference}' for every input sequence (${provedBy(r)}).`, kind: 'ok' });
    end(true, warns.length);
  } else if (r.status === 'bounded') {
    M.push({ text: r.beyond ? `WARNING:Verify - no difference in the first ${r.depth} clock cycle(s), but ABC's pdr finds one at clock cycle ${r.beyond}: a depth of ${r.beyond} shows it.`
      : `WARNING:Verify - no difference in the first ${r.depth} clock cycle(s), but not proved beyond them (no proof found in the time limit): a larger depth checks more cycles.`, kind: 'warn' });
    end(true, warns.length + 1);
  } else if (r.status === 'timeout') {
    timeoutEnd(M, r, 'no difference', end, warns.length);
  } else {
    const last = r.cycles[r.cycle - 1];
    const what = r.differs.map(n => `${n} = ${last.uut[n]}, the reference's ${n} = ${last.ref[n]}`).join('; ');
    M.push({ text: `ERROR:Verify - '${top}' differs from its reference '${reference}' at clock cycle ${r.cycle}: ${what}.`, kind: 'err' });
    if (bench) M.push({ text: `The counterexample's test bench: ${bench} (it replays the ${r.cycle} clock cycle(s) in the simulator, both modules side by side).`, kind: 'info' });
    end(false);
  }
  return M;
}

/** A timed-out check's messages (#3261): a warning when some clock cycles were checked, an error when none was. */
export function timeoutEnd(M, r, what, end, warns) {
  const ok = r.checked > 0;
  M.push({ text: `${ok ? 'WARNING' : 'ERROR'}:Verify - ${timeoutText(r, what)}`, kind: ok ? 'warn' : 'err' });
  end(ok, warns + 1);
}

/** Whether a file's text is a counterexample's test bench of Verify (written again by the next check). */
export const isVerifyBench = text => /^(--|\/\/) Counterexample of Verify \(Silinx\)/.test(String(text || ''));
