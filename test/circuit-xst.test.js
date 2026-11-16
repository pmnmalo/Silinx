// XST's warnings on a digital circuit's chips left out of an ISE run (#4020, core/circuit-xst.js): a 74164 read on QA and QB
// only, its six other outputs open in the digital model (VHDL and Verilog: compiled, elaborated, simulated; the open
// synthesis's warnings: none); its names read from its generated HDL; XST's real lines on it (Xst:753, Xst:2677) left
// out, an instance outside a circuit still warning; the ISE run's log (server/ise.js) without them, the note counting them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { checkCircuit } from '../core/circuit-check.js';
import { circuitPorts } from '../core/circuit.js';
import { synthesisText } from '../core/translate-off.js';
import { circuitXstNames, isCircuitXstWarning, circuitXstNote } from '../core/circuit-xst.js';
import { leaveOutCircuitWarnings, circuitsOf } from '../server/ise.js';
import { createJob, runCommand } from '../server/jobs.js';
import { micro80S3eWarnings } from './ise-micro80-warnings.mjs';
import { msiBench, circuitBench } from './circuit-helpers.mjs';

const LANGS = ['vhdl', 'verilog'];
const file = (lang) => (lang === 'vhdl' ? 'bench.vhd' : 'bench.v');

// the 74164's bench with only QA's and QB's LEDs (the others and their wires taken away)
function halfRead() {
  const m = msiBench('74164', { name: 'shift' });
  return { ...m, parts: m.parts.filter((p) => !/^D[3-8]$/.test(p.id)), wires: m.wires.filter((w) => !w.points.some(([x]) => x >= 36)) };
}

// XST's lines on it (as XST writes them, #4020: its block the chip's entity, the top's nodes under the instance)
const SRC = '/work/src/shift.vhd';
const CIRCUIT_LINES = [
  ...['qc', 'qd', 'qe', 'qf', 'qg', 'qh'].map((q) => `WARNING:Xst:753 - "${SRC}" line 160: Unconnected output port '${q}' of component 'shift_sn74ls164'.`),
  ...[2, 3, 4, 5, 6, 7].map((k) => `WARNING:Xst:2677 - Node <r_${k}> of sequential type is unconnected in block <shift_sn74ls164>.`),
  ...[2, 3, 4, 5, 6, 7].map((k) => `WARNING:Xst:2677 - Node <d_U1/r_${k}> of sequential type is unconnected in block <shift>.`),
];

test('#4020 a chip\'s unread outputs open in the digital model, VHDL and Verilog: compiled, elaborated, simulated, no warnings', async () => {
  const m = halfRead();
  assert.deepEqual(checkCircuit(m), []);
  const { inputs, outputs } = circuitPorts(m);
  assert.deepEqual(outputs.map((o) => o.name), ['q_qa', 'q_qb']);
  // a, b high: each rising clock shifts a 1 in (the clear released first)
  const v = (clk) => ({ a: 1, b: 1, clr_n: 1, clk });
  const vectors = [{ a: 1, b: 1, clr_n: 0, clk: 0 }, v(0), v(1), v(0), v(1)];
  for (const lang of LANGS) {
    const code = synthesisText(generateCircuit(m, lang).code);
    assert.match(code, lang === 'vhdl' ? /qb => d_U1_qb, qc => open, qd => open, qe => open, qf => open, qg => open, qh => open,/ : /\.qb\(d_U1_qb\), \.qc\(\), \.qd\(\), \.qe\(\), \.qf\(\), \.qg\(\), \.qh\(\),/);
    const lib = compile([{ path: file(lang), text: code }]), d = elaborate(lib, m.name);
    assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => `${e.severity}: ${e.message}`), [], lang);
    const r = simulate([{ path: file(lang), text: code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: inputs.map((x) => x.name), outs: outputs.map((x) => x.name), ns: 1000 }) }], 'tb', { until: 1e10 });
    assert.deepEqual(r.errors, [], lang);
    assert.deepEqual(r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^[01xz]+$/.test(x)), ['00', '00', '10', '10', '11'], lang);
    // the open synthesis (Yosys): no warning on the open outputs either
    const { synthesizeOpen } = await import('../core/synth-front.js');
    const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
    const s = await synthesizeOpen(d, { family: 'spartan3e', run: yosysNode });
    assert.deepEqual(s.warnings, [], lang);
  }
});

test('#4020 circuitXstNames: a circuit\'s module, its chips\' entities and instances, from its HDL in either language; another file null', () => {
  for (const lang of LANGS) {
    const c = circuitXstNames(generateCircuit(halfRead(), lang).code);
    assert.deepEqual({ ...c, entities: [...c.entities], instances: [...c.instances] }, { module: 'shift', entities: ['shift_sn74ls164'], instances: ['d_u1'] }, lang);
  }
  assert.equal(circuitXstNames('library ieee;\nentity top is\nend entity;\n'), null);
  assert.equal(circuitXstNames(''), null);
  assert.equal(circuitXstNames(null), null);
  // (a file that names d_ instances of entities not the circuit's own: none taken)
  const c = circuitXstNames('-- Entity      : shift\n-- Generator   : Silinx circuit editor (edit the circuit, not this file)\n  d_X : entity work.counter port map (a => a);\n');
  assert.deepEqual([c.module, [...c.entities], [...c.instances]], ['shift', [], []]);
});

