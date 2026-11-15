// A digital circuit as an FPGA project's top (#3901, docs/CIRCUITS.md): its HDL's two models, the simulation's behind
// `synthesis translate_off` (core/translate-off.js) and the digital one synthesis reads (core/circuit-digital.js, the ICs'
// digital architectures of core/circuit-hdl-ics.js); the digital model against the live engine (core/circuit-sim.js) on
// every IC's bench, in VHDL and in Verilog, with no errors and no warnings; the board's buses (led[0]…: a vector port), and
// the check's messages on a wrong one; the open flow's front end compiling the digital model (no 'Z', no delay).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compile, elaborate, simulate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { generateCircuit } from '../core/circuit-hdl.js';
import { createCircuitSim } from '../core/circuit-sim.js';
import { circuitPorts, newCircuit } from '../core/circuit.js';
import { checkCircuit } from '../core/circuit-check.js';
import { busOf, portRef, portDecls } from '../core/circuit-io.js';
import { PARTS } from '../core/circuit-parts.js';
import * as E from '../core/circuit-edit.js';
import { synthesisText, synthesisSources } from '../core/translate-off.js';
import { flowFrontEnd } from '../core/synth-front.js';
import { halfAdder, icBench, msiBench, circuitBench } from './circuit-helpers.mjs';

const LANGS = ['vhdl', 'verilog'];
const file = (lang) => (lang === 'vhdl' ? 'dut.vhd' : 'dut.v');
let seed = 3;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed >> 4; };
// the HDL synthesis builds: the translate_off regions blanked; in Verilog, the simulation's model also behind its
// `ifdef SILINX_SIM_<name> (its `define fenced: undefined for synthesis), the `else's the digital one
const digital = (code, lang) => (lang === 'vhdl' ? synthesisText(code) : synthesisText(code).replace(/`ifdef SILINX_SIM_\w+\n[\s\S]*?`else\n/g, ''));
// a circuit built by the edits (the MCP's and the editor's), failing on a refused one
function build(name, ops) {
  let m = newCircuit(name);
  for (const [f, a] of ops) { const r = E[f](m, a); assert.equal(r.error, undefined, `${f} ${JSON.stringify(a)}`); m = r.model; }
  return m;
}

test('synthesisText: the lines from a translate_off to its translate_on blanked, the others where they were', () => {
  const t = ['a', '-- synthesis translate_off', 'b', '-- synthesis translate_on', 'c', '// pragma translate_off', 'd', '//  Synopsys  TRANSLATE_ON', 'e'].join('\n');
  assert.equal(synthesisText(t), ['a', '', '', '', 'c', '', '', '', 'e'].join('\n'));
  // an off with no on: blanked to the end; an on with no off, and a pragma of something else: kept
  assert.equal(synthesisText('a\n-- synthesis translate_off\nb\nc'), 'a\n\n\n');
  assert.equal(synthesisText('a\n-- synthesis translate_on\n-- synthesis keep\nb'), 'a\n-- synthesis translate_on\n-- synthesis keep\nb');
  assert.equal(synthesisText(''), '');
  // synthesisSources: a file with none the same object, one with a region a copy
  const plain = { path: 'p.vhd', text: 'x' }, fenced = { path: 'f.vhd', text: 'x\n-- synthesis translate_off\ny\n-- synthesis translate_on', lang: 'vhdl' };
  const [p, f] = synthesisSources([plain, fenced]);
  assert.equal(p, plain);
  assert.deepEqual(f, { path: 'f.vhd', text: 'x\n\n\n', lang: 'vhdl' });
  assert.equal(fenced.text.split('\n').length, 4, 'the source itself unchanged');
});

