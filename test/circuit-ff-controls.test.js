// A flip-flop's asynchronous controls in a circuit's digital model (#3975, core/circuit-seq.js, core/circuit-digital.js):
// a 7474's (7476's, 74112's) preset or clear the circuit ties high (to the supply's +, or left open: a 74LS input reads it
// high) left out of its flip-flop, its generic USE_PRE<k> / USE_CLR<k> false, its port the constant '1'; a driven one
// kept. The open synthesis's exact warnings (Yosys's "Complex async reset" only for a flip-flop whose preset and clear
// are both driven); the generated HDL compiled, elaborated and simulated, the digital model and the simulation's, in VHDL
// and in Verilog, against the circuit's engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { circuitPorts } from '../core/circuit.js';
import { checkCircuit } from '../core/circuit-check.js';
import { synthesisText } from '../core/translate-off.js';
import { msiBench, circuitBench } from './circuit-helpers.mjs';

const LANGS = ['vhdl', 'verilog'];
const file = (lang) => (lang === 'vhdl' ? 'ff.vhd' : 'ff.v');

// the IC's bench (a switch per input), the switches of `tied` taken away and their inputs wired to the supply's +, those
// of `open` taken away with their wires (the input left open)
function bench(type, { tied = [], open = [] } = {}) {
  const m = msiBench(type, { name: 'ff' });
  const sw = (ports) => m.parts.filter((p) => p.type === 'logic-switch' && ports.includes(p.label));
  const at = (ports) => new Set(sw(ports).map((p) => `${p.x},${p.y}`));
  const t = at(tied), o = at(open);
  return {
    ...m, parts: m.parts.filter((p) => !sw([...tied, ...open]).includes(p)),
    wires: m.wires.filter((w) => !o.has(`${w.points[0]}`)).map((w) => (t.has(`${w.points[0]}`) ? { ...w, points: [[-20, -20], ...w.points] } : w)),
  };
}
const instLine = (code, lang) => code.split('\n').find((l) => (lang === 'vhdl' ? /^ {2}d_U1 : entity/ : /^ {2}ff_sn74ls\w+ (#|d_U1)/).test(l));

test('the digital model\'s instance: a control tied high or left open its generic false and its port \'1\', a driven one true', () => {
  const cases = [
    [{ tied: ['pre1_n', 'pre2_n'] }, [false, true, false, true]],
    [{ tied: ['clr1_n'] }, [true, false, true, true]],
    [{ open: ['pre2_n'], tied: ['clr1_n'] }, [true, false, false, true]],
    [{ tied: ['pre1_n', 'clr1_n', 'pre2_n', 'clr2_n'] }, [false, false, false, false]],
    [{}, [true, true, true, true]],
  ];
  for (const [how, used] of cases) {
    const m = bench('7474', how);
    // (an input left open: the check's warning, as on the chip)
    assert.deepEqual(checkCircuit(m).map((d) => `${d.severity}: ${d.message}`), (how.open || []).map(() => 'warning: U1 pin 10 (2PRE̅) is floating: a 74LS input reads high'), JSON.stringify(how));
    const off = ['pre1_n', 'clr1_n', 'pre2_n', 'clr2_n'].filter((p, k) => !used[k]);
    for (const lang of LANGS) {
      const line = instLine(generateCircuit(m, lang).code, lang);
      const [p1, c1, p2, c2] = used;
      assert.ok(line.includes(lang === 'vhdl' ? `generic map (USE_PRE1 => ${p1}, USE_CLR1 => ${c1}, USE_PRE2 => ${p2}, USE_CLR2 => ${c2}) port map (`
        : `#(.USE_PRE1(${+p1}), .USE_CLR1(${+c1}), .USE_PRE2(${+p2}), .USE_CLR2(${+c2})) d_U1 (`), `${lang} ${JSON.stringify(how)}: ${line}`);
      for (const p of ['pre1_n', 'clr1_n', 'pre2_n', 'clr2_n']) {
        const q = lang === 'vhdl' ? `${p} => '1'` : `.${p}(1'b1)`;
        assert.equal(line.includes(q), off.includes(p), `${lang} ${JSON.stringify(how)}: ${p}`);
      }
    }
  }
  // the J-K flip-flops too, the same generics; a control a gate drives: used
  for (const type of ['7476', '74112']) {
    const line = instLine(generateCircuit(bench(type, { tied: ['clr2_n'] }), 'vhdl').code, 'vhdl');
    assert.match(line, /generic map \(USE_PRE1 => true, USE_CLR1 => true, USE_PRE2 => true, USE_CLR2 => false\) port map \(.*clr2_n => '1'/, type);
  }
  // an IC with no such control: no generic map (the 74164's clear, the 74161's)
  for (const type of ['74164', '74161']) {
    for (const lang of LANGS) assert.doesNotMatch(generateCircuit(msiBench(type, { name: 'ff' }), lang).code, /generic map|#\(\.|USE_/, `${type} ${lang}`);
  }
});

test('the entity: its generics (true by default) in both models\' header; the digital model a generate per variant, the simulation\'s unchanged', () => {
  const m = bench('7474', { tied: ['pre1_n'] });
  const vhdl = generateCircuit(m, 'vhdl').code, verilog = generateCircuit(m, 'verilog').code;
  assert.match(vhdl, /entity ff_sn74ls74 is\n {2}generic \(USE_PRE1, USE_CLR1, USE_PRE2, USE_CLR2 : boolean := true\);\n {2}port \(/);
  assert.match(verilog, /\nmodule ff_sn74ls74 #\(parameter USE_PRE1 = 1, USE_CLR1 = 1, USE_PRE2 = 1, USE_CLR2 = 1\) \(input clr1_n, /);
  const digital = vhdl.slice(vhdl.indexOf('architecture digital of ff_sn74ls74'), vhdl.indexOf('end architecture digital;'));
  assert.deepEqual(digital.match(/^ {2}ff\d_\w+ : if .* generate$/gm), ['  ff1_pc : if USE_PRE1 and USE_CLR1 generate', '  ff1_p : if USE_PRE1 and not USE_CLR1 generate',
    '  ff1_c : if not USE_PRE1 and USE_CLR1 generate', '  ff1_n : if not USE_PRE1 and not USE_CLR1 generate', '  ff2_pc : if USE_PRE2 and USE_CLR2 generate',
    '  ff2_p : if USE_PRE2 and not USE_CLR2 generate', '  ff2_c : if not USE_PRE2 and USE_CLR2 generate', '  ff2_n : if not USE_PRE2 and not USE_CLR2 generate']);
  assert.match(digital, / {4}process \(clk1, clr1_n\)\n {4}begin\n {6}if clr1_n = '0' then r1 <= '0';\n {6}elsif rising_edge\(clk1\) then\n {8}r1 <= d1;\n/);
  assert.match(digital, / {4}process \(clk1\)\n {4}begin\n {6}if rising_edge\(clk1\) then\n/);
  assert.match(verilog, / {4}end else if \(!USE_PRE1 && USE_CLR1\) begin : ff1\n {6}always @\(posedge clk1 or negedge clr1_n\)\n {8}if \(!clr1_n\) r1 <= 1'b0;\n {8}else r1 <= d1;\n/);
  assert.match(verilog, / {4}end else if \(!USE_PRE1 && !USE_CLR1\) begin : ff1\n {6}always @\(posedge clk1\)\n {8}r1 <= d1;\n/);
  // the J-K's, falling edge, its case after an else, none without a control
  const jk = generateCircuit(bench('74112'), 'verilog').code;
  assert.match(jk, / {6}always @\(negedge clk1\)\n {8}case \(\{j1, k1\}\) 2'b00: r1 <= r1;/);
  assert.match(jk, / {6}always @\(negedge clk1 or negedge pre1_n\)\n {8}if \(!pre1_n\) r1 <= 1'b1;\n {8}else case \(\{j1, k1\}\)/);
  // the simulation's model: its flip-flops with both controls, whatever the circuit ties (the chip's)
  const sim = vhdl.slice(vhdl.indexOf('architecture model of ff_sn74ls74'));
  assert.match(sim, / {2}process \(i_clk1, i_pre1_n, i_clr1_n\)\n {2}begin\n {4}if i_pre1_n = '0' then r1 <= '1';\n {4}elsif i_clr1_n = '0' then r1 <= '0';\n/);
  assert.doesNotMatch(sim.slice(0, sim.indexOf('end architecture model;')), /USE_|generate/);
  assert.match(verilog, /`ifdef SILINX_SIM_FF[\s\S]*always @\(posedge i_clk1 or negedge i_pre1_n or negedge i_clr1_n\)[\s\S]*`else/);
});

test('#3975 a 7474\'s preset tied, then its clear, then both driven, as the open synthesis reads it: its exact warnings, VHDL and Verilog', async () => {
  const { synthesizeOpen } = await import('../core/synth-front.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
  const complex = (lang, ...k) => k.map((n) => `Warning: Complex async reset for dff \`\\d_${lang === 'vhdl' ? 'u1' : 'U1'}.r${n}'.`);
  const cases = [
    [{ tied: ['pre1_n', 'pre2_n'] }, () => []],
    [{ tied: ['clr1_n', 'clr2_n'] }, () => []],
    [{}, (lang) => complex(lang, 2, 1)],
    [{ tied: ['pre1_n'] }, (lang) => complex(lang, 2)],
    [{ open: ['clr2_n'], tied: ['pre1_n', 'clr1_n'] }, () => []],
  ];
  for (const [how, warnings] of cases) {
    const m = bench('7474', how);
    for (const lang of LANGS) {
      const lib = compile([{ path: file(lang), text: synthesisText(generateCircuit(m, lang).code) }]), d = elaborate(lib, m.name);
      assert.deepEqual([...lib.errors, ...d.diags].map((e) => e.message), [], `${lang} ${JSON.stringify(how)}`);
      const s = await synthesizeOpen(d, { family: 'spartan3e', run: yosysNode });
      assert.deepEqual(s.warnings, warnings(lang), `${lang} ${JSON.stringify(how)}`);
    }
  }
});

test('the generated HDL with tied controls, VHDL and Verilog: compiled, no design-check message, simulated as the engine runs the circuit', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed >> 4; };
  const cases = [['7474', { tied: ['pre1_n', 'clr2_n'] }], ['7474', { tied: ['clr1_n'], open: ['pre2_n'] }], ['7474', { tied: ['pre1_n', 'clr1_n', 'pre2_n', 'clr2_n'] }],
    ['74112', { tied: ['pre1_n', 'pre2_n'] }], ['7476', { tied: ['clr1_n', 'clr2_n'] }]];
  for (const [type, how] of cases) {
    const m = bench(type, how);
    const { inputs, outputs } = circuitPorts(m);
    // (every input low at first, as the engine starts: a driven control sets its flip-flop; then those released)
    const cur = Object.fromEntries(inputs.map((i) => [i.name, 0])), vectors = [{ ...cur }];
    for (const i of inputs) if (/^(pre|clr)\d_n$/.test(i.name)) cur[i.name] = 1;
    vectors.push({ ...cur });
    for (let k = 0; k < 60; k++) { const n = inputs[rnd() % inputs.length].name; cur[n] ^= 1; vectors.push({ ...cur }); }
    const sim = createCircuitSim(m);
    sim.run();
    const engine = vectors.map((v) => { for (const i of inputs) sim.set(i.part, v[i.name] === 1); sim.run(); return outputs.map((o) => sim.outputs()[o.name]).join(''); });
    for (const lang of LANGS) {
      const full = generateCircuit(m, lang).code;
      for (const [model, code] of [['digital', synthesisText(full)], ['simulation', full]]) {
        const what = `${type} ${JSON.stringify(how)} ${lang} ${model}`;
        const lib = compile([{ path: file(lang), text: code }]), d = elaborate(lib, m.name);
        assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => `${e.severity}: ${e.message}`), [], what);
        const r = simulate([{ path: file(lang), text: code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: inputs.map((x) => x.name), outs: outputs.map((x) => x.name), ns: 1000 }) }], 'tb', { until: 1e10 });
        assert.deepEqual(r.errors, [], what);
        const got = r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^[01xz]+$/.test(x));
        assert.equal(got.length, vectors.length, what);
        // (where either is still unknown, before a flip-flop's first clock: its levels its own; a preset and a clear both
        // low then one released in Verilog: the always block sees no release, as the full model's test says)
        const both = (v, k) => ['1', '2'].some((n) => v[`pre${n}_n`] === 0 && v[`clr${n}_n`] === 0 && k > 0);
        got.forEach((x, k) => { if (k > 0 && !/x/i.test(engine[k] + x) && !(lang === 'verilog' && vectors.slice(0, k + 1).some(both))) assert.equal(x, engine[k], `${what}: vector ${k}`); });
      }
    }
  }
});