test('#4020 isCircuitXstWarning: XST\'s Xst:753 and Xst:2677 on a circuit\'s chip only; an instance outside a circuit still warns', () => {
  const circuits = [circuitXstNames(generateCircuit(halfRead(), 'vhdl').code)];
  for (const l of CIRCUIT_LINES) assert.equal(isCircuitXstWarning(l, circuits), true, l);
  // the circuit under another top (its instance u1): the chip's nodes in that block
  assert.equal(isCircuitXstWarning('WARNING:Xst:2677 - Node <u1/d_U1/r_7> of sequential type is unconnected in block <top>.', circuits), true);
  // the case XST may write
  assert.equal(isCircuitXstWarning("WARNING:Xst:753 - \"x.v\" line 9: Unconnected output port 'QC' of component 'SHIFT_SN74LS164'.", circuits), true);
  // micro80's (its light8080 an instance of an HDL module, no circuit's): every one kept
  for (const l of micro80S3eWarnings('/work/src')) assert.equal(isCircuitXstWarning(l, circuits), false, l);
  const kept = [
    "WARNING:Xst:753 - \"/work/src/top.vhd\" line 40: Unconnected output port 'qc' of component 'other_sn74ls164'.",   // another circuit's entity
    "WARNING:Xst:753 - \"/work/src/top.vhd\" line 40: Unconnected output port 'qc' of component 'counter'.",
    'WARNING:Xst:2677 - Node <r_2> of sequential type is unconnected in block <shift>.',            // the circuit's own register
    'WARNING:Xst:2677 - Node <d_U1> of sequential type is unconnected in block <top>.',             // a register named so
    'WARNING:Xst:2677 - Node <u2/r_2> of sequential type is unconnected in block <top>.',
    'WARNING:Xst:2677 - Node <d_U2/r_2> of sequential type is unconnected in block <shift>.',       // no chip of its
    'WARNING:Xst:646 - Signal <d_U1_qc> is assigned but never used. This unconnected signal will be trimmed during the optimization process.',
    'WARNING:Xst:1710 - FF/Latch <r_2> (without init value) has a constant value of 0 in block <shift_sn74ls164>. This FF/Latch will be trimmed during the optimization process.',
  ];
  for (const l of kept) assert.equal(isCircuitXstWarning(l, circuits), false, l);
  // no circuit in the design: nothing left out
  for (const l of CIRCUIT_LINES) { assert.equal(isCircuitXstWarning(l, []), false); assert.equal(isCircuitXstWarning(l, [null]), false); }
  assert.equal(circuitXstNote(0), null);
  assert.equal(circuitXstNote(18), 'INFO:Silinx - 18 warning(s) of XST left out: a circuit\'s chip output nothing reads (Xst:753) and the flip-flops behind it (Xst:2677), normal on a breadboard (#4020).');
});

test('#4020 the ISE run\'s log: the circuit\'s chips\' warnings left out and counted, the others kept; its circuits read from the build\'s sources', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-4020-'));
  try {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src/shift.vhd'), generateCircuit(halfRead(), 'vhdl').code);
    fs.writeFileSync(path.join(dir, 'src/top.vhd'), 'library ieee;\nentity top is\nend entity;\n');
    const circuits = await circuitsOf({ buildDir: dir, sources: [{ buildPath: 'src/top.vhd' }, { buildPath: 'src/shift.vhd' }, { buildPath: 'src/missing.vhd' }] });
    assert.deepEqual(circuits.map((c) => c.module), ['shift']);
    const other = micro80S3eWarnings('/work/src').slice(0, 3);
    const lines = ['Started : "Synthesize - XST".', ...CIRCUIT_LINES, ...other, 'Number of warnings : 21'];
    const run = async (cs) => {
      let leftOut;
      const job = createJob('t4020', async (j) => {
        const restore = leaveOutCircuitWarnings(j, cs);
        try { return await runCommand(j, process.execPath, ['-e', `console.log(${JSON.stringify(lines.join('\n'))})`], { echo: false }); } finally { leftOut = restore(); }
      });
      while (job.status === 'running') await new Promise((r) => setTimeout(r, 20));
      assert.equal(job.status, 'ok');
      return { job, leftOut };
    };
    const { job, leftOut } = await run(circuits);
    assert.deepEqual(job.lines, ['Started : "Synthesize - XST".', ...other, 'Number of warnings : 21', circuitXstNote(18)]);
    assert.deepEqual(leftOut, CIRCUIT_LINES);
    // after the run the job's log is its own again
    job.log('WARNING:Xst:753 - "x" line 1: Unconnected output port \'qc\' of component \'shift_sn74ls164\'.');
    assert.equal(job.lines.at(-1), 'WARNING:Xst:753 - "x" line 1: Unconnected output port \'qc\' of component \'shift_sn74ls164\'.');
    // a design with no circuit: every line kept, no note
    const plain = await run([]);
    assert.deepEqual(plain.job.lines, lines);
    assert.deepEqual(plain.leftOut, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