test('every IC\'s bench as synthesis reads it: the digital model\'s outputs the engine\'s, in VHDL and in Verilog, no warnings', () => {
  const benches = [['half_adder', halfAdder()], ...Object.keys(PARTS).filter((t) => PARTS[t].gates).map((t) => [t, icBench(t, { name: `g${t}` })]),
    ...Object.keys(PARTS).filter((t) => PARTS[t].model || PARTS[t].seq).map((t) => [t, msiBench(t, { name: `m${t}` })])];
  assert.ok(benches.length >= 40, `${benches.length} benches`);
  for (const [t, m] of benches) {
    const { inputs, outputs } = circuitPorts(m);
    const cur = Object.fromEntries(inputs.map((i) => [i.name, 0])), vectors = [{ ...cur }];
    for (let k = 0; k < 40; k++) { const n = inputs[rnd() % inputs.length].name; cur[n] ^= 1; vectors.push({ ...cur }); }
    const sim = createCircuitSim(m);
    sim.run();
    const engine = vectors.map((v) => { for (const i of inputs) sim.set(i.part, v[i.name] === 1); sim.run(); return outputs.map((o) => sim.outputs()[o.name]).join(''); });
    for (const lang of LANGS) {
      const full = generateCircuit(m, lang).code, code = synthesisText(full);
      if (lang === 'verilog') assert.match(full, new RegExp(`// synthesis translate_off\n\`define SILINX_SIM_${m.name.toUpperCase()}\n// synthesis translate_on\n`));
      // (no Z, no delay: what an FPGA has not; an X only on what never happens, a register's unknown while anyx, false there,
      // an input neither 0 nor 1, a port's default: synthesis's don't care)
      assert.doesNotMatch(digital(full, lang), /'Z'|1'bz|\bafter\b|#\d/, `${t} ${lang}: no Z, no delay`);
      const lib = compile([{ path: file(lang), text: code }]), d = elaborate(lib, m.name);
      assert.deepEqual([...lib.errors, ...d.diags, ...designChecks(lib, d, { lint: true })].map((e) => `${e.severity}: ${e.message}`), [], `${t} ${lang}`);
      const r = simulate([{ path: file(lang), text: code }, { path: 'tb.v', text: circuitBench(m, vectors, { ins: inputs.map((x) => x.name), outs: outputs.map((x) => x.name), ns: 1000 }) }], 'tb', { until: 1e10 });
      assert.deepEqual(r.errors, [], `${t} ${lang}`);
      const got = r.sim.log.map((e) => String(e.text).trim()).filter((x) => /^[01xz]+$/.test(x));
      assert.equal(got.length, vectors.length, `${t} ${lang}`);
      // (the digital model knows no X: where either is still unknown, at power-on (the engine's X; the model's registers
      // simulated before their first clear or clock, on the FPGA their 0), its levels are its own; a flip-flop's
      // preset and clear both low then one released, in Verilog: the always block's edges see no release, the flip-flop
      // stays as it was, as XST builds it; the engine's, the VHDL's, the one still low)
      const corner = lang === 'verilog' && (t === '7474' || t === '74112');
      got.forEach((x, k) => { if (k > 0 && !/x/i.test(engine[k] + x) && !corner) assert.equal(x, engine[k], `${t} ${lang}: vector ${k}`); });
    }
  }
});

test('buses: led[0]… a vector port (VHDL std_logic_vector, Verilog [w-1:0]), its bits led(0) / led[0]', () => {
  assert.deepEqual(busOf('led[3]'), { base: 'led', bit: 3 });
  assert.deepEqual(busOf('led'), { base: 'led', bit: null });
  assert.deepEqual(busOf('led[x]'), { base: 'led[x]', bit: null });
  assert.equal(portRef('sw[1]', true), 'sw(1)');
  assert.equal(portRef('sw[1]', false), 'sw[1]');
  assert.equal(portRef('clk', true), 'clk');
  assert.deepEqual(portDecls({ inputs: [{ name: 'clk' }, { name: 'sw[1]' }, { name: 'sw[0]' }], outputs: [{ name: 'led[0]' }, { name: 'y' }] }),
    [{ name: 'clk', dir: 'in', width: null }, { name: 'sw', dir: 'in', width: 2 }, { name: 'led', dir: 'out', width: 1 }, { name: 'y', dir: 'out', width: null }]);
  // a 7408 on f5: its 1A and 1B from sw[0] and sw[1], its 1Y on led[0]
  const m = build('and2', [['addPart', { type: '7408', at: 'BB1.f5' }], ['addWire', { from: 'U1.14', to: 'BB1.tp5' }], ['addWire', { from: 'U1.7', to: 'BB1.bn11' }],
    ['addWire', { from: 'BB1.tn2', to: 'BB1.bn2', via: [[-2, -3], [-2, 14]] }],
    ['addPart', { type: 'logic-switch', at: [-6, 9], label: 'sw[0]' }], ['addWire', { from: 'S1.out', to: 'U1.1' }],
    ['addPart', { type: 'logic-switch', at: [-6, 12], label: 'sw[1]' }], ['addWire', { from: 'S2.out', to: 'U1.2' }],
    ['addPart', { type: 'led', at: [6, 20], label: 'led[0]' }], ['addWire', { from: 'U1.3', to: 'D1.A' }], ['addWire', { from: 'D1.K', to: 'BB1.bn20' }]]);
  assert.deepEqual(checkCircuit(m), []);
  const v = generateCircuit(m, 'vhdl').code, g = generateCircuit(m, 'verilog').code;
  assert.match(v, /entity and2 is\n {2}port \(\n {4}sw : in std_logic_vector\(1 downto 0\);\n {4}led : out std_logic_vector\(0 downto 0\)\n {2}\);/);
  assert.match(v, /architecture digital of and2 is[\s\S]*\(sw\(0\) and sw\(1\)\)[\s\S]*led\(0\) <= /);
  assert.match(g, /^module and2 \(input \[1:0\] sw, output \[0:0\] led\);$/m);
  assert.match(g, /\(sw\[0\] & sw\[1\]\)/);
  for (const [lang, code] of [['vhdl', v], ['verilog', g]]) {
    // the simulation's model and the digital one: both the truth table
    for (const text of [code, synthesisText(code)]) {
      const tb = lang === 'vhdl' ? `library ieee; use ieee.std_logic_1164.all; entity tb is end; architecture t of tb is signal sw : std_logic_vector(1 downto 0); signal led : std_logic_vector(0 downto 0); begin
  u : entity work.and2 port map (sw => sw, led => led);
  process begin for k in 0 to 3 loop if k = 0 then sw <= "00"; elsif k = 1 then sw <= "01"; elsif k = 2 then sw <= "10"; else sw <= "11"; end if; wait for 100 ns; report std_logic'image(led(0)); end loop; wait; end process; end;`
        : 'module tb; reg [1:0] sw; wire [0:0] led; and2 u (.sw(sw), .led(led)); integer k; initial for (k = 0; k < 4; k = k + 1) begin sw = k; #100 $display("%b", led); end endmodule';
      const r = simulate([{ path: file(lang), text }, { path: lang === 'vhdl' ? 'tb.vhd' : 'tb.v', text: tb }], 'tb', { until: 1e9 });
      assert.deepEqual(r.errors, [], lang);
      assert.deepEqual(r.sim.log.map((e) => String(e.text).trim().replace(/'/g, '')).filter((x) => /^[01]$/.test(x)), ['0', '0', '0', '1'], lang);
    }
  }
});

test('buses: the check\'s messages, a bit missing, inputs and outputs mixed, a scalar of the same name, a part of several ports', () => {
  const base = [['addPart', { type: 'logic-switch', at: [-6, 9], label: 'sw[0]' }], ['addPart', { type: 'logic-switch', at: [-6, 12], label: 'sw[2]' }]];
  const msgs = (m) => checkCircuit(m).filter((d) => d.severity === 'error').map((d) => d.message);
  assert.deepEqual(msgs(build('b1', base)), ['The bus sw has no bit 1 (its bits: 0, 2): its bits 0 to 2, each a part\'s']);
  assert.deepEqual(msgs(build('b2', [...base.slice(0, 1), ['addPart', { type: 'led', at: [6, 20], label: 'sw[1]' }]])), ['The bus sw: S1 is an input, D1 an output: a bus is one or the other']);
  assert.deepEqual(msgs(build('b3', [...base.slice(0, 1), ['addPart', { type: 'led', at: [6, 20], label: 'sw' }]])), ['The bus sw is also D1\'s port']);
  assert.deepEqual(msgs(build('b4', [['addPart', { type: 'dip-4', at: [-6, 9], label: 'd[0]' }]])).slice(0, 1),
    ['S1: its label \'d[0]\' is a bus\'s bit: a part of one port only (a switch, a button, a clock, an LED) has one']);
});

test('the open flow\'s front end on a circuit\'s HDL: the digital model elaborated (its ICs\' digital architectures), no error', () => {
  for (const lang of LANGS) {
    const m = halfAdder(lang);
    const code = generateCircuit(m, lang).code;
    const fe = flowFrontEnd([{ path: file(lang), lang, text: code }], m.name);
    assert.deepEqual(fe.errors, [], lang);
    // (the simulation's model compiled too would be the top's last architecture, its pulled nets' 'Z' in the input)
    assert.doesNotMatch(fe.input().text ?? JSON.stringify(fe.input()), /1'bz|'Z'/, lang);
  }
});

test('the breadboard example: its HDL the circuit\'s, as the editor generates it; synthesis reads its digital model', () => {
  const dir = new URL('../examples/breadboard/', import.meta.url);
  const m = JSON.parse(fs.readFileSync(new URL('src/breadboard.circ.json', dir), 'utf8'));
  const shipped = fs.readFileSync(new URL('src/breadboard.vhd', dir), 'utf8');
  assert.equal(m.generatedFile, 'src/breadboard.vhd');
  assert.deepEqual(checkCircuit(m), []);
  assert.equal(generateCircuit(m, 'vhdl', { source: 'breadboard.circ.json' }).code, shipped);
  assert.deepEqual(circuitPorts(m).inputs.map((i) => i.name), ['clk', 'btn[0]', 'sw[0]']);
  assert.deepEqual(circuitPorts(m).outputs.map((o) => o.name), ['led[0]', 'led[1]', 'led[2]', 'led[3]', 'led[4]', 'led[5]', 'led[6]', 'led[7]']);
  const synth = synthesisText(shipped);
  assert.doesNotMatch(synth, /architecture circuit|'Z'|\bafter\b/);
  assert.equal((synth.match(/^architecture digital of /gm) || []).length, 3, 'the top, the 74194 and the 74161 (the gates inlined)');
  // every output of its ICs read: XST warns on an instance's open output and on the flip-flops behind it (Xst:753,
  // Xst:2677), and an example builds with ISE with no warnings
  assert.doesNotMatch(synth.slice(synth.indexOf('architecture digital of breadboard')), /=> open\b/);
  assert.equal(synth.split('\n').length, shipped.split('\n').length);
  // (#4048) Check Syntax's view, the simulation's model too: no design-check message (its 7408's first gate feeds its second:
  // an instance's output and input on one net)
  const full = compile([{ path: 'src/breadboard.vhd', lang: 'vhdl', text: shipped }]);
  assert.deepEqual(designChecks(full, elaborate(full, 'breadboard')).map((d) => `${d.line} ${d.message}`), []);
});
