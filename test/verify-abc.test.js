// Verify's engines for larger designs (#3262, core/verify-abc.js): the structural proof (Yosys's equivalence passes,
// its base case checked apart: a changed initial value is no proof), ABC's check (bmc3, pdr, dsat) and its witness
// replayed on the AIG with every output; their logs read; and the examples' larger designs mutated, stopwatch (its
// 1024-word memory) and micro80: the counterexample found, its test bench replaying it in VHDL and in Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { verifyEquivalence, verifyMessages } from '../core/verify.js';
import { structuralScript, readStructural, abcScript, readAbc, parseAag, parseSymbols, parseMap, parseWitness, replayWitness,
  PDR_SECONDS, AIG_MAP, ALL, BMC_CEX } from '../core/verify-abc.js';
import { counterexampleBench, benchName } from '../core/verify-bench.js';
import { simulate, compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { toVerilog } from '../core/synth-verilog.js';
import { example } from './examples-lib.mjs';

const run = yosysNode;
const msgs = r => verifyMessages(r, { bench: `sim/${benchName(r.top)}.vhd` }).map(m => [m.kind, m.text.trim()]).filter(([, t]) => t);
const INFO = (top, ref, d = 20) => ['info', `Verifying '${top}' against its reference '${ref}': a structural proof (Yosys's equivalence passes), else ABC's check over at most ${d} clock cycle(s), then its proof (pdr).`];

test('the scripts: the structural proof (its base case, then the induction), ABC\'s (bmc3 and pdr under their limits)', () => {
  assert.equal(structuralScript(), 'read_verilog -sv silinx_ref.sv silinx_uut.sv; proc; memory; opt_clean; async2sync; flatten; opt_clean; design -save silinx_base; '
    + 'equiv_make -make_assert silinx_ref silinx_uut silinx_eqa; hierarchy -top silinx_eqa; opt_clean; sat -seq 1 -prove-asserts -set-init-zero silinx_eqa; '
    + 'design -load silinx_base; equiv_make silinx_ref silinx_uut silinx_eq; hierarchy -top silinx_eq; opt_clean; equiv_simple; equiv_induct; equiv_status');
  const s = abcScript(20, 30.7);
  assert.match(s, /^read_verilog -sv silinx_ref\.sv silinx_uut\.sv; proc; memory; opt_clean; async2sync; miter -equiv -flatten -make_outputs silinx_ref silinx_uut silinx_miter; /);
  assert.match(s, /write_aiger -ascii -symbols -zinit silinx_all\.aag; delete -output w:gold_\* w:gate_\*; opt_clean; write_aiger -zinit -map silinx_miter\.aim silinx_miter\.aig; /);
  assert.ok(s.endsWith('abc -script +strash;&get,-n;read_aiger,silinx_miter.aig;print_stats;dsat;write_cex,-a,silinx_sat.aiw;bmc3,-F,20,-T,30;write_cex,-a,silinx_bmc.aiw;pdr,-T,10;write_cex,-a,silinx_pdr.aiw;&put'), s);
  assert.equal(PDR_SECONDS, 10);
  assert.match(abcScript(5, 0.2), /bmc3,-F,5,-T,1;.*pdr,-T,1;/, 'a second at least');
});

test('the logs read: the structural proof (its base case needed), ABC\'s verdicts', () => {
  const ok = ['SAT proof finished - no model found: SUCCESS!', 'Found 12 $equiv cells in silinx_eq:', '  Of those cells 12 are proven and 0 are unproven.', '  Equivalence successfully proven!'];
  assert.deepEqual(readStructural(ok), { proved: true, unproven: 0, base: true });
  assert.deepEqual(readStructural(ok.slice(1)), { proved: false, unproven: 0, base: false }, 'no base case: no proof');
  assert.deepEqual(readStructural(['SAT proof finished - no model found: SUCCESS!', '  Of those cells 10 are proven and 2 are unproven.']), { proved: false, unproven: 2, base: true });
  assert.deepEqual(readStructural([]), { proved: false, unproven: null, base: false });
  const abc = (...l) => readAbc(['Executing ABC.', ...l.map(x => `ABC: ${x}`)]);
  assert.deepEqual(abc('silinx_miter : i/o =    3/    1  lat =    8  and =     72  lev =  8', '+ dsat', 'Error: Currently can only solve the miter for combinational circuits.', '+ bmc3 -F 20 -T 9',
    'Output 0 of miter "silinx_miter" was asserted in frame 10.  Time = 0.02 sec', '+ write_cex -a silinx_bmc.aiw', '+ pdr -T 9', 'Output 0 of miter "silinx_miter" was asserted in frame 10.'),
  { latches: 8, bmc: { frame: 10 }, pdr: { frame: 10 }, sat: null });
  assert.deepEqual(abc('x : i/o = 3/ 1  lat = 8  and = 73', '+ bmc3 -F 8 -T 9', 'No output asserted in 8 frames. Resource limit reached (conf limit 0). Time = 0.01 sec', '+ pdr -T 9', 'Property proved.  Time = 0.04 sec'),
    { latches: 8, bmc: { checked: 8 }, pdr: 'proved', sat: null });
  assert.deepEqual(abc('x : i/o = 9/ 1  lat =17070  and = 110967', '+ bmc3 -F 1000 -T 30', 'No output asserted in 330 frames. Resource limit reached (timeout 30 sec).', '+ pdr -T 10', 'Reached timeout (10 seconds) in frame 9.', 'Property UNDECIDED.'),
    { latches: 17070, bmc: { checked: 330 }, pdr: null, sat: null });
  assert.deepEqual(abc('x : i/o = 5/ 1  lat =    0  and = 19', '+ dsat', 'SATISFIABLE    Time = 0.01 sec', '+ bmc3 -F 20 -T 9', 'Error: Does not work for combinational networks.'),
    { latches: 0, bmc: { checked: 0 }, pdr: null, sat: { frame: 0 } });
  assert.deepEqual(abc('x : i/o = 5/ 1  lat = 0  and = 0', '+ dsat', 'UNSATISFIABLE  Time = 0.00 sec').sat, 'proved');
  assert.deepEqual(abc('x : i/o = 2/ 1  lat = 3  and = 23', '+ bmc3 -F 20 -T 9', 'Stopping BMC because all 2^3 reachable states are visited.', 'Explored all reachable states after completing 8 frames.  Time = 0.02 sec',
    '+ write_cex -a silinx_bmc.aiw', '+ pdr -T 9', 'The miters is already solved; skipping the command.'), { latches: 3, bmc: { reached: true }, pdr: null, sat: null });
  assert.deepEqual(readAbc(['no ABC']), { latches: null, bmc: { checked: 0 }, pdr: null, sat: null });
});

// an AIG with every output written by hand: two registers a and b (from 0), q = {~b, ~a}, the reference's q = 01,
// trigger = ~a & ~b; a takes en, b takes ~a & ~b; and an output of no port (flag)
const AAG = ['aag 7 2 2 6 3', '2', '4', '6 13', '8 14', '7', '9', '1', '0', '14', '15', '10 7 4', '12 11 5', '14 7 9',
  'i0 in_clk', 'i1 in_en', 'o0 gate_q[0]', 'o1 gate_q[1]', 'o2 gold_q[0]', 'o3 gold_q[1]', 'o4 trigger', 'o5 flag', 'c', 'Generated by hand'].join('\n');

test('an AIG with every output, its symbols, a map, a witness: parsed, and the witness replayed', () => {
  const g = parseAag(AAG);
  assert.deepEqual([g.M, g.I, g.L, g.inputs, g.latches, g.outputs, g.ands], [7, 2, 2, [2, 4], [[6, 13], [8, 14]], [7, 9, 1, 0, 14, 15], [[10, 7, 4], [12, 11, 5], [14, 7, 9]]]);
  assert.throws(() => parseAag('aig 1 0 0 0 0'), /not an ASCII AIGER file/);
  assert.deepEqual(parseSymbols(AAG), { input: [[0, 'in_clk'], [0, 'in_en']], output: [[0, 'gate_q'], [1, 'gate_q'], [0, 'gold_q'], [1, 'gold_q'], [0, 'trigger'], [0, 'flag']] });
  assert.deepEqual(parseMap('input 0 0 in_en\ninput 1 0 \\in_x\noutput 0 0 trigger\nlatch 0 0 c\n'), { input: [[0, 'in_en'], [0, 'in_x']], output: [[0, 'trigger']] });
  assert.deepEqual(parseWitness('00\n1\n0\n1\n# DONE\n'), { init: '00', frames: ['1', '0', '1'] });
  assert.deepEqual(parseWitness('\n01000\n# DONE\n'), { init: '', frames: ['01000'] });
  // (the witness's inputs, by the miter's AIG's map: its input 0 is en)
  const files = { [ALL]: AAG, [AIG_MAP]: 'input 0 0 in_en\n', [BMC_CEX]: '00\n1\n1\n0\n# DONE\n' };
  assert.deepEqual(replayWitness(files, BMC_CEX), [
    { in: { clk: '0', en: '1' }, uut: { q: '11' }, ref: { q: '01' }, trigger: true },
    { in: { clk: '0', en: '1' }, uut: { q: '00' }, ref: { q: '01' }, trigger: false },
    { in: { clk: '0', en: '0' }, uut: { q: '10' }, ref: { q: '01' }, trigger: false },
  ]);
  assert.equal(replayWitness({ [ALL]: AAG }, BMC_CEX), null, 'no witness');
  assert.equal(replayWitness({ ...files, [BMC_CEX]: '# DONE\n' }, BMC_CEX), null, 'an empty one');
});

const V = (name, body, ports = 'input clk, en, output [3:0] q') => ({ path: `src/${name}.v`, lang: 'verilog', text: `module ${name} (${ports});\n${body}\nendmodule\n` });
const UP = V('up_ref', '  reg [3:0] c = 0;\n  assign q = c;\n  always @(posedge clk) if (en) c <= c + 1;');

test('a counter stored inverted: proved structurally, its outputs\' equality inductive (equiv_induct)', async () => {
  const down = V('down', '  reg [3:0] n = 4\'hf;\n  assign q = ~n;\n  always @(posedge clk) if (en) n <= n - 1;');
  const r = await verifyEquivalence([down, UP], { top: 'down', reference: 'up_ref', run });
  assert.deepEqual([r.status, r.method, r.warnings, r.errors], ['proved', 'structural', [], []]);
});

test('a counter that wraps at 5 never says 7: no structural proof (6 leads to 7, though never reached), proved by ABC\'s pdr', async () => {
  const wrap = V('wrap', '  reg [19:0] c = 0;\n  assign q = c == 7;\n  always @(posedge clk) if (en) c <= (c == 5) ? 0 : c + 1;', 'input clk, en, output q');
  const zero = V('zero_ref', '  assign q = 1\'b0;', 'input clk, en, output q');
  const lines = [];
  const r = await verifyEquivalence([wrap, zero], { top: 'wrap', reference: 'zero_ref', run, onLine: l => lines.push(l) });
  assert.deepEqual([r.status, r.method, r.warnings, r.errors], ['proved', 'pdr', [], []]);
  assert.deepEqual(readStructural(lines), { proved: false, unproven: 1, base: true });
  assert.deepEqual(msgs(r).slice(1), [INFO('wrap', 'zero_ref'),
    ['ok', 'Proved: \'wrap\' gives the outputs of \'zero_ref\' for every input sequence (by an inductive invariant, ABC\'s pdr).'],
    ['ok', 'Process "Verify Equivalence" completed successfully']]);
});

test('the same counter of 3 bits: every reachable state explored by ABC\'s bmc3, a proof', async () => {
  const wrap = V('wrap3', '  reg [2:0] c = 0;\n  assign q = c == 7;\n  always @(posedge clk) if (en) c <= (c == 5) ? 0 : c + 1;', 'input clk, en, output q');
  const zero = V('zero_ref', '  assign q = 1\'b0;', 'input clk, en, output q');
  const r = await verifyEquivalence([wrap, zero], { top: 'wrap3', reference: 'zero_ref', run });
  assert.deepEqual([r.status, r.method, r.warnings], ['proved', 'reach', []]);
  assert.equal(msgs(r)[2][1], 'Proved: \'wrap3\' gives the outputs of \'zero_ref\' for every input sequence (every reachable state explored, ABC\'s bmc3).');
});

test('a register\'s initial value changed: no structural proof (its base case fails), the difference at clock cycle 1', async () => {
  // (equiv_simple and equiv_induct prove the induction step, the same in both: the base case is what differs)
  const up1 = V('up1', '  reg [3:0] c = 4\'d1;\n  assign q = c;\n  always @(posedge clk) if (en) c <= c + 1;');
  const lines = [];
  const r = await verifyEquivalence([up1, UP], { top: 'up1', reference: 'up_ref', run, onLine: l => lines.push(l) });
  assert.deepEqual(readStructural(lines), { proved: false, unproven: 0, base: false });
  assert.deepEqual([r.status, r.cycle, r.differs, r.cycles[0].uut.q, r.cycles[0].ref.q, r.warnings], ['failed', 1, ['q'], '0001', '0000', []]);
});

// an example against its own flat Verilog, a line of its sources mutated: the counterexample, its test bench replayed
async function mutated(ex, file, from, to) {
  const { design, project: { top } } = example(ex);
  const d = elaborate(compile([...primitiveSources(design), ...design]), top);
  const ref = { path: 'sim/ref.sv', lang: 'verilog', role: 'simulation', text: toVerilog(d, { name: `${top}_ref` }).text };
  const srcs = [...design.map(s => (s.path.endsWith(file) ? { ...s, text: s.text.replace(from, to) } : s)), ref];
  assert.ok(srcs.some((s, i) => s.text !== design[i]?.text && s !== ref), `${ex}: ${from} not found`);
  // (a limit the check never nears, #5129: the time is Yosys's, not ABC's, whose bmc3 finds the difference at once; the
  // stopwatch's 33 s here (its structural proof 20, its miter's AIG 12) went past 120 s on a runner 3 times slower)
  const r = await verifyEquivalence(srcs, { top, reference: `${top}_ref`, timeLimit: 900, run });
  const replays = ['vhdl', 'verilog'].map(lang => {
    const tb = { path: `sim/${benchName(top)}.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, role: 'simulation', text: counterexampleBench(r, { lang }) };
    const s = simulate([...primitiveSources([...srcs, tb]), ...srcs, tb], benchName(top), { until: 1e15 });
    assert.deepEqual(s.errors, []);
    return s.sim.log.map(l => l.text);
  });
  return { r, replays };
}

test('stopwatch mutated (its first digit\'s anode): the difference at clock cycle 1, replayed', async () => {
  const { r, replays } = await mutated('stopwatch', 'sevenseg.vhd', 'level("1110") when "00"', 'level("1100") when "00"');
  assert.deepEqual([r.status, r.cycle, r.differs, r.warnings, r.errors], ['failed', 1, ['an'], [], []]);
  const what = `an = ${r.cycles[0].uut.an}, the reference's an = ${r.cycles[0].ref.an}`;
  assert.notEqual(r.cycles[0].uut.an, r.cycles[0].ref.an);
  assert.deepEqual(msgs(r).slice(1), [INFO('stopwatch', 'stopwatch_ref'),
    ['err', `ERROR:Verify - 'stopwatch' differs from its reference 'stopwatch_ref' at clock cycle 1: ${what}.`],
    ['info', 'The counterexample\'s test bench: sim/verify_stopwatch.vhd (it replays the 1 clock cycle(s) in the simulator, both modules side by side).'],
    ['err', 'Process "Verify Equivalence" failed']]);
  assert.deepEqual(replays, [[`clock cycle 1: ${what}`, 'VERIFY FAILED: \'stopwatch\' differs from its reference \'stopwatch_ref\' at clock cycle 1', 'simulation finished ($failure) at 5 ns'],
    [`clock cycle 1: ${what}`, 'VERIFY FAILED: \'stopwatch\' differs from its reference \'stopwatch_ref\' at clock cycle 1', 'simulation finished ($finish) at 5 ns']]);
});

test('micro80 mutated (its decimal point): the difference at clock cycle 1, replayed; no warning of ABC\'s netlists', async () => {
  const { r, replays } = await mutated('micro80', 'sevenseg.vhd', 'dp <= not points', 'dp <= points');
  assert.deepEqual([r.status, r.cycle, r.differs, r.cycles[0].uut.dp, r.cycles[0].ref.dp, r.warnings, r.errors], ['failed', 1, ['dp'], '0', '1', [], []]);
  assert.deepEqual(msgs(r).slice(2, 3), [['err', 'ERROR:Verify - \'micro80_top\' differs from its reference \'micro80_top_ref\' at clock cycle 1: dp = 0, the reference\'s dp = 1.']]);
  for (const [log, end] of [[replays[0], '$failure'], [replays[1], '$finish']]) {
    assert.deepEqual(log, ['clock cycle 1: dp = 0, the reference\'s dp = 1', 'VERIFY FAILED: \'micro80_top\' differs from its reference \'micro80_top_ref\' at clock cycle 1', `simulation finished (${end}) at 5 ns`]);
  }
});

test('ABC\'s verdicts as Verify\'s: its time limit reached (the cycles checked), bounded, no result', async () => {
  const srcs = [V('up', '  reg [3:0] c = 0;\n  assign q = c;\n  always @(posedge clk) if (en) c <= c + 1;'), UP];
  // (a Yosys that gives the structural proof's run no proof, and ABC's run the lines given)
  const fake = abcLines => async (args, files, onLine) => {
    (/equiv_make/.test(args[1]) ? ['  Of those cells 3 are proven and 1 are unproven.'] : abcLines.map(l => `ABC: ${l}`)).forEach(onLine);
    return {};
  };
  const check = (lines, depth = 20) => verifyEquivalence(srcs, { top: 'up', reference: 'up_ref', depth, run: fake(lines) });
  const stopped = await check(['x : i/o = 3/ 1  lat = 8  and = 9', '+ bmc3 -F 20 -T 23', 'No output asserted in 7 frames. Resource limit reached (timeout 23 sec).', '+ pdr -T 10', 'Reached timeout (10 seconds) in frame 3.']);
  assert.deepEqual([stopped.status, stopped.checked, stopped.timeLimit], ['timeout', 7, 60]);
  assert.deepEqual(msgs(stopped).slice(2), [['warn', 'WARNING:Verify - the check did not finish in 60 s (its time limit): no difference in the first 7 clock cycle(s), not checked beyond them: a larger time limit, or a smaller depth.'],
    ['ok', 'Process "Verify Equivalence" completed successfully with 1 warning(s)']]);
  const bounded = await check(['x : i/o = 3/ 1  lat = 8  and = 9', '+ bmc3 -F 5 -T 23', 'No output asserted in 5 frames.', '+ pdr -T 10', 'Property UNDECIDED.'], 5);
  assert.deepEqual([bounded.status, bounded.beyond], ['bounded', undefined]);
  assert.deepEqual(msgs(bounded).slice(2, 3), [['warn', 'WARNING:Verify - no difference in the first 5 clock cycle(s), but not proved beyond them (no proof found in the time limit): a larger depth checks more cycles.']]);
  const none = await check([]);
  assert.deepEqual([none.status, none.errors], ['error', ['Yosys gave no result (its log has neither a proof nor a counterexample)']]);
  // (a difference ABC gives no witness of: an error, never a counterexample made up)
  const lost = await check(['x : i/o = 3/ 1  lat = 8  and = 9', '+ bmc3 -F 20 -T 23', 'Output 0 of miter "silinx_miter" was asserted in frame 2.']);
  assert.deepEqual([lost.status, lost.errors], ['error', ['ABC\'s counterexample could not be replayed']]);
});
